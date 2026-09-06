/**
 * Sprint 56 — deterministic sandbox fixtures (Prisma + HTTP).
 * Idempotent. Does not bypass consent rules or production gates.
 *
 *   npx tsx scripts/s56-ensure-sandbox-fixtures.ts
 */
import {
  AppointmentStatus,
  ConsentGrantStatus,
  LogisticsJobType,
  OrderStatus,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const API = process.env.WP_API_BASE ?? 'http://127.0.0.1:4000/api/v1';

function uuidv7(): string {
  // Sandbox fixture ids — UUIDv4 is acceptable for non-production fixtures.
  return randomUUID();
}

const CUSTOMER = 'sandbox-customer@dev.local';
const DOCTOR = 'sandbox-doctor@dev.local';
const LAB = 'sandbox-lab@dev.local';
const PATHOLOGIST = 'sandbox-pathologist@dev.local';
const IMAGING = 'sandbox-imaging@dev.local';
const RADIOLOGIST = 'sandbox-radiologist@dev.local';
const RADIOLOGIST_REVIEWER = 'sandbox-radiologist-reviewer@dev.local';
const DELIVERY = 'sandbox-delivery@dev.local';

const APPT_REASON = 's56-sandbox-appointment';
const LAB_IDEM = 'dev-sandbox-lab-pathology-s56';
const IMG_IDEM = 'dev-sandbox-imaging-report-s56';
const VENDOR_ORDER = 'DEMO-SBX-VENDOR-FULFILL';

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

async function ensureConsents(customerPersonId: string, doctorPartnerId: string, countryId: string) {
  for (const purpose of ['consultation', 'telemedicine'] as const) {
    const existing = await prisma.consentGrant.findFirst({
      where: {
        subjectPersonId: customerPersonId,
        recipientPartnerId: doctorPartnerId,
        purpose,
        status: ConsentGrantStatus.ACTIVE,
      },
    });
    if (existing) {
      console.log('consent ok', purpose);
      continue;
    }
    await prisma.consentGrant.create({
      data: {
        id: uuidv7(),
        countryId,
        subjectPersonId: customerPersonId,
        recipientPartnerId: doctorPartnerId,
        purpose,
        grantedByPersonId: customerPersonId,
        scope: [],
        status: ConsentGrantStatus.ACTIVE,
      },
    });
    console.log('consent created', purpose);
  }
}

async function ensureAppointment(customerPersonId: string, doctorPersonId: string) {
  const profile = await prisma.doctorProfile.findFirst({
    where: { personId: doctorPersonId, partner: { status: 'ACTIVE' } },
    include: { partner: true },
  });
  if (!profile) throw new Error('Doctor profile missing');

  await ensureConsents(customerPersonId, profile.partnerId, profile.countryId);

  let appt = await prisma.appointment.findFirst({
    where: { customerPersonId, reasonCategory: APPT_REASON },
    orderBy: { createdAt: 'desc' },
  });

  if (!appt) {
    const startsAt = new Date(Date.now() + 2 * 3600_000);
    startsAt.setMinutes(0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
    await prisma.appointment.create({
      data: {
        id: uuidv7(),
        countryId: profile.countryId,
        customerPersonId,
        doctorProfileId: profile.id,
        doctorPartnerId: profile.partnerId,
        timezone: profile.timezone || 'UTC',
        type: 'ONLINE',
        startsAt,
        endsAt,
        status: AppointmentStatus.REQUESTED,
        reasonCategory: APPT_REASON,
      },
    }).then((row) => {
      appt = row;
    });
    console.log('appointment created REQUESTED', appt!.id);
  } else {
    // Reset to REQUESTED if completed so doctor UI can exercise lifecycle again
    if (
      appt.status === AppointmentStatus.COMPLETED ||
      appt.status === AppointmentStatus.CANCELLED ||
      appt.status === AppointmentStatus.NO_SHOW
    ) {
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { status: AppointmentStatus.REQUESTED },
      });
      await prisma.encounter.deleteMany({ where: { appointmentId: appt.id } });
      appt = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
      console.log('appointment reset to REQUESTED', appt.id);
    } else {
      console.log('appointment existing', appt.id, appt.status);
    }
  }

  // Ensure clinical relationship (required for access evaluate)
  const rel = await prisma.clinicalRelationship.findFirst({
    where: { patientPersonId: customerPersonId, doctorPartnerId: profile.partnerId },
  });
  if (!rel) {
    await prisma.clinicalRelationship.create({
      data: {
        id: uuidv7(),
        countryId: profile.countryId,
        patientPersonId: customerPersonId,
        doctorPartnerId: profile.partnerId,
        kind: 'CARE',
        status: 'ACTIVE',
      },
    });
  }

  return { appointmentId: appt!.id, partnerId: profile.partnerId, profileId: profile.id };
}

