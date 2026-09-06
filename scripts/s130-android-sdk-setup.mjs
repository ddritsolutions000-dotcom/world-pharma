/**
 * Sprint 130 — install Android command-line SDK locally (no Android Studio required).
 * Writes sdk to %LOCALAPPDATA%/Android/Sdk (Windows) or ~/Android/Sdk.
 * Does not commit SDK files. Does not log secrets.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const SDK_ROOT =
  process.env.ANDROID_HOME?.trim() ||
  process.env.ANDROID_SDK_ROOT?.trim() ||
  (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Android', 'Sdk')
    : path.join(os.homedir(), 'Android', 'Sdk'));

const TOOLS_URL = 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip';
const PACKAGES = [
  'platform-tools',
  'platforms;android-35',
  'build-tools;35.0.0',
  'cmdline-tools;latest',
];

function run(cmd, args, opts = {}) {
  const quoted = process.platform === 'win32' ? args.map((a) => (/\s|;/.test(a) ? `"${a}"` : a)) : args;
  const res = spawnSync(cmd, quoted, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsVerbatimArguments: process.platform === 'win32',
    env: { ...process.env, ...opts.env },
    cwd: opts.cwd,
    timeout: opts.timeout ?? 600_000,
    input: opts.input,
  });
  return res;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          file.close();
          fs.unlinkSync(dest);
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`download HTTP ${res.statusCode}`));
          return;
        }
        pipeline(res, file).then(resolve, reject);
      })
      .on('error', reject);
  });
}

const javaHome = process.env.JAVA_HOME?.trim() || 'C:\\Program Files\\Java\\jdk-17';
if (!fs.existsSync(javaHome)) {
  console.error(JSON.stringify({ event: 'java_missing', javaHome }));
  process.exit(1);
}

fs.mkdirSync(SDK_ROOT, { recursive: true });
const toolsLatest = path.join(SDK_ROOT, 'cmdline-tools', 'latest');
const sdkmanager = path.join(
  toolsLatest,
  'bin',
  process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager',
);

if (!fs.existsSync(sdkmanager)) {
  const zipPath = path.join(os.tmpdir(), 'commandlinetools-win-s130.zip');
  console.log(JSON.stringify({ event: 'download_cmdline_tools', url: TOOLS_URL, dest: zipPath }));
  await download(TOOLS_URL, zipPath);
  const extractDir = path.join(os.tmpdir(), 's130-cmdline-tools');
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  const unzip = spawnSync('tar', ['-xf', zipPath, '-C', extractDir], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (unzip.status !== 0) {
    console.error(unzip.stderr || unzip.stdout || 'tar unzip failed');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(toolsLatest), { recursive: true });
  fs.rmSync(toolsLatest, { recursive: true, force: true });
  const nested = path.join(extractDir, 'cmdline-tools');
  fs.renameSync(nested, toolsLatest);
  console.log(JSON.stringify({ event: 'cmdline_tools_installed', path: toolsLatest }));
}

const env = {
  JAVA_HOME: javaHome,
  ANDROID_HOME: SDK_ROOT,
  ANDROID_SDK_ROOT: SDK_ROOT,
};

const yes = `${'y\n'.repeat(200)}`;
console.log(JSON.stringify({ event: 'sdkmanager_licenses', sdkRoot: SDK_ROOT }));
const lic = run(sdkmanager, [`--sdk_root=${SDK_ROOT}`, '--licenses'], { env, input: yes, timeout: 180_000 });
console.log((lic.stdout ?? '').slice(-800));
if (lic.stderr) {
  console.error((lic.stderr ?? '').slice(-800));
}

console.log(JSON.stringify({ event: 'sdkmanager_install', packages: PACKAGES }));
const inst = run(sdkmanager, [`--sdk_root=${SDK_ROOT}`, ...PACKAGES], { env, timeout: 900_000 });
console.log((inst.stdout ?? '').slice(-2000));
if (inst.status !== 0) {
  console.error((inst.stderr ?? '').slice(0, 4000));
  process.exit(inst.status ?? 1);
}

const adb = path.join(SDK_ROOT, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const adbVer = run(adb, ['version'], { env });
const out = {
  ANDROID_HOME: SDK_ROOT,
  ANDROID_SDK_ROOT: SDK_ROOT,
  JAVA_HOME: javaHome,
  adb: adb,
  adb_version: (adbVer.stdout || adbVer.stderr || '').trim().split('\n')[0],
  sdkmanager_status: inst.status,
};
console.log(JSON.stringify({ event: 'android_sdk_ready', ...out }, null, 2));
fs.mkdirSync(path.join(process.cwd(), 'apps/test-results/s130-mobile-runtime'), { recursive: true });
fs.writeFileSync(
  path.join(process.cwd(), 'apps/test-results/s130-mobile-runtime/android-sdk.json'),
  JSON.stringify(out, null, 2),
);
