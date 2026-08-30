# 286 — R14-B payout execution ledger (CR-286)

**CR:** `CR-R14-B-PAYOUT-LEDGER-286`  
**Verdict:** **`R14_B_PAYOUT_LEDGER_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Provider-neutral sandbox payout → AP→clearing journal orchestration

**Boundaries respected:**

- R14-A sandbox kernel **unchanged** (no live PSP, no human-gate re-audit)
- R14-A human gates **0/7** — not repeated ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md))
- No live payout rail, no production credentials
- Do **not** execute CR-R14-A-IMPL-244 unchanged
- MOCK payout remains sandbox-only (`sandbox: true` on all payout rows)

---

## A. SOURCE FILES INSPECTED

| Path | Role |
|------|------|
| `apps/api/src/finance/payout.port.ts` | Provider-neutral payout port |
| `apps/api/src/finance/mock-payout.adapter.ts` | Sandbox MOCK rail |
| `apps/api/src/finance/finance.service.ts` | Payout state machine + journal kernel |
| `apps/api/src/finance/chart.ts` | COA — `AP_VENDOR`, `AST_GATEWAY_CLEARING` |
| `apps/api/src/finance/finance.module.ts` | PayoutPort → MockPayoutAdapter |
| `apps/api/src/finance/admin.controller.ts` | Payout execute/admin APIs |
| `apps/api/src/events/envelope.ts` | `PAYOUT_PAID` event type |
| `apps/api/src/finance/finance.e2e.spec.ts` | Phase 1G finance regression |
| `apps/api/src/finance/r14b.settlement-import.e2e.spec.ts` | CR-285 regression |
| `apps/api/src/finance/r14b.reconciliation.e2e.spec.ts` | CR-284 regression |
| `packages/database/prisma/schema.prisma` | `Payout`, `Journal` idempotency |
| `docs/blueprint/285_R14_B_SETTLEMENT_IMPORT_PORT.md` | Prior R14-B slice |

---

## B. ARCHITECTURE BEFORE

```
submitPayout → approvePayout → executePayout
  → MockPayoutAdapter.submit()
  → PayoutStatus PAID|FAILED|UNKNOWN
  → SettlementBatch EXECUTED + VendorPayable PAID (on PAID)
  → Outbox PAYOUT_PAID
  ✗ No AP→clearing journal on PAID
```

**Gap (CR-284/285):** Vendor payable credited at order split (`marketplace_split`) but never debited on payout execution.

---

## C. IMPLEMENTATION PERFORMED

### `FinanceService.executePayout()` — orchestration

1. Reject UNKNOWN re-execute, CANCELLED batch, illegal transitions
2. Call `MockPayoutAdapter.submit()`
3. **If PAID:** validate country/currency scope → `postVendorPayoutPaidJournal()` **before** status update (fail closed)
4. Update payout/batch/payables only after successful journal (or idempotent duplicate)
5. Enrich outbox `PAYOUT_PAID` payload with `journal_id`, `ledger_duplicate`
6. Return `presentPayoutWithLedger()` with observability fields

### `postVendorPayoutPaidJournal()` — new public method

| Field | Value |
|-------|-------|
| `sourceEventId` | `payout:{payoutId}` |
| `postingRuleId` | `vendor_payout_paid` |
| Debit | `AP_VENDOR` (reduces liability) |
| Credit | `AST_GATEWAY_CLEARING` (reduces sandbox cash proxy) |

Uses existing private `postJournal()` → `(sourceEventId, postingRuleId)` unique constraint for idempotency.

### `assertPayoutCountryScope()` — new guard

- Batch period `countryId` must match all linked `VendorPayable.countryId`
- Payout currency must match payable/line currency

### `presentPayoutWithLedger()` — admin observability

Exposes on execute/get paths for PAID payouts:

- `ledger_posting_status`: `POSTED` | `NOT_APPLICABLE` | `FAILED`
- `journal_id`, `journal_source_event_id`, `posting_rule_id`
- `ledger_duplicate` (idempotent replay flag)

### Other fixes

- `executePayout`: missing payout → `404` via `Errors.notFound()` (was Prisma 500)

### Files changed

| File | Change |
|------|--------|
| `finance.service.ts` | Ledger orchestration + guards + enriched presentation |
| `r14b.payout-ledger.e2e.spec.ts` | **Created** — 12 tests (A–L) |

**No schema migration.** Migration head unchanged at **137**.

---

## D. EVENT / DATA FLOW AFTER

```
POST /admin/finance/payouts/:id/execute
  → MockPayoutAdapter (SUCCESS → paid: true)
  → assertPayoutCountryScope()
  → postVendorPayoutPaidJournal()
      → postJournal() [idempotent]
      → LEDGER_JOURNAL_POSTED outbox
  → Payout.status = PAID
  → SettlementBatch = EXECUTED
  → VendorPayable = PAID
  → Outbox PAYOUT_PAID { journal_id, ledger_duplicate }
  → Response with ledger_posting_status
