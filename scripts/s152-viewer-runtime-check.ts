import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = 'http://127.0.0.1:4000/api/v1';

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

async function main() {
  const booking = await prisma.imagingBooking.findFirst({
    where: { study: { series: { some: { instances: { some: { status: 'STORED' } } } } } },
    include: {
      study: { include: { series: { include: { instances: true } } } },
      customer: { include: { identifiers: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!booking) {
    console.log('NO_STUDY_WITH_INSTANCES');
    return;
  }
  const email =
    booking.customer?.identifiers?.find((i) => i.type === 'EMAIL')?.valueNormalized ??
    'sandbox-customer@dev.local';
  console.log('booking', booking.id, 'email', email);

  const token = await login(email);
  const study = await fetch(`${API}/me/imaging/bookings/${booking.id}/study`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const studyBody = await study.json();
  console.log('study', study.status, JSON.stringify(studyBody.viewer));

  const viewer = await fetch(`${API}/me/imaging/bookings/${booking.id}/viewer`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const viewerBody = await viewer.json();
  console.log(
    'viewer',
    viewer.status,
    'series',
    viewerBody.series?.length,
    'public_urls',
    viewerBody.viewer?.public_urls,
    'leak',
    JSON.stringify(viewerBody).includes('payload_base64'),
  );

  const seriesId = viewerBody.series?.[0]?.series_id as string | undefined;
  if (seriesId) {
    const frame = await fetch(
      `${API}/me/imaging/bookings/${booking.id}/viewer/series/${seriesId}/frames/0`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const buf = Buffer.from(await frame.arrayBuffer());
    console.log(
      'frame',
      frame.status,
      frame.headers.get('content-type'),
      frame.headers.get('x-wp-public-url'),
      'png_sig',
      buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71,
      'first_bytes',
      Array.from(buf.subarray(0, 8)).join(','),
      'bytes',
      buf.length,
    );
  }

  // Cross-patient: second person if present
  const other = await prisma.imagingBooking.findFirst({
    where: { customerPersonId: { not: booking.customerPersonId } },
    include: { customer: { include: { identifiers: true } } },
  });
  if (other?.customer?.identifiers?.length) {
    const otherEmail = other.customer.identifiers.find((i) => i.type === 'EMAIL')?.valueNormalized;
    if (otherEmail) {
      const tok2 = await login(otherEmail);
      const denied = await fetch(`${API}/me/imaging/bookings/${booking.id}/viewer`, {
        headers: { Authorization: `Bearer ${tok2}` },
      });
      console.log('cross_patient', denied.status);
    }
  } else {
    console.log('cross_patient', 'NO_ALT_CUSTOMER');
  }

  try {
    const unauth = await fetch(`${API}/me/imaging/bookings/${booking.id}/viewer`);
    console.log('unauth', unauth.status);
  } catch (e) {
    console.log('unauth_error', e instanceof Error ? e.message : e);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
