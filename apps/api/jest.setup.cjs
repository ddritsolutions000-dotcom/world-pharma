const fs = require('node:fs');
const path = require('node:path');

try {
  const src = fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1).trim();
    // Prefer process env (CI / local overrides) over .env defaults.
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
} catch {
  // CI supplies env vars.
}

require('./src/test/isolate-runtime.cjs').applyTestIsolation();
process.env.NODE_ENV = 'test';
process.env.DEV_SANDBOX_SEED = 'false';
process.env.AUTH_DEV_REVEAL_OTP = process.env.AUTH_DEV_REVEAL_OTP ?? 'true';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-must-be-32-chars-min';
process.env.OTP_PEPPER = process.env.OTP_PEPPER ?? 'test-otp-pepper-must-be-32-chars-minx';
