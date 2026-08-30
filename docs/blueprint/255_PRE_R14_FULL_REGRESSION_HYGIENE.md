# 255 — Pre-R14 full regression hygiene

**CR:** `CR-PRE-R14-FULL-REGRESSION-HYGIENE-255`  
**Verdict:** **`PRE_R14_REGRESSION_GREEN`**  
**Date:** 30 August 2026  
**Prior:** [254](254_R14_PRE_A_ENGINEERING_HYGIENE.md) · [253](253_FULL_CODEBASE_AUDIT.md)  
**Human gates:** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) — **0/7 evidenced** (unchanged)

Test/environment hygiene only. **No R14-A implementation. No human gate approvals.**

---

## 1. Pollution fix

### Root cause

Discovery e2e tests used **generic query tokens** (`R13B`, `Discovery Doctor`) against shared `worldpharma_test`. Accumulated fixtures from prior runs filled the default page limit (20) before the current run's records appeared.

### Fix strategy

- Per-run **unique tokens** (`runToken` / enhanced `testSuffix`) embedded in fixture titles, slugs, and search queries.
- **No production code changes** — discovery merge/pagination semantics unchanged.
- **No limit increases** — assertions preserved and strengthened with slug/id checks.

### Files changed

| File | Change |
|------|--------|
| `apps/api/src/discovery/r13b.discovery.e2e.spec.ts` | Unique `runToken`; all discovery queries scoped to run-owned fixtures |
| `apps/api/src/discovery/r13c.provider-search.e2e.spec.ts` | Enhanced `testSuffix`; provider filter queries include suffix |

**Not changed:** migrations, payment code, policy packs, production discovery service.

---

## 2. Tests executed and exact results

### API regression (sequential, `jest --testPathPatterns=<suite>`)

| Suite | Suites | Tests | Result |
|-------|--------|-------|--------|
| r12a (CRM) | 1 | 6 | PASS |
| r12b (marketing) | 1 | 7 | PASS |
| r12c (promo) | 1 | 6 | PASS |
| r12d (affiliate) | 1 | 1 | PASS |
| r12e (wishlist/loyalty) | 1 | 1 | PASS |
| r12f (reviews) | 1 | 1 | PASS |
| r12g (automation/refill hooks) | 1 | 10 | PASS |
| r13a (search indexing) | 1 | 1 | PASS |
| r13b (discovery) | 1 | 1 | PASS |
| r13c (provider search) | 1 | 1 | PASS |
| r13d (recommendations) | 1 | 4 | PASS |
| r13e (analytics ingest) | 1 | 7 | PASS |
| r13f (analytics admin) | 1 | 8 | PASS |
| r13g (clinical search) | 1 | 7 | PASS |
| r13h (closure/gates) | 1 | 6 | PASS |
| payment | 3 | 4 | PASS |
| catalog.e2e | 1 | 1 | PASS |
| recommendations | 1 | 4 | PASS |
| **API subtotal** | **18** | **76** | **ALL PASS** |

**Note:** Parallel jest invocation of multiple R12/R13 suites causes outbox/DB contention failures. Sequential execution is the project's reliable baseline (jest `maxWorkers: 1`).

### Frontend / package tests

| Project | Suites | Tests | Result |
|---------|--------|-------|--------|
| web-customer | 12 | 40 | PASS |
| web-admin | 14 | 48 | PASS |
| mobile | 6 | 17 | PASS |
| mobile-doctor | 3 | 11 | PASS |
| web-doctor | 3 | 10 | PASS |
| shell-core | 4 | 12 | PASS |
| shared | 2 | 6 | PASS |
| ui-kit | 4 | 10 | PASS |
| **Frontend subtotal** | **48** | **154** | **ALL PASS** |

**Grand total executed:** **230 tests**, **66 suites**, **0 failures**.

---

## 3. Typecheck / build results

| Target | Result |
|--------|--------|
| API typecheck (`tsc -p apps/api/tsconfig.app.json`) | **PASS** |
| API build (`nx run api:build`) | **PASS** |
| web-customer typecheck | **PASS** |
| web-admin typecheck | **PASS** |
| web-affiliate typecheck | **PASS** |
| mobile typecheck | **PASS** |

---

## 4. Database migration state

| Check | Result |
|-------|--------|
| Repository migration folders | **128** |
| `worldpharma` (dev) | **Up to date** (128/128, 0 pending) |
| `worldpharma_test` | **Up to date** (128/128, 0 pending) |
| Migration files modified | **None** |

### R13 table + RLS verification (`worldpharma_test`)

| Table | RLS enabled | FORCE RLS |
|-------|-------------|-----------|
| `clinical_search_documents` | yes | yes |
| `catalog_search_documents` | yes | yes |
| `cms_content_search_documents` | yes | yes |
| `analytics_daily_country_metrics` | yes | yes |
| `promo_campaigns` | yes | yes |
| `wishlist_items` | yes | yes |

### `USING (true)` regression

Historical permissive policies remain only in **pre-retrofit migration files** (superseded by `20260827180000_multi_tenant_rls`). **No new permissive policies** in R12/R13 migrations. Effective DB policies use tenant-scoped predicates.

---

## 5. Runtime health (actually performed)

| Check | Result |
|-------|--------|
| `GET /health/ready` | **200** — `postgres: up`, `redis: up` (7.4.11), `bullmq: up` |
| Docker Postgres | `world-pharma-postgres` — Up, healthy |
| Docker Redis | `world-pharma-redis` — Up, healthy |
| API process | Responding on localhost:4000 |

---

## 6. Security verification

| Control | Verified | Evidence |
|---------|----------|----------|
| Clinical search disabled by default | **Yes** | `empty-pack.ts`: `clinical_search_enabled: false` |
| No live PSP in code | **Yes** | No Stripe/Razorpay references under `apps/api/src/payment/` |
| PaymentRouter sandbox-only | **Yes** | `router.ts:36` — `environment: 'sandbox'` |
| Payments fail-closed by default | **Yes** | `empty-pack.ts`: `payments.enabled: false` |
| No production country packs enabled | **Yes** | Empty pack defaults; no production pack publish in this CR |
| No secrets committed | **Yes** | Only test fixture changes; no `.env` modifications |
| R13-H closure tests | **PASS** | 6/6 — clinical search excluded from discovery |
| R13-G gate tests | **PASS** | 7/7 — fail-closed policy + consent enforcement |

---

## 7. Remaining issues

| Issue | Status |
|-------|--------|
| R14-A human gates | **0/7 evidenced** — blocks production R14-A |
| Parallel multi-suite jest | **ENVIRONMENT** — run sequentially for reliable baseline |
| Staging/prod DB migrate deploy | **Operator action** when authorized |

**No open test failures.**

---

## 8. R14-A engineering baseline

**Clean.** Typecheck green, dev/test DB at migration parity, R12/R13/payment/discovery/analytics/clinical regression green, runtime healthy, security boundaries intact.

---

## 9. Human gates

**Do not permit R14-A production enablement.** Book 247 remains **0/7 evidenced**. No approvals invented in this CR.

---

## 10. Next CR

**`CR-R14-A-IMPL-244`** — live PSP adapter implementation — authorized only after human gates evidenced and explicitly approved.

Optional follow-up: none required for engineering baseline; human gate intake remains the gating item.

---

**No fake approvals. No R14-A implementation in CR-255.**
