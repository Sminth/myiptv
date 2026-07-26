import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CurationModule } from 'src/curation/curation.module';
import { JobsModule } from '../scheduler/jobs.module';
import { StreamsModule } from '../streams/streams.module';
import { ImporterController } from './importer.controller';
import { ImporterService } from './importer.service';
import { IptvOrgClient } from './iptv-org.client';

@Module({
  imports: [HttpModule, CurationModule, StreamsModule, JobsModule],
  controllers: [ImporterController],
  providers: [ImporterService, IptvOrgClient],
  exports: [ImporterService, IptvOrgClient],
})
export class ImporterModule {}
