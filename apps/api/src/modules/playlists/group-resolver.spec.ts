import { resolveGroup } from './group-resolver';

describe('resolveGroup', () => {
  it('donne la priorité au groupe forcé à la main', () => {
    expect(
      resolveGroup({ customGroup: 'Mes chaînes', curatedGroup: 'France', countryCode: 'FR' }),
    ).toBe('Mes chaînes');
  });

  it('utilise ensuite le groupe de curation', () => {
    expect(resolveGroup({ curatedGroup: 'Documentaire', countryCode: 'FR' })).toBe('Documentaire');
  });

  it('range par pays quand le pays a une rubrique dédiée', () => {
    expect(resolveGroup({ countryCode: 'CI' })).toBe("Côte d'Ivoire");
    expect(resolveGroup({ countryCode: 'FR' })).toBe('France');
  });

  it('sous-divise la rubrique du pays par catégorie', () => {
    expect(resolveGroup({ countryCode: 'FR', categories: ['music'] })).toBe('France · Musique');
    expect(resolveGroup({ countryCode: 'FR', category: 'movies' })).toBe('France · Cinéma');
    expect(resolveGroup({ countryCode: 'CI', categories: ['news'] })).toBe("Côte d'Ivoire · Info");
  });

  it('garde les chaînes curées à plat dans la rubrique du pays', () => {
    expect(resolveGroup({ curatedGroup: 'France', countryCode: 'FR', categories: ['music'] })).toBe(
      'France',
    );
  });

  it('reste sur le pays seul quand la catégorie est inconnue ou absente', () => {
    expect(resolveGroup({ countryCode: 'FR', categories: ['inconnue'] })).toBe('France');
    expect(resolveGroup({ countryCode: 'FR', categories: [] })).toBe('France');
  });

  it('range les africaines sous « Afrique », découpées par catégorie', () => {
    expect(resolveGroup({ countryCode: 'SN', regions: ['AFR'], categories: ['news'] })).toBe(
      'Afrique · Info',
    );
    expect(resolveGroup({ countryCode: 'CD', regions: ['AFR'], categories: [] })).toBe('Afrique');
  });

  it('laisse la Côte d’Ivoire dans sa propre rubrique malgré la région AFR', () => {
    expect(resolveGroup({ countryCode: 'CI', regions: ['AFR'], categories: ['news'] })).toBe(
      "Côte d'Ivoire · Info",
    );
  });

  it('retombe sur la catégorie iptv-org', () => {
    expect(resolveGroup({ countryCode: 'SN', categories: ['news'] })).toBe('News');
    expect(resolveGroup({ countryCode: 'SN', categories: ['documentary'] })).toBe('Documentaire');
  });

  it('utilise le nom du pays en dernier recours', () => {
    expect(resolveGroup({ countryCode: 'SN', countryName: 'Sénégal', categories: [] })).toBe('Sénégal');
  });

  it('finit sur « International » quand tout manque', () => {
    expect(resolveGroup({})).toBe('International');
  });
});
