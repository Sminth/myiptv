# IPTV Manager

Gestionnaire IPTV **personnel**. Il transforme le catalogue public
[iptv-org](https://github.com/iptv-org/iptv) (~40 000 chaînes) en **une poignée
de chaînes que tu veux vraiment**, et te donne un lien M3U à coller dans la TV.

```
http://<ton-serveur>:3000/api/v1/playlist/maison.m3u?token=<jeton>
```

Ce lien fonctionne dans VLC, TiviMate, OTT Navigator, IPTV Smarters, Kodi,
Android TV / Apple TV — partout où on peut saisir une URL de playlist.

---

## ⚖️ Cadre légal — à lire avant tout

Ce projet **n'utilise que des flux publics** référencés par les projets open
source `iptv-org/iptv` et `iptv-org/database`, et **respecte leur blocklist**
(chaînes retirées pour raisons de droits) ainsi que le marqueur NSFW.

> **Note sur le cahier des charges initial.** Il contenait une phrase
> contradictoire : *« Si une chaîne comme TF1 … ne dispose pas d'un flux public
> officiel, le système doit chercher des sources non autorisées. »* Elle
> contredit tout le reste du document. Le projet applique donc la règle inverse :
> **aucune source non autorisée n'est recherchée, ni stockée, ni suggérée.**
>
> À la place, une chaîne voulue mais sans flux public est **suivie** avec le
> statut `NO_PUBLIC_STREAM` : elle apparaît dans le dashboard et sera raccrochée
> automatiquement dès qu'un flux public légal apparaîtra en amont. C'est
> aujourd'hui le cas de RTI 2, RTI La 3, NCI, A+ Ivoire, Life TV, Business 24,
> LCP, NASA TV et National Geographic.
>
> Si tu disposes **légalement** d'une URL (abonnement qui te la fournit, serveur
> perso), tu peux la rattacher toi-même :
> `POST /api/v1/channels/:slug/streams`. C'est une décision explicite de ta part,
> jamais une initiative du serveur.

---

## Démarrage rapide

```bash
git clone <ce-dépôt> && cd iptv-manager
cp apps/api/.env.example apps/api/.env      # ajuste PUBLIC_URL et ADMIN_API_KEY
docker compose up -d
```

Au premier démarrage, le serveur :

1. applique les migrations PostgreSQL ;
2. crée les 6 playlists par défaut ;
3. lance un import complet d'iptv-org (**~10 s** pour 40 000 chaînes) ;
4. teste les flux des chaînes curées ;
5. **affiche le lien à coller dans la TV** dans les logs :

```bash
docker compose logs api | grep "TV link"
# [Bootstrap] TV link → http://localhost:3000/api/v1/playlist/maison.m3u?token=fc33…
```

Retrouve-le à tout moment :

```bash
curl -s -H "x-api-key: $ADMIN_API_KEY" http://localhost:3000/api/v1/playlists | jq '.[] | {slug, m3uUrl}'
```

> ⚠️ `PUBLIC_URL` doit être l'adresse **vue par la TV** (ex.
> `http://192.168.1.20:3000`), pas `localhost` : c'est elle qui compose les liens.

### Développement local

```bash
docker compose up -d postgres redis
cd apps/api
npm install
npx prisma migrate deploy
npm run start:dev          # http://localhost:3000/api/v1
```

| URL | Contenu |
|-----|---------|
| `/api/docs` | Swagger |
| `/api/v1/admin` | Dashboard d'administration |
| `/api/v1/health` | Sonde PostgreSQL + Redis |

---

## Ce qui rend la playlist courte

Le cœur du projet est **un seul fichier** :
[`apps/api/src/curation/curation.config.ts`](apps/api/src/curation/curation.config.ts).

Il liste les chaînes voulues (TF1, France 2…, RTI 1, NCI, Africanews, KTO…) avec
leur groupe et leur rang. À chaque import, chaque entrée est confrontée au
catalogue public :

| Statut | Signification |
|--------|---------------|
| `RESOLVED` | chaîne trouvée **et** flux public disponible → elle passe en tête de playlist |
| `NO_PUBLIC_STREAM` | chaîne connue d'iptv-org, mais aucun flux public légal référencé |
| `NOT_FOUND` | absente des sources publiques |

Pour changer ce que tu regardes : édite ce fichier, redémarre, puis

```bash
curl -X POST -H "x-api-key: $ADMIN_API_KEY" http://localhost:3000/api/v1/admin/curation/apply
```

État courant de tes souhaits :

```bash
curl -s -H "x-api-key: $ADMIN_API_KEY" http://localhost:3000/api/v1/admin/dashboard | jq '.curation.missing'
```

