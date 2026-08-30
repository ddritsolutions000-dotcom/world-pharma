# 49 — Phase 0 final audit

**Date:** 26 August 2026  
**Canonical:** [38](38_PHASE_0_DECISION_BOARD.md), lock [43](43_ECOSYSTEM_BASELINE_LOCK.md), Tasks 1–9 notes [40](40_IDENTITY_IMPLEMENTATION_NOTES.md)–[48](48_APPLICATION_SHELL_IMPLEMENTATION_NOTES.md)  
**Verdict:** **TECHNICALLY READY FOR HUMAN SIGN-OFF**  
**Not:** “Phase 0 fully approved.” This file cannot close legal, brand, country, MoR, PSP, licensing, or observability-vendor decisions.

Phase 1, Store, Commerce, payments, DHL, warehouse product, doctor/lab product UI were **not** started.

---

## Executive status

Engineering Tasks 1–9 are implemented and re-verified. Local Compose Postgres 16 + Redis 7.4.11 are healthy. API Jest no longer shares the live outbox table. Remaining gaps are **human/deferred** (cloud account, vendors, licenses, OTel/Sentry) plus known toolchain advisories. Native APK/IPA were not produced in this Windows environment.

---

## Technical completion

| Task | Area | Status |
| --- | --- | --- |
| 1 | Nx + pnpm monorepo, Compose PG16/Redis 7 | DONE |
| 2 | Identity kernel | DONE (synthetic OTP, no SMS vendor) |
| 3 | Empty XX policy pack | DONE |
| 4 | Dark partner model | DONE (no public Join UI) |
| 5 | Outbox + BullMQ | DONE |
| 6 | Security / in-process observability | DONE; vendor tracing DEFERRED |
| 7 | Design system | DONE |
| 8 | CI/CD foundation | DONE (no production deploy) |
| 9 | Empty customer/admin/mobile shells | VERIFIED |

---

## Security status

Helmet, explicit CORS, Zod `.strict()`, OTP + refresh rate limits (fail closed if Redis down), JWT + RBAC, admin shell gated, log redaction (otp/password/token/PAN/CVV/KYC/clinical), Problem+JSON without internals, no PAN/CVV storage. **Not** a HIPAA/GDPR/DPDP certification.

---

## Infrastructure status

Compose: `postgres:16-alpine` healthy on **55432**, `redis:7-alpine` **7.4.11** on **56379**. Host Redis 3.x on 6379 is unused. Hosted `dev` cloud: **HUMAN DECISION**. Docker Desktop recovery is an environment issue, not an app defect.

---

## Identity status

OTP port + console adapter; JWT access; rotating refresh + family reuse revoke; session revoke / revoke-all; TOTP + recovery schema (enforcement off); `SecurityEvent` trail; OTP rate limits; membership/RBAC (`super_admin`, `customer`, `partner_applicant`). No production SMS.

---

## Policy status

Technical country **XX**, empty pack, all services false, all `join_public: false`, fail-closed resolver, Redis cache `policy:published:{iso}` (60s), no hardcoded India/IN law.

---

## Partner status

Catalog codes: `DOCTOR`, `PHARMACY`, `VENDOR`, `LAB`, `DELIVERY_PARTNER`, `PHLEBOTOMIST`, `PATHOLOGIST`, `CLINIC`, `HOSPITAL`, `AFFILIATE`, `HEALTHCARE_BUSINESS`. Models: Partner, PartnerApplication, KycCase, Organization, Location, Membership, invitations. Public Join UI **absent**. Internal admin APIs exist for the dark model.

---

## Event status

Transactional outbox, dispatcher CAS claim, BullMQ, retry, dead-letter, inbox, correlation id on rows/jobs. **Not** Kafka. Tests isolated (see below).

---

## Design-system / shells

`@world-pharma/ui-kit` tokens + web + RN. Customer/admin/mobile shells only. No store/catalog/cart/checkout/doctor/lab/warehouse dashboards.

---

## CI/CD status

GitHub Actions: frozen lockfile, lint, typecheck, tests, Prisma validate/generate/migrate deploy, migration drift check, Redis 7 probe, `nx build api/ds-web/web-customer/web-admin`, mobile typecheck, `scripts/ci/audit.mjs`, Gitleaks. Dockerfile + Compose API profile exist. **No deploy job.**

---

## Observability status

JSON logs, request/correlation ids, in-process Prometheus `/metrics`, `/health` + `/health/ready`.  

**HUMAN DECISION / DEFERRED (OD-OBS-01):** OpenTelemetry exporter, Sentry (or equivalent). Not treated as an implementation defect. Do not install a vendor without explicit approval.

---

## Test isolation fix

**Problem:** `outbox.e2e.spec.ts` raced a live `nx serve api` dispatcher on the same `outbox_events` rows (57/58).

**Fix (no claim-logic change):** Jest `globalSetup` + `applyTestIsolation()`:

- Postgres sibling DB `worldpharma_test`
- Redis logical DB `/1`
- `BULLMQ_PREFIX=wp-test`

**Proof:** API suite **61/61**; outbox file **6/6 × 5 consecutive runs**.

---

## Known vulnerabilities

From `scripts/ci/known-advisories.json` (do not force-upgrade Prisma):

| Advisory | Severity | Path | Runtime? | Safe fix now? | Release blocker? |
| --- | --- | --- | --- | --- | --- |
| GHSA-ggr8-5vv4-36mx | high | prisma → `@prisma/config` → `deepmerge-ts` | No (CLI) | No (untested Prisma pin) | review-before-prod |
| GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 | mod/high | next → postcss | No (ds-web/dev) | Next minor later | no |
| GHSA-rgw5-rvv9-x895 | high | nx → brace-expansion | No (CLI) | Wait Nx patch | no |
| GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq | high | webpack/metro image-size | No (toolchain) | none advertised | no |

