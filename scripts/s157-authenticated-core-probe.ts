/**
 * S157 — Authenticated core-product probes (sandbox OTP reveal).
 */
const API = process.env.API_BASE ?? 'http://127.0.0.1:4000/api/v1';

async function login(email: string, audience = 'customer') {
  const s = await fetch(`${API}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, purpose: 'LOGIN' }),
  });
  const j = (await s.json()) as { challenge_id?: string; dev_code?: string; code?: string };
  if (!j.challenge_id || !(j.dev_code ?? j.code)) {
    return { error: `otp_unavailable status=${s.status} body=${JSON.stringify(j).slice(0, 200)}` };
  }
  const v = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge_id: j.challenge_id,
      code: j.dev_code ?? j.code,
      audience,
    }),
  });
  const t = (await v.json()) as { access_token?: string };
  if (!t.access_token) {
    return { error: `verify_failed status=${v.status} body=${JSON.stringify(t).slice(0, 200)}` };
  }
  return { token: t.access_token };
}

async function authGet(path: string, token: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 300), has3b001: text.includes('3B001') };
}

async function main() {
  const email = `s157-core-${Date.now()}@example.com`;
  const auth = await login(email);
  if ('error' in auth) {
    console.log(JSON.stringify({ AUTH: 'BLOCKED', detail: auth.error }, null, 2));
    process.exitCode = 2;
    return;
  }
  const token = auth.token!;

  const paths = [
    '/me/orders',
    '/me/cart?country=IN',
    '/me/lab/bookings',
    '/me/imaging/bookings',
    '/me/appointments?country=IN',
    '/catalog/items?country=IN&limit=3',
  ];

  const results: Record<string, unknown> = {};
  for (const p of paths) {
    results[p] = await authGet(p, token);
  }

  // S154 hammer: sequential 30 + concurrent 8 for lab/imaging
  const hammer: Record<string, unknown> = {};
  for (const p of ['/me/lab/bookings', '/me/imaging/bookings'] as const) {
    let fail = 0;
    const statuses: Record<number, number> = {};
    for (let i = 0; i < 30; i++) {
      const r = await authGet(p, token);
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      if (r.status >= 500 || r.has3b001) fail++;
    }
    const conc = await Promise.all(Array.from({ length: 8 }, () => authGet(p, token)));
    const concFail = conc.filter((r) => r.status >= 500 || r.has3b001).length;
    hammer[p] = {
      sequential_30: { statuses, fail },
      concurrent_8: {
        statuses: conc.reduce(
          (acc, r) => {
            acc[r.status] = (acc[r.status] ?? 0) + 1;
            return acc;
          },
          {} as Record<number, number>,
        ),
        fail: concFail,
      },
    };
  }

  // Rx forge gate via cart quote path: attach forged case on rx item if catalog has one
  const catalog = await authGet('/catalog/items?country=IN&limit=20', token);
  let rxGate: unknown = 'skipped_no_rx_offer';
  try {
    const parsed = JSON.parse(catalog.body) as {
      data?: Array<{ offers?: Array<{ id: string; rx_required?: boolean }> }>;
    };
    const rxOffer = parsed.data
      ?.flatMap((i) => i.offers ?? [])
      .find((o) => o.rx_required);
    if (rxOffer) {
      await fetch(`${API}/me/cart/items?country=IN`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `s157-rx-${Date.now()}`,
        },
        body: JSON.stringify({
          offer_id: rxOffer.id,
          qty: 1,
          prescription_case_id: '00000000-0000-7000-8000-000000000099',
        }),
      });
      const co = await fetch(`${API}/me/checkout/sessions?country=IN`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `s157-co-${Date.now()}`,
        },
        body: JSON.stringify({}),
      });
      const coBody = await co.text();
      rxGate = {
        status: co.status,
        code: (() => {
          try {
            return (JSON.parse(coBody) as { code?: string }).code;
          } catch {
            return null;
          }
        })(),
        blocked: co.status === 422,
      };
    }
  } catch (e) {
    rxGate = { error: String(e) };
  }

  // Wrong path for viewer — expect 404 (route missing), not frame leak
  const wrongViewer = await authGet(
    '/me/imaging/studies/00000000-0000-7000-8000-000000000001/frames/0',
    token,
  );

  console.log(
    JSON.stringify(
      {
        email,
        auth: 'OK',
        results,
        hammer,
        rx_forge_gate: rxGate,
        wrong_viewer_path: wrongViewer,
        AUTHENTICATED_BROWSER_CLICKTHROUGH: 'NOT_COMPLETED',
      },
      null,
      2,
    ),
  );

  const hammerFail = Object.values(hammer).some(
    (h) =>
      (h as { sequential_30: { fail: number }; concurrent_8: { fail: number } }).sequential_30.fail >
        0 ||
      (h as { sequential_30: { fail: number }; concurrent_8: { fail: number } }).concurrent_8.fail > 0,
  );
  if (hammerFail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
