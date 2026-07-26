import { DEFAULT_GROUPS } from 'src/curation/curation.config';

export interface GroupResolvable {
  customGroup?: string | null;
  /** Groupe issu de la curation (« France », « Côte d'Ivoire »…). */
  curatedGroup?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  categories?: string[];
  category?: string | null;
  /** Codes régions iptv-org (AFR, EUR…), dénormalisés sur la chaîne. */
  regions?: string[];
}

const GROUP_BY_COUNTRY = new Map<string, string>(
  DEFAULT_GROUPS.flatMap((group) => (group.countries ?? []).map((code) => [code, group.name] as const)),
);

const GROUP_BY_CATEGORY = new Map<string, string>(
  DEFAULT_GROUPS.flatMap((group) =>
    (group.categories ?? []).map((category) => [category, group.name] as const),
  ),
);

/**
 * Libellés français des catégories iptv-org, utilisés pour découper la rubrique
 * d'un pays. Sans ça, ouvrir une playlist à toute la France donne une seule
 * rubrique de 110 chaînes à faire défiler sur la télécommande.
 */
const CATEGORY_LABELS = new Map<string, string>([
  ['animation', 'Animation'],
  ['auto', 'Auto-moto'],
  ['business', 'Économie'],
  ['comedy', 'Humour'],
  ['classic', 'Classiques'],
  ['cooking', 'Cuisine'],
  ['culture', 'Culture'],
  ['documentary', 'Documentaire'],
  ['education', 'Éducation'],
  ['entertainment', 'Divertissement'],
  ['family', 'Famille'],
  ['general', 'Généraliste'],
  ['kids', 'Jeunesse'],
  ['legislative', 'Parlement'],
  ['lifestyle', 'Art de vivre'],
  ['movies', 'Cinéma'],
  ['music', 'Musique'],
  ['news', 'Info'],
  ['outdoor', 'Plein air'],
  ['relax', 'Détente'],
  ['religious', 'Religion'],
  ['science', 'Science'],
  ['series', 'Séries'],
  ['shop', 'Téléachat'],
  ['sports', 'Sport'],
  ['travel', 'Voyage'],
  ['weather', 'Météo'],
]);

/** Première catégorie renseignée, `categories` primant sur `category`. */
function categoriesOf(channel: GroupResolvable): string[] {
  if (channel.categories?.length) return channel.categories;
  return channel.category ? [channel.category] : [];
}

/**
 * Détermine le `group-title` (la rubrique affichée par le lecteur TV).
 *
 * Ordre de priorité — du plus explicite au plus générique :
 *   1. groupe forcé à la main dans le dashboard ;
 *   2. groupe de curation (c'est lui qui met TF1 dans « France ») ;
 *   3. pays connu de la configuration de groupes, sous-divisé par catégorie
 *      (« France · Musique ») dès que celle-ci est connue ;
 *   4. catégorie iptv-org mappée sur une rubrique maison ;
 *   5. nom du pays, sinon « International ».
 *
 * Les chaînes curées s'arrêtent à l'étape 2 : elles restent groupées à plat
 * dans « France » / « Côte d'Ivoire », en tête de liste, et ne se dispersent
 * pas dans les sous-rubriques.
 */
export function resolveGroup(channel: GroupResolvable): string {
  if (channel.customGroup) return channel.customGroup;
  if (channel.curatedGroup) return channel.curatedGroup;

  const categories = categoriesOf(channel);

  if (channel.countryCode) {
    const byCountry = GROUP_BY_COUNTRY.get(channel.countryCode);
    if (byCountry) {
      for (const category of categories) {
        const label = CATEGORY_LABELS.get(category);
        if (label) return `${byCountry} · ${label}`;
      }
      return byCountry;
    }
  }

  // Une chaîne africaine sans rubrique pays dédiée (Sénégal, Congo, Cameroun…)
  // se range sous « Afrique », découpée par catégorie elle aussi : sinon elle
  // se retrouverait mélangée aux françaises dans « Info » ou « Musique ».
  if (channel.regions?.includes('AFR')) {
    for (const category of categories) {
      const label = CATEGORY_LABELS.get(category);
      if (label) return `Afrique · ${label}`;
    }
    return 'Afrique';
  }

  for (const category of categories) {
    const byCategory = GROUP_BY_CATEGORY.get(category);
    if (byCategory) return byCategory;
  }

  return channel.countryName ?? 'International';
}
