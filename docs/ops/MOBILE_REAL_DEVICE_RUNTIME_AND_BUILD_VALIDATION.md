# Mobile real-device runtime and installable build validation

> **Superseded for full inventory:** see authoritative Sprint 129 report  
> [`S129_MOBILE_EXPO_RN_REAL_DEVICE_AND_BUILD_VALIDATION.md`](./S129_MOBILE_EXPO_RN_REAL_DEVICE_AND_BUILD_VALIDATION.md)  
> (all six apps + Android/iOS truth matrix). This file retains customer Expo Go LAN details.

**Status:** Expo Go runtime is testable (Metro + Android JS bundle verified). No APK was generated.  
**Sprint:** 129 (Master Index #427)  
**Does not replace Sprint 128** (PSP activation control, Master Index #426).

`CAN_PRODUCTION_LAUNCH = NO`

## Runtime method that works

**A) EXPO_GO_TESTABLE**

Customer app: `apps/mobile`  
Expo SDK **53**, React Native **0.79.2**, package manager **pnpm@10.15.1**.

Native modules in use (`expo-document-picker`, `expo-constants`, `expo-linking`, `expo-status-bar`, `react-native-safe-area-context`) ship in Expo Go for SDK 53. **Do not add `expo-dev-client`** if you want Expo Go to keep working.

### Start (physical Android on the same Wi-Fi)

1. API on port **4000**, reachable on the LAN (`GET http://<LAN-IPv4>:4000/health` → `{"status":"ok"}`).
2. From the repo root:

```bash
npm exec pnpm -- --filter @world-pharma/mobile start:lan
```

Or:

```bash
cd apps/mobile
npx expo start --lan --port 8081
```

`start:lan` sets `EXPO_PUBLIC_APP_ENV=local` and `EXPO_PUBLIC_API_BASE_URL=http://<detected-LAN-IPv4>:4000` (prefers `192.168.x`, skips Hyper-V/WSL). Override with `EXPO_PUBLIC_LAN_IP` or `EXPO_PUBLIC_API_BASE_URL`. It **refuses** `EXPO_PUBLIC_APP_ENV=production`.

3. On the phone: Expo Go → scan / open `exp://<LAN-IPv4>:8081`.
4. Confirm the welcome caption shows `Environment: local · API: http://<LAN-IPv4>:4000` (not `127.0.0.1`).

This session: Metro **http://127.0.0.1:8081**, Android bundle **HTTP 200** (~5.6 MB), Expo URL **exp://192.168.1.4:8081**, API **http://192.168.1.4:4000/health** OK on the LAN interface.

### When a Development Build is required

Only if you add a native module that is **not** in Expo Go. Then use `expo run:android` / EAS with `expo-dev-client` (that path is **incompatible with Expo Go**). Current app: **not required**.

## API environments (do not point the app at production)

| `EXPO_PUBLIC_APP_ENV` | API | Notes |
| --- | --- | --- |
| `local` (default) | LAN `http://<ipv4>:4000` on a physical device; `http://10.0.2.2:4000` if `EXPO_PUBLIC_ANDROID_EMULATOR=true`; Expo **web** uses `http://127.0.0.1:4000` even if a LAN URL was set for Metro | Never commit a developer IP in source |
| `sandbox` | Explicit `EXPO_PUBLIC_API_BASE_URL` (may be HTTPS) | Shared sandbox host, not production |
| `production` | Requires explicit URL; `start:lan` exits | **Not used** for this validation |

Copy `apps/mobile/.env.example` → `apps/mobile/.env.local` (gitignored). Root `.env.example` documents the same variables.

Physical devices must **not** use `localhost` / `127.0.0.1` as the API host. `applyMobileRuntimeEnv` in `apps/mobile/index.ts` derives the LAN host from Expo `hostUri` when env is loopback.

## Authentication (sandbox)

Account: `sandbox-customer@dev.local` (existing sandbox OTP; `AUTH_DEV_REVEAL_OTP` local only).

Session store is **in-memory** (`createSessionStore`): tokens are not in the public snapshot (`snapshotContainsSecrets` stays false). Logout clears tokens. Persistence across process kill is **not** implemented (by design — no SecureStore). Re-login in the same JS runtime: Sign in from guest home.

Unauthorized routes resolve to `welcome` (`resolveMobileScreen`).

## Customer flows (this session)

Interactive evidence: Expo **web** of the same bundle (`http://127.0.0.1:8081`, 390×844), screenshots in `apps/test-results/s129-mobile-device-shots/`. USB Android / `adb` **not installed** — Expo Go on a handset was not USB-driven here; it is still the intended on-device method.

| Flow | Result |
| --- | --- |
| Home (guest) | **PASS** (renders; empty catalog / connection states observed) |
| Sign in OTP | **PASS** |
| Authenticated home | **PASS** (session; Sign out visible) |
| Logout | **PASS** (guest home + Sign in; country chips visible) |
| Login again | **PARTIAL** — re-entry is Sign in on guest home; automated second OTP click was flaky |
| Medicines / search | **PASS** (search UI; empty “enter a term” state) |
| Product detail | **NOT_VERIFIED** this session (no PDP tap with a live offer) |
| Cart | **NOT_VERIFIED** |
| Checkout / order / order status | **NOT_VERIFIED** |
| Lab discovery / booking | **NOT_IMPLEMENTED in this pass** (screens exist: `lab`, `lab-bookings`) |
| Health records | **PASS** (Health tab opened) |
| Doctors / consultation | **NOT_VERIFIED** (nav exists: Doctors shortcut) |
| Profile / family | **NOT_VERIFIED** (account hub exists) |

Do not invent missing product behaviour. Portrait-only (`app.json` `orientation: portrait`).

## Device / UI checks

| Check | Notes |
| --- | --- |
| Safe area | `SafeAreaView` on main shells |
| Keyboard | Welcome uses `KeyboardAvoidingView` + `ScrollView` |
| Bottom nav | Six tabs; labels have `accessibilityLabel` |
| Touch targets | Existing `nativeTouch` buttons |
| Empty / error | Empty catalog + network error states already in UI |
| USB Android | **adb not on PATH; ANDROID_HOME unset** |
| Automated device E2E | **UNAVAILABLE** (no instrumentation / Maestro / Detox) |

## Android installable build

**D) BUILD_BLOCKED**

