import { INestApplication } from '@nestjs/common';
import { OrganizationKind, PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { PolicyCache } from '../policy/cache';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { enableMarketplaceVendorPack } from '../test/marketplace-seller';
import { assertRoutingMatrixResponseSafe } from './payment-routing-matrix';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'admin') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-A payment routing matrix', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let strangerToken: string;
  let countryId: string;
  const countryCode = 'WR';

  async function publishPolicy(mutator: (doc: ReturnType<typeof emptyPolicyDocument>) => void) {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD'];
    doc.payments.currencies = ['XXX'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    mutator(doc);
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: doc as never },
    });
    await app.get(PolicyCache).invalidate(countryCode);
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

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'WRR',
          nameI18n: { en: 'Routing matrix test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
      const doc = emptyPolicyDocument();
      doc.services.pharmacy = true;
      enableMarketplaceVendorPack(doc);
      doc.payments.enabled = true;
      doc.payments.methods = ['CARD'];
      doc.payments.gateway_refs = ['MOCK_PRIMARY'];
      doc.payments.currencies = ['XXX'];
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: doc as never,
          checksum: 'routing-matrix',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
    }
    countryId = country.id;
    await app.get(PolicyCache).invalidate(countryCode);

    let other = await prisma.country.findUnique({ where: { isoAlpha2: 'XO' } });
    if (!other) {
      other = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'XO',
          isoAlpha3: 'XOO',
          nameI18n: { en: 'Other matrix country' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
    }

    const vendor = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.VENDOR,
        legalName: 'Matrix Vendor',
        displayName: 'Matrix Vendor',
        status: 'ACTIVE',
      },
    });

    const admin = await signIn(app, `matrix-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const stranger = await signIn(app, `matrix-stranger-${Date.now()}@example.com`, 'admin');
    strangerToken = stranger.token;
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: stranger.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: vendor.id,
        status: 'ACTIVE',
      },
    });
  });

  afterEach(async () => {
    await publishPolicy(() => undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function fetchMatrix(query = `country_code=${countryCode}`) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/payments/routing-matrix?${query}`)
      .set('Authorization', `Bearer ${adminToken}`);
  }

  it('1: sandbox routing matrix returns expected active route', async () => {
    await publishPolicy(() => undefined);
    const res = await fetchMatrix();
    expect(res.status).toBe(200);
    expect(res.body.sandbox).toBe(true);
    expect(res.body.effective_route?.gateway_code).toBe('MOCK_PRIMARY');
    expect(res.body.effective_route?.gateway_environment).toBe('sandbox');
    expect(res.body.router_decision_matches).toBe(true);
    assertRoutingMatrixResponseSafe(res.body);
  });

  it('2: disabled payments yields no active route', async () => {
    await publishPolicy((doc) => {
      doc.payments.enabled = false;
      doc.payments.gateway_refs = [];
    });
    const res = await fetchMatrix();
    expect(res.status).toBe(200);
    expect(res.body.payments_enabled).toBe(false);
    expect(res.body.effective_route).toBeNull();
    expect(res.body.effective_fail_closed_reason).toBe('payments_disabled');
  });

  it('3: unknown gateway in policy is fail-closed', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['UNKNOWN_PSP'];
    });
    const res = await fetchMatrix();
    expect(res.status).toBe(200);
    expect(res.body.effective_route).toBeNull();
    expect(res.body.rows.some((row: { gateway_code: string }) => row.gateway_code === 'UNKNOWN_PSP')).toBe(true);
    expect(
      res.body.rows.find((row: { gateway_code: string }) => row.gateway_code === 'UNKNOWN_PSP')?.fail_closed_reason,
    ).toBeTruthy();
  });

  it('4: policy gateway not listed by router remains blocked', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['MOCK_FALLBACK'];
    });
    const res = await fetchMatrix();
    expect(res.status).toBe(200);
    expect(res.body.effective_route?.gateway_code).toBe('MOCK_FALLBACK');
    const primary = res.body.rows.find((row: { gateway_code: string }) => row.gateway_code === 'MOCK_PRIMARY');
    expect(primary?.policy_allowed).toBe(false);
  });

  it('5: mock sandbox route is allowed when policy permits', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    });
    const res = await fetchMatrix();
    const row = res.body.rows.find((row: { gateway_code: string }) => row.gateway_code === 'MOCK_PRIMARY');
    expect(row?.status).toBe('active');
    expect(row?.router_eligible).toBe(true);
  });

  it('6: production preview blocks mock gateways', async () => {
    await publishPolicy(() => undefined);
    const res = await fetchMatrix();
    expect(res.body.production_preview.active).toBe(false);
    expect(res.body.production_preview.fail_closed_reason).toBe('live_payments_disabled');
    expect(
      res.body.production_preview.rows.some(
        (row: { gateway_environment: string; fail_closed_reason: string | null }) =>
          row.gateway_environment === 'production' && row.fail_closed_reason === 'mock_gateway_production_forbidden',
      ),
    ).toBe(true);
  });

  it('7: environment filter limits sandbox rows', async () => {
    await publishPolicy(() => undefined);
    const res = await fetchMatrix(`country_code=${countryCode}&environment=sandbox`);
    expect(res.status).toBe(200);
    expect(res.body.rows.every((row: { gateway_environment: string }) => row.gateway_environment === 'sandbox')).toBe(
      true,
    );
  });

  it('8: unauthorized admin receives 403', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/payments/routing-matrix?country_code=${countryCode}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });

  it('9: country isolation returns country-specific matrix', async () => {
    await publishPolicy(() => undefined);
    const wr = await fetchMatrix(`country_code=${countryCode}`);
    const xo = await fetchMatrix('country_code=XO');
    expect(wr.status).toBe(200);
    expect(xo.status).toBe(200);
    expect(wr.body.country_code).toBe(countryCode);
    expect(xo.body.country_code).toBe('XO');
    expect(wr.body.effective_route?.gateway_code).toBe('MOCK_PRIMARY');
    expect(xo.body.payments_enabled).toBe(false);
  });

  it('10: multiple gateways resolve with deterministic priority', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_FALLBACK'];
    });
    const res = await fetchMatrix();
    expect(res.body.effective_route?.gateway_code).toBe('MOCK_PRIMARY');
    expect(res.body.effective_route?.priority).toBeLessThan(
      res.body.rows.find((row: { gateway_code: string }) => row.gateway_code === 'MOCK_FALLBACK')?.priority ?? 999,
    );
  });

  it('11: empty routing policy fail-closes', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = [];
    });
    const res = await fetchMatrix();
    expect(['empty_routing_policy', 'missing_routing_policy']).toContain(res.body.effective_fail_closed_reason);
    expect(res.body.effective_route).toBeNull();
  });

  it('12: matrix output aligns with submit route contract', async () => {
    await publishPolicy((doc) => {
      doc.payments.gateway_refs = ['MOCK_PRIMARY', 'MOCK_FALLBACK'];
    });
    const res = await fetchMatrix();
    expect(res.body.router_decision_matches).toBe(true);
    expect(res.body.effective_route?.gateway_code).toBe('MOCK_PRIMARY');
  });

  it('13: matrix never exposes secrets', async () => {
    await publishPolicy(() => undefined);
    const res = await fetchMatrix();
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/secretRef|payload_cipher|sk_live|webhook-secret|PAYMENT_MOCK_WEBHOOK_SECRET/i);
    assertRoutingMatrixResponseSafe(res.body);
  });

  it('14: live payments remain disabled by default', async () => {
    await publishPolicy(() => undefined);
    const res = await fetchMatrix();
    expect(res.body.live_payments_enabled).toBe(false);
    expect(res.body.active_environment).toBe('sandbox');
  });
});
