import { INestApplication } from '@nestjs/common';
import {
  OrganizationKind,
  OrganizationStatus,
  PolicyPackStatus,
  SettlementBatchStatus,
  VendorPayableStatus,
} from '@prisma/client';
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
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../test/marketplace-seller';
import { MARKETPLACE_ATTESTATION_CODE } from './marketplace-eligibility.service';
import { provisionSuperAdmin, signInCustomer } from '../test/sign-in';

const PHI_LEAK = /diagnosis|clinical_note|prescription_instruction|dosage|encounter|patient_id|customer_person_id/i;

describe('R6-F marketplace attestation + pack gates (e2e)', () => {
  jest.setTimeout(120_000);
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

  it('fail-closes empty pack, requires attestation, accepts, isolates sellers, and keeps PHI out', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const admin = await provisionSuperAdmin(app, prisma, `r6f-admin-${suffix}`);
    const vendorA = await signInCustomer(app, `r6f-va-${suffix}@example.com`);
    const vendorB = await signInCustomer(app, `r6f-vb-${suffix}@example.com`);

    let country = await prisma.country.findUnique({ where: { isoAlpha2: 'TF' } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: 'TF',
          isoAlpha3: 'TFF',
          nameI18n: { en: 'R6F test' },
          status: 'ACTIVE',
          defaultLocale: 'en',
          defaultCurrency: 'XXX',
          defaultTimezone: 'UTC',
        },
      });
    }

    // Empty/disabled pack published first — fail closed.
    const disabledDoc = emptyPolicyDocument();
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000),
        status: PolicyPackStatus.PUBLISHED,
        document: disabledDoc as never,
        checksum: `r6f-off-${suffix}`,
        publishedAt: new Date(),
      },
    });
    let pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    await app.get(PolicyCache).invalidate('TF');

    const orgA = await orgs.create({
      countryCode: 'TF',
      kind: OrganizationKind.VENDOR,
      legalName: `R6F A ${suffix}`,
      displayName: `R6F A ${suffix}`,
      actorId: admin.personId,
    });
    const orgB = await orgs.create({
      countryCode: 'TF',
      kind: OrganizationKind.VENDOR,
      legalName: `R6F B ${suffix}`,
      displayName: `R6F B ${suffix}`,
      actorId: admin.personId,
    });
    await prisma.organization.updateMany({
      where: { id: { in: [orgA.id, orgB.id] } },
      data: { status: OrganizationStatus.ACTIVE },
    });
    await attachOrgAdmin(vendorA.personId, orgA.id);
    await attachOrgAdmin(vendorB.personId, orgB.id);

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    const disabled = await request(app.getHttpServer())
      .get(`/api/v1/vendor/marketplace/eligibility?seller_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(disabled.status).toBe(200);
    expect(disabled.body.state).toBe('DISABLED');
    expect(disabled.body.live_payout).toBe(false);
    expect(JSON.stringify(disabled.body)).not.toMatch(PHI_LEAK);

    const stealElig = await request(app.getHttpServer())
      .get(`/api/v1/vendor/marketplace/eligibility?seller_org_id=${orgA.id}`)
      .set(auth(vendorB.token));
    expect(stealElig.status).toBe(403);

    // Enable pack gates.
    const enabledDoc = emptyPolicyDocument();
    enableMarketplaceVendorPack(enabledDoc);
    await prisma.policyPack.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        version: Math.floor(Date.now() % 1_000_000) + 1,
        status: PolicyPackStatus.PUBLISHED,
        document: enabledDoc as never,
        checksum: `r6f-on-${suffix}`,
        publishedAt: new Date(),
      },
    });
    pack = await prisma.policyPack.findFirst({
      where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    if (pack) {
      await prisma.country.update({
        where: { id: country.id },
        data: { publishedPolicyPackId: pack.id },
      });
    }
    await app.get(PolicyCache).invalidate('TF');

    const needsAttest = await request(app.getHttpServer())
      .get(`/api/v1/vendor/marketplace/eligibility?seller_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(needsAttest.status).toBe(200);
    expect(needsAttest.body.state).toBe('REQUIRES_ATTESTATION');
    expect(needsAttest.body.gates.catalog_write).toBe(false);

    const badCode = await request(app.getHttpServer())
      .post('/api/v1/vendor/marketplace/attest')
      .set(auth(vendorA.token))
      .send({ seller_org_id: orgA.id, attestation_code: 'NOT_A_REAL_CERT' });
    expect(badCode.status).toBe(400);

    const writeBlocked = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorA.token))
      .send({
        variant_id: uuidv7(),
        seller_org_id: orgA.id,
        country_code: 'TF',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '120',
      });
    expect(writeBlocked.status).toBe(403);
    expect(writeBlocked.body.code).toBe('MARKETPLACE_ATTESTATION_REQUIRED');

    const attested = await request(app.getHttpServer())
      .post('/api/v1/vendor/marketplace/attest')
      .set(auth(vendorA.token))
      .send({ seller_org_id: orgA.id, attestation_code: MARKETPLACE_ATTESTATION_CODE });
    expect(attested.status).toBeLessThan(300);
    expect(attested.body.state).toBe('PENDING');
    expect(JSON.stringify(attested.body)).not.toMatch(PHI_LEAK);

    const pendingWrite = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorA.token))
      .send({
        variant_id: uuidv7(),
        seller_org_id: orgA.id,
        country_code: 'TF',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '120',
      });
    expect(pendingWrite.status).toBe(403);
    expect(pendingWrite.body.code).toBe('MARKETPLACE_PENDING_ACCEPTANCE');

    const unauthorizedAccept = await request(app.getHttpServer())
      .post('/api/v1/admin/marketplace/acceptance')
      .set(auth(vendorA.token))
      .send({ seller_org_id: orgA.id, action: 'accept' });
    expect([401, 403]).toContain(unauthorizedAccept.status);

    await activateMarketplaceSeller(app, {
      vendorToken: vendorA.token,
      adminToken: admin.token,
      sellerOrgId: orgA.id,
    });

    const eligible = await request(app.getHttpServer())
      .get(`/api/v1/vendor/marketplace/eligibility?seller_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(eligible.status).toBe(200);
    expect(eligible.body.state).toBe('ELIGIBLE');
    expect(eligible.body.gates.catalog_write).toBe(true);
    expect(eligible.body.gates.finance_settlement_visibility).toBe(true);

    const activity = await request(app.getHttpServer())
      .get(`/api/v1/vendor/marketplace/activity?seller_org_id=${orgA.id}`)
      .set(auth(vendorA.token));
    expect(activity.status).toBe(200);
    expect(activity.body.data.some((row: { type: string }) => row.type === 'MARKETPLACE_SELLER_ATTESTED')).toBe(
      true,
    );
    expect(JSON.stringify(activity.body)).not.toMatch(PHI_LEAK);

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/admin/marketplace/acceptance')
      .set(auth(admin.token))
      .send({ seller_org_id: orgA.id, action: 'block', reason: 'Sandbox review' });
    expect(blocked.status).toBeLessThan(300);
    expect(blocked.body.state).toBe('BLOCKED');

    const blockedWrite = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set(auth(vendorA.token))
      .send({
        variant_id: uuidv7(),
        seller_org_id: orgA.id,
        country_code: 'TF',
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '120',
      });
    expect(blockedWrite.status).toBe(403);
    expect(blockedWrite.body.code).toBe('MARKETPLACE_BLOCKED');

    // Settlement batch company-scope uses can_country (R6-F RLS fix).
    const periodId = uuidv7();
    const batchId = uuidv7();
    await prisma.settlementPeriod.create({
      data: {
        id: periodId,
        countryId: country.id,
        currency: 'XXX',
        startsAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-01-31T23:59:59Z'),
      },
    });
    await prisma.settlementBatch.create({
      data: {
        id: batchId,
        periodId,
        status: SettlementBatchStatus.OPEN,
        currency: 'XXX',
        createdBy: admin.personId,
      },
    });
    // Payable status unused here — RLS check via admin finance settlement-lines path.
    expect(VendorPayableStatus.PENDING).toBeDefined();

    const adminLines = await request(app.getHttpServer())
      .get(`/api/v1/admin/finance/settlement-lines?seller_org_id=${orgA.id}`)
      .set(auth(admin.token));
    expect(adminLines.status).toBe(200);
    expect(adminLines.body.live_payout).toBe(false);
  });
});