```

**FAILED / UNKNOWN / CANCELLED batch:** no `vendor_payout_paid` journal.

---

## E. ACCOUNTING INVARIANTS VERIFIED

| Step | Journal | AP_VENDOR | AST_GATEWAY_CLEARING |
|------|---------|-----------|----------------------|
| Order capture | `customer_capture` | — | Dr (funds in) |
| Marketplace split | `marketplace_split` | Cr (owe vendor) | — |
| Payout PAID | `vendor_payout_paid` | **Dr** (pay vendor) | **Cr** (funds out) |

Debit/credit directions match existing liability/asset semantics in `chart.ts`. Journal is balanced (debit = credit = `payout.amountMinor`). Currency preserved on journal + lines.

Sandbox uses `AST_GATEWAY_CLEARING` as cash proxy (no `AST_BANK` in chart — live bank account deferred to post-gate R14-C).

---

## F. IDEMPOTENCY GUARANTEES

| Replay | Behavior |
|--------|----------|
| Same payout execute when already PAID | Early return; `ledger_duplicate: true`; no new journal |
| Same PAID transition retried mid-flight | `postJournal()` finds existing `(sourceEventId, postingRuleId)` |
| Duplicate `submitPayout` idempotency key | Same payout row returned |
| Outbox `PAYOUT_PAID` | `occurrenceKey: payout:{id}:PAID` — single enqueue per status |

---

## G. SCHEMA / MIGRATION

**None required.** Existing `Journal @@unique([sourceEventId, postingRuleId])` enforces idempotency.

| Target | Head |
|--------|------|
| Repository | **137** |
| Test DB | **137** (up to date) |
| Dev DB | **137** (up to date) |

---

## H. RLS / SECURITY

No RLS changes. Payout/journal tables retain existing policies. No secrets exposed in API responses. MOCK payout always `sandbox: true`, `live: false` in presentation.

---

## I. TEST RESULTS

| Command | Result |
|---------|--------|
| `nx test api --testPathPatterns=r14b.payout-ledger --runInBand` | **12/12 PASS** |
| `nx test api --testPathPatterns=finance.e2e\|r14b.\|payment-webhook-recon\|refund --runInBand` | **87/87 PASS** |
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |

### Test matrix (A–L)

| ID | Scenario | Result |
|----|----------|--------|
| A | Sandbox payout created | PASS |
| B | payout → PAID | PASS |
| C | PAID → exactly one AP→clearing journal | PASS |
| D | Duplicate PAID execute → no duplicate journal | PASS |
| E | Duplicate payout submit → idempotent | PASS |
| F | FAILED payout → no PAID journal | PASS |
| G | CANCELLED batch → no PAID journal | PASS |
| H | Invalid payout reference → 404 | PASS |
| I | Country mismatch → blocked | PASS |
| J | Ledger posting failure → fail closed (stays APPROVED) | PASS |
| K | Replay after success → no financial mutation | PASS |
| L | Amount/currency invariants preserved | PASS |

---

## J. RUNTIME / DB HEALTH

- Migration head **137**, dev + test aligned
- Redis required for e2e (unchanged)
- No new env vars required

---

## K. DEFECTS DISCOVERED & FIXED

1. **Missing payout→ledger posting (real gap)** — PAID updated batch/payables without debiting `AP_VENDOR`; fixed with `postVendorPayoutPaidJournal`.
2. **Invalid payout ID returned 500** — `findUniqueOrThrow` on missing payout; fixed to `404 Not Found`.
3. **Ledger failure could mark PAID without journal** — journal now posts **before** status transition; failure leaves payout APPROVED.

---

## L. REMAINING R14-B ENGINEERING

| Priority | Work | Class |
|----------|------|-------|
| 1 | Finance recon break resolution workflow | F |
| 2 | Admin UI settlement-import / break queue | F |
| 3 | Scheduled settlement import worker (cron/poll) | F |
| 4 | Vendor payable adjustment on partial refund | F |
| 5 | Affiliate/carrier payout kinds (`AP_AFFILIATE`, `AP_CARRIER`) | F |
| 6 | Provider-specific settlement/payout adapters | E (post gates) |
| 7 | Tax/statutory hooks | E (R14-E) |
| 8 | Live payout rail + `AST_BANK` | E (R14-C) |

---

## M. HUMAN/LEGAL BLOCKERS

Unchanged — **0/7** R14-A gates ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md)). Live bank payout, real payout provider, and production credentials remain human/commercial decisions.

---

## N. NEXT CR

**Recommended:** `CR-R14-B-RECON-BREAK-WORKFLOW-287`

**Prompt:**

> Implement provider-neutral R14-B finance reconciliation break resolution workflow: extend `FinanceReconciliation` with admin resolve/investigate/close transitions, wire UNMATCHED/PARTIAL settlement-import breaks and payout UNKNOWN states into a unified break queue API, add idempotent resolution actions that do not duplicate journals, and create `r14b.recon-break.e2e.spec.ts` covering break lifecycle. No live PSP. No human gate re-audit. Build on CR-285 settlement import + CR-286 payout ledger. Preserve RLS and MOCK_* fail-closed behavior.

---

## O. FINAL VERDICT

**`R14_B_PAYOUT_LEDGER_COMPLETE`**

Sandbox/mock payout PAID now produces exactly one idempotent AP→clearing journal via the finance kernel. State safety, country isolation, fail-closed ledger posting, and tests A–L are green with full regression pass.
