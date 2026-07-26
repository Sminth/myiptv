import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ImporterService } from '../importer/importer.service';
import { StreamHealthService } from '../streams/stream-health.service';
import {
  FullImportJobData,
  HealthCheckJobData,
  JOB_FULL_IMPORT,
  JOB_HEALTH_CHECK,
  MAINTENANCE_QUEUE,
} from './queues';

/**
 * Un seul worker à la fois (`concurrency: 1`) : import et contrôle de santé
 * écrivent tous les deux sur `channels`/`streams`, les paralléliser ne ferait
 * que provoquer des verrous.
 */
@Processor(MAINTENANCE_QUEUE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly importer: ImporterService,
    private readonly health: StreamHealthService,
  ) {
    super();
  }

  async process(job: Job<FullImportJobData | HealthCheckJobData>): Promise<unknown> {
    switch (job.name) {
      case JOB_FULL_IMPORT: {
        const data = job.data as FullImportJobData;
        this.logger.log(`[Jobs] Full import (trigger=${data.trigger})`);
        const result = await this.importer.run(data.trigger);
        // Après un import, les nouveaux flux n'ont jamais été testés : on
        // enchaîne sur un contrôle des chaînes curées.
        await this.health.checkAll({ scope: 'playlists' });
        return result.stats;
      }
      case JOB_HEALTH_CHECK: {
        const data = job.data as HealthCheckJobData;
        this.logger.log(`[Jobs] Health check (trigger=${data.trigger}, scope=${data.scope ?? 'playlists'})`);
        return this.health.checkAll({ scope: data.scope, countries: data.countries });
      }
      default:
        this.logger.warn(`[Jobs] Unknown job "${job.name}" ignored`);
        return null;
    }
  }
}
