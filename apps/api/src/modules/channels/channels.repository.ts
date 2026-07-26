import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { normalizeText } from 'src/common/utils/text.util';
import { QueryChannelsDto, SearchChannelsDto } from './dto/query-channels.dto';

/** Colonnes renvoyées par les requêtes de recherche brutes, déjà en camelCase. */
const RAW_COLUMNS = Prisma.sql`
  c.id, c.external_id AS "externalId", COALESCE(c.custom_name, c.name) AS name, c.slug,
  COALESCE(c.custom_logo, c.logo) AS logo, c.website, c.country_code AS "countryCode",
  c.language_code AS "languageCode", c.category, c.categories, c.regions,
  c.stream_url AS "streamUrl", c.stream_quality AS "streamQuality", c.is_hd AS "isHd",
  c.is_active AS "isActive", c.is_wanted AS "isWanted", c.priority_rank AS "priorityRank",
  c.custom_group AS "customGroup", c.epg_id AS "epgId", c.last_checked AS "lastCheckedAt"
`;

export interface ChannelRow {
  id: string;
  externalId: string;
  name: string;
  slug: string;
  logo: string | null;
  website: string | null;
  countryCode: string | null;
  languageCode: string | null;
  category: string | null;
  categories: string[];
  regions: string[];
  streamUrl: string | null;
  streamQuality: string | null;
  isHd: boolean;
  isActive: boolean;
  isWanted: boolean;
  priorityRank: number | null;
  customGroup: string | null;
  epgId: string | null;
  lastCheckedAt: Date | null;
}

