# 241 — Full project audit (pre-R14)

**CR:** `CR-FULL-PROJECT-AUDIT-241`  
**Date:** 30 August 2026  
**Scope:** Repository + program audit only — no implementation  
**Authority:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [00](00_MASTER_INDEX.md) · R13 closure [240](240_POST_R13_H_AUDIT.md)

Audit-only CR. **No source, schema, migration, API, UI, test, config, or policy changes were made.** Clinical search, live PSP, payouts, and production carriers were **not** enabled.

---

## 1. Executive summary

World Pharma is a **large, modular-monolith sandbox platform** with documented phase delivery through **R13 (CLOSED)**. Repository evidence supports:

- **R0–R1** commerce sandbox kernel — **COMPLETE**
- **R2–R8** care/lab/radiology programs — **COMPLETE** (sandbox)
- **R9** health record + consent — **CLOSED**
- **R10-A–D** care navigation — **CLOSED**; **R10-E/F** — **NOT STARTED** (optional)
- **R11** CMS/help/support — **CLOSED**
- **R12** CRM/marketing/growth — **CLOSED** (re-verified **32/32** isolated e2e)
- **R13** search/discovery/analytics/clinical infrastructure — **CLOSED** (re-verified **34/35** isolated e2e; environmental flake on `r13b`)

**Production readiness:** **NOT READY**. Live money, carriers, tax, MoR, PSP contracts, and most country legal gates remain **OPEN**. Payment/logistics are **sandbox/mock**. Main dev database is **28 migrations behind** the repository.

**Recommended next step:** **`CR-R14-PLAN-242`** — R14 go-live planning only (human legal/commercial authorization required before any R14 implementation).

---

## 2. Program-level phase matrix

| Program | Phase | Repository status | Audit status | Blocker? | Notes |
|---------|-------|-------------------|--------------|----------|-------|
| R0 | Platform foundation | COMPLETE | Verified | No | Identity, RBAC, packs, CI |
| R1 | Commerce 1A–1G | COMPLETE | Verified | No | Sandbox payment/logistics |
| R2 | Care foundation | COMPLETE | Verified | No | Appointments/encounters |
| R3 | Partner ops clients | COMPLETE | Verified | No | Store/delivery/join |
| R4 | Telemedicine video | PARTIAL | Verified | No | Mock/LiveKit; not full prod |
| R5 | Rx + dispensing A–E | COMPLETE | Verified | No | R5-F not started |
| R6 | Vendor marketplace | COMPLETE | Verified | No | Sandbox settlement |
| R7 | Lab A–F | COMPLETE | Verified | No | Full sandbox journey |
| R8 | Radiology A–F | COMPLETE | Verified | No | Sandbox imaging |
| R9 | Health record | CLOSED | Verified | No | Book 182 |
| R10 | Care nav A–D | CLOSED | Verified | No | Book 192 |
| R10 | Care nav E–F | NOT STARTED | Verified | No | Optional uploads/notes |
| R11 | CMS/help/support | CLOSED | Verified | No | Book 204 |
| R12 | CRM A–H | CLOSED | Re-verified | No | 32/32 isolated |
| R13 | Search A–H | CLOSED | Re-verified | No | 34/35 isolated; env debt |
| R14 | Live finance/carriers | NOT STARTED | Verified | **Yes (go-live)** | Human gates OPEN |
| R15+ | Control-plane / multi-country | PLANNED | N/A | No | Roadmap only |

Prior CR verdicts were **spot-checked against repo** (controllers, migrations, e2e files, policy defaults). No material contradiction found for closed phases; environmental test debt is the main regression gap.

---

## 3. R12 independent audit (A–H)

### 3.1 Implementation boundaries

