/**
 * S159 — After `npx expo prebuild --platform android`, apply the monorepo
 * Expo SDK 53 ExpoModulesPackage autolinking fix (same as customer/delivery S130).
 * android/ is gitignored; re-run this after every prebuild.
 */
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(appRoot, 'android');
const settingsPath = path.join(androidRoot, 'settings.gradle');
const appGradlePath = path.join(androidRoot, 'app', 'build.gradle');
const configSrc = path.join(appRoot, '..', 'mobile', 'android', 'rn-android-config.cjs');
const configDst = path.join(androidRoot, 'rn-android-config.cjs');

if (!fs.existsSync(androidRoot)) {
  console.error('No android/ directory. Run: npx expo prebuild --platform android');
  process.exit(1);
}

fs.copyFileSync(configSrc, configDst);

let settings = fs.readFileSync(settingsPath, 'utf8');
if (!settings.includes('rn-android-config.cjs')) {
  settings = settings.replace(
    /extensions\.configure\(com\.facebook\.react\.ReactSettingsExtension\) \{ ex ->[\s\S]*?\n\}/,
    `extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  ex.autolinkLibrariesFromCommand(["node", "android/rn-android-config.cjs"])
}`,
  );
  fs.writeFileSync(settingsPath, settings);
}

let appGradle = fs.readFileSync(appGradlePath, 'utf8');
if (!appGradle.includes('s130FixExpoModulesPackage')) {
  appGradle += `

android.applicationVariants.configureEach { /* s130FixExpoModulesPackage */ }
tasks.withType(JavaCompile).configureEach {
  doFirst {
    def pkg = file("\${project.projectDir}/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java")
    if (pkg.exists()) {
      pkg.text = pkg.text.replace("expo.core.ExpoModulesPackage", "expo.modules.ExpoModulesPackage")
    }
  }
}
`;
  fs.writeFileSync(appGradlePath, appGradle);
}

console.log('Applied ExpoModulesPackage Android fix for mobile-affiliate.');
