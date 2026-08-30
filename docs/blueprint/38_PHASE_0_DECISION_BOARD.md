# 38 — Phase 0 Decision Board

**Status:** Planning (no production code)  
**Audience:** Founders, engineering, product, legal, finance  
**Related:** [Index](00_MASTER_INDEX.md) · [Open decisions](35_OPEN_DECISIONS.md) · [Audit](37_BLUEPRINT_AUDIT_REPORT.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md) · [Implementation plan](39_PHASE_0_IMPLEMENTATION_PLAN.md)

This board **classifies** every ID in [35](35_OPEN_DECISIONS.md) and **locks engineering defaults** for Phase 0. It does **not** invent legal, commercial, or country answers.

**Markers:** `REQUIRES_HUMAN_DECISION` — founder / finance / legal / PSP / clinical. Engineering must not invent those answers.

---

## 0. How to use this board

| Status | Meaning |
| --- | --- |
| `CONFIRMED` | Locked in the blueprint. Implement. |
| `ENGINEERING_DEFAULT` | Proceed in Phase 0 with the stated default. Revisit only with a written change. |
| `REQUIRES_HUMAN_DECISION` | Do not invent. Use a safe technical placeholder until filled. |
| `DEFERRED` | Explicitly not needed for Phase 0. |

**Gates:**

| Gate | Meaning |
| --- | --- |
| `MUST_DECIDE_BEFORE_PHASE_0` | Blocks a **shared hosted** foundation **or** day-1 repo shape. Local Docker can start with defaults. |
| `MUST_DECIDE_BEFORE_PHASE_1` | Before customer catalog / staff pharmacy (still no live pay). |
| `MUST_DECIDE_BEFORE_LIVE_PAYMENTS` | Phase 2 go-live. |
| `MUST_DECIDE_BEFORE_DOCTOR_GO_LIVE` | Phase 4 paid consults. |
| `MUST_DECIDE_BEFORE_LAB_GO_LIVE` | Phase 5. |
| `CAN_DEFER` | Later phase or never v1. |

**Phase 0 product rule:** no customer pharmacy, doctor, lab, delivery, or marketplace screens. Shells + identity + empty Country Policy Pack + partner **model** with `join_public: false` everywhere.

---

## 1. Classification of all open decisions

Confirmed (not open): **OD-ARCH-01** modular monolith; recording **off**; ledger from Phase 2; policy packs scaffold Phase 0; no PAN/CVV; no multi-vendor goods order v1.

### 1.1 MUST_DECIDE_BEFORE_PHASE_0

These shape the repo or the first hosted `dev`. **Engineering defaults are enough to start coding the foundation.** Cloud/account is `REQUIRES_HUMAN_DECISION` only if the team wants a non-default provider or cannot accept AWS cost.

