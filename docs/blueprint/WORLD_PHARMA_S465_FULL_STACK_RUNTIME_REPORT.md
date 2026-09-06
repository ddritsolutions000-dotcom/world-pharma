# WORLD_PHARMA S465 — Full Stack Runtime + P0/P1 UI Defect Closure

**Sprint:** 465 · **Master backlog:** **#465**  
**Baseline:** S464 (#464) UI defect backlog  
**Runtime:** DEVELOPMENT / SANDBOX  

| Flag | Value |
| --- | --- |
| **FULL_STACK_RUNNING** | **YES** |
| **P0_REMAINING** | **0** |
| **P1_REMAINING** | **0** |
| **FRONTEND_BACKEND_E2E** | **PASS** (browser + API; see layers below) |
| **DATABASE_VERIFIED** | **PASS** (`/health/ready` postgres up; API E2E against DB) |
| **REDIS_WORKERS_VERIFIED** | **PASS** (redis up, bullmq up, outbox processing) |
| **ORDER_TO_DELIVERY** | **PASS** (API regression suites including S462 stages + real-use) |
| **SECURITY_REGRESSION** | **PASS** (focused security/authz suites + CORS deny evil origin) |
| **UI_REGRESSION** | **PASS** (P0/P1 re-verified in Chrome; no new P0/P1 from this sprint) |
| **ACTIONABLE_CODING_BACKLOG** | **ZERO** for S464 P0/P1; P2/P3 from S464 remain polish |
| **PUBLIC_OPEN_READY** | **NO** |
| **CAN_PRODUCTION_LAUNCH** | **NO** |

Evidence: [`docs/blueprint/s465-artifacts/`](s465-artifacts/)

---

## A. Infrastructure startup

| Component | Status |
| --- | --- |
| PostgreSQL (`world-pharma-postgres`) | Up / healthy · `:55432` |
| Redis (`world-pharma-redis`) | Up / healthy · `:56379` · v7.4.11 |
| API `:4000` | `/health` 200 · `/health/ready` ready |
| BullMQ / outbox | `bullmq: up` · outbox processing |
| Runtime env | `development` · OTP/payments/carriers **sandbox** |

---

## B. Apps startup

| App | Port | Status |
| --- | --- | --- |
| Customer | 3000 | UP |
| Admin | 3001 | UP |
| Doctor | 3002 | UP |
| Store | 3003 | UP |
| Vendor | 3004 | UP |
| Lab | 3005 | UP |
| Radiology | 3006 | UP |
| Radiologist | 3007 | UP |
| Join | 3008 | UP |
| Pathologist | 3009 | UP |
| Affiliate | 3010 | UP |
| Logistics | 3011 | UP |
| API | 4000 | UP |

---

## C. P0 fixes

### P0-01 Logistics OTP / CORS

| Layer | Result |
| --- | --- |
| Root cause | `.env` `CORS_ALLOWED_ORIGINS` omitted `3008`/`3009`/`3011` while API used the explicit allowlist (not the dev 3000–3011 default). |
| Fix | Extended allowlist to match `.env.example` (explicit origins only — **no wildcard**). Added `apps/web-logistics/app/login/page.tsx` alias. |
| FRONTEND | PASS — logistics OTP + Sign out session |
| API | PASS — OPTIONS from `http://127.0.0.1:3011` returns `Access-Control-Allow-Origin: http://127.0.0.1:3011` |
| SECURITY | PASS — `Origin: https://evil.example` receives **no** ACAO |
| UI | PASS |

**Note:** Logistics portal auth audience is `admin` (ops APIs under `/api/v1/admin/...`). Browser proof used `sandbox-admin@dev.local`. `sandbox-delivery@dev.local` is a DELIVERY_PARTNER seed identity (rider/mobile path); CORS no longer blocks either origin.

### P0-02 Admin `/launch-readiness` blank / runtime

| Layer | Result |
| --- | --- |
| Root cause | `AdminShell` SSR rendered `LoadingState` while client hydrated authenticated `AdminChrome` → React hydration failure + Next overlay (appeared blank). |
| Fix | Mount gate in `apps/web-admin/src/admin-shell.tsx` so SSR and first client paint match. |
| FRONTEND | PASS — Final launch readiness + Production launch control render |
| UI | PASS — evidence `s465-artifacts/screenshots/p0_admin_launch_readiness.png` |
| SECURITY | PASS — still requires authenticated admin + `policy:read` |

### P0-03 Affiliate Earnings / Statement `countryCode`

| Layer | Result |
| --- | --- |
| Root cause | `AffiliateEarningsPage` / `Statement` / `Inbox` / `Support` referenced undefined `countryCode` in forbidden UI. |
| Fix | Use exported `AFFILIATE_SANDBOX_COUNTRY_CODE` (`XX`) — not IN/INR/+91. |
| FRONTEND | PASS — Earnings + Statement render without error boundary |
| UI | PASS |

---

## D. P1 fixes

| ID | Fix summary | Browser |
| --- | --- | --- |
| P1-01 | Market selection broadcasts `wp-country-changed` so all `useSelectedCountry` instances sync after gate click | PASS |
| P1-02 | Search Suspense wrap; no bare `/search`→home redirect; wait for market `ready` before catalog fetch | PASS (`/search?q=paracetamol`) |
| P1-03 | PDP image uses trimmed URL \|\| SVG/`PLACEHOLDER` + `onError` + alt text | PASS (src+alt present after market) |
| P1-04 | Doctor `.doctor-content` column on mobile; sidebar full-width scroll | PASS (no horizontal overflow @390) |
| P1-05 | Mount gates: AdminShell, DoctorShell, PortalWorkspaceShell, CustomerLayout session chrome | PASS (mitigated) |
| P1-06 | Follows from hydration fix (overlay no longer driven by launch-readiness mismatch) | PASS |
| P1-07 | Human labels for `SANDBOX_NOT_SETTLED` (Doctor + Admin) | PASS |
| P1-08 | `apps/web-affiliate/app/login/page.tsx` | PASS |

---

## E–L. Journey layer matrix (sandbox)

| Journey | FRONTEND | API | DATABASE | REDIS/WORKER | STATE_TRANSITION | SECURITY | UI |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customer commerce smoke (login→search→PDP→cart) | PASS | PASS | PASS* | N/A | PASS* | PASS | PASS |
| Vendor orders workspace | PASS | PASS* | PASS* | N/A | N/A | PASS | PASS |
| Logistics shipments (admin OTP) | PASS | PASS | PASS* | N/A | N/A | PASS (CORS) | PASS |
| Affiliate earnings/statement | PASS | PASS* | PASS* | N/A | N/A | PASS | PASS |
| Admin launch readiness | PASS | PASS* | PASS* | N/A | N/A | PASS | PASS |
| Doctor mobile home | PASS | PASS* | PASS* | N/A | N/A | PASS | PASS |
| Order-to-delivery (API E2E) | N/A (API harness) | PASS | PASS | PASS | PASS | PASS | N/A |

\*Via `/health/ready` + Jest E2E suites hitting Postgres/Redis; cart/order mutations covered in API real-use suites.

Deep Lab/Imaging/Doctor clinical UI click-chains were not every screen of S463 founder sheet; software paths remain covered by prior S462/S152/S154 suites + this sprint’s portal fixes.

---

## M. Security regression

- Focused Jest: `security.e2e`, `phase-4b1-authorization`, `identity.security` — **PASS** (part of 77/77).
- CORS: allowlisted `127.0.0.1:3011` · deny unlisted evil origin (no ACAO).
- Authorization not weakened for launch-readiness or affiliate.

---

## N. Visual regression

Playwright Chrome screenshots under `s465-artifacts/screenshots/`.  
No **new** P0/P1 introduced by fixes. S464 **P2/P3** polish items remain open (not in this closure scope).

---

## O. Frontend ↔ backend ↔ DB ↔ Redis

| Check | Evidence |
| --- | --- |
| API ready | postgres/redis/bullmq/outbox |
| Browser OTP | AUTH_DEV_REVEAL sandbox |
| CORS | preflight ACAO |
| E2E DB | Jest 77 tests including order-to-delivery |

---

## P. Test counts

| Suite set | Result |
| --- | --- |
| API focused regression (S462 stages, order-to-delivery real-use, S154, S156, S149, S150, S152, security, authz, identity) | **12 suites · 77 tests · PASS** |
| Browser P0/P1 verification | Chrome channel Playwright · PASS after fixes |

---

## Q. Remaining defects

| Class | Status |
| --- | --- |
| S464 P0 | **0 remaining** |
| S464 P1 | **0 remaining** |
| S464 P2/P3 | Still open (polish / DS consistency) — not blocking stack stability |
| External providers / prod infra / legal / first market | Unchanged EXTERNAL / NOT_READY |

---

## R. Environment blockers (unchanged)

Android/iOS device · Real PSP/OTP/KYC/carrier/PACS/eRx · Production DB/secrets/storage/deploy · OD-COUNTRY-01 unselected · **PUBLIC_OPEN_READY=NO** · **CAN_PRODUCTION_LAUNCH=NO**

---

## Code touch list (minimal)

- `.env` CORS allowlist (+3008/3009/3011)
- `apps/web-admin/src/admin-shell.tsx`
- `apps/web-affiliate/src/affiliate-hub.tsx`, `affiliate-sandbox-scope.tsx`, `app/login/page.tsx`
- `apps/web-logistics/app/login/page.tsx`
- `apps/web-customer` market sync, search, PDP image, layout mount gate
- `apps/web-doctor` shell CSS + mount gate + settlement labels
- `apps/web-admin/src/home-dashboard.tsx` settlement label
- `packages/shell-web/src/portal-workspace-shell.tsx` mount gate

**STOP.**
