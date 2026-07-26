import { randomInt } from 'node:crypto';

/**
 * Alphabet sans caractère ambigu à l'écran d'une TV : ni `0`/`O`, ni `1`/`I`/`l`.
 * On se trompe déjà assez en tapant à la télécommande.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Longueur par défaut : 31^6 ≈ 887 millions de combinaisons, 6 appuis à saisir. */
export const SHORT_CODE_LENGTH = 6;

/**
 * Code du lien court. Il remplace le jeton de 32 caractères dans l'URL collée
 * dans la TV, et joue donc le même rôle de secret : il est tiré au sort
 * cryptographiquement, pas dérivé du nom de la playlist.
 */
export function generateShortCode(length = SHORT_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/**
 * Normalise ce qui arrive dans l'URL : un lecteur TV envoie parfois la saisie
 * en majuscules, et certains ajoutent d'eux-mêmes une extension `.m3u`.
 *
 * Aucune substitution de caractère n'est nécessaire : les ambigus ne sont pas
 * dans l'alphabet, donc jamais dans un code émis.
 */
export function normalizeShortCode(input: string): string {
  return input
    .trim()
    .replace(/\.(m3u8?|txt)$/i, '')
    .toLowerCase();
}