| ID | Gate | Status | Note |
| --- | --- | --- | --- |
| OD-ARCH-01 | P0 | `CONFIRMED` | Modular monolith |
| OD-CLOUD-01 | P0 (hosted `dev`) | `ENGINEERING_DEFAULT` AWS; **REQUIRES_HUMAN_DECISION** if not AWS | Local compose does not need this on day 1 |
| OD-ORCH-01 | P0 (hosted) | `ENGINEERING_DEFAULT` ECS Fargate if AWS; Cloud Run if GCP | No Kubernetes |
| OD-MONO-01 | P0 | `ENGINEERING_DEFAULT` **Nx** | Turbo acceptable if team rejects Nx weight |
| OD-CI-01 | P0 | `ENGINEERING_DEFAULT` GitHub Actions if GitHub | Match VCS |
| OD-IAC-01 | P0 (hosted) | `ENGINEERING_DEFAULT` Terraform | |
| OD-CDN-01 | P0 (public URL) | `ENGINEERING_DEFAULT` Cloudflare CDN+WAF | Can wait until first public URL |
| OD-OBS-01 | P0 | `ENGINEERING_DEFAULT` OpenTelemetry + Sentry + cloud metrics | |
| OD-SEC-03 | P0 | `ENGINEERING_DEFAULT` sliding refresh + hard cap | |
| OD-SEC-04 | P0 | `ENGINEERING_DEFAULT` cloud-managed CMK per class | Local: dotenv + local disk |
| OD-SEC-05 | P0 | `ENGINEERING_DEFAULT` cloud secrets manager | Local: `.env` gitignored |
| OD-DR-01 | P0 (hosted) | `ENGINEERING_DEFAULT` PITR ≤ 5 min; RTO hours single region | |
| OD-FLAG-01 | P0 | `ENGINEERING_DEFAULT` OSS flags (Unleash/Flagsmith or homegrown table) | Pack ≠ experiment flag |
| OD-DEV-01 | P0 | `ENGINEERING_DEFAULT` web preview optional | |
| OD-ADM-06 | P0 | `ENGINEERING_DEFAULT` packs in Postgres | |
| OD-ADM-07 | P0 | `ENGINEERING_DEFAULT` audited session var; never DISABLE RLS | |
| OD-ADM-09 | P0 | `ENGINEERING_DEFAULT` pack publish = super_admin + checklist | Legal still fills values |
| OD-DB-01 | P0 | `ENGINEERING_DEFAULT` TEXT + CHECK | |
| OD-DB-03 | P0 | `ENGINEERING_DEFAULT` unique membership tuple | |
| OD-DB-10 | P0 | `ENGINEERING_DEFAULT` PG schemas per context | |
| OD-API-07 | P0 | `ENGINEERING_DEFAULT` single API, no BFF | |
| OD-EVT-01 | P0 | `ENGINEERING_DEFAULT` SCREAMING_SNAKE | |
| OD-EVT-05 | P0 | `ENGINEERING_DEFAULT` at-least-once + inbox | |
| OD-UX-09 | P0 | `ENGINEERING_DEFAULT` one admin Next app | Shells only, no ERP screens |
| OD-DS-04/05/07/08/09 | P0 | `ENGINEERING_DEFAULT` placeholders | Brand later |

**OD-COUNTRY-01** is **not** in this list. Phase 0 uses a technical country `TBD` / pack id `empty`. Naming a real launch country is `REQUIRES_HUMAN_DECISION` and **MUST_DECIDE_BEFORE_PHASE_1** (catalog) — not for hello-identity.

**OD-BRAND-01** is **not** P0. Internal name World Pharma. No store listing.

**OD-EHR-01 / OD-CMP-01** controller vs processor: **REQUIRES_HUMAN_DECISION**. Architecture supports both. **MUST_DECIDE_BEFORE_PHASE_1** if any real personal data is stored; Phase 0 synthetic users only.

### 1.2 MUST_DECIDE_BEFORE_PHASE_1

| ID | Status |
| --- | --- |
| OD-COUNTRY-01 | `REQUIRES_HUMAN_DECISION` (business + legal) |
| OD-BRAND-01 | `REQUIRES_HUMAN_DECISION` (store/legal naming; not code) |
| OD-ARCH-02 | `ENGINEERING_DEFAULT` one RN workspace, separate listings |
| OD-SEARCH-01 | `ENGINEERING_DEFAULT` managed OpenSearch |
| OD-SEC-01 | `ENGINEERING_DEFAULT` TOTP for professionals; passkeys later |
| OD-SEC-02 | `ENGINEERING_DEFAULT` customer OTP-first |
| OD-NTF-01 | `REQUIRES_HUMAN_DECISION` SMS/WhatsApp vendor; adapter stub in P0 |
| OD-ANL-01 | `CAN_DEFER` product analytics vendor; no PHI warehouse |
| OD-MOB-01 | `CAN_DEFER` OTA JS |
| OD-CUS-05 | `ENGINEERING_DEFAULT` no social until pack |
| OD-RBAC-02 / OD-CRM-04 | `ENGINEERING_DEFAULT` support **no** Rx images |
| OD-ADM-04/05, OD-CMP-06/08 | Dual control CMS/export | `ENGINEERING_DEFAULT` yes for bulk PII |
| OD-I18N-03 | `ENGINEERING_DEFAULT` technical `en` keys |
| OD-I18N-10 | `REQUIRES_HUMAN_DECISION` OTP sender registration |
| OD-DB-02/04/05 | `ENGINEERING_DEFAULT` as 35 |
| OD-API-03/04/06/08/09/10 | `ENGINEERING_DEFAULT` as 35 |
| OD-EVT-07 | `ENGINEERING_DEFAULT` events + fetch-by-id |
| OD-NOT-02/04/05/08/12 | `ENGINEERING_DEFAULT` / pack |
| OD-NOT-01 | `REQUIRES_HUMAN_DECISION` BSP |
| OD-SRCH-* (except 01) | When search ships in P1 |
| OD-UX-02/03/07 | `ENGINEERING_DEFAULT` |
| OD-DS-01 | `REQUIRES_HUMAN_DECISION` brand; placeholders OK |
| OD-DS-06 | System UI until licensed |

