/**
 * Sprint 48 — Healthcare network control plane (e2e)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parseEnv } from '@world-pharma/config';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { configureApi } from '../common/http-setup';
import { applyTestIsolation } from '../test/isolate-runtime';
import { provisionSuperAdmin } from '../test/sign-in';
import { evaluateProductionHealthcareAvailable } from './production-healthcare-gate';

describe('Sprint 48 healthcare network (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] = process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    process.env['CORS_ALLOWED_ORIGINS'] = process.env['CORS_ALLOWED_ORIGINS'] ?? 'http://localhost:3000';
    delete process.env['HEALTHCARE_ENVIRONMENT'];
    delete process.env['HEALTHCARE_LIVE_ENABLED'];
    if (!process.env['REDIS_URL']) throw new Error('REDIS_URL is required');
    const env = parseEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApi(app, env);
    await app.init();
    prisma = app.get(PrismaService);
    const admin = await provisionSuperAdmin(app, prisma, 's48-admin');
    adminToken = admin.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin healthcare network snapshot never fakes green live integrations', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/healthcare-network/snapshot')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.never_fake_green).toBe(true);
    expect(res.body.integrations.catalog.every((r: { status: string }) => r.status === 'EXTERNAL_GATED')).toBe(
      true,
    );
    expect(JSON.stringify(res.body)).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@/);
  });

  it('unauthenticated healthcare snapshot is blocked', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/healthcare-network/snapshot');
    expect(res.status).toBe(401);
  });

  it('production healthcare availability stays blocked without live adapters', async () => {
    const country = await prisma.country.findFirst();
    expect(country).toBeTruthy();
    const prev = process.env['HEALTHCARE_ENVIRONMENT'];
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    const result = await evaluateProductionHealthcareAvailable(prisma, {
      countryId: country!.id,
      kind: 'DOCTOR',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('NO_PRODUCTION_CLINICAL_ADAPTER');
    expect(result.never_fallback_to_sandbox_adapter).toBe(true);
    if (prev === undefined) delete process.env['HEALTHCARE_ENVIRONMENT'];
    else process.env['HEALTHCARE_ENVIRONMENT'] = prev;
    delete process.env['HEALTHCARE_LIVE_ENABLED'];
  });

  it('lists integration gates via admin API', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/healthcare-network/integrations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.never_claim_live).toBe(true);
    expect(res.body.catalog.some((r: { dependency_type: string }) => r.dependency_type === 'PACS')).toBe(true);
  });

  it('production availability endpoint requires country_code', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/healthcare-network/production-availability?kind=LAB')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('production availability for imaging reports EXTERNAL_GATED PACS', async () => {
    const country = await prisma.country.findFirst();
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/healthcare-network/production-availability?country_code=${country!.isoAlpha2}&kind=IMAGING_CENTER`,
      )
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.integrations.some((i: { dependency_type: string }) => i.dependency_type === 'PACS')).toBe(
      true,
    );
  });
});
