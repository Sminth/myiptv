import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ImportStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashUrl } from 'src/common/utils/url-hash.util';
import { CacheService } from 'src/common/cache/cache.service';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { normalizeText, uniqueSlug } from 'src/common/utils/text.util';
import { importConfig } from 'src/config/configuration';
import { CurationService } from 'src/curation/curation.service';
import { OfficialSourcesService } from 'src/curation/official-sources.service';
import { BestStreamService } from '../streams/best-stream.service';
import { IptvOrgClient, IptvOrgFeed, IptvOrgLogo } from './iptv-org.client';

export interface ImportStats {
  countries: number;
  regions: number;
  languages: number;
  categories: number;
  channels: number;
  channelsDeleted: number;
  streams: number;
  streamsDeleted: number;
  guides: number;
  logos: number;
  blocked: number;
  officialSources: number;
  curation?: unknown;
}

/** Taille des lots envoyés à PostgreSQL (compromis mémoire / nombre d'A-R). */
const CHUNK = 2000;

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Déduplique sur la clé de conflit AVANT d'envoyer le lot.
 *
 * PostgreSQL refuse un `ON CONFLICT DO UPDATE` dont le même lot contient deux
 * fois la même clé (« cannot affect row a second time »), et les données
 * amont en contiennent : une même URL de flux est parfois déclarée pour deux
 * feeds d'une chaîne.
 */
function dedupeBy<T>(rows: T[], key: (row: T) => string): { rows: T[]; duplicates: number } {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    if (!seen.has(k)) seen.set(k, row);
  }
  return { rows: Array.from(seen.values()), duplicates: rows.length - seen.size };
}

/**
 * Import complet du catalogue public iptv-org.
 *
 * Choix de conception : tout passe par des `INSERT … SELECT jsonb_to_recordset
 * … ON CONFLICT DO UPDATE`. Un `prisma.upsert()` par chaîne, c'est 40 000
 * allers-retours (plusieurs minutes) ; ici l'import complet tient en quelques
 * dizaines de requêtes.
 *
 * Les champs pilotés par l'utilisateur (custom_name, custom_logo, custom_group,
 * is_disabled, favoris, playlists) ne sont JAMAIS écrasés par un import.
 */