### 1.3 MUST_DECIDE_BEFORE_LIVE_PAYMENTS (Phase 2)

All **OD-PAY-***, **OD-FX-***, **OD-LED-02/04/05/06/09/10/11**, **OD-CUS-02/03/14**, **OD-PHARM-01/02/08/09**, **OD-PHARM-03/05/06/07/10**, **OD-LOG-01/02/04/05/06/09/13**, **OD-PHE-04**, **OD-ADM-01/02/03**, **OD-I18N-02/04/06/08**, **OD-CMP-09**, **OD-API-01/05**, **OD-EVT-03/04/08/11**, **OD-NOT-11/14**, **OD-UX-01/05**, **OD-CUS-06**.

**REQUIRES_HUMAN_DECISION (do not invent):** OD-PAY-01 merchant of record, OD-PAY-05 wallet, OD-PAY-07 SCA mandates, OD-PAY-04 COD cash policy, PSP vendor choice, OD-LED-05 rider worker classification **accounting**.

### 1.4 MUST_DECIDE_BEFORE_DOCTOR_GO_LIVE (Phase 4)

**OD-DOC-***, **OD-VID-*** (except recording stays off), **OD-EHR-02/03/06/07/09/10**, **OD-RBAC-01/04/05**, **OD-CMP-03/05**, **OD-PTR-02/03**, **OD-DB-12**, **OD-NOT-10/13**, **OD-UX-08**, **OD-SRCH-04**.

**REQUIRES_HUMAN_DECISION:** telemedicine eligibility, fee-split (OD-DOC-04), no-show fees (OD-DOC-02), recording if ever on, license document list in pack.

### 1.5 MUST_DECIDE_BEFORE_LAB_GO_LIVE (Phase 5)

**OD-LAB-***, **OD-LED-01**, **OD-PHE-*** (except 04), **OD-LOG-11/12**, **OD-LAB-08** e-sign, **OD-I18N-09**, **OD-NOT-06/07**, **OD-EVT-09/10**, **OD-DB-06**, **OD-UX-10**.

**REQUIRES_HUMAN_DECISION:** lab licensing, pathologist e-sign mechanism, bill-on-report vs booking (finance+clinical).

### 1.6 CAN_DEFER

OD-PROD-01/02/03, OD-CUS-01 (UI mix), 04, 07–13, OD-CRM-03/05/07/08, OD-AFF-*, OD-SLA-01, OD-PAY-13 BNPL, OD-RBAC-03 caregiver, OD-EHR-04/05/08, OD-VID-07 PSTN, OD-LOG-03/07/08, OD-LED-03/13/14, OD-I18N-01/05/07, OD-CMP-02/07, OD-API-02, OD-EVT-02/06, OD-NOT-03/09, OD-SRCH-01 at P3, OD-UX-04/06, OD-DS-02/03, OD-PTR-01/04/05/06, OD-ROAD-01 calendar, OD-QA-01 RN e2e depth (P2), OD-VID-01 LiveKit hosting (P4).

---

## 2. Product

### 2.1 Launch country

| | |
| --- | --- |
| **Decision** | First operating country |
| **Current recommendation** | Do **not** hardcode a country. Phase 0 pack `country_code: TBD`, ISO placeholder `XX` **or** a real ISO **only if** humans name it. |
| **Alternatives** | Name India / UAE / other |
| **Why** | Kernel must be country-scoped from day one; **naming** the country is law + entity + payments, not a TypeScript enum. |
| **Impact** | Region of hosted `dev` (OD-CLOUD-01); later catalog and PSP |
| **Owner** | business + legal |
| **Status** | `REQUIRES_HUMAN_DECISION` · Gate **MUST_DECIDE_BEFORE_PHASE_1** · **not** a Phase 0 code blocker |

