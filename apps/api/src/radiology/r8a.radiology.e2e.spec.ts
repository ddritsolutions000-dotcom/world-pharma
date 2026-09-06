import { INestApplication } from '@nestjs/common';
import { OrganizationKind, OrganizationStatus, PolicyPackStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import { activateImagingPartner, enableImagingPartnerPack } from '../test/imaging-partner';
import { RADIOLOGY_PARTNER_ATTESTATION_CODE } from './radiology-capability.service';
import { bootstrapSuperAdminByEmail, signIn as signInAudience } from '../test/sign-in';

describe('R8-A radiology foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgs: OrganizationService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  async function attachOrgAdmin(personId: string, organizationId: string) {
    const role = await prisma.role.findUnique({ where: { code: 'org_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: 'organization',
        organizationId,
        status: 'ACTIVE',
      },
    });
  }

  async function publishPack(doc: ReturnType<typeof emptyPolicyDocument>, suffix: string) {
    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'XX',
          isoAlpha3: 'XXX',
          nameI18n: { en: 'R8A test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000) + Math.floor(Math.random() * 1000),
        status: PolicyPackStatus.PUBLISHED,
        document: doc as never,
        checksum: `r8a-${suffix}`,
        publishedAt: new Date(),
      },
    });
    const pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    await app.get(PolicyCache).invalidate('XX');
    return country;
  }

  it('gates IMAGING_CENTER orgs, isolates Imaging A↛B and Lab↛Imaging, pack fail-closed; no booking/payment', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await bootstrapSuperAdminByEmail(app, prisma, `r8a-admin-${suffix}@example.com`);
    const imagingUser = await signInAudience(app, `r8a-ia-${suffix}@example.com`);
    const otherImaging = await signInAudience(app, `r8a-ib-${suffix}@example.com`);
    const labUser = await signInAudience(app, `r8a-lab-${suffix}@example.com`);
    const vendorUser = await signInAudience(app, `r8a-vend-${suffix}@example.com`);

    const emptyDoc = emptyPolicyDocument();
    await publishPack(emptyDoc, `empty-${suffix}`);

    const imagingA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8A Imaging A ${suffix}`,
      displayName: `R8A Imaging A ${suffix}`,
      actorId: admin.personId,
    });
    const imagingB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: `R8A Imaging B ${suffix}`,
      displayName: `R8A Imaging B ${suffix}`,
      actorId: admin.personId,
    });
    const lab = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R8A Lab ${suffix}`,
      displayName: `R8A Lab ${suffix}`,
      actorId: admin.personId,
    });
    const vendor = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: `R8A Vendor ${suffix}`,
      displayName: `R8A Vendor ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [imagingA.id, imagingB.id, lab.id, vendor.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(imagingUser.personId, imagingA.id);
    await attachOrgAdmin(otherImaging.personId, imagingB.id);
    await attachOrgAdmin(labUser.personId, lab.id);
    await attachOrgAdmin(vendorUser.personId, vendor.id);

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const disabled = await request(app.getHttpServer())
      .get(`/api/v1/radiology/capabilities/eligibility?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token));
    expect(disabled.status).toBe(200);
    expect(disabled.body.state).toBe('DISABLED');
    expect(disabled.body.booking_enabled).toBe(false);
    expect(disabled.body.live_payout).toBe(false);

    const attestBlocked = await request(app.getHttpServer())
      .post('/api/v1/radiology/capabilities/attest')
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id, attestation_code: RADIOLOGY_PARTNER_ATTESTATION_CODE });
    expect(attestBlocked.status).toBeGreaterThanOrEqual(400);

    const enabledDoc = emptyPolicyDocument();
    enableImagingPartnerPack(enabledDoc);
    await publishPack(enabledDoc, `imaging-${suffix}`);

    const orgsRes = await request(app.getHttpServer())
      .get('/api/v1/radiology/organizations')
      .set(auth(imagingUser.token));
    expect(orgsRes.status).toBe(200);
    expect(orgsRes.body.data.every((row: { kind: string }) => row.kind === 'IMAGING_CENTER')).toBe(true);
    expect(orgsRes.body.data.some((row: { id: string }) => row.id === imagingA.id)).toBe(true);
    expect(orgsRes.body.data.some((row: { id: string }) => row.id === lab.id)).toBe(false);

    const labAsImaging = await request(app.getHttpServer())
      .get('/api/v1/radiology/organizations')
      .set(auth(labUser.token));
    expect(labAsImaging.status).toBe(200);
    expect(labAsImaging.body.data).toEqual([]);

    const crossElig = await request(app.getHttpServer())
      .get(`/api/v1/radiology/capabilities/eligibility?imaging_org_id=${imagingB.id}`)
      .set(auth(imagingUser.token));
    expect(crossElig.status).toBe(403);

    const labEligOnImaging = await request(app.getHttpServer())
      .get(`/api/v1/radiology/capabilities/eligibility?imaging_org_id=${lab.id}`)
      .set(auth(labUser.token));
    expect(labEligOnImaging.status).toBe(403);

    await activateImagingPartner(app, {
      imagingToken: imagingUser.token,
      adminToken: admin.token,
      imagingOrgId: imagingA.id,
    });

    const eligible = await request(app.getHttpServer())
      .get(`/api/v1/radiology/capabilities/eligibility?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token));
    expect(eligible.status).toBe(200);
    expect(eligible.body.state).toBe('ELIGIBLE');
    expect(eligible.body.gates.catalog_write).toBe(true);
    expect(eligible.body.booking_enabled).toBe(true);

    const item = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `r8a-imaging-${suffix}`,
        kind: 'IMAGING_STUDY',
        imaging_org_id: imagingA.id,
        title: 'Chest X-Ray',
        description: 'Imaging service title — not a clinical report.',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);
    expect(item.body.kind).toBe('IMAGING_STUDY');
    expect(JSON.stringify(item.body)).not.toMatch(/diagnosis|clinical_note|prescription|dicom/i);

    const badKind = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `r8a-bad-${suffix}`,
        kind: 'LAB_TEST',
        imaging_org_id: imagingA.id,
        title: 'Not an imaging study',
        countries: [{ country_code: 'XX' }],
      });
    expect(badKind.status).toBeGreaterThanOrEqual(400);

    const labItemOnImaging = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set(auth(imagingUser.token))
      .send({
        slug: `r8a-cross-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: imagingA.id,
        title: 'Wrong org kind',
        countries: [{ country_code: 'XX' }],
      });
    expect(labItemOnImaging.status).toBeGreaterThanOrEqual(400);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/radiology/catalog/items/${item.body.id}/variants?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token))
      .send({ sku_code: `IMG-${suffix}`, pack_size: '1 study' });
    expect(variant.status).toBe(201);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/radiology/catalog/offers')
      .set(auth(imagingUser.token))
      .send({
        variant_id: variant.body.id,
        imaging_org_id: imagingA.id,
        country_code: 'XX',
        ownership: 'IMAGING_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '500',
      });
    expect(offer.status).toBe(201);
    expect(offer.body.ownership).toBe('IMAGING_OWNED');

    const crossOffer = await request(app.getHttpServer())
      .get(`/api/v1/radiology/catalog/offers?imaging_org_id=${imagingB.id}`)
      .set(auth(imagingUser.token));
    expect(crossOffer.status).toBe(403);

    const listOwn = await request(app.getHttpServer())
      .get(`/api/v1/radiology/catalog/offers?imaging_org_id=${imagingA.id}`)
      .set(auth(imagingUser.token));
    expect(listOwn.status).toBe(200);
    expect(listOwn.body.data.some((row: { id: string }) => row.id === offer.body.id)).toBe(true);
    expect(JSON.stringify(listOwn.body)).not.toMatch(/diagnosis|clinical_note|patient_id|prescription|dicom/i);

    const bookingEndpoint = await request(app.getHttpServer())
      .post('/api/v1/me/imaging/bookings')
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id });
    expect(bookingEndpoint.status).not.toBe(404);
    expect(bookingEndpoint.status).toBeGreaterThanOrEqual(400);

    const noPay = await request(app.getHttpServer())
      .post('/api/v1/radiology/payments')
      .set(auth(imagingUser.token))
      .send({ imaging_org_id: imagingA.id });
    expect(noPay.status).toBe(404);
  });
});