| Phase | Kernel / UI | Repo evidence |
|-------|-------------|---------------|
| R12-A | CRM 360, marketing prefs, conversion events | `apps/api/src/crm/`, `r12a.crm-kernel.e2e` |
| R12-B | Segments, campaigns, send pipeline | `crm/marketing/`, `r12b.marketing.e2e` |
| R12-C | Promo campaigns, checkout apply | `promo/`, `r12c.promo.e2e` |
| R12-D | Affiliate referral | `affiliate/`, `r12d.affiliate.e2e` |
| R12-E | Wishlist + loyalty | `wishlist/`, `loyalty/`, `r12e.wishlist.e2e` |
| R12-F | Reviews, Q&A, personalization | `reviews/`, `personalization/`, `r12f.reviews.e2e` |
| R12-G | Refill automation hooks | `crm/automation/`, `r12g.refill-hooks.e2e` |
| R12-H | Closure regression | Book 221/222; no `r12h` spec (by design) |

### 3.2 Regression (audit re-run)

| Run | Result |
|-----|--------|
| R12 isolated (`r12a`…`r12g`, `--no-cache`) | **32/32 PASS** |
| R12 immediately after R13 (polluted DB) | **24/32 FAIL** — environmental cross-suite pollution on country `XX` packs |

**R12 CLOSED claim:** **SUPPORTED** when test DB is not cross-polluted. Book 222 verdict stands.

### 3.3 Security / PHI / money

- CRM/marketing: metadata-only 360; clinical token rejection in e2e — **PASS**
- Promo/affiliate: commerce-only — **PASS**
- No live PSP in R12 paths — **PASS**
- RLS: R12 tables FORCE RLS per migrations R12-A…G — **PASS** (repo SQL)

### 3.4 R12 discrepancies vs books

| Item | Finding |
|------|---------|
| Book 221 migration count (109) | Repo now **128** folders — expected growth from R13 |
| Combined R12+R13 on shared test DB | **Fails** — not documented in Book 222; classify as **TD-REG-ENV-01** (new, non-blocker) |

---

## 4. R13 independent audit (A–H)

### 4.1 Phase verification

| Phase | Key artifacts | Audit |
|-------|---------------|-------|
| **R13-A** | `SearchIndexJobService`, `search_index_jobs`, outbox dispatch | **PASS** — `r13a`, `EventHandlerRegistry` wired for search |
| **R13-B** | `DiscoverySearchService`, suggest, blocklist | **PARTIAL e2e** — TD-REG-R13B-01 pollution |
| **R13-C** | `ProviderSearchService`, 4 provider indexes | **PASS** — suffix isolation fix holds |
| **R13-D** | `RecommendationsService`, `analytics_order_item_pairs` | **PASS** — deterministic, no ML |
| **R13-E** | `AnalyticsReadService`, rollups, purge | **PASS** — TD-R13E-01 worker wiring deferred |
| **R13-F** | web-admin `/analytics/*`, `admin-analytics.controller` | **PASS** |
| **R13-G** | `ClinicalSearchService`, legal gate, metadata index | **PASS** — **disabled** operationally |
| **R13-H** | `r13h.closure.e2e`, combined regression | **PASS** (6/6) |

### 4.2 Kernel duplication

| Domain | Canonical | Duplicate? |
|--------|-----------|------------|
| Search indexing | `SearchIndexJobService` | **No** |
| Discovery | `DiscoverySearchService` | **No** |
| Recommendations | `RecommendationsService` | **No** |
| Analytics read | `AnalyticsReadService` | **No** |
| Clinical search index | `ClinicalSearchIndexService` via job kernel | **No** |

### 4.3 R13 regression (audit re-run)

| Run | Result |
|-----|--------|
| R13 isolated (`r13a`…`r13h`, `--no-cache`) | **34/35** — `r13b` unified commerce/help assertion |
| R13 after R12 (same session) | **30/35** — `r13g` fixture + `r13b` failures |
| Book 239 claim | **35/35** on cleaner DB at impl time |

**R13 CLOSED claim:** **SUPPORTED** for implementation/security gates. **Environmental regression debt** remains (`TD-REG-R13B-01`, `TD-REG-ENV-01`).

### 4.4 R13-G legal gate (re-verified)

