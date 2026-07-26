import { generateM3u } from '../playlists/m3u.generator';
import { parseM3u } from './m3u.parser';

describe('parseM3u', () => {
  it('lit une playlist iptv-org standard', () => {
    const parsed = parseM3u(
      [
        '#EXTM3U url-tvg="https://epg.test/guide.xml"',
        '#EXTINF:-1 tvg-id="TF1.fr" tvg-logo="https://cdn.test/tf1.png" group-title="France",TF1',
        'https://example.test/tf1.m3u8',
        '#EXTINF:-1 tvg-id="RTI1.ci" group-title="Côte d\'Ivoire",RTI 1',
        'https://example.test/rti1.m3u8',
      ].join('\n'),
    );

    expect(parsed.header['url-tvg']).toBe('https://epg.test/guide.xml');
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].tvgId).toBe('TF1.fr');
    expect(parsed.entries[0].attributes['group-title']).toBe('France');
    expect(parsed.entries[1].name).toBe('RTI 1');
    expect(parsed.entries[1].url).toBe('https://example.test/rti1.m3u8');
  });

  it('tolère CRLF, commentaires et attributs non quotés', () => {
    const parsed = parseM3u(
      ['#EXTM3U', '# commentaire', '#EXTINF:-1 tvg-id=Test.fr,Test', 'http://a.test/x'].join('\r\n'),
    );

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].tvgId).toBe('Test.fr');
  });

  it('capture les options VLC de l’entrée courante', () => {
    const parsed = parseM3u(
      [
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="X.fr",X',
        '#EXTVLCOPT:http-user-agent=Mozilla/5.0',
        'http://a.test/x',
      ].join('\n'),
    );

    expect(parsed.entries[0].options['http-user-agent']).toBe('Mozilla/5.0');
  });

  it('fait l’aller-retour avec le générateur', () => {
    const m3u = generateM3u(
      [
        {
          externalId: 'France24.fr',
          name: 'France 24',
          group: 'International',
          streamUrl: 'https://example.test/f24.m3u8',
          logo: 'https://cdn.test/f24.png',
          countryCode: 'FR',
          languageCode: 'fra',
          epgId: 'France24.fr',
        },
      ],
      { epgUrl: 'https://tv.test/epg.xml' },
    );

    const parsed = parseM3u(m3u);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].name).toBe('France 24');
    expect(parsed.entries[0].tvgId).toBe('France24.fr');
    expect(parsed.entries[0].attributes['group-title']).toBe('International');
    expect(parsed.entries[0].url).toBe('https://example.test/f24.m3u8');
  });

  it('ne renvoie rien pour une playlist vide', () => {
    expect(parseM3u('#EXTM3U\n').entries).toHaveLength(0);
  });
});
