import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PlaylistsModule } from '../playlists/playlists.module';
import { EpgController } from './epg.controller';
import { EpgService } from './epg.service';

@Module({
  imports: [HttpModule, PlaylistsModule],
  controllers: [EpgController],
  providers: [EpgService],
  exports: [EpgService],
})
export class EpgModule {}
