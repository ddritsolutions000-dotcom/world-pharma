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
import { activateLabPartner, enableLabPartnerPack } from '../test/lab-partner';
import { LAB_PARTNER_ATTESTATION_CODE } from './lab-capability.service';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience,
    });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R7-A lab diagnostics foundation (e2e)', () => {
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
          nameI18n: { en: 'R7A test' },
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
        checksum: `r7a-${suffix}`,
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

  it('gates LAB orgs, isolates Lab A↛B, pack fail-closed, catalog ownership; no booking/payment', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await signIn(app, `r7a-admin-${suffix}@example.com`, 'admin');
    const labUser = await signIn(app, `r7a-la-${suffix}@example.com`);
    const otherLab = await signIn(app, `r7a-lb-${suffix}@example.com`);
    const vendorUser = await signIn(app, `r7a-vend-${suffix}@example.com`);

    const superAdmin = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: admin.personId,
        roleId: superAdmin!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });

    const emptyDoc = emptyPolicyDocument();
    await publishPack(emptyDoc, `empty-${suffix}`);

    const labA = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7A Lab A ${suffix}`,
      displayName: `R7A Lab A ${suffix}`,
      actorId: admin.personId,
    });
    const labB = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.LAB,
      legalName: `R7A Lab B ${suffix}`,
      displayName: `R7A Lab B ${suffix}`,
      actorId: admin.personId,
    });
    const vendor = await orgs.create({
      countryCode: 'XX',
      kind: OrganizationKind.VENDOR,
      legalName: `R7A Vendor ${suffix}`,
      displayName: `R7A Vendor ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [labA.id, labB.id, vendor.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(labUser.personId, labA.id);
    await attachOrgAdmin(otherLab.personId, labB.id);
    await attachOrgAdmin(vendorUser.personId, vendor.id);

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const disabled = await request(app.getHttpServer())
      .get(`/api/v1/lab/capabilities/eligibility?lab_org_id=${labA.id}`)
      .set(auth(labUser.token));
    expect(disabled.status).toBe(200);
    expect(disabled.body.state).toBe('DISABLED');
    expect(disabled.body.booking_enabled).toBe(false);
    expect(disabled.body.live_payout).toBe(false);

    const attestBlocked = await request(app.getHttpServer())
      .post('/api/v1/lab/capabilities/attest')
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id, attestation_code: LAB_PARTNER_ATTESTATION_CODE });
    expect(attestBlocked.status).toBeGreaterThanOrEqual(400);

    const enabledDoc = emptyPolicyDocument();
    enableLabPartnerPack(enabledDoc, { home: true, center: false });
    await publishPack(enabledDoc, `lab-${suffix}`);

    const orgsRes = await request(app.getHttpServer())
      .get('/api/v1/lab/organizations')
      .set(auth(labUser.token));
    expect(orgsRes.status).toBe(200);
    expect(orgsRes.body.data.every((row: { kind: string }) => row.kind === 'LAB')).toBe(true);
    expect(orgsRes.body.data.some((row: { id: string }) => row.id === labA.id)).toBe(true);
    expect(orgsRes.body.data.some((row: { id: string }) => row.id === vendor.id)).toBe(false);

    const vendorAsLab = await request(app.getHttpServer())
      .get('/api/v1/lab/organizations')
      .set(auth(vendorUser.token));
    expect(vendorAsLab.status).toBe(200);
    expect(vendorAsLab.body.data).toEqual([]);

    const crossElig = await request(app.getHttpServer())
      .get(`/api/v1/lab/capabilities/eligibility?lab_org_id=${labB.id}`)
      .set(auth(labUser.token));
    expect(crossElig.status).toBe(403);

    const vendorElig = await request(app.getHttpServer())
      .get(`/api/v1/lab/capabilities/eligibility?lab_org_id=${vendor.id}`)
      .set(auth(labUser.token));
    expect(vendorElig.status).toBe(403);

    await activateLabPartner(app, {
      labToken: labUser.token,
      adminToken: admin.token,
      labOrgId: labA.id,
    });

    const eligible = await request(app.getHttpServer())
      .get(`/api/v1/lab/capabilities/eligibility?lab_org_id=${labA.id}`)
      .set(auth(labUser.token));
    expect(eligible.status).toBe(200);
    expect(eligible.body.state).toBe('ELIGIBLE');
    expect(eligible.body.gates.catalog_write).toBe(true);
    expect(eligible.body.booking_enabled).toBe(true);

    const item = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set(auth(labUser.token))
      .send({
        slug: `r7a-lab-${suffix}`,
        kind: 'LAB_TEST',
        lab_org_id: labA.id,
        title: 'CBC Panel',
        description: 'Complete blood count — commercial title only',
        countries: [{ country_code: 'XX' }],
      });
    expect(item.status).toBe(201);
    expect(item.body.kind).toBe('LAB_TEST');
    expect(JSON.stringify(item.body)).not.toMatch(/diagnosis|clinical_note|prescription/i);

    const badKind = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/items')
      .set(auth(labUser.token))
      .send({
        slug: `r7a-bad-${suffix}`,
        kind: 'OTC',
        lab_org_id: labA.id,
        title: 'Not a lab test',
        countries: [{ country_code: 'XX' }],
      });
    expect(badKind.status).toBeGreaterThanOrEqual(400);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
      .set(auth(labUser.token))
      .send({ sku_code: `LAB-${suffix}`, pack_size: '1 draw' });
    expect(variant.status).toBe(201);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/lab/catalog/offers')
      .set(auth(labUser.token))
      .send({
        variant_id: variant.body.id,
        lab_org_id: labA.id,
        country_code: 'XX',
        ownership: 'LAB_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '500',
      });
    expect(offer.status).toBe(201);
    expect(offer.body.ownership).toBe('LAB_OWNED');

    const crossOffer = await request(app.getHttpServer())
      .get(`/api/v1/lab/catalog/offers?lab_org_id=${labB.id}`)
      .set(auth(labUser.token));
    expect(crossOffer.status).toBe(403);

    const listOwn = await request(app.getHttpServer())
      .get(`/api/v1/lab/catalog/offers?lab_org_id=${labA.id}`)
      .set(auth(labUser.token));
    expect(listOwn.status).toBe(200);
    expect(listOwn.body.data.some((row: { id: string }) => row.id === offer.body.id)).toBe(true);
    expect(JSON.stringify(listOwn.body)).not.toMatch(/diagnosis|clinical_note|patient_id|prescription/i);

    const companyAsLab = await request(app.getHttpServer())
      .get('/api/v1/admin/finance/dashboard')
      .set(auth(labUser.token));
    expect(companyAsLab.status).toBeGreaterThanOrEqual(400);

    // R7-A boundary: staff booking list exists in R7-B; legacy /lab/payments stays absent.
    const noPay = await request(app.getHttpServer())
      .post('/api/v1/lab/payments')
      .set(auth(labUser.token))
      .send({ lab_org_id: labA.id });
    expect(noPay.status).toBe(404);
  });
});
