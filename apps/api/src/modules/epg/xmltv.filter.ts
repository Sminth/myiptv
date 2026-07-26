import { Logger } from '@nestjs/common';
import * as sax from 'sax';

export interface XmltvFilterResult {
  xml: string;
  channels: number;
  programmes: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serializeOpenTag(name: string, attributes: Record<string, string>, selfClosing = false): string {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');
  return `<${name}${attrs}${selfClosing ? '/' : ''}>`;
}

/**
 * Filtre un flux XMLTV pour ne garder que les chaînes demandées.
 *
 * Pourquoi filtrer plutôt que servir la source telle quelle : un guide national
 * complet pèse 50–200 Mo et contient des milliers de chaînes. Une box Android TV
 * met plusieurs minutes à l'ingérer — et 99 % ne correspond à aucune ligne de la
 * playlist. On lit donc en streaming (mémoire constante) et on ne réémet que les
 * `<channel>` / `<programme>` dont l'id est dans la playlist.
 */
export class XmltvFilter {
  private static readonly logger = new Logger(XmltvFilter.name);

  static async filterStream(
    input: NodeJS.ReadableStream,
    allowedIds: Set<string>,
  ): Promise<XmltvFilterResult> {
    const parser = sax.createStream(true, { trim: false, position: false });

    const parts: string[] = [];
    let channels = 0;
    let programmes = 0;

    /** Profondeur relative au bloc capturé (0 = on ne capture pas). */
    let capturing = 0;
    let buffer: string[] = [];
    let currentKind: 'channel' | 'programme' | null = null;

    parser.on('opentag', (node) => {
      const name = node.name;
      const attributes = node.attributes as Record<string, string>;

      if (capturing === 0) {
        if (name === 'channel' || name === 'programme') {
          const id = name === 'channel' ? attributes.id : attributes.channel;
          if (id && allowedIds.has(id)) {
            capturing = 1;
            currentKind = name;
            buffer = [serializeOpenTag(name, attributes)];
          }
        }
        return;
      }

      capturing++;
      buffer.push(serializeOpenTag(name, attributes));
    });

    parser.on('text', (text) => {
      if (capturing > 0 && text) buffer.push(escapeXml(text));
    });

    parser.on('cdata', (text) => {
      if (capturing > 0 && text) buffer.push(`<![CDATA[${text}]]>`);
    });

    parser.on('closetag', (name) => {
      if (capturing === 0) return;

      buffer.push(`</${name}>`);
      capturing--;

      if (capturing === 0) {
        parts.push(buffer.join(''));
        if (currentKind === 'channel') channels++;
        else programmes++;
        buffer = [];
        currentKind = null;
      }
    });

    await new Promise<void>((resolve, reject) => {
      parser.on('error', (error: Error) => {
        // Un guide tronqué ne doit pas priver la TV de tout l'EPG : on garde
        // ce qui a été lu et on reprend le parseur.
        XmltvFilter.logger.warn(`[EPG] XMLTV parse error (partial guide kept): ${error.message}`);
        (parser as unknown as { _parser: { error: Error | null; resume: () => void } })._parser.error =
          null;
        (parser as unknown as { _parser: { resume: () => void } })._parser.resume();
      });
      parser.on('end', () => resolve());
      input.on('error', reject);
      input.pipe(parser);
    });

    return { xml: parts.join('\n'), channels, programmes };
  }

  /** Enveloppe XMLTV complète autour des blocs conservés. */
  static wrap(body: string, generatorName = 'iptv-manager'): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
      `<tv generator-info-name="${escapeXml(generatorName)}">`,
      body,
      '</tv>',
      '',
    ].join('\n');
  }

  /** Bloc `<channel>` minimal quand aucune source XMLTV n'est configurée. */
  static channelStub(id: string, name: string, logo?: string | null): string {
    return [
      `  <channel id="${escapeXml(id)}">`,
      `    <display-name>${escapeXml(name)}</display-name>`,
      ...(logo ? [`    <icon src="${escapeXml(logo)}"/>`] : []),
      '  </channel>',
    ].join('\n');
  }
}
