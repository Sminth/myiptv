import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { CacheService } from 'src/common/cache/cache.service';
import { Public } from 'src/common/decorators/public.decorator';
import { PrismaService } from 'src/common/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Sonde de vie (PostgreSQL + Redis)' })
  check() {
    return this.health.check([
      async () => {
        const check = this.indicator.check('database');
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return check.up();
        } catch (error) {
          return check.down({ message: (error as Error).message });
        }
      },
      async () => {
        const check = this.indicator.check('redis');
        return (await this.cache.ping()) ? check.up() : check.down({ message: 'PING failed' });
      },
    ]);
  }
}
