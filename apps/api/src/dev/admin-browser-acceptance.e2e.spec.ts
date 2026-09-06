import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { ProblemFilter } from '../common/problem.filter';
import { PrismaService } from '../app/prisma.service';
import { applyTestIsolation } from '../test/isolate-runtime';

async function signInCustomer(app: INestApplication, email: string) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  expect(requested.status).toBe(200);
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'customer',
    });
  expect(verified.status).toBe(200);
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function signInAdmin(app: INestApplication, email: string, personId: string) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'LOGIN' });
  expect(requested.status).toBe(200);
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'admin',
    });
  expect(verified.status).toBe(200);
  return { token: verified.body.access_token as string, personId };
}

describe('admin browser/API acceptance (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let token = '';
  let countryCode = 'IN';

  beforeAll(async () => {
    applyTestIsolation();
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] = process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL'] || !process.env['DATABASE_URL']) {
      throw new Error('DATABASE_URL and REDIS_URL are required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const country = await prisma.country.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { isoAlpha2: 'asc' },
    });
    expect(country).toBeTruthy();
    countryCode = country!.isoAlpha2;

    const email = `browser-admin-${uuidv7()}@test.local`;
    const customer = await signInCustomer(app, email);
    const role = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: customer.personId,
        roleId: role!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
    const admin = await signInAdmin(app, email, customer.personId);
    token = admin.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin login succeeds with OTP dev flow', () => {
    expect(token.length).toBeGreaterThan(20);
  });

  it('key admin routes respond successfully', async () => {
    const routes: Array<{ name: string; method: 'get' | 'post'; path: string; expect: number }> = [
      { name: 'health-packages', method: 'get', path: `/api/v1/admin/health-packages?country_code=${countryCode}`, expect: 200 },
      { name: 'care-plans', method: 'get', path: `/api/v1/admin/care-plan/catalog?country_code=${countryCode}`, expect: 200 },
      { name: 'labs', method: 'get', path: '/api/v1/admin/labs', expect: 200 },
      { name: 'substitutes', method: 'get', path: `/api/v1/admin/substitutes/edges?country_code=${countryCode}`, expect: 200 },
      { name: 'serviceability', method: 'get', path: `/api/v1/admin/shipments/serviceability/zones?country=${countryCode}`, expect: 200 },
      { name: 'finance', method: 'get', path: '/api/v1/admin/finance/dashboard', expect: 200 },
      { name: 'notifications-matrix', method: 'get', path: `/api/v1/admin/notifications/providers/matrix?country_code=${countryCode}`, expect: 200 },
      { name: 'imaging-eligibility', method: 'get', path: '/api/v1/admin/imaging/eligibility?imaging_org_id=00000000-0000-4000-8000-000000000001', expect: 200 },
      { name: 'entity-search', method: 'get', path: '/api/v1/admin/search/entities?q=admin', expect: 200 },
      { name: 'security-events', method: 'get', path: '/api/v1/admin/security-events?limit=5', expect: 200 },
      { name: 'staff', method: 'get', path: '/api/v1/admin/staff', expect: 200 },
      { name: 'company-authority', method: 'get', path: '/api/v1/admin/company-authority/grants?status=PENDING', expect: 200 },
    { name: 'control-plane-snapshot', method: 'get', path: '/api/v1/admin/control-plane/snapshot', expect: 200 },
    { name: 'control-plane-approvals', method: 'get', path: '/api/v1/admin/control-plane/approvals', expect: 200 },
    { name: 'control-plane-exceptions', method: 'get', path: '/api/v1/admin/control-plane/exceptions', expect: 200 },
    { name: 'control-plane-countries', method: 'get', path: '/api/v1/admin/control-plane/countries', expect: 200 },
    { name: 'control-plane-country-detail', method: 'get', path: `/api/v1/admin/control-plane/countries/${countryCode}`, expect: 200 },
    ];

    for (const route of routes) {
      const res = await request(app.getHttpServer())
        [route.method](route.path)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(route.expect);
    }
  });

  it('public substitute lookup requires auth', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/customer/medicine-substitutes/00000000-0000-4000-8000-000000000099?country_code=${countryCode}`,
    );
    expect(res.status).toBe(401);
  });
});
