/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CURATION — « je ne veux pas 20 000 chaînes, je veux CELLES-LÀ »
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * C'est le seul fichier à éditer pour changer ce qui remonte en tête de tes
 * playlists. À chaque import, chaque entrée est confrontée au catalogue public
 * iptv-org :
 *
 *   RESOLVED          → chaîne trouvée ET un flux public existe → elle est
 *                       marquée `isWanted` + `priorityRank` et remonte en tête.
 *   NO_PUBLIC_STREAM  → la chaîne existe dans la base iptv-org, mais aucun flux
 *                       public légal n'est référencé. Elle reste suivie : dès
 *                       qu'un flux autorisé apparaît en amont, l'import suivant
 *                       la bascule en RESOLVED sans intervention.
 *   NOT_FOUND         → absente des sources publiques.
 *
 * ⚠️  Ce projet n'ajoute JAMAIS de source non autorisée. Une chaîne en
 * NO_PUBLIC_STREAM le reste tant que son diffuseur n'ouvre pas de flux public.
 * Pour une chaîne dont TU disposes légalement (abonnement fournissant une URL,
 * flux de ton propre serveur…), passe par POST /admin/streams (source manuelle
 * assumée), pas par ce fichier.
 *
 * `matchIds`   : identifiants iptv-org exacts (« TF1.fr ») — prioritaires.
 * `matchNames` : noms alternatifs, comparés en texte normalisé (sans accent).
 * `rank`       : ordre d'affichage. Plus petit = plus haut dans la playlist.
 */

export interface WantedChannelSpec {
  /** Clé stable, sert d'identité de l'entrée entre deux imports. */
  key: string;
  label: string;
  group: string;
  rank: number;
  matchIds?: string[];
  matchNames?: string[];
  /** Restreint le matching par nom à ce pays (évite « Arte » brésilien). */
  countryCode?: string;
  note?: string;
}

const FR = 'France';
const CI = "Côte d'Ivoire";
const AFRIQUE = 'Afrique';
const DOCS = 'Documentaire';
const RELIGION = 'Religion';
const INFO = 'International';

