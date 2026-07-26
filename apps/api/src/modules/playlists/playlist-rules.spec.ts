import { StreamKind } from '@prisma/client';
import { PlaylistRulesDto } from './dto/playlist.dto';
import { buildPlaylistWhere } from './playlist-rules';

const noPins = { pinned: [], excludedIds: [] };

/** Aplatit `NOT`, que Prisma accepte en objet seul ou en tableau. */
const notClauses = (where: { NOT?: unknown }): unknown[] =>
  where.NOT === undefined ? [] : Array.isArray(where.NOT) ? where.NOT : [where.NOT];

describe('buildPlaylistWhere', () => {
  it('exclut les directs YouTube par défaut', () => {
    const where = buildPlaylistWhere({}, noPins);
    expect(notClauses(where)).toContainEqual({ streamKind: StreamKind.YOUTUBE });
  });

  it('les laisse entrer quand la playlist le demande', () => {
    const where = buildPlaylistWhere({ includeYoutube: true }, noPins);
    expect(notClauses(where)).not.toContainEqual({ streamKind: StreamKind.YOUTUBE });
  });

  /**
   * Régression : les deux exclusions vivaient dans deux clés `NOT` du même
   * objet littéral. La seconde écrasait la première, et une chaîne YouTube
   * réapparaissait dans toute playlist utilisant `excludeChannels`.
   */
  it('cumule exclusion YouTube et excludeChannels sans en perdre une', () => {
    const rules: PlaylistRulesDto = { excludeChannels: ['tf1'] };
    const clauses = notClauses(buildPlaylistWhere(rules, noPins));

    expect(clauses).toContainEqual({ streamKind: StreamKind.YOUTUBE });
    expect(clauses).toContainEqual({
      OR: [{ slug: { in: ['tf1'] } }, { externalId: { in: ['tf1'] } }],
    });
    expect(clauses).toHaveLength(2);
  });

  it('ajoute les ensembles de `union` en OU, chacun en ET interne', () => {
    const where = buildPlaylistWhere(
      { countries: ['FR', 'CI'], union: [{ regions: ['AFR'], languages: ['fra'] }] },
      noPins,
    );

    expect(where.OR).toEqual([
      { AND: [{ countryCode: { in: ['FR', 'CI'] } }] },
      { AND: [{ regions: { hasSome: ['AFR'] } }, { languageCode: { in: ['fra'] } }] },
    ]);
  });

  it('ignore une branche d’union vide plutôt que de tout sélectionner', () => {
    const where = buildPlaylistWhere({ countries: ['FR'], union: [{}] }, noPins);
    expect(where.OR).toEqual([{ AND: [{ countryCode: { in: ['FR'] } }] }]);
  });

  it('retombe sur la curation quand aucune règle ne sélectionne rien', () => {
    expect(buildPlaylistWhere({}, noPins).OR).toEqual([{ isWanted: true }]);
  });

  it('combine les dimensions en ET, les ensembles explicites en OU', () => {
    const where = buildPlaylistWhere(
      { countries: ['FR'], categories: ['news'], includeFavorites: true },
      noPins,
    );

    expect(where.OR).toEqual([
      { AND: [{ countryCode: { in: ['FR'] } }, { categories: { hasSome: ['news'] } }] },
      { favorite: { isNot: null } },
    ]);
  });

  it('garde les chaînes épinglées et retire les exclues à la main', () => {
    const where = buildPlaylistWhere({}, { pinned: ['a'], excludedIds: ['b'] });

    expect(where.OR).toContainEqual({ id: { in: ['a'] } });
    expect(where.id).toEqual({ notIn: ['b'] });
  });

  it('n’impose isActive que si onlyActive n’est pas désactivé', () => {
    expect(buildPlaylistWhere({}, noPins).isActive).toBe(true);
    expect(buildPlaylistWhere({ onlyActive: false }, noPins).isActive).toBeUndefined();
  });
});
