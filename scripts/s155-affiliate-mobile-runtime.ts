/**
 * S155 — Affiliate mobile API smoke (auth gates + own stats when fixture exists).
 */
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
  console.log('=== S155 affiliate mobile runtime ===');
  console.log('expo_web', (await fetch('http://localhost:8092/')).status);

  for (const path of [
    '/me/affiliate/stats?country_code=XX',
    '/me/affiliate/codes?country_code=XX',
    '/me/affiliate/links?country_code=XX',
    '/me/affiliate/earnings',
    '/me/affiliate/statement',
  ]) {
    const res = await fetch(`${API}${path}`);
    console.log('unauth', path.split('?')[0], res.status);
  }

  const emails = [
    process.env.S155_AFFILIATE_EMAIL,
    'sandbox-affiliate@dev.local',
    'sandbox-customer@dev.local',
  ].filter(Boolean) as string[];

  let authed = false;
  for (const email of emails) {
    try {
      const token = await login(email);
      const h = { Authorization: `Bearer ${token}` };
      const stats = await fetch(`${API}/me/affiliate/stats?country_code=XX`, { headers: h });
      const earnings = await fetch(`${API}/me/affiliate/earnings`, { headers: h });
      const codes = await fetch(`${API}/me/affiliate/codes?country_code=XX`, { headers: h });
      console.log(
        'auth',
        email,
        'stats',
        stats.status,
        'earnings',
        earnings.status,
        'codes',
        codes.status,
      );
      if (stats.status === 200) {
        const body = await stats.json();
        console.log(
          'stats_body',
          JSON.stringify({
            clicks: body.clicks_total,
            conversions: body.conversions_total,
            payout_status: body.payout_status,
            payout_enabled: body.payout_enabled,
            sandbox: body.sandbox,
          }),
        );
        authed = true;
        break;
      }
    } catch (e) {
      console.log('login_skip', email, e instanceof Error ? e.message : e);
    }
  }

  console.log('AFFILIATE_API_AUTH_OK', authed);
  console.log('AUTHENTICATED_DEVICE_TAPTHROUGH', 'NOT_COMPLETED');
  console.log('CAN_PRODUCTION_LAUNCH', 'NO');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
