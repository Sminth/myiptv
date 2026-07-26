import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll() {
    const favorites = await this.prisma.favorite.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            customName: true,
            slug: true,
            logo: true,
            customLogo: true,
            streamUrl: true,
            isActive: true,
            isHd: true,
            countryCode: true,
            category: true,
          },
        },
      },
    });

    return favorites.map((favorite) => ({
      id: favorite.id,
      position: favorite.position,
      createdAt: favorite.createdAt,
      channel: {
        ...favorite.channel,
        name: favorite.channel.customName ?? favorite.channel.name,
        logo: favorite.channel.customLogo ?? favorite.channel.logo,
      },
    }));
  }

  /** Idempotent : ajouter deux fois la même chaîne ne crée pas de doublon. */
  async add(channelIdOrSlug: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { OR: [{ id: channelIdOrSlug }, { slug: channelIdOrSlug }, { externalId: channelIdOrSlug }] },
      select: { id: true, slug: true },
    });
    if (!channel) throw new NotFoundException(`Chaîne « ${channelIdOrSlug} » introuvable`);

    const last = await this.prisma.favorite.findFirst({ orderBy: { position: 'desc' } });
    const favorite = await this.prisma.favorite.upsert({
      where: { channelId: channel.id },
      create: { channelId: channel.id, position: (last?.position ?? 0) + 1 },
      update: {},
    });

    this.logger.log(`[Favorites] ${channel.slug} added`);
    await this.cache.delByPattern('playlist:*');
    return favorite;
  }

  /** @param id id du favori OU id/slug de la chaîne (les deux sont pratiques côté TV). */
  async remove(id: string) {
    const favorite = await this.prisma.favorite.findFirst({
      where: {
        OR: [{ id }, { channelId: id }, { channel: { slug: id } }, { channel: { externalId: id } }],
      },
    });
    if (!favorite) throw new NotFoundException('Favori introuvable');

    await this.prisma.favorite.delete({ where: { id: favorite.id } });
    await this.cache.delByPattern('playlist:*');
    return { deleted: true };
  }

  /** Réordonne l'ensemble des favoris (drag & drop du dashboard). */
  async reorder(channelIds: string[]) {
    await this.prisma.$transaction(
      channelIds.map((channelId, index) =>
        this.prisma.favorite.updateMany({ where: { channelId }, data: { position: index + 1 } }),
      ),
    );
    await this.cache.delByPattern('playlist:*');
    return this.findAll();
  }
}
