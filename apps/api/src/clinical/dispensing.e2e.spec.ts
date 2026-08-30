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

describe('R5-C pharmacy dispensing (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;
  let countryCode: string;

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

    countryCode = 'DQ';
    const doc = emptyPolicyDocument();
    doc.partner_types.DOCTOR.enabled = true;
    doc.healthcare.doctor_onboarding_enabled = true;
    doc.healthcare.consultation_capability = true;
    doc.healthcare.appointments_enabled = true;
    doc.healthcare.rx_prescribe_enabled = true;
    doc.healthcare.rx_amend_enabled = true;
    doc.healthcare.rx_dispense_enabled = true;
    doc.services.pharmacy = true;

    let country = await prisma.country.findUnique({ where: { isoAlpha2: countryCode } });
    if (!country) {
      country = await prisma.country.create({
        data: {
          id: uuidv7(),
          isoAlpha2: countryCode,
          isoAlpha3: 'DQQ',
          nameI18n: { en: 'Dispense test' },
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
          checksum: 'r5c-dispense',
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

  it('enqueues on issue, claim/validate/authorize/map/complete; isolates; no commerce; no silent substitution', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 6)}`;
    const customer = await signIn(app, `r5c-${suffix}-cus@example.com`, 'customer');
    const doctor = await signIn(app, `r5c-${suffix}-doc@example.com`, 'doctor');
    const pharmacist = await signIn(app, `r5c-${suffix}-pharm@example.com`, 'customer');
    const otherStore = await signIn(app, `r5c-${suffix}-other@example.com`, 'customer');

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
    } else if (partner.status !== PartnerStatus.ACTIVE) {
      partner = await prisma.partner.update({
        where: { id: partner.id },
        data: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
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
          displayName: 'R5C Doctor',
          professionalName: 'Dr R5C',
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
        legalName: 'R5C Pharmacy',
        displayName: 'R5C Pharmacy',
        status: 'ACTIVE',
      },
    });
    const otherOrg = await prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId,
        kind: OrganizationKind.PHARMACY_OWNED,
        legalName: 'Other Pharmacy',
        displayName: 'Other Pharmacy',
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
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: otherStore.personId,
        roleId: orgRole!.id,
        scope: 'organization',
        organizationId: otherOrg.id,
        status: 'ACTIVE',
      },
    });

    const adminSeed = await signIn(app, `r5c-${suffix}-admin@example.com`, 'customer');
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
    const admin = await signIn(app, `r5c-${suffix}-admin@example.com`, 'admin');

    const locRes = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        organization_id: pharmacy.id,
        kind: LocationKind.STORE,
        name: 'R5C Store',
        timezone: 'UTC',
      });
    expect(locRes.status).toBe(201);
    const locationId = locRes.body.id as string;

    const otherLoc = await request(app.getHttpServer())
      .post('/api/v1/admin/inventory/locations')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        organization_id: otherOrg.id,
        kind: LocationKind.STORE,
        name: 'Other Store',
        timezone: 'UTC',
      });
    expect(otherLoc.status).toBe(201);

    const brand = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/brands')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ slug: `r5c-brand-${suffix}`, name: 'R5CBrand' });
    const item = await request(app.getHttpServer())
      .post('/api/v1/admin/catalog/items')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        slug: `r5c-para-${suffix}`,
        kind: 'OTC',
        brand_id: brand.body.id,
        title: 'Para tabs',
        countries: [{ country_code: countryCode }],
      });
    expect(item.status).toBe(201);
    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/catalog/items/${item.body.id}/variants`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ sku_code: `R5C-SKU-${suffix}`, pack_size: '20' });
    expect(variant.status).toBe(201);

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
    expect(lots.status).toBe(200);
    const lotId = (lots.body.data ?? lots.body.lots ?? []).find(
      (l: { variant_id?: string }) => l.variant_id === variant.body.id,
    )?.id as string;
    expect(lotId).toBeTruthy();

    const beforeOrders = await prisma.order.count();
    const beforePayments = await prisma.paymentIntent.count();
    const beforeShipments = await prisma.shipment.count();

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/doctor/prescriptions')
      .set('Authorization', `Bearer ${doctor.token}`)
      .set('Idempotency-Key', `r5c-create-${suffix}`)
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
      .set('Idempotency-Key', `r5c-issue-${suffix}`)
      .send({});
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.status).toBe(PrescriptionStatus.ISSUED);
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

    const queue = await request(app.getHttpServer())
      .get('/api/v1/store/dispensing-cases')
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`);
    expect(queue.status).toBe(200);
    expect(queue.body.cases.some((c: { id: string }) => c.id === queued!.id)).toBe(true);

    const iso = await request(app.getHttpServer())
      .get(`/api/v1/store/dispensing-cases/${queued!.id}`)
      .query({ organization_id: otherOrg.id, location_id: otherLoc.body.id })
      .set('Authorization', `Bearer ${otherStore.token}`);
    expect([404, 403]).toContain(iso.status);

    const claim = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/claim`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `claim-${suffix}`)
      .send({});
    expect(claim.status).toBe(200);
    expect(claim.body.status).toBe(DispensingCaseStatus.VALIDATING);

    const validate = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/validate`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `validate-${suffix}`)
      .send({});
    expect(validate.status).toBe(200);

    const authorize = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/authorize`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `authorize-${suffix}`)
      .send({});
    expect(authorize.status).toBe(200);
    expect(authorize.body.status).toBe(DispensingCaseStatus.AUTHORIZED_TO_DISPENSE);

    const lineId = authorize.body.lines[0].id as string;

    const badSub = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/map-lines`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `map-bad-${suffix}`)
      .send({
        lines: [
          {
            prescription_line_id: lineId,
            catalog_item_id: uuidv7(),
            catalog_variant_id: variant.body.id,
            inventory_lot_id: lotId,
            quantity_dispensed: '20',
            confirm_substitution: false,
          },
        ],
      });
    expect(badSub.status).toBeGreaterThanOrEqual(400);

    const partial = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/map-lines`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `map-partial-${suffix}`)
      .send({
        lines: [
          {
            prescription_line_id: lineId,
            catalog_item_id: item.body.id,
            catalog_variant_id: variant.body.id,
            inventory_lot_id: lotId,
            quantity_dispensed: '10',
          },
        ],
      });
    expect(partial.status).toBe(409);
    expect(partial.body.code).toBe('PARTIAL_DISPENSE_NOT_ENABLED');

    const map = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/map-lines`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `map-ok-${suffix}`)
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
    expect(map.status).toBe(200);
    expect(map.body.status).toBe(DispensingCaseStatus.DISPENSING);

    const complete = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/complete`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `complete-${suffix}`)
      .send({});
    expect(complete.status).toBe(200);
    expect(complete.body.status).toBe(DispensingCaseStatus.DISPENSED);
    expect(complete.body.commerce).toEqual(
      expect.objectContaining({ order: false, payment: false, shipment: false }),
    );

    const dup = await request(app.getHttpServer())
      .post(`/api/v1/store/dispensing-cases/${queued!.id}/complete`)
      .query({ organization_id: pharmacy.id, location_id: locationId })
      .set('Authorization', `Bearer ${pharmacist.token}`)
      .set('Idempotency-Key', `complete-${suffix}`)
      .send({});
    expect(dup.status).toBe(200);
    expect(dup.body.status).toBe(DispensingCaseStatus.DISPENSED);

    const rxAfter = await prisma.prescription.findUniqueOrThrow({ where: { id: rxId } });
    expect(rxAfter.status).toBe(PrescriptionStatus.FULLY_DISPENSED);

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/customer/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${customer.token}`);
    expect(customerView.status).toBe(200);
    expect(customerView.body.dispensing_status).toBe(DispensingCaseStatus.DISPENSED);

    const doctorView = await request(app.getHttpServer())
      .get(`/api/v1/doctor/prescriptions/${rxId}`)
      .set('Authorization', `Bearer ${doctor.token}`);
    expect(doctorView.status).toBe(200);
    expect(doctorView.body.dispensing_status).toBe(DispensingCaseStatus.DISPENSED);

    const adminCases = await request(app.getHttpServer())
      .get('/api/v1/admin/dispensing-cases')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminCases.status).toBe(200);
    expect(JSON.stringify(adminCases.body)).not.toMatch(/dosage_instructions/);

    expect(await prisma.order.count()).toBe(beforeOrders);
    expect(await prisma.paymentIntent.count()).toBe(beforePayments);
    expect(await prisma.shipment.count()).toBe(beforeShipments);
  });
});
