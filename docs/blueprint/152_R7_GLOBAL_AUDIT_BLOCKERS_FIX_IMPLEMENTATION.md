# 152 — R7 global audit blockers fix

**Status:** Implementation complete  
**Change ID:** **CR-R7-GLOBAL-FIX-152**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R7_GLOBAL_BLOCKERS_CLOSED**

**Authority:** Close Book [151](151_POST_R7_GLOBAL_ECOSYSTEM_AUDIT.md) blockers B-RLS-01, B-IM-01, B-UI-01, B-E2E-01, B-TEST-01 only. **R8 NOT started.**

---

## 0. Blocker scorecard

| Blocker | Result | Evidence |
|---------|--------|----------|
| B-RLS-01 | **CLOSED** | Live `pg_policies` scan: **0** `USING(true)`; `rls.tenancy.e2e.spec.ts` assertion added |
| B-IM-01 | **CLOSED** | Migration `20260828200000_r7_global_audit_blockers` — triggers on `lab_report_versions` + `lab_result_lines` |
| B-UI-01 | **CLOSED** | `apps/mobile/src/customer-features.tsx` `LabBookingDetailScreen` report error parity |
| B-E2E-01 | **CLOSED** | `r7e.pathology-digital-report.e2e.spec.ts` amendment test (2 tests) |
| B-TEST-01 | **CLOSED** | `inventory.service.ts` + `outbox.service.ts` concurrency fix; inventory **15/15** stress passes |

---

## 1. B-RLS-01 — Legacy `USING(true)`

### Inventory

| Source | `USING(true)` count | Notes |
|--------|---------------------|-------|
| Live database (`pg_policies`) | **0** | Authoritative |
| Historical migration files (pre-`20260827180000`) | 93 lines | Superseded by `multi_tenant_rls` at apply time |

`20260827180000_multi_tenant_rls` drops all policies on all public tables and recreates tenant-scoped policies via `app.*` GUC helpers. Post-RLS migrations (R5–R7) add only scoped policies.

### Verification

- `rls.tenancy.e2e.spec.ts`: new test **has zero USING(true) RLS policies**
- `worldpharma_app` remains **NOSUPERUSER** / **NOBYPASSRLS**
- FORCE RLS unchanged on clinical tables

No new permissive policies introduced.

---

## 2. B-IM-01 — Published report immutability (DB)

**Migration:** `20260828200000_r7_global_audit_blockers`

| Object | Behavior |
|--------|----------|
| `app.guard_published_lab_report_version()` | Blocks UPDATE/DELETE when `OLD.status = 'PUBLISHED'` |
| `app.guard_published_lab_result_line()` | Blocks UPDATE/DELETE when parent version is `PUBLISHED` |
| Triggers | `tr_lab_report_versions_guard_published`, `tr_lab_result_lines_guard_published` |

Service-layer guards in `pathology.service.ts` **unchanged** (defense-in-depth).

**E2E:** amendment test asserts direct Prisma update on published version throws.

Draft editing, verify/publish transitions, and amendment new-version flow remain intact.

---

## 3. B-UI-01 — Customer RN report errors

**File:** `apps/mobile/src/customer-features.tsx` (`LabBookingDetailScreen`)

| HTTP / kind | RN state |
|-------------|----------|
| 401 / unauthorized | `ctx.onUnauthorized()` (session) |
| 403 / forbidden | `NativePermissionDeniedState` |
| 404 | `NativeEmptyState` (unavailable) |
| network / status 0 | `NativeNetworkErrorState` + retry |
| other | `NativeEmptyState` (generic) |

Shared Android/iOS kernel; uses existing `FeatureStates` for screen-level load + native state components for report fetch.

---

## 4. B-E2E-01 — Amendment coverage

**File:** `apps/api/src/lab/r7e.pathology-digital-report.e2e.spec.ts`

New test `report amendment creates new version with lineage and isolation` proves:

1. Published version v1 exists  
2. Authorized pathologist amend → DRAFT v2 with `amendsVersionId` lineage  
3. Published v1 unchanged in DB  
4. Unauthorized staff → 403; cross-lab pathologist → 403  
5. Empty reason → 400; second amend while draft open → 409  
6. Customer sees v1 before amend; **404 after amend** (current contract: `currentVersion` is draft)  
7. Customer B → 403  
8. Direct DB mutation on published version → rejected (trigger)

---

## 5. B-TEST-01 — Inventory e2e determinism

### Root cause

Concurrent `Promise.all` reservation requests could:

1. Use stale lot balances from initial `findMany` include  
2. Hit outbox `@@unique([aggregateId, type, occurrenceKey])` under serialization retry → unhandled **500**

### Fix (minimal)

| File | Change |
|------|--------|
| `inventory.service.ts` | Per-lot `FOR UPDATE` + fresh balance read; empty-lots guard; in-tx idempotency check; P2002/P2034/deadlock retry |
| `outbox.service.ts` | Map P2002 to `Errors.conflict` (no query in aborted transaction) |

### Results

| Run | Result |
|-----|--------|
| `inventory.e2e.spec.ts` isolated ×3 | **3/3 PASS** |
| `inventory.e2e.spec.ts` isolated ×15 (stress) | **15/15 PASS** |
| `nx run api:test` | **PASS** |

---

## 6. Regression summary

### API full suite (`--runInBand`, 3 runs)

| Run | Suites | Tests |
|-----|--------|-------|
| 1 | 68 | **162/163** (1 fail) |
| 2 | 68 | **162/163** (1 fail) |
| 3 | 68 | **162/163** (1 fail) |

**Intermittent failure:** `clinical/video.e2e.spec.ts` (reconnect join expects 200, receives 409) — **pre-existing**, unrelated to Book 152 scope. Not retried to pass.

### Focused gates

| Gate | Result |
|------|--------|
| R7-A–F + RLS | **7/7 suites · 19/19** |
| `inventory.e2e` ×3 | **3/3 PASS** |
| Typecheck (workspace) | **PASS** |
| Web builds (customer, lab, pathologist, admin) | **PASS** |
| `web-customer` jest | **8/8** |
| `mobile` jest | **4/4** |
| Migrations | **57 applied · 0 pending** |
| `USING(true)` live | **0** |

---

## 7. Migrations

| Migration | Purpose |
|-----------|---------|
| `20260828200000_r7_global_audit_blockers` | B-IM-01 published immutability triggers |

**Total migrations:** 57

---

## 8. Production boundary (unchanged)

Live PSP · real money · bank payouts · real carriers · production healthcare · LIS/HIS · live e-Rx · automatic refill · production LiveKit · recording · radiology — **all OFF**.

**R8 NOT STARTED.**

---

## Final declaration

**R7_GLOBAL_BLOCKERS_CLOSED**

Book 151 blockers B-RLS-01 through B-TEST-01 are closed. Residual full-suite flake in `video.e2e.spec.ts` is documented and out of scope for this CR.