### 2.2 Legal entity / brand

| | |
| --- | --- |
| **Decision** | Legal name, app store name, working title “World Pharma” |
| **Current recommendation** | Internal: World Pharma. **No** store listing, no “licensed pharmacy” claims. |
| **Alternatives** | Final brand now |
| **Why** | Store listing and medical advertising are legal. Code uses config `brand.display_name`. |
| **Impact** | Certificates, emails, legal footer |
| **Owner** | business + legal |
| **Status** | `REQUIRES_HUMAN_DECISION` · **MUST_DECIDE_BEFORE_PHASE_1** for public listing · **CAN_DEFER** for Phase 0 |

### 2.3 Initial service scope (Phase 0)

| | |
| --- | --- |
| **Decision** | What is **on** in the empty pack |
| **Current recommendation** | All regulated services **`false`**. `partner_types.*.join_public: false`. Identity + admin shell + customer **shell** (login only). No pharmacy/doctor/lab/delivery/marketplace UI. |
| **Alternatives** | Enable one service early — **rejected** for Phase 0 |
| **Why** | Audit 37: safe defaults. |
| **Impact** | Pack JSON schema must still list keys so later enablement is config |
| **Owner** | engineering (schema) / product (later enablement) |
| **Status** | `CONFIRMED` for Phase 0 scope |

---

## 3. Architecture

### 3.1 Cloud provider

| | |
| --- | --- |
| **Decision** | Primary cloud |
| **Current recommendation** | **AWS** ([29](29_INFRASTRUCTURE_ARCHITECTURE.md)). Single cloud. |
| **Alternatives** | GCP (acceptable). Azure not default. |
| **Why** | Managed Postgres/Redis/S3/IAM maturity; ECS Fargate without Kubernetes. |
| **Impact** | Account, IAM, region. Cost. |
| **Owner** | eng; **founder/finance** if they refuse AWS |
| **Status** | `ENGINEERING_DEFAULT` · hosted Phase 0 · `REQUIRES_HUMAN_DECISION` to override · Local compose **unblocks first commit** |

### 3.2 Repository / monorepo

| | |
| --- | --- |
| **Decision** | One repo vs many |
| **Current recommendation** | **One monorepo** `apps/` + `packages/` ([04](04_APPLICATION_ARCHITECTURE.md) §5). |
| **Alternatives** | Polyrepo — rejected v1 |
| **Why** | Shared identity, types, UI kit |
| **Impact** | CI graph, versioning |
| **Owner** | eng |
| **Status** | `CONFIRMED` |

### 3.3 Package manager

| | |
| --- | --- |
| **Decision** | npm / yarn / pnpm |
| **Current recommendation** | **pnpm** (workspaces, disk, Nx-friendly). |
| **Alternatives** | npm workspaces, yarn |
| **Why** | Strict node_modules, speed |
| **Impact** | Lockfile, CI cache |
| **Owner** | eng |
| **Status** | `ENGINEERING_DEFAULT` · **MUST_DECIDE_BEFORE_PHASE_0** (day 1) |

### 3.4 Nx vs Turborepo

| | |
| --- | --- |
| **Decision** | OD-MONO-01 |
| **Current recommendation** | **Nx** with `tags` so `identity` cannot import `order` internals. |
| **Alternatives** | Turborepo + eslint-boundaries (lighter) |
| **Why** | Blueprint forbids deep module imports; Nx enforces it. |
| **Impact** | Day-1 repo scaffolding |
| **Owner** | eng |
| **Status** | `ENGINEERING_DEFAULT` · **MUST_DECIDE_BEFORE_PHASE_0** |

### 3.5 Backend framework

| | |
| --- | --- |
| **Decision** | API stack |
| **Current recommendation** | **NestJS + TypeScript** modular monolith ([04](04_APPLICATION_ARCHITECTURE.md)). |
| **Alternatives** | Spring, .NET, Go — not selected |
| **Why** | Module DI, same language as clients |
| **Impact** | Entire API |
| **Owner** | eng |
| **Status** | `CONFIRMED` |

