import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = 'http://127.0.0.1:4000/api/v1';

async function login(email: string) {
  const s = (await (
    await fetch(`${API}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: email, purpose: 'LOGIN' }),
    })
  ).json()) as { challenge_id?: string; dev_code?: string };
  const v = (await (
    await fetch(`${API}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge_id: s.challenge_id, code: s.dev_code, audience: 'customer' }),
    })
  ).json()) as { access_token?: string };
  if (!v.access_token) throw new Error('login failed');
  return v.access_token;
}

async function main() {
  const m = await prisma.membership.findFirst({
    where: { organization: { kind: 'AFFILIATE_ORG' }, status: 'ACTIVE' },
    include: { person: { include: { identifiers: true } }, organization: true },
  });
  const email = m?.person?.identifiers?.find((i) => i.type === 'EMAIL')?.valueNormalized;
  console.log('member', m?.organization?.displayName ?? null, email ?? null);
  if (!email) return;
  const token = await login(email);
  const h = { Authorization: `Bearer ${token}` };
  for (const path of [
    '/me/affiliate/stats?country_code=XX',
    '/me/affiliate/earnings',
    '/me/affiliate/codes?country_code=XX',
    '/me/affiliate/links?country_code=XX',
    '/me/affiliate/statement',
  ]) {
    const r = await fetch(`${API}${path}`, { headers: h });
    console.log(path.split('?')[0], r.status);
    if (path.includes('stats') && r.status === 200) {
      const body = await r.json();
      console.log(
        'stats',
        JSON.stringify({
          clicks: body.clicks_total,
          conversions: body.conversions_total,
          payout_status: body.payout_status,
          payout_enabled: body.payout_enabled,
        }),
      );
    }
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
