import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { EpgService } from './epg.service';

@ApiTags('epg')
@Controller('epg')
export class EpgController {
  constructor(private readonly epg: EpgService) {}

  @Get('xmltv.xml')
  @Public()
  @ApiProduces('application/xml')
  @ApiQuery({ name: 'token', required: false, description: 'Jeton de la playlist concernée' })
  @ApiQuery({ name: 'playlist', required: false, description: 'Slug de playlist (alternative au jeton)' })
  @ApiOperation({
    summary: 'Guide XMLTV filtré sur mes chaînes',
    description:
      'URL annoncée par le M3U (`url-tvg`). Sans `EPG_SOURCES` configuré, le guide ne contient que les définitions de chaînes.',
  })
  async xmltv(
    @Query('token') token: string | undefined,
    @Query('playlist') playlist: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const xml = await this.epg.xmltv(token, playlist);
    res
      .status(200)
      .set({
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=1800',
      })
      .send(xml);
  }

  @Get('guides')
  @ApiOperation({ summary: 'Correspondances chaîne ↔ source EPG' })
  guides(@Query('channel') channel?: string) {
    return this.epg.guides(channel);
  }

  @Get('grab-hint')
  @ApiOperation({ summary: 'Commande iptv-org/epg à lancer pour mes chaînes' })
  grabHint() {
    return this.epg.grabHint();
  }

  @Get('channel/:idOrSlug')
  @ApiOperation({ summary: 'Sources EPG d’une chaîne' })
  forChannel(@Param('idOrSlug') idOrSlug: string) {
    return this.epg.guides(idOrSlug);
  }
}
