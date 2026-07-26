import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { appConfig, importConfig } from 'src/config/configuration';
import { CurationService } from 'src/curation/curation.service';
import { PlaylistsService } from '../playlists/playlists.service';
import { ImportJobsService } from './import-jobs.service';

/**
 * Premier démarrage : créer les playlists par défaut, enregistrer la liste de
 * curation, et lancer un import si la base est vide — pour qu'un
 * `docker compose up` suffise à obtenir un lien à coller dans la TV.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly playlists: PlaylistsService,
    private readonly curation: CurationService,
    private readonly jobs: ImportJobsService,
    @Inject(importConfig.KEY) private readonly config: ConfigType<typeof importConfig>,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.curation.syncSpecs();
      await this.playlists.seedDefaults();

      const channelCount = await this.prisma.channel.count();
      if (channelCount === 0 && this.config.runOnBoot) {
        this.logger.log('[Bootstrap] Empty catalog — queuing first import');
        await this.jobs.enqueueImport('boot');
      }

      // Les playlists créées avant l'ajout du lien court en reçoivent un ici.
      await this.playlists.backfillShortCodes();

      const home = await this.prisma.playlist.findUnique({ where: { slug: 'maison' } });
      if (home) {
        this.logger.log(
          `[Bootstrap] TV link → ${this.app.publicUrl}/t/${home.shortCode} ` +
            `(complet : ${this.app.publicUrl}/api/v1/playlist/maison.m3u?token=${home.token})`,
        );
      }
    } catch (error) {
      // Une base non migrée ne doit pas empêcher l'API de répondre /health.
      this.logger.error(
        `[Bootstrap] Initialization skipped: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