export const WANTED_CHANNELS: WantedChannelSpec[] = [
  // ── France ────────────────────────────────────────────────────────────────
  { key: 'fr-tf1', label: 'TF1', group: FR, rank: 1, matchIds: ['TF1.fr'], countryCode: 'FR' },
  { key: 'fr-france2', label: 'France 2', group: FR, rank: 2, matchIds: ['France2.fr'], countryCode: 'FR' },
  { key: 'fr-france3', label: 'France 3', group: FR, rank: 3, matchIds: ['France3.fr'], countryCode: 'FR' },
  { key: 'fr-france4', label: 'France 4', group: FR, rank: 4, matchIds: ['France4.fr'], countryCode: 'FR' },
  { key: 'fr-france5', label: 'France 5', group: FR, rank: 5, matchIds: ['France5.fr'], countryCode: 'FR' },
  { key: 'fr-m6', label: 'M6', group: FR, rank: 6, matchIds: ['M6.fr'], countryCode: 'FR' },
  { key: 'fr-arte', label: 'Arte', group: FR, rank: 7, matchIds: ['arte.fr'], matchNames: ['arte'], countryCode: 'FR' },
  { key: 'fr-tmc', label: 'TMC', group: FR, rank: 8, matchIds: ['TMC.fr'], countryCode: 'FR' },
  { key: 'fr-tfx', label: 'TFX', group: FR, rank: 9, matchIds: ['TFX.fr'], countryCode: 'FR' },
  { key: 'fr-lci', label: 'LCI', group: FR, rank: 10, matchIds: ['LCI.fr'], countryCode: 'FR' },
  { key: 'fr-bfmtv', label: 'BFM TV', group: FR, rank: 11, matchIds: ['BFMTV.fr'], countryCode: 'FR' },
  { key: 'fr-cnews', label: 'CNews', group: FR, rank: 12, matchIds: ['CNews.fr'], countryCode: 'FR' },
  { key: 'fr-cstar', label: 'CStar', group: FR, rank: 13, matchIds: ['CStar.fr'], matchNames: ['c star', 'cstar'], countryCode: 'FR' },
  { key: 'fr-gulli', label: 'Gulli', group: FR, rank: 14, matchIds: ['Gulli.fr'], countryCode: 'FR' },
  {
    key: 'fr-tv5monde',
    label: 'TV5 Monde',
    group: FR,
    rank: 15,
    // Le flux « TV5Monde.fr » générique n'a pas de source publique : on retient
    // le feed Europe/France, qui en a une.
    matchIds: ['TV5MondeFranceBelgiumSwitzerlandMonaco.fr', 'TV5MondeEurope.fr', 'TV5Monde.fr'],
    countryCode: 'FR',
  },
  { key: 'fr-france24', label: 'France 24', group: FR, rank: 16, matchIds: ['France24.fr'], countryCode: 'FR' },
  { key: 'fr-euronews', label: 'Euronews Français', group: FR, rank: 17, matchIds: ['EuronewsFrench.fr'] },
  { key: 'fr-publicsenat', label: 'Public Sénat', group: FR, rank: 18, matchIds: ['PublicSenat2424.fr', 'PublicSenat.fr'], matchNames: ['public senat'], countryCode: 'FR' },
  { key: 'fr-lcp', label: 'LCP', group: FR, rank: 19, matchIds: ['LCP.fr', 'LCPAN.fr'], countryCode: 'FR' },

  // ── Côte d'Ivoire ─────────────────────────────────────────────────────────
  { key: 'ci-rti1', label: 'RTI 1', group: CI, rank: 20, matchIds: ['RTI1.ci'], countryCode: 'CI' },
  { key: 'ci-rti2', label: 'RTI 2', group: CI, rank: 21, matchIds: ['RTI2.ci'], countryCode: 'CI' },
  { key: 'ci-rti3', label: 'RTI La 3', group: CI, rank: 22, matchIds: ['RTILa3.ci'], matchNames: ['rti la 3', 'la 3'], countryCode: 'CI' },
  { key: 'ci-nci', label: 'NCI', group: CI, rank: 23, matchIds: ['NCI.ci'], countryCode: 'CI' },
  { key: 'ci-aplus', label: 'A+ Ivoire', group: CI, rank: 24, matchIds: ['APlusIvoire.ci'], matchNames: ['a+ ivoire', 'a plus ivoire'], countryCode: 'CI' },
  { key: 'ci-lifetv', label: 'Life TV', group: CI, rank: 25, matchIds: ['LifeTV.ci'], countryCode: 'CI' },
  { key: 'ci-business24', label: 'Business 24 Africa', group: CI, rank: 26, matchIds: ['Business24Africa.ci'], countryCode: 'CI' },
  { key: 'ci-7info', label: '7 Info', group: CI, rank: 27, matchIds: ['7Info.ci'], countryCode: 'CI' },
  { key: 'ci-tvlacapitale', label: 'TV La Capitale', group: CI, rank: 28, matchIds: ['TVLaCapitale.ci'], countryCode: 'CI' },

  // ── Afrique ───────────────────────────────────────────────────────────────
  { key: 'af-africanews', label: 'Africanews Français', group: AFRIQUE, rank: 30, matchIds: ['AfricanewsFrench.fr'] },
  { key: 'af-tv5afrique', label: 'TV5Monde Afrique', group: AFRIQUE, rank: 31, matchIds: ['TV5MondeAfrica.fr'] },
  { key: 'af-france24afrique', label: 'France 24 Afrique', group: AFRIQUE, rank: 32, matchIds: ['France24.fr'], note: 'France 24 diffuse un flux unique multi-zones' },
  { key: 'af-bbcafrique', label: 'BBC Afrique', group: AFRIQUE, rank: 33, matchNames: ['bbc afrique', 'bbc africa'], note: 'Aucun flux TV public référencé à ce jour' },

  // ── Documentaires ─────────────────────────────────────────────────────────
  { key: 'doc-arte', label: 'Arte (documentaires)', group: DOCS, rank: 40, matchIds: ['arte.fr'] },
  { key: 'doc-dw', label: 'DW Documentary', group: DOCS, rank: 41, matchIds: ['DWDocumentary.de', 'DW.de'], matchNames: ['dw documentary'] },
  { key: 'doc-nasa', label: 'NASA TV', group: DOCS, rank: 42, matchIds: ['NASATVPublic.us', 'NASATV.us'], matchNames: ['nasa tv'] },
  { key: 'doc-lovenature', label: 'Love Nature', group: DOCS, rank: 43, matchIds: ['LoveNature.ca'] },
  { key: 'doc-rmcdecouverte', label: 'RMC Découverte', group: DOCS, rank: 44, matchIds: ['RMCDecouverte.fr'], countryCode: 'FR' },
  {
    key: 'doc-natgeo',
    label: 'National Geographic',
    group: DOCS,
    rank: 45,
    matchIds: ['NationalGeographic.fr'],
    countryCode: 'FR',
    note: 'Uniquement si un flux public légal est référencé',
  },

  // ── Religion ──────────────────────────────────────────────────────────────
  { key: 'rel-kto', label: 'KTO', group: RELIGION, rank: 50, matchIds: ['KTO.fr'], countryCode: 'FR' },
  { key: 'rel-emci', label: 'EMCI TV', group: RELIGION, rank: 51, matchIds: ['EMCITV.fr', 'EMCITVEurope.fr'] },
  { key: 'rel-ewtn', label: 'EWTN', group: RELIGION, rank: 52, matchIds: ['EWTN.us', 'EWTN.de'] },

  // ── International / info ──────────────────────────────────────────────────
  { key: 'int-tv5info', label: 'TV5Monde Info', group: INFO, rank: 60, matchIds: ['TV5MondeInfo.fr'] },
  { key: 'int-euronewsen', label: 'Euronews English', group: INFO, rank: 61, matchIds: ['EuronewsEnglish.fr'] },
];

