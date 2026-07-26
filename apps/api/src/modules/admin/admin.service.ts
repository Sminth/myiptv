import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CurationService } from 'src/curation/curation.service';
import { ChannelsRepository } from '../channels/channels.repository';
import { ImporterService } from '../importer/importer.service';
import { PlaylistsService } from '../playlists/playlists.service';
import { ImportJobsService } from '../scheduler/import-jobs.service';
import { BestStreamService } from '../streams/best-stream.service';
import { StreamHealthService } from '../streams/stream-health.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsRepository,
    private readonly curation: CurationService,
    private readonly importer: ImporterService,
    private readonly health: StreamHealthService,
    private readonly bestStream: BestStreamService,
    private readonly playlists: PlaylistsService,
    private readonly jobs: ImportJobsService,
  ) {}

  /** Tout ce qu'affiche le tableau de bord en une requête. */
  async dashboard() {
    const [stats, curation, lastImport, queue, playlists, deadStreams] = await Promise.all([
      this.channels.stats(),
      this.curation.status(),
      this.prisma.importRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.jobs.stats(),
      this.playlists.findAll(),
      this.prisma.stream.count({ where: { isAlive: false, lastCheckedAt: { not: null } } }),
    ]);

    return {
      stats: { ...stats, deadStreams },
      importRunning: this.importer.isRunning(),
      lastImport,
      queue,
      playlists,
      curation: {
        resolved: curation.filter((c) => c.status === 'RESOLVED').length,
        missing: curation.filter((c) => c.status !== 'RESOLVED'),
        entries: curation,
      },
    };
  }

  /** Bouton « tester le flux » : teste toutes les URL connues de la chaîne. */
  async testChannel(idOrSlug: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }, { externalId: idOrSlug }] },
      include: { streams: true },
    });
    if (!channel) throw new NotFoundException(`Chaîne « ${idOrSlug} » introuvable`);

    const results = await Promise.all(
      channel.streams.map(async (stream) => ({
        streamId: stream.id,
        url: stream.url,
        quality: stream.quality,
        ...(await this.health.checkUrl(stream.url, stream.userAgent, stream.referrer)),
      })),
    );

    await Promise.all(
      results.map((result) =>
        this.prisma.stream.update({
          where: { id: result.streamId },
          data: result.ok
            ? { isAlive: true, failureCount: 0, lastCheckedAt: new Date(), lastOkAt: new Date(), latencyMs: result.latencyMs, lastError: null }
            : { isAlive: false, failureCount: { increment: 1 }, lastCheckedAt: new Date(), lastError: result.error?.slice(0, 500) },
        }),
      ),
    );
    await this.bestStream.refresh();

    return { channel: { id: channel.id, name: channel.name, slug: channel.slug }, results };
  }

  /** Purge des flux morts (bouton « supprimer les flux morts »). */
  async purgeDeadStreams(minFailures = 3) {
    const result = await this.prisma.stream.deleteMany({
      where: { isAlive: false, failureCount: { gte: minFailures } },
    });
    await this.bestStream.refresh();
    return { deleted: result.count };
  }

  applyCuration() {
    return this.curation.apply();
  }
}
