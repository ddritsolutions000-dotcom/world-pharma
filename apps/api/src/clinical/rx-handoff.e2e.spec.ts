import { INestApplication } from '@nestjs/common';
import {
  ClinicalRelationshipKind,
  ClinicalRelationshipStatus,
  ConsentGrantStatus,
  DispensingCaseStatus,
  EncounterStatus,
  InventoryLotStatus,
  LocationKind,
  OrganizationKind,
  PartnerStatus,
  PolicyPackStatus,
  PrescriptionStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { PolicyCache } from '../policy/cache';
import { applyTestIsolation } from '../test/isolate-runtime';
import { enableMarketplaceVendorPack } from '../test/marketplace-seller';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' | 'doctor' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  expect(requested.status).toBeLessThan(400);
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  expect(verified.status).toBe(200);
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R5-D Order-from-Rx handoff (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  const countryCode = 'DR';

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

    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    doc.healthcare.rx_prescribe_enabled = true;
    doc.healthcare.rx_amend_enabled = true;
    doc.healthcare.rx_dispense_enabled = true;
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];
    doc.shipping.domestic = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'DRR',
          nameI18n: { en: 'Rx handoff test' },
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
          checksum: 'r5d-handoff',
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
    countryId = country.id;
    await app.get(PolicyCache).invalidate(countryCode);
  });

  afterAll(async () => {
    await app.close();
  });

  it('DISPENSED → handoff → quote → CAPTURED → Order without second inventory PICK', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 6)}`;
    const customer = await signIn(app, `r5d-${suffix}-cus@example.com`, 'customer');
    const doctor = await signIn(app, `r5d-${suffix}-doc@example.com`, 'doctor');
    const pharmacist = await signIn(app, `r5d-${suffix}-pharm@example.com`, 'customer');
    const other = await signIn(app, `r5d-${suffix}-other@example.com`, 'customer');

    let partner = await prisma.partner.findFirst({
      where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR', countryId },
    });
    if (!partner) {
      partner = await prisma.partner.create({
        data: {
          id: uuidv7(),
          personId: doctor.personId,
          countryId,
          partnerTypeCode: 'DOCTOR',
          status: PartnerStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });
    }
    let profile = await prisma.doctorProfile.findUnique({ where: { partnerId: partner.id } });
    if (!profile) {
      profile = await prisma.doctorProfile.create({
        data: {
          id: uuidv7(),
          partnerId: partner.id,
          personId: doctor.personId,
          countryId,
          displayName: 'R5D Doctor',
          professionalName: 'Dr R5D',
        },
      });
    }
    await prisma.clinicalRelationship.create({
      data: {
        id: uuidv7(),
        countryId,
        patientPersonId: customer.personId,
        doctorPartnerId: partner.id,
        kind: ClinicalRelationshipKind.CARE,
        status: ClinicalRelationshipStatus.ACTIVE,
      },
    });
    await prisma.consentGrant.create({
      data: {
        id: uuidv7(),
        countryId,
        subjectPersonId: customer.personId,
        recipientPartnerId: partner.id,
        purpose: 'consultation',
        scope: {},
        status: ConsentGrantStatus.ACTIVE,
        grantedAt: new Date(),
        grantedByPersonId: customer.personId,
      },
    });
    const startsAt = new Date();
    const appointment = await prisma.appointment.create({
      data: {
        id: uuidv7(),
        countryId,
        customerPersonId: customer.personId,
        doctorProfileId: profile.id,
        doctorPartnerId: partner.id,
        type: 'ONLINE',
        status: 'CHECKED_IN',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        timezone: 'UTC',
      },
    });
    const encounter = await prisma.encounter.create({
      data: {
        id: uuidv7(),
        appointmentId: appointment.id,
        countryId,
        customerPersonId: customer.personId,
        doctorProfileId: profile.id,
        doctorPartnerId: partner.id,
        status: EncounterStatus.STARTED,
        startedAt: new Date(),
      },
    });

    const pharmacy = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.PHARMACY_OWNED,
        legalName: 'R5D Pharmacy',
        displayName: 'R5D Pharmacy',
        status: 'ACTIVE',
      },
    });
    const orgRole = await prisma.role.findUnique({ where: { code: 'org_owner' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: pharmacist.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: pharmacy.id,
        status: 'ACTIVE',
      },
    });

    const adminSeed = await signIn(app, `r5d-${suffix}-admin@example.com`, 'customer');
    const superRole = await prisma.role.findUnique({ where: { code: 'super_admin' } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: adminSeed.personId,
        roleId: superRole!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
    const admin = await signIn(app, `r5d-${suffix}-admin@example.com`, 'admin');

    const locRes = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        organization_id: pharmacy.id,
        kind: LocationKind.STORE,
        name: 'R5D Store',
        timezone: 'UTC',
      });
    expect(locRes.status).toBe(201);
    const locationId = locRes.body.id as string;

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `r5d-brand-${suffix}`, name: 'R5DBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `r5d-para-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Para tabs',
        countries: [{ country_code: countryCode }],
      });
    expect(item.status).toBe(201);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `R5D-SKU-${suffix}`, pack_size: '20' });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);

    const offer = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/offers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        variant_id: variant.body.id,
        seller_org_id: pharmacy.id,
        country_code: countryCode,
        ownership: 'PLATFORM_OWNED',
        currency: 'XXX',
        cost_minor: '50',
        sell_minor: '150',
      });
    expect(offer.status).toBeLessThan(400);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${admin.token}`);
    // Admin may not expose publish; fall back to vendor path with pharmacy membership.
    if (published.status >= 400) {
      const pub2 = await request(app.getHttpServer())
        .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
        .set('Authorization', `Bearer ${pharmacist.token}`);
      expect(pub2.status).toBeLessThan(400);
    }

    const grn = await request(app.getHttpServer())
      .post('/api/v1/store/grn')
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .send({
        idempotency_key: `grn-${suffix}`,
        lines: [
          {
            variant_id: variant.body.id,
            lot_code: `LOT-${suffix}`,
            expires_on: '2099-01-01',
            qty: 100,
          },
        ],
      });
    expect(grn.status).toBeLessThan(400);
    const receiptId = grn.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/store/grn/${receiptId}/receive`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/store/grn/${receiptId}/post`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .send({});

    const lots = await request(app.getHttpServer())
      .get('/api/v1/store/lots')
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`);
    const lotId = (lots.body.data ?? lots.body.lots ?? []).find(
      (l: { variant_id?: string }) => l.variant_id === variant.body.id,
    )?.id as string;
    expect(lotId).toBeTruthy();

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${doctor.token}`)
      .set('Idempotency-Key', `r5d-create-${suffix}`)
      .send({
        encounter_id: encounter.id,
        lines: [
          {
            clinical_concept_code: 'concept.paracetamol',
            clinical_concept_label: 'Paracetamol clinical concept',
            dosage_instructions: '1 tablet every 6 hours',
            quantity_authorized: '20',
            quantity_unit: 'tablet',
            substitution_allowed: false,
            suggested_catalog_item_id: item.body.id,
          },
        ],
      });
    expect(createRes.status).toBe(200);
    const rxId = createRes.body.id as string;

    const issueRes = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${doctor.token}`)
      .set('Idempotency-Key', `r5d-issue-${suffix}`)
      .send({});
    expect(issueRes.status).toBe(200);
    const versionId = issueRes.body.current_version_id as string;
    await prisma.prescriptionVersion.update({
      where: { id: versionId },
      data: {
        validFrom: new Date(Date.now() - 60_000),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60_000),
      },
    });

    const queued = await prisma.dispensingCase.findFirst({
      where: { prescriptionVersionId: versionId, status: DispensingCaseStatus.QUEUED },
    });
    expect(queued).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/claim`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `claim-${suffix}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/validate`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `validate-${suffix}`)
      .send({});
    const authorize = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/authorize`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `authorize-${suffix}`)
      .send({});
    expect(authorize.status).toBe(200);
    const lineId = authorize.body.lines[0].id as string;

    await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/map-lines`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `map-${suffix}`)
      .send({
        lines: [
          {
            prescription_line_id: lineId,
            catalog_item_id: item.body.id,
            catalog_variant_id: variant.body.id,
            inventory_lot_id: lotId,
            quantity_dispensed: '20',
            confirm_substitution: false,
          },
        ],
      });

    const balBeforeComplete = await prisma.inventoryBalance.findFirst({ where: { lotId } });
    const onHandBefore = Number(balBeforeComplete?.onHand ?? 0);

    const complete = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/complete`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `complete-${suffix}`)
      .send({});
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe(DispensingCaseStatus.DISPENSED);

    const balAfterDispense = await prisma.inventoryBalance.findFirst({ where: { lotId } });
    const onHandAfterDispense = Number(balAfterDispense?.onHand ?? 0);
    expect(onHandAfterDispense).toBe(onHandBefore - 20);

    const pickCountAfterDispense = await prisma.inventoryMovement.count({
      where: { lotId, type: 'PICK', reasonCode: 'rx_dispense' },
    });
    expect(pickCountAfterDispense).toBe(1);

    const notReady = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}/commerce-eligibility`)
      .set('Authorization', `Bearer ${other.token}`);
    expect([403, 404]).toContain(notReady.status);

    const elig = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}/commerce-eligibility`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(elig.status).toBe(200);
    expect(elig.body.eligible).toBe(true);
    expect(elig.body.dispensing_case_id).toBe(queued!.id);

    const handoff = await request(app.getHttpServer())
      .post('/api/v1/customer/rx-handoff')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `handoff-${suffix}`)
      .send({ dispensing_case_id: queued!.id });
    expect(handoff.status).toBe(200);
    expect(handoff.body.skip_inventory_hold).toBe(true);
    expect(handoff.body.already_ordered).toBe(false);

    const handoff2 = await request(app.getHttpServer())
      .post('/api/v1/customer/rx-handoff')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `handoff-retry-${suffix}`)
      .send({ dispensing_case_id: queued!.id });
    expect(handoff2.status).toBe(200);
    expect(handoff2.body.handoff_key).toBe(handoff.body.handoff_key);

    const addr = await request(app.getHttpServer())
      .post('/api/v1/me/addresses')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `addr-${suffix}`)
      .send({
        country_code: countryCode,
        recipient_name: 'Patient',
        city: 'Testville',
        line1: '1 Rx Lane',
        phone: '+10000000000',
      });
    expect(addr.status).toBeLessThan(400);

    const session = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions?country=${countryCode}`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `co-${suffix}`)
      .send({});
    expect(session.status).toBeLessThan(300);
    expect(session.body.skip_inventory_hold).toBe(true);

    const ful = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/fulfillment`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ address_id: addr.body.id });
    expect(ful.status).toBeLessThan(400);

    const requote = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/quote`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `quote-${suffix}`)
      .send({});
    expect(requote.status).toBeLessThan(400);

    const paid = await request(app.getHttpServer())
      .post(`/api/v1/me/checkout/sessions/${session.body.id}/pay`)
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `pay-${suffix}`)
      .send({ method: 'CARD', scenario: 'success' });
    expect(paid.status).toBe(201);
    expect(paid.body.status).toBe('CAPTURED');

    const order = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expect(order.status).toBeLessThan(300);
    const orderId = order.body.id as string;
    expect(order.body.rx_inventory_consumed_at_dispense).toBe(true);
    expect(order.body.dispensing_case_id).toBe(queued!.id);

    const orderDup = await request(app.getHttpServer())
      .post('/api/v1/me/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ord-dup-${suffix}`)
      .send({ payment_intent_id: paid.body.id });
    expect(orderDup.body.id).toBe(orderId);

    const dbOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(dbOrder?.dispenseEventId).toBeTruthy();
    expect(dbOrder?.rxInventoryConsumedAtDispense).toBe(true);

    const balAfterOrder = await prisma.inventoryBalance.findFirst({ where: { lotId } });
    expect(Number(balAfterOrder?.onHand ?? 0)).toBe(onHandAfterDispense);

    const orderAllocatePicks = await prisma.inventoryMovement.count({
      where: { lotId, reasonCode: 'order_allocate' },
    });
    expect(orderAllocatePicks).toBe(0);

    const pickCountFinal = await prisma.inventoryMovement.count({
      where: { lotId, type: 'PICK', reasonCode: 'rx_dispense' },
    });
    expect(pickCountFinal).toBe(1);

    const ordersForEvent = await prisma.order.count({
      where: { dispenseEventId: dbOrder!.dispenseEventId! },
    });
    expect(ordersForEvent).toBe(1);
  });

  it('rejects handoff for non-DISPENSED / foreign patient', async () => {
    const suffix = `${Date.now().toString(36)}-neg`;
    const customer = await signIn(app, `r5d-neg-${suffix}@example.com`, 'customer');
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/customer/rx-handoff')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `neg-${suffix}`)
      .send({ dispensing_case_id: uuidv7() });
    expect([404, 403, 409]).toContain(blocked.status);
  });
});
