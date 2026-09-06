/**
 * Authenticated Super Admin runtime verification.
 * Usage: node apps/web-admin/scripts/authenticated-admin-pass.mjs
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';
const WEB = process.env.E2E_ADMIN_BASE ?? 'http://localhost:3001';

async function otpAdmin() {
  const email = `admin-pass-${Date.now()}@test.local`;
  // Prefer sandbox admin; fall back to fresh register if rate-limited.
  for (const identifier of ['sandbox-admin@dev.local', email]) {
    const req = await fetch(`${API}/api/v1/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, purpose: 'REGISTER' }),
    });
    const body = await req.json();
    if (req.status === 429) continue;
    if (req.status !== 200) throw new Error(`OTP request ${req.status}`);
    const ver = await fetch(`${API}/api/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge_id: body.challenge_id,
        code: body.dev_code,
        audience: 'admin',
      }),
    });
    const auth = await ver.json();
    if (ver.status === 200 && auth.access_token) return { token: auth.access_token, identifier };
  }
  throw new Error('Could not obtain admin token (OTP rate limit or auth failure)');
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
    return true;
  } catch (e) {
    console.log(`FAIL  ${name}: ${e.message || e}`);
    return false;
  }
}

async function main() {
  let pass = 0;
  let total = 0;
  const run = async (name, fn) => {
    total += 1;
    if (await check(name, fn)) pass += 1;
  };

  await run('API health', async () => {
    const r = await fetch(`${API}/health/ready`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });

  await run('Admin web up', async () => {
    const r = await fetch(`${WEB}/login`);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });

  let token;
  await run('Admin OTP login', async () => {
    const row = await otpAdmin();
    token = row.token;
  });
  if (!token) {
    console.log(`\n${pass}/${total} (aborted — no token)`);
    process.exit(1);
  }

  const h = auth(token);

  // Negative auth
  await run('Unauthenticated admin orders → 401', async () => {
    const r = await fetch(`${API}/api/v1/admin/orders`);
    if (r.status !== 401) throw new Error(`expected 401 got ${r.status}`);
  });

  // Core domains
  const ok200 = async (label, path) => {
    await run(label, async () => {
      const r = await fetch(`${API}${path}`, { headers: h });
      if (r.status !== 200) {
        const t = await r.text();
        throw new Error(`${r.status} ${t.slice(0, 160)}`);
      }
    });
  };

  await ok200('Me profile', '/api/v1/me');
  await ok200('Orders', '/api/v1/admin/orders');
  await ok200('Shipments', '/api/v1/admin/shipments');
  await ok200('Carriers', '/api/v1/admin/shipments/carriers');
  await ok200('Delivery jobs', '/api/v1/admin/delivery/jobs');
  await ok200('Partners', '/api/v1/admin/partners/applications');
  await ok200('Finance dashboard', '/api/v1/admin/finance/dashboard');
  await ok200('Payments', '/api/v1/admin/payments?limit=5');
  await ok200('CMS content IN', '/api/v1/admin/cms/content?country_code=IN');
  await ok200('Policy packs IN', '/api/v1/admin/policy-packs?country=IN');
  await ok200('Support queues', '/api/v1/admin/support/queues');
  await ok200('Control plane', '/api/v1/admin/control-plane/snapshot');
  await ok200('Doctors', '/api/v1/admin/doctors?limit=5');
  await ok200('Labs', '/api/v1/admin/labs?limit=5');
  await ok200('Prescriptions', '/api/v1/admin/prescriptions?limit=5');
  await ok200('Appointments', '/api/v1/admin/appointments?limit=5');
  await ok200('Loyalty programs', '/api/v1/admin/loyalty/programs?country_code=IN');
  await ok200('Security events', '/api/v1/admin/security-events?limit=5');

  await run('Carriers include INDIA_POST+DHL', async () => {
    const r = await fetch(`${API}/api/v1/admin/shipments/carriers`, { headers: h });
    const body = await r.json();
    const codes = (body.data ?? []).map((x) => x.code);
    if (!codes.includes('INDIA_POST') || !codes.includes('DHL')) throw new Error(codes.join(','));
  });

  await run('Analytics without country → clear reject', async () => {
    const r = await fetch(`${API}/api/v1/admin/analytics/overview`, { headers: h });
    if (r.status !== 400 && r.status !== 403) throw new Error(`expected 400/403 got ${r.status}`);
  });

  await run('CRM without country → clear reject', async () => {
    const r = await fetch(`${API}/api/v1/admin/crm/customers?limit=5`, { headers: h });
    if (r.status !== 400 && r.status !== 403) throw new Error(`expected 400/403 got ${r.status}`);
  });

  // Authenticated page shells (cookie-less still redirect; verify route compiles)
  for (const path of ['/', '/orders', '/logistics', '/catalog', '/finance', '/payments', '/cms', '/crm', '/analytics', '/partners', '/security']) {
    await run(`Route shell ${path}`, async () => {
      const r = await fetch(`${WEB}${path}`, { redirect: 'manual' });
      if (![200, 307, 308].includes(r.status)) throw new Error(`status ${r.status}`);
    });
  }

  console.log(`\n=== AUTHENTICATED PASS: ${pass}/${total} ===`);
  process.exit(pass === total ? 0 : 1);
}

main();
