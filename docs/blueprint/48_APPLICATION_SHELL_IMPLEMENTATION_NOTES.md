# 48 — Application shell implementation notes

**Status:** Phase 0 Task 9 — implemented  
**Canonical:** [04](04_APPLICATION_ARCHITECTURE.md), [25](25_UI_UX_ARCHITECTURE.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md)

Empty **application shells** only. No store, catalog, checkout, care, lab, delivery, ERP, KYC, or partner product UI.

---

## Apps

| App | Path | Port | Role |
| --- | --- | --- | --- |
| Customer web | `apps/web-customer` | 3000 | Public home + session boundary |
| Admin web | `apps/web-admin` | 3001 | Protected operator chrome |
| Mobile | `apps/mobile` | Expo / RN | Welcome / workspace / expired |

Shared:

- `packages/shell-core` — session store, nav visibility, HTTP correlation
- `packages/shell-web` — React session provider + country/health readers
- `packages/ui-kit` — all visual primitives

---

## Authentication

Uses the existing identity kernel. Shell session state is **in-memory**:

- public snapshot: status, audience, permissions, country code
- access/refresh tokens are **not** placed on the snapshot and **not** written to `localStorage`
- Phase 0 sign-in is a local session boundary (`authenticate('customer' | 'admin')`) so UI can be tested without a full OTP product flow
- production login must call `POST /api/v1/auth/otp/*` from Task 2; this shell does not add a second auth system

Admin chrome is shown only when `status === authenticated` and `audience === admin`. A customer audience sees permission denied.

---

## Routing

Customer: `/` public shell.  
Admin: `/` gated shell.  
Mobile: in-memory screens `welcome | workspace | expired`. Scheme `worldpharma://` is reserved; no product deep links.

---

## Country

`GET /api/v1/countries` is optional. If the API is down, the shell still renders and shows `unavailable`. No default country (not India, not USD).

---

## UI kit

Tokens and components only. Layout CSS uses `--wp-space-*` and `--wp-page-max`. No extra CSS framework.

---

## Performance

No polling. One health check + one countries fetch on customer home. No animation libraries. Next apps transpile only ui-kit + shell packages.

---

## Security

- Tokens not logged
- No secrets in client source
- Admin UI hidden until an admin session exists
- Problem copy is generic (no stack traces)

---

## Accessibility

Semantic landmarks (`header`, `main`, `nav`), 44px targets via ui-kit, focus rings, `lang="en"`, reduced-motion from ui-kit CSS.

---

## Deferred product screens

Store, catalog, cart, checkout, orders, doctor, lab, delivery, KYC queues, finance, warehouse, partner consoles.

---

## Phase 0

This task fills **8.1 Apps** (web-customer, web-admin, mobile shells). Phase 0 is **not** auto-signed-off: hosted `dev`, brand, launch country, and observability vendor remain human decisions.

---

## Verification (26 August 2026)

Docker Desktop 4.50.0 / Engine 28.5.1 Linux (WSL2). Compose started `postgres` + `redis` only.

| Check | Result |
| --- | --- |
| Customer web lint / typecheck / test / build | pass (3 tests). First Load JS `/` 113 kB |
| Admin web lint / typecheck / test / build | pass (3 tests). First Load JS `/` 112 kB |
| Mobile lint / typecheck / test | pass (3 tests). `expo config --type public` OK (SDK 53, `com.worldpharma.app`) |
| Native APK / IPA | **not built** (no `android/` / `ios/` trees, no Android SDK, Windows host) |
| CI | `.github/workflows/ci.yml` already builds web-customer + web-admin and typechecks mobile |
| Design system | shells import `@world-pharma/ui-kit` only |
| API after Compose | `GET /health` 200 `{"status":"ok"}`; `GET /health/ready` 200 postgres/redis/bullmq `up`, Redis 7.4.11 |
| Tests | api 58/58, config 5/5, ui-kit 10/10 |

Recovery notes (environment, not product scope):

- Fresh Compose volume had all 5 Prisma migrations pending.
- `20260826140000_partner_dark_model/migration.sql` had a UTF-8 BOM; PostgreSQL rejected it. BOM was stripped; existing SQL was then applied with `migrate deploy`. No schema redesign.
