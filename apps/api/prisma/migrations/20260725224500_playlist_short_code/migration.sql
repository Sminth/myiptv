-- Lien court à saisir à la télécommande : /t/<code> au lieu de
-- /api/v1/playlist/<slug>.m3u?token=<32 caractères>.
ALTER TABLE "playlists" ADD COLUMN "short_code" VARCHAR(12);
CREATE UNIQUE INDEX "playlists_short_code_key" ON "playlists"("short_code");
