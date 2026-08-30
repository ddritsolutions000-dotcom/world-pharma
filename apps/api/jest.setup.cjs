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
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
} catch {
  // CI supplies env vars.
}

require('./src/test/isolate-runtime.cjs').applyTestIsolation();