### 3.6 Web framework

| | |
| --- | --- |
| **Decision** | Web stack |
| **Current recommendation** | **Next.js App Router** — `web-customer` (shell), `web-admin` (shell), later `web-join` **flagged off**. |
| **Alternatives** | Remix, Vite SPA |
| **Why** | SEO later; one React skill |
| **Impact** | App folders |
| **Owner** | eng |
| **Status** | `CONFIRMED` |

### 3.7 React Native architecture

| | |
| --- | --- |
| **Decision** | OD-ARCH-02 |
| **Current recommendation** | **One RN workspace**, Expo for Phase 0 **hello shell only**, build flavors later; **separate store listings** when listing. No customer pharmacy screens in P0. |
| **Alternatives** | Bare RN; many RN apps |
| **Why** | Speed of hello-auth; flavors later |
| **Impact** | `apps/mobile` |
| **Owner** | eng |
| **Status** | `ENGINEERING_DEFAULT` · listing **MUST_DECIDE_BEFORE_PHASE_1** |

---

## 4. Infrastructure

| Decision | Current recommendation | Alternatives | Why | Impact | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Database | **PostgreSQL 16** managed | MySQL, Cockroach | Integrity, JSON, GIS, RLS | All OLTP | eng | `CONFIRMED` |
| Redis | **Redis 7** managed | KeyDB | Cache, BullMQ, sessions, pub/sub | Queue + cache | eng | `CONFIRMED` |
| Object storage | S3 API; **MinIO local**; S3 when AWS | GCS | KYC/Rx later; P0 only non-PHI avatars optional | Uploads | eng | `ENGINEERING_DEFAULT` |
| CDN | Cloudflare | CloudFront | CDN+WAF one vendor | Public assets | eng | `ENGINEERING_DEFAULT` · public URL |
| Queue | **BullMQ on Redis** | SQS, Rabbit | Matches monolith; Kafka later OD-EVT-02 | Outbox dispatcher | eng | `CONFIRMED` |
| Search | **OpenSearch** — **not required to be live in P0** | Algolia | P1 catalog | Index | eng | P1 |
| Secrets | Cloud Secrets Manager / SSM | Vault | OD-SEC-05 | No secrets in git | eng | `ENGINEERING_DEFAULT` |
| WAF | Cloudflare WAF or cloud WAF | None on localhost | Rate/bot | Public API | eng | `ENGINEERING_DEFAULT` · public URL |
| Monitoring | OTel traces/metrics + Sentry errors + cloud logs | Datadog all-in | OD-OBS-01 | P0 health | eng | `ENGINEERING_DEFAULT` |
| Compute (hosted) | ECS Fargate (AWS) / Cloud Run (GCP) | k8s | No k8s day one | Deploy | eng | `ENGINEERING_DEFAULT` |
| Region | After OD-COUNTRY-01; until then **one** region e.g. `eu-central-1` or `ap-south-1` as **placeholder** | — | Do not imply launch country | Latency, residency | eng + legal | Placeholder ≠ legal residency |

---

## 5. Engineering

| Decision | Current recommendation | Alternatives | Why | Impact | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| CI/CD | GitHub Actions (if GitHub) | GitLab CI | OD-CI-01 | Pipelines | eng | `ENGINEERING_DEFAULT` |
| Branch | Trunk-based, short PRs, protected `main` | git-flow | [32](32_DEVOPS_CICD.md) | Velocity | eng | `ENGINEERING_DEFAULT` |
| Code quality | ESLint + Prettier + TypeScript strict + Nx module boundaries | Weaker lint | Healthcare later | CI | eng | `ENGINEERING_DEFAULT` |
| Testing | Unit + contract; no PHI in fixtures | Heavy e2e now | P0: health, auth, pack loader | [31](31_TESTING_STRATEGY.md) | eng | `ENGINEERING_DEFAULT` |
| Environments | local / dev / staging / prod (prod empty) | Preview optional | Synthetic data only | [32](32_DEVOPS_CICD.md) | eng | `ENGINEERING_DEFAULT` |
| Workflow | PR required; secret scan; no `--no-verify` culture | — | Security | Culture | eng | `ENGINEERING_DEFAULT` |
| IaC | Terraform | CDK | OD-IAC-01 | Hosted env | eng | `ENGINEERING_DEFAULT` |
| Migrations | Expand/contract; Prisma or Drizzle **OPEN tool** | Flyway | Need one ORM/migration runner | Day 1 schema | eng | `ENGINEERING_DEFAULT` **Prisma** or **Drizzle** — pick **Prisma** for Nest ecosystem unless team objects |