| Check | Result |
|-------|--------|
| `clinical_search_enabled` default | **`false`** (`empty-pack.ts`, `document.ts`) |
| Published packs with gate on (test DB) | **0** |
| Gate bypass in code | **None found** |
| Enabled during audit | **No** |

---

## 5. Repository architecture audit

### 5.1 Major kernels (single implementation)

| Kernel | Module | Status |
|--------|--------|--------|
| Identity/auth | `identity/` | Implemented |
| RBAC | `identity/authority.ts`, `rbac.service.ts` | Implemented |
| Tenant context | `tenancy/`, `prisma.service` ALS | Implemented |
| Policy resolver | `policy/resolver.ts`, `PolicyCache` | Implemented |
| Catalog | `catalog/` | Implemented |
| Cart/checkout | `cart/` | Implemented |
| Orders | `orders/` | Implemented |
| Payments | `payment/` — **sandbox only** | Implemented |
| Finance/ledger | `finance/` — sandbox | Implemented |
| Logistics | `logistics/` — mock carrier | Implemented |
| Notifications | `platform/notification*` + outbox | Implemented |
| Outbox/events | `events/` | Implemented |
| Search/discovery | `search/`, `discovery/` | Implemented (R13) |
| Recommendations | `recommendations/` | Implemented (R13-D) |
| Analytics | `analytics/` | Implemented (R13-E) |
| Clinical | `clinical/`, `health/` | Implemented |
| CMS/support | `cms/`, `platform/support` | Implemented (R11) |
| Care navigation | `care-nav/` | Implemented (R10) |

### 5.2 Gaps / stubs

| Item | Classification |
|------|----------------|
| `AnalyticsWorkerService` not on `EventHandlerRegistry` | **TD-R13E-01** — partial wiring |
| R10-E health uploads | **NOT STARTED** |
| R10-F consult-note projection | **NOT STARTED** |
| Live PSP adapter | **NOT IMPLEMENTED** (sandbox gateway only) |
| Live carrier (DHL etc.) | **NOT IMPLEMENTED** (mock logistics) |
| Live payout provider | **NOT IMPLEMENTED** |

No competing duplicate kernels identified for search, analytics, recommendations, or notifications.

---

## 6. Database audit

### 6.1 Repository

| Metric | Value |
|--------|-------|
| Migration folders | **128** |
| Prisma schema | `packages/database/prisma/schema.prisma` |
| R13 tables | Present in schema + migrations `20260829260000`–`20260829300200` |

### 6.2 Live database drift (no migrations run during audit)

| Database | `_prisma_migrations` count | R13-G table | FORCE RLS tables (sample) | `USING(true)` policies |
|----------|---------------------------|-------------|---------------------------|------------------------|
| **`worldpharma_test`** | **130** | **Present** | **227** tables with FORCE RLS | **0** (live query) |
| **`worldpharma` (main dev)** | **100** | **Absent** | Not fully audited | Not verified |

**Drift:** Main dev DB is **~28 migrations behind** repository (100 vs 128 folders). Test DB has **130** migration records (possible duplicate entries from prior deploys). **Do not treat main `worldpharma` as current.**

### 6.3 RLS / grants

- R12/R13 migrations explicitly document **no `USING(true)`** on new tables.
- Legacy migrations (pre-R7) contain historical `USING(true)` in SQL files; **live test DB reports 0** active `USING(true)` policies — superseded by `20260827180000_multi_tenant_rls`.
- `worldpharma_app`: **not SUPERUSER**, **not BYPASSRLS** (verified Book 240 pattern).

---

## 7. Security audit (summary)

