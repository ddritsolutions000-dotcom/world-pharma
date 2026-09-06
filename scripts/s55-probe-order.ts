async function main() {
  const req = await fetch('http://127.0.0.1:4000/api/v1/auth/otp/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'sandbox-customer@dev.local', purpose: 'LOGIN' }),
  });
  const j = (await req.json()) as { challenge_id?: string; dev_code?: string };
  console.log('otp', j);
  const v = await fetch('http://127.0.0.1:4000/api/v1/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: j.challenge_id, code: j.dev_code, audience: 'customer' }),
  });
  const t = (await v.json()) as { access_token?: string; code?: string; detail?: string };
  console.log('verify', v.status, t.code ?? (t.access_token ? 'token_ok' : t.detail));
  const token = t.access_token;
  if (!token) return;
  for (const id of ['DEMO-SBX-REORDER-IN', 'WP-IN-87A48F6287']) {
    const o = await fetch(`http://127.0.0.1:4000/api/v1/me/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await o.text();
    console.log(id, o.status, text.slice(0, 400));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