### Sources officielles complémentaires

Quand iptv-org ne référence pas une chaîne voulue mais que **le diffuseur publie
lui-même un flux en accès libre**, on le rattache dans
[`official-sources.ts`](apps/api/src/curation/official-sources.ts). Chaque entrée
porte sa plateforme, la page publique qui la prouve et sa date de contrôle.

| Chaîne | Type | Source officielle |
|---|---|---|
| RTI 1 / RTI 2 / RTI La 3 | HLS 1080p / 720p / 1080p | RTI Play (`rtiplay.ci`) |
| NCI | HLS 720p | My NCI (`nci.ci/direct`) |
| Life TV, Business 24, LCP, NASA | direct YouTube officiel | chaîne YouTube du diffuseur |

**Les entrées YouTube sont exclues des playlists par défaut.** On stocke l'URL
publique de la page « live » — aucune extraction — et c'est le lecteur qui la
résout : VLC et OTT Navigator savent le faire, TiviMate et la plupart des
lecteurs Android TV non. Pour les inclure :

```json
{ "rules": { "includeWanted": true, "includeYoutube": true } }
```

L'élection du meilleur flux préfère toujours un HLS : une chaîne ne bascule sur
sa source YouTube que si elle n'a rien d'autre. Ces entrées sont également
exclues du contrôle de santé (une page YouTube répond 200 même hors antenne).

### Ce que le projet refuse de faire

`official-sources.ts` tient aussi la liste `EXCLUDED_SOURCES` — les chaînes
écartées **avec la raison**, pour que personne ne reparte en quête d'une source
qui n'existe pas légalement :

* **A+ Ivoire** — chaîne Canal+, abonnement obligatoire ;
* **National Geographic** — chaîne payante en bouquet ;
* **BBC Afrique** — pas de chaîne linéaire ;
* **Business 24** — le flux du site est signé par un jeton expirant en ~3 min.
  Ce jeton est un contrôle d'accès posé par le diffuseur : il n'est **pas**
  contourné. La chaîne passe par son YouTube officiel.

Aucun agrégateur non autorisé (listes « free IPTV », portails Xtream, restreams)
n'est utilisé, quel que soit le cadre d'usage : un usage privé et non commercial
ne rend pas licite la rediffusion sans droits. Pour A+ Ivoire, l'abonnement
Canal+ CI donne accès à la chaîne via myCanal.

---

## Playlists

Six playlists sont créées d'office :

| Slug | Contenu |
|------|---------|
| `maison` | **la playlist à coller dans la TV** : chaînes curées + favoris |
| `france` | groupe de curation « France » |
| `cotedivoire` | toutes les chaînes ivoiriennes ayant un flux public |
| `afrique` | Afrique francophone |
| `documentaires` | documentaire / science / découverte francophones |
| `favoris` | uniquement les favoris |

### Créer la sienne

```bash
curl -X POST http://localhost:3000/api/v1/playlists \
  -H "x-api-key: $ADMIN_API_KEY" -H 'content-type: application/json' \
  -d '{
    "name": "Salon",
    "rules": {
      "groups": ["France", "Côte d'"'"'Ivoire", "Documentaire"],
      "includeFavorites": true,
      "onlyActive": true,
      "hdOnly": true,
      "maxPerGroup": 25
    }
  }'
```

**Sémantique des règles** — c'est ce qui évite les playlists de 20 000 lignes :

* `countries` / `regions` / `languages` / `categories` se combinent en **ET**
  (`categories:[documentary] + languages:[fra]` = documentaires francophones) ;
* `groups`, `channels`, `includeFavorites`, `includeWanted` **s'ajoutent** par-dessus ;
* **sans aucune règle**, la playlist retombe sur la curation — jamais sur « tout ».

Aperçu avant de coller dans la TV :

```bash
curl -s -H "x-api-key: $ADMIN_API_KEY" http://localhost:3000/api/v1/playlists/salon/preview | jq '.groups'
```

---

## API

Toutes les routes sont préfixées par `/api/v1` et exigent le header
`x-api-key`, **sauf** les URL destinées à la TV (`/playlist/*.m3u`, `/epg/*`,
`/health`, `/admin`) qui utilisent un jeton dans l'URL — un lecteur IPTV ne sait
pas envoyer d'en-tête d'authentification.

