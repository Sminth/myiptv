import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';

/**
 * Élection du flux servi dans les playlists.
 *
 * Isolé dans son propre service parce que trois appelants en ont besoin —
 * l'import, le contrôle de santé et le dashboard — et qu'en le laissant dans
 * l'importeur on créait un cycle de modules (import → santé → import).
 */
@Injectable()
export class BestStreamService {
  private readonly logger = new Logger(BestStreamService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retient, pour chaque chaîne, le flux le moins défaillant puis le mieux
   * défini. Une chaîne dont le flux HD meurt bascule ainsi automatiquement sur
   * son flux SD au lieu de disparaître de la TV.
   */
  async refresh(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      WITH best AS (
        SELECT DISTINCT ON (s.channel_id)
          s.channel_id,
          s.url,
          s.quality,
          s.is_alive,
          s.last_checked,
          s.failure_count,
          s.kind,
          COALESCE(NULLIF(regexp_replace(COALESCE(s.quality, ''), '\\D', '', 'g'), ''), '0')::int AS score
        FROM streams s
        WHERE s.channel_id IS NOT NULL
        ORDER BY s.channel_id,
                 -- un direct YouTube ne sert que de repli : tous les lecteurs
                 -- ne savent pas le résoudre, un manifeste HLS passe partout
                 (s.kind = 'HLS') DESC,
                 -- jamais testé (NULL) ≈ vivant : on ne pénalise pas un flux neuf
                 (s.last_checked IS NULL OR s.is_alive) DESC,
                 s.failure_count ASC,
                 COALESCE(NULLIF(regexp_replace(COALESCE(s.quality, ''), '\\D', '', 'g'), ''), '0')::int DESC,
                 s.created_at ASC
      )
      UPDATE channels c
      SET stream_url = best.url,
          stream_quality = best.quality,
          stream_kind = best.kind,
          is_hd = best.score >= 720,
          -- Un seul échec ne suffit pas à sortir une chaîne de la playlist :
          -- un contrôle lancé sur un lien saturé (partage de connexion mobile,
          -- wifi encombré) fait expirer des flux parfaitement valides, et la
          -- liste se viderait sur un incident réseau. Il faut deux échecs
          -- consécutifs — le compteur retombe à zéro dès qu'un test réussit.
          is_active = (best.last_checked IS NULL OR best.is_alive OR best.failure_count < 2),
          updated_at = now()
      FROM best
      WHERE c.id = best.channel_id
    `);

    const orphaned = await this.prisma.$executeRawUnsafe(`
      UPDATE channels c
      SET stream_url = NULL, stream_quality = NULL, stream_kind = NULL,
          is_hd = false, is_active = false, updated_at = now()
      WHERE (c.is_active = true OR c.stream_url IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM streams s WHERE s.channel_id = c.id)
    `);

    if (orphaned > 0) {
      this.logger.log(`[Streams] ${orphaned} channels left without any stream`);
    }
  }
}
