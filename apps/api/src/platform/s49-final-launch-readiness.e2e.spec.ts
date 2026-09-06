/**
 * Sprint 49 — Final Real-Market Launch Readiness control plane (e2e)
 *
 * Composes S39–S48 gates. Never fakes EXTERNAL_GATED → READY.
 * Sandbox remains usable; production-bound activation stays fail-closed.
 */
import { INestApplication } from '@nestjs/common';
import { CountryProductionLifecycle, CountryStatus, PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { configureApi } from '../common/http-setup';
import { parseEnv } from '@world-pharma/config';
import { applyTestIsolation } from '../test/isolate-runtime';
import { provisionSuperAdmin, signInCustomer } from '../test/sign-in';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { FinalLaunchReadinessService } from './final-launch-readiness.service';
import { isLivePaymentEnabled, readPaymentEnvironment } from '../payment/payment.config';

describe('Sprint 49 final launch readiness (e2e)', () => {
  jest.setTimeout(360_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let finalLaunch: FinalLaunchReadinessService;
  let adminToken: string;
  let countryId: string;
  let ISO: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] = process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    process.env['CORS_ALLOWED_ORIGINS'] = process.env['CORS_ALLOWED_ORIGINS'] ?? 'http://localhost:3000';
    process.env['PAYMENT_ENVIRONMENT'] = 'sandbox';
    process.env['PAYMENT_LIVE_ENABLED'] = 'false';
    if (!process.env['REDIS_URL']) throw new Error('REDIS_URL is required');

    const env = parseEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApi(app, env);
    await app.init();
    prisma = app.get(PrismaService);
    finalLaunch = app.get(FinalLaunchReadinessService);
    const admin = await provisionSuperAdmin(app, prisma, 's49-admin');
    adminToken = admin.token;

    ISO = `L${Date.now().toString(36).slice(-2).toUpperCase()}`;
    const country = await prisma.country.create({
      data: {
        id: uuidv7(),
        isoAlpha2: ISO,
        isoAlpha3: `${ISO}X`,
        nameI18n: { en: `Sprint49 ${ISO}` },
        defaultLocale: 'en',
        defaultCurrency: 'XXX',
        defaultTimezone: 'UTC',
        status: CountryStatus.INACTIVE,
        productionLifecycle: CountryProductionLifecycle.CONFIGURED,
      },
    });
    countryId = country.id;

    const doc = emptyPolicyDocument();
    doc.currency = { default: 'XXX', allowed: ['XXX'] };
    const pack = await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId,
        version: 1,
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `s49-${ISO}`,
        publishedAt: new Date(),
      },
    });
    await prisma.country.update({
      where: { id: countryId },
      data: { publishedPolicyPackId: pack.id },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function fetchFinal(iso = ISO) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/countries/${iso}/final-launch-readiness`)
      .set(auth(adminToken));
  }

  it('S49-01 Main Admin can inspect final readiness', async () => {
    const res = await fetchFinal();
    expect(res.status).toBe(200);
    expect(res.body.country_code).toBe(ISO);
    expect(res.body.never_fake_green).toBe(true);
    expect(res.body.sources.payment_gate).toBe(true);
    expect(res.body.sources.healthcare_gate).toBe(true);
  });

  it('S49-02 fully blocked / not ready overall for undeveloped country', async () => {
    const res = await fetchFinal();
    expect(res.status).toBe(200);
    expect(res.body.overall_decision).toBe('NOT_READY');
    expect(res.body.activation_impossible).toBe(true);
    expect(res.body.blockers.length).toBeGreaterThan(0);
  });

  it('S49-03 exposes all mandatory dimensions including OVERALL', async () => {
    const res = await fetchFinal();
    const ids = (res.body.dimensions as Array<{ id: string }>).map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'SOFTWARE',
        'LEGAL',
        'PARTNER_NETWORK',
        'PAYMENTS',
        'COMMUNICATIONS',
        'LOGISTICS',
        'INFRASTRUCTURE',
        'HEALTHCARE',
        'OVERALL',
      ]),
    );
  });

  it('S49-04 payment dimension is EXTERNAL_GATED or BLOCKED (never fake READY)', async () => {
    const res = await fetchFinal();
    const payments = res.body.dimensions.find((d: { id: string }) => d.id === 'PAYMENTS');
    expect(['EXTERNAL_GATED', 'BLOCKED', 'NOT_CONFIGURED', 'SUSPENDED']).toContain(payments.status);
    expect(payments.status).not.toBe('READY');
  });

  it('S49-05 OTP/communications blocker present', async () => {
    const res = await fetchFinal();
    const codes = (res.body.blockers as Array<{ code: string; dimension: string }>)
      .filter((b) => b.dimension === 'COMMUNICATIONS')
      .map((b) => b.code);
    expect(codes.length).toBeGreaterThan(0);
  });

  it('S49-06 logistics blocker present', async () => {
    const res = await fetchFinal();
    const logistics = res.body.dimensions.find((d: { id: string }) => d.id === 'LOGISTICS');
    expect(logistics.status).not.toBe('READY');
    expect(logistics.blocker_count).toBeGreaterThan(0);
  });

  it('S49-07 infrastructure remains EXTERNAL_GATED', async () => {
    const res = await fetchFinal();
    const infra = res.body.dimensions.find((d: { id: string }) => d.id === 'INFRASTRUCTURE');
    expect(infra.status).toBe('EXTERNAL_GATED');
    expect(res.body.external_gated_items.some((i: { code: string }) => /PITR|STORAGE|KMS/i.test(i.code))).toBe(
      true,
    );
  });

  it('S49-08 healthcare blocker / clinical adapter gated', async () => {
    const res = await fetchFinal();
    const hc = res.body.dimensions.find((d: { id: string }) => d.id === 'HEALTHCARE');
    expect(hc.status).not.toBe('READY');
    expect(
      (res.body.blockers as Array<{ code: string }>).some((b) =>
        /CLINICAL|HEALTHCARE|ERX|PACS|FHIR|VIDEO/i.test(b.code),
      ),
    ).toBe(true);
  });

  it('S49-09 multiple simultaneous blockers across dimensions', async () => {
    const res = await fetchFinal();
    const dims = new Set(
      (res.body.blockers as Array<{ dimension: string }>).map((b) => b.dimension),
    );
    expect(dims.size).toBeGreaterThanOrEqual(3);
  });

  it('S49-10 internal checks may be software-ready while external deps remain gated', async () => {
    const res = await fetchFinal();
    expect(res.body.software_ready_vs_real_world.real_world_dependencies_required).toBe(true);
    expect(res.body.software_ready_vs_real_world.note).toMatch(/EXTERNAL_GATED/);
    expect(res.body.external_gated_items.length).toBeGreaterThan(0);
  });

  it('S49-11 sandbox env remains non-production-bound', () => {
    expect(readPaymentEnvironment()).not.toBe('production');
    expect(isLivePaymentEnabled()).toBe(false);
  });

  it('S49-12 assertReadyForActivation blocks (production readiness not met)', async () => {
    await expect(finalLaunch.assertReadyForActivation(ISO)).rejects.toMatchObject({
      code: 'FINAL_LAUNCH_NOT_READY',
    });
  });

  it('S49-13 enforceIfProductionBound allows sandbox software path', async () => {
    const result = await finalLaunch.enforceIfProductionBound(ISO);
    expect(result.overall_decision).toBe('NOT_READY');
    expect(result.activation_impossible).toBe(true);
  });

  it('S49-14 suspended country surfaces SUSPENDED overall', async () => {
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.SUSPENDED },
    });
    const res = await fetchFinal();
    expect(res.body.overall_decision).toBe('SUSPENDED');
    expect(
      (res.body.blockers as Array<{ code: string }>).some((b) => b.code === 'COUNTRY_PRODUCTION_SUSPENDED'),
    ).toBe(true);
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.CONFIGURED },
    });
  });

  it('S49-15 checklist covers LEGAL/PARTNERS/PAYMENTS/COMMS/LOGISTICS/INFRA/HEALTHCARE', async () => {
    const res = await fetchFinal();
    const cats = new Set((res.body.checklist as Array<{ category: string }>).map((c) => c.category));
    for (const required of [
      'LEGAL',
      'PARTNERS',
      'PAYMENTS',
      'COMMUNICATIONS',
      'LOGISTICS',
      'INFRASTRUCTURE',
      'HEALTHCARE',
    ]) {
      expect(cats.has(required)).toBe(true);
    }
  });

  it('S49-16 partner network blockers when licence/KYC/commercial missing', async () => {
    const res = await fetchFinal();
    const partnerCodes = (res.body.blockers as Array<{ code: string; dimension: string }>)
      .filter((b) => b.dimension === 'PARTNER_NETWORK')
      .map((b) => b.code);
    expect(
      partnerCodes.some((c) =>
        /PHARMACY_LICENCE|KYC_NOT_VERIFIED|COMMERCIAL_APPROVAL/i.test(c),
      ),
    ).toBe(true);
  });

  it('S49-17 no secret/PHI leakage in readiness payload', async () => {
    const res = await fetchFinal();
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain(process.env['JWT_ACCESS_SECRET']);
    expect(blob).not.toContain(process.env['OTP_PEPPER']);
    expect(blob).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/);
    expect(blob.toLowerCase()).not.toMatch(/ssn|passport_number|medical_record_number/);
    expect(res.body.never_expose_secrets).toBe(true);
    expect(res.body.never_expose_phi).toBe(true);
  });

  it('S49-18 global country isolation (unknown country 404)', async () => {
    const res = await fetchFinal('QZ');
    expect(res.status).toBe(404);
  });

  it('S49-19 customer cannot read or mutate final launch readiness', async () => {
    const customer = await signInCustomer(app, `s49-cust-${Date.now()}@example.com`);
    const read = await request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/countries/${ISO}/final-launch-readiness`)
      .set(auth(customer.token));
    expect(read.status).toBeGreaterThanOrEqual(400);
    const activate = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${ISO}/production/activate`)
      .set(auth(customer.token))
      .send({});
    expect(activate.status).toBeGreaterThanOrEqual(400);
  });

  it('S49-20 control-plane alias returns same overall decision', async () => {
    const a = await fetchFinal();
    const b = await request(app.getHttpServer())
      .get(`/api/v1/admin/control-plane/countries/${ISO}/final-launch-readiness`)
      .set(auth(adminToken));
    expect(b.status).toBe(200);
    expect(b.body.overall_decision).toBe(a.body.overall_decision);
    expect(b.body.never_fake_green).toBe(true);
  });

  it('S49-21 blocker detail includes severity, actionable, evidence required', async () => {
    const res = await fetchFinal();
    const sample = res.body.blockers[0];
    expect(sample).toMatchObject({
      code: expect.any(String),
      dimension: expect.any(String),
      explanation: expect.any(String),
      severity: expect.any(String),
      actionable: expect.stringMatching(/INTERNAL|EXTERNAL/),
      country_code: ISO,
      category: expect.any(String),
      evidence_or_approval_required: expect.any(String),
      blocks_activation: true,
    });
  });

  it('S49-22 legal dimension blocked when mandatory evidence missing/expired path exists', async () => {
    const res = await fetchFinal();
    const legal = res.body.dimensions.find((d: { id: string }) => d.id === 'LEGAL');
    expect(['BLOCKED', 'NOT_CONFIGURED', 'EXTERNAL_GATED']).toContain(legal.status);
  });

  it('S49-23 production-bound enforce blocks activation', async () => {
    const prevEnv = process.env['PAYMENT_ENVIRONMENT'];
    const prevLive = process.env['PAYMENT_LIVE_ENABLED'];
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    try {
      await expect(finalLaunch.enforceIfProductionBound(ISO)).rejects.toMatchObject({
        code: 'FINAL_LAUNCH_NOT_READY',
      });
    } finally {
      if (prevEnv === undefined) delete process.env['PAYMENT_ENVIRONMENT'];
      else process.env['PAYMENT_ENVIRONMENT'] = prevEnv;
      if (prevLive === undefined) delete process.env['PAYMENT_LIVE_ENABLED'];
      else process.env['PAYMENT_LIVE_ENABLED'] = prevLive;
    }
  });

  it('S49-24 evaluated_at timestamp present', async () => {
    const res = await fetchFinal();
    expect(res.body.evaluated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('S49-25 vendor cannot mutate final launch readiness', async () => {
    const vendor = await signInCustomer(app, `s49-vendor-${Date.now()}@example.com`);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${ISO}/lifecycle/transition`)
      .set(auth(vendor.token))
      .send({ to: 'UNDER_REVIEW' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('S49-26 OVERALL dimension mirrors overall_decision (never fake green)', async () => {
    const res = await fetchFinal();
    const overall = res.body.dimensions.find((d: { id: string }) => d.id === 'OVERALL');
    expect(overall.status).not.toBe('READY');
    expect(res.body.overall_decision).not.toBe('READY_FOR_ACTIVATION');
  });
});
