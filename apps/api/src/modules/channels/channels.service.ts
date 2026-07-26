import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { hashUrl } from 'src/common/utils/url-hash.util';
import { CacheService } from 'src/common/cache/cache.service';
import { PaginatedDto } from 'src/common/dto/pagination.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { ChannelsRepository } from './channels.repository';
import { QueryChannelsDto, SearchChannelsDto } from './dto/query-channels.dto';
import { AddManualStreamDto, UpdateChannelDto } from './dto/update-channel.dto';

/** Recherche : courte durée de vie, le catalogue bouge une fois par nuit. */
const SEARCH_TTL = 300;
const LIST_TTL = 300;

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly repository: ChannelsRepository,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private cacheKey(prefix: string, payload: unknown): string {
    const hash = createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
    return `channels:${prefix}:${hash}`;
  }

  async findAll(query: QueryChannelsDto) {
    return this.cache.wrap(this.cacheKey('list', query), LIST_TTL, async () => {
      const { data, total } = await this.repository.findMany(query);
      return PaginatedDto.of(data.map(toChannelDto), total, query.page, query.limit);
    });
  }

  async search(dto: SearchChannelsDto) {
    return this.cache.wrap(this.cacheKey('search', dto), SEARCH_TTL, async () => {
      const { data, total } = await this.repository.search(dto);
      return PaginatedDto.of(data, total, dto.page, dto.limit);
    });
  }

  async findOne(idOrSlug: string) {
    const channel = await this.repository.findBySlugOrId(idOrSlug);
    if (!channel) throw new NotFoundException(`Chaîne « ${idOrSlug} » introuvable`);
    return channel;
  }

  async update(idOrSlug: string, dto: UpdateChannelDto) {
    const channel = await this.findOne(idOrSlug);
    const updated = await this.prisma.channel.update({
      where: { id: channel.id },
      data: {
        customName: dto.customName,
        customLogo: dto.customLogo,
        customGroup: dto.customGroup,
        category: dto.category ?? undefined,
        isDisabled: dto.isDisabled,
      },
    });
    this.logger.log(`[Channels] ${updated.slug} updated (manual edit)`);
    await this.cache.invalidateCatalog();
    return updated;
  }

  /**
   * Ajout d'un flux fourni par l'utilisateur. Volontairement séparé de l'import :
   * ce projet n'ajoute pas de source de son propre chef, mais tu peux brancher
   * une URL dont tu disposes légalement (flux de ton fournisseur, serveur perso).
   * Ces flux sont préfixés `manual:` et survivent aux imports.
   */
  async addManualStream(idOrSlug: string, dto: AddManualStreamDto) {
    const channel = await this.findOne(idOrSlug);
    const stream = await this.prisma.stream.upsert({
      where: { urlHash: hashUrl(dto.url) },
      create: {
        channelId: channel.id,
        url: dto.url,
        urlHash: hashUrl(dto.url),
        quality: dto.quality,
        userAgent: dto.userAgent,
        referrer: dto.referrer,
        title: `manual:${channel.slug}`,
      },
      update: {
        channelId: channel.id,
        quality: dto.quality,
        userAgent: dto.userAgent,
        referrer: dto.referrer,
      },
    });
    await this.cache.invalidateCatalog();
    return stream;
  }

  async removeStream(streamId: string) {
    await this.prisma.stream.delete({ where: { id: streamId } });
    await this.cache.invalidateCatalog();
    return { deleted: true };
  }

  stats() {
    return this.cache.wrap('stats:channels', 60, () => this.repository.stats());
  }
}

type ChannelWithRelations = Awaited<
  ReturnType<ChannelsRepository['findMany']>
>['data'][number];

/** Le nom/logo personnalisé prime toujours sur la valeur importée. */
export function toChannelDto(channel: ChannelWithRelations) {
  return {
    id: channel.id,
    externalId: channel.externalId,
    name: channel.customName ?? channel.name,
    slug: channel.slug,
    logo: channel.customLogo ?? channel.logo,
    website: channel.website,
    country: channel.country,
    language: channel.language,
    category: channel.category,
    categories: channel.categories,
    regions: channel.regions,
    group: channel.customGroup,
    streamUrl: channel.streamUrl,
    quality: channel.streamQuality,
    isHd: channel.isHd,
    isActive: channel.isActive,
    isWanted: channel.isWanted,
    priorityRank: channel.priorityRank,
    isFavorite: channel.favorite !== null,
    streamCount: channel._count.streams,
    epgId: channel.epgId,
    lastCheckedAt: channel.lastCheckedAt,
  };
}
