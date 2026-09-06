const API = 'http://127.0.0.1:4000/api/v1';

async function login(email: string, audience: string) {
  const s = await fetch(`${API}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, purpose: 'LOGIN' }),
  });
  const j = (await s.json()) as { challenge_id?: string; dev_code?: string; code?: string };
  console.log('start', email, s.status, j.dev_code ? 'code' : j.code);
  const v = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: j.challenge_id, code: j.dev_code, audience }),
  });
  const t = (await v.json()) as { access_token?: string; code?: string; detail?: string };
  console.log('verify', email, audience, v.status, t.access_token ? 'OK' : t.code ?? t.detail);
  return t.access_token;
}

async function main() {
  const tok = await login('sandbox-doctor@dev.local', 'doctor');
  if (tok) {
    const me = await fetch(`${API}/doctor/me`, { headers: { Authorization: `Bearer ${tok}` } });
    console.log('doctor/me', me.status, (await me.text()).slice(0, 400));
  }
  const lab = await login('sandbox-lab@dev.local', 'customer');
  if (lab) {
    const orgs = await fetch(`${API}/lab/organizations`, { headers: { Authorization: `Bearer ${lab}` } });
    console.log('lab orgs', orgs.status, (await orgs.text()).slice(0, 400));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
