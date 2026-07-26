import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ImporterService } from '../modules/importer/importer.service';

/**
 * Import en ligne de commande : `npm run import:now`.
 * Pratique pour amorcer la base sans attendre le cron, ou pour rejouer un
 * import depuis un conteneur one-shot.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const importer = app.get(ImporterService);
    const { stats } = await importer.run('cli');
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('[import.cli] Failed:', error);
  process.exit(1);
});
