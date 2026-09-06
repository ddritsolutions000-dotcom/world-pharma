/**
 * S153 satellite SPA enrichment — API + page runtime evidence (sandbox).
 * Does not claim authenticated browser PASS; records HTTP results honestly.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = 'http://127.0.0.1:4000/api/v1';
const WEB = 'http://127.0.0.1:3000';

async function login(email: string) {
  const s = await fetch(`${API}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, purpose: 'LOGIN' }),
  });
  const j = (await s.json()) as { challenge_id?: string; dev_code?: string };
  const v = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: j.challenge_id, code: j.dev_code, audience: 'customer' }),
  });
  const t = (await v.json()) as { access_token?: string };
  if (!t.access_token) throw new Error(`login failed ${email}`);
  return t.access_token;
}

async function page(path: string) {
  const res = await fetch(`${WEB}${path}`);
  return { path, status: res.status };
}

async function main() {
  console.log('=== S153 runtime check ===');

  // Public / guest pages
  for (const p of ['/lab', '/lab/packages', '/radiology', '/track-order', '/shipments', '/orders']) {
    console.log('page', await page(p));
  }

  // Unauthorized protected APIs
  for (const path of [
    '/me/lab/bookings',
    '/me/imaging/bookings',
    '/me/orders',
    '/me/shipments',
  ]) {
    const res = await fetch(`${API}${path}`);
    console.log('unauth', path, res.status);
  }

  const email = 'sandbox-customer@dev.local';
  let token: string;
  try {
    token = await login(email);
    console.log('login', email, 'ok');
  } catch (e) {
    console.log('login_failed', e instanceof Error ? e.message : e);
    return;
  }

  const auth = { Authorization: `Bearer ${token}` };

  // LAB journey APIs (list may hit pre-existing RLS savepoint flake; probe by fixture id)
  const labList = await fetch(`${API}/me/lab/bookings`, { headers: auth });
  const labBody = (await labList.json().catch(() => ({}))) as { data?: Array<{ id: string; status: string }> };
  console.log('lab_list', labList.status, 'count', labBody.data?.length ?? 0);

  const labFixture = await prisma.labBooking.findFirst({
    where: { customer: { identifiers: { some: { valueNormalized: email } } } },
    orderBy: { createdAt: 'desc' },
  });
  const labId = labFixture?.id ?? labBody.data?.[0]?.id;
  if (labId) {
    const detail = await fetch(`${API}/me/lab/bookings/${labId}`, { headers: auth });
    const collection = await fetch(`${API}/me/lab/bookings/${labId}/collection`, { headers: auth });
    const reportStatus = await fetch(`${API}/me/lab/bookings/${labId}/report/status`, { headers: auth });
    const report = await fetch(`${API}/me/lab/bookings/${labId}/report`, { headers: auth });
    console.log(
      'lab_detail',
      detail.status,
      'collection',
      collection.status,
      'report_status',
      reportStatus.status,
      'report',
      report.status,
    );
    console.log('lab_page', await page(`/lab/bookings/${labId}`));
  } else {
    console.log('lab_detail', 'NO_BOOKING_FIXTURE');
  }

  // Invalid lab id
  const badLab = await fetch(`${API}/me/lab/bookings/not-a-real-id`, { headers: auth });
  console.log('lab_invalid_id', badLab.status);

  // IMAGING journey + S152 viewer
  const imgList = await fetch(`${API}/me/imaging/bookings`, { headers: auth });
  const imgBody = (await imgList.json()) as { data?: Array<{ id: string }> };
  console.log('imaging_list', imgList.status, 'count', imgBody.data?.length ?? 0);

  const studyBooking = await prisma.imagingBooking.findFirst({
    where: {
      customer: { identifiers: { some: { valueNormalized: email } } },
      study: { series: { some: { instances: { some: { status: 'STORED' } } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const imgId = studyBooking?.id ?? imgBody.data?.[0]?.id;
  if (imgId) {
    const detail = await fetch(`${API}/me/imaging/bookings/${imgId}`, { headers: auth });
    const progress = await fetch(`${API}/me/imaging/bookings/${imgId}/progress`, { headers: auth });
    const study = await fetch(`${API}/me/imaging/bookings/${imgId}/study`, { headers: auth });
    const studyJson = await study.json();
    const viewer = await fetch(`${API}/me/imaging/bookings/${imgId}/viewer`, { headers: auth });
    const viewerJson = await viewer.json();
    console.log(
      'imaging_detail',
      detail.status,
      'progress',
      progress.status,
      'study',
      study.status,
      'viewer_available',
      studyJson?.viewer?.available,
      'viewer_session',
      viewer.status,
      'public_urls',
      viewerJson?.viewer?.public_urls ?? false,
    );
    console.log('imaging_page', await page(`/radiology/bookings/${imgId}`));
    console.log('viewer_page', await page(`/radiology/bookings/${imgId}/viewer`));
  } else {
    console.log('imaging_detail', 'NO_BOOKING_FIXTURE');
  }

  const badImg = await fetch(`${API}/me/imaging/bookings/not-a-real-id`, { headers: auth });
  console.log('imaging_invalid_id', badImg.status);

  // LOGISTICS
  const orders = await fetch(`${API}/me/orders`, { headers: auth });
  const orderBody = (await orders.json()) as { data?: Array<{ id: string; order_number?: string }> };
  console.log('orders_list', orders.status, 'count', orderBody.data?.length ?? 0);
  const orderId = orderBody.data?.[0]?.id;
  if (orderId) {
    const od = await fetch(`${API}/me/orders/${orderId}`, { headers: auth });
    console.log('order_detail', od.status);
    console.log('order_page', await page(`/orders/${orderId}`));
  }

  const shipments = await fetch(`${API}/me/shipments`, { headers: auth });
  const shipBody = (await shipments.json()) as { data?: Array<{ id: string }> };
  console.log('shipments_list', shipments.status, 'count', shipBody.data?.length ?? 0);
  const shipId = shipBody.data?.[0]?.id;
  if (shipId) {
    const sd = await fetch(`${API}/me/shipments/${shipId}`, { headers: auth });
    console.log('shipment_detail', sd.status);
    console.log('shipment_page', await page(`/shipments/${shipId}`));
  }

  // Guest track (may 404 without fixture)
  const track = await fetch(`${API}/orders/track?order_number=DEMO-SBX-001&postal_code=110001`);
  console.log('guest_track', track.status);

  console.log('AUTHENTICATED_BROWSER_CLICKTHROUGH', 'NOT_COMPLETED');
  console.log('CAN_PRODUCTION_LAUNCH', 'NO');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
