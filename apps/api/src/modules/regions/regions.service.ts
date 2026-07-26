import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';

const TTL = 3600;

@Injectable()
export class RegionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  findAll() {
    return this.cache.wrap('ref:regions', TTL, () =>
      this.prisma.region.findMany({
        orderBy: { name: 'asc' },
        select: { code: true, name: true, countries: true },
      }),
    );
  }

  async findOne(code: string) {
    const region = await this.prisma.region.findUnique({ where: { code: code.toUpperCase() } });
    if (!region) throw new NotFoundException(`Région « ${code} » introuvable`);

    const channelCount = await this.prisma.channel.count({
      where: { regions: { has: region.code }, isBlocked: false, isDisabled: false, isActive: true },
    });
    return { ...region, channelCount };
  }
}
