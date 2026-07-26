-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "WantedStatus" AS ENUM ('RESOLVED', 'NO_PUBLIC_STREAM', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "PlaylistSort" AS ENUM ('PRIORITY', 'NAME', 'GROUP', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "flag" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" TEXT NOT NULL,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "alt_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "network" TEXT,
    "website" TEXT,
    "logo" TEXT,
    "custom_logo" TEXT,
    "custom_name" TEXT,
    "custom_group" TEXT,
    "country_code" VARCHAR(8),
    "language_code" VARCHAR(8),
    "category" VARCHAR(64),
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stream_url" TEXT,
    "stream_quality" VARCHAR(16),
    "is_hd" BOOLEAN NOT NULL DEFAULT false,
    "is_disabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_nsfw" BOOLEAN NOT NULL DEFAULT false,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "block_reason" TEXT,
    "closed_at" TEXT,
    "epg_id" TEXT,
    "priority_rank" INTEGER,
    "is_wanted" BOOLEAN NOT NULL DEFAULT false,
    "last_checked" TIMESTAMP(3),
    "last_ok_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "search_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streams" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT,
    "url" TEXT NOT NULL,
    "url_hash" CHAR(40) NOT NULL,
    "feed" TEXT,
    "title" TEXT,
    "quality" VARCHAR(16),
    "user_agent" TEXT,
    "referrer" TEXT,
    "is_alive" BOOLEAN NOT NULL DEFAULT false,
    "last_checked" TIMESTAMP(3),
    "last_ok_at" TIMESTAMP(3),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guides" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT,
    "external_channel" TEXT NOT NULL,
    "feed" TEXT,
    "site" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "lang" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wanted_channels" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1000,
    "match_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "match_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "country_code" VARCHAR(8),
    "status" "WantedStatus" NOT NULL DEFAULT 'NOT_FOUND',
    "resolved_channel_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wanted_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "token" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSONB NOT NULL DEFAULT '{}',
    "sort" "PlaylistSort" NOT NULL DEFAULT 'PRIORITY',
    "generated_url" TEXT,
    "channel_count" INTEGER NOT NULL DEFAULT 0,
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_channels" (
    "id" TEXT NOT NULL,
    "playlist_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "excluded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "playlist_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL DEFAULT 'scheduler',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE INDEX "countries_name_idx" ON "countries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "languages_code_key" ON "languages"("code");

-- CreateIndex
CREATE INDEX "languages_name_idx" ON "languages"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "channels_external_id_key" ON "channels"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_slug_key" ON "channels"("slug");

-- CreateIndex
CREATE INDEX "channels_country_code_idx" ON "channels"("country_code");

-- CreateIndex
CREATE INDEX "channels_language_code_idx" ON "channels"("language_code");

-- CreateIndex
CREATE INDEX "channels_category_idx" ON "channels"("category");

-- CreateIndex
CREATE INDEX "channels_is_active_is_disabled_is_blocked_idx" ON "channels"("is_active", "is_disabled", "is_blocked");

-- CreateIndex
CREATE INDEX "channels_priority_rank_idx" ON "channels"("priority_rank");

-- CreateIndex
CREATE UNIQUE INDEX "streams_url_hash_key" ON "streams"("url_hash");

-- CreateIndex
CREATE INDEX "streams_channel_id_idx" ON "streams"("channel_id");

-- CreateIndex
CREATE INDEX "streams_is_alive_idx" ON "streams"("is_alive");

-- CreateIndex
CREATE INDEX "guides_channel_id_idx" ON "guides"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "guides_external_channel_site_site_id_lang_key" ON "guides"("external_channel", "site", "site_id", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "wanted_channels_key_key" ON "wanted_channels"("key");

-- CreateIndex
CREATE INDEX "wanted_channels_group_rank_idx" ON "wanted_channels"("group", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_channel_id_key" ON "favorites"("channel_id");

-- CreateIndex
CREATE INDEX "favorites_position_idx" ON "favorites"("position");

-- CreateIndex
CREATE UNIQUE INDEX "playlists_slug_key" ON "playlists"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "playlists_token_key" ON "playlists"("token");

-- CreateIndex
CREATE INDEX "playlist_channels_playlist_id_position_idx" ON "playlist_channels"("playlist_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_channels_playlist_id_channel_id_key" ON "playlist_channels"("playlist_id", "channel_id");

-- CreateIndex
CREATE INDEX "import_runs_source_started_at_idx" ON "import_runs"("source", "started_at");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "languages"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streams" ADD CONSTRAINT "streams_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guides" ADD CONSTRAINT "guides_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wanted_channels" ADD CONSTRAINT "wanted_channels_resolved_channel_id_fkey" FOREIGN KEY ("resolved_channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_channels" ADD CONSTRAINT "playlist_channels_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_channels" ADD CONSTRAINT "playlist_channels_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
