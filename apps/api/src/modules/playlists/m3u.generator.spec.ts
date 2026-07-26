import { M3uChannel, capPerGroup, generateM3u, sortForPlaylist } from './m3u.generator';

const channel = (overrides: Partial<M3uChannel> = {}): M3uChannel => ({
  externalId: 'TF1.fr',
  name: 'TF1',
  group: 'France',
  streamUrl: 'https://example.test/tf1.m3u8',
  countryCode: 'FR',
  languageCode: 'fra',
  epgId: 'TF1.fr',
  priorityRank: 1,
  ...overrides,
});

describe('generateM3u', () => {
  it('commence par #EXTM3U et annonce l’EPG', () => {
    const output = generateM3u([channel()], { epgUrl: 'https://tv.test/epg.xml' });
    const lines = output.split('\n');

    expect(lines[0]).toBe(
      '#EXTM3U url-tvg="https://tv.test/epg.xml" x-tvg-url="https://tv.test/epg.xml"',
    );
  });

  it('émet une entrée lisible par les lecteurs TV', () => {
    const output = generateM3u([channel({ logo: 'https://cdn.test/tf1.png' })]);

    expect(output).toContain(
      '#EXTINF:-1 tvg-id="TF1.fr" tvg-name="TF1" tvg-logo="https://cdn.test/tf1.png" ' +
        'tvg-country="FR" tvg-language="fra" group-title="France",TF1',
    );
    expect(output).toContain('https://example.test/tf1.m3u8');
  });

  it('neutralise les guillemets qui casseraient le parsing', () => {
    const output = generateM3u([channel({ name: 'Radio "Libre"', group: 'Côte d’Ivoire' })]);

    expect(output).toContain(`tvg-name="Radio 'Libre'"`);
    expect(output).not.toMatch(/tvg-name="Radio "Libre""/);
  });

  it('ajoute les options VLC quand le flux exige un User-Agent', () => {
    const output = generateM3u([
      channel({ userAgent: 'VLC/3.0.20', referrer: 'https://example.test/' }),
    ]);

    expect(output).toContain('#EXTVLCOPT:http-user-agent=VLC/3.0.20');
    expect(output).toContain('#EXTVLCOPT:http-referrer=https://example.test/');
  });

  it('ignore une chaîne sans URL de flux', () => {
    const output = generateM3u([channel({ streamUrl: '' })]);

    expect(output.split('\n').filter((l) => l.startsWith('#EXTINF'))).toHaveLength(0);
  });
});

describe('sortForPlaylist', () => {
  it('place les chaînes curées avant les autres, dans l’ordre de la curation', () => {
    const sorted = sortForPlaylist([
      channel({ name: 'Chaîne quelconque', group: 'News', priorityRank: null }),
      channel({ name: 'RTI 1', group: "Côte d'Ivoire", priorityRank: 20 }),
      channel({ name: 'TF1', group: 'France', priorityRank: 1 }),
    ]);

    expect(sorted.map((c) => c.name)).toEqual(['TF1', 'RTI 1', 'Chaîne quelconque']);
  });

  it('range les non-curées par ordre de groupe puis par nom', () => {
    const sorted = sortForPlaylist([
      channel({ name: 'Zed Musique', group: 'Musique', priorityRank: null }),
      channel({ name: 'Beta News', group: 'News', priorityRank: null }),
      channel({ name: 'Alpha News', group: 'News', priorityRank: null }),
    ]);

    // News (ordre 4) passe avant Musique (ordre 8).
    expect(sorted.map((c) => c.name)).toEqual(['Alpha News', 'Beta News', 'Zed Musique']);
  });
});

describe('capPerGroup', () => {
  it('plafonne le nombre de chaînes par rubrique', () => {
    const channels = [
      channel({ name: 'A', group: 'News' }),
      channel({ name: 'B', group: 'News' }),
      channel({ name: 'C', group: 'News' }),
      channel({ name: 'D', group: 'France' }),
    ];

    expect(capPerGroup(channels, 2).map((c) => c.name)).toEqual(['A', 'B', 'D']);
  });

  it('ne touche à rien sans plafond', () => {
    const channels = [channel(), channel()];
    expect(capPerGroup(channels, undefined)).toHaveLength(2);
  });
});
