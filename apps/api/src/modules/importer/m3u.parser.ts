/**
 * Parseur M3U/M3U8 (format étendu #EXTM3U) minimal mais tolérant.
 *
 * Écrit à la main plutôt que via une dépendance : les playlists IPTV du monde
 * réel sont sales (attributs non quotés, retours \r\n, lignes `#EXTVLCOPT`,
 * commentaires libres) et les parseurs HLS génériques les rejettent.
 */

export interface ParsedM3uEntry {
  name: string;
  url: string;
  attributes: Record<string, string>;
  /** Options VLC/Kodi (`#EXTVLCOPT:http-user-agent=…`). */
  options: Record<string, string>;
  get tvgId(): string | undefined;
}

export interface ParsedM3u {
  /** Attributs de l'en-tête `#EXTM3U` (ex. `url-tvg`). */
  header: Record<string, string>;
  entries: ParsedM3uEntry[];
}

const ATTRIBUTE_RE = /([\w-]+)="([^"]*)"|([\w-]+)=([^\s,]+)/g;

function parseAttributes(input: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTRIBUTE_RE.lastIndex = 0;
  while ((match = ATTRIBUTE_RE.exec(input)) !== null) {
    const key = (match[1] ?? match[3])?.toLowerCase();
    const value = match[2] ?? match[4] ?? '';
    if (key) attributes[key] = value;
  }
  return attributes;
}

export function parseM3u(content: string): ParsedM3u {
  const lines = content.split(/\r?\n/);
  const result: ParsedM3u = { header: {}, entries: [] };

  let pending: { name: string; attributes: Record<string, string>; options: Record<string, string> } | null =
    null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTM3U')) {
      result.header = parseAttributes(line.slice('#EXTM3U'.length));
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const payload = line.slice('#EXTINF:'.length);
      // `-1 tvg-id="X" group-title="Y",Nom de la chaîne`
      const commaIndex = payload.lastIndexOf(',');
      const meta = commaIndex >= 0 ? payload.slice(0, commaIndex) : payload;
      const name = commaIndex >= 0 ? payload.slice(commaIndex + 1).trim() : '';
      pending = { name, attributes: parseAttributes(meta), options: {} };
      continue;
    }

    if (line.startsWith('#EXTVLCOPT:')) {
      const [key, ...rest] = line.slice('#EXTVLCOPT:'.length).split('=');
      if (pending && key) pending.options[key.trim().toLowerCase()] = rest.join('=').trim();
      continue;
    }

    if (line.startsWith('#')) continue; // autre directive / commentaire

    if (pending) {
      result.entries.push(makeEntry(pending.name, line, pending.attributes, pending.options));
      pending = null;
    }
  }

  return result;
}

function makeEntry(
  name: string,
  url: string,
  attributes: Record<string, string>,
  options: Record<string, string>,
): ParsedM3uEntry {
  return {
    name: name || attributes['tvg-name'] || attributes['tvg-id'] || url,
    url,
    attributes,
    options,
    get tvgId() {
      return attributes['tvg-id'] || undefined;
    },
  };
}
