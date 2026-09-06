/**
 * Sprint 130 — local Android debug APK via Expo prebuild + Gradle.
 * Requires ANDROID_HOME from s130-android-sdk-setup.mjs. Does not fake EAS cloud builds.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'apps/test-results/s130-artifacts');
fs.mkdirSync(outDir, { recursive: true });

const SDK_ROOT =
  process.env.ANDROID_HOME?.trim() ||
  process.env.ANDROID_SDK_ROOT?.trim() ||
  (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Android', 'Sdk')
    : path.join(os.homedir(), 'Android', 'Sdk'));
const JAVA_HOME = process.env.JAVA_HOME?.trim() || 'C:\\Program Files\\Java\\jdk-17';

const APPS = [
  { id: 'customer', role: 'CUSTOMER', dir: 'apps/mobile', applicationId: 'com.worldpharma.app' },
  { id: 'store', role: 'VENDOR_PHARMACY', dir: 'apps/mobile-store', applicationId: 'com.worldpharma.store' },
  { id: 'doctor', role: 'DOCTOR', dir: 'apps/mobile-doctor', applicationId: 'com.worldpharma.doctor' },
  { id: 'lab', role: 'LAB', dir: 'apps/mobile-lab', applicationId: 'com.worldpharma.lab' },
  { id: 'phlebotomist', role: 'LAB_PHLEBOTOMIST', dir: 'apps/mobile-phlebotomist', applicationId: 'com.worldpharma.phlebotomist' },
  { id: 'delivery', role: 'DELIVERY', dir: 'apps/mobile-delivery', applicationId: 'com.worldpharma.delivery' },
];

function run(cmd, args, cwd, timeout = 1_200_000) {
  const env = {
    ...process.env,
    JAVA_HOME,
    ANDROID_HOME: SDK_ROOT,
    ANDROID_SDK_ROOT: SDK_ROOT,
    EXPO_USE_COMMUNITY_AUTOLINKING: '',
    EXPO_PUBLIC_APP_ENV: 'local',
    EXPO_NO_TELEMETRY: '1',
  };
  delete env.CI;
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: true,
    timeout,
    env,
  });
}

function patchWindowsAutolinking(androidDir) {
  const settingsPath = path.join(androidDir, 'settings.gradle');
  if (!fs.existsSync(settingsPath)) {
    return 'settings.gradle missing';
  }
  fs.copyFileSync(path.join(root, 'scripts/expo-rn-android-config.cjs'), path.join(androidDir, 'rn-android-config.cjs'));
  let text = fs.readFileSync(settingsPath, 'utf8');
  const replacement =
    'ex.autolinkLibrariesFromCommand(["node", "android/rn-android-config.cjs"])';
  text = text.replace(
    /if \(System\.getenv\('EXPO_USE_COMMUNITY_AUTOLINKING'\) == '1'\) \{[\s\S]*?ex\.autolinkLibrariesFromCommand\([^)]*\)[\s\S]*?\} else \{[\s\S]*?ex\.autolinkLibrariesFromCommand\([^)]*\)[\s\S]*?\}/,
    replacement,
  );
  if (text.includes('["node", "rn-android-config.cjs"]')) {
    text = text.replace(
      '["node", "rn-android-config.cjs"]',
      '["node", "android/rn-android-config.cjs"]',
    );
  }
  fs.writeFileSync(settingsPath, text);
  return text.includes('android/rn-android-config.cjs') ? 'patched' : 'needle_not_found';
}

function patchJavaCompilePackageList(androidDir) {
  const gradlePath = path.join(androidDir, 'app/build.gradle');
  if (!fs.existsSync(gradlePath)) {
    return 'missing_app_gradle';
  }
  const marker = 's130FixExpoModulesPackage';
  let text = fs.readFileSync(gradlePath, 'utf8');
  if (text.includes(marker)) {
    return 'already';
  }
  text += `

android.applicationVariants.configureEach { /* ${marker} */ }
tasks.withType(JavaCompile).configureEach {
  doFirst {
    def pkg = file("\${project.projectDir}/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java")
    if (pkg.exists()) {
      pkg.text = pkg.text.replace("expo.core.ExpoModulesPackage", "expo.modules.ExpoModulesPackage")
    }
  }
}
`;
  fs.writeFileSync(gradlePath, text);
  return 'patched';
}

function writeLocalProperties(androidDir) {
  const sdkDir = SDK_ROOT.replace(/\\/g, '\\\\');
  fs.writeFileSync(path.join(androidDir, 'local.properties'), `sdk.dir=${sdkDir}\n`);
}

function findApk(androidDir) {
  const candidates = [
    path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk'),
    path.join(androidDir, 'app/build/outputs/apk/debug/app-universal-debug.apk'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const adb = path.join(SDK_ROOT, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const sdkOk = fs.existsSync(path.join(SDK_ROOT, 'platforms', 'android-35')) && fs.existsSync(adb);
const easWho = run('npx', ['eas-cli', 'whoami'], root, 60_000);

const artifacts = [];
const only = (process.env.S130_APK_ONLY ?? '').trim();

for (const app of APPS) {
  if (only && only !== app.id) continue;
  const appRoot = path.join(root, app.dir);
  const androidDir = path.join(appRoot, 'android');
  const rec = {
    app: app.role,
    platform: 'Android',
    artifact_type: 'APK',
    application_id: app.applicationId,
    build_profile: 'local-gradle-assembleDebug',
    status: 'FAIL',
    path: null,
    size_bytes: null,
    errors: [],
  };
  if (!sdkOk) {
    rec.status = 'BLOCKED';
    rec.errors.push('ANDROID_SDK_NOT_CONFIGURED');
    artifacts.push(rec);
    continue;
  }
  if (!fs.existsSync(androidDir)) {
    const prebuild = run('npx', ['expo', 'prebuild', '--platform', 'android', '--non-interactive'], appRoot);
    if (prebuild.status !== 0 || !fs.existsSync(androidDir)) {
      rec.errors.push(`prebuild_failed: ${(prebuild.stderr || prebuild.stdout || '').slice(-2000)}`);
      artifacts.push(rec);
      continue;
    }
  }
  writeLocalProperties(androidDir);
  rec.windows_autolinking = patchWindowsAutolinking(androidDir);
  rec.java_compile_fix = patchJavaCompilePackageList(androidDir);
  fs.rmSync(path.join(androidDir, 'app/build/generated/autolinking'), { recursive: true, force: true });
  const gradle = run('gradlew.bat', ['assembleDebug', '--no-daemon'], androidDir);
  const apk = findApk(androidDir);
  if (!apk) {
    rec.errors.push(`gradle_no_apk: ${(gradle.stderr || gradle.stdout || '').slice(-2500)}`);
    artifacts.push(rec);
    continue;
  }
  const dest = path.join(outDir, `${app.id}-debug.apk`);
  fs.copyFileSync(apk, dest);
  const st = fs.statSync(dest);
  rec.path = dest;
  rec.source_apk = apk;
  rec.size_bytes = st.size;
  rec.size_human = `${(st.size / (1024 * 1024)).toFixed(2)} MB`;
  rec.status = st.size > 1024 * 100 ? 'PASS' : 'FAIL';
  if (gradle.status !== 0) {
    rec.errors.push('gradle_nonzero_but_apk_exists');
  }
  artifacts.push(rec);
  fs.writeFileSync(path.join(outDir, `${app.id}-android.json`), JSON.stringify(rec, null, 2));
}

const summary = {
  ANDROID_HOME: SDK_ROOT,
  JAVA_HOME,
  sdk_ok: sdkOk,
  adb_exists: fs.existsSync(adb),
  eas_whoami: (easWho.stdout || easWho.stderr || '').trim().slice(0, 500),
  artifacts,
};
fs.writeFileSync(path.join(outDir, 'android-apk-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(artifacts.some((a) => a.status !== 'PASS') ? 1 : 0);
