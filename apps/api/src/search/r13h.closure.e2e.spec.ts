import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { AnalyticsReadService } from '../analytics/analytics-read.service';
import { ClinicalSearchService } from '../clinical/clinical-search.service';
import { DiscoverySearchService } from '../discovery/discovery-search.service';
import { ProblemFilter } from '../common/problem.filter';
import { DISCOVERY_TYPES } from '../discovery/discovery-query';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { PolicyResolver } from '../policy/resolver';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { SearchIndexJobService } from './search-index-job.service';
import { applyTestIsolation } from '../test/isolate-runtime';
import {
  publishLabHealthArtifactFixture,
  seedDoctorPartner,
} from '../test/publish-lab-health-artifact';
import { OrganizationService } from '../partner/organization.service';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' | 'doctor' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R13-H closure (e2e)', () => {
  jest.setTimeout(180_000);
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
    await app?.close();
  });

  it('defaults clinical_search_enabled to false and resolver is fail-closed', () => {
    const doc = emptyPolicyDocument();
    expect(doc.healthcare.clinical_search_enabled).toBe(false);
    const resolver = app.get(PolicyResolver);
    expect(resolver.isClinicalSearchEnabled(doc)).toBe(false);
    expect(resolver.isClinicalSearchEnabled(null)).toBe(false);
  });

  it('exposes a single search-index kernel and separate read kernels', () => {
    const searchJobs = app.get(SearchIndexJobService);
    expect(searchJobs).toBeTruthy();
    expect(app.get(DiscoverySearchService)).toBeTruthy();
    expect(app.get(AnalyticsReadService)).toBeTruthy();
    expect(app.get(RecommendationsService)).toBeTruthy();
    expect(app.get(ClinicalSearchService)).toBeTruthy();
    expect(searchJobs).toBe(app.get(SearchIndexJobService));
  });

  it('keeps clinical search out of public discovery types', () => {
    expect(DISCOVERY_TYPES).toEqual(['commerce', 'help', 'doctor', 'lab', 'test', 'pharmacy']);
    expect(DISCOVERY_TYPES.includes('clinical' as never)).toBe(false);
  });

  it('denies clinical search when legal gate is off (no bypass)', async () => {
    const suffix = `r13h-gate-${Date.now().toString(36)}`;
    const orgs = app.get(OrganizationService);
    const ctx = await publishLabHealthArtifactFixture(app, prisma, orgs, suffix, (email, audience) =>
      signIn(app, email, audience),
    );
    const doctor = await signIn(app, `r13h-doc-${suffix}@example.com`, 'doctor');
    await seedDoctorPartner(prisma, ctx.country.id, doctor, suffix);

    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/clinical/search?country_code=XX&patient_person_id=${ctx.customerA.personId}&q=lab&purpose=treatment`,
      )
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(res.status).toBe(403);
  });

  it('has R13 schema tables present on isolated test database', async () => {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN (
           'search_index_jobs',
           'catalog_search_documents',
           'cms_content_search_documents',
           'provider_doctor_search_documents',
           'provider_lab_search_documents',
           'provider_test_search_documents',
           'provider_pharmacy_search_documents',
           'analytics_order_item_pairs',
           'analytics_daily_country_metrics',
           'analytics_daily_marketing_metrics',
           'clinical_search_documents'
         )
       ORDER BY table_name`,
    );
    const names = tables.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'search_index_jobs',
        'catalog_search_documents',
        'cms_content_search_documents',
        'provider_doctor_search_documents',
        'analytics_order_item_pairs',
        'analytics_daily_country_metrics',
        'clinical_search_documents',
      ]),
    );
  });

  it('enforces FORCE RLS on R13 tables without USING(true)', async () => {
    const rls = await prisma.$queryRawUnsafe<
      Array<{ relname: string; relforcerowsecurity: boolean }>
    >(
      `SELECT c.relname, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN (
           'search_index_jobs',
           'catalog_search_documents',
           'cms_content_search_documents',
           'provider_doctor_search_documents',
           'provider_lab_search_documents',
           'provider_test_search_documents',
           'provider_pharmacy_search_documents',
           'analytics_order_item_pairs',
           'analytics_daily_country_metrics',
           'analytics_daily_marketing_metrics',
           'clinical_search_documents'
         )
       ORDER BY c.relname`,
    );
    expect(rls.length).toBeGreaterThanOrEqual(11);
    for (const row of rls) {
      expect(row.relforcerowsecurity).toBe(true);
    }

    const permissive = await prisma.$queryRawUnsafe<Array<{ polname: string }>>(
      `SELECT pol.polname
       FROM pg_policy pol
       JOIN pg_class c ON c.oid = pol.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN (
           'search_index_jobs',
           'catalog_search_documents',
           'cms_content_search_documents',
           'provider_doctor_search_documents',
           'provider_lab_search_documents',
           'provider_test_search_documents',
           'provider_pharmacy_search_documents',
           'analytics_order_item_pairs',
           'analytics_daily_country_metrics',
           'analytics_daily_marketing_metrics',
           'clinical_search_documents'
         )
         AND pg_get_expr(pol.polqual, pol.polrelid) = 'true'`,
    );
    expect(permissive).toEqual([]);
  });
});
