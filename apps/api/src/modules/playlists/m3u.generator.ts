import { escapeM3uAttribute } from 'src/common/utils/text.util';
import { GROUP_ORDER } from 'src/curation/curation.config';

export interface M3uChannel {
  externalId: string;
  name: string;
  logo?: string | null;
  group: string;
  streamUrl: string;
  countryCode?: string | null;
  languageCode?: string | null;
  quality?: string | null;
  epgId?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  priorityRank?: number | null;
}

export interface M3uOptions {
  /** URL du guide XMLTV annoncée aux lecteurs (`url-tvg`). */
  epgUrl?: string;
  /** Nom de la playlist, écrit en commentaire d'en-tête. */
  name?: string;
  /** Ajoute `#EXTVLCOPT` pour les flux qui exigent un User-Agent/Referer. */
  includeVlcOptions?: boolean;
}

/**
 * Génère un fichier M3U étendu conforme à ce que lisent VLC, TiviMate,
 * OTT Navigator et les lecteurs Android TV / Apple TV.
 *
 * Points d'attention appris des lecteurs du marché :
 *  - `#EXTM3U` doit être la toute première ligne, sans BOM ;
 *  - la durée `-1` marque un direct (une valeur positive fait croire à un VOD) ;
 *  - `tvg-id` doit correspondre au `channel id` du XMLTV, sinon aucun EPG ;
 *  - les guillemets dans un attribut cassent le parsing → on les remplace ;
 *  - les lignes doivent être en `\n` (certains lecteurs Android buggent en CRLF).
 */
export function generateM3u(channels: M3uChannel[], options: M3uOptions = {}): string {
  const header = options.epgUrl
    ? `#EXTM3U url-tvg="${escapeM3uAttribute(options.epgUrl)}" x-tvg-url="${escapeM3uAttribute(options.epgUrl)}"`
    : '#EXTM3U';

  const lines: string[] = [header];
  if (options.name) {
    lines.push(`# ${options.name} — ${channels.length} chaînes`);
  }

  for (const channel of channels) {
    if (!channel.streamUrl) continue;

    const attributes: string[] = [
      `tvg-id="${escapeM3uAttribute(channel.epgId ?? channel.externalId)}"`,
      `tvg-name="${escapeM3uAttribute(channel.name)}"`,
    ];
    if (channel.logo) attributes.push(`tvg-logo="${escapeM3uAttribute(channel.logo)}"`);
    if (channel.countryCode) attributes.push(`tvg-country="${escapeM3uAttribute(channel.countryCode)}"`);
    if (channel.languageCode) attributes.push(`tvg-language="${escapeM3uAttribute(channel.languageCode)}"`);
    attributes.push(`group-title="${escapeM3uAttribute(channel.group)}"`);

    lines.push(`#EXTINF:-1 ${attributes.join(' ')},${escapeM3uAttribute(channel.name)}`);

    if (options.includeVlcOptions !== false) {
      if (channel.userAgent) lines.push(`#EXTVLCOPT:http-user-agent=${channel.userAgent}`);
      if (channel.referrer) lines.push(`#EXTVLCOPT:http-referrer=${channel.referrer}`);
    }

    lines.push(channel.streamUrl);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Ordre d'affichage dans la TV : mes chaînes curées d'abord (TF1 en 1),
 * puis les groupes dans l'ordre défini par la curation, puis l'alphabet.
 */
export function sortForPlaylist(channels: M3uChannel[]): M3uChannel[] {
  return [...channels].sort((a, b) => {
    const rankA = a.priorityRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.priorityRank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;

    const groupA = GROUP_ORDER[a.group] ?? 999;
    const groupB = GROUP_ORDER[b.group] ?? 999;
    if (groupA !== groupB) return groupA - groupB;

    if (a.group !== b.group) return a.group.localeCompare(b.group, 'fr');
    return a.name.localeCompare(b.name, 'fr');
  });
}

/** Applique un plafond par groupe (« pas plus de 30 chaînes par rubrique »). */
export function capPerGroup(channels: M3uChannel[], max?: number): M3uChannel[] {
  if (!max || max <= 0) return channels;
  const counts = new Map<string, number>();
  return channels.filter((channel) => {
    const count = counts.get(channel.group) ?? 0;
    if (count >= max) return false;
    counts.set(channel.group, count + 1);
    return true;
  });
}
