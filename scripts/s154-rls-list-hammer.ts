/**
 * S154 — Hammer LAB / IMAGING customer list endpoints for RLS savepoint reliability.
 */
const API = 'http://127.0.0.1:4000/api/v1';
const ROUNDS = Number(process.env['S154_ROUNDS'] ?? 50);
const CONCURRENCY = Number(process.env['S154_CONCURRENCY'] ?? 8);

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

async function hammer(path: string, token: string, rounds: number) {
  const statuses: Record<number, number> = {};
  let ok = 0;
  let fail = 0;
  const errors: string[] = [];
  for (let i = 0; i < rounds; i++) {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    statuses[res.status] = (statuses[res.status] ?? 0) + 1;
    if (res.status >= 200 && res.status < 300) ok++;
    else {
      fail++;
      if (errors.length < 5) {
        const body = await res.text();
        errors.push(`${res.status}: ${body.slice(0, 200)}`);
      }
    }
  }
  return { path, rounds, ok, fail, statuses, errors };
}

async function concurrent(path: string, token: string, n: number) {
  const statuses: Record<number, number> = {};
  let ok = 0;
  let fail = 0;
  const results = await Promise.all(
    Array.from({ length: n }, () =>
      fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }),
    ),
  );
  for (const res of results) {
    statuses[res.status] = (statuses[res.status] ?? 0) + 1;
    if (res.status >= 200 && res.status < 300) ok++;
    else fail++;
  }
  return { path, concurrent: n, ok, fail, statuses };
}

async function isolation(tokenA: string, tokenB: string | null) {
  const labA = await fetch(`${API}/me/lab/bookings`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const imgA = await fetch(`${API}/me/imaging/bookings`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const labJson = (await labA.json()) as { data?: Array<{ customer_person_id?: string }> };
  const imgJson = (await imgA.json()) as { data?: Array<{ customer_person_id?: string }> };
  const unauth = await fetch(`${API}/me/lab/bookings`);
  console.log(
    'isolation',
    JSON.stringify({
      lab_status: labA.status,
      imaging_status: imgA.status,
      lab_rows: labJson.data?.length ?? null,
      imaging_rows: imgJson.data?.length ?? null,
      unauth: unauth.status,
      second_customer: tokenB ? 'present' : 'absent',
    }),
  );
}

async function main() {
  console.log('=== S154 RLS list hammer ===');
  const email = process.env['S154_EMAIL'] ?? 'sandbox-customer@dev.local';
  const token = await login(email);
  console.log('login', email, 'ok');

  const lab = await hammer('/me/lab/bookings', token, ROUNDS);
  console.log('lab_sequential', JSON.stringify(lab));
  const img = await hammer('/me/imaging/bookings', token, ROUNDS);
  console.log('imaging_sequential', JSON.stringify(img));

  const labC = await concurrent('/me/lab/bookings', token, CONCURRENCY);
  console.log('lab_concurrent', JSON.stringify(labC));
  const imgC = await concurrent('/me/imaging/bookings', token, CONCURRENCY);
  console.log('imaging_concurrent', JSON.stringify(imgC));

  await isolation(token, null);

  const totalFail = lab.fail + img.fail + labC.fail + imgC.fail;
  console.log('TOTAL_FAIL', totalFail);
  console.log('AUTHENTICATED_BROWSER_CLICKTHROUGH', 'NOT_COMPLETED');
  console.log('CAN_PRODUCTION_LAUNCH', 'NO');
  if (totalFail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
