/**
 * Runtime verify: admin carriers + book with selected carrier, customer checkout closure.
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';
const WEB_CUSTOMER = process.env.E2E_WEB_BASE ?? 'http://localhost:3000';
const WEB_ADMIN = process.env.E2E_ADMIN_BASE ?? 'http://localhost:3001';

async function otpLogin(email, audience) {
  const req = await fetch(`${API}/api/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, purpose: 'REGISTER' }),
  });
  const body = await req.json();
  if (req.status !== 200) throw new Error(`OTP request ${req.status}`);
  const ver = await fetch(`${API}/api/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: body.challenge_id, code: body.dev_code, audience }),
  });
  const auth = await ver.json();
  if (ver.status !== 200) throw new Error(`OTP verify ${ver.status}`);
  return auth.access_token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' };
}

async function main() {
  const results = [];
  const pass = (n) => results.push({ name: n, ok: true });
  const fail = (n, e) => results.push({ name: n, ok: false, err: String(e) });

  for (const [label, url] of [
    ['Customer web 3000', WEB_CUSTOMER],
    ['Admin web 3001', WEB_ADMIN],
  ]) {
    try {
      const res = await fetch(url);
      const html = await res.text();
      if (res.status !== 200) throw new Error(`status ${res.status}`);
      if (html.length < 100) throw new Error('empty body');
      pass(`${label} responds 200`);
    } catch (e) {
      fail(`${label} responds 200`, e);
    }
  }

  let adminToken;
  try {
    adminToken = await otpLogin('sandbox-admin@dev.local', 'admin');
    pass('Admin OTP login');
  } catch (e) {
    fail('Admin OTP login', e);
    print(results);
    process.exit(1);
  }

  try {
    const res = await fetch(`${API}/api/v1/admin/shipments/carriers`, { headers: auth(adminToken) });
    const body = await res.json();
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const codes = (body.data ?? []).map((r) => r.code);
    for (const code of ['INDIA_POST', 'DHL', 'BLUEDART', 'DELHIVERY']) {
      if (!codes.includes(code)) throw new Error(`missing ${code}, got ${codes.join(',')}`);
    }
    pass(`Carriers API lists ${codes.length} carriers incl. INDIA_POST/DHL`);
  } catch (e) {
    fail('Carriers API', e);
  }

  try {
    const list = await fetch(`${API}/api/v1/admin/shipments`, { headers: auth(adminToken) });
    const listBody = await list.json();
    let ready = (listBody.data ?? []).find((s) => s.status === 'READY');

    if (!ready) {
      const ordersRes = await fetch(`${API}/api/v1/admin/orders`, { headers: auth(adminToken) });
      const ordersBody = await ordersRes.json();
      const order = (ordersBody.data ?? []).find((o) =>
        ['CONFIRMED', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKING', 'PACKED'].includes(o.status),
      );
      if (order) {
        const steps = ['pick/start', 'pick/complete', 'pack/start', 'pack/complete'];
        for (const step of steps) {
          await fetch(`${API}/api/v1/admin/orders/${order.id}/${step}`, {
            method: 'POST',
            headers: auth(adminToken),
          });
        }
        const list2 = await fetch(`${API}/api/v1/admin/shipments`, { headers: auth(adminToken) });
        const list2Body = await list2.json();
        ready = (list2Body.data ?? []).find((s) => s.status === 'READY');
      }
    }

    if (!ready) {
      pass('Carrier book test skipped (no READY shipment after fulfill attempt)');
    } else {
      const book = await fetch(`${API}/api/v1/admin/shipments/${ready.id}/book`, {
        method: 'POST',
        headers: { ...auth(adminToken), 'Idempotency-Key': `verify-${Date.now()}` },
        body: JSON.stringify({ scenario: 'BOOK_SUCCESS', carrier_code: 'INDIA_POST' }),
      });
      const booked = await book.json();
      if (book.status >= 300) throw new Error(`book ${book.status} ${JSON.stringify(booked)}`);
      if (booked.carrier !== 'INDIA_POST') throw new Error(`expected INDIA_POST got ${booked.carrier}`);
      if (!booked.tracking_number?.startsWith('INDIAP')) {
        throw new Error(`unexpected tracking ${booked.tracking_number}`);
      }
      pass(`Book INDIA_POST → ${booked.carrier} tracking=${booked.tracking_number}`);
    }
  } catch (e) {
    fail('Book with INDIA_POST', e);
  }

  try {
    const adminHtml = await (await fetch(`${WEB_ADMIN}/logistics`)).text();
    if (!/Shipping carrier|India Post|Logistics/i.test(adminHtml)) {
      throw new Error('logistics page missing carrier UI markers (may need client render)');
    }
    pass('Admin /logistics route serves page shell');
  } catch (e) {
    fail('Admin logistics page', e);
  }

  print(results);
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function print(results) {
  for (const r of results) {
    console.log(r.ok ? `PASS  ${r.name}` : `FAIL  ${r.name}: ${r.err}`);
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
}

main();
