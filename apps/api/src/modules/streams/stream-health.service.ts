import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Prisma, StreamKind } from '@prisma/client';
import { PlaylistRulesDto } from '../playlists/dto/playlist.dto';
import { buildPlaylistWhere } from '../playlists/playlist-rules';
import { firstValueFrom } from 'rxjs';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { healthCheckConfig } from 'src/config/configuration';
import { BestStreamService } from './best-stream.service';

export type HealthScope = 'curated' | 'playlists' | 'all';

export interface HealthCheckOptions {
  scope?: HealthScope;
  /** Restreint à des codes pays (ex. `['FR', 'CI']`). Se combine avec `scope`. */
  countries?: string[];
  limit?: number;
}

export interface HealthCheckResult {
  checked: number;
  alive: number;
  dead: number;
  deleted: number;
  durationMs: number;
}

export interface SingleCheckResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  contentType?: string;
  error?: string;
}

/**
 * Vérifie que les flux répondent encore. Un lecteur TV qui tombe sur 15 chaînes
 * mortes d'affilée donne l'impression que « la playlist ne marche pas » — c'est
 * le job le plus rentable du projet.
 *
 * On ne télécharge jamais la vidéo : une requête GET avec `Range: bytes=0-1023`
 * suffit à savoir si le manifeste HLS est servi, et coûte ~1 Ko.
 */
@Injectable()
export class StreamHealthService {
  private readonly logger = new Logger(StreamHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly bestStream: BestStreamService,
    private readonly cache: CacheService,
    @Inject(healthCheckConfig.KEY) private readonly config: ConfigType<typeof healthCheckConfig>,
  ) {}