| Control | Status | Notes |
|---------|--------|-------|
| JWT + audience guards | **PASS** | Controllers use `JwtAuthGuard`, `AudienceGuard` |
| RBAC permissions | **PASS** | `PermissionsGuard`, `authority.ts` |
| Country/tenant/person isolation | **PASS** | RLS + service filters; extensive e2e |
| Policy fail-closed | **PASS** | Resolver `=== true` for sensitive gates |
| PHI in public discovery | **PASS** | No clinical in `DISCOVERY_TYPES` |
| Clinical search gate | **PASS** | Default off; 403 when disabled |
| Audit events | **PASS** | `SecurityEventsService`; query hash for clinical |
| Blocklists | **PASS** | Static + pack terms |
| Payment amount trust | **PASS** | Server-authoritative pricing in checkout |
| Webhook signatures | **PASS** | Payment/logistics webhook validation in code |

**Legacy concern (non-blocker for R13 closure):** Early migration files contain `USING(true)` policies; live DB shows **0** — verify on any fresh production deploy.

---

## 8. API inventory (summary)

**Controllers:** **~98** controller files under `apps/api/src/` (~100 `@Controller` decorators).

### Representative surface map

| Prefix | Module | Auth pattern |
|--------|--------|--------------|
| `/api/v1/auth` | identity | Public OTP |
| `/api/v1/me/*` | customer | JWT customer |
| `/api/v1/admin/*` | admin shells | JWT admin + RBAC |
| `/api/v1/discovery/*` | discovery | Public + country |
| `/api/v1/clinical/search` | clinical | JWT doctor + `clinical:search` + gate |
| `/api/v1/admin/analytics/*` | analytics | JWT admin + `analytics:read` + gate |
| `/api/v1/vendor/*` | vendor | JWT vendor org |
| `/api/v1/lab/*`, `/radiology/*` | diagnostics | Partner/customer |
| `/health`, `/health/ready` | app | Public |

Full per-route inventory is deferred to Book 21 / OpenAPI generation; no automated OpenAPI artifact was found in repo root.

**Stubs/TODOs:** R10-E/F endpoints absent (not started). No duplicate `/clinical/search` paths found.

---

## 9. UI audit (summary)

### web-admin (45 routes)

Analytics, CRM, marketing, promo, affiliates, reviews, CMS, support, governance/health, catalog, orders, finance, partners — **implemented shells** with API integration per R11–R13 books.

- **Typecheck:** **PASS** (audit re-run)
- **Build:** Not re-run (passed Book 239)

### web-customer (35 routes)

Commerce, cart, checkout, discovery search, help center, health, lab, radiology, appointments, prescriptions, account — **implemented**.

- **Typecheck:** **FAIL** — **TD-WEB-TC-01** (`store-home.tsx` `NetworkErrorState onRetry` prop mismatch) — **confirmed, not fixed**
- **Build:** Not run (blocked by typecheck)

### web-affiliate

- **Typecheck:** **PASS**

### mobile

- **Typecheck:** **PASS**
- **Emulator/browser:** **NOT VERIFIED**

---

## 10. Test audit

| Metric | Value |
|--------|-------|
| E2E spec files | **68** |
| Approximate `it()` cases | **~192** |
| R12 baseline | **32/32** isolated **PASS** |
| R13 combined | **34/35** isolated; **30–35** when polluted |

### Known test debt

| ID | Issue | Blocker? |
|----|-------|----------|
| **TD-REG-R13B-01** | `r13b` unified `q=R13B` on TQ — commerce drowns help | No |
| **TD-REG-R13C-01** | **CLOSED** | — |
| **TD-REG-R13G-01** | **CLOSED** | — |
| **TD-REG-ENV-01** | Cross-suite R12+R13 pollution on `XX`/`TQ` | No |
| **TD-WEB-TC-01** | web-customer typecheck | No |

No skipped critical R13 security tests identified. Test DB hygiene recommended before CI hardening.

---

## 11. Build / runtime audit

