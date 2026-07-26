-- Index de recherche : Prisma ne sait pas déclarer un index GIN trigram, on le
-- pose à la main. C'est lui qui rend `/channels/search?q=…` instantané sur
-- 40 000 chaînes (un LIKE '%tf1%' sans trigram fait un seq scan complet).
CREATE INDEX IF NOT EXISTS "channels_search_text_trgm_idx"
  ON "channels" USING GIN ("search_text" gin_trgm_ops);

-- Les filtres par catégorie / région utilisent l'opérateur « tableau contient ».
CREATE INDEX IF NOT EXISTS "channels_categories_gin_idx"
  ON "channels" USING GIN ("categories");

CREATE INDEX IF NOT EXISTS "channels_regions_gin_idx"
  ON "channels" USING GIN ("regions");

-- Tri des playlists : curation d'abord, chaînes actives ensuite.
CREATE INDEX IF NOT EXISTS "channels_playlist_order_idx"
  ON "channels" ("priority_rank" ASC NULLS LAST, "name" ASC)
  WHERE "is_blocked" = false AND "is_disabled" = false;
