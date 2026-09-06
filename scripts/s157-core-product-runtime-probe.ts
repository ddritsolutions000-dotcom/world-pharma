/**
 * S157 — Core product real-use HTTP probes (sandbox).
 * Auth-required journeys record AUTH_BLOCKED when OTP fixtures are unavailable.
 * Does not claim PASS from 200 alone for authenticated flows.
 */
const API = process.env.API_BASE ?? 'http://127.0.0.1:4000';
const CUSTOMER = process.env.CUSTOMER_WEB ?? 'http://127.0.0.1:3000';
const ADMIN = process.env.ADMIN_WEB ?? 'http://127.0.0.1:3001';
const AFFILIATE = process.env.AFFILIATE_WEB ?? 'http://127.0.0.1:3010';

type Probe = { name: string; ok: boolean; detail: string };

async function hit(url: string, init?: RequestInit): Promise<{ status: number; body: string }> {
  const res = await fetch(url, init);
  const body = await res.text();
  return { status: res.status, body: body.slice(0, 400) };
}

async function main() {
  const probes: Probe[] = [];

  const health = await hit(`${API}/health`);
  probes.push({
    name: 'api_health',
    ok: health.status === 200,
    detail: `status=${health.status}`,
  });

  for (const [name, url] of [
    ['customer_web', CUSTOMER],
    ['admin_web', ADMIN],
    ['affiliate_web', AFFILIATE],
  ] as const) {
    const r = await hit(url);
    probes.push({ name, ok: r.status === 200, detail: `status=${r.status}` });
  }

  const unauth = [
    ['me_orders', `${API}/api/v1/me/orders`],
    ['me_lab', `${API}/api/v1/me/lab/bookings`],
    ['me_imaging', `${API}/api/v1/me/imaging/bookings`],
    ['me_cart', `${API}/api/v1/me/cart?country=IN`],
    ['me_affiliate', `${API}/api/v1/me/affiliate/stats`],
    ['viewer_frame', `${API}/api/v1/me/imaging/studies/00000000-0000-7000-8000-000000000001/frames/0`],
  ] as const;
  for (const [name, url] of unauth) {
    const r = await hit(url);
    const ok = r.status === 401 || r.status === 403;
    probes.push({
      name: `unauth_${name}`,
      ok,
      detail: `expected 401/403 got ${r.status}`,
    });
  }

  // Public/catalog discovery (country-scoped; may 404 country or return empty)
  for (const [name, path] of [
    ['catalog_browse', '/api/v1/catalog/items?country=IN&limit=5'],
    ['lab_offers', '/api/v1/lab/offers?country=IN'],
    ['imaging_offers', '/api/v1/imaging/offers?country=IN'],
    ['doctors', '/api/v1/doctors?country=IN'],
  ] as const) {
    const r = await hit(`${API}${path}`);
    probes.push({
      name: `public_${name}`,
      ok: r.status === 200 || r.status === 404 || r.status === 422,
      detail: `status=${r.status}`,
    });
  }

  // S154-style concurrent unauthenticated list probes (must stay auth-fail, not 500)
  const concurrent = await Promise.all(
    Array.from({ length: 20 }, () => hit(`${API}/api/v1/me/lab/bookings`)),
  );
  const bad = concurrent.filter((r) => r.status >= 500 || r.body.includes('3B001'));
  probes.push({
    name: 'concurrent_lab_list_unauth_no_500',
    ok: bad.length === 0 && concurrent.every((r) => r.status === 401 || r.status === 403),
    detail: `statuses=${[...new Set(concurrent.map((r) => r.status))].join(',')}`,
  });

  const concurrentImg = await Promise.all(
    Array.from({ length: 20 }, () => hit(`${API}/api/v1/me/imaging/bookings`)),
  );
  const badImg = concurrentImg.filter((r) => r.status >= 500 || r.body.includes('3B001'));
  probes.push({
    name: 'concurrent_imaging_list_unauth_no_500',
    ok: badImg.length === 0 && concurrentImg.every((r) => r.status === 401 || r.status === 403),
    detail: `statuses=${[...new Set(concurrentImg.map((r) => r.status))].join(',')}`,
  });

  const failed = probes.filter((p) => !p.ok);
  console.log(JSON.stringify({ probes, failed: failed.length, AUTHENTICATED_BROWSER: 'NOT_COMPLETED' }, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
