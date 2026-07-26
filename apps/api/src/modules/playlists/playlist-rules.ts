import { Prisma, StreamKind, WantedStatus } from '@prisma/client';
import { PlaylistRulesDto } from './dto/playlist.dto';

export interface PinnedChannels {
  /** Chaînes épinglées : ajoutées à la sélection, hors règles. */
  pinned: string[];
  /** Chaînes exclues à la main : retirées quoi qu'il arrive. */
  excludedIds: string[];
}

/**
 * Les quatre dimensions d'une règle, combinées en ET —
 * « documentaires ET francophones », pas « documentaires OU francophones ».
 */
function dimensionsOf(rules: PlaylistRulesDto): Prisma.ChannelWhereInput[] {
  const dimensions: Prisma.ChannelWhereInput[] = [];
  if (rules.countries?.length) dimensions.push({ countryCode: { in: rules.countries } });
  if (rules.regions?.length) dimensions.push({ regions: { hasSome: rules.regions } });
  if (rules.languages?.length) dimensions.push({ languageCode: { in: rules.languages } });
  if (rules.categories?.length) dimensions.push({ categories: { hasSome: rules.categories } });
  return dimensions;
}

/**
 * Traduit les règles d'une playlist en clause `where` Prisma.
 *
 * Sémantique retenue :
 *  - les dimensions d'une règle se combinent en ET (voir `dimensionsOf`) ;
 *  - `union` ajoute d'autres ensembles, chacun en ET interne, tous en OU entre eux ;
 *  - les ensembles explicites (groupes curés, favoris, chaînes épinglées)
 *    s'ajoutent en OU par-dessus ;
 *  - sans aucune règle, on retombe sur la curation : jamais 20 000 chaînes.
 *
 * Fonction pure : c'est ici que vit la logique, le service ne fait que lire la
 * base et l'appeler.
 */
export function buildPlaylistWhere(
  rules: PlaylistRulesDto,
  { pinned, excludedIds }: PinnedChannels,
  baseWhere: Prisma.ChannelWhereInput = {},
): Prisma.ChannelWhereInput {
  const dimensions = dimensionsOf(rules);

  const selection: Prisma.ChannelWhereInput[] = [];
  if (dimensions.length) selection.push({ AND: dimensions });

  // `union` ajoute des ensembles indépendants, chacun avec ses propres
  // dimensions en ET. Sans lui, « les chaînes de France et de Côte d'Ivoire,
  // PLUS les africaines francophones » serait inexprimable : tout se croiserait
  // en ET et ne renverrait rien. Un seul niveau : pas de récursion.
  for (const branch of rules.union ?? []) {
    const branchDimensions = dimensionsOf(branch);
    if (branchDimensions.length) selection.push({ AND: branchDimensions });
  }
  if (rules.groups?.length) {
    selection.push({
      wantedEntries: { some: { group: { in: rules.groups }, status: WantedStatus.RESOLVED } },
    });
  }
  if (rules.includeWanted) selection.push({ isWanted: true });
  if (rules.includeFavorites) selection.push({ favorite: { isNot: null } });
  if (rules.channels?.length) {
    selection.push({
      OR: [
        { id: { in: rules.channels } },
        { slug: { in: rules.channels } },
        { externalId: { in: rules.channels } },
      ],
    });
  }
  if (pinned.length) selection.push({ id: { in: pinned } });
  if (selection.length === 0) selection.push({ isWanted: true });

  // `NOT` est accumulé dans un tableau : deux clés `NOT` dans le même objet
  // littéral s'écraseraient l'une l'autre, et le filtre perdu le serait en
  // silence — une chaîne YouTube réapparaîtrait dès qu'une playlist utilise
  // `excludeChannels`.
  const exclusions: Prisma.ChannelWhereInput[] = [];
  // Un direct YouTube n'entre que si la playlist le demande : sinon la TV
  // affiche une ligne qui ne démarre jamais.
  if (!rules.includeYoutube) exclusions.push({ streamKind: StreamKind.YOUTUBE });
  if (rules.excludeChannels?.length) {
    exclusions.push({
      OR: [
        { slug: { in: rules.excludeChannels } },
        { externalId: { in: rules.excludeChannels } },
      ],
    });
  }

  return {
    ...baseWhere,
    streamUrl: { not: null },
    OR: selection,
    ...(rules.onlyActive === false ? {} : { isActive: true }),
    ...(rules.hdOnly ? { isHd: true } : {}),
    ...(excludedIds.length ? { id: { notIn: excludedIds } } : {}),
    ...(exclusions.length ? { NOT: exclusions } : {}),
  };
}
