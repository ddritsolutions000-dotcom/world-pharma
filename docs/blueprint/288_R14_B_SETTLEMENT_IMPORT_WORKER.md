# 288 — R14-B scheduled settlement import worker (CR-288)

**CR:** `CR-R14-B-SETTLEMENT-IMPORT-WORKER-288`  
**Verdict:** **`R14_B_SETTLEMENT_IMPORT_WORKER_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Provider-neutral scheduled poll worker reusing CR-285 import/match/ledger pipeline + CR-287 break workflow

**Boundaries respected:**

- R14-A sandbox kernel **unchanged** (no live PSP, no human-gate re-audit)
- R14-A human gates **0/7** — not repeated ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md))
- No live payout rail, no production credentials, no provider SDKs
- MOCK settlement provider **production-blocked**
- Do **not** execute CR-R14-A-IMPL-244 unchanged
- No duplicate settlement-import pipeline — reuses `SettlementImportPort` / `SettlementImportService` / `SETTLEMENT_IMPORT_RECEIVED` listener

---

## A. PRE-IMPLEMENTATION CODE AUDIT

| Area | Finding |
|------|---------|
| `SettlementImportPort` | `fetchBatch()` existed (CR-285); **`listAvailableBatches()` missing** for scheduled discovery |
| `SettlementImportRegistry` | Provider resolution by code + environment — reusable |
| `SettlementImportService` | Manual/admin import + `processImportReceived` normalize/match/ledger; batch idempotency via `(provider_code, environment, external_batch_ref)` |
| `MOCK_SETTLEMENT` adapter | `fetchBatch()` sandbox only; production forbidden |
| Staging tables | `settlement_import_batches` / `settlement_import_records` with unique constraints |
| `SETTLEMENT_IMPORT_RECEIVED` | Listener handles post-import normalize/match only — **no fetch worker** |
| Idempotency | Batch + record uniqueness; `idempotency_key` on batches |
| FinanceReconciliation / CR-287 | Break workflow unchanged; worker imports feed existing match → break path |
| BullMQ / EventWorker | Outbox events for import received; **no BullMQ cron for settlement fetch** |
| Scheduler patterns | `setInterval` poll (e.g. `InventoryTtlService`) — **not NestJS `@Cron`** |
| Admin APIs | CR-285 settlement import admin; CR-287 break admin — **no worker run observability** |
| RLS | Country-scoped on finance/settlement tables; worker uses `workerTenantContext` |
| Tests | `r14b.settlement-import.e2e` 14 scenarios; no worker e2e |

**Answers:**

| Question | Answer |
|----------|--------|
| Import trigger before CR-288? | **Manual/admin only** — POST import + optional `fetchFromProvider` |
| Scheduling infrastructure? | **`setInterval` poll** in `SettlementImportWorkerService.onModuleInit` |
| Queue/job pattern? | Worker run claim outside tenant tx; import inside `runWithTenant`; retries via `next_retry_at` |
| Missing fetch capability? | **`listAvailableBatches()`** on port for scheduled discovery |
| Duplicate batch protection? | Unique `(provider, environment, external_batch_ref)` + worker run `idempotency_key` |
| Retry semantics? | Transient → `FAILED_TRANSIENT` + bounded backoff; permanent/unknown → `FAILED_PERMANENT` |
| Invalid provider response? | Fail closed via existing `assertSettlementProviderRegistered` + adapter errors |
| Worker scope? | Per enabled `settlement_import_schedules` row (country + provider) |
| Crash after staging? | Re-run skips COMPLETED batch financially; worker run idempotency prevents duplicate journals |

---

## B. EXISTING ARCHITECTURE (REUSED)

```
settlement_import_schedules (country + provider)
  → SettlementImportWorkerService.pollOnce / runScheduledImport
  → claimWorkerRun (idempotency: worker:{provider}:{countryId}:{batchRef})
  → workerTenantContext + SettlementImportService.importBatch(fetchFromProvider: true)
  → SettlementImportPort.fetchBatch via registry
  → staging (batches/records)
  → processImportReceived → normalize → match → ledger / CR-287 breaks
