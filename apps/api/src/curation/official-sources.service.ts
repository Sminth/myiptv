import { Injectable, Logger } from '@nestjs/common';
import { StreamKind } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { hashUrl } from 'src/common/utils/url-hash.util';
import { OFFICIAL_SOURCES, OfficialSourceSpec } from './official-sources';

export interface OfficialSourcesReport {
  applied: number;
  skipped: Array<{ wantedKey: string; reason: string }>;
}

/**
 * Rattache les flux publiés directement par les diffuseurs (voir
 * `official-sources.ts`) aux chaînes du catalogue.
 *
 * Rejoué après chaque import : si iptv-org finit par référencer le même flux,
 * l'`ON CONFLICT` sur le hash d'URL évite le doublon, et l'élection du meilleur
 * flux départage sur la qualité.
 */
@Injectable()
export class OfficialSourcesService {
  private readonly logger = new Logger(OfficialSourcesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async apply(specs: OfficialSourceSpec[] = OFFICIAL_SOURCES): Promise<OfficialSourcesReport> {
    const report: OfficialSourcesReport = { applied: 0, skipped: [] };

    for (const spec of specs) {
      const channel = await this.prisma.channel.findUnique({
        where: { externalId: spec.channelExternalId },
        select: { id: true, slug: true, isBlocked: true },
      });

      if (!channel) {
        report.skipped.push({
          wantedKey: spec.wantedKey,
          reason: `chaîne ${spec.channelExternalId} absente du catalogue`,
        });
        continue;
      }
      if (channel.isBlocked) {
        // Une chaîne blocklistée en amont le reste : la source officielle ne
        // doit pas servir de contournement.
        report.skipped.push({ wantedKey: spec.wantedKey, reason: 'chaîne bloquée en amont' });
        continue;
      }

      await this.prisma.stream.upsert({
        where: { urlHash: hashUrl(spec.url) },
        create: {
          channelId: channel.id,
          url: spec.url,
          urlHash: hashUrl(spec.url),
          kind: StreamKind[spec.kind],
          quality: spec.quality,
          userAgent: spec.userAgent,
          referrer: spec.referrer,
          title: `official:${spec.provider}`,
        },
        update: {
          channelId: channel.id,
          kind: StreamKind[spec.kind],
          quality: spec.quality,
          userAgent: spec.userAgent,
          referrer: spec.referrer,
          title: `official:${spec.provider}`,
        },
      });
      report.applied++;
    }

    this.logger.log(
      `[OfficialSources] ${report.applied} official streams attached` +
        (report.skipped.length ? `, ${report.skipped.length} skipped` : ''),
    );
    return report;
  }
}
