/**
 * Super Admin full smoke test — routes + API endpoints.
 * Usage: node apps/web-admin/scripts/super-admin-smoke.mjs
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';
const WEB = process.env.E2E_ADMIN_BASE ?? 'http://localhost:3001';

const ROUTES = [
  '/',
  '/login',
  '/approvals',
  '/countries',
  '/security',
  '/security/admins',
  '/storefront',
  '/storefront/chrome',
  '/catalog',
  '/inventory',
  '/payments',
  '/orders',
  '/logistics',
  '/finance',
  '/marketplace',
  '/delivery',
  '/search',
  '/doctors',
  '/labs',
  '/imaging',
  '/appointments',
  '/prescriptions',
  '/video-sessions',
  '/refills',
  '/dispensing',
  '/care-plans',
  '/health-packages',
  '/speciality-care',
  '/corporate',
  '/substitutes',
  '/serviceability',
  '/store-locator',
  '/identity',
  '/company-authority',
  '/policy-packs',
  '/organizations',
  '/partners',
  '/regions',
  '/legal-entities',
  '/business-units',
  '/audit',
  '/governance/health/consents',
  '/governance/health/access-audits',
  '/governance/health/break-glass',
  '/governance/care-nav',
  '/cms',
  '/cms/blog',
  '/cms/legal',
  '/cms/faq',
  '/cms/health',
  '/cms/pages',
  '/cms/media',
  '/seo',
  '/notifications',
  '/support',
  '/crm',
  '/crm/automation',
  '/marketing',
  '/analytics',
  '/analytics/commerce',
  '/analytics/marketing',
  '/promo',
  '/loyalty',
  '/affiliates',
  '/reviews',
];

const API_CHECKS = [
  { name: 'Health ready', path: '/health/ready', auth: false, expect: (s) => s === 200 },
  { name: 'Admin orders', path: '/api/v1/admin/orders', auth: true },
  { name: 'Admin shipments', path: '/api/v1/admin/shipments', auth: true },
  { name: 'Admin carriers', path: '/api/v1/admin/shipments/carriers', auth: true },
  { name: 'Admin delivery jobs', path: '/api/v1/admin/delivery/jobs', auth: true },
  { name: 'Admin catalog items', path: '/api/v1/admin/catalog/items?country=IN&limit=5', auth: true },
  { name: 'Admin inventory', path: '/api/v1/admin/inventory/summary?country=IN', auth: true },
  { name: 'Admin partners', path: '/api/v1/admin/partners/applications', auth: true },
  { name: 'Admin finance dashboard', path: '/api/v1/admin/finance/dashboard', auth: true },
  { name: 'Admin payments', path: '/api/v1/admin/payments/intents?limit=5', auth: true },
  { name: 'Admin CMS content', path: '/api/v1/admin/cms/content', auth: true },
  { name: 'Admin CRM customers', path: '/api/v1/admin/crm/customers?limit=5', auth: true },
  { name: 'Admin support queues', path: '/api/v1/admin/support/queues', auth: true },
  { name: 'Admin analytics overview', path: '/api/v1/admin/analytics/overview?country=IN', auth: true },
  { name: 'Admin policy packs', path: '/api/v1/admin/policy-packs', auth: true },
  { name: 'Admin security events', path: '/api/v1/admin/security-events?limit=5', auth: true },
  { name: 'Admin doctors', path: '/api/v1/admin/doctors?limit=5', auth: true },
  { name: 'Admin labs', path: '/api/v1/admin/labs?limit=5', auth: true },
  { name: 'Admin prescriptions', path: '/api/v1/admin/prescriptions?limit=5', auth: true },
  { name: 'Admin appointments', path: '/api/v1/admin/appointments?limit=5', auth: true },
  { name: 'Admin marketing segments', path: '/api/v1/admin/marketing/segments', auth: true },
  { name: 'Admin promo campaigns', path: '/api/v1/admin/promo/campaigns', auth: true },
  { name: 'Admin loyalty programs', path: '/api/v1/admin/loyalty/programs', auth: true },
  { name: 'Admin reviews', path: '/api/v1/admin/reviews?limit=5', auth: true },
  { name: 'Admin notifications inbox', path: '/api/v1/me/notifications/inbox', auth: true },
  { name: 'Admin me profile', path: '/api/v1/me', auth: true },
  { name: 'Serviceability IN', path: '/api/v1/admin/shipments/serviceability?country=IN&postal_code=400001', auth: true },
  { name: 'Control plane snapshot', path: '/api/v1/admin/control-plane/snapshot', auth: true },
];

async function otpAdmin() {
  const req = await fetch(`${API}/api/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'sandbox-admin@dev.local', purpose: 'REGISTER' }),
  });
  const body = await req.json();
  if (req.status === 429) {
    throw new Error(`OTP rate limited: ${body.detail ?? req.status}`);
  }
  if (req.status !== 200) throw new Error(`OTP request ${req.status}`);
  const ver = await fetch(`${API}/api/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: body.challenge_id, code: body.dev_code, audience: 'admin' }),
  });
  const auth = await ver.json();
  if (ver.status !== 200) throw new Error(`OTP verify ${ver.status}`);
  return auth.access_token;
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

async function main() {
  const routes = [];
  const apis = [];
  let token = null;

  for (const path of ROUTES) {
    try {
      const res = await fetch(`${WEB}${path}`, { redirect: 'manual' });
      const ok = res.status === 200 || res.status === 307 || res.status === 308;
      routes.push({ path, status: res.status, ok, note: res.status === 307 ? 'redirect' : '' });
    } catch (e) {
      routes.push({ path, status: 0, ok: false, note: String(e) });
    }
  }

  try {
    token = await otpAdmin();
    apis.push({ name: 'Admin OTP login', ok: true, status: 200 });
  } catch (e) {
    apis.push({ name: 'Admin OTP login', ok: false, status: 0, note: String(e) });
  }

  for (const check of API_CHECKS) {
    try {
      const res = await fetch(`${API}${check.path}`, {
        headers: check.auth && token ? headers(token) : { Accept: 'application/json' },
      });
      const expect = check.expect ?? ((s) => s === 200);
      const ok = expect(res.status);
      apis.push({ name: check.name, ok, status: res.status, path: check.path });
    } catch (e) {
      apis.push({ name: check.name, ok: false, status: 0, note: String(e), path: check.path });
    }
  }

  // Carrier booking evidence
  if (token) {
    try {
      const res = await fetch(`${API}/api/v1/admin/shipments/carriers`, { headers: headers(token) });
      const body = await res.json();
      const codes = (body.data ?? []).map((r) => r.code);
      apis.push({
        name: 'Carriers include INDIA_POST+DHL',
        ok: codes.includes('INDIA_POST') && codes.includes('DHL'),
        status: res.status,
        note: codes.join(', '),
      });
      const ships = await fetch(`${API}/api/v1/admin/shipments`, { headers: headers(token) });
      const shipBody = await ships.json();
      const booked = (shipBody.data ?? []).filter((s) => s.carrier && s.status !== 'DRAFT');
      apis.push({
        name: 'Shipments with carrier booked',
        ok: booked.length > 0,
        status: ships.status,
        note: `${booked.length} booked (${booked.map((s) => s.carrier).slice(0, 3).join(', ')})`,
      });
    } catch (e) {
      apis.push({ name: 'Carrier evidence', ok: false, note: String(e) });
    }
  }

  const routeOk = routes.filter((r) => r.ok).length;
  const apiOk = apis.filter((a) => a.ok).length;
  const report = {
    timestamp: new Date().toISOString(),
    routes: { total: routes.length, pass: routeOk, fail: routes.length - routeOk, items: routes },
    apis: { total: apis.length, pass: apiOk, fail: apis.length - apiOk, items: apis },
    unitTests: { note: 'Run separately: npx jest --config jest.config.cts' },
  };

  console.log(JSON.stringify(report, null, 2));
  console.log(`\n=== SUMMARY ===`);
  console.log(`Routes: ${routeOk}/${routes.length} OK`);
  console.log(`APIs:   ${apiOk}/${apis.length} OK`);
  const failedRoutes = routes.filter((r) => !r.ok);
  const failedApis = apis.filter((a) => !a.ok);
  if (failedRoutes.length) {
    console.log(`\nFailed routes:`);
    for (const r of failedRoutes) console.log(`  ${r.path} → ${r.status} ${r.note}`);
  }
  if (failedApis.length) {
    console.log(`\nFailed APIs:`);
    for (const a of failedApis) console.log(`  ${a.name} → ${a.status} ${a.note ?? ''}`);
  }
  process.exit(failedRoutes.length || failedApis.length ? 1 : 0);
}

main();
