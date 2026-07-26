/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SOURCES OFFICIELLES COMPLÉMENTAIRES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Certaines chaînes voulues ne sont pas (encore) couvertes par iptv-org alors
 * que leur diffuseur publie lui-même un flux en accès libre sur sa propre
 * plateforme. On les rattache ici, avec pour chaque entrée :
 *
 *   `provider` — la plateforme officielle du diffuseur ;
 *   `evidence` — la page publique où SON lecteur appelle ce flux ;
 *   `checkedAt` — date de la dernière vérification manuelle.
 *
 * Règles que ce fichier respecte, et qui doivent le rester :
 *
 *   ✔ uniquement des flux servis en clair par le diffuseur (ou son CDN) ;
 *   ✔ aucune authentification, aucun contournement de DRM, aucun paywall ;
 *   ✘ jamais de réémission par un tiers non autorisé (agrégateurs « free IPTV »,
 *     portails Xtream, restreams) ;
 *   ✘ jamais une chaîne dont l'accès est conditionné à un abonnement
 *     (A+ Ivoire → Canal+, National Geographic → bouquets payants).
 *
 * Ces flux sont ré-appliqués après chaque import et survivent au nettoyage des
 * chaînes obsolètes (préfixe `official:` dans le titre du flux).
 */

export type OfficialSourceKind = 'HLS' | 'YOUTUBE';

export interface OfficialSourceSpec {
  /**
   * `HLS` — manifeste direct, lisible partout.
   * `YOUTUBE` — page « live » de la chaîne YouTube officielle du diffuseur.
   *   Aucune extraction n'est faite ici : on stocke l'URL publique et c'est le
   *   lecteur (VLC, OTT Navigator…) qui la résout, s'il en est capable. Ces
   *   entrées n'entrent que dans les playlists qui les demandent
   *   (`includeYoutube`), pour ne pas polluer une TiviMate qui ne sait pas les lire.
   */
  kind: OfficialSourceKind;
  /** Clé de l'entrée de curation concernée (voir curation.config.ts). */
  wantedKey: string;
  /** Identifiant iptv-org de la chaîne à laquelle rattacher le flux. */
  channelExternalId: string;
  url: string;
  quality?: string;
  /** Plateforme officielle qui sert ce flux. */
  provider: string;
  /** Page publique du diffuseur où son propre lecteur charge cette URL. */
  evidence: string;
  checkedAt: string;
  userAgent?: string;
  referrer?: string;
  note?: string;
}

/**
 * Kaltura est le prestataire de streaming de RTI Play et de My NCI.
 * `playManifest` sert le manifeste HLS sans session (`ks`) pour ces entrées
 * publiques : c'est l'URL stable, celle que leur lecteur web résout.
 */
const kaltura = (partnerId: string, entryId: string): string =>
  `https://cdnapisec.kaltura.com/p/${partnerId}/sp/${partnerId}00/playManifest/entryId/${entryId}/protocol/https/format/applehttp/a.m3u8`;

/** URL canonique du direct d'une chaîne YouTube (jamais une URL extraite). */
const youtubeLive = (channelOrHandle: string): string =>
  channelOrHandle.startsWith('@')
    ? `https://www.youtube.com/${channelOrHandle}/live`
    : `https://www.youtube.com/channel/${channelOrHandle}/live`;

