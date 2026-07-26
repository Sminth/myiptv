import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';

const TTL = 3600;

@Injectable()
export class LanguagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * iptv-org référence 7 800 langues ; seule une centaine porte des chaînes.
   * Par défaut on ne renvoie que celles-là (le sélecteur du dashboard reste utilisable).
   */
  findAll(onlyUsed = true) {
    return this.cache.wrap(`ref:languages:${onlyUsed}`, TTL, async () => {
      const languages = await this.prisma.language.findMany({
        orderBy: { name: 'asc' },
        select: { code: true, name: true, _count: { select: { channels: true } } },
      });
      return languages
        .map((l) => ({ code: l.code, name: l.name, channelCount: l._count.channels }))
        .filter((l) => !onlyUsed || l.channelCount > 0);
    });
  }

  async findOne(code: string) {
    const language = await this.prisma.language.findUnique({
      where: { code: code.toLowerCase() },
      include: { _count: { select: { channels: true } } },
    });
    if (!language) throw new NotFoundException(`Langue « ${code} » introuvable`);
    return language;
  }
}
