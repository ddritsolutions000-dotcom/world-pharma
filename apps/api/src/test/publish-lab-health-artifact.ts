import { INestApplication } from '@nestjs/common';
import {
  ClinicalRelationshipKind,
  ClinicalRelationshipStatus,
  HealthArtifactType,
  LogisticsJobType,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  PolicyPackStatus,
} from '@prisma/client';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { OrganizationService } from '../partner/organization.service';
import { PolicyCache } from '../policy/cache';
import { emptyPolicyDocument } from '../policy/empty-pack';
import { activateLabPartner, enableLabPartnerPack } from './lab-partner';
import { nextPolicyPackVersion } from './next-policy-pack-version';
import { bootstrapSuperAdminByEmail } from './sign-in';

export type LabHealthFixture = {
  country: { id: string; isoAlpha2: string };
  customerA: { token: string; personId: string };
  customerB: { token: string; personId: string };
  artifactId: string;
  bookingId: string;
  auth: (token: string) => { Authorization: string };
};

export async function publishLabHealthArtifactFixture(
  app: INestApplication,
  prisma: PrismaService,
  orgs: OrganizationService,
  suffix: string,
  signIn: (
    email: string,
    audience?: 'admin' | 'customer' | 'doctor',
  ) => Promise<{ token: string; personId: string }>,
): Promise<LabHealthFixture> {
  const admin = await bootstrapSuperAdminByEmail(app, prisma, `r9c-admin-${suffix}@example.com`);
  const labUser = await signIn(`r9c-lab-${suffix}@example.com`);
  const labStaff = await signIn(`r9c-staff-${suffix}@example.com`);
  const pathologist = await signIn(`r9c-path-${suffix}@example.com`);
  const customerA = await signIn(`r9c-ca-${suffix}@example.com`);
  const customerB = await signIn(`r9c-cb-${suffix}@example.com`);
  const rider = await signIn(`r9c-rider-${suffix}@example.com`);

  const enabledDoc = emptyPolicyDocument();
  enableLabPartnerPack(enabledDoc, { home: true, center: true });
  enabledDoc.healthcare.health_timeline_enabled = true;
  enabledDoc.healthcare.consultation_capability = true;
  enabledDoc.healthcare.appointments_enabled = true;
  enabledDoc.partner_types.DOCTOR.enabled = true;
  enabledDoc.healthcare.doctor_onboarding_enabled = true;
  enabledDoc.payments.enabled = true;
  enabledDoc.payments.methods = ['CARD'];
  enabledDoc.payments.gateway_refs = ['MOCK_PRIMARY'];
  enabledDoc.payments.currencies = ['XXX'];

  let country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
  if (!country) {
    country = await prisma.country.create({
      data: {
        id: uuidv7(),
        isoAlpha2: 'XX',
        isoAlpha3: 'XXX',
        nameI18n: { en: 'R9C test' },
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
      version: await nextPolicyPackVersion(prisma, country.id),
      status: PolicyPackStatus.PUBLISHED,
      document: enabledDoc as never,
      checksum: `r9c-${suffix}`,
      publishedAt: new Date(),
    },
  });
  const pack = await prisma.policyPack.findFirst({
    where: { countryId: country.id, status: PolicyPackStatus.PUBLISHED },
    orderBy: { publishedAt: 'desc' },
  });
  if (pack) {
    await prisma.country.update({ where: { id: country.id }, data: { publishedPolicyPackId: pack.id } });
  }
  await app.get(PolicyCache).invalidate('XX');

  const labA = await orgs.create({
    countryCode: 'XX',
    kind: OrganizationKind.LAB,
    legalName: `R9C Lab ${suffix}`,
    displayName: `R9C Lab ${suffix}`,
    actorId: admin.personId,
  });
  await prisma.organization.update({ where: { id: labA.id }, data: { status: OrganizationStatus.ACTIVE } });

  const attachOrgStaff = async (personId: string, organizationId: string) => {
    const role = await prisma.role.findUnique({ where: { code: 'org_staff' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId, roleId: role!.id, scope: 'organization', organizationId, status: 'ACTIVE' },
    });
  };
  const attachPathologist = async (personId: string, organizationId: string) => {
    const countryRow = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId,
        partnerTypeCode: 'PATHOLOGIST',
        countryId: countryRow.id,
        status: 'ACTIVE',
      },
    });
    await attachOrgStaff(personId, organizationId);
  };
  const attachRider = async (personId: string) => {
    const countryRow = await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } });
    await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId,
        partnerTypeCode: 'DELIVERY_PARTNER',
        countryId: countryRow.id,
        status: 'ACTIVE',
      },
    });
  };

  const roleAdmin = await prisma.role.findUnique({ where: { code: 'org_admin' } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId: labUser.personId,
      roleId: roleAdmin!.id,
      scope: 'organization',
      organizationId: labA.id,
      status: 'ACTIVE',
    },
  });
  await attachOrgStaff(labStaff.personId, labA.id);
  await attachPathologist(pathologist.personId, labA.id);
  await attachRider(rider.personId);
  await activateLabPartner(app, { labToken: labUser.token, adminToken: admin.token, labOrgId: labA.id });

  const item = await request(app.getHttpServer())
    .post('/api/v1/lab/catalog/items')
    .set('Authorization', `Bearer ${labUser.token}`)
    .send({
      slug: `r9c-lab-${suffix}`,
      kind: 'LAB_TEST',
      lab_org_id: labA.id,
      title: 'CBC Panel',
      countries: [{ country_code: 'XX' }],
    });
  await request(app.getHttpServer())
    .post(`/api/v1/admin/catalog/items/${item.body.id}/publish`)
    .set('Authorization', `Bearer ${admin.token}`);
  const variant = await request(app.getHttpServer())
    .post(`/api/v1/lab/catalog/items/${item.body.id}/variants?lab_org_id=${labA.id}`)
    .set('Authorization', `Bearer ${labUser.token}`)
    .send({ sku_code: `R9C-${suffix}`, pack_size: '1 draw' });
  const offer = await request(app.getHttpServer())
    .post('/api/v1/lab/catalog/offers')
    .set('Authorization', `Bearer ${labUser.token}`)
    .send({
      variant_id: variant.body.id,
      lab_org_id: labA.id,
      country_code: 'XX',
      ownership: 'LAB_OWNED',
      currency: 'XXX',
      cost_minor: '100',
      sell_minor: '2500',
    });
  await request(app.getHttpServer())
    .post(`/api/v1/lab/catalog/offers/${offer.body.id}/publish`)
    .set('Authorization', `Bearer ${labUser.token}`);

  const address = await prisma.customerAddress.create({
    data: {
      id: uuidv7(),
      customerPersonId: customerA.personId,
      countryId: country.id,
      recipientName: 'Customer A',
      city: 'Testville',
      line1: '1 Sample St',
      isDefault: true,
    },
  });

  const booking = await request(app.getHttpServer())
    .post('/api/v1/me/lab/bookings')
    .set('Authorization', `Bearer ${customerA.token}`)
    .set('Idempotency-Key', `r9c-book-${suffix}`)
    .send({
      offer_id: offer.body.id,
      collection_mode: 'HOME',
      lab_org_id: labA.id,
      customer_address_id: address.id,
      country: 'XX',
      slot_starts_at: new Date(Date.now() + 86400000).toISOString(),
    });
  await request(app.getHttpServer())
    .post(`/api/v1/me/lab/bookings/${booking.body.id}/pay`)
    .set('Authorization', `Bearer ${customerA.token}`)
    .set('Idempotency-Key', `r9c-pay-${suffix}`)
    .send({ scenario: 'success' });

  const sample = await prisma.labSample.findUniqueOrThrow({ where: { labBookingId: booking.body.id } });
  const collectionJob = await prisma.logisticsJob.findFirstOrThrow({
    where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
  });
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/accept`).set(auth(labUser.token));
  await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/arrive`).set(auth(labUser.token)).send({});
  await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/verify`).set(auth(labUser.token)).send({});
  await request(app.getHttpServer()).post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/collect`).set(auth(labUser.token)).send({});
  await request(app.getHttpServer())
    .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/seal`)
    .set(auth(labUser.token))
    .send({ container_barcode: `R9C-${suffix}` });
  await request(app.getHttpServer())
    .post(`/api/v1/phlebotomist/jobs/${collectionJob.id}/handover`)
    .set(auth(labUser.token))
    .send({});

  const transportJob = await prisma.logisticsJob.findFirstOrThrow({
    where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
  });
  await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/accept`).set(auth(rider.token));
  await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/pickup`).set(auth(rider.token));
  await request(app.getHttpServer()).post(`/api/v1/delivery/jobs/${transportJob.id}/deliver`).set(auth(rider.token));

  const accession = await request(app.getHttpServer())
    .post('/api/v1/lab/accessions')
    .set(auth(labUser.token))
    .send({ lab_org_id: labA.id, lab_sample_id: sample.id, idempotency_key: `r9c-acc-${suffix}` });
  if (accession.status >= 300) {
    throw new Error(`accession failed: ${accession.status}`);
  }

  const processingId = (await prisma.labProcessing.findUniqueOrThrow({ where: { labSampleId: sample.id } })).id;
  await request(app.getHttpServer())
    .post(`/api/v1/lab/processing/${processingId}/start`)
    .set(auth(labUser.token))
    .send({ lab_org_id: labA.id });
  await request(app.getHttpServer())
    .post(`/api/v1/lab/processing/${processingId}/complete`)
    .set(auth(labUser.token))
    .send({ lab_org_id: labA.id });

  const report = await prisma.labReport.findUniqueOrThrow({ where: { labSampleId: sample.id } });
  await request(app.getHttpServer())
    .post(`/api/v1/lab/reports/${report.id}/results`)
    .set(auth(labStaff.token))
    .send({
      lab_org_id: labA.id,
      summary: 'Sandbox summary',
      lines: [{ analyte_code: 'HGB', analyte_name: 'Hemoglobin', value: '14', unit: 'g/dL' }],
    });
  await request(app.getHttpServer())
    .post(`/api/v1/lab/reports/${report.id}/submit-verify`)
    .set(auth(labStaff.token))
    .send({ lab_org_id: labA.id });
  await request(app.getHttpServer())
    .post(`/api/v1/pathologist/reports/${report.id}/assign`)
    .set(auth(pathologist.token))
    .send({ lab_org_id: labA.id });
  await request(app.getHttpServer())
    .post(`/api/v1/pathologist/reports/${report.id}/verify`)
    .set(auth(pathologist.token))
    .send({ lab_org_id: labA.id });
  const publish = await request(app.getHttpServer())
    .post(`/api/v1/pathologist/reports/${report.id}/publish`)
    .set(auth(pathologist.token))
    .send({ lab_org_id: labA.id });
  if (publish.status >= 300) {
    throw new Error(`publish failed: ${publish.status}`);
  }

  const artifact = await prisma.healthArtifact.findFirstOrThrow({
    where: { labBookingId: booking.body.id, artifactType: HealthArtifactType.LAB_REPORT },
  });

  return {
    country,
    customerA,
    customerB,
    artifactId: artifact.id,
    bookingId: booking.body.id as string,
    auth,
  };
}

export async function seedDoctorPartner(
  prisma: PrismaService,
  countryId: string,
  doctor: { personId: string },
  suffix: string,
) {
  let partner = await prisma.partner.findFirst({
    where: { personId: doctor.personId, partnerTypeCode: 'DOCTOR', countryId },
  });
  if (!partner) {
    partner = await prisma.partner.create({
      data: {
        id: uuidv7(),
        personId: doctor.personId,
        partnerTypeCode: 'DOCTOR',
        countryId,
        status: PartnerStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });
  }
  const profile = await prisma.doctorProfile.upsert({
    where: { partnerId: partner.id },
    create: {
      id: uuidv7(),
      partnerId: partner.id,
      personId: doctor.personId,
      countryId,
      displayName: `Dr R9C ${suffix}`,
      professionalName: 'Dr R9C',
    },
    update: {},
  });
  void profile;
  return partner;
}

export async function ensureClinicalRelationship(
  prisma: PrismaService,
  countryId: string,
  patientPersonId: string,
  doctorPartnerId: string,
) {
  const existing = await prisma.clinicalRelationship.findFirst({
    where: { patientPersonId, doctorPartnerId, countryId },
  });
  if (existing) {
    return existing;
  }
  return prisma.clinicalRelationship.create({
    data: {
      id: uuidv7(),
      countryId,
      patientPersonId,
      doctorPartnerId,
      kind: ClinicalRelationshipKind.CARE,
      status: ClinicalRelationshipStatus.ACTIVE,
    },
  });
}