| Path | Result |
| --- | --- |
| EAS cloud | `eas whoami` → **Not logged in**. No credentials, no `extra.eas.projectId` |
| Local Gradle | **ANDROID_SDK_NOT_INSTALLED** (`ANDROID_HOME` unset, no `platform-tools/adb`) |
| APK file | **Not generated** — do not invent a path |

Config present for when credentials/SDK exist:

- `apps/mobile/eas.json` — `development` / `preview` **APK**, `developmentClient: false` (keeps Expo Go viable)
- Application ID `com.worldpharma.app`, name **World Pharma**, version `0.0.0`, `versionCode` **1**
- `usesCleartextTraffic: true` for LAN HTTP in local/sandbox only — turn off for a real production store build
- Command when SDK exists: `cd apps/mobile && npx expo run:android` (`android:native` script)
- Command when EAS is logged in: `cd apps/mobile && npx eas-cli build --platform android --profile preview`

Generated `android/` / `ios/` are gitignored (CNG).

## Security

- No API secrets in `EXPO_PUBLIC_*`
- Production URL not used; public HTTPS rejected when `APP_ENV=local`
- Tokens not logged (mobile `src` has no `console.log`)
- Welcome caption shows env + API host only
- Loopback is local-only; it does not fail open to production
- After changing `CORS_ALLOWED_ORIGINS`, **restart the API**. Expo Go (native fetch) does not use CORS; Expo web origin `http://localhost:8081` must be listed (see `.env.example`)

## Tests

```bash
npx nx test mobile
npx nx typecheck mobile
npx nx test shell-core
```

This session: mobile **77/77**, shell-core **17/17**, mobile typecheck **green**.

Optional Expo web screenshot pass (Playwright, not in CI):

```bash
node apps/mobile/scripts/expo-web-runtime-pass.mjs
```

Requires Metro on `:8081` and the API on `:4000`.

## Known limitations

- Duplicate `react-native@0.87` exists in the pnpm store; Metro **blockLists** it so SDK 53 uses **0.79.2**.
- Expo web needs `react` and `react-dom` on the same major/minor (aligned to **19.2.8** in `apps/mobile`).
- No USB device in this environment — on-device QA is: Expo Go + LAN Metro + LAN API.
- Catalog may be empty for a given country (e.g. AE) even when the API is up.

## Exact blockers

1. **PHYSICAL_USB_ANDROID / adb** — SDK not installed; cannot `adb install` or screencap a handset from this machine.  
2. **APK** — EAS not logged in + no Android SDK → **no APK file**.  
3. **Production** — unchanged; do not launch.
