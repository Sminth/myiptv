import { createHash } from 'node:crypto';

/**
 * Identité d'un flux.
 *
 * On n'indexe pas l'URL elle-même : certaines URL IPTV embarquent un jeton
 * signé et dépassent la taille maximale d'une entrée d'index btree
 * (2 704 octets), ce qui faisait échouer l'import complet. Le SHA-1 est ici un
 * identifiant, pas une protection — aucune propriété cryptographique n'est
 * requise.
 */
export function hashUrl(url: string): string {
  return createHash('sha1').update(url).digest('hex');
}
