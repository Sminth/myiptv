import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ImportJobsService } from './import-jobs.service';
import { MAINTENANCE_QUEUE } from './queues';

/**
 * Mise en file seule (pas de worker) : n'importe quel module peut déclencher un
 * import sans dépendre du module qui l'exécute — donc sans cycle.
 */
@Module({
  imports: [BullModule.registerQueue({ name: MAINTENANCE_QUEUE })],
  providers: [ImportJobsService],
  exports: [ImportJobsService, BullModule],
})
export class JobsModule {}
