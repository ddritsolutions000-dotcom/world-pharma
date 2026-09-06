import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');

function scoreLan(address) {
  if (address.startsWith('192.168.160.')) {
    return 0;
  }
  if (address.startsWith('192.168.')) {
    return 3;
  }
  if (address.startsWith('10.') && address !== '10.0.2.2') {
    return 2;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) {
    return 1;
  }
  return 0;
}

function lanIPv4() {
  const fromEnv = (process.env.EXPO_PUBLIC_LAN_IP ?? '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  const candidates = [];
  const nets = os.networkInterfaces();
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs ?? []) {
      const family = addr.family === 'IPv4' || addr.family === 4;
      if (!family || addr.internal) {
        continue;
      }
      if (addr.address.startsWith('169.254.')) {
        continue;
      }
      candidates.push(addr.address);
    }
  }
  candidates.sort((a, b) => scoreLan(b) - scoreLan(a));
  return candidates[0] ?? '';
}

const appEnv = (process.env.EXPO_PUBLIC_APP_ENV ?? 'local').trim().toLowerCase();
if (appEnv === 'production') {
  console.error('Refusing to start the Expo development runtime with EXPO_PUBLIC_APP_ENV=production.');
  process.exit(1);
}

if (!process.env.EXPO_PUBLIC_API_BASE_URL?.trim()) {
  const ip = lanIPv4();
  if (!ip) {
    console.error(
      'No LAN IPv4 found. Set EXPO_PUBLIC_API_BASE_URL (e.g. http://192.168.1.10:4000) or EXPO_PUBLIC_LAN_IP.',
    );
    process.exit(1);
  }
  process.env.EXPO_PUBLIC_API_BASE_URL = `http://${ip}:4000`;
}

process.env.EXPO_PUBLIC_APP_ENV = appEnv || 'local';
const port = process.env.EXPO_PORT ?? '8081';

console.log(
  JSON.stringify({
    event: 'expo_lan_start',
    app_env: process.env.EXPO_PUBLIC_APP_ENV,
    api_base_url: process.env.EXPO_PUBLIC_API_BASE_URL,
    metro_port: port,
  }),
);

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'start', '--lan', '--port', port],
  {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
    shell: true,
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
