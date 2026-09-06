# WORLD_PHARMA S159 — Final Mobile Completion / Real-Device & Build Validation

**Sprint:** 159  
**Master backlog:** #456  
**Status:** SOFTWARE COMPLETE (mobile feature freeze candidate)  
**CAN_PRODUCTION_LAUNCH:** NO  

| Flag | Value |
| --- | --- |
| **MOBILE_FEATURE_COMPLETE** | **YES** |
| **MOBILE_REAL_USE_VALIDATED** | **PARTIAL** |
| **ANDROID_BUILD_READY** | **YES** (customer + affiliate debug APKs on disk) |
| **IOS_BUILD_READY** | **ENVIRONMENT_BLOCKED** (`IOS_BUILD_ENVIRONMENT_NOT_AVAILABLE`) |
| **PLATFORM_FEATURE_COMPLETE** | **YES** (application scope; device tap-through still PARTIAL) |
| **AUTHENTICATED_DEVICE_TAPTHROUGH** | **NOT_COMPLETED** (no emulator/AVD/USB device attached) |

---

## 1. Mobile inventory

| App | Path | Topology | Role | In S159 scope? |
| --- | --- | --- | --- | --- |
| Customer | `apps/mobile` | APP-CUS-M | Customer super-app | **Yes** |
| Affiliate | `apps/mobile-affiliate` | APP-AFF-M | Affiliate companion (S155) | **Yes** |
| Store | `apps/mobile-store` | APP-STORE-M | Pharmacy staff | Inventory only |
| Doctor | `apps/mobile-doctor` | APP-DOC-M | Doctor | Inventory only |
| Lab | `apps/mobile-lab` | APP-LAB-M | Lab ops | Inventory only |
| Phlebotomist | `apps/mobile-phlebotomist` | APP-PHE-M | Collection | Inventory only |
| Delivery | `apps/mobile-delivery` | APP-DEL-M | Rider | Inventory only |

**Not present:** `apps/mobile-customer` (customer = `apps/mobile`).

| Stack | Customer | Affiliate |
| --- | --- | --- |
| Expo | ^53 | ^53 |
| RN | 0.79.2 | 0.79.2 |
| `eas.json` | yes | **added S159** |
| `android/` (gitignored prebuild) | yes | **prebuilt S159** |
| `ios/` | no | no |
| Metro RN 0.87 block | yes | **added S159** |

---

## 2. Customer mobile status

Tabs: Home · Medicines · Appointments · Health · Orders · Account.  
Screens cover marketplace, cart/checkout, orders/tracking, lab, imaging (report + viewer note; full S152 diagnostic frames remain web-appropriate), doctors/appointments, health vault/family, profile/support.

Auth: OTP via shell-core audience `customer`; guest browse allowed for discovery screens.

**Unit/typecheck:** 12 suites / 77 tests PASS · tsc PASS.

---

## 3. Affiliate mobile status

Tabs: Home · Links · Earn · Stmt · Inbox · Help · Profile.  
Reuses `me/affiliate/*` + inbox/support. No payout execute. No KYC document payloads.

**Unit/typecheck:** 2 suites / 10 tests PASS · tsc PASS.

---

## 4. Android build status

