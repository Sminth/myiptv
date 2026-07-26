import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { CreatePlaylistDto, UpdatePlaylistDto } from './dto/playlist.dto';
import { PlaylistsService } from './playlists.service';

@ApiTags('playlists')
@Controller('playlists')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les playlists (avec leur lien TV)' })
  findAll() {
    return this.playlists.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Créer une playlist personnalisée' })
  create(@Body() dto: CreatePlaylistDto) {
    return this.playlists.create(dto);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Détail d’une playlist' })
  findOne(@Param('slug') slug: string) {
    return this.playlists.findOne(slug);
  }

  @Get(':slug/preview')
  @ApiOperation({ summary: 'Aperçu JSON du contenu généré (groupes + chaînes)' })
  preview(@Param('slug') slug: string) {
    return this.playlists.preview(slug);
  }

  @Patch(':slug')
  @ApiOperation({ summary: 'Modifier une playlist (nom, règles, tri)' })
  update(@Param('slug') slug: string, @Body() dto: UpdatePlaylistDto) {
    return this.playlists.update(slug, dto);
  }

  @Delete(':slug')
  @ApiOperation({ summary: 'Supprimer une playlist' })
  remove(@Param('slug') slug: string) {
    return this.playlists.remove(slug);
  }

  @Post(':slug/rotate-token')
  @ApiOperation({ summary: 'Régénérer le jeton (invalide le lien collé dans la TV)' })
  rotateToken(@Param('slug') slug: string) {
    return this.playlists.rotateToken(slug);
  }

  @Post(':slug/channels/:channelId')
  @ApiOperation({ summary: 'Épingler une chaîne dans la playlist' })
  pin(@Param('slug') slug: string, @Param('channelId') channelId: string) {
    return this.playlists.pin(slug, channelId, false);
  }

  @Delete(':slug/channels/:channelId')
  @ApiOperation({ summary: 'Exclure une chaîne de la playlist' })
  exclude(@Param('slug') slug: string, @Param('channelId') channelId: string) {
    return this.playlists.pin(slug, channelId, true);
  }
}

/**
 * Contrôleur « lecteur TV ».
 *
 * Séparé du CRUD parce qu'il obéit à d'autres contraintes : pas de header
 * d'authentification possible (jeton dans l'URL), réponse en texte brut, et un
 * chemin court à taper au doigt sur une télécommande.
 */
@ApiTags('playlists')
@Controller('playlist')
export class PlaylistFileController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get(':slug')
  @Public()
  @ApiProduces('audio/x-mpegurl')
  @ApiParam({
    name: 'slug',
    description: 'Slug de la playlist, extension `.m3u` facultative',
    example: 'maison.m3u',
  })
  @ApiQuery({ name: 'token', required: false, description: 'Jeton de la playlist' })
  @ApiOperation({
    summary: 'Fichier M3U à coller dans la TV',
    description:
      'Exemples : `/api/v1/playlist/maison.m3u?token=…`, `/api/v1/playlist/france.m3u?token=…`, ' +
      '`/api/v1/playlist/cotedivoire.m3u?token=…`, `/api/v1/playlist/documentaires.m3u?token=…`, ' +
      '`/api/v1/playlist/favoris.m3u?token=…`.',
  })
  async render(
    @Param('slug') slug: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const clean = slug.replace(/\.(m3u8?|txt)$/i, '');
    const { playlist, body } = await this.playlists.renderM3u(clean, token);

    res
      .status(200)
      .set({
        'content-type': 'audio/x-mpegurl; charset=utf-8',
        'content-disposition': `inline; filename="${playlist.slug}.m3u"`,
        // Les lecteurs TV re-téléchargent souvent : on autorise un cache court.
        'cache-control': 'public, max-age=300',
      })
      .send(body);
  }
}

/**
 * Lien court, hors préfixe `api/v1` : `http://<serveur>:3000/t/ab12cd`.
 *
 * Raison d'être : ce lien se tape à la télécommande, caractère par caractère,
 * sur un pavé virtuel. On passe de 78 frappes à 32. Le code joue le rôle du
 * jeton — il est tiré au sort et rend l'URL tout aussi peu devinable.
 *
 * Le M3U est servi directement, sans redirection : tous les lecteurs TV ne
 * suivent pas les 302 de façon fiable.
 */
@ApiTags('playlists')
@Controller('t')
export class PlaylistShortLinkController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get(':code')
  @Public()
  @ApiProduces('audio/x-mpegurl')
  @ApiParam({ name: 'code', description: 'Code court de la playlist', example: 'ab12cd' })
  @ApiOperation({ summary: 'Fichier M3U via le lien court (à taper à la télécommande)' })
  async render(@Param('code') code: string, @Res() res: Response): Promise<void> {
    const playlist = await this.playlists.findByShortCode(code);
    const { body } = await this.playlists.renderM3u(playlist.slug, playlist.token);

    res
      .status(200)
      .set({
        'content-type': 'audio/x-mpegurl; charset=utf-8',
        'content-disposition': `inline; filename="${playlist.slug}.m3u"`,
        'cache-control': 'public, max-age=300',
      })
      .send(body);
  }
}
