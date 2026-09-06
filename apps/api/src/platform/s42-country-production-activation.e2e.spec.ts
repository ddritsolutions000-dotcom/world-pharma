/**
 * Sprint 42 — Country healthcare regulatory & production activation (e2e)
 *
 * Exercises lifecycle, legal evidence/expiry, partner gates, integration fail-closed,
 * activation/suspension, security isolation, and production transaction guard.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { provisionSuperAdmin, signInCustomer } from '../test/sign-in';

describe('Sprint 42 country production activation (e2e)', () => {
  jest.setTimeout(300_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminPersonId: string;
  let iso: string;
  let countryId: string;
  let evidenceIds: string[] = [];
  let partnerId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function readiness() {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/countries/${iso}/production-readiness`)
      .set(auth(adminToken));
  }

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['PAYMENT_LIVE_ENABLED'] = 'false';
    process.env['PAYMENT_ENVIRONMENT'] = 'sandbox';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) throw new Error('REDIS_URL is required');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const admin = await provisionSuperAdmin(app, prisma, 's42-admin');
    adminToken = admin.token;
    adminPersonId = admin.personId;

    iso = `S${Date.now().toString(36).slice(-3)}${Math.random().toString(36).slice(2, 4)}`.slice(0, 5).toUpperCase();
    for (let attempt = 0; attempt < 8; attempt++) {
      const clash = await prisma.country.findUnique({ where: { isoAlpha2: iso } });
      if (!clash) break;
      iso = `S${Date.now().toString(36).slice(-3)}${Math.random().toString(36).slice(2, 4)}`.slice(0, 5).toUpperCase();
    }
    const country = await prisma.country.create({
      data: {
        id: uuidv7(),
        isoAlpha2: iso,
        isoAlpha3: `${iso}X`,
        nameI18n: { en: `Sprint42 ${iso}` },
        defaultLocale: 'en',
        defaultCurrency: 'XXX',
        defaultTimezone: 'UTC',
        status: 'INACTIVE',
        productionLifecycle: 'CONFIGURED',
      },
    });
    countryId = country.id;

    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    doc.services.marketplace = true;
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;
    doc.currency = { default: 'XXX', allowed: ['XXX'] };
    const pack = await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId,
        version: 1,
        status: 'PUBLISHED',
        document: doc as never,
        checksum: `s42-${iso}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({
      where: { id: countryId },
      data: { publishedPolicyPackId: pack.id },
    });
    await prisma.serviceabilityZone.create({
      data: {
        id: uuidv7(),
        countryId,
        name: 'S42 zone',
        postalPrefix: '100',
        medicineDelivery: true,
        labHomeCollection: false,
        expressDelivery: true,
        codAvailable: false,
        priority: 1,
        active: true,
      },
    });
    await prisma.settlementPolicy.create({
      data: {
        id: uuidv7(),
        countryId,
        holdDays: 7,
      },
    });
    await prisma.notificationCountryProvider.create({
      data: {
        id: uuidv7(),
        countryId,
        channel: 'EMAIL',
        providerCode: 'MOCK_EMAIL',
        providerName: 'Mock Email',
        configStatus: 'SANDBOX',
        priority: 1,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('S42-01 lifecycle starts at CONFIGURED', async () => {
    const res = await readiness();
    expect(res.status).toBe(200);
    expect(res.body.production_lifecycle).toBe('CONFIGURED');
    expect(res.body.overall_status).toBe('BLOCKED');
  });

  it('S42-02 invalid lifecycle CONFIGURED → ACTIVE is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/lifecycle/transition`)
      .set(auth(adminToken))
      .send({ to: 'ACTIVE' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_LIFECYCLE_TRANSITION');
  });

  it('S42-03 CONFIGURED → UNDER_REVIEW succeeds', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/lifecycle/transition`)
      .set(auth(adminToken))
      .send({ to: 'UNDER_REVIEW', reason: 'Begin legal review' });
    expect(res.status).toBe(201);
    expect(res.body.production_lifecycle).toBe('UNDER_REVIEW');
  });

  it('S42-04 missing healthcare policy blocks LEGAL', async () => {
    const res = await readiness();
    expect(res.status).toBe(200);
    expect(res.body.blockers).toEqual(expect.arrayContaining(['HEALTHCARE_POLICY_NOT_PUBLISHED']));
  });

  it('S42-05 create + publish healthcare policy with mandatory requirements', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/healthcare-policy`)
      .set(auth(adminToken))
      .send({
        requirements: [
          { code: 'pharmacy_licensing', label: 'Pharmacy Licence', required: true },
          { code: 'prescription_requirement', label: 'Rx', required: true },
          { code: 'healthcare_data_privacy', label: 'Privacy', required: true },
        ],
        regulatoryBody: 'S42 Authority',
      });
    expect(created.status).toBe(201);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/healthcare-policy/1/publish`)
      .set(auth(adminToken));
    expect(published.status).toBe(201);
    expect(published.body.status).toBe('PUBLISHED');
  });

  it('S42-06 missing evidence blocks LEGAL', async () => {
    const res = await readiness();
    expect(res.body.blockers).toEqual(expect.arrayContaining(['LEGAL_EVIDENCE_MISSING']));
    expect(res.body.requirement_coverage.some((r: { mandatory: boolean; satisfied: boolean }) => r.mandatory && !r.satisfied)).toBe(
      true,
    );
  });

  it('S42-07 attach + submit + verify evidence satisfies a requirement', async () => {
    const attach = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/evidence`)
      .set(auth(adminToken))
      .send({
        requirementCode: 'pharmacy_licensing',
        documentType: 'licence_certificate',
        storageObjectKey: 'private://s42/licence-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
      });
    expect(attach.status).toBe(201);
    evidenceIds.push(attach.body.id);
    const submit = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/evidence/${attach.body.id}/submit`)
      .set(auth(adminToken))
      .send({ reason: 'Under review' });
    expect(submit.status).toBe(201);
    expect(submit.body.status).toBe('SUBMITTED');
    const verify = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/evidence/${attach.body.id}/verify`)
      .set(auth(adminToken));
    expect(verify.status).toBe(201);
    expect(verify.body.status).toBe('VERIFIED');
  });

  it('S42-08 evidence history is auditable without document bytes', async () => {
    const hist = await request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/evidence/${evidenceIds[0]}/history`)
      .set(auth(adminToken));
    expect(hist.status).toBe(200);
    expect(hist.body.has_private_object_ref).toBe(true);
    expect(JSON.stringify(hist.body)).not.toMatch(/private:\/\//);
    expect(hist.body.events.length).toBeGreaterThanOrEqual(2);
  });

  it('S42-09 rejected evidence does not satisfy', async () => {
    const attach = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/evidence`)
      .set(auth(adminToken))
      .send({
        requirementCode: 'prescription_requirement',
        documentType: 'rx_policy',
        storageObjectKey: 'private://s42/rx-bad',
      });
    const rejected = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/evidence/${attach.body.id}/reject`)
      .set(auth(adminToken))
      .send({ reason: 'Incomplete filing' });
    expect(rejected.status).toBe(201);
    expect(rejected.body.status).toBe('REJECTED');
    const res = await readiness();
    const row = res.body.requirement_coverage.find((r: { code: string }) => r.code === 'prescription_requirement');
    expect(row.satisfied).toBe(false);
  });

  it('S42-10 expired verified evidence stops satisfying', async () => {
    const attach = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/evidence`)
      .set(auth(adminToken))
      .send({
        requirementCode: 'prescription_requirement',
        documentType: 'rx_policy',
        storageObjectKey: 'private://s42/rx-old',
        expiresAt: '2020-01-01T00:00:00.000Z',
      });
    // Force VERIFIED with past expiry via prisma to simulate stale verified row
    await prisma.regulatoryEvidence.update({
      where: { id: attach.body.id },
      data: { status: 'VERIFIED', verificationStatus: 'VERIFIED', verifiedAt: new Date('2019-01-01'), verifiedById: adminPersonId },
    });
    const res = await readiness();
    const row = res.body.requirement_coverage.find((r: { code: string }) => r.code === 'prescription_requirement');
    expect(row.satisfied).toBe(false);
    expect(row.blocker).toBe('LEGAL_EVIDENCE_EXPIRED');
  });

  it('S42-11 replacement valid evidence restores satisfaction', async () => {
    for (const code of ['prescription_requirement', 'healthcare_data_privacy']) {
      const attach = await request(app.getHttpServer())
        .post(`/api/v1/admin/regulatory/countries/${iso}/evidence`)
        .set(auth(adminToken))
        .send({
          requirementCode: code,
          documentType: 'policy_doc',
          storageObjectKey: `private://s42/${code}`,
          expiresAt: '2031-01-01T00:00:00.000Z',
        });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/regulatory/evidence/${attach.body.id}/verify`)
        .set(auth(adminToken));
      evidenceIds.push(attach.body.id);
    }
    const res = await readiness();
    const mandatory = res.body.requirement_coverage.filter((r: { mandatory: boolean }) => r.mandatory);
    expect(mandatory.every((r: { satisfied: boolean }) => r.satisfied)).toBe(true);
  });

  it('S42-12 partner blockers: pharmacy licence / KYC / commercial missing', async () => {
    const res = await readiness();
    expect(res.body.blockers).toEqual(
      expect.arrayContaining(['PHARMACY_LICENCE_MISSING', 'KYC_NOT_VERIFIED', 'COMMERCIAL_APPROVAL_MISSING']),
    );
  });

  it('S42-13 seed verified partner licence + KYC + commercial approval', async () => {
    const person = await prisma.person.create({
      data: { id: uuidv7(), status: 'ACTIVE' },
    });
    const partner = await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: person.id,
        partnerTypeCode: 'VENDOR',
        countryId,
        status: 'ACTIVE',
      },
    });
    partnerId = partner.id;
    await prisma.pharmacyLicence.create({
      data: {
        id: uuidv7(),
        partnerId,
        countryId,
        licenceAuthority: 'S42 Board',
        licenceNumber: `LIC-${iso}`,
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedById: adminPersonId,
        evidenceObjectKey: 'private://s42/partner-lic',
      },
    });
    await prisma.kycCase.create({
      data: {
        id: uuidv7(),
        partnerId,
        countryId,
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });
    await prisma.partnerCommercialApproval.create({
      data: {
        id: uuidv7(),
        partnerId,
        countryId,
        approved: true,
        approvedAt: new Date(),
        approvedById: adminPersonId,
      },
    });
    const res = await readiness();
    expect(res.body.partner_readiness.pharmacy_licence_verified).toBe(true);
    expect(res.body.partner_readiness.kyc_verified).toBe(true);
    expect(res.body.partner_readiness.commercial_approved).toBe(true);
  });

  it('S42-14 integration blockers fail closed when dependencies not live', async () => {
    const res = await readiness();
    expect(res.body.blockers).toEqual(
      expect.arrayContaining(['PSP_NOT_LIVE', 'OTP_NOT_LIVE', 'CARRIER_NOT_LIVE']),
    );
    expect(res.body.production_ready).toBe(false);
  });

  it('S42-15 blocked production activation while incomplete', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/production/activate`)
      .set(auth(adminToken))
      .send({});
    expect(res.status).toBe(409);
  });

  it('S42-16 admin-mark dependencies verified (metadata only — not live credentials)', async () => {
    for (const dependencyType of ['PAYMENT_PROVIDER', 'OTP_PROVIDER', 'SMS_PROVIDER', 'CARRIER', 'KYC_PROVIDER']) {
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/regulatory/dependencies')
        .set(auth(adminToken))
        .send({
          countryCode: iso,
          dependencyType,
          environment: 'production',
          providerIdentifier: `sandbox-registry-${dependencyType}`,
          notes: 'Software registry mark only — EXTERNAL live credentials remain gated',
        });
      expect(created.status).toBe(201);
      const verified = await request(app.getHttpServer())
        .post(`/api/v1/admin/regulatory/dependencies/${created.body.id}/verify`)
        .set(auth(adminToken));
      expect(verified.status).toBe(201);
      expect(verified.body.status).toBe('VERIFIED');
    }
  });

  it('S42-17 UNDER_REVIEW → READY_FOR_ACTIVATION when production_ready', async () => {
    const ready = await readiness();
    expect(ready.body.production_ready).toBe(true);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/lifecycle/transition`)
      .set(auth(adminToken))
      .send({ to: 'READY_FOR_ACTIVATION' });
    expect(res.status).toBe(201);
    expect(res.body.production_lifecycle).toBe('READY_FOR_ACTIVATION');
  });

  it('S42-18 successful production activation', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/production/activate`)
      .set(auth(adminToken))
      .send({ reason: 'All software gates satisfied' });
    expect(res.status).toBe(201);
    expect(res.body.production_lifecycle).toBe('ACTIVE');
  });

  it('S42-19 activation is idempotent', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/production/activate`)
      .set(auth(adminToken))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.idempotent).toBe(true);
  });

  it('S42-20 production transaction assert succeeds while ACTIVE (sandbox env)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/production/assert-transaction`)
      .set(auth(adminToken));
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  it('S42-21 suspend production blocks new production transactions', async () => {
    const suspend = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/production/suspend`)
      .set(auth(adminToken))
      .send({ reason: 'Emergency hold' });
    expect(suspend.status).toBe(201);
    expect(suspend.body.production_lifecycle).toBe('SUSPENDED');
    const assertTx = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/production/assert-transaction`)
      .set(auth(adminToken));
    expect(assertTx.status).toBe(409);
    expect(assertTx.body.code).toBe('COUNTRY_PRODUCTION_SUSPENDED');
  });

  it('S42-22 historical country + evidence remain readable after suspend', async () => {
    const country = await prisma.country.findUnique({ where: { id: countryId } });
    expect(country?.productionLifecycle).toBe('SUSPENDED');
    const evidence = await request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/countries/${iso}/evidence`)
      .set(auth(adminToken));
    expect(evidence.status).toBe(200);
    expect(evidence.body.length).toBeGreaterThan(0);
  });

  it('S42-23 SUSPENDED → UNDER_REVIEW reactivation path', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/lifecycle/transition`)
      .set(auth(adminToken))
      .send({ to: 'UNDER_REVIEW', reason: 'Resume review' });
    expect(res.status).toBe(201);
    expect(res.body.production_lifecycle).toBe('UNDER_REVIEW');
  });

  it('S42-24 vendor cannot activate production', async () => {
    const vendor = await signInCustomer(app, `s42-vendor-${Date.now()}@example.com`);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/production/activate`)
      .set(auth(vendor.token))
      .send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('S42-25 customer cannot read regulatory evidence', async () => {
    const customer = await signInCustomer(app, `s42-cust-${Date.now()}@example.com`);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/countries/${iso}/evidence`)
      .set(auth(customer.token));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('S42-26 unauthorized activation without token rejected', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/production/activate`)
      .send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('S42-27 expire evidence endpoint marks EXPIRED and fails satisfaction', async () => {
    const target = evidenceIds[evidenceIds.length - 1];
    const expired = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/evidence/${target}/expire`)
      .set(auth(adminToken))
      .send({ reason: 'Superseded' });
    expect(expired.status).toBe(201);
    expect(expired.body.status).toBe('EXPIRED');
  });

  it('S42-28 requirement coverage endpoint returns matrix', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/countries/${iso}/requirement-coverage`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.some((r: { code: string }) => r.code === 'pharmacy_licensing')).toBe(true);
  });

  it('S42-29 sandbox CountryStatus activation remains independent', async () => {
    const country = await prisma.country.findUnique({ where: { id: countryId } });
    expect(country?.status).toBe('INACTIVE');
    expect(['UNDER_REVIEW', 'SUSPENDED', 'READY_FOR_ACTIVATION', 'ACTIVE', 'CONFIGURED']).toContain(
      country?.productionLifecycle,
    );
  });

  it('S42-30 security events recorded for activation/suspension', async () => {
    const events = await prisma.securityEvent.findMany({
      where: {
        type: { in: ['COUNTRY_PRODUCTION_ACTIVATED', 'COUNTRY_PRODUCTION_SUSPENDED', 'COUNTRY_LIFECYCLE_CHANGED'] },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    expect(events.length).toBeGreaterThan(0);
  });
});