@Injectable()
export class ChannelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Filtre de base appliqué partout : jamais de chaîne bloquée (DMCA/NSFW en
   * amont) ni désactivée à la main. C'est la garantie qu'une chaîne retirée
   * l'est vraiment, playlists comprises.
   */
  baseWhere(includeDisabled = false): Prisma.ChannelWhereInput {
    return {
      isBlocked: false,
      ...(includeDisabled ? {} : { isDisabled: false }),
    };
  }

  buildWhere(query: QueryChannelsDto): Prisma.ChannelWhereInput {
    const where: Prisma.ChannelWhereInput = this.baseWhere(query.includeDisabled);

    if (query.q) {
      const term = normalizeText(query.q);
      if (term) where.searchText = { contains: term };
    }
    if (query.country?.length) where.countryCode = { in: query.country };
    if (query.language?.length) where.languageCode = { in: query.language };
    if (query.category?.length) where.categories = { hasSome: query.category };
    if (query.region?.length) where.regions = { hasSome: query.region };
    if (query.hd !== undefined) where.isHd = query.hd;
    if (query.active !== undefined) where.isActive = query.active;
    if (query.wanted !== undefined) where.isWanted = query.wanted;
    if (query.favorite) where.favorite = { isNot: null };

    return where;
  }

  private orderBy(sort: QueryChannelsDto['sort']): Prisma.ChannelOrderByWithRelationInput[] {
    switch (sort) {
      case 'name':
        return [{ name: 'asc' }];
      case 'country':
        return [{ countryCode: 'asc' }, { name: 'asc' }];
      case 'recent':
        return [{ updatedAt: 'desc' }];
      case 'priority':
      default:
        // `nulls: 'last'` est essentiel : sans lui les 20 000 chaînes non curées
        // passeraient devant TF1 (NULL trie en premier en ASC sous PostgreSQL).
        return [
          { priorityRank: { sort: 'asc', nulls: 'last' } },
          { isActive: 'desc' },
          { name: 'asc' },
        ];
    }
  }

  async findMany(query: QueryChannelsDto) {
    const where = this.buildWhere(query);
    const [data, total] = await Promise.all([
      this.prisma.channel.findMany({
        where,
        orderBy: this.orderBy(query.sort),
        skip: query.skip,
        take: query.limit,
        include: {
          country: { select: { code: true, name: true, flag: true } },
          language: { select: { code: true, name: true } },
          favorite: { select: { id: true } },
          _count: { select: { streams: true } },
        },
      }),
      this.prisma.channel.count({ where }),
    ]);
    return { data, total };
  }

  findBySlugOrId(idOrSlug: string) {
    return this.prisma.channel.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }, { externalId: idOrSlug }] },
      include: {
        country: { select: { code: true, name: true, flag: true } },
        language: { select: { code: true, name: true } },
        favorite: { select: { id: true } },
        streams: {
          orderBy: [{ isAlive: 'desc' }, { failureCount: 'asc' }],
          select: {
            id: true,
            url: true,
            quality: true,
            isAlive: true,
            latencyMs: true,
            lastCheckedAt: true,
            lastError: true,
          },
        },
        guides: { select: { site: true, siteId: true, lang: true } },
        wantedEntries: { select: { key: true, label: true, group: true, rank: true } },
      },
    });
  }

  /**
   * Recherche « ultra rapide » : le tri de pertinence se fait en SQL pour
   * profiter de l'index trigram (`search_text`) — 20 000 chaînes répondent en
   * quelques millisecondes, et le résultat est mis en cache par le service.
   */
  async search(dto: SearchChannelsDto): Promise<{ data: ChannelRow[]; total: number }> {
    const term = dto.q ? normalizeText(dto.q) : '';
    const filters: Prisma.Sql[] = [Prisma.sql`c.is_blocked = false AND c.is_disabled = false`];

    if (term) filters.push(Prisma.sql`c.search_text LIKE ${'%' + term + '%'}`);
    if (dto.country) filters.push(Prisma.sql`c.country_code = ${dto.country}`);
    if (dto.language) filters.push(Prisma.sql`c.language_code = ${dto.language}`);
    if (dto.category) filters.push(Prisma.sql`${dto.category} = ANY(c.categories)`);
    if (dto.region) filters.push(Prisma.sql`${dto.region} = ANY(c.regions)`);
    if (dto.hd !== undefined) filters.push(Prisma.sql`c.is_hd = ${dto.hd}`);
    if (dto.active !== false) filters.push(Prisma.sql`c.is_active = true`);

    const where = Prisma.join(filters, ' AND ');

    const data = await this.prisma.$queryRaw<ChannelRow[]>`
      SELECT ${RAW_COLUMNS}
      FROM channels c
      WHERE ${where}
      ORDER BY
        (c.search_text = ${term}) DESC,
        (c.search_text LIKE ${term + '%'}) DESC,
        c.priority_rank ASC NULLS LAST,
        c.is_wanted DESC,
        c.is_active DESC,
        c.name ASC
      LIMIT ${dto.limit} OFFSET ${dto.skip}
    `;

    const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count FROM channels c WHERE ${where}
    `;

    return { data, total: Number(count) };
  }

  /** Chaînes retenues pour une playlist (voir PlaylistsService). */
  async findForPlaylist(where: Prisma.ChannelWhereInput, limit?: number) {
    return this.prisma.channel.findMany({
      where,
      orderBy: [
        { priorityRank: { sort: 'asc', nulls: 'last' } },
        { countryCode: 'asc' },
        { name: 'asc' },
      ],
      ...(limit ? { take: limit } : {}),
      select: {
        id: true,
        externalId: true,
        name: true,
        customName: true,
        slug: true,
        logo: true,
        customLogo: true,
        customGroup: true,
        countryCode: true,
        languageCode: true,
        category: true,
        categories: true,
        // Sert au regroupement « Afrique · … » dans le M3U.
        regions: true,
        streamUrl: true,
        streamQuality: true,
        isHd: true,
        isActive: true,
        isWanted: true,
        priorityRank: true,
        epgId: true,
        country: { select: { name: true, code: true } },
        // Le groupe de curation pilote le `group-title` du M3U.
        wantedEntries: { select: { group: true, rank: true }, orderBy: { rank: 'asc' }, take: 1 },
        streams: {
          orderBy: [{ isAlive: 'desc' }, { failureCount: 'asc' }],
          take: 1,
          select: { userAgent: true, referrer: true },
        },
      },
    });
  }

  async stats() {
    const [total, active, wanted, favorites, byCountry, streams] = await Promise.all([
      this.prisma.channel.count({ where: this.baseWhere() }),
      this.prisma.channel.count({ where: { ...this.baseWhere(), isActive: true } }),
      this.prisma.channel.count({ where: { ...this.baseWhere(), isWanted: true } }),
      this.prisma.favorite.count(),
      this.prisma.channel.groupBy({
        by: ['countryCode'],
        where: { ...this.baseWhere(), isActive: true },
        _count: { _all: true },
        orderBy: { _count: { countryCode: 'desc' } },
        take: 15,
      }),
      this.prisma.stream.count(),
    ]);

    return {
      channels: { total, active, wanted },
      favorites,
      streams,
      topCountries: byCountry.map((row) => ({
        country: row.countryCode,
        channels: row._count._all,
      })),
    };
  }
}