/**
 * Groupes M3U proposés par défaut (l'ordre pilote l'affichage dans la TV).
 * Un groupe est alimenté soit par la curation, soit par des règles (pays,
 * catégorie, langue).
 */
export interface GroupSpec {
  name: string;
  order: number;
  /** Règles automatiques appliquées en plus des chaînes curées du groupe. */
  countries?: string[];
  categories?: string[];
  languages?: string[];
}

export const DEFAULT_GROUPS: GroupSpec[] = [
  { name: FR, order: 1, countries: ['FR'] },
  { name: CI, order: 2, countries: ['CI'] },
  { name: AFRIQUE, order: 3 },
  { name: 'News', order: 4, categories: ['news'] },
  { name: 'Sport', order: 5, categories: ['sports'] },
  { name: 'Jeunesse', order: 6, categories: ['kids'] },
  { name: RELIGION, order: 7, categories: ['religious'] },
  { name: 'Musique', order: 8, categories: ['music'] },
  { name: DOCS, order: 9, categories: ['documentary', 'science', 'travel'] },
  { name: 'Culture', order: 10, categories: ['culture'] },
  { name: 'Cinéma', order: 11, categories: ['movies'] },
  { name: 'Séries', order: 12, categories: ['series'] },
  { name: 'Divertissement', order: 13, categories: ['entertainment', 'comedy'] },
  { name: INFO, order: 14 },
];

export const GROUP_ORDER: Record<string, number> = Object.fromEntries(
  DEFAULT_GROUPS.map((g) => [g.name, g.order]),
);
