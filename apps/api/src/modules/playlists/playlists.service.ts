import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Playlist, Prisma, PlaylistSort } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { slugify } from 'src/common/utils/text.util';
import { appConfig } from 'src/config/configuration';
import { ChannelsRepository } from '../channels/channels.repository';
import { DEFAULT_PLAYLISTS } from './default-playlists';
import { CreatePlaylistDto, PlaylistRulesDto, UpdatePlaylistDto } from './dto/playlist.dto';
import { resolveGroup } from './group-resolver';
import { buildPlaylistWhere } from './playlist-rules';
import { generateShortCode, normalizeShortCode } from './short-code';
import { M3uChannel, capPerGroup, generateM3u, sortForPlaylist } from './m3u.generator';

/** Le M3U est recalculé au plus une fois par 10 min (les lecteurs TV rafraîchissent souvent). */
const M3U_TTL = 600;

@Injectable()
export class PlaylistsService {
  private readonly logger = new Logger(PlaylistsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsRepository,
    private readonly cache: CacheService,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async findAll() {
    const playlists = await this.prisma.playlist.findMany({ orderBy: { createdAt: 'asc' } });
    return playlists.map((playlist) => this.withUrls(playlist));
  }

  async findOne(slugOrId: string) {
    const playlist = await this.prisma.playlist.findFirst({
      where: { OR: [{ id: slugOrId }, { slug: slugOrId }] },
    });
    if (!playlist) throw new NotFoundException(`Playlist « ${slugOrId} » introuvable`);
    return playlist;
  }

  async create(dto: CreatePlaylistDto) {
    const playlist = await this.prisma.playlist.create({
      data: {
        name: dto.name,
        slug: slugify(dto.slug ?? dto.name),
        description: dto.description,
        rules: (dto.rules ?? {}) as unknown as Prisma.InputJsonValue,
        sort: dto.sort ?? PlaylistSort.PRIORITY,
        token: randomBytes(16).toString('hex'),
        shortCode: await this.freeShortCode(),
      },
    });
    this.logger.log(`[Playlists] Created "${playlist.slug}"`);
    return this.withUrls(playlist);
  }

  async update(slugOrId: string, dto: UpdatePlaylistDto) {
    const existing = await this.findOne(slugOrId);
    const playlist = await this.prisma.playlist.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        description: dto.description,
        sort: dto.sort,
        ...(dto.rules ? { rules: dto.rules as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    await this.cache.del(this.cacheKey(playlist.slug));
    return this.withUrls(playlist);
  }

  async remove(slugOrId: string) {
    const playlist = await this.findOne(slugOrId);
    await this.prisma.playlist.delete({ where: { id: playlist.id } });
    await this.cache.del(this.cacheKey(playlist.slug));
    return { deleted: true };
  }

  /** Régénère le jeton : invalide immédiatement le lien collé dans une TV. */
  async rotateToken(slugOrId: string) {
    const existing = await this.findOne(slugOrId);
    const playlist = await this.prisma.playlist.update({
      where: { id: existing.id },
      data: { token: randomBytes(16).toString('hex') },
    });
    await this.cache.del(this.cacheKey(playlist.slug));
    this.logger.log(`[Playlists] Token rotated for "${playlist.slug}"`);
    return this.withUrls(playlist);
  }

  /** Épingle ou exclut une chaîne, hors règles. */
  async pin(slugOrId: string, channelId: string, excluded = false) {
    const playlist = await this.findOne(slugOrId);
    const channel = await this.prisma.channel.findFirst({
      where: { OR: [{ id: channelId }, { slug: channelId }, { externalId: channelId }] },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException(`Chaîne « ${channelId} » introuvable`);

    await this.prisma.playlistChannel.upsert({
      where: { playlistId_channelId: { playlistId: playlist.id, channelId: channel.id } },
      create: { playlistId: playlist.id, channelId: channel.id, excluded },
      update: { excluded },
    });
    await this.cache.del(this.cacheKey(playlist.slug));
    return { pinned: !excluded, excluded };
  }

  // ─── Génération M3U ────────────────────────────────────────────────────────

  /**
   * Rend le contenu M3U d'une playlist.
   * @param token jeton d'URL — obligatoire dès qu'une clé d'admin est configurée.
   */
  async renderM3u(slug: string, token?: string): Promise<{ playlist: Playlist; body: string }> {
    const playlist = await this.findOne(slug);
    this.assertToken(playlist, token);

    const cached = await this.cache.get<string>(this.cacheKey(playlist.slug));
    if (cached) return { playlist, body: cached };

    const channels = await this.resolveChannels(playlist);
    const body = generateM3u(channels, {
      name: playlist.name,
      epgUrl: this.epgUrl(playlist.token),
    });

    await this.cache.set(this.cacheKey(playlist.slug), body, M3U_TTL);
    await this.prisma.playlist.update({
      where: { id: playlist.id },
      data: {
        channelCount: channels.length,
        generatedAt: new Date(),
        generatedUrl: this.m3uUrl(playlist),
      },
    });

    this.logger.log(`[Playlists] "${playlist.slug}" generated — ${channels.length} channels`);
    return { playlist, body };
  }

  /** Aperçu JSON (dashboard) : mêmes chaînes que le M3U, sans le fichier. */
  async preview(slugOrId: string) {
    const playlist = await this.findOne(slugOrId);
    const channels = await this.resolveChannels(playlist);
    const groups = new Map<string, number>();
    for (const channel of channels) groups.set(channel.group, (groups.get(channel.group) ?? 0) + 1);

    return {
      playlist: this.withUrls(playlist),
      total: channels.length,
      groups: Array.from(groups, ([name, count]) => ({ name, count })),
      channels,
    };
  }

  /** Lit les épingles en base, délègue la traduction des règles, rend le M3U. */
  private async resolveChannels(playlist: Playlist): Promise<M3uChannel[]> {
    const rules = (playlist.rules ?? {}) as PlaylistRulesDto;

    const items = await this.prisma.playlistChannel.findMany({
      where: { playlistId: playlist.id },
      select: { channelId: true, excluded: true, position: true },
    });

    const where = buildPlaylistWhere(
      rules,
      {
        pinned: items.filter((i) => !i.excluded).map((i) => i.channelId),
        excludedIds: items.filter((i) => i.excluded).map((i) => i.channelId),
      },
      this.channels.baseWhere(),
    );

    const rows = await this.channels.findForPlaylist(where);

    let channels: M3uChannel[] = rows.map((row) => ({
      externalId: row.externalId,
      name: row.customName ?? row.name,
      logo: row.customLogo ?? row.logo,
      group: resolveGroup({
        customGroup: row.customGroup,
        curatedGroup: row.wantedEntries[0]?.group ?? null,
        countryCode: row.countryCode,
        countryName: row.country?.name ?? null,
        categories: row.categories,
        regions: row.regions,
        category: row.category,
      }),
      streamUrl: row.streamUrl as string,
      countryCode: row.countryCode,
      languageCode: row.languageCode,
      quality: row.streamQuality,
      epgId: row.epgId,
      userAgent: row.streams[0]?.userAgent ?? null,
      referrer: row.streams[0]?.referrer ?? null,
      priorityRank: row.priorityRank,
    }));

    if (playlist.sort === PlaylistSort.NAME) {
      channels.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    } else if (playlist.sort === PlaylistSort.GROUP) {
      channels.sort((a, b) => a.group.localeCompare(b.group, 'fr') || a.name.localeCompare(b.name, 'fr'));
    } else {
      channels = sortForPlaylist(channels);
    }

    channels = capPerGroup(channels, rules.maxPerGroup);
    if (rules.limit) channels = channels.slice(0, rules.limit);
    return channels;
  }

  // ─── Amorçage ──────────────────────────────────────────────────────────────

  /** Crée les playlists par défaut si elles n'existent pas (premier démarrage). */
  async seedDefaults(): Promise<number> {
    let created = 0;
    for (const spec of DEFAULT_PLAYLISTS) {
      const exists = await this.prisma.playlist.findUnique({ where: { slug: spec.slug } });
      if (exists) continue;
      await this.prisma.playlist.create({
        data: {
          slug: spec.slug,
          name: spec.name,
          description: spec.description,
          rules: spec.rules as unknown as Prisma.InputJsonValue,
          token: randomBytes(16).toString('hex'),
          shortCode: spec.shortCode ?? (await this.freeShortCode()),
        },
      });
      created++;
    }
    if (created > 0) this.logger.log(`[Playlists] ${created} default playlists created`);
    return created;
  }

  /** Retrouve une playlist par son code court (lien tapé à la télécommande). */
  async findByShortCode(code: string): Promise<Playlist> {
    const playlist = await this.prisma.playlist.findUnique({
      where: { shortCode: normalizeShortCode(code) },
    });
    if (!playlist) throw new NotFoundException('Lien court inconnu');
    return playlist;
  }

  /**
   * Donne un code court aux playlists qui n'en ont pas encore (celles créées
   * avant l'ajout de la colonne). Appelé au démarrage.
   */
  async backfillShortCodes(): Promise<number> {
    const missing = await this.prisma.playlist.findMany({
      where: { shortCode: null },
      select: { id: true, slug: true },
    });
    for (const playlist of missing) {
      await this.prisma.playlist.update({
        where: { id: playlist.id },
        data: { shortCode: await this.freeShortCode() },
      });
    }
    if (missing.length) this.logger.log(`[Playlists] ${missing.length} short codes generated`);
    return missing.length;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Tire un code court encore libre (collision extrêmement improbable, mais gérée). */
  private async freeShortCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateShortCode();
      const taken = await this.prisma.playlist.findUnique({
        where: { shortCode: code },
        select: { id: true },
      });
      if (!taken) return code;
    }
    throw new Error('Impossible de générer un code court libre');
  }

  private cacheKey(slug: string): string {
    return `playlist:m3u:${slug}`;
  }

  /**
   * Le jeton est la seule protection de l'URL M3U : un lecteur TV ne sait pas
   * envoyer d'en-tête d'authentification. En dev (pas de clé admin), on laisse
   * passer pour pouvoir tester au navigateur.
   */
  private assertToken(playlist: Playlist, token?: string): void {
    if (!this.config.adminApiKey) return;
    if (!token || token !== playlist.token) {
      throw new ForbiddenException('Jeton de playlist invalide');
    }
  }

  /** Le lien à taper à la télécommande : court, sans query string. */
  private shortUrl(playlist: Playlist): string | null {
    return playlist.shortCode ? `${this.config.publicUrl}/t/${playlist.shortCode}` : null;
  }

  private m3uUrl(playlist: Playlist): string {
    return `${this.config.publicUrl}/api/v1/playlist/${playlist.slug}.m3u?token=${playlist.token}`;
  }

  private epgUrl(token: string): string {
    return `${this.config.publicUrl}/api/v1/epg/xmltv.xml?token=${token}`;
  }

  private withUrls(playlist: Playlist) {
    return {
      ...playlist,
      m3uUrl: this.m3uUrl(playlist),
      shortUrl: this.shortUrl(playlist),
      epgUrl: this.epgUrl(playlist.token),
    };
  }
}
