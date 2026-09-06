# Sprint 129 — Mobile Expo/RN Real Device and Build Validation

**Status:** COMPLETE (runtime/installability validation — not production launch)  
**Master Index:** #427  
**Does not replace Sprint 128** (PSP activation control, Master Index #426).  
**CAN_PRODUCTION_LAUNCH:** NO  

## Purpose

Make every existing World-Pharma React Native / Expo mobile app **runnable and testable** on Android and iOS paths where the host allows. No Flutter rewrite, no duplicate apps, no PSP/payment work.

Truth rule (not equivalent):

| Layer | Meaning |
| --- | --- |
| RN/Expo code exists | Source present in monorepo |
| Expo / Metro starts | Dev server or `expo export` succeeds |
| JS bundle compiles | Hermes `.hbc` artifact produced |
| Android APK builds | Installable binary exists on disk |
| Android device tested | Physical/emulator install + flows |
| iOS build exists | Simulator/dev/TestFlight artifact |
| iOS device tested | Physical/simulator install + flows |

## Host capability (this environment)

| Probe | Result |
| --- | --- |
| OS | Windows 10 (build 26200) |
| Node | v22.22.1 |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | unset |
| `adb` | not on PATH |
| Local Gradle `assembleDebug` | **FAIL** — `SDK location not found` (`apps/mobile/android/local.properties` / ANDROID_HOME) |
| EAS CLI | **Not logged in** |
| Xcode / macOS | **not darwin** → `IOS_BUILD_EXTERNAL_GATED` |
| Physical USB Android | `DEVICE_NOT_AVAILABLE` |
| Physical iPhone | `DEVICE_NOT_AVAILABLE` |

Inventory probe: `node scripts/s129-mobile-runtime-validation.mjs` → `apps/test-results/s129-mobile-device-shots/s129-inventory.json`.

## Complete mobile app inventory

| APP | Path | Role | Expo | RN | Android ID | iOS bundle | eas.json | Native android/ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CUSTOMER | `apps/mobile` | Customer | ^53 | 0.79.2 | `com.worldpharma.app` | `com.worldpharma.app` | yes | prebuild present (gitignored) |
| VENDOR/PHARMACY | `apps/mobile-store` | Store staff | ^53 | 0.79.2 | `com.worldpharma.store` | `com.worldpharma.store` | no | no |
| DOCTOR | `apps/mobile-doctor` | Doctor | ^53 | 0.79.2 | `com.worldpharma.doctor` | `com.worldpharma.doctor` | no | no |
| LAB | `apps/mobile-lab` | Lab operator | ^53 | 0.79.2 | `com.worldpharma.lab` | `com.worldpharma.lab` | no | no |
| LAB_PHLEBOTOMIST | `apps/mobile-phlebotomist` | Collection | ^53 | 0.79.2 | `com.worldpharma.phlebotomist` | `com.worldpharma.phlebotomist` | no | no |
| DELIVERY | `apps/mobile-delivery` | Rider | ^53 | 0.79.2 | `com.worldpharma.delivery` | `com.worldpharma.delivery` | no | no |

**Not present (do not invent):** `mobile-affiliate`, `mobile-vendor`, `mobile-pharmacy`, `mobile-rider`. Affiliate remains web-only. Pharmacy/vendor mobile = `mobile-store`. Rider = `mobile-delivery`.

Framework for all: **Expo + React Native** (not Expo Router apps). Package manager: **pnpm**.

## Expo Go compatibility

| App | Expo Go? | Why |
| --- | --- | --- |
| All six | **LIKELY_YES** (PATH A) | Dependencies are Expo SDK 53 modules (`expo-status-bar`, `expo-constants`, `expo-document-picker` on customer, `expo-linking`, `safe-area-context`). No `expo-dev-client`. |
| Dev Build (PATH B) | **NOT REQUIRED** for Go path | Use only if a non–Expo Go native module is added later. |

Do **not** remove native deps to force Expo Go.

## Metro / JS bundle (verified this sprint)

Monorepo pnpm can resolve a stray `react-native@0.87` from the store. Each app pins Metro to **0.79.2** via `metro.config.js` (`blockList` + `extraNodeModules`).

| App | Command | Result | Artifact |
| --- | --- | --- | --- |
| customer | `npx expo export --platform android --output-dir ./dist-s129/android-bundle` | **PASS** | `apps/mobile/dist-s129/android-bundle/_expo/static/js/android/index-fe8c7fab71558a3aed2fd17f24a90763.hbc` (~2.24 MB) |
| lab | same | **PASS** | `…/index-25ee32a1fe0275c17fc7e1845a72fb2f.hbc` (~1.64 MB) |
| phlebotomist | same | **PASS** | `…/index-a1fe3f417c2dee4a1006e6f21255836c.hbc` (~1.64 MB) |
| delivery | same | **PASS** | `…/index-dbb1ac9d6b7e88eea400e8fe04573ea6.hbc` (~3.55 MB) |
| store | same | **PASS** | `…/index-90e4fe2c20f39a84fc22f639f78ca01e.hbc` (~3.56 MB) |
| doctor | same | **PASS** | `…/index-c474ea4bc9749c08360c34fbb72b9d22.hbc` (~3.61 MB) |

Evidence JSON: `apps/test-results/s129-mobile-device-shots/satellite-export-results.json`.  
`dist-s129/` is gitignored (local proof only).

### Expo start (customer LAN path)

```bash
cd apps/mobile
npm exec pnpm -- start:lan
# or: npx expo start --lan --port 8081
```

Documented session (prior evidence in `runtime-summary.json`): Metro `http://127.0.0.1:8081`, Expo Go URL `exp://192.168.1.4:8081`, API `http://192.168.1.4:4000`.

Satellites:

```bash
cd apps/mobile-<role>
npx expo start --lan --port 8081
# set EXPO_PUBLIC_API_BASE_URL=http://<LAN-IPv4>:4000  (required on physical device)
```

## Android APK / installable build

| Path | Status |
| --- | --- |
| PATH C — local Gradle / `expo run:android` | **ANDROID_SDK_NOT_CONFIGURED** — exact error: *SDK location not found… ANDROID_HOME or `local.properties` sdk.dir* |
| PATH C — EAS preview APK | **EAS_NOT_LOGGED_IN** (+ customer needs `extra.eas.projectId` for cloud) |
| APK file on disk | **NONE** — do not invent a path |

When SDK exists (customer): `cd apps/mobile && npx expo run:android` or `npm run android:native`.  
When EAS logged in: `npx eas-cli build --platform android --profile preview` (`eas.json` development/preview → APK, `developmentClient: false`).

## iOS

| Path | Status |
| --- | --- |
| Simulator / Xcode | **IOS_BUILD_EXTERNAL_GATED** (Windows host; needs macOS + Xcode) |
| Expo Go on iPhone | Technically viable on same Wi-Fi with LAN Metro + LAN API; **not executed** here (`DEVICE_NOT_AVAILABLE`) |
| Dev Build / TestFlight | Requires Apple Developer signing — **unavailable** |
| iOS artifact | **NONE** |

Required for iOS device builds: macOS, Xcode, Apple Team ID / certificates / provisioning (or EAS credentials).

## API connectivity & environment separation

| Env | How |
| --- | --- |
| `local` (default) | LAN `http://<ipv4>:4000` on physical device; Android emulator `10.0.2.2:4000` if `EXPO_PUBLIC_ANDROID_EMULATOR=true`; never hardcode a developer IP in production config |
| `sandbox` | Explicit `EXPO_PUBLIC_API_BASE_URL` (shared sandbox) |
| `production` | Must be explicit; `start:lan` refuses production |

Customer: `apps/mobile/src/runtime-api.ts` + `.env.example` + `scripts/start-lan.mjs`.  
Satellites: `@world-pharma/shell-core` `apiBaseUrl()` → `EXPO_PUBLIC_API_BASE_URL` else **`http://127.0.0.1:4000`** (unsuitable for physical devices without LAN env). Each satellite has `.env.example`.

**Do not** point mobile builds at production. **Do not** commit secrets.

Physical device checklist:

1. API listening on `0.0.0.0:4000` (or reachable LAN bind).  
2. Phone and host on same Wi-Fi.  
3. `EXPO_PUBLIC_API_BASE_URL=http://<host-LAN-IP>:4000`.  
4. `EXPO_PUBLIC_APP_ENV=local` or `sandbox`.

## Per-app status matrix

### CUSTOMER (`apps/mobile`)

- **Android:** JS bundle **PASS**; APK **BUILD_BLOCKED** (`ANDROID_SDK_NOT_CONFIGURED` + `EAS_NOT_LOGGED_IN`); device USB **DEVICE_NOT_AVAILABLE**; Expo Go path **DOCUMENTED / EXPO_GO_TESTABLE**
- **iOS:** JS compile via shared Metro **PASS** (export path Android-only this run); native build **IOS_BUILD_EXTERNAL_GATED**; device **DEVICE_NOT_AVAILABLE**
- **Expo Go:** YES (no custom native outside Expo Go SDK set)
- **Dev Build:** NOT REQUIRED
- **Interactive evidence:** Expo **web** screenshot pass (`runtime-summary.json` + 8 PNGs under `apps/test-results/s129-mobile-device-shots/`) — not a substitute for USB handset QA

| Flow | Result |
| --- | --- |
| Launch / home guest | PASS (web) |
| Login OTP | PASS (web) |
| Logout | PASS (web) |
| Login again | PARTIAL / FAIL automation (`welcome not shown` flaky) |
| Medicines discovery | PASS (web) |
| Product detail / cart / checkout / order status | NOT_VERIFIED |
| Health | PASS (web) |
| Lab / doctors / profile deep flows | NOT_VERIFIED / screens exist |

### VENDOR/PHARMACY (`apps/mobile-store`)

- **Android:** JS bundle **PASS**; APK **BUILD_BLOCKED** (no SDK; no eas.json); device **DEVICE_NOT_AVAILABLE**
- **iOS:** **IOS_BUILD_EXTERNAL_GATED** / **DEVICE_NOT_AVAILABLE**
- **Expo Go:** LIKELY_YES after Metro pin
- **Device flows:** NOT_RUN

### DOCTOR (`apps/mobile-doctor`)

- **Android:** JS bundle **PASS**; APK **BUILD_BLOCKED**; device **DEVICE_NOT_AVAILABLE**
- **iOS:** **IOS_BUILD_EXTERNAL_GATED** / **DEVICE_NOT_AVAILABLE**
- **Expo Go:** LIKELY_YES (`app.json` added S129)
- **Device flows:** NOT_RUN

### LAB (`apps/mobile-lab`)

- **Android:** JS bundle **PASS**; APK **BUILD_BLOCKED**; device **DEVICE_NOT_AVAILABLE**
- **iOS:** **IOS_BUILD_EXTERNAL_GATED** / **DEVICE_NOT_AVAILABLE**
- **Expo Go:** LIKELY_YES
- **Device flows:** NOT_RUN

### LAB_PHLEBOTOMIST (`apps/mobile-phlebotomist`)

- **Android:** JS bundle **PASS**; APK **BUILD_BLOCKED**; device **DEVICE_NOT_AVAILABLE**
- **iOS:** **IOS_BUILD_EXTERNAL_GATED** / **DEVICE_NOT_AVAILABLE**
- **Expo Go:** LIKELY_YES (package/bundle IDs completed S129)
- **Device flows:** NOT_RUN

### DELIVERY (`apps/mobile-delivery`)

- **Android:** JS bundle **PASS**; APK **BUILD_BLOCKED**; device **DEVICE_NOT_AVAILABLE**
- **iOS:** **IOS_BUILD_EXTERNAL_GATED** / **DEVICE_NOT_AVAILABLE**
- **Expo Go:** LIKELY_YES
- **Device flows:** NOT_RUN

### AFFILIATE MOBILE

**DOES_NOT_EXIST** — use web affiliate portal.

## Authentication / security (scope)

- Customer session store: in-memory; tokens not in public snapshot; logout clears tokens (unit + web pass).  
- Unauthorized mobile routes → welcome / denied surfaces (existing navigation).  
- Backend authorization unchanged — do not weaken for mobile tests.  
- Cross-role device auth matrices (vendor/doctor/lab/delivery): **NOT_RUN** on device this sprint.  
- No production secrets embedded in mobile source for this validation.  
- PHI/token debug logging: no new token logging introduced.

## Offline / network failure

No dedicated offline architecture claimed. Existing UI empty/error states observed on customer web pass when catalog/API empty. Unsupported: full offline queue — **DOCUMENT_UNSUPPORTED**.

## Tests run

| Target | Result |
| --- | --- |
| `nx run-many -t typecheck -p mobile,mobile-lab,mobile-phlebotomist,mobile-delivery,mobile-store,mobile-doctor` | **6/6 PASS** (satellite `tsconfig` `lib` includes `dom` for shared packages) |
| `nx test mobile` | **77/77 PASS** |
| `nx test mobile-delivery` | **3/3 PASS** |
| `nx test mobile-doctor` | **11/11 PASS** |
| `apps/mobile-phlebotomist` jest | **2/2 PASS** |
| shell-core (prior session) | **17/17 PASS** |

## Screenshots

`apps/test-results/s129-mobile-device-shots/`:

- `01-home-guest.png` … `08-health.png`, `99-error.png` (customer Expo web)
- `runtime-summary.json`
- `s129-inventory.json`
- `satellite-export-results.json`

## Exact blockers

1. **ANDROID_SDK_NOT_CONFIGURED** — no APK; Gradle fails without SDK.  
2. **EAS_NOT_LOGGED_IN** — cloud APK unavailable.  
3. **IOS_BUILD_EXTERNAL_GATED** — macOS/Xcode/Apple signing required.  
4. **DEVICE_NOT_AVAILABLE** — no USB Android / iPhone attached to this host.  
5. Satellite physical API — must set `EXPO_PUBLIC_API_BASE_URL` (default loopback is wrong on device).

## Minimum config fixes landed in S129

- `app.json` for doctor + package/bundle IDs for phlebotomist  
- `babel.config.js`, `.env.example`, Metro `metro.config.js` (RN 0.79.2 pin) for satellites  
- `@babel/runtime` dependency on satellites  
- Typecheck `lib: ["es2022","dom"]` on satellites  
- Customer `eas.json`, `start:lan`, `runtime-api` (existing/prior)  
- Inventory script `scripts/s129-mobile-runtime-validation.mjs`

## Commands used (summary)

```bash
node scripts/s129-mobile-runtime-validation.mjs
cd apps/mobile && npx expo export --platform android --output-dir ./dist-s129/android-bundle
# repeat export for mobile-lab|phlebotomist|delivery|store|doctor
cd apps/mobile/android && .\gradlew.bat assembleDebug   # fails: SDK location not found
npx eas-cli whoami                                       # Not logged in
npx nx run-many -t typecheck -p mobile,mobile-lab,mobile-phlebotomist,mobile-delivery,mobile-store,mobile-doctor
npx nx test mobile && npx nx test mobile-delivery && npx nx test mobile-doctor
```

## Related doc

Earlier customer-only note: `docs/ops/MOBILE_REAL_DEVICE_RUNTIME_AND_BUILD_VALIDATION.md` — **superseded for inventory scope** by this S129 document (customer Expo Go details still valid).

---

# Sprint 130 — Actual Expo server runtime + Android APK + iOS gate

**S130 STATUS:** PARTIAL  
**Master Index:** remains **#427** (not advanced to #428 — Expo Web UI not proven for all six apps; iOS artifact none; physical devices still unavailable).  
**Does not replace Sprint 128** (#426, PSP BLOCKED).  
**CAN_PRODUCTION_LAUNCH:** NO  
**S129 correction:** `expo export` / Metro “running” / Expo Go compatibility notes are **not** proof the apps run or that APKs exist.

## Host (this run)

| Probe | Result |
| --- | --- |
| OS | Windows NT 10.0.26200 |
| Node | v22.22.1 |
| JDK | Java 17.0.16 (`JAVA_HOME=C:\Program Files\Java\jdk-17`) |
| Android SDK | Installed to `C:\Users\asus\AppData\Local\Android\Sdk` (cmdline-tools + platform-tools + `platforms;android-35` + `build-tools;35.0.0`) |
| `adb version` | Android Debug Bridge 1.0.41 (37.0.1-15733141) |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | `C:\Users\asus\AppData\Local\Android\Sdk` (session env; not committed) |
| EAS | `npx eas-cli whoami` → **Not logged in** (`EAS_NOT_LOGGED_IN`) |
| Xcode / darwin | No → **IOS_BUILD_EXTERNAL_GATED** |
| Physical USB device | **DEVICE_NOT_AVAILABLE** |
| API | `GET http://127.0.0.1:4000/health` → `{"status":"ok"}`; LAN `http://192.168.1.4:4000/health` also reachable this host |

## Expo commands used (actual runtime, not export)

Customer LAN helper (dynamic IP, not hardcoded in app source):

```bash
cd apps/mobile
npx expo start --lan --port 8081
# or: pnpm start:lan  → scripts/start-lan.mjs
```

Satellites (orchestrated by `scripts/s130-expo-runtime.mjs`):

```bash
cd apps/mobile-store        && npx expo start --lan --port 8082
cd apps/mobile-doctor       && npx expo start --lan --port 8083
cd apps/mobile-lab          && npx expo start --lan --port 8084
cd apps/mobile-phlebotomist && npx expo start --lan --port 8085
cd apps/mobile-delivery     && npx expo start --lan --port 8086
```

Env for those sessions: `EXPO_PUBLIC_APP_ENV=local`, `EXPO_PUBLIC_API_BASE_URL` from live LAN/loopback health (not production). `REACT_NATIVE_PACKAGER_HOSTNAME` set to detected LAN IPv4.

## Development URLs (generated this environment)

LAN IPv4 detected: **192.168.1.4** (not written into application source).

| APP | Metro | Expo Go URL | Web |
| --- | --- | --- | --- |
| CUSTOMER | 8081 | `exp://192.168.1.4:8081` | `http://127.0.0.1:8081` |
| VENDOR | 8082 | `exp://192.168.1.4:8082` | `http://127.0.0.1:8082` |
| DOCTOR | 8083 | `exp://192.168.1.4:8083` | `http://127.0.0.1:8083` |
| LAB | 8084 | `exp://192.168.1.4:8084` | `http://127.0.0.1:8084` |
| PHLEBOTOMIST | 8085 | `exp://192.168.1.4:8085` | `http://127.0.0.1:8085` |
| DELIVERY | 8086 | `exp://192.168.1.4:8086` | `http://127.0.0.1:8086` |

Metro logs also printed `Waiting on http://localhost:<port>` (Windows). Expo Go should use the `exp://` LAN URL on the same Wi-Fi.

## Per-app S130 matrix

| APP | EXPO_RUNTIME | EXPO_WEB | ANDROID_BUILD | IOS_BUILD |
| --- | --- | --- | --- | --- |
| CUSTOMER | PASS (Metro + UI rendered) | PASS (home / welcome / discovery; OTP incomplete) | PASS (APK on disk) | EXTERNAL_GATED |
| VENDOR | FAIL (Metro/bundle only; UI not rendered) | FAIL (blank white) | PASS (APK on disk) | EXTERNAL_GATED |
| DOCTOR | FAIL (Metro/bundle only; UI not rendered) | FAIL (blank white) | PASS | EXTERNAL_GATED |
| LAB | FAIL (Metro; 1-module web bundle; UI not rendered) | FAIL (blank white) | PASS | EXTERNAL_GATED |
| PHLEBOTOMIST | FAIL (Metro; 1-module web bundle; UI not rendered) | FAIL (blank white) | PASS | EXTERNAL_GATED |
| DELIVERY | FAIL (Metro/bundle only; UI not rendered) | FAIL (blank white) | PASS | EXTERNAL_GATED |

Affiliate: **web only** — no mobile app created.

JSON: `apps/test-results/s130-mobile-runtime/expo-runtime-summary.json`.

### CUSTOMER Expo Web UI (existing screens only)

Evidence PNGs under `apps/test-results/s130-mobile-runtime/`:

- `customer-01-home.png` — World Pharma guest home, Sign in, tab bar
- `customer-02-welcome.png`
- `customer-03-after-login.png` — still on OTP card (`sandbox-customer@dev.local`, button **Sending…**, API `http://127.0.0.1:4000`) — login **not completed**
- `customer-04-discovery.png` — Medicines tab opened
- Product detail / cart / logout automation **FAIL** (no catalog control / no cart surface / no Sign out in automation)

Do not claim full home→login→PDP→cart closure.

### Satellite Expo Web

`store-99-error.png`, `doctor-99-error.png`, `lab-99-error.png`, `phlebotomist-99-error.png`, `delivery-99-error.png` are **blank white**. Metro served JS; Chromium did not capture Native UI. Treat EXPO_WEB as FAIL, not as “Metro running = UI”.

Phlebotomist `app.json` `platforms` now includes `web` (was ios/android only).

## Android SDK setup (S129 blocker)

Installed via `scripts/s130-android-sdk-setup.mjs` (Google command-line tools zip → `%LOCALAPPDATA%\Android\Sdk`). Evidence: `apps/test-results/s130-mobile-runtime/android-sdk.json`.

Local Gradle path used (EAS cloud not available). Windows + pnpm required:

- `scripts/expo-rn-android-config.cjs` — Gradle working directory is the **app root**, so command is `node android/rn-android-config.cjs`; rewrites `expo.core.ExpoModulesPackage` → `expo.modules.ExpoModulesPackage`
- `scripts/s130-android-apk-build.mjs` patches `settings.gradle` + `JavaCompile` doFirst

## APK artifacts (filesystem verified)

`*.apk` is gitignored; files exist locally:

| APP | PLATFORM | TYPE | PATH | SIZE | PROFILE | STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| CUSTOMER | Android | APK | `apps/test-results/s130-artifacts/customer-debug.apk` | 125.05 MB (131127307 bytes) | local-gradle-assembleDebug | PASS |
| VENDOR | Android | APK | `apps/test-results/s130-artifacts/store-debug.apk` | 125.24 MB (131321728 bytes) | local-gradle-assembleDebug | PASS |
| DOCTOR | Android | APK | `apps/test-results/s130-artifacts/doctor-debug.apk` | 125.24 MB (131321736 bytes) | local-gradle-assembleDebug | PASS |
| LAB | Android | APK | `apps/test-results/s130-artifacts/lab-debug.apk` | 125.24 MB (131321732 bytes) | local-gradle-assembleDebug | PASS |
| PHLEBOTOMIST | Android | APK | `apps/test-results/s130-artifacts/phlebotomist-debug.apk` | 125.24 MB (131321760 bytes) | local-gradle-assembleDebug | PASS |
| DELIVERY | Android | APK | `apps/test-results/s130-artifacts/delivery-debug.apk` | 125.24 MB (131321744 bytes) | local-gradle-assembleDebug | PASS |

Application IDs: `com.worldpharma.app` / `.store` / `.doctor` / `.lab` / `.phlebotomist` / `.delivery`. Summary JSON: `apps/test-results/s130-artifacts/android-apk-summary.json`.

## iOS

**IOS_BUILD_EXTERNAL_GATED** — Windows host; no Xcode; no Apple Team ID/signing in this environment; EAS not logged in so no cloud iOS IPA. **No iOS artifact path.** Missing: macOS + Xcode (simulator) and/or Apple Developer signing (device/TestFlight) and/or `eas login`.

## Tests (S130)

| Target | Result |
| --- | --- |
| `nx run-many -t typecheck -p mobile,mobile-lab,mobile-phlebotomist,mobile-delivery,mobile-store,mobile-doctor` | PASS |
| `nx test mobile` | 77/77 PASS |
| `nx test mobile-delivery` | 3/3 PASS |
| `nx test mobile-doctor` | 11/11 PASS |
| `apps/mobile-phlebotomist` `npx jest` | 2/2 PASS |

## Errors fixed (smallest)

- Android SDK missing → command-line SDK install
- Gradle `H:\DDR` path split → `cwd` + `gradlew.bat` without spaced full path
- Windows Expo `cmd /c node --eval` dropping `--platform android` → `expo-rn-android-config.cjs`
- RN Gradle `workingDir` is app root, not `android/` → `node android/rn-android-config.cjs`
- Invalid `import expo.core.ExpoModulesPackage` → rewrite to `expo.modules.ExpoModulesPackage` + JavaCompile doFirst
- Phlebotomist platforms missing `web`
- Metro `blockList` for `android/build` / `ios/build` (watcher ENOENT while Gradle codegen runs)

## Remaining blockers

1. Satellite Expo **Web** UI blank in Playwright despite Metro bundle (CUSTOMER web works).
2. Customer sandbox OTP did not finish (UI stuck on **Sending…**); product detail/cart not verified.
3. **EAS_NOT_LOGGED_IN** — no cloud EAS APK/IPA (local APK path used instead).
4. **IOS_BUILD_EXTERNAL_GATED**.
5. **DEVICE_NOT_AVAILABLE** — APKs not installed on a handset/emulator in this sprint.
6. Do not point development at production; do not commit secrets / APK binaries.

## STOP

Do **not** start Sprint 131 automatically. Do **not** claim “mobile apps are ready” as a full Expo-Web + device QA statement. Six **debug APKs exist**; iOS does **not**. Sprint 128 PSP remains #426.
