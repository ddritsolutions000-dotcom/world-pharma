/**
 * Sprint 57 — close pathologist membership, imaging report, vendor fulfill blockers.
 * Reuses S56 idempotency keys. Grants legitimate org_staff membership (no auth bypass).
 *
 *   npx tsx scripts/s57-ensure-sandbox-fixtures.ts
 */
import {
  LogisticsJobType,
  OrderStatus,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const API = process.env.WP_API_BASE ?? 'http://127.0.0.1:4000/api/v1';

function uuidv7(): string {
  return randomUUID();
}

const CUSTOMER = 'sandbox-customer@dev.local';
const LAB = 'sandbox-lab@dev.local';
const PATHOLOGIST = 'sandbox-pathologist@dev.local';
const IMAGING = 'sandbox-imaging@dev.local';
const RADIOLOGIST = 'sandbox-radiologist@dev.local';
const RADIOLOGIST_REVIEWER = 'sandbox-radiologist-reviewer@dev.local';
const DELIVERY = 'sandbox-delivery@dev.local';
const PHLEBOTOMIST = 'sandbox-phlebotomist@dev.local';

const LAB_IDEM = 'dev-sandbox-lab-pathology-s56';
const IMG_IDEM = 'dev-sandbox-imaging-report-s56';
const VENDOR_ORDER_TAG = 'DEMO-SBX-VENDOR-FULFILL';

async function personId(email: string): Promise<string> {
  const row = await prisma.accountIdentifier.findFirst({
    where: { type: 'EMAIL', valueNormalized: email },
  });
  if (!row) throw new Error(`Missing identity ${email}`);
  return row.personId;
}

async function login(email: string, audience: string): Promise<string> {
  const s = await fetch(`${API}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, purpose: 'LOGIN' }),
  });
  const j = (await s.json()) as { challenge_id?: string; dev_code?: string };
  const v = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: j.challenge_id, code: j.dev_code, audience }),
  });
  const t = (await v.json()) as { access_token?: string; detail?: string };
  if (!t.access_token) throw new Error(`Login failed ${email}: ${t.detail ?? v.status}`);
  return t.access_token;
}

async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  idem?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

async function ensureMembership(personId: string, roleCode: string, organizationId: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const existing = await prisma.membership.findFirst({
    where: { personId, roleId: role.id, organizationId },
  });
  if (!existing) {
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role.id,
        scope: 'organization',
        organizationId,
        status: 'ACTIVE',
      },
    });
    console.log('membership created', roleCode, organizationId.slice(0, 8));
  } else if (existing.status !== 'ACTIVE' || existing.deletedAt) {
    await prisma.membership.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', deletedAt: null },
    });
    console.log('membership reactivated', roleCode, organizationId.slice(0, 8));
  } else {
    console.log('membership ok', roleCode, organizationId.slice(0, 8));
  }
}

async function ensurePartner(personId: string, partnerTypeCode: string, countryId: string) {
  await prisma.partner.upsert({
    where: {
      personId_partnerTypeCode_countryId: { personId, partnerTypeCode, countryId },
    },
    create: {
      id: uuidv7(),
      personId,
      partnerTypeCode,
      countryId,
      status: PartnerStatus.ACTIVE,
      activatedAt: new Date(),
    },
    update: { status: PartnerStatus.ACTIVE, activatedAt: new Date() },
  });
}

/** Legitimate sandbox org membership for clinical field staff across seeded markets. */
async function ensureFieldStaffMemberships() {
  const pathologistPersonId = await personId(PATHOLOGIST);
  const phlebotomistPersonId = await personId(PHLEBOTOMIST).catch(() => null);
  const radiologistPersonId = await personId(RADIOLOGIST);
  const reviewerPersonId = await personId(RADIOLOGIST_REVIEWER);

  const labs = await prisma.organization.findMany({
    where: {
      kind: OrganizationKind.LAB,
      legalName: 'Demo Diagnostics Lab',
      status: OrganizationStatus.ACTIVE,
    },
  });
  for (const lab of labs) {
    await ensureMembership(pathologistPersonId, 'org_staff', lab.id);
    if (phlebotomistPersonId) {
      await ensureMembership(phlebotomistPersonId, 'org_staff', lab.id);
      await ensurePartner(phlebotomistPersonId, 'PHLEBOTOMIST', lab.countryId);
    }
    await ensurePartner(pathologistPersonId, 'PATHOLOGIST', lab.countryId);
  }

  const centers = await prisma.organization.findMany({
    where: {
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: 'Demo Imaging Center',
      status: OrganizationStatus.ACTIVE,
    },
  });
  for (const center of centers) {
    await ensureMembership(radiologistPersonId, 'org_staff', center.id);
    await ensureMembership(reviewerPersonId, 'org_staff', center.id);
    await ensurePartner(radiologistPersonId, 'RADIOLOGIST', center.countryId);
    await ensurePartner(reviewerPersonId, 'RADIOLOGIST', center.countryId);
  }
}

async function ensureLabPublishReady() {
  const customerTok = await login(CUSTOMER, 'customer');
  const labTok = await login(LAB, 'customer');
  const deliveryTok = await login(DELIVERY, 'customer');
  const pathTok = await login(PATHOLOGIST, 'customer');

  const labOrg = await prisma.organization.findFirst({
    where: {
      kind: OrganizationKind.LAB,
      legalName: 'Demo Diagnostics Lab',
      country: { isoAlpha2: 'IN' },
      status: OrganizationStatus.ACTIVE,
    },
  });
  if (!labOrg) {
    console.warn('No IN lab org');
    return null;
  }

  let booking = await prisma.labBooking.findUnique({ where: { idempotencyKey: LAB_IDEM } });
  if (!booking) {
    const offer = await prisma.catalogOffer.findFirst({
      where: {
        countryId: labOrg.countryId,
        status: 'PUBLISHED',
        variant: { item: { slug: 'demo-lipid-panel' } },
      },
    });
    const customerPersonId = await personId(CUSTOMER);
    const addr = await prisma.customerAddress.findFirst({
      where: { customerPersonId, countryId: labOrg.countryId },
    });
    if (!offer || !addr) {
      console.warn('Missing lab offer/address');
      return null;
    }
    const book = await api(
      'POST',
      '/me/lab/bookings',
      customerTok,
      {
        offer_id: offer.id,
        collection_mode: 'HOME',
        lab_org_id: labOrg.id,
        customer_address_id: addr.id,
        country: 'IN',
        slot_starts_at: new Date(Date.now() + 86400000).toISOString(),
      },
      LAB_IDEM,
    );
    console.log('lab book', book.status, book.body.id ?? book.body.code ?? book.body.detail);
    if (!book.body.id) return null;
    await api(
      'POST',
      `/me/lab/bookings/${book.body.id}/pay`,
      customerTok,
      { method: 'CARD', scenario: 'success' },
      `${LAB_IDEM}-pay`,
    );
    booking = await prisma.labBooking.findUnique({ where: { idempotencyKey: LAB_IDEM } });
  }
  if (!booking) return null;

  const sample = await prisma.labSample.findUnique({ where: { labBookingId: booking.id } });
  if (!sample) {
    console.warn('No sample');
    return { bookingId: booking.id, labOrgId: labOrg.id };
  }

  const collectionJob = await prisma.logisticsJob.findFirst({
    where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
  });
  if (collectionJob) {
    for (const step of ['accept', 'arrive', 'verify', 'collect'] as const) {
      await api('POST', `/phlebotomist/jobs/${collectionJob.id}/${step}`, labTok, {}, `${LAB_IDEM}-${step}`);
    }
    await api(
      'POST',
      `/phlebotomist/jobs/${collectionJob.id}/seal`,
      labTok,
      { container_barcode: `S57-${sample.id.slice(0, 8)}` },
      `${LAB_IDEM}-seal`,
    );
    await api('POST', `/phlebotomist/jobs/${collectionJob.id}/handover`, labTok, {}, `${LAB_IDEM}-handover`);
  }

  const transportJob = await prisma.logisticsJob.findFirst({
    where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
  });
  if (transportJob) {
    for (const step of ['accept', 'pickup', 'deliver'] as const) {
      await api('POST', `/delivery/jobs/${transportJob.id}/${step}`, deliveryTok, {}, `${LAB_IDEM}-t-${step}`);
    }
  }

  await api('POST', `/lab/samples/${sample.id}/receive`, labTok, { lab_org_id: labOrg.id }, `${LAB_IDEM}-receive`);
  await api(
    'POST',
    '/lab/accessions',
    labTok,
    { lab_org_id: labOrg.id, lab_sample_id: sample.id, idempotency_key: `${LAB_IDEM}-acc` },
    `${LAB_IDEM}-acc`,
  );

  const processing = await prisma.labProcessing.findUnique({ where: { labSampleId: sample.id } });
  if (processing) {
    await api(
      'POST',
      `/lab/processing/${processing.id}/start`,
      labTok,
      { lab_org_id: labOrg.id },
      `${LAB_IDEM}-ps`,
    );
    await api(
      'POST',
      `/lab/processing/${processing.id}/complete`,
      labTok,
      { lab_org_id: labOrg.id },
      `${LAB_IDEM}-pc`,
    );
  }

  const report = await prisma.labReport.findUnique({ where: { labSampleId: sample.id } });
  if (!report) {
    return { bookingId: booking.id, labOrgId: labOrg.id, sampleId: sample.id };
  }

  const version = await prisma.labReportVersion.findFirst({
    where: { labReportId: report.id },
    orderBy: { versionNumber: 'desc' },
  });
  const status = version?.status ?? 'UNKNOWN';
  console.log('lab report status', report.id, status);

  // Leave at PENDING_VERIFY so Pathologist UI can assign → verify → publish.
  // Only advance API publish if already verified (idempotent recovery).
  if (status === 'DRAFT' || !version) {
    await api(
      'POST',
      `/lab/reports/${report.id}/results`,
      labTok,
      {
        lab_org_id: labOrg.id,
        summary: 'S57 sandbox lipid panel — within reference ranges.',
        lines: [{ analyte_code: 'LDL', analyte_name: 'LDL Cholesterol', value: '98', unit: 'mg/dL' }],
      },
      `${LAB_IDEM}-results`,
    );
    await api(
      'POST',
      `/lab/reports/${report.id}/submit-verify`,
      labTok,
      { lab_org_id: labOrg.id },
      `${LAB_IDEM}-submit`,
    );
  }

  const after = await prisma.labReportVersion.findFirst({
    where: { labReportId: report.id },
    orderBy: { versionNumber: 'desc' },
  });
  console.log('lab report ready for pathologist UI', after?.status);

  // Smoke: membership allows assign (then roll back assignment only if we want UI to show Accept —
  // keep PENDING_VERIFY unassigned OR assigned). Prefer assigned for worklist clarity.
  const assign = await api(
    'POST',
    `/pathologist/reports/${report.id}/assign`,
    pathTok,
    { lab_org_id: labOrg.id },
    `${LAB_IDEM}-s57-assign`,
  );
  console.log('pathologist assign (membership check)', assign.status, assign.body.code ?? assign.body.status ?? '');

  return {
    bookingId: booking.id,
    labOrgId: labOrg.id,
    sampleId: sample.id,
    reportId: report.id,
    reportStatus: after?.status,
    assignStatus: assign.status,
  };
}

async function ensureImagingReportPipeline() {
  const customerTok = await login(CUSTOMER, 'customer');
  const imagingTok = await login(IMAGING, 'customer');
  const radTok = await login(RADIOLOGIST, 'customer');
  const imagingPersonId = await personId(IMAGING);

  const imagingOrg = await prisma.organization.findFirst({
    where: {
      kind: OrganizationKind.IMAGING_CENTER,
      legalName: 'Demo Imaging Center',
      country: { isoAlpha2: 'IN' },
      status: OrganizationStatus.ACTIVE,
    },
  });
  if (!imagingOrg) {
    console.warn('No IN imaging org');
    return null;
  }

  let booking = await prisma.imagingBooking.findUnique({ where: { idempotencyKey: IMG_IDEM } });
  if (!booking) {
    const offer = await prisma.catalogOffer.findFirst({
      where: {
        countryId: imagingOrg.countryId,
        status: 'PUBLISHED',
        variant: { item: { slug: 'demo-chest-xray' } },
      },
    });
    const location = await prisma.location.findFirst({
      where: { organizationId: imagingOrg.id, kind: 'IMAGING' },
    });
    if (!offer || !location) {
      console.warn('Missing imaging offer/location');
      return null;
    }
    const slotStart = new Date(Date.now() + 86400000);
    slotStart.setMinutes(0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
    const book = await api(
      'POST',
      '/me/imaging/bookings',
      customerTok,
      {
        offer_id: offer.id,
        imaging_org_id: imagingOrg.id,
        imaging_location_id: location.id,
        slot_starts_at: slotStart.toISOString(),
        slot_ends_at: slotEnd.toISOString(),
        timezone: 'UTC',
        country: 'IN',
        prep_acknowledged: true,
      },
      IMG_IDEM,
    );
    console.log('imaging book', book.status, book.body.id ?? book.body.code ?? book.body.detail);
    if (book.body.id) {
      await api(
        'POST',
        `/me/imaging/bookings/${book.body.id}/pay`,
        customerTok,
        { method: 'CARD', scenario: 'success' },
        `${IMG_IDEM}-pay`,
      );
    }
    booking = await prisma.imagingBooking.findUnique({ where: { idempotencyKey: IMG_IDEM } });
  }
  if (!booking) return null;

  await api(
    'POST',
    '/radiology/check-in',
    imagingTok,
    {
      imaging_org_id: imagingOrg.id,
      imaging_booking_id: booking.id,
      assignee_person_id: imagingPersonId,
    },
    `${IMG_IDEM}-checkin`,
  );

  const study = await prisma.imagingStudy.findFirst({ where: { imagingBookingId: booking.id } });
  if (!study) {
    console.warn('No study');
    return { bookingId: booking.id, imagingOrgId: imagingOrg.id };
  }

  if (!study.assigneePersonId) {
    await api(
      'POST',
      `/radiology/studies/${study.id}/assign`,
      imagingTok,
      { imaging_org_id: imagingOrg.id, assignee_person_id: imagingPersonId },
      `${IMG_IDEM}-assign-tech`,
    );
  }

  if (['CHECKED_IN', 'SCHEDULED'].includes(study.status)) {
    const start = await api(
      'POST',
      `/radiology/studies/${study.id}/start?imaging_org_id=${imagingOrg.id}`,
      imagingTok,
      {},
      `${IMG_IDEM}-start`,
    );
    console.log('study start', start.status, start.body.status ?? start.body.code);
  }

  const studyNow = await prisma.imagingStudy.findUniqueOrThrow({ where: { id: study.id } });
  if (studyNow.status === 'ACQUISITION_IN_PROGRESS' || studyNow.status === 'CHECKED_IN') {
    if (studyNow.status === 'CHECKED_IN') {
      await api(
        'POST',
        `/radiology/studies/${study.id}/start?imaging_org_id=${imagingOrg.id}`,
        imagingTok,
        {},
        `${IMG_IDEM}-start-retry`,
      );
    }
    const complete = await api(
      'POST',
      `/radiology/studies/${study.id}/complete`,
      imagingTok,
      {
        imaging_org_id: imagingOrg.id,
        equipment_code: 'XR-SBX-1',
        modality_code: 'XR',
      },
      `${IMG_IDEM}-complete`,
    );
    console.log('study complete', complete.status, complete.body.status ?? complete.body.code);
  }

  let report = await prisma.imagingReport.findFirst({ where: { imagingStudyId: study.id } });
  if (!report) {
    // Wait briefly for async report creation
    await new Promise((r) => setTimeout(r, 500));
    report = await prisma.imagingReport.findFirst({ where: { imagingStudyId: study.id } });
  }
  if (!report) {
    console.warn('No imaging report after acquisition');
    return { bookingId: booking.id, imagingOrgId: imagingOrg.id, studyId: study.id };
  }

  const version = await prisma.imagingReportVersion.findFirst({
    where: { imagingReportId: report.id },
    orderBy: { versionNumber: 'desc' },
  });
  console.log('imaging report version', version?.status);

  // Leave DRAFT assigned with findings for Radiologist UI when possible; if already published, keep.
  if (!version || version.status === 'DRAFT') {
    const assign = await api(
      'POST',
      `/radiologist/reports/${report.id}/assign`,
      radTok,
      { imaging_org_id: imagingOrg.id },
      `${IMG_IDEM}-rad-assign`,
    );
    console.log('radiologist assign', assign.status, assign.body.code ?? '');

    const findings = await api(
      'POST',
      `/radiologist/reports/${report.id}/findings`,
      radTok,
      {
        imaging_org_id: imagingOrg.id,
        summary: 'S57 sandbox chest x-ray — no acute cardiopulmonary process.',
        findings: [{ finding_code: 'IMPRESSION', finding_text: 'Normal heart size. Lungs clear. (sandbox)' }],
      },
      `${IMG_IDEM}-findings`,
    );
    console.log('findings', findings.status, findings.body.code ?? findings.body.version ?? '');

    // Leave SUBMITTED or DRAFT for UI verify/publish when not yet published.
    // Advance to PENDING_VERIFY so reviewer UI can verify+publish.
    const submit = await api(
      'POST',
      `/radiologist/reports/${report.id}/submit`,
      radTok,
      { imaging_org_id: imagingOrg.id },
      `${IMG_IDEM}-submit`,
    );
    console.log('submit', submit.status, submit.body.code ?? '');
    // Leave PENDING_VERIFY for reviewer UI (SoD) — do not auto-publish in fixture.
  }

  const after = await prisma.imagingReportVersion.findFirst({
    where: { imagingReportId: report.id },
    orderBy: { versionNumber: 'desc' },
  });

  return {
    bookingId: booking.id,
    imagingOrgId: imagingOrg.id,
    studyId: study.id,
    reportId: report.id,
    reportStatus: after?.status,
  };
}

async function ensureVendorAcceptReady(customerPersonId: string) {
  let order = await prisma.order.findFirst({ where: { orderNumber: VENDOR_ORDER_TAG } });
  if (!order) {
    order = await prisma.order.findFirst({
      where: {
        customerPersonId,
        status: {
          in: [
            OrderStatus.ALLOCATED,
            OrderStatus.CONFIRMED,
            OrderStatus.PICKING,
            OrderStatus.PICKED,
            OrderStatus.PACKING,
            OrderStatus.PACKED,
            OrderStatus.READY_TO_SHIP,
          ],
        },
        items: { some: {} },
        orderNumber: { not: 'DEMO-SBX-REORDER-IN' },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!order) {
    order = await prisma.order.findFirst({
      where: {
        customerPersonId,
        status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        items: { some: {} },
        orderNumber: { not: 'DEMO-SBX-REORDER-IN' },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!order) {
    console.warn('No vendor order — place via customer checkout');
    return null;
  }

  await prisma.orderStatusHistory.deleteMany({
    where: { orderId: order.id, reason: 'vendor_accept' },
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.ALLOCATED },
  });
  console.log('vendor order ready for Accept CTA', order.orderNumber);
  return order.orderNumber;
}

async function main() {
  console.log('S57 fixtures…');
  await ensureFieldStaffMemberships();

  const customerPersonId = await personId(CUSTOMER);

  try {
    const lab = await ensureLabPublishReady();
    console.log('lab fixture', lab);
  } catch (e) {
    console.warn('lab fixture error', (e as Error).message);
  }

  try {
    const imaging = await ensureImagingReportPipeline();
    console.log('imaging fixture', imaging);
  } catch (e) {
    console.warn('imaging fixture error', (e as Error).message);
  }

  try {
    const vendor = await ensureVendorAcceptReady(customerPersonId);
    console.log('vendor fixture', vendor);
  } catch (e) {
    console.warn('vendor fixture error', (e as Error).message);
  }

  console.log('S57 fixture run complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
