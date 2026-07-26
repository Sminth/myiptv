import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from 'src/app.module';
import { PrismaService } from 'src/common/prisma/prisma.service';

/**
 * Test d'intégration : PostgreSQL et Redis doivent tourner
 * (`docker compose up -d postgres redis` + `npx prisma migrate deploy`).
 *
 * On coupe l'import au démarrage : ce test valide le contrat HTTP, pas la
 * capacité à télécharger 55 Mo depuis iptv-org.
 */
describe('API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.IMPORT_ON_BOOT = 'false';
    process.env.ADMIN_API_KEY = '';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/health → base et cache joignables', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.info.database.status).toBe('up');
    expect(response.body.info.redis.status).toBe('up');
  });

  it('GET /api/v1/channels → réponse paginée', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/channels?limit=5')
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 5 });
  });

  it('GET /api/v1/channels/search → refuse une limite hors bornes', async () => {
    await request(app.getHttpServer()).get('/api/v1/channels/search?limit=9999').expect(400);
  });

  it('GET /api/v1/playlist/:slug.m3u → fichier M3U servi au bon type MIME', async () => {
    await prisma.playlist.upsert({
      where: { slug: 'e2e' },
      create: { slug: 'e2e', name: 'E2E', token: 'e2e-token', rules: { includeWanted: true } },
      update: {},
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/playlist/e2e.m3u?token=e2e-token')
      .buffer(true)
      .expect(200);

    expect(response.headers['content-type']).toContain('audio/x-mpegurl');
    // supertest ne décode pas `audio/x-mpegurl` en texte : le corps arrive en Buffer.
    const body: string = response.text ?? (response.body as Buffer).toString('utf8');
    expect(body.startsWith('#EXTM3U')).toBe(true);

    await prisma.playlist.delete({ where: { slug: 'e2e' } });
  });

  it('GET /api/v1/playlist/:slug.m3u → 404 sur une playlist inconnue', async () => {
    await request(app.getHttpServer()).get('/api/v1/playlist/inconnue.m3u').expect(404);
  });

  it('GET /api/v1/epg/xmltv.xml → XMLTV bien formé', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/epg/xmltv.xml').expect(200);

    expect(response.headers['content-type']).toContain('application/xml');
    expect(response.text).toContain('<tv generator-info-name="iptv-manager">');
    expect(response.text.trim().endsWith('</tv>')).toBe(true);
  });

  it('GET /api/v1/countries → référentiel importé ou vide, jamais en erreur', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/countries').expect(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