**ORM:** `ENGINEERING_DEFAULT` **Prisma** + PostgreSQL. Alternative Drizzle. **MUST_DECIDE_BEFORE_PHASE_0** (day 1 schema). Not in 35; this board adds it as an engineering tool choice, not a product OD.

---

## 6. Security

| Decision | Current recommendation | Alternatives | Why | Impact | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication | OTP (email/SMS adapter) + password for professional/admin; JWT access + rotating refresh | Password-only customers | OD-SEC-02 | Identity module | eng | `ENGINEERING_DEFAULT` |
| MFA | **Ready**: TOTP enrollment tables; **not required** for synthetic P0 users; **required** professionals/admins before prod | Passkeys first | OD-SEC-01 | Schema now, enforce later | eng | `ENGINEERING_DEFAULT` |
| Session | Short access JWT; rotating refresh; device bind fields; `aud` per family including `partner_applicant` | Long-lived JWT | OD-SEC-03 | Auth middleware | eng | `ENGINEERING_DEFAULT` |
| Secrets | No secrets in git; `.env.example` only | Vault | OD-SEC-05 | Leak risk | eng | `ENGINEERING_DEFAULT` |
| Encryption | TLS in transit; PG at rest; app-level later for KYC/health | Single CMK | OD-SEC-04 | Key classes | eng | `ENGINEERING_DEFAULT` |
| Audit | Append-only `audit_logs`; actor, membership, country, request_id | DB triggers only | [20](20_DATABASE_ARCHITECTURE.md), [27](27_SECURITY_ARCHITECTURE.md) | Compliance | eng | `ENGINEERING_DEFAULT` |
| Rate limit | Gateway + API (OTP strict) | Later | Abuse | OTP | eng | `ENGINEERING_DEFAULT` |
| Uploads | Presign later; P0 may disable user uploads or allow avatar MIME allow-list + virus scan stub | Proxy all | OD-API-10 | KYC in later phase | eng | P0: **prefer no KYC blobs** |

---

## 7. Observability

| Decision | Current recommendation | Alternatives | Why | Impact | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Logs | Structured JSON, correlation_id, **no secrets/PHI** | Ad-hoc console | [30](30_OBSERVABILITY.md) | Debug | eng | `ENGINEERING_DEFAULT` |
| Metrics | OTel metrics; RED for API; queue depth | Cloud-only | | SLOs later | eng | `ENGINEERING_DEFAULT` |
| Traces | OTel traces, sampling | None | Auth/pack paths | Latency | eng | `ENGINEERING_DEFAULT` |
| Errors | Sentry (or equivalent) | None | OD-OBS-01 | | eng | `ENGINEERING_DEFAULT` |
| Alerts | P0: API 5xx, deploy fail, disk, queue stuck | PagerDuty later | | On-call later | eng | `ENGINEERING_DEFAULT` |

---

Engineering audit of these boxes (DONE / PARTIAL / DEFERRED / HUMAN DECISION) is recorded in [49](49_PHASE_0_FINAL_AUDIT.md). Checking a box here is **not** legal or business approval.

## 8. Phase 0 definition of done

Phase 0 is **complete** only when **all** boxes below are true. None of these are customer pharmacy, doctor, lab, delivery, or marketplace **product** screens.

### 8.1 Repository

- [ ] Monorepo created (`pnpm` + **Nx**)
- [ ] Apps: `api` (NestJS), `web-customer` (Next **shell**), `web-admin` (Next **shell**), `mobile` (RN **hello/auth shell** only)
- [ ] Packages: `shared-types`, `ui-kit` (tokens only), eslint/tsconfig
- [ ] `docs/blueprint` remains linked from root README
- [ ] `web-join` **optional folder stub** or omitted; **no public join UI**

