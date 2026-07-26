import { SHORT_CODE_LENGTH, generateShortCode, normalizeShortCode } from './short-code';

describe('generateShortCode', () => {
  it('produit un code de la longueur attendue', () => {
    expect(generateShortCode()).toHaveLength(SHORT_CODE_LENGTH);
    expect(generateShortCode(10)).toHaveLength(10);
  });

  /** Un `0` pris pour un `O` à la télécommande, et le lien ne marche pas. */
  it('n’émet jamais de caractère ambigu', () => {
    const codes = Array.from({ length: 200 }, () => generateShortCode(12)).join('');
    expect(codes).not.toMatch(/[01ilo]/);
    expect(codes).toMatch(/^[a-z2-9]+$/);
  });

  it('ne renvoie pas deux fois le même code', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateShortCode()));
    expect(codes.size).toBe(500);
  });
});

describe('normalizeShortCode', () => {
  it('accepte majuscules, espaces et extension ajoutée par le lecteur', () => {
    expect(normalizeShortCode('  AB2CD3  ')).toBe('ab2cd3');
    expect(normalizeShortCode('ab2cd3.m3u')).toBe('ab2cd3');
    expect(normalizeShortCode('AB2CD3.M3U8')).toBe('ab2cd3');
  });

  it('laisse intact un code déjà propre', () => {
    expect(normalizeShortCode('ab2cd3')).toBe('ab2cd3');
  });
});
