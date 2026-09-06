/**
 * Customer Store runtime smoke — key public routes + checkout closure subset.
 * Usage: node apps/web-customer/scripts/customer-store-smoke.mjs
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';
const WEB = process.env.E2E_WEB_BASE ?? 'http://localhost:3000';

const ROUTES = ['/', '/search', '/categories', '/cart', '/login', '/help', '/track-order'];

async function main() {
  const results = [];
  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, err) => results.push({ name, ok: false, err: String(err) });

  for (const route of ROUTES) {
    try {
      const res = await fetch(`${WEB}${route}`);
      if (res.status >= 500) throw new Error(`status ${res.status}`);
      pass(`GET ${route} → ${res.status}`);
    } catch (e) {
      fail(`GET ${route}`, e);
    }
  }

  for (const market of ['IN', 'AE', 'US']) {
    try {
      const res = await fetch(`${API}/api/v1/catalog/items?country=${market}&limit=2`);
      const body = await res.json();
      if (res.status !== 200 || !Array.isArray(body.data)) throw new Error(`catalog ${res.status}`);
      pass(`API catalog ${market}`);
    } catch (e) {
      fail(`API catalog ${market}`, e);
    }
  }

  try {
    const home = await fetch(WEB);
    const html = await home.text();
    if (home.status !== 200) throw new Error(`status ${home.status}`);
    if (/Internal Server Error|Application error/i.test(html)) throw new Error('error page HTML');
    pass('Home HTML clean');
  } catch (e) {
    fail('Home HTML clean', e);
  }

  for (const r of results) {
    console.log(r.ok ? `PASS  ${r.name}` : `FAIL  ${r.name}: ${r.err}`);
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} checks passed`);
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main();
