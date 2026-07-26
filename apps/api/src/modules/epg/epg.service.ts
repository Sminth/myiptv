import { HttpService } from '@nestjs/axios';
import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { appConfig, importConfig } from 'src/config/configuration';
import { PlaylistsService } from '../playlists/playlists.service';
import { XmltvFilter } from './xmltv.filter';

/** Au-delà, on ne met pas le XMLTV en cache Redis (on le regénère à la demande). */
const MAX_CACHEABLE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class EpgService {
  private readonly logger = new Logger(EpgService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly cache: CacheService,
    private readonly playlists: PlaylistsService,
    @Inject(importConfig.KEY) private readonly config: ConfigType<typeof importConfig>,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  /**
   * Construit le guide XMLTV servi à la TV.
   *
   * Le jeton reçu est celui de la playlist (le M3U annonce `url-tvg` avec son
   * propre jeton) : on restreint donc l'EPG aux chaînes de CETTE playlist.
   * Sans jeton exploitable, on retombe sur les chaînes curées + favorites.
   */
  async xmltv(token?: string, playlistSlug?: string): Promise<string> {
    const scope = await this.resolveScope(token, playlistSlug);
    const cacheKey = `epg:xmltv:${scope.key}`;

    const cached = await this.cache.get<string>(cacheKey);
    if (cached) return cached;

    const allowed = new Set(scope.channels.map((c) => c.epgId).filter((id): id is string => !!id));
    const blocks: string[] = scope.channels.map((c) =>
      XmltvFilter.channelStub(c.epgId ?? c.externalId, c.name, c.logo),
    );

    let programmes = 0;
    for (const source of this.config.epgSources) {
      try {
        const response = await firstValueFrom(
          this.http.get(source, {
            responseType: 'stream',
            timeout: this.config.httpTimeoutMs,
            maxRedirects: 5,
          }),
        );
        const result = await XmltvFilter.filterStream(
          response.data as NodeJS.ReadableStream,
          allowed,
        );
        // Les <channel> viennent déjà de notre catalogue : on ne garde que les
        // programmes, sinon la TV voit deux fois la même chaîne.
        blocks.push(result.xml.replace(/<channel[\s\S]*?<\/channel>/g, '').trim());
        programmes += result.programmes;
        this.logger.log(`[EPG] ${source} → ${result.programmes} programmes kept`);
      } catch (error) {
        this.logger.warn(
          `[EPG] Source unavailable, skipped: ${source} (${(error as Error).message})`,
        );
      }
    }

    if (this.config.epgSources.length === 0) {
      this.logger.warn(
        '[EPG] No EPG_SOURCES configured — serving channel definitions only (no programmes)',
      );
    }

    const xml = XmltvFilter.wrap(blocks.filter(Boolean).join('\n'), 'iptv-manager');
    if (Buffer.byteLength(xml) <= MAX_CACHEABLE_BYTES) {
      await this.cache.set(cacheKey, xml, this.config.epgTtl);
    }
    this.logger.log(
      `[EPG] Guide built for scope "${scope.key}": ${scope.channels.length} channels, ${programmes} programmes`,
    );
    return xml;
  }

  /** Correspondances chaîne ↔ site EPG (utile pour configurer iptv-org/epg). */
  async guides(channelIdOrSlug?: string) {
    return this.prisma.guide.findMany({
      where: channelIdOrSlug
        ? {
            channel: {
              OR: [
                { id: channelIdOrSlug },
                { slug: channelIdOrSlug },
                { externalId: channelIdOrSlug },
              ],
            },
          }
        : { channel: { isWanted: true } },
      select: {
        site: true,
        siteId: true,
        lang: true,
        externalChannel: true,
        channel: { select: { name: true, slug: true } },
      },
      orderBy: { site: 'asc' },
      take: 500,
    });
  }

  /**
   * Commande `npm run grab` à lancer sur une instance iptv-org/epg pour ne
   * récupérer que les guides de mes chaînes (voir README).
   */
  async grabHint() {
    const guides = await this.prisma.guide.findMany({
      where: { channel: { isWanted: true } },
      select: { site: true },
      distinct: ['site'],
      orderBy: { site: 'asc' },
    });
    const sites = guides.map((g) => g.site);
    return {
      sites,
      command:
        sites.length > 0
          ? `npm run grab --- --site=${sites.slice(0, 10).join(',')} --output=guide.xml`
          : 'Aucun site EPG connu pour les chaînes curées',
      then: `EPG_SOURCES=https://<ton-hôte>/guide.xml dans .env, puis redémarre l’API`,
      epgUrl: `${this.app.publicUrl}/api/v1/epg/xmltv.xml`,
    };
  }

  private async resolveScope(token?: string, playlistSlug?: string) {
    if (token) {
      const playlist = await this.prisma.playlist.findUnique({ where: { token } });
      if (playlist) {
        const preview = await this.playlists.preview(playlist.slug);
        return {
          key: `playlist:${playlist.slug}`,
          channels: preview.channels.map((c) => ({
            epgId: c.epgId ?? c.externalId,
            externalId: c.externalId,
            name: c.name,
            logo: c.logo ?? null,
          })),
        };
      }
      if (this.app.adminApiKey && token !== this.app.adminApiKey) {
        throw new ForbiddenException('Jeton EPG invalide');
      }
    } else if (this.app.adminApiKey && !playlistSlug) {
      throw new ForbiddenException('Jeton EPG requis');
    }

    if (playlistSlug) {
      const preview = await this.playlists.preview(playlistSlug);
      return {
        key: `playlist:${playlistSlug}`,
        channels: preview.channels.map((c) => ({
          epgId: c.epgId ?? c.externalId,
          externalId: c.externalId,
          name: c.name,
          logo: c.logo ?? null,
        })),
      };
    }

    const channels = await this.prisma.channel.findMany({
      where: {
        isBlocked: false,
        isDisabled: false,
        OR: [{ isWanted: true }, { favorite: { isNot: null } }],
      },
      select: {
        epgId: true,
        externalId: true,
        name: true,
        customName: true,
        logo: true,
        customLogo: true,
      },
    });
    return {
      key: 'curated',
      channels: channels.map((c) => ({
        epgId: c.epgId ?? c.externalId,
        externalId: c.externalId,
        name: c.customName ?? c.name,
        logo: c.customLogo ?? c.logo,
      })),
    };
  }
}
