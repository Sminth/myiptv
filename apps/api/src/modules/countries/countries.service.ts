import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';

/** Référentiel quasi statique : cache long, invalidé par l'import. */
const TTL = 3600;

@Injectable()
export class CountriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** @param withChannels true = ne renvoyer que les pays qui ont des chaînes actives. */
  findAll(withChannels = true) {
    return this.cache.wrap(`ref:countries:${withChannels}`, TTL, async () => {
      const countries = await this.prisma.country.findMany({
        orderBy: { name: 'asc' },
        select: {
          code: true,
          name: true,
          flag: true,
          languages: true,
          _count: { select: { channels: true } },
        },
      });
      return countries
        .map((c) => ({
          code: c.code,
          name: c.name,
          flag: c.flag,
          languages: c.languages,
          channelCount: c._count.channels,
        }))
        .filter((c) => !withChannels || c.channelCount > 0);
    });
  }

  async findOne(code: string) {
    const country = await this.prisma.country.findUnique({
      where: { code: code.toUpperCase() },
      include: { _count: { select: { channels: true } } },
    });
    if (!country) throw new NotFoundException(`Pays « ${code} » introuvable`);
    return country;
  }
}
