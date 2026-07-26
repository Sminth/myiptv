import { Module } from '@nestjs/common';
import { CurationModule } from 'src/curation/curation.module';
import { ChannelsModule } from '../channels/channels.module';
import { ImporterModule } from '../importer/importer.module';
import { PlaylistsModule } from '../playlists/playlists.module';
import { JobsModule } from '../scheduler/jobs.module';
import { StreamsModule } from '../streams/streams.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    ChannelsModule,
    CurationModule,
    ImporterModule,
    StreamsModule,
    PlaylistsModule,
    JobsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
