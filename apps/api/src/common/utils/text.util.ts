/**
 * Normalisation partagée par la recherche, le slug et le matching de curation.
 * Un seul endroit : si la règle change, la recherche et l'import restent
 * cohérents (sinon une chaîne indexée « cote-divoire » n'est plus trouvée par
 * « Côte d'Ivoire »).
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[‘’'`´]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function slugify(input: string): string {
  return normalizeText(input).replace(/ /g, '-');
}

/**
 * Slug unique : `TF1` et `TF1` (2 pays) donneraient le même slug ; on suffixe
 * avec un discriminant stable (le code pays, puis un compteur).
 */
export function uniqueSlug(base: string, taken: Set<string>, discriminator?: string): string {
  const root = slugify(base) || 'channel';
  let candidate = root;
  if (taken.has(candidate) && discriminator) {
    candidate = `${root}-${slugify(discriminator)}`;
  }
  let i = 2;
  while (taken.has(candidate)) {
    candidate = `${root}-${i++}`;
  }
  taken.add(candidate);
  return candidate;
}

/** Échappe une valeur d'attribut M3U (les guillemets cassent les lecteurs). */
export function escapeM3uAttribute(value: string): string {
  return value.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
}

const HD_QUALITY = /^(7[2-9]\d|[89]\d{2}|[1-9]\d{3,})[ip]?$/i;

/** `"1080p"` → true, `"480i"` → false. Tolère `null`. */
export function isHdQuality(quality?: string | null): boolean {
  if (!quality) return false;
  const cleaned = quality.trim().toLowerCase();
  if (['4k', 'uhd', 'fhd', 'hd'].includes(cleaned)) return true;
  return HD_QUALITY.test(cleaned);
}

/** Ordonne les qualités : 1080p > 720p > 576i > inconnu. */
export function qualityScore(quality?: string | null): number {
  if (!quality) return 0;
  const cleaned = quality.trim().toLowerCase();
  if (cleaned === '4k' || cleaned === 'uhd') return 2160;
  const match = cleaned.match(/(\d{3,4})/);
  return match ? parseInt(match[1], 10) : 0;
}