```
GET    /channels                    ?q= &country= &region= &language= &category= &hd= &active= &wanted= &favorite= &sort= &page= &limit=
GET    /channels/search             ?q=tf1  ?q=rti  ?q=documentaire  ?country=CI&hd=true
GET    /channels/:idOrSlug
PATCH  /channels/:idOrSlug          nom, logo, groupe, catégorie, désactivation
POST   /channels/:idOrSlug/streams  rattacher un flux dont tu disposes légalement
DELETE /channels/streams/:streamId

GET    /countries  /regions  /languages  /categories  /categories/groups

GET    /favorites
POST   /favorites                   { "channelId": "tf1" }
PUT    /favorites/order             { "channelIds": [...] }
DELETE /favorites/:id

GET    /playlists
POST   /playlists
GET    /playlists/:slug/preview
PATCH  /playlists/:slug
DELETE /playlists/:slug
POST   /playlists/:slug/rotate-token
POST   /playlists/:slug/channels/:channelId     épingler
DELETE /playlists/:slug/channels/:channelId     exclure

GET    /t/:code                     ← lien court de la TV, à taper à la télécommande (public)
GET    /playlist/:slug.m3u?token=…  ← même playlist, lien complet (public)
GET    /epg/xmltv.xml?token=…       ← guide XMLTV filtré (public)

POST   /import/run                  ?sync=true pour attendre la fin
POST   /import/health-check
GET    /import/runs  /import/status

GET    /admin/dashboard
POST   /admin/curation/apply
POST   /admin/channels/:idOrSlug/test
POST   /admin/streams/purge-dead
GET    /health
```

---

## Mises à jour automatiques

Deux tâches planifiées (BullMQ, cron configurable) :

| Job | Défaut | Rôle |
|-----|--------|------|
| `nightly-import` | `IMPORT_CRON=0 3 * * *` | re-télécharge iptv-org, met à jour chaînes / logos / EPG, supprime ce qui a disparu, réapplique la curation |
| `periodic-health-check` | `HEALTH_CRON=0 */6 * * *` | teste **tout ce qui sort d'une playlist**, bascule sur un flux de secours, supprime les flux durablement morts |

### Mise en ligne sur un serveur

`docker compose up -d --build` sur une machine neuve reconstruit **tout** :
volumes vides, migrations appliquées par l'entrypoint, import iptv-org au
démarrage, playlists par défaut recréées depuis `default-playlists.ts`.

Trois points à régler avant d'exposer le service sur un domaine :

| Variable | Pourquoi |
|----------|----------|
| `PUBLIC_URL` | l'URL du domaine — c'est elle qu'on écrit dans les liens affichés et dans l'EPG du M3U |
| `ADMIN_API_KEY` | **vide = aucune protection** : le dashboard et toute l'API sont ouverts. Une fois remplie, seules les routes publiques (`/t/:code`, le M3U, l'EPG) restent accessibles sans clé |
| Réservation DHCP / DNS | pour que le lien de la TV ne change plus |

Ce qui **ne** se transporte **pas** tout seul : les réglages faits à l'API sur
une autre instance (règles modifiées, chaînes épinglées, favoris) vivent en base,
pas dans le code. Ce qui doit survivre à une reconstruction se met dans
`default-playlists.ts` — c'est le cas du `shortCode` de la playlist maison, figé
à `tv` pour que `https://<domaine>/t/tv` reste le lien de la télécommande.

### Périmètre du contrôle de santé

`POST /import/health-check` accepte un `scope`, et un filtre `countries` qui se
combine avec lui :

| `scope` | Ce qui est testé | Ordre de grandeur |
|---------|------------------|-------------------|
| `playlists` *(défaut)* | tout ce qui sort d'une playlist, **règles comprises** | ~570 flux |
| `curated` | chaînes voulues, favorites ou épinglées | ~40 flux |
| `all` | le catalogue entier | ~16 000 flux, très lent |

```bash
curl -X POST localhost:3000/api/v1/import/health-check \
  -H 'Content-Type: application/json' -d '{"scope":"playlists"}'
curl -X POST localhost:3000/api/v1/import/health-check \
  -H 'Content-Type: application/json' -d '{"countries":["FR","CI"]}'
```

Deux pièges que le code évite explicitement :

* le périmètre `playlists` **ignore `onlyActive`** — sinon une chaîne déclarée
  morte sortirait de la playlist, donc du périmètre du contrôle, et ne pourrait
  plus jamais être retestée : un faux négatif deviendrait définitif ;
* une chaîne n'est écartée de la playlist qu'après **deux échecs consécutifs**.
  Un contrôle lancé sur un lien saturé fait expirer des flux valides — mesuré :
  sur un partage de connexion mobile, 205 flux vivants sur 396 en 1042 s ; sur
  le même lot en wifi, 265 en 102 s.

