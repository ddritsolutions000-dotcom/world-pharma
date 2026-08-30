import { INestApplication } from '@nestjs/common';
import {
  LocationKind,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  PolicyPackStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { PolicyCache } from '../policy/cache';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateLabPartner, enableLabPartnerPack } from '../test/lab-partner';
import { enableMarketplaceVendorPack } from '../test/marketplace-seller';
import { ProviderSearchService } from '../search/provider-search.service';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' | 'doctor' = 'admin') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function grantPlatformRole(prisma: PrismaService, personId: string, roleCode: string) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role!.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
}

function assertNoSensitivePayload(body: unknown) {
  const raw = JSON.stringify(body).toLowerCase();
  for (const token of [
    'diagnosis',
    'lab_result',
    'prescription_version',
    'consult_note',
    'health_timeline',
    'break_glass',
    'audit_id',
    'internal_note',
    'credential_type',
    'object_key',
    'patient_person_id',
  ]) {
    expect(raw.includes(token)).toBe(false);
  }
}

describe('R13-C provider discovery (e2e)', () => {
  jest.setTimeout(240_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;
  let countryId: string;
  let doctorProfileId: string;
  let labOrgId: string;
  let testItemId: string;
  let testSlug: string;
  let pharmacyLocationId: string;
  let testSuffix: string;

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
    orgs = app.get(OrganizationService);

    const xxCountry = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (xxCountry) {
      await prisma.policyPack.updateMany({
        where: { countryId: xxCountry.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: emptyPolicyDocument() as never },
      });
      await app.get(PolicyCache).invalidate('XX');
    }

    const enabledDoc = emptyPolicyDocument();
    enabledDoc.services.pharmacy = true;
    enableMarketplaceVendorPack(enabledDoc);
    enableLabPartnerPack(enabledDoc, { home: true, center: true });
    enabledDoc.partner_types.DOCTOR.enabled = true;
    enabledDoc.healthcare.doctor_onboarding_enabled = true;
    enabledDoc.healthcare.doctor_public_visibility = true;
    enabledDoc.healthcare.consultation_capability = true;
    enabledDoc.healthcare.appointments_enabled = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TC' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TC',
          isoAlpha3: 'TCC',
          nameI18n: { en: 'Provider discovery test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
          dataResidencyMode: 'shared',
        },
      });
      const pack = await prisma.policyPack.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          version: 1,
          status: PolicyPackStatus.PUBLISHED,
          document: enabledDoc as never,
          checksum: 'test',
          publishedAt: new Date(),
        },
      });
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    } else {
      await prisma.policyPack.updateMany({
        where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
        data: { document: enabledDoc as never },
      });
    }
    countryId = country.id;
    await app.get(PolicyCache).invalidate('TC');

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    testSuffix = suffix;
    const admin = await signIn(app, `r13c-admin-${suffix}@example.com`);
    await grantPlatformRole(prisma, admin.personId, 'super_admin');
    const labUser = await signIn(app, `r13c-lab-${suffix}@example.com`, 'customer');
    const doctorUser = await signIn(app, `r13c-doc-${suffix}@example.com`, 'doctor');

    const doctorPartner = await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: doctorUser.personId,
        partnerTypeCode: 'DOCTOR',
        countryId,
        status: PartnerStatus.ACTIVE,
      },
    });
    const doctorProfile = await prisma.doctorProfile.create({
      data: {
        id: uuidv7(),
        partnerId: doctorPartner.id,
        personId: doctorUser.personId,
        countryId,
        displayName: `R13C Discovery Doctor ${suffix}`,
        professionalName: 'Dr R13C Provider',
        specialties: ['General Practice'],
        bio: 'Public provider profile for discovery tests only.',
        onlineCapable: true,
      },
    });
    doctorProfileId = doctorProfile.id;

    const labOrg = await orgs.create({
      countryCode: 'TC',
      kind: OrganizationKind.LAB,
      legalName: `R13C Lab ${suffix}`,
      displayName: `R13C Discovery Lab ${suffix}`,
      actorId: admin.personId,
    });
    labOrgId = labOrg.id;
    await prisma.organization.update({
      where: { id: labOrg.id },
      data: { status: OrganizationStatus.ACTIVE },
    });
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: labUser.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: labOrg.id,
        status: 'ACTIVE',
      },
    });
    await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: labOrg.id,
        countryId,
        kind: LocationKind.LAB,
        name: `R13C Lab Center ${suffix}`,
        city: 'Discovery City',
        region: 'North',
        isActive: true,
      },
    });
    await activateLabPartner(app, {
      labToken: labUser.token,
      adminToken: admin.token,
      labOrgId: labOrg.id,
    });

    testSlug = `r13c-test-${suffix}`;
    const labItem = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({
        slug: testSlug,
        kind: 'LAB_TEST',
        lab_org_id: labOrg.id,
        title: `R13C Discovery Lipid Panel ${suffix}`,
        description: 'Commercial lab listing for provider discovery',
        countries: [{ country_code: 'TC' }],
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${labItem.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${labItem.body.id}/variants?lab_org_id=${labOrg.id}`)
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({ sku_code: `R13C-${suffix}`, pack_size: '1' });
    const offer = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/offers')
      .set('Authorization', `Bearer ${labUser.token}`)
      .send({
        variant_id: variant.body.id,
        lab_org_id: labOrg.id,
        country_code: 'TC',
        ownership: 'LAB_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '500',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${labUser.token}`);

    testItemId = labItem.body.id as string;

    const pharmacyOrg = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.PHARMACY_OWNED,
        legalName: `R13C Pharmacy ${suffix}`,
        displayName: `R13C Discovery Pharmacy ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
    });
    const pharmacyLocation = await prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: pharmacyOrg.id,
        countryId,
        kind: LocationKind.STORE,
        name: `R13C Store ${suffix}`,
        city: 'Discovery City',
        region: 'North',
        addressLine: '100 Public Ave',
        isActive: true,
      },
    });
    pharmacyLocationId = pharmacyLocation.id;

    const providerSearch = app.get(ProviderSearchService);
    await providerSearch.reindexDoctor(doctorProfileId, countryId, 'en');
    await providerSearch.reindexLab(labOrgId, countryId, 'en');
    await providerSearch.reindexTest(testItemId, countryId, 'en');
    await providerSearch.reindexPharmacy(pharmacyLocationId, countryId, 'en');
  });

  afterAll(async () => {
    await app.close();
  });

  it('provider discovery, filters, isolation, RBAC negatives, and no PHI leakage', async () => {
    const disabled = await request(app.getHttpServer()).get(
      '/api/v1/discovery/search?country=XX&q=R13C&types=doctor&types=lab&types=test&types=pharmacy',
    );
    expect(disabled.status).toBe(200);
    expect(disabled.body.country_enabled).toBe(false);
    expect(disabled.body.data).toEqual([]);

    const unauthorizedReindex = await request(app.getHttpServer())
      .post('/api/v1/admin/search/reindex')
      .send({ country_code: 'TC', index_kind: 'providers' });
    expect(unauthorizedReindex.status).toBe(401);

    const admin = await signIn(app, `r13c-admin-reindex-${Date.now()}@example.com`);
    await grantPlatformRole(prisma, admin.personId, 'super_admin');
    const adminReindex = await request(app.getHttpServer())
      .post('/api/v1/admin/search/reindex')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'TC', index_kind: 'provider_doctors', profile_id: doctorProfileId, force: true });
    expect(adminReindex.status).toBeLessThan(300);

    const doctorOnly = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TC&q=${encodeURIComponent(`R13C Discovery Doctor ${testSuffix}`)}&types=doctor`,
    );
    expect(doctorOnly.status).toBe(200);
    expect(doctorOnly.body.country_enabled).toBe(true);
    expect(doctorOnly.body.data.every((row: { type: string }) => row.type === 'doctor')).toBe(true);
    expect(doctorOnly.body.data.some((row: { id: string }) => row.id === doctorProfileId)).toBe(true);

    const labOnly = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TC&q=${encodeURIComponent(`R13C Discovery Lab ${testSuffix}`)}&types=lab`,
    );
    expect(labOnly.status).toBe(200);
    expect(labOnly.body.data.every((row: { type: string }) => row.type === 'lab')).toBe(true);
    expect(labOnly.body.data.some((row: { id: string }) => row.id === labOrgId)).toBe(true);

    const testOnly = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TC&q=${encodeURIComponent(`R13C Discovery Lipid Panel ${testSuffix}`)}&types=test&lab_org_id=${labOrgId}`,
    );
    expect(testOnly.status).toBe(200);
    expect(testOnly.body.data.every((row: { type: string }) => row.type === 'test')).toBe(true);
    expect(testOnly.body.data.some((row: { slug: string }) => row.slug === testSlug)).toBe(true);

    const pharmacyOnly = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TC&q=${encodeURIComponent(`R13C Store ${testSuffix}`)}&types=pharmacy&city=Discovery%20City`,
    );
    expect(pharmacyOnly.status).toBe(200);
    expect(pharmacyOnly.body.data.every((row: { type: string }) => row.type === 'pharmacy')).toBe(true);
    expect(pharmacyOnly.body.data.some((row: { id: string }) => row.id === pharmacyLocationId)).toBe(true);

    const unified = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TC&q=${encodeURIComponent(testSuffix)}&types=doctor&types=lab&types=test&types=pharmacy`,
    );
    expect(unified.status).toBe(200);
    assertNoSensitivePayload(unified.body);
    const types = unified.body.data.map((row: { type: string }) => row.type);
    expect(types).toEqual(expect.arrayContaining(['doctor', 'lab', 'test', 'pharmacy']));

    const limited = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TC&q=${encodeURIComponent(testSuffix)}&types=doctor&limit=1`,
    );
    expect(limited.status).toBe(200);
    expect(limited.body.data.length).toBeLessThanOrEqual(1);

    const oversized = await request(app.getHttpServer()).get(
      `/api/v1/discovery/search?country=TC&q=${'x'.repeat(201)}&types=doctor`,
    );
    expect(oversized.status).toBe(400);

    const suggest = await request(app.getHttpServer()).get(
      `/api/v1/discovery/suggest?country=TC&q=${encodeURIComponent(testSuffix.slice(0, 8))}&types=doctor&types=lab`,
    );
    expect(suggest.status).toBe(200);
    expect(suggest.body.data.length).toBeLessThanOrEqual(10);

    const noCustomer = await signIn(app, `r13c-customer-${Date.now()}@example.com`, 'customer');
    const forbiddenReindex = await request(app.getHttpServer())
      .post('/api/v1/admin/search/reindex')
      .set('Authorization', `Bearer ${noCustomer.token}`)
      .send({ country_code: 'TC', index_kind: 'providers' });
    expect([401, 403]).toContain(forbiddenReindex.status);
  });
});