async function ensureVendorFulfillOrder(customerPersonId: string) {
  // Prefer tagged order; otherwise promote a recent ALLOCATED/CONFIRMED sandbox order.
  let order = await prisma.order.findFirst({
    where: { orderNumber: VENDOR_ORDER },
  });
  if (!order) {
    order = await prisma.order.findFirst({
      where: {
        customerPersonId,
        status: { in: [OrderStatus.ALLOCATED, OrderStatus.CONFIRMED, OrderStatus.PICKING, OrderStatus.PICKED] },
        items: { some: {} },
        orderNumber: { not: 'DEMO-SBX-REORDER-IN' },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!order) {
    // Fall back: any recent paid order for this customer that is not delivered
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
    console.warn('No order available for vendor fulfill — place one via customer checkout');
    return null;
  }

  await prisma.orderStatusHistory.deleteMany({
    where: { orderId: order.id, reason: 'vendor_accept' },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.ALLOCATED },
  });

  // Tag for discovery
  if (order.orderNumber !== VENDOR_ORDER) {
    // Can't rename unique easily if DEMO exists — keep original number and log it
    console.log('vendor fulfill order prepared', order.orderNumber, '→ ALLOCATED (accept CTA ready)');
    return order.orderNumber;
  }
  console.log('vendor order ready', order.orderNumber);
  return order.orderNumber;
}

async function ensureLabPathologyReady() {
  const customerTok = await login(CUSTOMER, 'customer');
  const labTok = await login(LAB, 'customer');
  const deliveryTok = await login(DELIVERY, 'customer');
  const pathTok = await login(PATHOLOGIST, 'customer');

  const labOrg = await prisma.organization.findFirst({
    where: { kind: 'LAB', legalName: 'Demo Diagnostics Lab', country: { isoAlpha2: 'IN' }, status: 'ACTIVE' },
    include: { country: true },
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
      console.warn('Missing lab offer/address', { offer: !!offer, addr: !!addr, labOrg: labOrg.id });
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
    const pay = await api(
      'POST',
      `/me/lab/bookings/${book.body.id}/pay`,
      customerTok,
      { method: 'CARD', scenario: 'success' },
      `${LAB_IDEM}-pay`,
    );
    console.log('lab pay', pay.status, pay.body.code ?? '');
    booking = await prisma.labBooking.findUnique({ where: { idempotencyKey: LAB_IDEM } });
  }

  if (!booking) return null;
  console.log('lab booking', booking.id, booking.status);

  const sample = await prisma.labSample.findUnique({ where: { labBookingId: booking.id } });
  if (!sample) {
    console.warn('No sample for lab booking');
    return { bookingId: booking.id, labOrgId: labOrg.id };
  }

  const collectionJob = await prisma.logisticsJob.findFirst({
    where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
  });
  if (collectionJob) {
    for (const step of ['accept', 'arrive', 'verify', 'collect'] as const) {
      const r = await api(
        'POST',
        `/phlebotomist/jobs/${collectionJob.id}/${step}`,
        labTok,
        {},
        `${LAB_IDEM}-${step}`,
      );
      console.log('phleb', step, r.status);
    }
    await api(
      'POST',
      `/phlebotomist/jobs/${collectionJob.id}/seal`,
      labTok,
      { container_barcode: `S56-${sample.id.slice(0, 8)}` },
      `${LAB_IDEM}-seal`,
    );
    await api(
      'POST',
      `/phlebotomist/jobs/${collectionJob.id}/handover`,
      labTok,
      {},
      `${LAB_IDEM}-handover`,
    );
  }

  const transportJob = await prisma.logisticsJob.findFirst({
    where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
  });
  if (transportJob) {
    for (const step of ['accept', 'pickup', 'deliver'] as const) {
      const r = await api(
        'POST',
        `/delivery/jobs/${transportJob.id}/${step}`,
        deliveryTok,
        {},
        `${LAB_IDEM}-t-${step}`,
      );
      console.log('transport', step, r.status);
    }
  }

  await api(
    'POST',
    `/lab/samples/${sample.id}/receive`,
    labTok,
    { lab_org_id: labOrg.id },
    `${LAB_IDEM}-receive`,
  );
  const accession = await api(
    'POST',
    '/lab/accessions',
    labTok,
    { lab_org_id: labOrg.id, lab_sample_id: sample.id, idempotency_key: `${LAB_IDEM}-acc` },
    `${LAB_IDEM}-acc`,
  );
  console.log('accession', accession.status, accession.body.code ?? '');

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
  if (report) {
    const enter = await api(
      'POST',
      `/lab/reports/${report.id}/results`,
      labTok,
      {
        lab_org_id: labOrg.id,
        summary: 'S56 sandbox lipid panel — within reference ranges.',
        lines: [{ analyte_code: 'LDL', analyte_name: 'LDL Cholesterol', value: '98', unit: 'mg/dL' }],
      },
      `${LAB_IDEM}-results`,
    );
    console.log('enter results', enter.status);
    await api(
      'POST',
      `/lab/reports/${report.id}/submit-verify`,
      labTok,
      { lab_org_id: labOrg.id },
      `${LAB_IDEM}-submit`,
    );
    await api(
      'POST',
      `/pathologist/reports/${report.id}/assign`,
      pathTok,
      { lab_org_id: labOrg.id },
      `${LAB_IDEM}-assign`,
    );
    await api(
      'POST',
      `/pathologist/reports/${report.id}/verify`,
      pathTok,
      { lab_org_id: labOrg.id },
      `${LAB_IDEM}-verify`,
    );
    const pub = await api(
      'POST',
      `/pathologist/reports/${report.id}/publish`,
      pathTok,
      { lab_org_id: labOrg.id },
      `${LAB_IDEM}-publish`,
    );
    console.log('lab report publish', pub.status, report.id);
    return { bookingId: booking.id, labOrgId: labOrg.id, sampleId: sample.id, reportId: report.id };
  }

  return { bookingId: booking.id, labOrgId: labOrg.id, sampleId: sample.id };
}

async function ensureImagingReportReady() {
  const customerTok = await login(CUSTOMER, 'customer');
  const imagingTok = await login(IMAGING, 'customer');
  const radTok = await login(RADIOLOGIST, 'customer');
  const reviewerTok = await login(RADIOLOGIST_REVIEWER, 'customer');

  const imagingOrg = await prisma.organization.findFirst({
    where: {
      kind: 'IMAGING_CENTER',
      legalName: 'Demo Imaging Center',
      country: { isoAlpha2: 'IN' },
      status: 'ACTIVE',
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
      console.warn('Missing imaging offer/location', { offer: !!offer, location: !!location });
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

  const checkIn = await api(
    'POST',
    '/radiology/check-in',
    imagingTok,
    { imaging_org_id: imagingOrg.id, imaging_booking_id: booking.id },
    `${IMG_IDEM}-checkin`,
  );
  console.log('imaging check-in', checkIn.status, checkIn.body.code ?? checkIn.body.id ?? '');

  const study = await prisma.imagingStudy.findFirst({
    where: { imagingBookingId: booking.id },
  });
  if (!study) {
    console.warn('No imaging study after check-in');
    return { bookingId: booking.id, imagingOrgId: imagingOrg.id };
  }

  await api(
    'POST',
    `/radiology/studies/${study.id}/start?imaging_org_id=${imagingOrg.id}`,
    imagingTok,
    {},
    `${IMG_IDEM}-start`,
  );
  await api(
    'POST',
    `/radiology/studies/${study.id}/complete?imaging_org_id=${imagingOrg.id}`,
    imagingTok,
    {},
    `${IMG_IDEM}-complete`,
  );

  const report = await prisma.imagingReport.findFirst({ where: { imagingStudyId: study.id } });
  if (report) {
    await api(
      'POST',
      `/radiologist/reports/${report.id}/assign`,
      radTok,
      { imaging_org_id: imagingOrg.id },
      `${IMG_IDEM}-assign`,
    );
    await api(
      'POST',
      `/radiologist/reports/${report.id}/findings`,
      radTok,
      {
        imaging_org_id: imagingOrg.id,
        summary: 'S56 sandbox chest x-ray — no acute cardiopulmonary process.',
        findings: [{ code: 'IMP', text: 'Normal heart size. Lungs clear.' }],
      },
      `${IMG_IDEM}-findings`,
    );
    await api(
      'POST',
      `/radiologist/reports/${report.id}/submit`,
      radTok,
      { imaging_org_id: imagingOrg.id },
      `${IMG_IDEM}-submit`,
    );
    await api(
      'POST',
      `/radiologist/reports/${report.id}/verify`,
      reviewerTok,
      { imaging_org_id: imagingOrg.id },
      `${IMG_IDEM}-verify`,
    );
    const pub = await api(
      'POST',
      `/radiologist/reports/${report.id}/publish`,
      reviewerTok,
      { imaging_org_id: imagingOrg.id },
      `${IMG_IDEM}-publish`,
    );
    console.log('imaging report publish', pub.status, report.id);
    return {
      bookingId: booking.id,
      imagingOrgId: imagingOrg.id,
      studyId: study.id,
      reportId: report.id,
    };
  }

  return { bookingId: booking.id, imagingOrgId: imagingOrg.id, studyId: study.id };
}

async function main() {
  console.log('S56 fixtures…');
  const customerPersonId = await personId(CUSTOMER);
  const doctorPersonId = await personId(DOCTOR);

  const appt = await ensureAppointment(customerPersonId, doctorPersonId);
  console.log('doctor fixture', appt);

  const vendorOrder = await ensureVendorFulfillOrder(customerPersonId);
  console.log('vendor fixture', vendorOrder);

  try {
    const lab = await ensureLabPathologyReady();
    console.log('lab fixture', lab);
  } catch (e) {
    console.warn('lab fixture error', (e as Error).message);
  }

  try {
    const imaging = await ensureImagingReportReady();
    console.log('imaging fixture', imaging);
  } catch (e) {
    console.warn('imaging fixture error', (e as Error).message);
  }

  console.log('S56 fixture run complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