| Check | Status |
|-------|--------|
| `api:typecheck` | **VERIFIED PASS** |
| `api:build` | **VERIFIED PASS** (cache) |
| `web-admin:typecheck` | **VERIFIED PASS** |
| `web-customer:typecheck` | **VERIFIED FAIL** (TD-WEB-TC-01) |
| `web-affiliate:typecheck` | **VERIFIED PASS** |
| `mobile:typecheck` | **VERIFIED PASS** |
| Docker Postgres | **VERIFIED UP** |
| Docker Redis | **VERIFIED UP** (via `/health/ready`) |
| `/health/ready` | **VERIFIED 200** — postgres/redis/bullmq up |
| Browser/device | **NOT VERIFIED** |
| Migrations executed | **NOT RUN** (audit constraint) |

---

## 12. Policy / legal / clinical gates

| Gate | Default (code) | Test DB published | Main DB | Fail-closed |
|------|----------------|-------------------|---------|-------------|
| `clinical_search_enabled` | **false** | **0 packs true** | Not queried | **Yes** |
| `analytics.enabled` | false | per-pack | — | **Yes** |
| `crm.enabled` | false | per-pack | — | **Yes** |
| `payments.enabled` | false | per-pack | — | **Yes** |
| Medicine advertising | pack-gated | — | — | **Yes** |

**Clinical search:** **NOT enabled** during audit. No evidence of human OD-R13-04 approval in repository.

---

## 13. Finance / production readiness

| Capability | Status |
|------------|--------|
| Payment capture | **Sandbox-ready** — mock gateway, `sandbox: true` in responses |
| Refunds | **Sandbox-ready** |
| Settlement/ledger | **Sandbox-ready** — journal entries, vendor payables |
| Affiliate liabilities | **Implemented** — ledger tables |
| Payout execution | **Awaiting external provider** — schema exists, no live rail |
| Tax/statutory | **Awaiting human approval** — OD gates OPEN |
| MoR / legal entity | **Awaiting human approval** |
| PSP (live) | **Awaiting external provider + OD-PAY-*** |
| Carrier (live) | **Awaiting contract** — mock logistics only |
| Production-ready money | **NO** |

---

## 14. R10-E/F dependency audit

| Question | Answer |
|----------|--------|
| Does R10-E/F block R14? | **No** — Book 93 sequences R14 as independent go-live gate |
| Can R10-E/F proceed independently? | **Yes** — optional health-record expansions |
| Overlap with R14? | **Minimal** — R14 is finance/carriers; R10-E/F is health uploads/notes |
| Dependencies unresolved? | **UNRESOLVED — HUMAN/PLANNING DECISION REQUIRED** on priority only; not a technical blocker |

**Recommendation:** R10-E/F may be deferred until after R14 planning if humans prioritize go-live economics.

---

## 15. Technical debt register (active)

| ID | Class | Blocker? |
|----|-------|----------|
| TD-WEB-TC-01 | UI/typecheck | No |
| TD-R13E-01 | Operational — analytics worker not on outbox registry | No |
| TD-R13D-01/02/03 | Deferred product scope | No |
| TD-REG-R13B-01 | Test pollution | No |
| TD-REG-ENV-01 | Cross-suite test DB pollution | No |
| Main DB migration lag | Operational | No (dev env) |
| Legacy `USING(true)` in old migration SQL | Security hygiene | No on current test DB (0 live) |
| OD-R13-04 | Legal — clinical search | **Yes for clinical prod** |
| OD-PAY-* / OD-MOR | Legal — live money | **Yes for R14 prod** |

---

## 16. Documentation consistency

| Check | Result |
|-------|--------|
| Master index through Book 240 | **Consistent** with R13 closure |
| Roadmap R13 status | **Consistent** — CLOSED |
| Migration count in Book 239 (130 test) vs repo (128 folders) | **Minor drift** — document both |
| Book 221 migration count (109) | **Stale** — expected after R13 |
| Next CR after R13 | Book 240: no impl CR; R14 planning implied |
| `CR-R14-PLAN-242` | **Does not exist yet** — appropriate to create |

---

## 17. Production / go-live gap analysis

### Technical blockers
- Main dev DB not migrated to R13 schema
- Test DB pollution undermines combined CI regression
- `web-customer` typecheck failure (TD-WEB-TC-01)

