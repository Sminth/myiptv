import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { importConfig } from 'src/config/configuration';

// ─── Formes exactes de l'API publique https://iptv-org.github.io/api ──────────

export interface IptvOrgChannel {
  id: string;
  name: string;
  alt_names: string[];
  network: string | null;
  owners: string[];
  country: string;
  subdivision?: string | null;
  city?: string | null;
  categories: string[];
  is_nsfw: boolean;
  launched: string | null;
  closed: string | null;
  replaced_by: string | null;
  website: string | null;
}

export interface IptvOrgFeed {
  channel: string;
  id: string;
  name: string;
  alt_names: string[];
  is_main: boolean;
  broadcast_area: string[];
  timezones: string[];
  languages: string[];
  format: string | null;
}

export interface IptvOrgStream {
  channel: string | null;
  feed: string | null;
  title: string | null;
  url: string;
  quality: string | null;
  label: string | null;
  user_agent: string | null;
  referrer: string | null;
}

export interface IptvOrgLogo {
  channel: string;
  feed: string | null;
  in_use: boolean;
  tags: string[];
  width: number;
  height: number;
  format: string;
  url: string;
}

export interface IptvOrgCountry {
  name: string;
  code: string;
  languages: string[];
  flag: string;
}

export interface IptvOrgRegion {
  code: string;
  name: string;
  countries: string[];
}

export interface IptvOrgLanguage {
  code: string;
  name: string;
}

export interface IptvOrgCategory {
  id: string;
  name: string;
  description?: string;
}

export interface IptvOrgGuide {
  channel: string;
  feed: string | null;
  site: string;
  site_id: string;
  site_name: string;
  lang: string;
}

export interface IptvOrgBlocked {
  channel: string;
  reason: string;
  ref: string;
}

/**
 * Accès aux données publiques iptv-org.
 *
 * On consomme l'API JSON plutôt que les fichiers M3U : c'est la même source
 * (les playlists `countries/fr.m3u`, `languages/fra.m3u`… en sont générées),
 * mais normalisée — donc pas de parsing fragile ni de doublons entre les 4
 * découpages (pays / région / langue / catégorie).
 */
@Injectable()
export class IptvOrgClient {
  private readonly logger = new Logger(IptvOrgClient.name);

  constructor(
    private readonly http: HttpService,
    @Inject(importConfig.KEY) private readonly config: ConfigType<typeof importConfig>,
  ) {}

  private async fetchJson<T>(file: string): Promise<T[]> {
    const url = `${this.config.apiBaseUrl}/${file}.json`;
    const started = Date.now();
    const response = await firstValueFrom(
      this.http.get<T[]>(url, {
        timeout: this.config.httpTimeoutMs,
        headers: { accept: 'application/json' },
        // 40 000 chaînes + 44 000 feeds : on relève la limite par défaut d'axios.
        maxContentLength: 200 * 1024 * 1024,
        maxBodyLength: 200 * 1024 * 1024,
      }),
    );
    const data = Array.isArray(response.data) ? response.data : [];
    this.logger.log(`[IptvOrg] ${file}.json → ${data.length} rows in ${Date.now() - started}ms`);
    return data;
  }

  channels = () => this.fetchJson<IptvOrgChannel>('channels');
  feeds = () => this.fetchJson<IptvOrgFeed>('feeds');
  streams = () => this.fetchJson<IptvOrgStream>('streams');
  logos = () => this.fetchJson<IptvOrgLogo>('logos');
  countries = () => this.fetchJson<IptvOrgCountry>('countries');
  regions = () => this.fetchJson<IptvOrgRegion>('regions');
  languages = () => this.fetchJson<IptvOrgLanguage>('languages');
  categories = () => this.fetchJson<IptvOrgCategory>('categories');
  guides = () => this.fetchJson<IptvOrgGuide>('guides');
  blocklist = () => this.fetchJson<IptvOrgBlocked>('blocklist');

  /** Playlist M3U officielle (utilisée pour un import complémentaire ciblé). */
  async playlist(path: string): Promise<string> {
    const url = `${this.config.playlistBaseUrl}/${path.replace(/^\/+/, '')}`;
    const response = await firstValueFrom(
      this.http.get<string>(url, {
        timeout: this.config.httpTimeoutMs,
        responseType: 'text',
        transformResponse: (data: string) => data,
      }),
    );
    return response.data;
  }

  /** Guide XMLTV d'un pays / d'une source (ex. `fr.xml`). */
  async epgGuide(file: string): Promise<NodeJS.ReadableStream> {
    const url = `${this.config.epgBaseUrl}/${file.replace(/^\/+/, '')}`;
    const response = await firstValueFrom(
      this.http.get(url, { timeout: this.config.httpTimeoutMs, responseType: 'stream' }),
    );
    return response.data as NodeJS.ReadableStream;
  }
}
