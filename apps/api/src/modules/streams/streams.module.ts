import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BestStreamService } from './best-stream.service';
import { StreamHealthService } from './stream-health.service';

/** Socle sans dépendance métier : c'est lui qui casse le cycle import ↔ santé. */
@Module({
  imports: [HttpModule],
  providers: [StreamHealthService, BestStreamService],
  exports: [StreamHealthService, BestStreamService],
})
export class StreamsModule {}