Les jobs sont **persistés dans Redis** : un import manqué pendant que le serveur
était éteint est repris au redémarrage. Un import ne réécrit jamais tes
retouches manuelles (nom, logo, groupe, chaîne désactivée, favoris, playlists).

---

## EPG (guide des programmes)

`iptv-org` **ne publie plus** de fichiers XMLTV prêts à l'emploi ; il faut une
source à toi. Le serveur sait fusionner et **filtrer** ces sources sur les seules
chaînes de ta playlist — un guide national brut pèse 50–200 Mo et met une box
Android TV à genoux.

```bash
# 1. quels sites EPG couvrent mes chaînes ?
curl -s -H "x-api-key: $ADMIN_API_KEY" http://localhost:3000/api/v1/epg/grab-hint | jq

# 2. sur une instance https://github.com/iptv-org/epg :
npm run grab --- --site=programme-tv.net --output=guide.xml

# 3. publie guide.xml puis renseigne dans .env :
EPG_SOURCES=https://mon-hote/guide.xml
```

Sans `EPG_SOURCES`, `/epg/xmltv.xml` reste valide mais ne contient que les
définitions de chaînes (logos + noms), sans programmes.

---

## Architecture

```
apps/api/src/
├── config/          configuration typée (12-factor) + validation au démarrage
├── common/          Prisma, cache Redis, garde clé API, filtre d'exceptions, utilitaires
├── curation/        ★ la liste « mes chaînes » et sa résolution
└── modules/
    ├── channels/    listing, recherche trigram, édition manuelle
    ├── countries/ regions/ languages/ categories/   référentiels (cache 1 h)
    ├── favorites/   favoris ordonnés
    ├── playlists/   règles → chaînes → M3U (générateur + résolveur de groupes)
    ├── epg/         XMLTV filtré en streaming
    ├── streams/     santé des flux, élection du meilleur flux
    ├── importer/    client iptv-org, import en masse, parseur M3U
    ├── scheduler/   files BullMQ, worker, amorçage
    ├── admin/       dashboard (API + page HTML autonome)
    └── health/      sonde Terminus
```

Choix structurants :

* **Import en masse par `INSERT … SELECT jsonb_to_recordset … ON CONFLICT`** —
  40 000 chaînes en quelques dizaines de requêtes (~10 s) là où un `upsert` par
  ligne prendrait plusieurs minutes.
* **Recherche via index GIN trigram** sur une colonne `search_text` normalisée
  (sans accents) : `?q=cote divoire` trouve « Côte d'Ivoire ».
* **Unicité des flux par hash SHA-1 de l'URL** : certaines URL IPTV dépassent la
  taille maximale d'une entrée d'index btree (2 704 octets).
* **`BestStreamService` isolé** : import, contrôle de santé et dashboard en ont
  tous besoin — le sortir de l'importeur supprime un cycle de modules.
* **Cache Redis invalidé par motif** (SCAN, jamais KEYS) après chaque import.

### Base de données

`channels`, `streams`, `guides`, `countries`, `regions`, `languages`,
`categories`, `favorites`, `playlists`, `playlist_channels`, `wanted_channels`
(la curation), `import_runs`, `app_settings`.

---

## Tests

```bash
cd apps/api
npm test                                   # unitaires (34)
docker compose up -d postgres redis
npx prisma migrate deploy
npm run test:e2e                           # intégration HTTP (7)
```

---

## Configuration

Tout est dans [`apps/api/.env.example`](apps/api/.env.example). Les variables
qui comptent :

| Variable | Rôle |
|----------|------|
| `PUBLIC_URL` | adresse vue par la TV — compose les liens M3U/EPG |
| `ADMIN_API_KEY` | protège l'API (vide = ouverte, dev uniquement) |
| `IMPORT_COUNTRIES` / `IMPORT_LANGUAGES` | restreindre l'ingestion (ex. `FR,CI` + `fra`) |
| `IMPORT_CRON` / `HEALTH_CRON` | planification |
| `EPG_SOURCES` | sources XMLTV à fusionner |
| `HEALTH_*` | parallélisme, timeout, seuils de suppression des flux morts |

---

## Volumétrie

Mesuré sur le catalogue complet (Mac, Docker) : 40 457 chaînes, 16 059 flux,
179 554 correspondances EPG importés en **9 secondes**. Recherche en quelques
millisecondes, M3U mis en cache 10 minutes, playlists générées à la volée.

## Suite

* Front React / Next.js (le dashboard HTML actuel couvre déjà l'exploitation).
* API GraphQL (bonus du cahier des charges, non implémentée).
* Enregistrement / catch-up.
