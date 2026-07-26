import { HealthScope } from '../streams/stream-health.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import { importConfig } from 'src/config/configuration';
import {
  FullImportJobData,
  HealthCheckJobData,
  JOB_FULL_IMPORT,
  JOB_HEALTH_CHECK,
  MAINTENANCE_QUEUE,
} from './queues';

/**
 * Planification via des *repeatable jobs* BullMQ plutôt que `@Cron` :
 * le cron vient de la configuration (`IMPORT_CRON`), et surtout un job manqué
 * pendant que le serveur était éteint n'est pas perdu — BullMQ le reprend au
 * redémarrage.
 */
@Injectable()
export class ImportJobsService implements OnModuleInit {
  private readonly logger = new Logger(ImportJobsService.name);

  constructor(
    @InjectQueue(MAINTENANCE_QUEUE) private readonly queue: Queue,
    @Inject(importConfig.KEY) private readonly config: ConfigType<typeof importConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Les anciens patterns sont retirés pour que changer IMPORT_CRON ne laisse
    // pas deux planifications actives en parallèle.
    const existing = await this.queue.getJobSchedulers();
    for (const scheduler of existing) {
      if (scheduler.key) await this.queue.removeJobScheduler(scheduler.key);
    }

    await this.queue.upsertJobScheduler(
      'nightly-import',
      { pattern: this.config.cron },
      { name: JOB_FULL_IMPORT, data: { trigger: 'scheduler' } satisfies FullImportJobData },
    );
    await this.queue.upsertJobScheduler(
      'periodic-health-check',
      { pattern: this.config.healthCron },
      {
        name: JOB_HEALTH_CHECK,
        // Le passage périodique couvre tout ce qui atterrit dans une playlist,
        // pas seulement les chaînes curées.
        data: { scope: 'playlists', trigger: 'scheduler' } satisfies HealthCheckJobData,
      },
    );

    this.logger.log(
      `[Scheduler] Import "${this.config.cron}", health check "${this.config.healthCron}"`,
    );
  }

  enqueueImport(trigger = 'manual') {
    return this.queue.add(
      JOB_FULL_IMPORT,
      { trigger } satisfies FullImportJobData,
      { removeOnComplete: 50, removeOnFail: 50 },
    );
  }

  enqueueHealthCheck(scope: HealthScope = 'playlists', trigger = 'manual', countries?: string[]) {
    return this.queue.add(
      JOB_HEALTH_CHECK,
      { scope, trigger, countries } satisfies HealthCheckJobData,
      { removeOnComplete: 50, removeOnFail: 50 },
    );
  }

  async stats() {
    const counts = await this.queue.getJobCounts();
    const schedulers = await this.queue.getJobSchedulers();
    return {
      counts,
      schedulers: schedulers.map((s) => ({ key: s.key, pattern: s.pattern, next: s.next })),
    };
  }
}