  /** Teste une URL isolée (bouton « tester le flux » du dashboard). */
  async checkUrl(url: string, userAgent?: string | null, referrer?: string | null): Promise<SingleCheckResult> {
    const startedAt = Date.now();
    try {
      const response = await firstValueFrom(
        this.http.get(url, {
          timeout: this.config.timeoutMs,
          responseType: 'arraybuffer',
          maxRedirects: 5,
          // Un manifeste HLS fait quelques Ko : inutile d'aspirer le segment vidéo.
          headers: {
            'user-agent': userAgent || this.config.userAgent,
            ...(referrer ? { referer: referrer } : {}),
            range: 'bytes=0-2047',
          },
          validateStatus: () => true,
        }),
      );
      const latencyMs = Date.now() - startedAt;
      const ok = response.status >= 200 && response.status < 400;
      return {
        ok,
        status: response.status,
        latencyMs,
        contentType: response.headers['content-type'] as string | undefined,
        ...(ok ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Périmètre du contrôle.
   *
   * `curated`   — chaînes voulues / favorites / épinglées. Le plus étroit.
   * `playlists` — tout ce qui sort réellement d'une playlist, règles comprises.
   *               C'est le bon défaut : une chaîne qui atterrit dans la TV via
   *               une règle « toute la France » doit être testée comme les
   *               autres, sinon elle y reste morte sans que personne le sache.
   * `all`       — le catalogue entier (plus de 16 000 flux : lent, à la main).
   */
  async checkAll(options: HealthCheckOptions = {}): Promise<HealthCheckResult> {
    const { scope = 'playlists', countries, limit } = options;
    const startedAt = Date.now();

    const channelWhere: Prisma.ChannelWhereInput = {
      isBlocked: false,
      isDisabled: false,
      ...(countries?.length ? { countryCode: { in: countries } } : {}),
      ...(scope === 'curated'
        ? {
            OR: [
              { isWanted: true },
              { favorite: { isNot: null } },
              { playlistItems: { some: { excluded: false } } },
            ],
          }
        : {}),
      ...(scope === 'playlists' ? { id: { in: await this.channelsInPlaylists() } } : {}),
    };

    const streams = await this.prisma.stream.findMany({
      // Une page YouTube répond toujours 200 : la tester ne prouve rien et
      // marquerait « vivante » une chaîne hors antenne.
      where: { channelId: { not: null }, kind: StreamKind.HLS, channel: channelWhere },
      select: { id: true, url: true, userAgent: true, referrer: true, failureCount: true },
      orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
      ...(limit ? { take: limit } : {}),
    });

    this.logger.log(
      `[Health] Checking ${streams.length} streams (scope=${scope}` +
        `${countries?.length ? `, countries=${countries.join(',')}` : ''})`,
    );

    let alive = 0;
    let dead = 0;

    for (const batch of this.batches(streams, this.config.concurrency)) {
      const results = await Promise.all(
        batch.map(async (stream) => ({
          stream,
          result: await this.checkUrl(stream.url, stream.userAgent, stream.referrer),
        })),
      );

      for (const { stream, result } of results) {
        if (result.ok) alive++;
        else dead++;

        await this.prisma.stream.update({
          where: { id: stream.id },
          data: result.ok
            ? {
                isAlive: true,
                failureCount: 0,
                latencyMs: result.latencyMs,
                lastCheckedAt: new Date(),
                lastOkAt: new Date(),
                lastError: null,
              }
            : {
                isAlive: false,
                failureCount: { increment: 1 },
                latencyMs: null,
                lastCheckedAt: new Date(),
                lastError: result.error?.slice(0, 500) ?? 'unknown',
              },
        });
      }
    }

    // Suppression des flux durablement morts (0 = conservation indéfinie).
    let deleted = 0;
    if (this.config.deleteAfterFailures > 0) {
      const result = await this.prisma.stream.deleteMany({
        where: { failureCount: { gte: this.config.deleteAfterFailures }, isAlive: false },
      });
      deleted = result.count;
    }

    await this.bestStream.refresh();
    await this.syncChannelHealth();
    await this.cache.invalidateCatalog();

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      `[Health] Done in ${Math.round(durationMs / 1000)}s — ${alive} alive, ${dead} dead, ${deleted} deleted`,
    );
    return { checked: streams.length, alive, dead, deleted, durationMs };
  }

  /**
   * Identifiants des chaînes qui sortent d'au moins une playlist.
   *
   * On rejoue les vraies règles (`buildPlaylistWhere`) plutôt que de deviner :
   * une chaîne incluse par « toute la France » compte autant qu'une chaîne
   * épinglée à la main.
   *
   * `onlyActive` est forcé à false : sans ça, une chaîne déclarée morte sort de
   * la playlist, donc du périmètre du contrôle, donc ne peut plus jamais être
   * retestée ni revenir. Un faux négatif deviendrait définitif.
   */
  private async channelsInPlaylists(): Promise<string[]> {
    const playlists = await this.prisma.playlist.findMany({ select: { id: true, rules: true } });
    const ids = new Set<string>();

    for (const playlist of playlists) {
      const items = await this.prisma.playlistChannel.findMany({
        where: { playlistId: playlist.id },
        select: { channelId: true, excluded: true },
      });

      const where = buildPlaylistWhere(
        { ...((playlist.rules ?? {}) as PlaylistRulesDto), onlyActive: false },
        {
          pinned: items.filter((i) => !i.excluded).map((i) => i.channelId),
          excludedIds: items.filter((i) => i.excluded).map((i) => i.channelId),
        },
      );

      const rows = await this.prisma.channel.findMany({ where, select: { id: true } });
      for (const row of rows) ids.add(row.id);
    }

    return Array.from(ids);
  }

  /** Reporte l'état des flux sur la chaîne (dates + compteur d'échecs). */
  private async syncChannelHealth(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE channels c
      SET last_checked = agg.last_checked,
          last_ok_at = agg.last_ok_at,
          failure_count = agg.min_failures
      FROM (
        SELECT channel_id,
               MAX(last_checked) AS last_checked,
               MAX(last_ok_at)   AS last_ok_at,
               MIN(failure_count) AS min_failures
        FROM streams
        WHERE channel_id IS NOT NULL AND last_checked IS NOT NULL
        GROUP BY channel_id
      ) agg
      WHERE c.id = agg.channel_id
    `);
  }

  private *batches<T>(items: T[], size: number): Generator<T[]> {
    for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
  }
}
