import { Injectable, Logger } from '@nestjs/common';
import { WantedStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { normalizeText } from 'src/common/utils/text.util';
import { WANTED_CHANNELS, WantedChannelSpec } from './curation.config';

export interface CurationReport {
  total: number;
  resolved: number;
  noPublicStream: number;
  notFound: number;
  /** Détail des entrées non satisfaites, pour affichage dans le dashboard. */
  missing: Array<{ key: string; label: string; group: string; status: WantedStatus }>;
}

/**
 * Applique la liste de curation au catalogue importé : c'est ce qui transforme
 * 20 000 chaînes publiques en « mes chaînes », en tête de playlist.
 *
 * Idempotent : rejouable après chaque import sans effet de bord.
 */
@Injectable()
export class CurationService {
  private readonly logger = new Logger(CurationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Réécrit la table `wanted_channels` à partir du fichier de configuration. */
  async syncSpecs(specs: WantedChannelSpec[] = WANTED_CHANNELS): Promise<void> {
    const keys = specs.map((s) => s.key);

    for (const spec of specs) {
      await this.prisma.wantedChannel.upsert({
        where: { key: spec.key },
        create: {
          key: spec.key,
          label: spec.label,
          group: spec.group,
          rank: spec.rank,
          matchIds: spec.matchIds ?? [],
          matchNames: spec.matchNames ?? [],
          countryCode: spec.countryCode ?? null,
          note: spec.note ?? null,
        },
        update: {
          label: spec.label,
          group: spec.group,
          rank: spec.rank,
          matchIds: spec.matchIds ?? [],
          matchNames: spec.matchNames ?? [],
          countryCode: spec.countryCode ?? null,
          note: spec.note ?? null,
        },
      });
    }

    // Une entrée retirée du fichier de config disparaît aussi de la base.
    const removed = await this.prisma.wantedChannel.deleteMany({ where: { key: { notIn: keys } } });
    if (removed.count > 0) {
      this.logger.log(`[Curation] ${removed.count} obsolete wanted entries removed`);
    }
  }

  /**
   * Résout chaque souhait contre le catalogue et repositionne les priorités.
   * Déclencheur : fin d'import, ou POST /admin/curation/apply.
   */
  async apply(): Promise<CurationReport> {
    await this.syncSpecs();
    const wanted = await this.prisma.wantedChannel.findMany({ orderBy: { rank: 'asc' } });

    // Remise à zéro : une chaîne sortie de la curation ne doit pas garder son rang.
    await this.prisma.channel.updateMany({
      where: { OR: [{ isWanted: true }, { priorityRank: { not: null } }] },
      data: { isWanted: false, priorityRank: null },
    });

    const report: CurationReport = {
      total: wanted.length,
      resolved: 0,
      noPublicStream: 0,
      notFound: 0,
      missing: [],
    };

    /** channelId → meilleur (plus petit) rang de curation. */
    const ranks = new Map<string, number>();

    for (const entry of wanted) {
      const channel = await this.findCandidate(entry);
      let status: WantedStatus;

      if (!channel) {
        status = WantedStatus.NOT_FOUND;
        report.notFound++;
      } else if (!channel.streamUrl && channel.streamCount === 0) {
        status = WantedStatus.NO_PUBLIC_STREAM;
        report.noPublicStream++;
      } else {
        status = WantedStatus.RESOLVED;
        report.resolved++;
        const previous = ranks.get(channel.id);
        if (previous === undefined || entry.rank < previous) ranks.set(channel.id, entry.rank);
      }

      if (status !== WantedStatus.RESOLVED) {
        report.missing.push({ key: entry.key, label: entry.label, group: entry.group, status });
      }

      await this.prisma.wantedChannel.update({
        where: { id: entry.id },
        data: {
          status,
          resolvedChannelId: channel?.id ?? null,
          resolvedAt: status === WantedStatus.RESOLVED ? new Date() : null,
        },
      });
    }

    // Une chaîne « voulue » mais sans flux reste marquée isWanted : elle apparaît
    // dans le dashboard et sera reprise dès qu'un flux public arrive.
    const allResolvedIds = wanted
      .map((w) => w.resolvedChannelId)
      .filter((id): id is string => Boolean(id));

    if (allResolvedIds.length > 0) {
      await this.prisma.channel.updateMany({
        where: { id: { in: Array.from(new Set(allResolvedIds)) } },
        data: { isWanted: true },
      });
    }

    for (const [channelId, rank] of ranks) {
      await this.prisma.channel.update({ where: { id: channelId }, data: { priorityRank: rank } });
    }

    this.logger.log(
      `[Curation] ${report.resolved}/${report.total} resolved, ` +
        `${report.noPublicStream} without public stream, ${report.notFound} not found`,
    );
    return report;
  }

  /**
   * Stratégie de matching, du plus fiable au plus permissif :
   *   1. identifiant iptv-org exact, dans l'ordre déclaré ;
   *   2. nom normalisé exact (restreint au pays si fourni) ;
   *   3. nom normalisé alternatif (`matchNames`, `alt_names`).
   * À égalité, on préfère toujours une chaîne qui a un flux.
   */
  private async findCandidate(entry: {
    matchIds: string[];
    matchNames: string[];
    label: string;
    countryCode: string | null;
  }): Promise<{ id: string; streamUrl: string | null; streamCount: number } | null> {
    if (entry.matchIds.length > 0) {
      const byId = await this.prisma.channel.findMany({
        where: { externalId: { in: entry.matchIds }, isBlocked: false, isDisabled: false },
        select: { id: true, externalId: true, streamUrl: true, _count: { select: { streams: true } } },
      });
      if (byId.length > 0) {
        const ordered = entry.matchIds
          .map((externalId) => byId.find((c) => c.externalId === externalId))
          .filter((c): c is (typeof byId)[number] => Boolean(c));
        const best =
          ordered.find((c) => c.streamUrl || c._count.streams > 0) ?? ordered[0] ?? byId[0];
        return { id: best.id, streamUrl: best.streamUrl, streamCount: best._count.streams };
      }
    }

    const names = [entry.label, ...entry.matchNames].map(normalizeText).filter(Boolean);
    if (names.length === 0) return null;

    const byName = await this.prisma.channel.findMany({
      where: {
        searchText: { in: names },
        isBlocked: false,
        isDisabled: false,
        ...(entry.countryCode ? { countryCode: entry.countryCode } : {}),
      },
      select: { id: true, streamUrl: true, _count: { select: { streams: true } } },
      take: 20,
    });
    if (byName.length === 0) return null;

    const best = byName.find((c) => c.streamUrl || c._count.streams > 0) ?? byName[0];
    return { id: best.id, streamUrl: best.streamUrl, streamCount: best._count.streams };
  }

  /** Vue « ce que je veux » pour le dashboard admin. */
  async status() {
    const entries = await this.prisma.wantedChannel.findMany({
      orderBy: [{ rank: 'asc' }],
      include: {
        channel: {
          select: { id: true, name: true, slug: true, streamUrl: true, isActive: true, logo: true },
        },
      },
    });
    return entries.map((e) => ({
      key: e.key,
      label: e.label,
      group: e.group,
      rank: e.rank,
      status: e.status,
      note: e.note,
      channel: e.channel,
    }));
  }
}
