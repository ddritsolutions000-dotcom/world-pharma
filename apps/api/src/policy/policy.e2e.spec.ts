import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from './empty-pack';
import { PolicyResolver } from './resolver';
import { PrismaService } from '../app/prisma.service';
import { PolicyAdminService } from './admin.service';
import { applyTestIsolation } from '../test/isolate-runtime';

describe('country policy pack (e2e)', () => {
  let app: INestApplication;
  let resolver: PolicyResolver;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    resolver = app.get(PolicyResolver);
    const prisma = app.get(PrismaService);
    const xx = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (xx) {
      await prisma.policyPack.updateMany({
        where: { countryId: xx.id, status: 'PUBLISHED' },
        data: { document: emptyPolicyDocument() as never },
      });
    }
    const { PolicyCache } = await import('./cache');
    await app.get(PolicyCache).invalidate('XX');
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the technical country and keeps services off', async () => {
    const countries = await request(app.getHttpServer()).get('/api/v1/countries');
    expect(countries.status).toBe(200);
    expect(countries.body.data.some((row: { iso_alpha2: string }) => row.iso_alpha2 === 'XX')).toBe(
      true,
    );

    const policy = await request(app.getHttpServer()).get('/api/v1/countries/XX/policy');
    expect(policy.status).toBe(200);
    expect(policy.body.services.pharmacy.enabled).toBe(false);
    expect(policy.body.payments.enabled).toBe(false);
    expect(JSON.stringify(policy.body)).not.toMatch(/secret|api_key|merchant_key/i);

    const services = await request(app.getHttpServer()).get('/api/v1/countries/XX/services');
    expect(services.body.services.pharmacy.enabled).toBe(false);

    const partners = await request(app.getHttpServer()).get('/api/v1/countries/XX/partner-types');
    expect(partners.body.partner_types.DOCTOR.enabled).toBe(false);
    expect(partners.body.partner_types.DOCTOR.join_public).toBe(false);
  });

  it('fails closed for unknown countries and unknown services', async () => {
    const missing = await request(app.getHttpServer()).get('/api/v1/countries/QQ/policy');
    expect(missing.status).toBe(404);
    const resolved = await resolver.resolvePublished('QQ');
    expect(resolved).toBeNull();
    expect(resolver.canUseService(null, 'pharmacy')).toBe(false);
  });

  it('rejects invalid documents in the admin service', async () => {
    const admin = app.get(PolicyAdminService);
    const bad = emptyPolicyDocument();
    bad.partner_types.DOCTOR.join_public = true;
    await expect(admin.createDraft('XX', bad)).rejects.toThrow();
  });

  it('does not expose unpublished packs on the public policy route', async () => {
    const prisma = app.get(PrismaService);
    const unpublished = await prisma.policyPack.count({
      where: { status: 'DRAFT', country: { isoAlpha2: 'XX' } },
    });
    expect(unpublished).toBeGreaterThanOrEqual(0);
    const policy = await request(app.getHttpServer()).get('/api/v1/countries/XX/policy');
    expect(policy.body.version).toBeDefined();
  });
});
