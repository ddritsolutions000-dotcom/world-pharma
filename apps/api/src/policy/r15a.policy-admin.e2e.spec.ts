import { INestApplication } from '@nestjs/common';
import { CountryStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';
import { emptyPolicyDocument } from './empty-pack';
import { PolicyCache } from './cache';
import { isLivePaymentEnabled, assertLiveProductionPrerequisites } from '../payment/payment.config';
import { assertHumanGatesAllowLive } from '../payment/r14a-gate';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function grant(prisma: PrismaService, personId: string, roleCode: string) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.membership.create({
    data: { id: uuidv7(), personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
  });
}

describe('R15-A Main Admin country policy pack operator', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let publisherToken: string;
  let publisherId: string;
  let reviewerToken: string;
  let reviewerId: string;
  let readerToken: string;
  let customerToken: string;
  let partnerToken: string;

  async function resetXxEmpty() {
    const xx = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!xx) {
      return;
    }
    await prisma.policyPack.updateMany({
      where: { countryId: xx.id, status: 'PUBLISHED' },
      data: { document: emptyPolicyDocument() as never },
    });
    await app.get(PolicyCache).invalidate('XX');
  }

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    delete process.env['PAYMENT_ENVIRONMENT'];
    delete process.env['PAYMENT_LIVE_ENABLED'];
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const publisher = await signIn(app, `r15a-pub-${Date.now()}@example.com`, 'admin');
    publisherToken = publisher.token;
    publisherId = publisher.personId;
    await grant(prisma, publisher.personId, 'company_admin');

    const reviewer = await signIn(app, `r15a-rev-${Date.now()}@example.com`, 'admin');
    reviewerToken = reviewer.token;
    reviewerId = reviewer.personId;
    await grant(prisma, reviewer.personId, 'company_admin');

    const reader = await signIn(app, `r15a-read-${Date.now()}@example.com`, 'admin');
    readerToken = reader.token;
    await grant(prisma, reader.personId, 'company_finance');

    customerToken = (await signIn(app, `r15a-cust-${Date.now()}@example.com`, 'customer')).token;
    partnerToken = (await signIn(app, `r15a-partner-${Date.now()}@example.com`, 'admin')).token;

    let tq = await prisma.country.findUnique({ where: { isoAlpha2: 'TQ' } });
    if (!tq) {
      tq = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TQ',
          isoAlpha3: 'TQQ',
          nameI18n: { und: 'Test isolation country' },
          status: CountryStatus.ACTIVE,
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    await resetXxEmpty();
  });

  afterAll(async () => {
    if (app && prisma) {
      await resetXxEmpty();
      await app.close();
    }
  });

  it('enforces RBAC: read vs publish vs partner vs customer', async () => {
    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/policy-packs?country=XX')
      .set('Authorization', `Bearer ${readerToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.country_code).toBe('XX');
    expect(Array.isArray(listed.body.data)).toBe(true);
    expect(listed.body.live_payment_enabled).toBe(false);
    expect(listed.body.registered_gateway_codes).toEqual(
      expect.arrayContaining(['MOCK_PRIMARY', 'MOCK_FALLBACK']),
    );

    const forbiddenCreate = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ country_code: 'XX', document: emptyPolicyDocument() });
    expect(forbiddenCreate.status).toBe(403);

    const partnerList = await request(app.getHttpServer())
      .get('/api/v1/admin/policy-packs?country=XX')
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(partnerList.status).toBe(403);

    const partnerPublish = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ country_code: 'XX', document: emptyPolicyDocument() });
    expect(partnerPublish.status).toBe(403);

    const customerList = await request(app.getHttpServer())
      .get('/api/v1/admin/policy-packs?country=XX')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerList.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects invalid packs, unknown gateway refs, and secrets', async () => {
    const invalid = emptyPolicyDocument();
    invalid.payments.enabled = true;
    const missingRefs = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs/validate')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ country_code: 'XX', document: invalid });
    expect(missingRefs.status).toBe(400);

    const unknown = emptyPolicyDocument();
    unknown.payments.enabled = true;
    unknown.payments.gateway_refs = ['STRIPE'];
    unknown.payments.methods = ['CARD'];
    const unknownRes = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ country_code: 'XX', document: unknown });
    expect(unknownRes.status).toBe(400);
    expect(unknownRes.body.code).toBe('UNKNOWN_GATEWAY_REF');

    const secretDoc = emptyPolicyDocument() as PolicyDocumentWithSecret;
    secretDoc.api_key = 'sk_live_not_a_real_key';
    const secretRes = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs/validate')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ country_code: 'XX', document: secretDoc });
    expect(secretRes.status).toBe(400);
    expect(secretRes.body.code).toBe('SECRET_VALUE_FORBIDDEN');
  });

  it('draft → validate → diff → publish → rollback with country isolation and live payments still blocked', async () => {
    expect(isLivePaymentEnabled()).toBe(false);
    expect(process.env['PAYMENT_LIVE_ENABLED']).not.toBe('true');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/policy-packs?country=XX')
      .set('Authorization', `Bearer ${publisherToken}`)
      .expect(200);
    const publishedId = listed.body.published_id as string;
    expect(publishedId).toBeTruthy();

    const published = await request(app.getHttpServer())
      .get(`/api/v1/admin/policy-packs/${publishedId}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);
    expect(published.body.operator_status).toBe('PUBLISHED');
    expect(published.body.document.payments.enabled).toBe(false);
    expect(JSON.stringify(published.body)).not.toMatch(/sk_live|api_key|password=/i);

    const draftDoc = emptyPolicyDocument();
    draftDoc.services.pharmacy = true;
    draftDoc.payments.enabled = true;
    draftDoc.payments.methods = ['CARD'];
    draftDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    draftDoc.payments.currencies = ['XXX'];
    draftDoc.tax_profile_id = 'tax-xx-sandbox';

    const validated = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs/validate')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ country_code: 'XX', document: draftDoc })
      .expect(200);
    expect(validated.body.ok).toBe(true);
    expect(validated.body.operator_status).toBe('VALIDATED');
    expect(validated.body.live_payment_enabled).toBe(false);
    expect(validated.body.diff.map((row: { path: string }) => row.path)).toEqual(
      expect.arrayContaining(['services.pharmacy', 'payments.enabled', 'payments.gateway_refs', 'tax_profile_id']),
    );

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ country_code: 'XX', document: draftDoc })
      .expect(200);
    expect(created.body.status).toBe('DRAFT');
    expect(created.body.operator.payments.gateway_refs).toEqual(['MOCK_PRIMARY']);
    expect(created.body.operator.i18n.default_locale).toBe('en');
    expect(created.body.operator.currency.default).toBe('XXX');
    expect(created.body.operator.timezone_default).toBe('UTC');
    expect(created.body.operator.ledger_legal_entity_id).toBeNull();
    expect(created.body.operator.ledger_accounting_currency).toBeNull();

    const stored = await request(app.getHttpServer())
      .post(`/api/v1/admin/policy-packs/${created.body.id}/validate`)
      .set('Authorization', `Bearer ${publisherToken}`)
      .expect(200);
    expect(stored.body.operator_status).toBe('VALIDATED');

    const diff = await request(app.getHttpServer())
      .get(`/api/v1/admin/policy-packs/${created.body.id}/diff`)
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);
    expect(diff.body.country_code).toBe('XX');
    expect(diff.body.entries.some((row: { path: string }) => row.path === 'payments.enabled')).toBe(true);

    const publishedNext = await request(app.getHttpServer())
      .post(`/api/v1/admin/policy-packs/${created.body.id}/publish`)
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({})
      .expect(200);
    expect(publishedNext.body.document.payments.enabled).toBe(true);
    expect(publishedNext.body.document.payments.gateway_refs).toEqual(['MOCK_PRIMARY']);

    const audit = await prisma.securityEvent.findFirst({
      where: { type: 'COUNTRY_POLICY_PUBLISHED', personId: publisherId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.outcome).toBe('success');

    const tqList = await request(app.getHttpServer())
      .get('/api/v1/admin/policy-packs?country=TQ')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);
    expect(tqList.body.country_code).toBe('TQ');
    expect(tqList.body.data.some((row: { id: string }) => row.id === created.body.id)).toBe(false);

    expect(isLivePaymentEnabled()).toBe(false);
    expect(() => assertLiveProductionPrerequisites('r15a-pack-publish')).toThrow();
    expect(() => assertHumanGatesAllowLive(undefined, 'r15a-pack-publish')).toThrow();
    expect(process.env['PAYMENT_LIVE_ENABLED']).not.toBe('true');

    const rolled = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs/rollback')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ country_code: 'XX' })
      .expect(200);
    expect(rolled.body.document.payments.enabled).toBe(false);
    expect(rolled.body.document.services.pharmacy.enabled ?? rolled.body.document.services.pharmacy).toBeFalsy();
  });

  it('preserves maker-checker when recording is enabled', async () => {
    const doc = emptyPolicyDocument();
    doc.recording_allowed = true;
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ country_code: 'XX', document: doc })
      .expect(200);
    expect(created.body.dual_control_required).toBe(true);

    const selfPublish = await request(app.getHttpServer())
      .post(`/api/v1/admin/policy-packs/${created.body.id}/publish`)
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ dual_control: true });
    expect(selfPublish.status).toBe(409);
    expect(selfPublish.body.code).toBe('DUAL_CONTROL_REQUIRED');

    const reviewed = await request(app.getHttpServer())
      .post(`/api/v1/admin/policy-packs/${created.body.id}/publish`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ dual_control: true })
      .expect(200);
    expect(reviewed.body.document.recording_allowed).toBe(true);
    expect(reviewerId).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs/rollback')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ country_code: 'XX' })
      .expect(200);
  });

  it('validates hypothetical localization without inventing production legal values', async () => {
    const document = emptyPolicyDocument();
    document.i18n = { default_locale: 'de', locales: ['de', 'en'] };
    document.currency = { default: 'EUR', allowed: ['EUR'] };
    document.timezone = { default: 'Europe/Berlin', allowed: ['Europe/Berlin', 'UTC'] };
    document.ledger = { legal_entity_id: null, accounting_currency: 'EUR' };
    const validated = await request(app.getHttpServer())
      .post('/api/v1/admin/policy-packs/validate')
      .set('Authorization', `Bearer ${publisherToken}`)
      .send({ country_code: 'XX', document })
      .expect(200);
    expect(validated.body.ok).toBe(true);
    expect(validated.body.live_payment_enabled).toBe(false);
    expect(validated.body.operator.i18n.default_locale).toBe('de');
    expect(validated.body.operator.currency.default).toBe('EUR');
    expect(validated.body.operator.timezone_default).toBe('Europe/Berlin');
    expect(validated.body.operator.ledger_legal_entity_id).toBeNull();
    expect(validated.body.operator.ledger_accounting_currency).toBe('EUR');
    expect(JSON.stringify(validated.body)).not.toMatch(/sk_live|api_key|password=/i);
  });
});

type PolicyDocumentWithSecret = ReturnType<typeof emptyPolicyDocument> & { api_key?: string };
