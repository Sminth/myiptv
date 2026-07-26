import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { appConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  // `/t/:code` reste à la racine : c'est le lien qu'on tape à la télécommande,
  // chaque caractère de préfixe en plus est un appui de plus.
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 't/:code', method: RequestMethod.GET }] });
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('IPTV Manager')
        .setDescription(
          'Gestionnaire IPTV personnel adossé aux sources publiques iptv-org. ' +
            'Usage privé : aucune source non autorisée n’est collectée ni recherchée.',
        )
        .setVersion('1.0')
        .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
    });
  }

  await app.listen(config.port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`[Bootstrap] API listening on ${config.publicUrl}/api/v1`);
  logger.log(`[Bootstrap] Swagger: ${config.publicUrl}/api/docs`);
  logger.log(`[Bootstrap] Dashboard: ${config.publicUrl}/api/v1/admin`);
}

void bootstrap();
