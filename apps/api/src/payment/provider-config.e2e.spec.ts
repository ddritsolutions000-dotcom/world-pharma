import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';
import { assertLiveProductionPrerequisites } from './payment.config';
import { assertObservabilityResponseSafe } from './payment-observability';
import { PaymentRouter } from './router';
import { seedSandboxGateways } from './seed';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('Main Admin payment provider configuration', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let router: PaymentRouter;
  let financeToken: string;
  let financePersonId: string;
  let readOnlyToken: string;
  let customerToken: string;
  let primaryPriority: number;
  let fallbackPriority: number;
  let primaryCountries: string;

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
    router = app.get(PaymentRouter);
    await seedSandboxGateways(prisma);

    const finance = await signIn(app, `prov-cfg-fin-${Date.now()}@example.com`, 'admin');
    financeToken = finance.token;
    financePersonId = finance.personId;
    const financeRole = await prisma.role.findUnique({ where: { code: 'company_finance' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: finance.personId, roleId: financeRole!.id, scope: 'platform', status: 'ACTIVE' },
    });

    const reader = await signIn(app, `prov-cfg-read-${Date.now()}@example.com`, 'admin');
    readOnlyToken = reader.token;
    const adminRole = await prisma.role.findUnique({ where: { code: 'company_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: reader.personId, roleId: adminRole!.id, scope: 'platform', status: 'ACTIVE' },
    });

    const customer = await signIn(app, `prov-cfg-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;

    const primary = await prisma.paymentGateway.findUniqueOrThrow({
      where: { code: 'MOCK_PRIMARY' },
      include: { accounts: true },
    });
    const fallback = await prisma.paymentGateway.findUniqueOrThrow({ where: { code: 'MOCK_FALLBACK' } });
    primaryPriority = primary.priority;
    fallbackPriority = fallback.priority;
    primaryCountries = primary.accounts[0]?.countriesCsv ?? '*';
  });

  afterEach(async () => {
    delete process.env['PAYMENT_LIVE_ENABLED'];
    await prisma.paymentGateway.update({
      where: { code: 'MOCK_PRIMARY' },
      data: { active: true, environment: 'sandbox', priority: primaryPriority },
    });
    await prisma.paymentGateway.update({
      where: { code: 'MOCK_FALLBACK' },
      data: { active: true, environment: 'sandbox', priority: fallbackPriority },
    });
    const primary = await prisma.paymentGateway.findUniqueOrThrow({
      where: { code: 'MOCK_PRIMARY' },
      include: { accounts: true },
    });
    if (primary.accounts[0]) {
      await prisma.paymentGatewayAccount.update({
        where: { id: primary.accounts[0].id },
        data: { countriesCsv: primaryCountries, active: true, environment: 'sandbox' },
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets authorized admin read provider configuration without secrets or a named live PSP', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/payments/providers')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    assertObservabilityResponseSafe(res.body);
    expect(res.body.kernel).toBe('provider_agnostic');
    expect(res.body.selection).toBe('configuration_driven');
    expect(res.body.live_payment_enabled).toBe(false);
    expect(res.body.live_production_status).toBe('R14_A_LIVE_PRODUCTION_BLOCKED');
    expect(res.body.owner_evidenced_count).toBe(0);
    expect(res.body.providers.map((row: { code: string }) => row.code)).toEqual(
      expect.arrayContaining(['MOCK_PRIMARY', 'MOCK_FALLBACK']),
    );
    expect(res.body.providers.every((row: { registry_registered: boolean }) => row.registry_registered)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/sk_live|payload_cipher|-----BEGIN/i);
    expect(res.body.providers[0].vault_path).toMatch(/^(env|vault):/);
  });

  it('rejects customer, unauthorized admin update, invented codes, and secret material', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/payments/providers')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/payments/providers')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .put('/api/v1/admin/payments/providers/MOCK_PRIMARY')
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send({ priority: 11 })
      .expect(403);
    await request(app.getHttpServer())
      .put('/api/v1/admin/payments/providers/STRIPE_LIVE')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ active: true })
      .expect(404);
    const secret = await request(app.getHttpServer())
      .put('/api/v1/admin/payments/providers/MOCK_PRIMARY')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ vault_path: 'sk_live_not_a_real_key' });
    expect(secret.status).toBe(400);
    expect(secret.body.code).toBe('SECRET_VALUE_FORBIDDEN');
    const incomplete = await request(app.getHttpServer())
      .put('/api/v1/admin/payments/providers/MOCK_PRIMARY')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ account: { countries_csv: '' } });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.code).toBe('PROVIDER_CONFIG_INCOMPLETE');
  });

  it('updates existing catalog rows with audit and switches routing without a code-path change', async () => {
    const updated = await request(app.getHttpServer())
      .put('/api/v1/admin/payments/providers/MOCK_FALLBACK')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ priority: 1, active: true });
    expect(updated.status).toBe(200);
    const fallback = updated.body.providers.find((row: { code: string }) => row.code === 'MOCK_FALLBACK');
    expect(fallback.priority).toBe(1);

    const audit = await request(app.getHttpServer())
      .get('/api/v1/admin/payments/providers/MOCK_FALLBACK/audit')
      .set('Authorization', `Bearer ${financeToken}`)
      .expect(200);
    expect(audit.body.data[0].actor_person_id).toBe(financePersonId);
    expect(audit.body.data[0].metadata.gateway_code).toBe('MOCK_FALLBACK');
    assertObservabilityResponseSafe(audit.body);

    const country = await prisma.country.findFirst({ select: { id: true, isoAlpha2: true } });
    expect(country).toBeTruthy();
    const decision = await router.decide({
      countryId: country!.id,
      countryIso2: country!.isoAlpha2,
      currency: 'XXX',
      method: 'CARD',
      amountMinor: 100n,
    });
    expect(decision.gatewayCode).toBe('MOCK_FALLBACK');
    expect(decision.gatewayEnvironment).toBe('sandbox');
  });

  it('enforces country csv and keeps live payments blocked even when the live flag is forced', async () => {
    const blockedCountry = await request(app.getHttpServer())
      .put('/api/v1/admin/payments/providers/MOCK_PRIMARY')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ account: { countries_csv: 'ZZ' } });
    expect(blockedCountry.status).toBe(200);
    const xx = await prisma.country.findFirst({
      where: { isoAlpha2: { not: 'ZZ' } },
      select: { id: true, isoAlpha2: true },
    });
    expect(xx).toBeTruthy();
    const explained = await router.explain(
      {
        countryId: xx!.id,
        countryIso2: xx!.isoAlpha2,
        currency: 'XXX',
        method: 'CARD',
        amountMinor: 100n,
      },
      'sandbox',
    );
    const primaryBlocked = explained.ineligible.find((row) => row.gatewayCode === 'MOCK_PRIMARY');
    expect(primaryBlocked?.reason).toBe('country_not_authorized');

    const production = await request(app.getHttpServer())
      .put('/api/v1/admin/payments/providers/MOCK_PRIMARY')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ environment: 'production' });
    expect(production.status).toBe(409);
    expect(production.body.code).toBe('HUMAN_GATES_NOT_PRODUCTION_READY');

    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    const stillBlocked = await request(app.getHttpServer())
      .put('/api/v1/admin/payments/providers/MOCK_PRIMARY')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ environment: 'production' });
    expect(stillBlocked.status).toBe(409);
    expect(stillBlocked.body.code).toBe('HUMAN_GATES_NOT_PRODUCTION_READY');
    const gates = await prisma.r14AHumanGate.findMany();
    expect(() =>
      assertLiveProductionPrerequisites('provider-config e2e', {
        gatewayCode: 'MOCK_PRIMARY',
        countryIso2: xx!.isoAlpha2,
        humanGates: gates.map((row) => ({
          gateCode: row.gateCode,
          valueText: row.valueText,
          evidenceClass: row.evidenceClass,
          evidenceRef: row.evidenceRef,
          updatedByPersonId: row.updatedByPersonId,
          verifiedByPersonId: row.verifiedByPersonId,
          verifiedAt: row.verifiedAt,
          updatedAt: row.updatedAt,
        })),
      }),
    ).toThrow();
  });
});
