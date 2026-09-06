/**
 * Windows-safe RN autolinking JSON for Gradle (cwd = <app>/android).
 * Rewrites the invalid `expo.core.ExpoModulesPackage` import to Expo SDK 53's
 * `expo.modules.ExpoModulesPackage`. Avoids `npx` (missing on Gradle PATH).
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const expoPkg = require.resolve('expo/package.json', { paths: [appRoot] });
const pkgJson = require.resolve('expo-modules-autolinking/package.json', {
  paths: [path.dirname(expoPkg)],
});
const cli = path.join(path.dirname(pkgJson), 'bin', 'expo-modules-autolinking.js');
const result = spawnSync(
  process.execPath,
  [cli, 'react-native-config', '--platform', 'android', '--json'],
  { cwd: appRoot, encoding: 'utf8' },
);
let out = result.stdout ?? '';
out = out.replace(/expo\.core\.ExpoModulesPackage/g, 'expo.modules.ExpoModulesPackage');
process.stdout.write(out);
if (!out.includes('packageImportPath')) {
  process.stderr.write(result.stderr ?? 'autolinking produced no JSON');
  process.exit(result.status ?? 1);
}
process.exit(0);
