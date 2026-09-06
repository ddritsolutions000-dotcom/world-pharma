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
  const a = await prisma.labBooking.findFirst({
    include: { customer: { include: { identifiers: true } } },
  });
  const b = await prisma.labBooking.findFirst({
    where: { customerPersonId: { not: a?.customerPersonId } },
    include: { customer: { include: { identifiers: true } } },
  });
  const ea = a?.customer?.identifiers?.find((i) => i.type === 'EMAIL')?.valueNormalized;
  const eb = b?.customer?.identifiers?.find((i) => i.type === 'EMAIL')?.valueNormalized;
  if (!ea || !eb) {
    console.log('need_two_customers', { ea: Boolean(ea), eb: Boolean(eb) });
    return;
  }
  const ta = await login(ea);
  const tb = await login(eb);
  const la = (await (
    await fetch(`${API}/me/lab/bookings`, { headers: { Authorization: `Bearer ${ta}` } })
  ).json()) as { data?: Array<{ id: string; customer_person_id?: string }> };
  const lb = (await (
    await fetch(`${API}/me/lab/bookings`, { headers: { Authorization: `Bearer ${tb}` } })
  ).json()) as { data?: Array<{ id: string }> };
  const ia = (await (
    await fetch(`${API}/me/imaging/bookings`, { headers: { Authorization: `Bearer ${ta}` } })
  ).json()) as { data?: Array<{ id: string }> };
  const ib = (await (
    await fetch(`${API}/me/imaging/bookings`, { headers: { Authorization: `Bearer ${tb}` } })
  ).json()) as { data?: Array<{ id: string }> };
  const idsA = new Set((la.data ?? []).map((x) => x.id));
  const idsIA = new Set((ia.data ?? []).map((x) => x.id));
  console.log(
    JSON.stringify({
      email_a: ea,
      email_b: eb,
      lab_a: la.data?.length ?? 0,
      lab_b: lb.data?.length ?? 0,
      imaging_a: ia.data?.length ?? 0,
      imaging_b: ib.data?.length ?? 0,
      cross_lab_id_leak: (lb.data ?? []).some((x) => idsA.has(x.id)),
      cross_imaging_id_leak: (ib.data ?? []).some((x) => idsIA.has(x.id)),
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