### 8.2 Identity

- [ ] Person / Account / Session / Device tables
- [ ] Register/login OTP **on synthetic adapters** (console/mailhog, not production SMS)
- [ ] Session: access JWT + refresh rotation
- [ ] MFA **schema** (TOTP) ready; enforcement flag default off except we can enable for admin in staging
- [ ] Role/permission/membership seed: `super_admin`, `customer`, `partner_applicant` (no extra product roles required in UI)

### 8.3 Country

- [ ] Policy pack **engine** (load versioned JSON)
- [ ] Empty initial pack: locales, currency ISO, timezone IANA, **all services false**
- [ ] Schema includes: currency, language, service availability, **`partner_types.*.join_public: false`**
- [ ] No hardcoded launch-country law

### 8.4 Partner (foundation only)

- [ ] PartnerType catalog table/seed (codes exist)
- [ ] Every type `join_public: false`
- [ ] Partner, PartnerApplication, Organization, Membership **tables/state enums**
- [ ] KYC **model** (KycCase nested) — **no production document pipeline required**
- [ ] Status machine implemented as **domain types + tests**, not a public wizard
- [ ] **No** public Join us marketing site

### 8.5 Data

- [ ] PostgreSQL connection (compose + optional hosted)
- [ ] Migration strategy (Prisma migrate or equivalent)
- [ ] UUID v7 (or documented v7 generator)
- [ ] Money as **integer minor units** + ISO currency on any money column introduced
- [ ] `country_id` on tenant tables
- [ ] RLS enabled; never globally disabled; platform bypass audited (OD-ADM-07)
- [ ] Audit table + write path for identity mutations

### 8.6 Backend

- [ ] `/health` `/ready`
- [ ] Validation (class-validator/zod)
- [ ] Problem+JSON errors
- [ ] Authn middleware (JWT)
- [ ] Authz middleware (permission + scope)
- [ ] Country header / JWT country check

### 8.7 Events

- [ ] Envelope + SCREAMING_SNAKE
- [ ] Transactional outbox table
- [ ] BullMQ worker consuming outbox
- [ ] Retry + DLQ
- [ ] Inbox idempotency for at-least-once

### 8.8 Security

- [ ] Secrets not in git
- [ ] Rate limit on OTP
- [ ] Security headers on web
- [ ] Audit logging identity events
- [ ] Upload architecture documented; **no open unauthenticated upload**

### 8.9 Observability

- [ ] JSON logs + request id
- [ ] Metrics scrape or OTel export
- [ ] Tracing on API
- [ ] Error tracker on API
- [ ] Health checks in CI/deploy

### 8.10 CI/CD

- [ ] Lint, typecheck, unit tests, build
- [ ] Secret scan / dependency audit (high+)
- [ ] Pipeline on PR

**Explicitly OUT of Phase 0 DoD:** catalog, inventory, checkout, PSP, LiveKit, OpenSearch production, public partner join, any PHI, store submission.

---

## 9. Remaining blockers (human)

These **do not** stop the first implementation task (local monorepo). They **do** stop later gates:

| Blocker | Gate | Who |
| --- | --- | --- |
| Launch country | Phase 1 | business + legal |
| Legal entity / brand | Public listing | business + legal |
| Controller vs processor | Before real PII | legal |
| Cloud account / billing | Hosted `dev` | founder + eng |
| SMS/OTP vendor | Phase 1 real OTP | ops + legal |
| Merchant of record | Live payments | legal + finance |
| PSP contract | Live payments | finance |
| Pharmacy / telehealth / lab licenses | Those go-lives | legal |

---

## 10. Exact first implementation task (when coding is authorized)

**Not this PR.** When Phase 0 coding is approved:

> Initialize the **Nx + pnpm** monorepo with `apps/api` (NestJS `GET /health`), Docker Compose for **PostgreSQL 16 + Redis**, Prisma (or chosen ORM) empty migration, CI lint/typecheck, gitignored `.env`, and root README still pointing at `docs/blueprint/00_MASTER_INDEX.md`. No domain UI.

See [39](39_PHASE_0_IMPLEMENTATION_PLAN.md) workstream A.
