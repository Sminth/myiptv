import { HealthScope } from '../streams/stream-health.service';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import { ImportJobsService } from '../scheduler/import-jobs.service';
import { ImporterService } from './importer.service';

@ApiTags('importer')
@Controller('import')
export class ImporterController {
  constructor(
    private readonly importer: ImporterService,
    private readonly jobs: ImportJobsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('run')
  @ApiOperation({
    summary: 'Relancer un import complet (asynchrone)',
    description:
      'Met un job en file BullMQ. Passer `?sync=true` pour attendre la fin (long : plusieurs dizaines de secondes).',
  })
  async run(@Query('sync') sync?: string) {
    if (sync === 'true') {
      return this.importer.run('manual');
    }
    const job = await this.jobs.enqueueImport('manual');
    return { queued: true, jobId: job.id, running: this.importer.isRunning() };
  }

  @Post('health-check')
  @ApiOperation({ summary: 'Relancer la vérification des flux' })
  async healthCheck(@Body() body: { scope?: HealthScope; countries?: string[] } = {}) {
    const job = await this.jobs.enqueueHealthCheck(body.scope ?? 'playlists', 'manual', body.countries);
    return { queued: true, jobId: job.id };
  }

  @Get('runs')
  @ApiOperation({ summary: 'Historique des imports' })
  async runs(@Query() pagination: PaginationQueryDto) {
    return this.prisma.importRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: pagination.limit,
      skip: pagination.skip,
    });
  }

  @Get('status')
  @ApiOperation({ summary: 'État courant de l’import' })
  async status() {
    const [last, running] = await Promise.all([
      this.prisma.importRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      Promise.resolve(this.importer.isRunning()),
    ]);
    return { running, last };
  }
}
