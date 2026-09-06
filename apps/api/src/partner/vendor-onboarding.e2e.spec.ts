import { INestApplication } from '@nestjs/common';
import {
  InventoryLotStatus,
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
import { emptyPolicyDocument } from '../policy/empty-pack';
import { applyTestIsolation } from '../test/isolate-runtime';
import {
  activateMarketplaceSeller,
  enableMarketplaceVendorPack,
} from '../test/marketplace-seller';
import { provisionSuperAdmin, signIn, signInCustomer } from '../test/sign-in';

describe('Sprint 15 vendor onboarding activation (e2e)', () => {
  jest.setTimeout(300_000);
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

  async function seedOnboardingCountry(iso2: string) {
    const doc = emptyPolicyDocument();
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.partner_types.VENDOR.join_public = true;
    doc.partner_types.VENDOR.required_fields = [
      'legal_name',
      'display_name',
      'contact_email',
      'business_address',
    ];
    doc.partner_types.VENDOR.required_documents = ['BUSINESS_REGISTRATION'];
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: iso2 } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: iso2,
          isoAlpha3: `${iso2}Q`,
          nameI18n: { en: `Onboarding ${iso2}` },
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
          document: doc as never,
          checksum: `vo-${iso2}`,
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
        data: { document: doc as never },
      });
    }
    await app.get(PolicyCache).invalidate(iso2);
    const zoneCount = await prisma.serviceabilityZone.count({ where: { countryId: country.id } });
    if (!zoneCount) {
      await prisma.serviceabilityZone.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          name: `${iso2} metro`,
          postalPrefix: '400',
          city: 'Test City',
          region: 'Test',
          medicineDelivery: true,
          labHomeCollection: false,
          expressDelivery: true,
          codAvailable: true,
          priority: 10,
          active: true,
        },
      });
    }
    return country;
  }

  async function sessionForEmail(email: string, audience: 'customer' | 'partner_applicant' = 'customer') {
    const requested = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identifier: email, purpose: 'LOGIN' });
    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        challenge_id: requested.body.challenge_id,
        code: requested.body.dev_code,
        audience,
      });
    if (verified.status !== 200) {
      throw new Error(`Login failed (${verified.status}): ${JSON.stringify(verified.body)}`);
    }
    return verified.body.access_token as string;
  }

  async function applicantSession(email: string) {
    const customer = await signInCustomer(app, email);
    return {
      personId: customer.personId,
      applicantToken: await sessionForEmail(email, 'partner_applicant'),
      customerToken: customer.token,
      email,
    };
  }

  it('full onboarding → activation → marketplace eligibility → suspension', async () => {
    const iso2 = 'VO';
    const country = await seedOnboardingCountry(iso2);
    const admin = await provisionSuperAdmin(app, prisma, `vo-admin-${Date.now()}`);
    const vendorA = await applicantSession(`vo-vendor-a-${Date.now()}@example.com`);
    const vendorB = await applicantSession(`vo-vendor-b-${Date.now()}@example.com`);

    const created = await request(app.getHttpServer())
      .post('/api/v1/join/applications')
      .set('Authorization', `Bearer ${vendorA.applicantToken}`)
      .send({ partner_type_code: 'VENDOR', country_code: iso2 });
    expect(created.status).toBe(201);
    const applicationId = created.body.application.id as string;

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/join/applications')
      .set('Authorization', `Bearer ${vendorA.applicantToken}`)
      .send({ partner_type_code: 'VENDOR', country_code: iso2 });
    expect(duplicate.status).toBeGreaterThanOrEqual(400);

    await request(app.getHttpServer())
      .post(`/api/v1/join/applications/${applicationId}/fields`)
      .set('Authorization', `Bearer ${vendorA.applicantToken}`)
      .send({
        fields: {
          legal_name: 'VO Pharmacy Ltd',
          display_name: 'VO Pharmacy',
          contact_email: 'ops@vopharmacy.test',
          business_address: '12 Market Road',
        },
      });

    const tinyPdf = Buffer.from('%PDF-1.4 vo-doc').toString('base64');
    await request(app.getHttpServer())
      .post(`/api/v1/join/applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${vendorA.applicantToken}`)
      .send({
        document_type_code: 'BUSINESS_REGISTRATION',
        content_type: 'application/pdf',
        original_name: 'registration.pdf',
        content_base64: tinyPdf,
      });

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/join/applications/${applicationId}/submit`)
      .set('Authorization', `Bearer ${vendorA.applicantToken}`);
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe(PartnerStatus.DOCUMENTS_SUBMITTED);

    const docsList = await request(app.getHttpServer())
      .get(`/api/v1/admin/partners/applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(docsList.status).toBe(200);
    const businessDoc = (docsList.body.data as Array<{ id: string; document_type_code: string }>).find(
      (d) => d.document_type_code === 'BUSINESS_REGISTRATION',
    );
    expect(businessDoc?.id).toBeTruthy();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/documents/${businessDoc!.id}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ approve: true });

    const isolation = await request(app.getHttpServer())
      .get(`/api/v1/join/applications/${applicationId}`)
      .set('Authorization', `Bearer ${vendorB.applicantToken}`);
    expect(isolation.status).toBe(404);

    const unauthorizedApprove = await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/transition`)
      .set('Authorization', `Bearer ${vendorA.customerToken}`)
      .send({ to: PartnerStatus.APPROVED, reason: 'self_approve' });
    expect(unauthorizedApprove.status).toBe(403);

    for (const [to, reason] of [
      [PartnerStatus.UNDER_REVIEW, 'review'],
      [PartnerStatus.VERIFIED, 'verified'],
      [PartnerStatus.APPROVED, 'approved'],
    ] as const) {
      const step = await request(app.getHttpServer())
        .post(`/api/v1/admin/partners/applications/${applicationId}/transition`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ to, reason });
      expect(step.status).toBe(200);
    }

    const provisioned = await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/provision-org`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(provisioned.status).toBe(200);
    const sellerOrgId = provisioned.body.organization_id as string;
    const locationId = provisioned.body.location_id as string;

    const vendorToken = await sessionForEmail(vendorA.email, 'customer');

    await activateMarketplaceSeller(app, {
      vendorToken,
      adminToken: admin.token,
      sellerOrgId,
    });

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `vo-brand-${Date.now()}`, name: 'VO Brand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `vo-item-${Date.now()}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'VO Medicine',
        countries: [{ country_code: iso2 }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `VO-SKU-${Date.now()}`, pack_size: '10', strength: '250mg' });
    const offer = await request(app.getHttpServer())
      .post('/api/v1/vendor/catalog/offers')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: sellerOrgId,
        country_code: iso2,
        ownership: 'VENDOR_OWNED',
        currency: 'XXX',
        cost_minor: '100',
        sell_minor: '250',
        list_minor: '300',
      });
    expect(offer.status).toBeLessThan(300);
    await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${vendorToken}`);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);

    const lot = await prisma.inventoryLot.create({
      data: {
        id: uuidv7(),
        variantId: variant.body.id,
        locationId,
        ownerOrgId: sellerOrgId,
        countryId: country.id,
        lotCode: `VO-${Date.now()}`,
        status: InventoryLotStatus.ACTIVE,
      },
    });
    await prisma.inventoryBalance.create({
      data: { id: uuidv7(), lotId: lot.id, onHand: 20, available: 20 },
    });

    const preActivateReadiness = await request(app.getHttpServer())
      .get(`/api/v1/join/applications/${applicationId}/onboarding`)
      .set('Authorization', `Bearer ${vendorA.applicantToken}`);
    expect(preActivateReadiness.status).toBe(200);
    expect(preActivateReadiness.body.ready_for_activation).toBe(true);
    expect(preActivateReadiness.body.lifecycle_phase).toBe('READY_FOR_ACTIVATION');
    expect(preActivateReadiness.body.marketplace_visible).toBe(false);

    const preActivateCatalog = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item.body.slug}?country=${iso2}`,
    );
    expect(preActivateCatalog.status).toBe(404);

    const activated = await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/activate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ organization_id: sellerOrgId, location_id: locationId });
    expect(activated.status).toBe(200);
    expect(activated.body.status).toBe(PartnerStatus.ACTIVE);

    const liveCatalog = await request(app.getHttpServer()).get(
      `/api/v1/catalog/items/${item.body.slug}?country=${iso2}`,
    );
    expect(liveCatalog.status).toBe(200);
    expect(liveCatalog.body.offers.some((row: { id: string }) => row.id === offer.body.id)).toBe(true);

    const customer = await signIn(app, `vo-customer-${Date.now()}@example.com`, 'customer');
    const add = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `vo-add-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    expect(add.status).toBe(201);

    const suspended = await request(app.getHttpServer())
      .post(`/api/v1/admin/partners/applications/${applicationId}/transition`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ to: PartnerStatus.SUSPENDED, reason: 'compliance_hold' });
    expect(suspended.status).toBe(200);

    const blockedAdd = await request(app.getHttpServer())
      .post(`/api/v1/me/cart/items?country=${iso2}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `vo-block-${Date.now()}`)
      .send({ offer_id: offer.body.id, qty: 1 });
    expect(blockedAdd.status).toBe(409);

    const kycDenied = await request(app.getHttpServer())
      .get(`/api/v1/admin/partners/applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(kycDenied.status).toBe(403);
  });
});
