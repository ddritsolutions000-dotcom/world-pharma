import { INestApplication } from '@nestjs/common';
import { MembershipScope } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { countryFilter, loadAccessScope } from './scope';

async function signIn(app: INestApplication, email: string) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'customer',
    });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('MNC retrofit isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('isolates carts, catalog, finance, and memberships across countries', async () => {
    const region = await prisma.operatingRegion.create({
      data: {
        id: uuidv7(),
        code: `reg-${Date.now()}`,
        nameI18n: { en: 'Test region' },
      },
    });
    const entity = await prisma.legalEntity.create({
      data: {
        id: uuidv7(),
        code: `le-${Date.now()}`,
        displayName: 'Config shell — OPEN HUMAN DECISION',
        notes: 'OPEN HUMAN DECISION — no real legal identity',
        regionId: region.id,
        operatingCurrency: 'XXX',
        timezone: 'UTC',
      },
    });

    const doc = emptyPolicyDocument();
    const makeCountry = async (iso: string, name: string) => {
      let country = await prisma.country.findUnique({ where: { isoAlpha2: iso } });
      if (!country) {
        country = await prisma.country.create({
          data: {
            id: uuidv7(),
            isoAlpha2: iso,
            isoAlpha3: `${iso}X`,
            nameI18n: { en: name },
            status: 'ACTIVE',
            defaultLocale: 'en',
            defaultCurrency: 'XXX',
            defaultTimezone: 'UTC',
            dataResidencyMode: 'shared',
            regionId: region.id,
          },
        });
        const pack = await prisma.policyPack.create({
          data: {
            id: uuidv7(),
            countryId: country.id,
            version: 1,
            status: 'PUBLISHED',
            document: doc as never,
            checksum: `mnc-${iso}`,
            publishedAt: new Date(),
          },
        });
        await prisma.country.update({
          where: { id: country.id },
          data: { publishedPolicyPackId: pack.id, regionId: region.id },
        });
      } else {
        country = await prisma.country.update({
          where: { id: country.id },
          data: { regionId: region.id },
        });
      }
      return country;
    };
    const countryA = await makeCountry('MA', 'MNC A');
    const countryB = await makeCountry('MB', 'MNC B');
    expect(entity.id).toBeTruthy();
    expect(countryA.regionId).toBe(region.id);

    const customer = await signIn(app, `mnc-c-${Date.now()}@example.com`);
    const missingCountry = await request(app.getHttpServer()).get('/api/v1/catalog/brands');
    expect(missingCountry.status).toBeGreaterThanOrEqual(400);

    const brandsA = await request(app.getHttpServer()).get('/api/v1/catalog/brands?country=MA&locale=en');
    const brandsB = await request(app.getHttpServer()).get('/api/v1/catalog/brands?country=MB&locale=en');
    expect(brandsA.status).toBe(200);
    expect(brandsB.status).toBe(200);

    const cartA = await request(app.getHttpServer())
      .get('/api/v1/me/cart?country=MA')
      .set('Authorization', `Bearer ${customer.token}`);
    const cartB = await request(app.getHttpServer())
      .get('/api/v1/me/cart?country=MB')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(cartA.status).toBe(200);
    expect(cartB.status).toBe(200);
    expect(cartA.body.id).not.toBe(cartB.body.id);

    const carts = await prisma.cart.findMany({ where: { customerPersonId: customer.personId } });
    expect(carts).toHaveLength(2);
    expect(new Set(carts.map((row) => row.countryId)).size).toBe(2);

    const countryRole = await prisma.role.findUnique({ where: { code: 'company_operations' } });
    const operator = await signIn(app, `mnc-ops-${Date.now()}@example.com`);
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: operator.personId,
        roleId: countryRole!.id,
        scope: MembershipScope.country,
        countryId: countryA.id,
        status: 'ACTIVE',
      },
    });
    const scope = await loadAccessScope(prisma, {
      personId: operator.personId,
      sessionId: 's',
      audience: 'admin',
      roles: ['company_operations'],
      membershipId: (
        await prisma.membership.findFirst({ where: { personId: operator.personId } })
      )?.id,
      tokenVersion: 1,
    });
    expect(countryFilter(scope)).toBe(countryA.id);

    const dash = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/dashboard')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(dash.status).toBeGreaterThanOrEqual(400);
  });
});