| App | Result | Artifact |
| --- | --- | --- |
| Customer | **PASS** `assembleDebug` | `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (~125 MB) |
| Affiliate | **PASS** after S130 ExpoModulesPackage patch | `apps/mobile-affiliate/android/app/build/outputs/apk/debug/app-debug.apk` (~125 MB) |

Host: Windows; SDK at `C:\Users\asus\AppData\Local\Android\Sdk` (set `ANDROID_HOME` for CLI).  
`adb devices`: **empty** (no emulator/USB).

JS Hermes export:

| App | Result |
| --- | --- |
| Customer | PASS ~3.13 MB `.hbc` → `dist-s159/android-bundle` |
| Affiliate | PASS ~1.65 MB `.hbc` (after Metro pin) |

Affiliate durable helpers: `metro.config.js`, `eas.json`, `.env.example`, `scripts/apply-android-expo-modules-fix.mjs` + `pnpm android:prebuild`.

---

## 5. iOS build status

**`IOS_BUILD_ENVIRONMENT_NOT_AVAILABLE`** — Windows host, no Xcode, no `ios/` projects.  
Config present in `app.json` (`bundleIdentifier`). Do not claim iOS binary success.

---

## 6. API / environment status

- Customer `runtime-api.ts`: env separation local/sandbox/production; loopback blocked on native unless allowed; no production secrets in source.
- Affiliate share URL: **fail-closed** — no localhost base when `EXPO_PUBLIC_APP_ENV` is sandbox/production (S159 fix).
- Tokens via shell-core session; unauthorized APIs remain server-enforced 401/403.
- Production providers **not** enabled.

---

## 7. Real-device / emulator evidence

| Probe | Result |
| --- | --- |
| Physical Android/iOS | `DEVICE_NOT_AVAILABLE` |
| Emulator AVD list | empty |
| APK install + tap-through | **NOT_COMPLETED** |
| Expo web alone | **not** used as mobile PASS |

Do **not** claim `AUTHENTICATED_DEVICE_TAPTHROUGH = PASS`.

---

## 8. UI validation

Source review + existing native UI-kit screens: loading/empty/network/forbidden/expired states present on affiliate; customer uses established commerce/health patterns. No redesign. Imaging mobile shows report + viewer-unavailable note (S152 full frame viewer is web/customer SPA path).

---

## 9. Security validation

| Check | Status |
| --- | --- |
| Unauth rejected (server) | B — 401 on me/* |
| Own-data affiliate APIs | B — existing membership gate |
| No KYC raw docs in affiliate | B + unit contract |
| No payout execute in mobile | B |
| No clinical payload in share/labels | B |
| No secrets in `.env.example` | B |
| Share URL localhost leak in prod/sandbox | **Fixed (A)** |

---

## 10. Tests

| Suite | Result |
| --- | --- |
| `mobile` | 77 PASS |
| `mobile-affiliate` | 10 PASS (incl. S159 share URL) |
| typecheck both | PASS |
| Related API (S149/S150/S156/topology when run) | focused PASS historically this arc |

---

## 11. Defects fixed (category A only)

1. **Affiliate share URL** could resolve relative links to `http://localhost:3000` under sandbox/production → fail-closed to path-only or configured non-loopback `EXPO_PUBLIC_CUSTOMER_URL`.
2. **Affiliate Metro** missing RN 0.87 blockList → Android `expo export` failed → added `metro.config.js` (same as other mobiles).
3. **Affiliate Android native** ExpoModulesPackage `expo.core` vs `expo.modules` (S130) → prebuild + apply script + successful `assembleDebug`.

---

## 12. Remaining blockers

| Blocker | Class |
| --- | --- |
| No Android emulator/USB device for install tap-through | **D** BUILD-ENVIRONMENT |
| iOS build/signing (macOS/Xcode) | **D** |
| EAS cloud login / store release signing | **C/D** |
| Production providers / first market (S158) | **C/E** |
| Push notifications production | **C** (not faked) |

---

## 13. Final mobile readiness

Customer + affiliate **application features** are complete for freeze. Installable **Android debug APKs** proven. **Real-device authenticated tap-through remains PARTIAL** until a device/emulator is available — that is an environment gap, **not** a reason to open another feature sprint.

### Capability matrix

| Mobile Capability | Customer Mobile | Affiliate Mobile | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Source / Expo RN | Yes | Yes | B | Inventory | — |
| Auth OTP (sandbox) | Yes | Yes | B | shell-core | Device tap D |
| Marketplace / cart | Yes | N/A | B | screens + tests | Device tap D |
| Orders / tracking | Yes | N/A | B | screens | Device tap D |
| Lab / imaging / doctor / health | Yes | N/A | B | screens; imaging viewer note | Full S152 frames on native = F optional |
| Affiliate links/earnings/KYC status | N/A | Yes | B | S155 + S159 | Device tap D |
| Android debug APK | Yes | Yes | A→B | APK on disk | Release signing C |
| iOS binary | Config only | Config only | D | Windows host | macOS/Xcode |
| Hermes export | Yes | Yes | B | dist-s159 `.hbc` | — |
| Env/API safety | Yes | Yes (+share fix) | A→B | runtime-api + tests | — |

---

## Exact post-S159 action

1. **Humans:** attach Android emulator or device → install both debug APKs → authenticated tap-through checklist (record evidence).  
2. **Humans:** macOS/Xcode when iOS binaries required.  
3. **Business:** continue S158 first-market / provider launch control — **not** another coding sprint.  
4. **Recommend platform feature freeze** for application scope.

**STOP.** Do not open S160 merely to increment sprint numbers.
