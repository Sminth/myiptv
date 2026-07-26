import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { DEFAULT_PLAYLISTS } from '../src/modules/playlists/default-playlists';
import { WANTED_CHANNELS } from '../src/curation/curation.config';

const prisma = new PrismaClient();

/**
 * Amorce ce qui ne vient pas de l'import : la liste de curation et les
 * playlists par défaut. Idempotent — rejouable à volonté.
 */
async function main(): Promise<void> {
  for (const spec of WANTED_CHANNELS) {
    await prisma.wantedChannel.upsert({
      where: { key: spec.key },
      create: {
        key: spec.key,
        label: spec.label,
        group: spec.group,
        rank: spec.rank,
        matchIds: spec.matchIds ?? [],
        matchNames: spec.matchNames ?? [],
        countryCode: spec.countryCode ?? null,
        note: spec.note ?? null,
      },
      update: {
        label: spec.label,
        group: spec.group,
        rank: spec.rank,
        matchIds: spec.matchIds ?? [],
        matchNames: spec.matchNames ?? [],
        countryCode: spec.countryCode ?? null,
        note: spec.note ?? null,
      },
    });
  }
  console.log(`[seed] ${WANTED_CHANNELS.length} wanted channels`);

  for (const playlist of DEFAULT_PLAYLISTS) {
    await prisma.playlist.upsert({
      where: { slug: playlist.slug },
      create: {
        slug: playlist.slug,
        name: playlist.name,
        description: playlist.description,
        rules: playlist.rules as object,
        token: randomBytes(16).toString('hex'),
      },
      // Le jeton existant n'est jamais réécrit : le lien déjà collé dans la TV
      // doit survivre à un `db:seed`.
      update: { name: playlist.name, description: playlist.description, rules: playlist.rules as object },
    });
  }

  const home = await prisma.playlist.findUnique({ where: { slug: 'maison' } });
  console.log(`[seed] ${DEFAULT_PLAYLISTS.length} playlists`);
  if (home) console.log(`[seed] TV link token: ${home.token}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
