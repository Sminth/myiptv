import { Module } from '@nestjs/common';
import { CurationService } from './curation.service';
import { OfficialSourcesService } from './official-sources.service';

@Module({
  providers: [CurationService, OfficialSourcesService],
  exports: [CurationService, OfficialSourcesService],
})
export class CurationModule {}
