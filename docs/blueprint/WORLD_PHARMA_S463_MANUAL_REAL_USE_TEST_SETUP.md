# WORLD_PHARMA S463 — Manual Real-Use Test Setup

**Sprint:** 463 · **Master backlog:** **#463**  
**Document type:** Founder manual acceptance **setup** (test/execution only)  
**Baseline:** S462 (#462) — ORDER_TO_DELIVERY automated PASS; SANDBOX_E2E PARTIAL  

| Flag | Value |
| --- | --- |
| **APPLICATION_CODE_CHANGED** | **NO** |
| **FEATURE_WORK** | **NO** |
| **RUNTIME_ENV** | **DEVELOPMENT / SANDBOX** |
| **PUBLIC_OPEN_READY** | **NO** |
| **CAN_PRODUCTION_LAUNCH** | **NO** |
| **ANDROID_REAL_USE** | **ENVIRONMENT_BLOCKED** (no device/emulator at setup time) |
| **IOS_REAL_USE** | **ENVIRONMENT_BLOCKED** |

**Founder scorecard:** [WORLD_PHARMA_S463_FOUNDER_MANUAL_ACCEPTANCE_SHEET.md](WORLD_PHARMA_S463_FOUNDER_MANUAL_ACCEPTANCE_SHEET.md)

This document does **not** claim the ecosystem is public-ready. Sandbox ≠ production.

---

## 1. Apps started (verified HTTP 200)

All processes were confirmed listening and responding at setup time. **Keep them running** for the founder session.

| App | Port | URL | Health |
| --- | --- | --- | --- |
| API | 4000 | http://127.0.0.1:4000/health · http://127.0.0.1:4000/health/ready | 200 · `environment=development` |
| Customer | 3000 | http://127.0.0.1:3000/ | 200 |
| Main Admin | 3001 | http://127.0.0.1:3001/ | 200 |
| Doctor | 3002 | http://127.0.0.1:3002/ | 200 |
| Store | 3003 | http://127.0.0.1:3003/ | 200 |
| Vendor | 3004 | http://127.0.0.1:3004/ | 200 |
| Lab | 3005 | http://127.0.0.1:3005/ | 200 |
| Radiology | 3006 | http://127.0.0.1:3006/ | 200 |
| Radiologist | 3007 | http://127.0.0.1:3007/ | 200 |
| Join | 3008 | http://127.0.0.1:3008/ | 200 |
| Pathologist | 3009 | http://127.0.0.1:3009/ | 200 |
| Affiliate | 3010 | http://127.0.0.1:3010/ | 200 |
| Logistics | 3011 | http://127.0.0.1:3011/ | 200 |

`/health/ready` reports payments / carriers / OTP as **sandbox**; `AUTH_DEV_REVEAL_OTP` enabled (development only).

**If an app stops:** restart with `npx pnpm exec next dev --port <port>` from the matching `apps/web-*` folder (or prior `nx serve` pattern). API: `npx nx serve api`. Do **not** change application code.

---

## 2. Sandbox actors (existing seed identities)

Source: `apps/api/src/dev/dev-sandbox.seed.service.ts` (demo fixture seed when `DEV_SANDBOX_SEED` not skipped).

**Login method (all):** Email + OTP on each app’s login screen. With `AUTH_DEV_REVEAL_OTP`, the UI typically **auto-fills** the one-time code after “Send OTP”. Do **not** treat this as a production OTP provider.

| Actor | Email identifier | Primary app URL | Role / org notes |
| --- | --- | --- | --- |
| Main Admin | `sandbox-admin@dev.local` | http://127.0.0.1:3001 | Platform admin / control plane |
| Customer | `sandbox-customer@dev.local` | http://127.0.0.1:3000 | Marketplace customer |
| Vendor / Pharmacy | `sandbox-vendor@dev.local` | http://127.0.0.1:3004 (Store :3003) | Seller / pharmacy ops |
| Doctor | `sandbox-doctor@dev.local` | http://127.0.0.1:3002 | Clinical partner |
| Lab operator | `sandbox-lab@dev.local` | http://127.0.0.1:3005 | Lab partner |
| Imaging centre | `sandbox-imaging@dev.local` | http://127.0.0.1:3006 | Imaging partner |
| Radiologist | `sandbox-radiologist@dev.local` | http://127.0.0.1:3007 | Interpretation |
| Radiologist reviewer | `sandbox-radiologist-reviewer@dev.local` | http://127.0.0.1:3007 | Reviewer (if used) |
| Pathologist | `sandbox-pathologist@dev.local` | http://127.0.0.1:3009 | Pathology |
| Phlebotomist | `sandbox-phlebotomist@dev.local` | (mobile / related) | Collection |
| Delivery / logistics | `sandbox-delivery@dev.local` | http://127.0.0.1:3011 | Delivery partner / fleet |
| Affiliate | `sandbox-affiliate@dev.local` | http://127.0.0.1:3010 | Affiliate companion web |
| Join applicant | any new email via OTP | http://127.0.0.1:3008 | Partner application (not seeded admin) |

**Credentials mechanism:** No passwords. OTP only. Setup verified `dev_code` is returned by API for admin + customer identifiers (codes are **not** printed here).

**Fixture IDs:** Seed creates demo catalog, lab tests, imaging study slug `demo-chest-xray`, referral code `WPDEMO`, CMS/site chrome. Exact UUIDs are environment-local — discover via UI search, not hardcoded secrets.

---

## 3. Fixtures available (sandbox)

| Domain | Available in sandbox seed (typical) |
| --- | --- |
| Medicines / catalog / offers / inventory | Demo OTC products, packs, prices |
| Lab | Seeded lab test + packages |
| Imaging | Demo chest X-ray study path |
| Doctor | Seeded doctor partner |
| Affiliate | Seeded affiliate + demo referral `WPDEMO` |
| CMS / SEO / site chrome | Seeded packs |
| Payments | Mock / sandbox CARD success path |
| Carrier | Mock carrier only |
| OTP | Console + AUTH_DEV_REVEAL |

If seed did not run (production flags / `DEV_SANDBOX_SEED=false`), register via OTP and ask an operator to re-enable demo seed in **development only** — do not invent production data.

---

## 4. Mobile availability

| Item | Status |
| --- | --- |
| Android USB / emulator | **None attached** → **ENVIRONMENT_BLOCKED** |
| Customer debug APK | Present on disk: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` |
| Affiliate debug APK | Present: `apps/mobile-affiliate/android/app/build/outputs/apk/debug/app-debug.apk` |
| iOS / Xcode | **ENVIRONMENT_BLOCKED** (Windows host) |

Founder may attach a device later and install APKs without code changes; until then mark mobile steps BLOCKED on the sheet.

---

## 5. Exact manual test order (recommended)

1. **Public website** (logged out) — Customer :3000  
2. **OTP + Customer commerce** — login as customer  
3. **Order-to-delivery chain** (primary) — Customer order → Vendor fulfill → Logistics/delivery → Customer delivered  
4. **Customer Lab / Imaging / Doctor / Health**  
5. **Affiliate web**  
6. **Main Admin** control-plane walk (do **not** enable live providers)  
7. **Security negatives** (second browser / incognito)  
8. **Cross-border software inspection** (Admin countries / policy packs — no real shipment)  
9. **Mobile** only if device appears  

Fill results only in the Founder Acceptance Sheet.

---

## 6. What is manually testable vs externally blocked

### Manually testable (sandbox UI)

- Customer commerce + sandbox payment  
- Vendor fulfillment through READY / handoff  
- Logistics mock delivery states  
- Affiliate web (no live payout)  
- Admin visibility of launch readiness / provider activation **status** (leave providers NOT_SELECTED)  
- Lab / imaging / doctor **application** flows where fixtures exist  
- Auth negatives (wrong role / wrong tenant)  

### Externally blocked (must stay EXTERNAL_BLOCKED / NOT_READY)

| Gate | Status |
| --- | --- |
| Real PSP | EXTERNAL_BLOCKED |
| Real OTP/SMS | EXTERNAL_BLOCKED |
| Real KYC/KYB | EXTERNAL_BLOCKED |
| Real carrier | EXTERNAL_BLOCKED |
| Real pharmacy network (licensed live) | EXTERNAL_BLOCKED |
| Real eRx / telemedicine / production PACS | EXTERNAL_BLOCKED |
| Production secrets / DB / storage / KMS / backup / DR / deploy / WAF / APM | EXTERNAL_BLOCKED |
| Pentest approval | NOT_READY |
| First-market selection (OD-COUNTRY-01) | NOT_SELECTED |
| MoR / licences / legal approval | NOT_READY |

---

## 7. Admin classification guide (A–E)

When filling the Admin section of the sheet:

| Code | Meaning |
| --- | --- |
| **A** | Manually usable end-to-end in sandbox UI |
| **B** | UI exists but workflow blocked (missing fixture/state) |
| **C** | External provider required for real outcome |
| **D** | Legal/business decision required |
| **E** | Not testable in current sandbox |

Do **not** mark **A** only because an API returns 200.

---

## 8. Security reminder

Expected denials: **401** / **403**. Do not weaken authorization. Do not paste OTP codes, tokens, or PHI into tickets or chat.

---

## 9. No-code-change confirmation

| Check | Value |
| --- | --- |
| APPLICATION_CODE_CHANGED | **NO** |
| FEATURE_WORK | **NO** |
| Docs created | This file + Founder Acceptance Sheet |
| Master Index | **#463** |

---

## 10. Final status (setup pass)

| Flag | Value |
| --- | --- |
| SOFTWARE_COMPLETE | YES (prior) |
| ACTIONABLE_CODING_BACKLOG | ZERO |
| SANDBOX_MANUAL_SETUP_READY | **YES** (apps + actors + sheet) |
| FOUNDER_MANUAL_RESULTS | **PENDING** (sheet empty by design) |
| PUBLIC_OPEN_READY | **NO** |
| CAN_PRODUCTION_LAUNCH | **NO** |

**STOP.** Founder executes the sheet; engineering does not invent pass marks.
