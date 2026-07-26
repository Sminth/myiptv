import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { PlaylistFileController, PlaylistShortLinkController, PlaylistsController } from './playlists.controller';
import { PlaylistsService } from './playlists.service';

@Module({
  imports: [ChannelsModule],
  controllers: [PlaylistsController, PlaylistFileController, PlaylistShortLinkController],
  providers: [PlaylistsService],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}
