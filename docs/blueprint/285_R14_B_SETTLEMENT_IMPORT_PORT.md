# 285 — R14-B settlement import port (CR-285)

**CR:** `CR-R14-B-SETTLEMENT-IMPORT-PORT-285`  
**Verdict:** **`R14_B_SETTLEMENT_IMPORT_PORT_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Provider-neutral settlement import foundation — port, staging, pipeline, tests

**Boundaries respected:**

- R14-A sandbox kernel **unchanged** (no live PSP SDK, no human-gate re-audit)
- R14-A human gates **0/7** — not repeated ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md))
- No `PAYMENT_LIVE_ENABLED`, no `SETTLEMENT_IMPORT_LIVE_ENABLED` in tests
- MOCK_* production prohibition preserved via `settlement-import.config.ts`
- Do **not** execute CR-R14-A-IMPL-244 unchanged

---

## A. ARCHITECTURE BEFORE / AFTER

### Before (CR-284)

```
Payment reconcile → finance sync (fixed CR-284)
Finance recon import (idempotent)
No PSP settlement file/batch ingest
No settlement staging tables
No match classification pipeline
```

### After (CR-285)

```
SettlementImportPort.fetchBatch()
  ↓
SettlementImportRegistry (MOCK_SETTLEMENT sandbox only)
  ↓
SettlementImportService.importBatch()
  → settlement_import_batches / settlement_import_records (staging)
  → normalize (INVALID)
  → match (MATCH | PARTIAL | UNMATCHED | DUPLICATE | INVALID)
  → FinanceService.syncFinanceForPaymentIntent()
  → FinanceService.postPspSettlementMatchJournal()  [idempotent sourceEventId]
  → finance_reconciliations (UNMATCHED/PARTIAL breaks)
  ↓
