/**
 * Sprint 129 — Mobile Expo/RN runtime inventory + host capability probe.
 * Does not invent devices, APKs, or Apple signing. Writes evidence JSON only.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'apps/test-results/s129-mobile-device-shots');
fs.mkdirSync(outDir, { recursive: true });

const APPS = [
  {
    id: 'customer',
    dir: 'apps/mobile',
    role: 'CUSTOMER',
    expoGoLikely: true,
    notes: 'Primary customer app; eas.json + android/ prebuild present',
  },
  {
    id: 'store',
    dir: 'apps/mobile-store',
    role: 'VENDOR_PHARMACY',
    expoGoLikely: true,
    notes: 'Pharmacy/store staff shell',
  },
  {
    id: 'doctor',
    dir: 'apps/mobile-doctor',
    role: 'DOCTOR',
    expoGoLikely: true,
    notes: 'Doctor shell; app.json added in S129',
  },
  {
    id: 'lab',
    dir: 'apps/mobile-lab',
    role: 'LAB',
    expoGoLikely: true,
    notes: 'Lab operator shell',
  },
  {
    id: 'phlebotomist',
    dir: 'apps/mobile-phlebotomist',
    role: 'LAB_PHLEBOTOMIST',
    expoGoLikely: true,
    notes: 'Phlebotomist / collection shell',
  },
  {
    id: 'delivery',
    dir: 'apps/mobile-delivery',
    role: 'DELIVERY_RIDER',
    expoGoLikely: true,
    notes: 'Delivery/rider shell (not named mobile-rider)',
  },
];

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
    timeout: 120_000,
  });
  return {
    status: res.status,
    stdout: (res.stdout ?? '').slice(0, 4000),
    stderr: (res.stderr ?? '').slice(0, 4000),
  };
}

function exists(p) {
  return fs.existsSync(path.join(root, p));
}

const host = {
  platform: process.platform,
  arch: process.arch,
  os_release: os.release(),
  node: process.version,
  android_home: process.env.ANDROID_HOME ?? null,
  android_sdk_root: process.env.ANDROID_SDK_ROOT ?? null,
  adb: run('where', ['adb']).status === 0 || run('which', ['adb']).status === 0,
  java: run('where', ['java']).status === 0 || run('which', ['java']).status === 0,
  xcode: process.platform === 'darwin' ? run('xcodebuild', ['-version']) : { status: 1, stdout: '', stderr: 'not darwin' },
};

const androidSdkPresent = Boolean(
  (host.android_home && fs.existsSync(host.android_home)) ||
    (host.android_sdk_root && fs.existsSync(host.android_sdk_root)) ||
    fs.existsSync(path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')),
);

const appReports = [];

for (const app of APPS) {
  const abs = path.join(root, app.dir);
  const pkg = JSON.parse(fs.readFileSync(path.join(abs, 'package.json'), 'utf8'));
  const appJsonPath = path.join(abs, 'app.json');
  const appJson = fs.existsSync(appJsonPath)
    ? JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
    : null;
  const expoCfg = run('npx', ['expo', 'config', '--type', 'public', '--json'], abs);
  let expoPublic = null;
  if (expoCfg.status === 0 && expoCfg.stdout.trim()) {
    try {
      expoPublic = JSON.parse(expoCfg.stdout);
    } catch {
      expoPublic = { parse_error: true, raw: expoCfg.stdout.slice(0, 500) };
    }
  }

  const androidDir = exists(path.join(app.dir, 'android'));
  const iosDir = exists(path.join(app.dir, 'ios'));
  const easJson = exists(path.join(app.dir, 'eas.json'));
  const envExample = exists(path.join(app.dir, '.env.example'));

  appReports.push({
    id: app.id,
    role: app.role,
    path: app.dir,
    package_name: pkg.name,
    expo: pkg.dependencies?.expo ?? null,
    react_native: pkg.dependencies?.['react-native'] ?? null,
    app_json_present: Boolean(appJson),
    android_package: appJson?.expo?.android?.package ?? null,
    ios_bundle: appJson?.expo?.ios?.bundleIdentifier ?? null,
    version: appJson?.expo?.version ?? pkg.version,
    android_version_code: appJson?.expo?.android?.versionCode ?? null,
    eas_json: easJson,
    native_android_dir: androidDir,
    native_ios_dir: iosDir,
    env_example: envExample,
    babel_config: exists(path.join(app.dir, 'babel.config.js')),
    expo_config_cli_status: expoCfg.status,
    expo_config_error: expoCfg.status === 0 ? null : (expoCfg.stderr || expoCfg.stdout).slice(0, 800),
    expo_public_name: expoPublic?.name ?? expoPublic?.expo?.name ?? null,
    expo_go_compatible_estimate: app.expoGoLikely ? 'LIKELY_YES_NO_CUSTOM_NATIVE_MODULES' : 'UNKNOWN',
    notes: app.notes,
    android: {
      js_bundle: 'PENDING_METRO_OR_EXPORT',
      apk: androidSdkPresent
        ? 'BUILD_ATTEMPT_REQUIRED'
        : 'ANDROID_SDK_NOT_CONFIGURED',
      device_test: host.adb && androidSdkPresent ? 'ATTEMPT' : 'DEVICE_NOT_AVAILABLE',
      blocker: androidSdkPresent
        ? null
        : 'ANDROID_HOME / ANDROID_SDK_ROOT / adb missing on this Windows host',
    },
    ios: {
      js_bundle: 'PENDING_METRO_OR_EXPORT',
      build:
        process.platform === 'darwin'
          ? 'ATTEMPT_SIMULATOR_OR_DEV_CLIENT'
          : 'IOS_BUILD_EXTERNAL_GATED',
      device_test:
        process.platform === 'darwin' ? 'ATTEMPT' : 'DEVICE_NOT_AVAILABLE',
      blocker:
        process.platform === 'darwin'
          ? null
          : 'iOS builds require macOS + Xcode; Apple signing/device access unavailable on Windows',
    },
  });
}

const summary = {
  sprint: 129,
  evaluated_at: new Date().toISOString(),
  host: {
    ...host,
    android_sdk_present: androidSdkPresent,
    ios_toolchain: process.platform === 'darwin' ? 'POSSIBLE' : 'IOS_BUILD_EXTERNAL_GATED',
  },
  apps_discovered: appReports.length,
  apps_not_present: ['mobile-affiliate', 'mobile-vendor', 'mobile-pharmacy', 'mobile-rider'],
  mapping_notes: {
    vendor_pharmacy: 'apps/mobile-store',
    delivery_rider: 'apps/mobile-delivery',
    affiliate_mobile: 'DOES_NOT_EXIST_USE_WEB_AFFILIATE',
  },
  apps: appReports,
  production_claim: false,
  can_production_launch: 'NO',
};

fs.writeFileSync(path.join(outDir, 's129-inventory.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ wrote: path.join(outDir, 's129-inventory.json'), apps: appReports.length }, null, 2));
