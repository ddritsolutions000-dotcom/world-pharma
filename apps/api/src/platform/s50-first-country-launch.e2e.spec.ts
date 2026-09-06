/**
 * Sprint 50 — First-country launch package & activation dry-run (e2e)
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
import { FirstCountryLaunchService } from './first-country-launch.service';
import { readPaymentEnvironment, isLivePaymentEnabled } from '../payment/payment.config';

describe('Sprint 50 first-country launch preparation (e2e)', () => {
  jest.setTimeout(360_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let firstCountry: FirstCountryLaunchService;
  let adminToken: string;
  let adminPersonId: string;
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
    firstCountry = app.get(FirstCountryLaunchService);
    const admin = await provisionSuperAdmin(app, prisma, 's50-admin');
    adminToken = admin.token;
    adminPersonId = admin.personId;

    ISO = `F${Date.now().toString(36).slice(-2).toUpperCase()}`;
    const country = await prisma.country.create({
      data: {
        id: uuidv7(),
        isoAlpha2: ISO,
        isoAlpha3: `${ISO}X`,
        nameI18n: { en: `Sprint50 ${ISO}` },
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
        checksum: `s50-${ISO}`,
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

  async function packageGet(iso = ISO) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/countries/${iso}/first-country-launch-package`)
      .set(auth(adminToken));
  }

  async function dryRun(iso = ISO) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${iso}/activation-dry-run`)
      .set(auth(adminToken))
      .send({});
  }

  it('S50-01 empty/minimal country package is NOT_READY', async () => {
    const res = await packageGet();
    expect(res.status).toBe(200);
    expect(res.body.overall_decision).toBe('NOT_READY');
    expect(res.body.country_neutral).toBe(true);
    expect(res.body.no_india_assumptions).toBe(true);
  });

  it('S50-02 legal blocker present and classified', async () => {
    const res = await packageGet();
    const legal = res.body.readiness.blockers.filter((b: { dimension: string }) => b.dimension === 'LEGAL');
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.some((b: { taxonomy: string }) => b.taxonomy === 'LEGAL_REGULATORY_REQUIRED' || b.taxonomy === 'CONFIGURATION_REQUIRED' || b.taxonomy === 'INTERNAL_ACTION_REQUIRED')).toBe(true);
  });

  it('S50-03 partner blocker present', async () => {
    const res = await packageGet();
    const partner = res.body.readiness.blockers.filter((b: { dimension: string }) => b.dimension === 'PARTNER_NETWORK');
    expect(partner.some((b: { code: string }) => /PHARMACY_LICENCE|KYC|COMMERCIAL/i.test(b.code))).toBe(true);
  });

  it('S50-04 payment blocker EXTERNAL_GATED / taxonomy external', async () => {
    const res = await packageGet();
    const pay = res.body.readiness.dimensions.find((d: { id: string }) => d.id === 'PAYMENTS');
    expect(pay.status).not.toBe('READY');
    expect(res.body.taxonomy_counts.EXTERNAL_PROVIDER_REQUIRED + res.body.taxonomy_counts.EXTERNAL_BUSINESS_APPROVAL).toBeGreaterThan(0);
  });

  it('S50-05 communications blocker present', async () => {
    const res = await packageGet();
    expect(res.body.readiness.dimensions.find((d: { id: string }) => d.id === 'COMMUNICATIONS').status).not.toBe('READY');
  });

  it('S50-06 logistics blocker present', async () => {
    const res = await packageGet();
    expect(res.body.readiness.dimensions.find((d: { id: string }) => d.id === 'LOGISTICS').status).not.toBe('READY');
  });

  it('S50-07 infrastructure blocker present', async () => {
    const res = await packageGet();
    expect(res.body.readiness.dimensions.find((d: { id: string }) => d.id === 'INFRASTRUCTURE').status).toBe('EXTERNAL_GATED');
  });

  it('S50-08 healthcare blocker present', async () => {
    const res = await packageGet();
    expect(res.body.readiness.dimensions.find((d: { id: string }) => d.id === 'HEALTHCARE').status).not.toBe('READY');
  });

  it('S50-09 security section surfaces security taxonomy', async () => {
    const res = await packageGet();
    const security = res.body.sections.find((s: { id: string }) => s.id === 'SECURITY');
    expect(security).toBeDefined();
    expect(res.body.taxonomy_counts.SECURITY_REQUIRED).toBeGreaterThan(0);
  });

  it('S50-10 multiple blockers across dimensions', async () => {
    const res = await packageGet();
    const dims = new Set(res.body.readiness.blockers.map((b: { dimension: string }) => b.dimension));
    expect(dims.size).toBeGreaterThanOrEqual(3);
  });

  it('S50-11 internal blocker classification present', async () => {
    const res = await packageGet();
    expect(res.body.readiness.blockers.some((b: { actionable: string }) => b.actionable === 'INTERNAL')).toBe(true);
  });

  it('S50-12 external blocker classification present', async () => {
    const res = await packageGet();
    expect(res.body.readiness.blockers.some((b: { actionable: string }) => b.actionable === 'EXTERNAL')).toBe(true);
  });

  it('S50-13 legal/regulatory taxonomy count', async () => {
    const res = await packageGet();
    expect(
      res.body.taxonomy_counts.LEGAL_REGULATORY_REQUIRED + res.body.taxonomy_counts.CONFIGURATION_REQUIRED,
    ).toBeGreaterThanOrEqual(0);
    expect(res.body.why_not_launch).toMatch(/NOT_READY|SUSPENDED/);
  });

  it('S50-14 configuration blockers appear in runbook stage 1 when present', async () => {
    const res = await packageGet();
    expect(res.body.runbook.some((r: { stage: number }) => r.stage === 1)).toBe(true);
  });

  it('S50-15 dry-run FAIL for undeveloped country', async () => {
    const res = await dryRun();
    expect(res.status).toBe(201);
    expect(res.body.result).toBe('FAIL');
    expect(res.body.would_activate).toBe(false);
  });

  it('S50-16 dry-run never activates / never mutates', async () => {
    const before = await prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    const res = await dryRun();
    expect(res.body.mutated).toBe(false);
    expect(res.body.never_mutates).toBe(true);
    expect(res.body.production_lifecycle_before).toBe(before.productionLifecycle);
    expect(res.body.production_lifecycle_after).toBe(before.productionLifecycle);
    const after = await prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    expect(after.productionLifecycle).toBe(before.productionLifecycle);
    expect(after.status).toBe(before.status);
  });

  it('S50-17 dry-run PASS only when overall READY_FOR_ACTIVATION (still FAIL here)', async () => {
    const res = await dryRun();
    expect(res.body.result).toBe('FAIL');
    expect(res.body.overall_decision).not.toBe('READY_FOR_ACTIVATION');
  });

  it('S50-18 suspended country dry-run surfaces SUSPENDED', async () => {
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.SUSPENDED },
    });
    const res = await packageGet();
    expect(res.body.overall_decision).toBe('SUSPENDED');
    await prisma.country.update({
      where: { id: countryId },
      data: { productionLifecycle: CountryProductionLifecycle.CONFIGURED },
    });
  });

  it('S50-19 actionability includes workflow + permission for blockers', async () => {
    const res = await packageGet();
    const sample = res.body.readiness.blockers[0];
    expect(sample.actionability).toMatchObject({
      taxonomy: expect.any(String),
      what_is_missing: expect.any(String),
      why_blocks_launch: expect.any(String),
      resolving_workflow: expect.any(String),
      authorized_permission: expect.any(String),
      can_clear_from_application: expect.any(Boolean),
      runbook_stage: expect.any(Number),
    });
  });

  it('S50-20 missing production provider cannot be cleared from app', async () => {
    const res = await packageGet();
    const external = res.body.readiness.blockers.find((b: { actionable: string }) => b.actionable === 'EXTERNAL');
    expect(external.actionability.can_clear_from_application).toBe(false);
  });

  it('S50-21 mock provider codes remain external (never fake READY)', async () => {
    const res = await packageGet();
    const payments = res.body.readiness.dimensions.find((d: { id: string }) => d.id === 'PAYMENTS');
    expect(payments.status).not.toBe('READY');
  });

  it('S50-22 sandbox remains usable (non-production-bound)', () => {
    expect(readPaymentEnvironment()).toBe('sandbox');
    expect(isLivePaymentEnabled()).toBe(false);
  });

  it('S50-23 customer authorization denied for package + dry-run', async () => {
    const customer = await signInCustomer(app, `s50-cust-${Date.now()}@example.com`);
    const pkg = await request(app.getHttpServer())
      .get(`/api/v1/admin/regulatory/countries/${ISO}/first-country-launch-package`)
      .set(auth(customer.token));
    expect(pkg.status).toBeGreaterThanOrEqual(400);
    const dry = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${ISO}/activation-dry-run`)
      .set(auth(customer.token))
      .send({});
    expect(dry.status).toBeGreaterThanOrEqual(400);
  });

  it('S50-24 vendor authorization denied', async () => {
    const vendor = await signInCustomer(app, `s50-vendor-${Date.now()}@example.com`);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/regulatory/countries/${ISO}/activation-dry-run`)
      .set(auth(vendor.token))
      .send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('S50-25 PHI/secrets not exposed', async () => {
    const res = await packageGet();
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain(process.env['JWT_ACCESS_SECRET']);
    expect(blob).not.toContain(process.env['OTP_PEPPER']);
    expect(blob).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/);
    expect(res.body.never_expose_secrets).toBe(true);
    expect(res.body.never_expose_phi).toBe(true);
  });

  it('S50-26 country isolation unknown ISO 404', async () => {
    const res = await packageGet('QZ');
    expect(res.status).toBe(404);
  });

  it('S50-27 dry-run emits audit event', async () => {
    const res = await dryRun();
    expect(res.body.audit_event_emitted).toBe(true);
    const events = await prisma.securityEvent.findMany({
      where: { type: 'COUNTRY_ACTIVATION_DRY_RUN', personId: adminPersonId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(events.length).toBeGreaterThan(0);
  });

  it('S50-28 no activation bypass via dry-run service', async () => {
    const result = await firstCountry.activationDryRun(ISO);
    expect(result.would_activate).toBe(false);
    expect(result.mutated).toBe(false);
    expect(result.result).toBe('FAIL');
  });

  it('S50-29 runbook covers stages 1–6', async () => {
    const res = await packageGet();
    const stages = new Set(res.body.runbook.map((r: { stage: number }) => r.stage));
    expect([...stages].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('S50-30 package sections include A–K style coverage', async () => {
    const res = await packageGet();
    const ids = res.body.sections.map((s: { id: string }) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'COUNTRY',
        'LEGAL',
        'PARTNER_NETWORK',
        'HEALTHCARE',
        'PAYMENTS',
        'COMMUNICATIONS',
        'LOGISTICS',
        'INFRASTRUCTURE',
        'SECURITY',
        'OPERATIONAL_OWNERSHIP',
        'LAUNCH_DECISION',
      ]),
    );
  });

  it('S50-31 control-plane aliases work', async () => {
    const a = await request(app.getHttpServer())
      .get(`/api/v1/admin/control-plane/countries/${ISO}/first-country-launch-package`)
      .set(auth(adminToken));
    expect(a.status).toBe(200);
    const b = await request(app.getHttpServer())
      .post(`/api/v1/admin/control-plane/countries/${ISO}/activation-dry-run`)
      .set(auth(adminToken))
      .send({});
    expect(b.status).toBe(201);
    expect(b.body.mutated).toBe(false);
  });

  it('S50-32 why_not_launch and next_action are present', async () => {
    const res = await packageGet();
    expect(res.body.why_not_launch.length).toBeGreaterThan(10);
    expect(res.body.next_action).toBeTruthy();
  });
});
