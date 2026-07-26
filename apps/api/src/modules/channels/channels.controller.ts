import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { QueryChannelsDto, SearchChannelsDto } from './dto/query-channels.dto';
import { AddManualStreamDto, UpdateChannelDto } from './dto/update-channel.dto';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les chaînes (filtres + pagination)' })
  findAll(@Query() query: QueryChannelsDto) {
    return this.channels.findAll(query);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Recherche rapide',
    description:
      'Exemples : `/channels/search?q=tf1`, `?q=rti`, `?q=documentaire`, `?q=ivoire`, `?country=CI&hd=true`.',
  })
  search(@Query() query: SearchChannelsDto) {
    return this.channels.search(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Compteurs du catalogue' })
  stats() {
    return this.channels.stats();
  }

  @Get(':idOrSlug')
  @ApiParam({ name: 'idOrSlug', description: 'id, slug ou identifiant iptv-org (TF1.fr)' })
  @ApiOperation({ summary: 'Détail d’une chaîne (flux, EPG, curation)' })
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.channels.findOne(idOrSlug);
  }

  @Patch(':idOrSlug')
  @ApiOperation({ summary: 'Modifier une chaîne (nom, logo, groupe, désactivation)' })
  update(@Param('idOrSlug') idOrSlug: string, @Body() dto: UpdateChannelDto) {
    return this.channels.update(idOrSlug, dto);
  }

  @Post(':idOrSlug/streams')
  @ApiOperation({
    summary: 'Rattacher un flux dont tu disposes légalement',
    description:
      'Réservé à tes propres sources autorisées (serveur perso, flux fourni par ton opérateur). Aucun flux n’est recherché automatiquement hors des sources publiques.',
  })
  addStream(@Param('idOrSlug') idOrSlug: string, @Body() dto: AddManualStreamDto) {
    return this.channels.addManualStream(idOrSlug, dto);
  }

  @Delete('streams/:streamId')
  @ApiOperation({ summary: 'Supprimer un flux (mort ou indésirable)' })
  removeStream(@Param('streamId') streamId: string) {
    return this.channels.removeStream(streamId);
  }
}
