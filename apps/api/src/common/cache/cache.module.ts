import { Global, Logger, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig } from 'src/config/configuration';
import { CacheService, REDIS_CLIENT } from './cache.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [redisConfig.KEY],
      useFactory: (config: ConfigType<typeof redisConfig>) => {
        const logger = new Logger('Redis');
        const client = new Redis({
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
          keyPrefix: config.keyPrefix,
          maxRetriesPerRequest: 2,
          lazyConnect: false,
          retryStrategy: (times) => Math.min(times * 500, 5000),
        });
        client.on('error', (error: Error) => logger.warn(`[Redis] ${error.message}`));
        client.on('connect', () => logger.log(`[Redis] Connected to ${config.host}:${config.port}`));
        return client;
      },
    },
    CacheService,
  ],
  exports: [CacheService, REDIS_CLIENT],
})
export class CacheModule {}
