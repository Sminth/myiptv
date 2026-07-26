import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { CacheModule } from './common/cache/cache.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { appConfig, configurations, redisConfig } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CurationModule } from './curation/curation.module';
import { AdminModule } from './modules/admin/admin.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { CountriesModule } from './modules/countries/countries.module';
import { EpgModule } from './modules/epg/epg.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { HealthModule } from './modules/health/health.module';
import { ImporterModule } from './modules/importer/importer.module';
import { LanguagesModule } from './modules/languages/languages.module';
import { PlaylistsModule } from './modules/playlists/playlists.module';
import { RegionsModule } from './modules/regions/regions.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { StreamsModule } from './modules/streams/streams.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configurations,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),

    LoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (config: ConfigType<typeof appConfig>) => ({
        pinoHttp: {
          level: config.logLevel,
          // Logs lisibles en dev, JSON structuré en production (pour un
          // collecteur type Loki/Datadog).
          transport:
            config.env === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
              : undefined,
          autoLogging: { ignore: (req) => req.url?.startsWith('/api/v1/health') ?? false },
          redact: ['req.headers["x-api-key"]', 'req.query.token', 'req.query.api_key'],
        },
      }),
    }),

    BullModule.forRootAsync({
      inject: [redisConfig.KEY],
      useFactory: (config: ConfigType<typeof redisConfig>) => ({
        connection: {
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
        },
        prefix: `${config.keyPrefix}bull`,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      }),
    }),

    PrismaModule,
    CacheModule,
    CurationModule,

    ChannelsModule,
    CountriesModule,
    RegionsModule,
    LanguagesModule,
    CategoriesModule,
    FavoritesModule,
    PlaylistsModule,
    EpgModule,
    StreamsModule,
    ImporterModule,
    SchedulerModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