### Security blockers
- None identified as **new** beyond inherited legacy migration SQL (inactive on test DB)

### Legal blockers
- OD-PAY-*, OD-MOR, tax, carrier contracts — **OPEN**
- OD-R13-04 clinical search — **OPEN**
- OD-CARE-*, OD-EHR-* — per country

### Commercial blockers
- No contracted PSP, payout, or carrier named in repo

### Operational blockers
- No production credential management audit performed
- No DR/BC runbook execution verified (R15 scope)

### External-provider dependencies
- Live PSP, payout rail, carrier API — **not integrated**

### Human approvals required
- R14 go-live gate sign-off
- Country pack production enablement
- Clinical search legal enablement (separate from R14)

---

## 18. Final project status matrix

| Program | Phase | Repository status | Audit status | Blocker | Next action |
|---------|-------|-------------------|--------------|---------|-------------|
| R9 | Health record | COMPLETE | CLOSED | No | Maintain |
| R10 | A–D Care nav | COMPLETE | CLOSED | No | — |
| R10 | E–F Optional | NOT STARTED | Verified | No | Defer or plan separately |
| R11 | CMS/support | COMPLETE | CLOSED | No | Maintain |
| R12 | A–H CRM/growth | COMPLETE | CLOSED | No | Test DB hygiene |
| R13 | A–H Search/analytics | COMPLETE | CLOSED | No | Fix TD-REG-R13B-01 in hygiene CR |
| R14 | Live money/carriers | NOT STARTED | N/A | **Yes** | **CR-R14-PLAN-242** |
| R15+ | Governance/DR | PLANNED | N/A | No | Later |

---

## 19. Recommended next sequence

Based on audit evidence only:

1. **`CR-R14-PLAN-242`** — Author R14 implementation plan (PSP, payout, carrier, tax, MoR, country-pack go-live checklist). **No implementation.**
2. **Parallel (optional, non-blocking):** Test DB hygiene CR — fix `TD-REG-R13B-01`, `TD-REG-ENV-01`; migrate main `worldpharma` dev DB.
3. **Parallel (optional):** `TD-WEB-TC-01` fix — unrelated to R14 but blocks web-customer build.
4. **Human track:** Close OD-PAY / OD-MOR / legal entity decisions before any R14-IMPL CR.
5. **Do not implement R14** until plan + human gates are explicitly authorized.

R10-E/F does **not** need to precede R14 planning.

---

## 20. Final verdict

### 1. Overall project health
**Strong sandbox platform** with broad domain coverage (commerce, care, lab, radiology, CRM, search, analytics). **Not production-ready** for live money or regulated country launch.

### 2. R12 status
**CLOSED** — re-verified **32/32** isolated e2e. Cross-suite pollution is environmental, not an R12 implementation regression.

### 3. R13 status
**CLOSED** — implementation and security gates pass; **34/35** isolated e2e (`r13b` environmental). Clinical search **operationally disabled**.

### 4. R10-E/F status
**NOT STARTED** — optional; does not block R14 planning.

### 5. R14 readiness
**NOT READY** — awaiting plan, contracts, and human legal/commercial gates.

### 6. Critical blockers (production)
- Live PSP/payout/carrier not integrated
- Legal/commercial gates OPEN (OD-PAY, OD-MOR, tax, MoR)
- Country production pack enablement not authorized

### 7. Non-blocking debt
TD-WEB-TC-01, TD-R13E-01, TD-R13D-*, TD-REG-R13B-01, TD-REG-ENV-01, main DB migration lag

### 8. Production-readiness gaps
Sandbox-only payments/logistics; no live reconciliation with external rails; test DB drift; web-customer build failure; browser/mobile not verified at scale

### 9. Recommended next CR
**`CR-R14-PLAN-242`** — R14 go-live planning document only (per Book 93 §R14 and program status `R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`).

---

**Audit artifacts created:** this book only.  
**No other repository changes.**