export const OFFICIAL_SOURCES: OfficialSourceSpec[] = [
  {
    kind: 'HLS',
    wantedKey: 'ci-rti1',
    channelExternalId: 'RTI1.ci',
    url: kaltura('6234172', '1_j70d7pdb'),
    quality: '1080p',
    provider: 'RTI Play (rtiplay.ci) — service public ivoirien',
    evidence: 'https://rtiplay.ci/live — API publique https://api.rtiplay.ci/content-manager/v1/rest/lives',
    checkedAt: '2026-07-25',
    note: 'Complète le flux iptv-org existant : source officielle, meilleure qualité.',
  },
  {
    kind: 'HLS',
    wantedKey: 'ci-rti2',
    channelExternalId: 'RTI2.ci',
    url: kaltura('6234172', '1_pbprnpab'),
    quality: '720p',
    provider: 'RTI Play (rtiplay.ci) — service public ivoirien',
    evidence: 'https://rtiplay.ci/live — API publique https://api.rtiplay.ci/content-manager/v1/rest/lives',
    checkedAt: '2026-07-25',
  },
  {
    kind: 'HLS',
    wantedKey: 'ci-rti3',
    channelExternalId: 'RTILa3.ci',
    url: kaltura('6234172', '1_ad7taytx'),
    quality: '1080p',
    provider: 'RTI Play (rtiplay.ci) — service public ivoirien',
    evidence: 'https://rtiplay.ci/live — API publique https://api.rtiplay.ci/content-manager/v1/rest/lives',
    checkedAt: '2026-07-25',
  },
  {
    kind: 'HLS',
    wantedKey: 'ci-nci',
    channelExternalId: 'NCI.ci',
    url: kaltura('5571652', '1_2gnrfyb6'),
    quality: '720p',
    provider: 'My NCI (nci.ci)',
    evidence: 'https://www.nci.ci/direct — lecteur Kaltura de la chaîne',
    checkedAt: '2026-07-25',
  },

  // ── Directs YouTube officiels ──────────────────────────────────────────────
  // Solution de repli pour les chaînes dont la plateforme maison n'expose pas
  // de manifeste exploitable. On pointe la page publique de LEUR chaîne, sans
  // extraction ni contournement.
  {
    kind: 'YOUTUBE',
    wantedKey: 'ci-lifetv',
    channelExternalId: 'LifeTV.ci',
    url: youtubeLive('UCjV4LsFRnOsM_qzDk15bB5Q'),
    provider: 'Chaîne YouTube officielle Life TV',
    evidence: 'https://lifetv.ci/la-chaine/ — lifetv.ci et lifeplay.ci injoignables au contrôle',
    checkedAt: '2026-07-25',
    note: 'Le direct n’est pas permanent : dépend de la programmation de la chaîne.',
  },
  {
    kind: 'YOUTUBE',
    wantedKey: 'ci-business24',
    channelExternalId: 'Business24Africa.ci',
    url: youtubeLive('@Business24Africa'),
    provider: 'Chaîne YouTube officielle Business24 Africa',
    evidence: 'https://www.business24tv.com/ — diffusion annoncée 24h/24 sur YouTube',
    checkedAt: '2026-07-25',
    note:
      'Alternative au flux Globecast du site, dont l’URL est signée par un jeton ' +
      'expirant en ~3 min (contrôle d’accès du diffuseur : non contourné).',
  },
  {
    kind: 'YOUTUBE',
    wantedKey: 'fr-lcp',
    channelExternalId: 'LCP.fr',
    url: youtubeLive('UCHGFbA0KWBgf6gMbyUCZeCQ'),
    provider: 'Chaîne YouTube officielle LCP – Assemblée nationale',
    evidence: 'https://lcp.fr/direct-lcp-5434 — lecteur du site derrière un consentement cookies',
    checkedAt: '2026-07-25',
  },
  {
    kind: 'YOUTUBE',
    wantedKey: 'doc-nasa',
    channelExternalId: 'NASATVPublic.us',
    url: youtubeLive('@NASA'),
    provider: 'Chaîne YouTube officielle NASA',
    evidence: 'https://plus.nasa.gov/ — NASA+ renvoie vers YouTube ; flux Akamai historiques en HTTP 403',
    checkedAt: '2026-07-25',
  },
];

/**
 * Chaînes explicitement écartées, avec la raison. Documenté ici pour que
 * personne (humain ou assistant) ne « re-cherche » plus tard une source qui
 * n'existe pas légalement.
 */
export const EXCLUDED_SOURCES: Array<{ label: string; reason: string }> = [
  {
    label: 'A+ Ivoire',
    reason:
      'Chaîne du groupe Canal+, accessible uniquement sur abonnement (Canal+ / myCanal). Aucun flux public.',
  },
  {
    label: 'National Geographic',
    reason: 'Chaîne payante distribuée en bouquet. Aucun flux public autorisé.',
  },
  {
    label: 'NASA TV',
    reason:
      'Les flux linéaires Akamai (ntv1/ntv2) sont hors service depuis l’arrêt de NASA TV en août 2024 (HTTP 403). NASA+ diffuse à l’événement, via son site et la chaîne YouTube officielle @NASA.',
  },
  {
    label: 'Business 24 Africa',
    reason:
      'Flux officiel identifié (cdn-globecast.akamaized.net) mais protégé par un jeton signé expirant en ~3 minutes : inutilisable en URL fixe dans une TV. Nécessiterait un relais qui re-résout le jeton — voir README.',
  },
  {
    label: 'Life TV',
    reason:
      'Plateforme officielle (lifetv.ci / lifeplay.ci) injoignable au moment du contrôle. Chaîne YouTube officielle disponible.',
  },
  {
    label: 'LCP – Assemblée nationale',
    reason:
      'Lecteur officiel derrière un bandeau de consentement cookies ; flux non exposé sans acceptation. Direct officiel disponible sur france.tv/lcp-public-senat et la chaîne YouTube LCP.',
  },
  {
    label: 'BBC Afrique',
    reason: 'Pas de chaîne de télévision linéaire — offre vidéo à la demande uniquement.',
  },
];
