import { INestApplication } from '@nestjs/common';
import { HealthArtifactType, HealthTimelineEventType, PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';

const COUNTRY = 'R0';
const PDF_BYTES = Buffer.from('%PDF-1.4 r10e-health-upload-test', 'utf8');
const PDF_BASE64 = PDF_BYTES.toString('base64');

async function signIn(app: INestApplication, email: string) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience: 'customer' });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R10-E health document upload (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const doc = emptyPolicyDocument();
    doc.healthcare.health_timeline_enabled = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: COUNTRY } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: COUNTRY,
          isoAlpha3: 'R0E',
          nameI18n: { en: 'R10-E upload test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: 'r10e-upload',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    } else {
      await prisma.policyPack.updateMany({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: doc as never },
      });
    }
    countryId = country.id;
    await app.get(PolicyCache).invalidate(COUNTRY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('uploads a patient health document, projects timeline, and returns payload', async () => {
    const email = `r10e-upload-${uuidv7()}@example.test`;
    const customer = await signIn(app, email);
    const idempotencyKey = `r10e-${uuidv7()}`;

    const upload = await request(app.getHttpServer())
      .post('/api/v1/health/uploads')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        country_code: COUNTRY,
        artifact_type: HealthArtifactType.DOCUMENT,
        title: 'Blood work scan',
        original_name: 'blood-work.pdf',
        content_type: 'application/pdf',
        content_base64: PDF_BASE64,
        idempotency_key: idempotencyKey,
      });
    expect(upload.status).toBe(201);
    expect(upload.body.artifact_id).toBeTruthy();
    expect(upload.body.artifact_type).toBe('DOCUMENT');
    expect(upload.body.timeline_event_id).toBeTruthy();

    const replay = await request(app.getHttpServer())
      .post('/api/v1/health/uploads')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        country_code: COUNTRY,
        artifact_type: HealthArtifactType.DOCUMENT,
        original_name: 'blood-work.pdf',
        content_type: 'application/pdf',
        content_base64: PDF_BASE64,
        idempotency_key: idempotencyKey,
      });
    expect(replay.status).toBe(201);
    expect(replay.body.artifact_id).toBe(upload.body.artifact_id);

    const timeline = await request(app.getHttpServer())
      .get(`/api/v1/health/timeline?country_code=${COUNTRY}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(timeline.status).toBe(200);
    const uploadedEvent = timeline.body.items.find(
      (item: { event_type: string; artifact_id: string }) =>
        item.event_type === HealthTimelineEventType.ARTIFACT_UPLOADED &&
        item.artifact_id === upload.body.artifact_id,
    );
    expect(uploadedEvent).toBeTruthy();
    expect(uploadedEvent.source_module).toBe('upload');

    const metadata = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${upload.body.artifact_id}?country_code=${COUNTRY}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(metadata.status).toBe(200);
    expect(metadata.body.source_module).toBe('upload');
    expect(metadata.body.payload_available).toBe(true);

    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${upload.body.artifact_id}/payload?country_code=${COUNTRY}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(payload.status).toBe(200);
    expect(payload.body.artifact_type).toBe('DOCUMENT');
    expect(payload.body.payload.content_type).toBe('application/pdf');
    expect(payload.body.payload.original_name).toBe('blood-work.pdf');
    expect(Buffer.from(payload.body.payload.content_base64, 'base64').equals(PDF_BYTES)).toBe(true);

    const row = await prisma.healthArtifactUpload.findUnique({
      where: { artifactId: upload.body.artifact_id },
    });
    expect(row?.personId).toBe(customer.personId);
    expect(row?.countryId).toBe(countryId);
    expect(row?.objectKey).toMatch(/^health-uploads\//);
    expect(JSON.stringify(payload.body).includes(row!.objectKey)).toBe(false);
  });

  it('rejects unsupported MIME types', async () => {
    const email = `r10e-bad-mime-${uuidv7()}@example.test`;
    const customer = await signIn(app, email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/health/uploads')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        country_code: COUNTRY,
        artifact_type: HealthArtifactType.DOCUMENT,
        original_name: 'notes.txt',
        content_type: 'text/plain',
        content_base64: Buffer.from('hello', 'utf8').toString('base64'),
      });
    expect(res.status).toBe(400);
  });

  it('forbids cross-patient artifact access', async () => {
    const ownerEmail = `r10e-owner-${uuidv7()}@example.test`;
    const otherEmail = `r10e-other-${uuidv7()}@example.test`;
    const owner = await signIn(app, ownerEmail);
    const other = await signIn(app, otherEmail);

    const upload = await request(app.getHttpServer())
      .post('/api/v1/health/uploads')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        country_code: COUNTRY,
        artifact_type: HealthArtifactType.PRESCRIPTION_UPLOAD,
        original_name: 'rx.jpg',
        content_type: 'image/jpeg',
        content_base64: Buffer.from('fake-jpeg-bytes', 'utf8').toString('base64'),
      });
    expect(upload.status).toBe(201);

    const metadata = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${upload.body.artifact_id}?country_code=${COUNTRY}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(metadata.status).toBe(404);

    const payload = await request(app.getHttpServer())
      .get(`/api/v1/health/artifacts/${upload.body.artifact_id}/payload?country_code=${COUNTRY}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(payload.status).toBe(404);
  });

  it('requires customer authentication', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/health/uploads').send({
      country_code: COUNTRY,
      artifact_type: HealthArtifactType.DOCUMENT,
      original_name: 'x.pdf',
      content_type: 'application/pdf',
      content_base64: PDF_BASE64,
    });
    expect(res.status).toBe(401);
  });
});
