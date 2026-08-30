import { INestApplication } from '@nestjs/common';
import { PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ClinicalSearchService } from '../clinical/clinical-search.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { ClinicalSearchIndexService } from '../search/clinical-search-index.service';
import { EventWorkerService } from '../events/worker.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import { nextPolicyPackVersion } from '../test/next-policy-pack-version';
import {
  ensureClinicalRelationship,
  publishLabHealthArtifactFixture,
  seedDoctorPartner,
} from '../test/publish-lab-health-artifact';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' | 'doctor' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function attachOrgRole(
  prisma: PrismaService,
  personId: string,
  roleCode: string,
  organizationId: string,
) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role!.id,
      scope: 'organization',
      organizationId,
      status: 'ACTIVE',
    },
  });
}

function assertNoSensitivePayload(body: unknown) {
  ClinicalSearchService.assertNoSensitivePayload(body);
}

describe('R13-G clinical search (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
  let clinicalIndex: ClinicalSearchIndexService;
  let eventWorker: EventWorkerService;

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
    orgs = app.get(OrganizationService);
    clinicalIndex = app.get(ClinicalSearchIndexService);
    eventWorker = app.get(EventWorkerService);
  });

  afterAll(async () => {
    await app?.close();
  });

  function searchUrl(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    return `/api/v1/clinical/search?${qs}`;
  }

  async function enableClinicalSearchPack(countryId: string, enabled: boolean) {
    const doc = emptyPolicyDocument();
    doc.healthcare.health_timeline_enabled = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.clinical_search_enabled = enabled;
    doc.partner_types.DOCTOR.enabled = true;
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId,
        version: await nextPolicyPackVersion(prisma, countryId),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `r13g-${enabled}-${Date.now()}`,
        publishedAt: new Date(),
      },
    });
    const pack = await prisma.policyPack.findFirst({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({ where: { id: countryId }, data: { publishedPolicyPackId: pack.id } });
    }
    const country = await prisma.country.findUnique({ where: { id: countryId } });
    if (country) {
      await app.get(PolicyCache).invalidate(country.isoAlpha2);
    }
  }

  it('fails closed when clinical_search_enabled policy gate is off', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    await enableClinicalSearchPack(ctx.country.id, false);
    const doctor = await signIn(app, `r13g-doc-gate-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    const clinic = await prisma.organization.findFirst({ where: { countryId: ctx.country.id } });
    if (clinic) {
      await attachOrgRole(prisma, doctor.personId, 'clinic_doctor', clinic.id);
    }
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);
    await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({ recipient_partner_id: partner.id, purpose: 'treatment', scope: ['LAB_REPORT'] });

    const res = await request(app.getHttpServer())
      .get(
        searchUrl({
          country_code: 'XX',
          patient_person_id: ctx.customerA.personId,
          q: 'lab',
          purpose: 'treatment',
        }),
      )
      .set(ctx.auth(doctor.token));
    expect(res.status).toBe(403);
  });

  async function processClinicalPublishOutbox(artifactId: string) {
    const outboxRow = await prisma.outboxEvent.findFirst({
      where: {
        type: { in: ['LAB_REPORT_PUBLISHED', 'IMAGING_REPORT_PUBLISHED'] },
        payload: { path: ['artifact_id'], equals: artifactId },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!outboxRow) {
      throw new Error(`Expected publish outbox event for artifact ${artifactId}`);
    }
    await eventWorker.handle(outboxRow.id);
  }

  it('auto-indexes clinical search when lab report publish outbox is processed', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const before = await prisma.clinicalSearchDocument.findUnique({
      where: { artifactId_countryId: { artifactId: ctx.artifactId, countryId: ctx.country.id } },
    });
    expect(before).toBeNull();
    await processClinicalPublishOutbox(ctx.artifactId);
    const indexed = await prisma.clinicalSearchDocument.findUnique({
      where: { artifactId_countryId: { artifactId: ctx.artifactId, countryId: ctx.country.id } },
    });
    expect(indexed?.published).toBe(true);
    expect(indexed?.artifactType).toBe('LAB_REPORT');
  });

  it('allows authorized doctor search with consent and metadata-only results', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    await enableClinicalSearchPack(ctx.country.id, true);
    const doctor = await signIn(app, `r13g-doc-ok-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    const clinic = await prisma.organization.findFirst({ where: { countryId: ctx.country.id } });
    if (clinic) {
      await attachOrgRole(prisma, doctor.personId, 'clinic_doctor', clinic.id);
    }
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);
    await processClinicalPublishOutbox(ctx.artifactId);

    await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({ recipient_partner_id: partner.id, purpose: 'treatment', scope: ['LAB_REPORT'] });

    const res = await request(app.getHttpServer())
      .get(
        searchUrl({
          country_code: 'XX',
          patient_person_id: ctx.customerA.personId,
          q: 'lab',
          purpose: 'treatment',
        }),
      )
      .set(ctx.auth(doctor.token))
      .set('X-Request-Id', `r13g-ok-${suffix}`);
    expect(res.status).toBe(200);
    assertNoSensitivePayload(res.body);
    expect(res.body.result_count).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].artifact_id).toBe(ctx.artifactId);
    expect(res.body.items[0].artifact_type).toBe('LAB_REPORT');
    expect(res.body.items[0].title).toBeTruthy();
    expect(res.body.items[0].payload).toBeUndefined();

    const event = await prisma.securityEvent.findFirst({
      where: { type: 'CLINICAL_SEARCH_QUERY', personId: doctor.personId },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).toBeTruthy();
    const meta = JSON.stringify(event?.metadata ?? {});
    expect(meta.includes('lab')).toBe(false);
    expect(meta.includes('query_hash')).toBe(true);
  });

  it('denies customer audience and doctor without clinical:search permission', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    await enableClinicalSearchPack(ctx.country.id, true);
    const doctor = await signIn(app, `r13g-doc-deny-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);

    const customerAttempt = await request(app.getHttpServer())
      .get(
        searchUrl({
          country_code: 'XX',
          patient_person_id: ctx.customerA.personId,
          q: 'lab',
          purpose: 'treatment',
        }),
      )
      .set(ctx.auth(ctx.customerA.token));
    expect(customerAttempt.status).toBe(403);

    const doctorNoPerm = await request(app.getHttpServer())
      .get(
        searchUrl({
          country_code: 'XX',
          patient_person_id: ctx.customerA.personId,
          q: 'lab',
          purpose: 'treatment',
        }),
      )
      .set(ctx.auth(doctor.token));
    expect(doctorNoPerm.status).toBe(403);
  });

  it('does not expose clinical records via public discovery search', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    await enableClinicalSearchPack(ctx.country.id, true);
    await processClinicalPublishOutbox(ctx.artifactId);
    const artifact = await prisma.healthArtifact.findUnique({ where: { id: ctx.artifactId } });
    const titleToken = (artifact?.title ?? 'lab').split(' ')[0] ?? 'lab';

    const discovery = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=XX&q=${encodeURIComponent(titleToken)}&types=commerce&types=help&types=doctor`,
    );
    expect(discovery.status).toBe(200);
    const raw = JSON.stringify(discovery.body).toLowerCase();
    expect(raw.includes(ctx.artifactId.toLowerCase())).toBe(false);
    expect(raw.includes('clinical')).toBe(false);
  });

  it('blocks symptom-to-drug style queries and denies without consent', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    await enableClinicalSearchPack(ctx.country.id, true);
    const doctor = await signIn(app, `r13g-doc-block-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    const clinic = await prisma.organization.findFirst({ where: { countryId: ctx.country.id } });
    if (clinic) {
      await attachOrgRole(prisma, doctor.personId, 'clinic_doctor', clinic.id);
    }
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);
    await processClinicalPublishOutbox(ctx.artifactId);

    const blocked = await request(app.getHttpServer())
      .get(
        searchUrl({
          country_code: 'XX',
          patient_person_id: ctx.customerA.personId,
          q: 'symptom fever drug',
          purpose: 'treatment',
        }),
      )
      .set(ctx.auth(doctor.token));
    expect(blocked.status).toBe(403);

    const noConsent = await request(app.getHttpServer())
      .get(
        searchUrl({
          country_code: 'XX',
          patient_person_id: ctx.customerA.personId,
          q: 'report',
          purpose: 'treatment',
        }),
      )
      .set(ctx.auth(doctor.token));
    expect(noConsent.status).toBe(403);
  });

  it('isolates patient scope and returns empty for wrong patient', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    await enableClinicalSearchPack(ctx.country.id, true);
    const doctor = await signIn(app, `r13g-doc-iso-${suffix}@example.com`, 'doctor');
    const partner = await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);
    const clinic = await prisma.organization.findFirst({ where: { countryId: ctx.country.id } });
    if (clinic) {
      await attachOrgRole(prisma, doctor.personId, 'clinic_doctor', clinic.id);
    }
    await ensureClinicalRelationship(prisma, ctx.country.id, ctx.customerA.personId, partner.id);
    await processClinicalPublishOutbox(ctx.artifactId);

    await request(app.getHttpServer())
      .post('/api/v1/consent/grants')
      .set(ctx.auth(ctx.customerA.token))
      .send({ recipient_partner_id: partner.id, purpose: 'treatment', scope: ['LAB_REPORT'] });

    const wrongPatient = await request(app.getHttpServer())
      .get(
        searchUrl({
          country_code: 'XX',
          patient_person_id: ctx.customerB.personId,
          q: 'lab',
          purpose: 'treatment',
        }),
      )
      .set(ctx.auth(doctor.token));
    expect(wrongPatient.status).toBe(403);
  });

  it('reindexes clinical documents deterministically', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    await clinicalIndex.reindexArtifact(ctx.artifactId, ctx.country.id);
    const first = await prisma.clinicalSearchDocument.findUnique({
      where: { artifactId_countryId: { artifactId: ctx.artifactId, countryId: ctx.country.id } },
    });
    await clinicalIndex.reindexArtifact(ctx.artifactId, ctx.country.id);
    const second = await prisma.clinicalSearchDocument.findUnique({
      where: { artifactId_countryId: { artifactId: ctx.artifactId, countryId: ctx.country.id } },
    });
    expect(first?.title).toBe(second?.title);
    expect((second?.version ?? 0)).toBeGreaterThan(first?.version ?? 0);
  });
});
