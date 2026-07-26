-- Nature d'un flux : un manifeste HLS est lisible par tous les lecteurs IPTV,
-- un direct YouTube officiel ne l'est que par certains (VLC, OTT Navigator).
-- La distinction permet d'exclure ces derniers des playlists par défaut.
CREATE TYPE "StreamKind" AS ENUM ('HLS', 'YOUTUBE');

ALTER TABLE "streams" ADD COLUMN "kind" "StreamKind" NOT NULL DEFAULT 'HLS';

ALTER TABLE "channels" ADD COLUMN "stream_kind" "StreamKind";

-- Les chaînes ayant déjà un flux élu proviennent toutes d'iptv-org : HLS.
UPDATE "channels" SET "stream_kind" = 'HLS' WHERE "stream_url" IS NOT NULL;
