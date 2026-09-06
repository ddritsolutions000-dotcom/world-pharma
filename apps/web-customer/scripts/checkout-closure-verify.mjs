/**
 * Customer commerce closure — full API checkout journey (mirrors UI flow).
 * Usage: node apps/web-customer/scripts/checkout-closure-verify.mjs
 */
const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';
const WEB = process.env.E2E_WEB_BASE ?? 'http://localhost:3000';

async function otpCustomer(email) {
  const req = await fetch(`${API}/api/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, purpose: 'REGISTER' }),
  });
  const body = await req.json();
  if (req.status !== 200) throw new Error(`OTP request failed: ${req.status} ${JSON.stringify(body)}`);
  const ver = await fetch(`${API}/api/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge_id: body.challenge_id,
      code: body.dev_code,
      audience: 'customer',
    }),
  });
  const auth = await ver.json();
  if (ver.status !== 200) throw new Error(`OTP verify failed: ${ver.status}`);
  return auth.access_token;
}

async function main() {
  const results = [];
  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, err) => results.push({ name, ok: false, err: String(err) });

  // Country gate page loads
  try {
    const home = await fetch(WEB);
    const html = await home.text();
    if (home.status !== 200) throw new Error(`status ${home.status}`);
    if (/defaulting to india|silent.*india/i.test(html)) throw new Error('India fallback copy found');
    pass('Web home 200, no India fallback copy');
  } catch (e) {
    fail('Web home', e);
  }

  for (const market of ['IN', 'AE', 'US']) {
    try {
      const cat = await fetch(`${API}/api/v1/catalog/items?country=${market}&limit=3`);
      const body = await cat.json();
      if (cat.status !== 200 || !Array.isArray(body.data)) throw new Error(`catalog ${cat.status}`);
      pass(`Catalog ${market}`);
    } catch (e) {
      fail(`Catalog ${market}`, e);
    }
  }

  const email = `closure-${Date.now()}@test.local`;
  let token;
  try {
    token = await otpCustomer(email);
    pass('Customer OTP login');
  } catch (e) {
    fail('Customer OTP login', e);
    printResults(results);
    process.exit(1);
  }

  const auth = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

  for (const market of ['IN']) {
    try {
      const methods = await fetch(`${API}/api/v1/payments/methods?country=${market}`);
      if (methods.status !== 200) throw new Error(`methods ${methods.status}`);
      pass(`Payment methods ${market}`);

      const catalog = await fetch(`${API}/api/v1/catalog/items?country=${market}&limit=5`);
      const items = (await catalog.json()).data ?? [];
      const withOffer = items.find((i) => i.offers?.[0]?.id);
      if (!withOffer) throw new Error('no offer in catalog');

      const offerId = withOffer.offers[0].id;
      const add = await fetch(`${API}/api/v1/me/cart/items?country=${market}`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-${Date.now()}` },
        body: JSON.stringify({ offer_id: offerId, qty: 1 }),
      });
      if (add.status >= 300) throw new Error(`add cart ${add.status}`);

      const session = await fetch(`${API}/api/v1/me/checkout/sessions?country=${market}`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-co-${Date.now()}` },
        body: JSON.stringify({}),
      });
      const sess = await session.json();
      if (session.status >= 300) throw new Error(`checkout start ${session.status}`);

      const addrRes = await fetch(`${API}/api/v1/me/addresses`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-addr-${Date.now()}` },
        body: JSON.stringify({
          country_code: market,
          recipient_name: 'Closure Test',
          line1: '1 Test Street',
          city: market === 'AE' ? 'Dubai' : market === 'US' ? 'Austin' : 'Mumbai',
          postal_code: market === 'AE' ? '00000' : market === 'US' ? '78701' : '400001',
          phone: '+919999999999',
        }),
      });
      const addr = await addrRes.json();
      if (addrRes.status >= 300) throw new Error(`address ${addrRes.status}`);

      const ful = await fetch(`${API}/api/v1/me/checkout/sessions/${sess.id}/fulfillment`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ address_id: addr.id }),
      });
      if (ful.status >= 300) throw new Error(`fulfillment ${ful.status}`);

      const quote = await fetch(`${API}/api/v1/me/checkout/sessions/${sess.id}/quote`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-q-${Date.now()}` },
        body: JSON.stringify({}),
      });
      const quoteBody = await quote.json();
      if (quote.status >= 300) throw new Error(`quote ${quote.status}`);
      if (!quoteBody.quote?.total_minor) throw new Error('missing server total');
      pass(`Checkout quote ${market} total=${quoteBody.quote.total_minor}`);

      const payOk = await fetch(`${API}/api/v1/me/checkout/sessions/${sess.id}/pay`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-pay-ok-${Date.now()}` },
        body: JSON.stringify({ method: 'CARD', scenario: 'success' }),
      });
      const paid = await payOk.json();
      if (payOk.status >= 300 || paid.status !== 'CAPTURED') throw new Error(`pay success ${payOk.status}`);

      const order = await fetch(`${API}/api/v1/me/orders`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-ord-${Date.now()}` },
        body: JSON.stringify({ payment_intent_id: paid.id }),
      });
      const ord = await order.json();
      if (order.status >= 300) throw new Error(`order create ${order.status}`);
      pass(`Order created #${ord.order_number}`);

      const payFail = await fetch(`${API}/api/v1/me/checkout/sessions?country=${market}`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-co2-${Date.now()}` },
        body: JSON.stringify({}),
      });
      const sess2 = await payFail.json();
      await fetch(`${API}/api/v1/me/cart/items?country=${market}`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-add2-${Date.now()}` },
        body: JSON.stringify({ offer_id: offerId, qty: 1 }),
      });
      const addr2Res = await fetch(`${API}/api/v1/me/addresses`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-addr2-${Date.now()}` },
        body: JSON.stringify({
          country_code: market,
          recipient_name: 'Closure Test 2',
          line1: '2 Test Street',
          city: 'Mumbai',
          postal_code: '400001',
          phone: '+919999999999',
        }),
      });
      const addr2 = await addr2Res.json();
      await fetch(`${API}/api/v1/me/checkout/sessions/${sess2.id}/fulfillment`, {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({ address_id: addr2.id }),
      });
      const q2 = await fetch(`${API}/api/v1/me/checkout/sessions/${sess2.id}/quote`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-q2-${Date.now()}` },
        body: JSON.stringify({}),
      });
      if (q2.status >= 300) throw new Error('quote2 failed');
      const failPay = await fetch(`${API}/api/v1/me/checkout/sessions/${sess2.id}/pay`, {
        method: 'POST',
        headers: { ...auth(token), 'Idempotency-Key': `cl-pay-fail-${Date.now()}` },
        body: JSON.stringify({ method: 'CARD', scenario: 'failure' }),
      });
      const failBody = await failPay.json();
      if (failPay.status >= 300 || failBody.status === 'CAPTURED') throw new Error('failure scenario captured');
      pass('Payment failure does not capture');

      const otherEmail = `closure-other-${Date.now()}@test.local`;
      const otherToken = await otpCustomer(otherEmail);
      const denied = await fetch(`${API}/api/v1/me/orders/${ord.id}`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });
      if (denied.status !== 403 && denied.status !== 404) throw new Error(`expected 403/404 got ${denied.status}`);
      pass('Cross-customer order access denied');
    } catch (e) {
      fail(`Checkout flow ${market}`, e);
    }
  }

  printResults(results);
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

function printResults(results) {
  for (const r of results) {
    console.log(r.ok ? `PASS  ${r.name}` : `FAIL  ${r.name}: ${r.err}`);
  }
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} checks passed`);
}

main();
