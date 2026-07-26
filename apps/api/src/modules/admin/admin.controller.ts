import { Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Public } from 'src/common/decorators/public.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Données du tableau de bord' })
  dashboard() {
    return this.admin.dashboard();
  }

  @Post('curation/apply')
  @ApiOperation({ summary: 'Réappliquer la curation (sans réimporter)' })
  applyCuration() {
    return this.admin.applyCuration();
  }

  @Post('channels/:idOrSlug/test')
  @ApiOperation({ summary: 'Tester les flux d’une chaîne' })
  testChannel(@Param('idOrSlug') idOrSlug: string) {
    return this.admin.testChannel(idOrSlug);
  }

  @Post('streams/purge-dead')
  @ApiOperation({ summary: 'Supprimer les flux morts' })
  purge(@Query('minFailures') minFailures?: string) {
    return this.admin.purgeDeadStreams(minFailures ? parseInt(minFailures, 10) : 3);
  }

  /**
   * Tableau de bord HTML autonome (aucun build, aucune dépendance CDN).
   * Il consomme l'API avec la clé saisie dans le champ prévu ; le front React
   * viendra le remplacer, mais on a déjà de quoi piloter le serveur.
   */
  @Get()
  @Public()
  @ApiExcludeEndpoint()
  @Header('content-type', 'text/html; charset=utf-8')
  page(): string {
    return readFileSync(join(__dirname, 'dashboard.html'), 'utf8');
  }
}
