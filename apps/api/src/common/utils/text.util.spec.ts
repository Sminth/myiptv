import { escapeM3uAttribute, isHdQuality, normalizeText, qualityScore, slugify, uniqueSlug } from './text.util';

describe('normalizeText', () => {
  it('supprime accents, apostrophes et ponctuation', () => {
    expect(normalizeText("Côte d'Ivoire")).toBe('cote d ivoire');
    expect(normalizeText('RTI  La 3')).toBe('rti la 3');
    expect(normalizeText('A+ Ivoire')).toBe('a ivoire');
  });

  it('rend comparables deux écritures du même nom', () => {
    expect(normalizeText('TÉLÉ Ivoire')).toBe(normalizeText('tele ivoire'));
  });
});

describe('slugify / uniqueSlug', () => {
  it('produit un slug d’URL', () => {
    expect(slugify('France 24')).toBe('france-24');
  });

  it('discrimine deux chaînes homonymes par le pays', () => {
    const taken = new Set<string>();
    expect(uniqueSlug('M6', taken, 'FR')).toBe('m6');
    expect(uniqueSlug('M6', taken, 'CH')).toBe('m6-ch');
    expect(uniqueSlug('M6', taken, 'BE')).toBe('m6-be');
  });

  it('retombe sur un compteur quand même le discriminant est pris', () => {
    const taken = new Set(['m6', 'm6-ch']);
    expect(uniqueSlug('M6', taken, 'CH')).toBe('m6-2');
  });
});

describe('escapeM3uAttribute', () => {
  it('remplace les guillemets qui casseraient le M3U', () => {
    expect(escapeM3uAttribute('Radio "Test"')).toBe("Radio 'Test'");
  });

  it('aplatit les retours à la ligne', () => {
    expect(escapeM3uAttribute('Ligne 1\nLigne 2')).toBe('Ligne 1 Ligne 2');
  });
});

describe('isHdQuality / qualityScore', () => {
  it.each([
    ['1080p', true],
    ['720p', true],
    ['576i', false],
    ['480i', false],
    ['4k', true],
    [null, false],
  ])('%s → HD %s', (quality, expected) => {
    expect(isHdQuality(quality as string | null)).toBe(expected);
  });

  it('ordonne les qualités', () => {
    expect(qualityScore('1080p')).toBeGreaterThan(qualityScore('720p'));
    expect(qualityScore('4k')).toBeGreaterThan(qualityScore('1080p'));
    expect(qualityScore(null)).toBe(0);
  });
});
