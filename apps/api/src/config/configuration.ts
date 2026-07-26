import { registerAs } from '@nestjs/config';

/**
 * Toute la configuration passe par des variables d'environnement (12-factor).
 * Aucune valeur secrète n'est committée : voir `.env.example`.
 */
export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  /** URL publique du serveur, utilisée pour composer les liens M3U/EPG de la TV. */
  publicUrl: (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`).replace(
    /\/+$/,
    '',
  ),
  /** Clé d'administration (header `x-api-key`). Vide = garde désactivée (dev only). */
  adminApiKey: process.env.ADMIN_API_KEY ?? '',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  swaggerEnabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
  /** TTL par défaut du cache applicatif, en secondes. */
  ttl: parseInt(process.env.CACHE_TTL ?? '900', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'iptv:',
}));

export const importConfig = registerAs('import', () => ({
  /** Base de l'API JSON iptv-org (générée depuis iptv-org/database). */
  apiBaseUrl: process.env.IPTV_ORG_API_URL ?? 'https://iptv-org.github.io/api',
  /** Base des playlists M3U iptv-org (import complémentaire / vérification). */
  playlistBaseUrl: process.env.IPTV_ORG_PLAYLIST_URL ?? 'https://iptv-org.github.io/iptv',
  /** Base des guides XMLTV (instance iptv-org/epg auto-hébergée, cf. README). */
  epgBaseUrl: process.env.IPTV_ORG_EPG_URL ?? 'https://iptv-org.github.io/epg/guides',
  /**
   * Sources XMLTV à fusionner pour l'EPG, séparées par des virgules.
   * iptv-org ne publie plus de guides prêts à l'emploi : il faut soit héberger
   * iptv-org/epg (`npm run grab --- --site=…`), soit pointer une source XMLTV
   * publique que tu es autorisé à consommer. Vide = EPG réduit aux <channel>.
   */
  epgSources: (process.env.EPG_SOURCES ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  /** Durée de mise en cache du XMLTV fusionné (secondes). */
  epgTtl: parseInt(process.env.EPG_TTL ?? '21600', 10),
  /** Cron de l'import complet (par défaut : toutes les nuits à 3h). */
  cron: process.env.IMPORT_CRON ?? '0 3 * * *',
  /** Cron de la vérification des flux (par défaut : toutes les 6 heures). */
  healthCron: process.env.HEALTH_CRON ?? '0 */6 * * *',
  /** Lancer un import au démarrage si la base est vide. */
  runOnBoot: (process.env.IMPORT_ON_BOOT ?? 'true') === 'true',
  /** N'importer que ces pays (codes ISO séparés par des virgules). Vide = tous. */
  countries: (process.env.IMPORT_COUNTRIES ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean),
  /** Idem pour les langues (ISO 639-3). */
  languages: (process.env.IMPORT_LANGUAGES ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean),
  /** Exclure les chaînes marquées NSFW dans iptv-org. */
  excludeNsfw: (process.env.IMPORT_EXCLUDE_NSFW ?? 'true') === 'true',
  httpTimeoutMs: parseInt(process.env.HTTP_TIMEOUT_MS ?? '60000', 10),
}));

export const healthCheckConfig = registerAs('healthCheck', () => ({
  /** Nombre de flux testés en parallèle. */
  concurrency: parseInt(process.env.HEALTH_CONCURRENCY ?? '20', 10),
  timeoutMs: parseInt(process.env.HEALTH_TIMEOUT_MS ?? '8000', 10),
  /** Échecs consécutifs avant de considérer un flux comme mort. */
  maxFailures: parseInt(process.env.HEALTH_MAX_FAILURES ?? '3', 10),
  /** Supprimer les flux morts au-delà de ce nombre d'échecs (0 = ne jamais supprimer). */
  deleteAfterFailures: parseInt(process.env.HEALTH_DELETE_AFTER_FAILURES ?? '10', 10),
  userAgent:
    process.env.HEALTH_USER_AGENT ??
    'VLC/3.0.20 LibVLC/3.0.20',
}));

export const configurations = [appConfig, redisConfig, importConfig, healthCheckConfig];