Admin API + SETTLEMENT_IMPORT_RECEIVED worker listener
```

**Idempotency keys:**

| Layer | Constraint |
|-------|------------|
| Batch | `idempotency_key` unique; `(provider_code, environment, external_batch_ref)` unique |
| Record | `(provider_code, environment, external_record_ref)` unique → 409 on re-import |
| Journal | `(sourceEventId, postingRuleId)` = `psp_settlement:{recordId}` + `psp_settlement_match` |
| Re-match | COMPLETED batches allowed; POSTED records skipped; no duplicate journal |

---

## B. SOURCE FILES INSPECTED

| Path | Role |
|------|------|
| `packages/database/prisma/schema.prisma` | Settlement import models/enums |
| `packages/database/prisma/migrations/20260830190000_r14b_settlement_import_staging/` | Staging DDL |
| `packages/database/prisma/migrations/20260830190100_r14b_settlement_import_rls/` | RLS policies |
| `apps/api/src/finance/settlement-import.port.ts` | Provider-neutral port |
| `apps/api/src/finance/settlement-import.config.ts` | Fail-closed guards |
| `apps/api/src/finance/mock-settlement-import.adapter.ts` | Sandbox adapter |
| `apps/api/src/finance/settlement-import.registry.ts` | Adapter registry |
| `apps/api/src/finance/settlement-import.service.ts` | Import → match → ledger pipeline |
| `apps/api/src/finance/settlement-import.listener.ts` | Worker event boundary |
| `apps/api/src/finance/finance.service.ts` | `syncFinanceForPaymentIntent`, `postPspSettlementMatchJournal` |
| `apps/api/src/finance/finance.module.ts` | Wiring |
| `apps/api/src/finance/admin.controller.ts` | Admin settlement-import APIs |
| `apps/api/src/events/envelope.ts` | `SETTLEMENT_IMPORT_RECEIVED` |
| `apps/api/src/finance/r14b.settlement-import.e2e.spec.ts` | Tests A–L |
| `apps/api/src/finance/r14b.reconciliation.e2e.spec.ts` | CR-284 regression |
| `docs/blueprint/284_R14_B_FOUNDATION_AUDIT.md` | Prior slice baseline |

---

## C. CODE CHANGES MADE

### Created

| File | Purpose |
|------|---------|
| `settlement-import.port.ts` | Abstract `SettlementImportPort` + DTOs |
| `settlement-import.config.ts` | MOCK production ban; live import fail-closed |
| `mock-settlement-import.adapter.ts` | Deterministic sandbox batch fetch |
| `settlement-import.registry.ts` | Provider code → adapter |
| `settlement-import.service.ts` | Full pipeline |
| `settlement-import.listener.ts` | Outbox/worker handler |
| `r14b.settlement-import.e2e.spec.ts` | 14 tests (A–L + extras) |

### Modified

| File | Change |
|------|--------|
| `schema.prisma` | `SettlementImportBatch`, `SettlementImportRecord`, enums |
| `finance.service.ts` | Payment-intent finance sync + idempotent PSP settlement journal |
| `finance.module.ts` | Providers + listener registration |
| `admin.controller.ts` | CRUD/match/retry settlement-import endpoints |
| `envelope.ts` | `SETTLEMENT_IMPORT_RECEIVED` event type |

### CR-285 session fixes

- P2002 on duplicate `external_record_ref` → `409 SETTLEMENT_RECORD_DUPLICATE`
- `matchBatch` accepts `COMPLETED` for idempotent re-match (requirement E)
- TypeScript fixes for terminal status array and classification widening

---

## D. MIGRATION / SCHEMA CHANGES

| Migration | Description |
|-----------|-------------|
| **136** `20260830190000_r14b_settlement_import_staging` | Tables + enums + uniqueness |
| **137** `20260830190100_r14b_settlement_import_rls` | ENABLE + FORCE RLS + policies |

**Migration head:** **137** (137 migrations total)

**Models:**

- `SettlementImportBatch` — batch metadata, status, idempotency, transient_failure
- `SettlementImportRecord` — per-line staging, classification, journal_source_key, finance_recon_id

**Enums:**

- `SettlementImportBatchStatus`: RECEIVED → NORMALIZED → MATCHING → COMPLETED | PARTIAL | FAILED
- `SettlementImportRecordStatus`: STAGED → terminal states including POSTED, DUPLICATE, INVALID
- `SettlementMatchClassification`: MATCH, PARTIAL, UNMATCHED, DUPLICATE, INVALID

---

## E. RLS / SECURITY VERIFICATION

| Check | Status |
|-------|--------|
| `settlement_import_batches` ENABLE RLS | **Yes** (migration 137) |
| `settlement_import_batches` FORCE RLS | **Yes** |
| `settlement_import_records` ENABLE RLS | **Yes** |
| `settlement_import_records` FORCE RLS | **Yes** |
| Country-scoped policy (`app.can_country`) | **Yes** |
| Worker/platform bypass | **Yes** (`app.is_worker()`, `app.is_platform()`) |
| MOCK_* in production environment | **409 MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN** |
| Live import without flag | **503 LIVE_SETTLEMENT_IMPORT_DISABLED** |
| Unregistered provider | **503 SETTLEMENT_PROVIDER_NOT_CONFIGURED** |
| Admin APIs permission-gated | `finance:read`, `finance:reconcile` |
| Secrets in API responses | **None** — no credentials exposed |

No existing RLS policies weakened. No PAN/CVV. No live PSP SDK.

---

## F. TEST RESULTS (CR-285 run)

| Command | Result |
|---------|--------|
| `nx test api --testPathPatterns=r14b.settlement-import --runInBand` | **14/14 PASS** |
| `nx test api --testPathPatterns=r14b.reconciliation\|finance.e2e\|payment-webhook-recon\|refund --runInBand` | **61/61 PASS** |
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |

### Test matrix (A–L)

| ID | Scenario | Result |
|----|----------|--------|
| A | New batch imports successfully | PASS |
| B | Same batch twice → idempotent | PASS |
| C | Same record twice → 409, no duplicate staging | PASS |
| D | MATCH → exactly one ledger posting | PASS |
| E | Re-run MATCH → no duplicate posting | PASS |
| F | PARTIAL classification | PASS |
| G | UNMATCHED classification | PASS |
| H | Re-match on POSTED record → no duplicate effect | PASS |
| I | INVALID during normalization | PASS |
| J | Cross-country ref → INVALID | PASS |
| K | Unregistered provider fails closed | PASS |
| L | Transient retry does not duplicate financial effects | PASS |

---

## G. DB / RUNTIME STATUS

| Target | State |
|--------|-------|
| Repository migration head | **137** |
| Test DB (`worldpharma_test`) | **Up to date (137)** |
| Dev DB (`worldpharma`) | **Up to date (137)** |
| Redis | Required for e2e (existing) |

---

## H. ADMIN OBSERVABILITY

**Endpoints** (`/api/v1/admin/finance/settlement-imports`):

| Method | Path | Permission |
|--------|------|------------|
| POST | `/settlement-imports` | `finance:reconcile` |
| GET | `/settlement-imports` | `finance:read` |
| GET | `/settlement-imports/:id` | `finance:read` |
| POST | `/settlement-imports/:id/match` | `finance:reconcile` |
| POST | `/settlement-imports/:id/retry` | `finance:reconcile` |

**Exposed fields:** batch status, record status, match classification, external/provider refs, amount/currency, error_detail, transient_failure, created/processed timestamps, journal_source_key. No credentials.

**Worker:** `SettlementImportListenerService` handles `SETTLEMENT_IMPORT_RECEIVED` → normalize + match (no real PSP required).

---

## I. REMAINING R14-B WORK

| Priority | Work | Class |
|----------|------|-------|
| 1 | Payout execution journal entries (AP → clearing on PAID) | F |
| 2 | Finance recon break resolution workflow | F |
| 3 | Admin UI settlement-import / break queue | F |
| 4 | Scheduled settlement import worker (cron/poll) | F |
| 5 | Vendor payable adjustment on partial refund | F |
| 6 | Provider-specific settlement adapters (post human gates) | E |
| 7 | Tax/statutory hooks | E (R14-E) |
| 8 | Live payout adapter | E (R14-C) |

---

## J. HUMAN/LEGAL BLOCKERS

Unchanged — **0/7** R14-A gates ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md)).

Live PSP settlement file formats, production credentials, and settlement calendar remain **human/commercial** decisions. Sandbox engineering does not require them.

---

## K. NEXT CR

**Recommended:** `CR-R14-B-PAYOUT-LEDGER-286`

**Prompt:**

> Implement provider-neutral R14-B payout execution ledger for sandbox mock payout: when mock payout transitions to PAID, post idempotent AP→clearing journal entries, wire into existing `PayoutPort`/`MockPayoutAdapter`, extend finance e2e + r14b tests for payout→ledger path. No live payout rail. No live PSP. Build on CR-285 settlement import foundation. Preserve MOCK_* production fail-closed and R14-A human gates 0/7 — do not re-audit gates or execute CR-244.

---

## L. FINAL VERDICT

**`R14_B_SETTLEMENT_IMPORT_PORT_COMPLETE`**

Provider-neutral settlement import port, sandbox adapter, staging schema with RLS, full import→normalize→match→ledger pipeline, admin observability, worker listener boundary, and tests A–L are **implemented and green**. Live PSP settlement adapters remain post-gate work.
