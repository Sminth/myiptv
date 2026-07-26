import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfig } from 'src/config/configuration';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Cache applicatif. Objectif : ne jamais re-générer un M3U ni re-parser un
 * référentiel à chaque requête TV (les lecteurs rafraîchissent souvent).
 *
 * Le cache est *best effort* : toute panne Redis est loguée et dégrade vers la
 * source de vérité (PostgreSQL) au lieu de faire tomber la requête.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(redisConfig.KEY) private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`[Cache] get failed for ${key}: ${(error as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds ?? this.config.ttl);
    } catch (error) {
      this.logger.warn(`[Cache] set failed for ${key}: ${(error as Error).message}`);
    }
  }

  /** Récupère depuis le cache, sinon calcule et mémorise. */
  async wrap<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn(`[Cache] del failed: ${(error as Error).message}`);
    }
  }

  /**
   * Invalide par motif. Utilise SCAN (jamais KEYS) pour ne pas bloquer Redis
   * quand le cache contient des dizaines de milliers d'entrées.
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;
    const fullPattern = `${this.config.keyPrefix}${pattern}`;
    try {
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 500);
        cursor = next;
        if (keys.length > 0) {
          // SCAN renvoie les clés telles qu'elles sont stockées, préfixe
          // compris, alors qu'`unlink()` passe par ioredis qui rajoute
          // `keyPrefix`. Sans ce retrait on supprimait « iptv:iptv:… » —
          // c'est-à-dire rien : le cache survivait à chaque import et la TV
          // pouvait recevoir une playlist périmée pendant tout le TTL.
          const withoutPrefix = keys.map((key) =>
            key.startsWith(this.config.keyPrefix) ? key.slice(this.config.keyPrefix.length) : key,
          );
          deleted += await this.redis.unlink(...withoutPrefix);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(`[Cache] delByPattern(${pattern}) failed: ${(error as Error).message}`);
    }
    return deleted;
  }

  /** Invalide tout ce qui dépend du catalogue de chaînes (import, admin…). */
  async invalidateCatalog(): Promise<void> {
    const deleted =
      (await this.delByPattern('channels:*')) +
      (await this.delByPattern('playlist:*')) +
      (await this.delByPattern('ref:*')) +
      (await this.delByPattern('stats:*'));
    this.logger.log(`[Cache] Catalog invalidated (${deleted} keys)`);
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
