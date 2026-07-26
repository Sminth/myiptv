import { PlaylistRulesDto } from './dto/playlist.dto';

export interface DefaultPlaylistSpec {
  slug: string;
  name: string;
  description: string;
  rules: PlaylistRulesDto;
  /**
   * Code du lien court, figé pour la playlist principale : sur un serveur
   * reconstruit à neuf, le lien de la TV doit rester le même. Les autres
   * playlists en reçoivent un tiré au sort.
   */
  shortCode?: string;
}

/**
 * Playlists créées au premier démarrage. `maison` est celle à coller dans la
 * TV : uniquement les chaînes curées + les favoris, rien d'autre.
 */
export const DEFAULT_PLAYLISTS: DefaultPlaylistSpec[] = [
  {
    slug: 'maison',
    name: 'Playlist Maison',
    description:
      'Le lien de la TV : chaînes curées, toute la France et la Côte d’Ivoire, ' +
      'les africaines francophones, les directs YouTube officiels + favoris.',
    // Code figé : c'est ce lien qu'on saisit à la télécommande, il doit
    // survivre à une reconstruction complète du serveur.
    shortCode: 'tv',
    rules: {
      includeWanted: true,
      includeFavorites: true,
      includeYoutube: true,
      onlyActive: true,
      countries: ['FR', 'CI'],
      // En OU, pas en ET : croiser « pays FR/CI » avec « région AFR + langue
      // française » ne renverrait rien. Voir `union` dans playlist-rules.ts.
      union: [{ regions: ['AFR'], languages: ['fra'] }],
    },
  },
  {
    slug: 'salon-vlc',
    name: 'Salon VLC',
    description: 'Même sélection que la playlist maison — pour tester sur ordinateur avant la TV.',
    rules: {
      includeWanted: true,
      includeYoutube: true,
      onlyActive: true,
      countries: ['FR', 'CI'],
      union: [{ regions: ['AFR'], languages: ['fra'] }],
    },
  },
  {
    slug: 'france',
    name: 'France',
    description: 'Chaînes françaises curées.',
    rules: { groups: ['France'], includeWanted: false, onlyActive: true },
  },
  {
    slug: 'cotedivoire',
    name: 'Côte d’Ivoire',
    description: 'Chaînes ivoiriennes disposant d’un flux public.',
    rules: { countries: ['CI'], onlyActive: true },
  },
  {
    slug: 'afrique',
    name: 'Afrique',
    description: 'Chaînes africaines francophones.',
    rules: { regions: ['AFR'], languages: ['fra'], onlyActive: true, maxPerGroup: 60 },
  },
  {
    slug: 'documentaires',
    name: 'Documentaires',
    description: 'Documentaire, science, découverte.',
    rules: { groups: ['Documentaire'], categories: ['documentary'], languages: ['fra'], onlyActive: true },
  },
  {
    slug: 'favoris',
    name: 'Favoris',
    description: 'Uniquement mes favoris.',
    rules: { includeFavorites: true, onlyActive: false },
  },
];
