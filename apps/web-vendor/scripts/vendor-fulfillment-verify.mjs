/**
 * Vendor fulfillment lifecycle smoke — requires API + seeded vendor/customer sandbox.
 * Usage: node apps/web-vendor/scripts/vendor-fulfillment-verify.mjs
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';

async function otpLogin(email) {
  const req = await fetch(`${API}/api/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, purpose: 'REGISTER' }),
  });
  const challenge = await req.json();
  const ver = await fetch(`${API}/api/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge_id: challenge.challenge_id,
      code: challenge.dev_code,
      audience: 'customer',
    }),
  });
  const body = await ver.json();
  return body.access_token;
}

async function main() {
  const results = [];
  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, err) => results.push({ name, ok: false, err: String(err) });

  try {
    const health = await fetch(`${API}/health`);
    if (!health.ok) throw new Error(`API health ${health.status}`);
    pass('API health');
  } catch (e) {
    fail('API health', e);
  }

  for (const r of results) {
    console.log(r.ok ? `PASS  ${r.name}` : `FAIL  ${r.name}: ${r.err}`);
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks (extend with full lifecycle when sandbox seed email is configured)`);
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main();
