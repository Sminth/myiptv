import { Module } from '@nestjs/common';
import { CurationModule } from 'src/curation/curation.module';
import { ImporterModule } from '../importer/importer.module';
import { PlaylistsModule } from '../playlists/playlists.module';
import { StreamsModule } from '../streams/streams.module';
import { BootstrapService } from './bootstrap.service';
import { JobsModule } from './jobs.module';
import { MaintenanceProcessor } from './maintenance.processor';

@Module({
  imports: [JobsModule, ImporterModule, StreamsModule, PlaylistsModule, CurationModule],
  providers: [MaintenanceProcessor, BootstrapService],
})
export class SchedulerModule {}
