import { INestApplication } from '@nestjs/common';
import {
  ClinicalRelationshipKind,
  ClinicalRelationshipStatus,
  ConsentGrantStatus,
  DispensingCaseStatus,
  EncounterStatus,
  LocationKind,
  OrganizationKind,
  PartnerStatus,
  PolicyPackStatus,
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

describe('R5-E refill request/re-auth (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  const countryCode = 'RF';

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
    doc.healthcare.rx_refill_enabled = true;
    doc.healthcare.rx_refill_require_doctor_reauth = true;
    doc.healthcare.rx_subscription_enabled = false;
    doc.healthcare.rx_subscription_auto_execute = false;
    doc.services.pharmacy = true;
    enableMarketplaceVendorPack(doc);
    doc.payments.enabled = true;
    doc.payments.methods = ['CARD', 'COD'];
    doc.payments.gateway_refs = ['MOCK_PRIMARY'];
    doc.payments.currencies = ['XXX'];

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'RFF',
          nameI18n: { en: 'Refill test' },
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
          checksum: 'r5e-refill',
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

  it('fail-closed when pack refill disabled; request→approve→new dispense consume-once; subscription auto OFF', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r5e-${suffix}@example.com`, 'customer');
    const doctorUser = await signIn(app, `r5e-doc-${suffix}@example.com`, 'doctor');
    const pharmacist = await signIn(app, `r5e-pharm-${suffix}@example.com`, 'customer');

    let partner = await prisma.partner.findFirst({
      where: { personId: doctorUser.personId, partnerTypeCode: 'DOCTOR', countryId },
    });
    if (!partner) {
      partner = await prisma.partner.create({
        data: {
          id: uuidv7(),
          personId: doctorUser.personId,
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
          personId: doctorUser.personId,
          countryId,
          displayName: 'R5E Doc',
          professionalName: 'Dr R5E',
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
        legalName: 'R5E Pharmacy',
        displayName: 'R5E Pharmacy',
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
    const adminSeed = await signIn(app, `r5e-admin-${suffix}@example.com`, 'customer');
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
    const admin = await signIn(app, `r5e-admin-${suffix}@example.com`, 'admin');

    const locRes = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        organization_id: pharmacy.id,
        kind: LocationKind.STORE,
        name: 'R5E Store',
        timezone: 'UTC',
      });
    const locationId = locRes.body.id as string;

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `r5e-brand-${suffix}`, name: 'R5EBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `r5e-para-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Para tabs',
        countries: [{ country_code: countryCode }],
      });
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `R5E-SKU-${suffix}`, pack_size: '20' });
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
    const pub = await request(app.getHttpServer())
      .post(`/api/v1/vendor/catalog/offers/${offer.body.id}/publish`)
      .set('Authorization', `Bearer ${pharmacist.token}`);
    expect(pub.status).toBeLessThan(400);

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

    const lot = await prisma.inventoryLot.findFirst({
      where: { locationId, variantId: variant.body.id },
    });
    expect(lot).toBeTruthy();
    const lotId = lot!.id;

    const draft = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${doctorUser.token}`)
      .set('Idempotency-Key', `draft-${suffix}`)
      .send({
        encounter_id: encounter.id,
        lines: [
          {
            clinical_concept_code: 'PARA',
            clinical_concept_label: 'Paracetamol',
            dosage_instructions: '1 tab',
            quantity_authorized: '20',
            quantity_unit: 'tab',
            substitution_allowed: false,
          },
        ],
      });
    expect(draft.status).toBeLessThan(400);
    const rxId = draft.body.id as string;
    const issued = await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rxId}/issue`)
      .set('Authorization', `Bearer ${doctorUser.token}`)
      .set('Idempotency-Key', `issue-${suffix}`)
      .send({});
    expect(issued.status).toBeLessThan(400);
    const versionId = issued.body.current_version_id as string;
    await prisma.prescriptionVersion.update({
      where: { id: versionId },
      data: {
        validFrom: new Date(Date.now() - 60_000),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60_000),
      },
    });

    let queued = await prisma.dispensingCase.findFirst({
      where: { prescriptionId: rxId, status: DispensingCaseStatus.QUEUED },
    });
    expect(queued).toBeTruthy();

    const claim = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/claim`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `claim-${suffix}`)
      .send({});
    expect(claim.status).toBe(200);
    const validate = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/validate`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `val-${suffix}`)
      .send({});
    expect(validate.status).toBe(200);
    const authorize = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/authorize`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `auth-${suffix}`)
      .send({});
    expect(authorize.status).toBe(200);
    const lineId = authorize.body.lines[0].id as string;
    const map1 = await request(app.getHttpServer())
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
          },
        ],
      });
    expect(map1.status).toBe(200);
    const complete1 = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/complete`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `complete-${suffix}`)
      .send({});
    expect(complete1.status).toBeLessThan(400);

    const pick1 = await prisma.inventoryMovement.count({
      where: { lotId, type: 'PICK', reasonCode: 'rx_dispense' },
    });
    expect(pick1).toBe(1);
    const balAfterFirst = await prisma.inventoryBalance.findFirst({ where: { lotId } });
    const onHandAfterFirst = Number(balAfterFirst?.onHand ?? 0);

    // Fail-closed: temporarily disable refill in pack
    const disabledDoc = emptyPolicyDocument();
    Object.assign(disabledDoc.healthcare, {
      doctor_onboarding_enabled: true,
      consultation_capability: true,
      appointments_enabled: true,
      rx_prescribe_enabled: true,
      rx_dispense_enabled: true,
      rx_refill_enabled: false,
      rx_refill_require_doctor_reauth: true,
      rx_subscription_enabled: false,
      rx_subscription_auto_execute: false,
    });
    disabledDoc.partner_types.DOCTOR.enabled = true;
    disabledDoc.services.pharmacy = true;
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: disabledDoc as never },
    });
    await app.get(PolicyCache).invalidate(countryCode);

    const denied = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}/refill-eligibility`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(denied.status).toBe(200);
    expect(denied.body.eligible).toBe(false);
    expect(denied.body.reason).toBe('rx_refill_disabled');
    expect(denied.body.auto_refill).toBe(false);

    const blockedReq = await request(app.getHttpServer())
      .post('/api/v1/customer/refill-requests')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `refill-blocked-${suffix}`)
      .send({ prescription_id: rxId });
    expect(blockedReq.status).toBe(409);

    // Re-enable refill
    const enabledDoc = emptyPolicyDocument();
    Object.assign(enabledDoc.healthcare, {
      doctor_onboarding_enabled: true,
      consultation_capability: true,
      appointments_enabled: true,
      rx_prescribe_enabled: true,
      rx_dispense_enabled: true,
      rx_refill_enabled: true,
      rx_refill_require_doctor_reauth: true,
      rx_subscription_enabled: false,
      rx_subscription_auto_execute: false,
    });
    enabledDoc.partner_types.DOCTOR.enabled = true;
    enabledDoc.services.pharmacy = true;
    enabledDoc.payments.enabled = true;
    enabledDoc.payments.methods = ['CARD'];
    enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
    enabledDoc.payments.currencies = ['XXX'];
    await prisma.policyPack.updateMany({
      where: { countryId, status: PolicyPackStatus.PUBLISHED },
      data: { document: enabledDoc as never },
    });
    await app.get(PolicyCache).invalidate(countryCode);

    const elig = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}/refill-eligibility`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(elig.status).toBe(200);
    expect(elig.body.eligible).toBe(true);

    const req1 = await request(app.getHttpServer())
      .post('/api/v1/customer/refill-requests')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `refill-${suffix}`)
      .send({ prescription_id: rxId });
    expect(req1.status).toBeLessThan(300);
    expect(req1.body.status).toBe('PENDING_REAUTH');

    const reqDup = await request(app.getHttpServer())
      .post('/api/v1/customer/refill-requests')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `refill-${suffix}`)
      .send({ prescription_id: rxId });
    expect(reqDup.body.id).toBe(req1.body.id);

    const foreign = await signIn(app, `r5e-other-${suffix}@example.com`, 'customer');
    const steal = await request(app.getHttpServer())
      .post('/api/v1/customer/refill-requests')
      .set('Authorization', `Bearer ${foreign.token}`)
      .set('Idempotency-Key', `steal-${suffix}`)
      .send({ prescription_id: rxId });
    expect([403, 404, 409]).toContain(steal.status);

    const pending = await request(app.getHttpServer())
      .get('/api/v1/doctor/refill-requests')
      .set('Authorization', `Bearer ${doctorUser.token}`);
    expect(pending.status).toBe(200);

    const approved = await request(app.getHttpServer())
      .post(`/api/v1/doctor/refill-requests/${req1.body.id}/approve`)
      .set('Authorization', `Bearer ${doctorUser.token}`)
      .set('Idempotency-Key', `approve-${suffix}`)
      .send({});
    expect(approved.status).toBeLessThan(300);
    expect(approved.body.status).toBe('QUEUED_FOR_DISPENSE');
    expect(approved.body.dispensing_case_id).toBeTruthy();

    const approveDup = await request(app.getHttpServer())
      .post(`/api/v1/doctor/refill-requests/${req1.body.id}/approve`)
      .set('Authorization', `Bearer ${doctorUser.token}`)
      .set('Idempotency-Key', `approve-dup-${suffix}`)
      .send({});
    expect(approveDup.body.dispensing_case_id).toBe(approved.body.dispensing_case_id);

    const case2Id = approved.body.dispensing_case_id as string;
    expect(case2Id).not.toBe(queued!.id);

    await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${case2Id}/claim`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `claim2-${suffix}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${case2Id}/validate`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `val2-${suffix}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${case2Id}/authorize`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `auth2-${suffix}`)
      .send({});
    const map2 = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${case2Id}/map-lines`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `map2-${suffix}`)
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
    expect(map2.status).toBeLessThan(400);
    const complete2 = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${case2Id}/complete`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `complete2-${suffix}`)
      .send({});
    expect(complete2.status).toBeLessThan(400);

    const pick2 = await prisma.inventoryMovement.count({
      where: { lotId, type: 'PICK', reasonCode: 'rx_dispense' },
    });
    expect(pick2).toBe(2);
    const balAfterSecond = await prisma.inventoryBalance.findFirst({ where: { lotId } });
    expect(Number(balAfterSecond?.onHand ?? 0)).toBe(onHandAfterFirst - 20);

    const sealedRx = await prisma.prescription.findUnique({ where: { id: rxId } });
    const sealedVersion = await prisma.prescriptionVersion.findUnique({
      where: { id: sealedRx!.currentVersionId! },
    });
    expect(sealedVersion?.sealedAt).toBeTruthy();

    const sub = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}/subscription`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(sub.status).toBe(200);
    expect(sub.body.auto_execute_enabled).toBe(false);
    expect(sub.body.pack_auto_execute_enabled).toBe(false);

    const adminList = await request(app.getHttpServer())
      .get('/api/v1/admin/refill-requests')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.requests.some((r: { id: string }) => r.id === req1.body.id)).toBe(true);

    // Cancelled Rx cannot refill
    const draft2 = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${doctorUser.token}`)
      .set('Idempotency-Key', `draft2-${suffix}`)
      .send({
        encounter_id: encounter.id,
        lines: [
          {
            clinical_concept_code: 'IBU',
            clinical_concept_label: 'Ibuprofen',
            dosage_instructions: '1 tab',
            quantity_authorized: '10',
            quantity_unit: 'tab',
            substitution_allowed: false,
          },
        ],
      });
    const rx2 = draft2.body.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rx2}/issue`)
      .set('Authorization', `Bearer ${doctorUser.token}`)
      .set('Idempotency-Key', `issue2-${suffix}`)
      .send({});
    await request(app.getHttpServer())
      .post(`/api/v1/doctor/prescriptions/${rx2}/cancel`)
      .set('Authorization', `Bearer ${doctorUser.token}`)
      .set('Idempotency-Key', `cancel-${suffix}`)
      .send({ reason_code: 'test' });
    const cancelElig = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rx2}/refill-eligibility`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(cancelElig.body.eligible).toBe(false);
    expect(cancelElig.body.reason).toBe('prescription_cancelled');
  });
});