```

No parallel pipeline. `SettlementImportListenerService` remains for outbox-driven `SETTLEMENT_IMPORT_RECEIVED` when events are emitted.

---

## C. WORKER DESIGN

| Component | Role |
|-----------|------|
| `settlement-import-worker.config.ts` | `SETTLEMENT_IMPORT_WORKER_ENABLED`, poll interval, max retries, fail-closed guards |
| `settlement-import-worker.service.ts` | Poll schedules + due retries; claim → import → match; admin list runs |
| Migration 141 | `settlement_import_schedules`, `settlement_import_worker_runs`, batch `import_source` / `worker_run_id` |
| Admin API | `GET /admin/finance/settlement-import-worker/runs` |
| Admin UI | Worker runs section in `finance-admin.tsx` |

Worker disabled when `NODE_ENV=test` (e2e calls service directly).

---

## D. FETCH CONTRACT

Extended `SettlementImportPort`:

```typescript
listAvailableBatches(input: SettlementImportListInput): Promise<string[]>
```

Default returns `[]`. `MockSettlementImportAdapter` implements sandbox batch discovery + existing `fetchBatch`. Generic worker calls registry only — **no provider-specific logic in worker**.

---

## E. SCHEDULING

- Env: `SETTLEMENT_IMPORT_WORKER_ENABLED=true`
- Poll: `SETTLEMENT_IMPORT_WORKER_POLL_MS` (default 60_000, min 5_000)
- On init: log `settlement_import_worker_started`
- Each cycle: enabled schedules → `listAvailableBatches` → import each ref; then retry `FAILED_TRANSIENT` runs where `next_retry_at <= now`

---

## F. IDEMPOTENCY

| Layer | Mechanism |
|-------|-----------|
| Worker run | Unique `idempotency_key` = `worker:{provider}:{countryId}:{externalBatchRef}` |
| Batch | Unique `(provider_code, environment, external_batch_ref)` |
| Record | Unique `(provider_code, environment, external_record_ref)`; **scheduled imports skip duplicates**; manual admin still returns 409 |
| COMPLETED batch | `processImportReceived` no-op for financial reprocessing |
| Concurrent workers | `claimWorkerRun` outside tenant tx; RUNNING/SUCCEEDED skip |

---

## G. RETRY / FAILURE CLASSIFICATION

| Class | Codes / behavior |
|-------|------------------|
| Transient | `SETTLEMENT_IMPORT_TRANSIENT`, HTTP 503 → `FAILED_TRANSIENT`, `next_retry_at`, max retries then `MAX_RETRIES_EXCEEDED` |
| Permanent | `SETTLEMENT_PROVIDER_NOT_CONFIGURED`, `MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN`, `LIVE_SETTLEMENT_IMPORT_DISABLED`, `SETTLEMENT_IMPORT_PERMANENT` → `FAILED_PERMANENT`, no endless retry |
| Unknown | `SETTLEMENT_IMPORT_UNKNOWN` → `FAILED_PERMANENT` (fail closed) |

Never marks import successful when fetch/processing failed.

---

## H. RLS / COUNTRY ISOLATION

Migration 141: FORCE RLS on `settlement_import_schedules` and `settlement_import_worker_runs` using existing worker/platform country pattern — **no `USING(true)`**.

Worker executes import inside `workerTenantContext({ countryId })`. Admin list uses `loadAccessScope` + `countryFilter`. Cross-country schedule access blocked in e2e.

---

## I. ADMIN OBSERVABILITY

**API:** `GET /admin/finance/settlement-import-worker/runs` — `finance:read`, country-scoped.

**Safe fields:** provider, country, batch ref, status, retry count, failure classification, error codes, batch status, record/matched counts, timestamps.

**Never exposed:** credentials, raw provider payloads, PAN/CVV.

**UI:** Worker runs table in finance admin dashboard.

---

## J. TESTS

| Suite | Result |
|-------|--------|
| `r14b.settlement-import-worker.e2e.spec.ts` | **22/22 PASS** (scenarios A–V) |
| `r14b.settlement-import.e2e.spec.ts` | **14/14 PASS** (regression: manual duplicate still 409) |
| `r14b.reconciliation.e2e` | PASS |
| `r14b.recon-break.e2e` | PASS |
| `r14b.payout-ledger.e2e` | PASS |
| `finance.e2e` | PASS |
| **R14-B finance regressions total** | **76/76 PASS** |
| `api:typecheck` | PASS |
| `api:build` | PASS |
| `web-admin` finance-admin | **4/4 PASS** |

---

## K. RUNTIME VERIFICATION

| Check | Result |
|-------|--------|
| Postgres | **healthy** (`world-pharma-postgres`, port 55432) |
| Redis | **healthy** (`world-pharma-redis`, port 56379) |
| Migrations | **141 applied**, no pending (`prisma migrate status`) |
| `/health/ready` | **200** (port 4000) |
| Worker registration | Log: `settlement_import_worker_started` when `SETTLEMENT_IMPORT_WORKER_ENABLED=true` |
| Settlement import listener | Log: `settlement_import_listener_registered` |

---

## L. POST-IMPLEMENTATION CODE AUDIT

| # | Check | Evidence |
|---|-------|----------|
| 1 | Worker invokes `SettlementImportPort` | `executeImportPhase` → `importBatch(fetchFromProvider: true)` → registry `fetchBatch` |
| 2 | No provider leak in generic worker | Worker uses `registry.resolve` only |
| 3 | Scheduling uses existing pattern | `setInterval` poll, not new queue type |
| 4 | Duplicate jobs idempotent | `claimWorkerRun` + unique `idempotency_key` |
| 5 | Duplicate batches idempotent | Batch unique constraint + skip COMPLETED |
| 6 | Concurrent workers safe | Claim outside tx; tests F, G |
| 7 | Retry bounded | `max_retries`, backoff, `MAX_RETRIES_EXCEEDED` |
| 8 | Permanent errors don't loop | `FAILED_PERMANENT` skip on re-poll |
| 9 | Unknown errors fail closed | `classifyWorkerFailure` → UNKNOWN → PERMANENT |
| 10 | Matching semantics unchanged | Reuses `processImportReceived` |
| 11 | CR-287 breaks preserved | Test M |
| 12–14 | No duplicate recon/ledger | Tests U, V, F |
| 15–16 | RLS/RBAC intact | Migration 141 RLS; tests N, O, P |
| 17 | No secret leak | `presentRun` safe fields only |
| 18 | MOCK production blocked | Test Q |
| 19 | Live PSP disabled | Test R; `live_psp: false` in API |
| 20 | R14-A guards unchanged | No payment kernel edits |
| 21 | Tests use real paths | E2e uses `SettlementImportWorkerService` + DB |
| 22 | No dead code | All new files wired in `finance.module.ts` |

**Regression fix:** Duplicate record skip limited to `importSource === SCHEDULED` so manual admin POST retains 409 (`SETTLEMENT_RECORD_DUPLICATE`).

**Audit verdict:** **GREEN**

---

## M. DEFECTS FIXED DURING CR-288

1. P2002 in aborted transaction — pre-check before insert for scheduled duplicates
2. Concurrent worker runs — split claim (outside tx) vs execute (inside tx)
3. `SETTLEMENT_PROVIDER_NOT_CONFIGURED` classified permanent not transient
4. Manual import regression — scheduled-only duplicate skip

---

## N. REMAINING R14-B ENGINEERING (SOURCE GAP SCAN)

| Priority | Work | Class |
|----------|------|-------|
| 1 | Settlement import schedule admin CRUD (enable/disable schedules per country) | F |
| 2 | Break queue UI depth (detail drawer, date filters) | F |
| 3 | Vendor payable adjustment on partial refund | F |
| 4 | Affiliate/carrier payout kinds | F |
| 5 | Provider-specific settlement adapters (post R14-A gates) | E |
| 6 | Tax/statutory hooks | E (R14-E) |
| 7 | Live payout rail + `AST_BANK` | E (R14-C) |

---

## O. HUMAN/LEGAL BLOCKERS

Unchanged — **0/7** R14-A gates ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md)).

---

## P. NEXT CR

**Recommended:** `CR-R14-B-SETTLEMENT-SCHEDULE-ADMIN-289`

**Prompt:**

> Add admin CRUD for `settlement_import_schedules` (list/create/update enable per country+provider), RBAC `finance:write`, country-scoped RLS, validation against registered providers and MOCK fail-closed gates, and e2e coverage. Worker already consumes schedules; operators currently need DB seeding to enable scheduled import.

---

## Q. FINAL VERDICT

**`R14_B_SETTLEMENT_IMPORT_WORKER_COMPLETE`**

Scheduled provider-neutral settlement import worker is implemented with sandbox fetch via existing port/registry/service, idempotent worker runs and batches, bounded retry semantics, country RLS, admin observability, 22 focused e2e scenarios + 76 R14-B regressions green, runtime verified, and post-implementation audit GREEN.
