import { Injectable } from '@nestjs/common';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { DEFAULT_GROUPS } from 'src/curation/curation.config';

const TTL = 3600;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Catégories brutes iptv-org (news, movies, kids…) avec leur volumétrie. */
  findAll() {
    return this.cache.wrap('ref:categories', TTL, async () => {
      const [categories, counts] = await Promise.all([
        this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
        this.prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
          SELECT unnest(categories) AS category, COUNT(*)::bigint AS count
          FROM channels
          WHERE is_blocked = false AND is_disabled = false AND is_active = true
          GROUP BY 1
        `,
      ]);
      const countBySlug = new Map(counts.map((c) => [c.category, Number(c.count)] as const));
      return categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        channelCount: countBySlug.get(c.slug) ?? 0,
      }));
    });
  }

  /**
   * Groupes « maison » (France, Côte d'Ivoire, Documentaire…) : ce sont eux qui
   * structurent l'affichage dans la TV, pas les catégories brutes.
   */
  groups() {
    return this.cache.wrap('ref:groups', TTL, async () => {
      // `group` est un mot réservé SQL : il doit rester quoté en requête brute.
      const counts = await this.prisma.$queryRaw<Array<{ group: string; count: bigint }>>`
        SELECT w."group" AS "group", COUNT(DISTINCT c.id)::bigint AS count
        FROM wanted_channels w
        JOIN channels c ON c.id = w.resolved_channel_id
        WHERE c.is_blocked = false AND c.is_disabled = false
        GROUP BY 1
      `;
      const curated = new Map(counts.map((c) => [c.group, Number(c.count)] as const));
      return DEFAULT_GROUPS.map((g) => ({
        name: g.name,
        order: g.order,
        countries: g.countries ?? [],
        categories: g.categories ?? [],
        curatedChannels: curated.get(g.name) ?? 0,
      }));
    });
  }
}