Mitigation: do not pass untrusted objects to Prisma CLI config; do not treat ds-web as a public CSS processor.

---

## Known limitations

- Windows Prisma engine DLL lock while API/Jest holds `query_engine-windows.dll.node` (`EPERM` on `prisma generate`). **Process lifecycle**, not schema corruption. Stop the API (or wait for Jest) before generate.
- Native APK/IPA not built (no `android/`/`ios/` trees, no Android SDK here).
- Jest workers may need force-exit (open handles); tests still pass.
- Hosted Postgres/Redis/object store not provisioned.
- `/metrics` unauthenticated locally (documented deferral).
- Compose Redis has no AUTH password (local only).

---

## Human decisions (still open)

Do not invent answers:

- Launch country (OD-COUNTRY-01)
- Legal brand / entity (OD-BRAND-01)
- Controller vs processor
- Cloud account / billing
- SMS/OTP vendor
- Merchant of record
- PSP
- Pharmacy / telehealth / lab licenses
- Observability vendor (OD-OBS-01)
- Final typography/brand
- Production native signing / store accounts

---

## Production blockers

Local Phase 0 foundation is not a production go-live. Blockers for **any** public/prod traffic: human decisions above, secrets manager, TLS, Redis AUTH, `/metrics` auth, advisory review, WAF, real OTP vendor, legal packs. **Phase 1 is not authorized by this document.**

---

## Product scope (expected absent)

Not implemented as product: Store, Catalog, Product, SKU, Pricing, Inventory, Warehouse ops, Cart, Checkout, Payment, Order, Delivery, DHL, Doctor, Lab, CRM, Affiliate, Promo.

---

## [38] checklist vs repo

| Item | Classification |
| --- | --- |
| 8.1 Repository / shells / no public join | DONE |
| 8.2 Identity (synthetic OTP, JWT/refresh, TOTP schema, seeds) | DONE |
| 8.3 Country XX empty pack, fail-closed | DONE |
| 8.4 Dark partner catalog + model, no Join UI | DONE |
| 8.5 Compose PG + Prisma + UUIDv7 + RLS in migrations + audit | DONE (hosted PG HUMAN) |
| 8.6 `/health` `/health/ready`, validation, Problem+JSON, JWT, RBAC | DONE |
| 8.7 Outbox, BullMQ, retry/DLQ, inbox | DONE |
| 8.8 Secrets gitignored, OTP RL, headers, identity audit, no open upload | DONE |
| 8.9 JSON logs + request id + in-process metrics + CI health | PARTIAL |
| 8.9 OTel traces + Sentry | HUMAN DECISION / DEFERRED |
| 8.10 CI lint/typecheck/test/build/scan/audit | DONE |
| Hosted `dev` | HUMAN DECISION / BLOCKED |
| Native store binaries | DEFERRED (env) |

---

## AREA \| STATUS \| EVIDENCE \| BLOCKER \| OWNER/DECISION

| AREA | STATUS | EVIDENCE | BLOCKER | OWNER/DECISION |
| --- | --- | --- | --- | --- |
| Monorepo | DONE | Nx apps/packages | no | eng |
| Identity | DONE | `apps/api/src/identity`, e2e | no | eng |
| Policy XX | DONE | `policy` module + e2e | launch country | business + legal |
| Partner dark | DONE | partner e2e; no Join UI | no | eng |
| Outbox/BullMQ | DONE | outbox e2e 6/6 ×5; ready bullmq=up | no | eng |
| Security kernel | DONE | security e2e | not a certification | eng |
| Observability vendor | DEFERRED | `/metrics` only | OD-OBS-01 | human |
| Design system | DONE | ui-kit 10/10 | brand fonts | human later |
| Customer shell | DONE | 3/3, build 113 kB | no | eng |
| Admin shell | DONE | 3/3, gated nav | no | eng |
| Mobile shell | DONE | 3/3, Expo config | APK/IPA env | eng / later stores |
| CI | DONE | `.github/workflows/ci.yml` | no | eng |
| Compose PG16/Redis7 | DONE | compose ps healthy | Docker Desktop on Windows | eng |
| Hosted cloud | HUMAN DECISION | none | billing | founder + eng |
| Advisories | PARTIAL | known-advisories.json | review-before-prod | eng |
| Prisma Windows lock | LIMITATION | EPERM while process holds DLL | stop process before generate | eng |
| Phase 1 / Store | NOT STARTED | scope audit | must not start | product |

---

## Verification snapshot (26 Aug 2026)

| Check | Result |
| --- | --- |
| API tests | 61/61 |
| Outbox isolation | 6/6, five consecutive runs |
| config | 5/5 |
| ui-kit | 10/10 |
| web-customer | 3/3 |
| web-admin | 3/3 |
| mobile | 3/3 |
| shell-core / shell-web | 5 + 1 |
| lint / typecheck (those projects) | pass (api lint: 0 errors) |
| Compose | postgres healthy, redis 7.4.11 healthy |

Live process (one `nx serve api` on :4000):

- `GET /health` → 200 `{"status":"ok"}`
- `GET /health/ready` → 200 `{"status":"ready","postgres":"up","redis":"up","redis_version":"7.4.11","bullmq":"up"}`

---

## Sign-off rule

Engineering may record: **TECHNICALLY READY FOR HUMAN SIGN-OFF**.

Humans (founders, legal, finance) must still sign. Until then Phase 0 is **not** fully approved and Phase 1 must not start.