@Injectable()
export class ImporterService {
  private readonly logger = new Logger(ImporterService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: IptvOrgClient,
    private readonly curation: CurationService,
    private readonly officialSources: OfficialSourcesService,
    private readonly bestStream: BestStreamService,
    private readonly cache: CacheService,
    @Inject(importConfig.KEY) private readonly config: ConfigType<typeof importConfig>,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  /**
   * @param trigger `scheduler` | `manual` | `boot` — tracé dans import_runs pour
   * savoir *pourquoi* un import a tourné quand on relit les logs.
   */
  async run(trigger = 'manual'): Promise<{ runId: string; stats: ImportStats }> {
    if (this.running) {
      throw new Error('Un import est déjà en cours');
    }
    this.running = true;

    const run = await this.prisma.importRun.create({
      data: { source: 'iptv-org', status: ImportStatus.RUNNING, trigger },
    });
    const startedAt = Date.now();
    this.logger.log(`[Importer] Import started (trigger=${trigger}, run=${run.id})`);

    try {
      const stats = await this.doImport();
      const durationMs = Date.now() - startedAt;
      await this.prisma.importRun.update({
        where: { id: run.id },
        data: {
          status: ImportStatus.SUCCESS,
          finishedAt: new Date(),
          durationMs,
          stats: stats as unknown as object,
        },
      });
      await this.cache.invalidateCatalog();
      this.logger.log(
        `[Importer] Import finished in ${Math.round(durationMs / 1000)}s — ` +
          `${stats.channels} channels, ${stats.streams} streams`,
      );
      return { runId: run.id, stats };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Importer] Import failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.prisma.importRun.update({
        where: { id: run.id },
        data: {
          status: ImportStatus.FAILED,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt,
          error: message.slice(0, 2000),
        },
      });
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async doImport(): Promise<ImportStats> {
    // 1. Référentiels d'abord : les chaînes ont des FK vers pays et langues.
    const [countries, regions, languages, categories] = await Promise.all([
      this.client.countries(),
      this.client.regions(),
      this.client.languages(),
      this.client.categories(),
    ]);

    await this.upsertCountries(countries);
    await this.upsertRegions(regions);
    await this.upsertLanguages(languages);
    await this.upsertCategories(categories);

    // 2. Catalogue.
    const [rawChannels, feeds, streams, logos, guides, blocklist] = await Promise.all([
      this.client.channels(),
      this.client.feeds(),
      this.client.streams(),
      this.client.logos(),
      this.client.guides(),
      this.client.blocklist(),
    ]);

    const knownCountries = new Set(countries.map((c) => c.code));
    const knownLanguages = new Set(languages.map((l) => l.code));
    const blocked = new Map(blocklist.map((b) => [b.channel, b.reason] as const));
    const mainFeedByChannel = this.indexMainFeeds(feeds);
    const logoByChannel = this.indexLogos(logos);
    const regionsByCountry = this.indexRegions(regions);

    // Filtres facultatifs (IMPORT_COUNTRIES / IMPORT_LANGUAGES) : permettent de
    // n'ingérer que la francophonie si on ne veut pas des 40 000 chaînes.
    const wantCountry = (code: string) =>
      this.config.countries.length === 0 || this.config.countries.includes(code);
    const wantLanguage = (code: string | null) =>
      this.config.languages.length === 0 || (code !== null && this.config.languages.includes(code));

    const existingSlugs = new Set(
      (await this.prisma.channel.findMany({ select: { slug: true } })).map((c) => c.slug),
    );

    const channelRows: Record<string, unknown>[] = [];
    for (const channel of rawChannels) {
      if (this.config.excludeNsfw && channel.is_nsfw) continue;
      if (!wantCountry(channel.country)) continue;

      const feed = mainFeedByChannel.get(channel.id);
      const languageCode = feed?.languages?.[0] ?? null;
      if (!wantLanguage(languageCode)) continue;

      const countryCode = knownCountries.has(channel.country) ? channel.country : null;
      const blockReason = blocked.get(channel.id) ?? null;

      channelRows.push({
        id: randomUUID(),
        external_id: channel.id,
        name: channel.name,
        slug: uniqueSlug(channel.name, existingSlugs, channel.country),
        alt_names: channel.alt_names ?? [],
        network: channel.network,
        website: channel.website,
        logo: logoByChannel.get(channel.id) ?? null,
        country_code: countryCode,
        language_code: languageCode && knownLanguages.has(languageCode) ? languageCode : null,
        category: channel.categories?.[0] ?? null,
        categories: channel.categories ?? [],
        regions: countryCode ? (regionsByCountry.get(countryCode) ?? []) : [],
        is_nsfw: channel.is_nsfw,
        is_blocked: blockReason !== null,
        block_reason: blockReason,
        closed_at: channel.closed,
        epg_id: channel.id,
        search_text: normalizeText([channel.name, ...(channel.alt_names ?? [])].join(' ')),
      });
    }

    const importStartedAt = new Date();
    const channels = dedupeBy(channelRows, (row) => row.external_id as string);
    for (const chunk of chunked(channels.rows)) await this.upsertChannels(chunk);
    this.logger.log(
      `[Importer] ${channels.rows.length} channels upserted` +
        (channels.duplicates ? ` (${channels.duplicates} duplicates skipped)` : ''),
    );

    // 3. Flux — seuls ceux rattachés à une chaîne connue sont exploitables.
    const streamRows = streams
      .filter((s) => s.channel && s.url)
      .map((s) => ({
        id: randomUUID(),
        external_channel: s.channel as string,
        url: s.url,
        url_hash: hashUrl(s.url),
        feed: s.feed,
        title: s.title,
        quality: s.quality,
        user_agent: s.user_agent,
        referrer: s.referrer,
      }));
    const uniqueStreams = dedupeBy(streamRows, (row) => row.url_hash);
    if (uniqueStreams.duplicates > 0) {
      this.logger.log(`[Importer] ${uniqueStreams.duplicates} duplicate stream URLs skipped`);
    }
    for (const chunk of chunked(uniqueStreams.rows)) await this.upsertStreams(chunk);

    // Flux publiés directement par les diffuseurs, pas encore référencés en
    // amont. Appliqués ici pour que leur `updated_at` soit frais : sinon le
    // nettoyage des flux obsolètes, quelques lignes plus bas, les supprimerait.
    const official = await this.officialSources.apply();

    // 4. Correspondances EPG.
    const guideRows = guides.map((g) => ({
      id: randomUUID(),
      external_channel: g.channel,
      feed: g.feed,
      site: g.site,
      site_id: g.site_id,
      lang: g.lang,
    }));
    const uniqueGuides = dedupeBy(
      guideRows,
      (row) => `${row.external_channel}|${row.site}|${row.site_id}|${row.lang}`,
    );
    for (const chunk of chunked(uniqueGuides.rows)) await this.upsertGuides(chunk);

    // 5. Nettoyage : ce qui a disparu de la source disparaît d'ici.
    const channelsDeleted = await this.deleteStale(importStartedAt);
    const streamsDeleted = await this.deleteStaleStreams(importStartedAt);

    // 6. Meilleur flux par chaîne + drapeaux dérivés.
    await this.bestStream.refresh();

    // 7. Curation : « mes » chaînes remontent en tête.
    const curationReport = await this.curation.apply();

    return {
      countries: countries.length,
      regions: regions.length,
      languages: languages.length,
      categories: categories.length,
      channels: channels.rows.length,
      channelsDeleted,
      streams: uniqueStreams.rows.length,
      streamsDeleted,
      guides: uniqueGuides.rows.length,
      logos: logoByChannel.size,
      blocked: blocked.size,
      officialSources: official.applied,
      curation: curationReport,
    };
  }

  // ─── Index en mémoire ──────────────────────────────────────────────────────

  private indexMainFeeds(feeds: IptvOrgFeed[]): Map<string, IptvOrgFeed> {
    const map = new Map<string, IptvOrgFeed>();
    for (const feed of feeds) {
      const current = map.get(feed.channel);
      if (!current || (feed.is_main && !current.is_main)) map.set(feed.channel, feed);
    }
    return map;
  }

  /** Un logo par chaîne : celui marqué `in_use`, le plus grand à égalité. */
  private indexLogos(logos: IptvOrgLogo[]): Map<string, string> {
    const best = new Map<string, IptvOrgLogo>();
    for (const logo of logos) {
      if (!logo.channel || !logo.url) continue;
      const current = best.get(logo.channel);
      if (!current) {
        best.set(logo.channel, logo);
        continue;
      }
      const better =
        (logo.in_use ? 1 : 0) - (current.in_use ? 1 : 0) ||
        (logo.feed === null ? 1 : 0) - (current.feed === null ? 1 : 0) ||
        (logo.width ?? 0) - (current.width ?? 0);
      if (better > 0) best.set(logo.channel, logo);
    }
    return new Map(Array.from(best, ([channel, logo]) => [channel, logo.url] as const));
  }

  private indexRegions(regions: { code: string; countries: string[] }[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const region of regions) {
      for (const country of region.countries) {
        const list = map.get(country) ?? [];
        list.push(region.code);
        map.set(country, list);
      }
    }
    return map;
  }

  // ─── Écritures SQL en lot ──────────────────────────────────────────────────

  private json(rows: unknown[]): string {
    return JSON.stringify(rows);
  }

  private async upsertCountries(rows: { code: string; name: string; flag: string; languages: string[] }[]) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO countries (id, code, name, flag, languages, created_at, updated_at)
       SELECT x.id, x.code, x.name, x.flag,
              COALESCE(ARRAY(SELECT jsonb_array_elements_text(x.languages)), '{}'), now(), now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, code text, name text, flag text, languages jsonb)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, flag = EXCLUDED.flag, languages = EXCLUDED.languages, updated_at = now()`,
      this.json(rows.map((r) => ({ id: randomUUID(), ...r }))),
    );
  }

  private async upsertRegions(rows: { code: string; name: string; countries: string[] }[]) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO regions (id, code, name, countries, created_at, updated_at)
       SELECT x.id, x.code, x.name,
              COALESCE(ARRAY(SELECT jsonb_array_elements_text(x.countries)), '{}'), now(), now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, code text, name text, countries jsonb)
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, countries = EXCLUDED.countries, updated_at = now()`,
      this.json(rows.map((r) => ({ id: randomUUID(), ...r }))),
    );
  }

  private async upsertLanguages(rows: { code: string; name: string }[]) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO languages (id, code, name, created_at, updated_at)
       SELECT x.id, x.code, x.name, now(), now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, code text, name text)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      this.json(rows.map((r) => ({ id: randomUUID(), code: r.code, name: r.name }))),
    );
  }

  private async upsertCategories(rows: { id: string; name: string; description?: string }[]) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO categories (id, slug, name, description, created_at, updated_at)
       SELECT x.pk, x.slug, x.name, x.description, now(), now()
       FROM jsonb_to_recordset($1::jsonb) AS x(pk text, slug text, name text, description text)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()`,
      this.json(
        rows.map((r) => ({
          pk: randomUUID(),
          slug: r.id,
          name: r.name,
          description: r.description ?? null,
        })),
      ),
    );
  }

  private async upsertChannels(rows: Record<string, unknown>[]) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO channels (
         id, external_id, name, slug, alt_names, network, website, logo,
         country_code, language_code, category, categories, regions,
         is_nsfw, is_blocked, block_reason, closed_at, epg_id, search_text,
         created_at, updated_at)
       SELECT x.id, x.external_id, x.name, x.slug,
              COALESCE(ARRAY(SELECT jsonb_array_elements_text(x.alt_names)), '{}'),
              x.network, x.website, x.logo, x.country_code, x.language_code, x.category,
              COALESCE(ARRAY(SELECT jsonb_array_elements_text(x.categories)), '{}'),
              COALESCE(ARRAY(SELECT jsonb_array_elements_text(x.regions)), '{}'),
              x.is_nsfw, x.is_blocked, x.block_reason, x.closed_at, x.epg_id, x.search_text,
              now(), now()
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, external_id text, name text, slug text, alt_names jsonb, network text,
         website text, logo text, country_code text, language_code text, category text,
         categories jsonb, regions jsonb, is_nsfw boolean, is_blocked boolean,
         block_reason text, closed_at text, epg_id text, search_text text)
       ON CONFLICT (external_id) DO UPDATE SET
         name = EXCLUDED.name,
         alt_names = EXCLUDED.alt_names,
         network = EXCLUDED.network,
         website = EXCLUDED.website,
         logo = EXCLUDED.logo,
         country_code = EXCLUDED.country_code,
         language_code = EXCLUDED.language_code,
         category = EXCLUDED.category,
         categories = EXCLUDED.categories,
         regions = EXCLUDED.regions,
         is_nsfw = EXCLUDED.is_nsfw,
         is_blocked = EXCLUDED.is_blocked,
         block_reason = EXCLUDED.block_reason,
         closed_at = EXCLUDED.closed_at,
         epg_id = EXCLUDED.epg_id,
         search_text = EXCLUDED.search_text,
         updated_at = now()`,
      this.json(rows),
    );
  }

  private async upsertStreams(rows: Record<string, unknown>[]) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO streams (id, channel_id, url, url_hash, feed, title, quality, user_agent, referrer, created_at, updated_at)
       SELECT x.id, c.id, x.url, x.url_hash, x.feed, x.title, x.quality, x.user_agent, x.referrer, now(), now()
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, external_channel text, url text, url_hash text, feed text, title text,
         quality text, user_agent text, referrer text)
       JOIN channels c ON c.external_id = x.external_channel
       ON CONFLICT (url_hash) DO UPDATE SET
         url = EXCLUDED.url,
         channel_id = EXCLUDED.channel_id,
         feed = EXCLUDED.feed,
         title = EXCLUDED.title,
         quality = EXCLUDED.quality,
         user_agent = EXCLUDED.user_agent,
         referrer = EXCLUDED.referrer,
         updated_at = now()`,
      this.json(rows),
    );
  }

  private async upsertGuides(rows: Record<string, unknown>[]) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO guides (id, channel_id, external_channel, feed, site, site_id, lang, created_at)
       SELECT x.id, c.id, x.external_channel, x.feed, x.site, x.site_id, x.lang, now()
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id text, external_channel text, feed text, site text, site_id text, lang text)
       JOIN channels c ON c.external_id = x.external_channel
       ON CONFLICT (external_channel, site, site_id, lang) DO UPDATE
         SET channel_id = EXCLUDED.channel_id, feed = EXCLUDED.feed`,
      this.json(rows),
    );
  }

  /**
   * Une ligne non touchée par cet import n'existe plus en amont : elle est
   * supprimée. Les entrées créées à la main (`manual:*`) sont préservées.
   */
  private async deleteStale(since: Date): Promise<number> {
    const result = await this.prisma.channel.deleteMany({
      where: { updatedAt: { lt: since }, externalId: { not: { startsWith: 'manual:' } } },
    });
    if (result.count > 0) this.logger.log(`[Importer] ${result.count} stale channels deleted`);
    return result.count;
  }

  private async deleteStaleStreams(since: Date): Promise<number> {
    const result = await this.prisma.stream.deleteMany({
      where: { updatedAt: { lt: since }, url: { not: { startsWith: 'manual:' } } },
    });
    if (result.count > 0) this.logger.log(`[Importer] ${result.count} stale streams deleted`);
    return result.count;
  }
}
