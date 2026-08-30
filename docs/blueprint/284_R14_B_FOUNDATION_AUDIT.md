# 284 — R14-B foundation audit (CR-284)

**CR:** `CR-R14-B-FOUNDATION-AUDIT-284`  
**Verdict:** **`R14_B_FOUNDATION_SLICE_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Code-first audit of R14-B scope + provider-neutral engineering slice

**Boundaries respected:**

- R14-A sandbox kernel **unchanged** in scope (no live PSP, no human-gate re-audit)
- R14-A human gates **0/7** — not repeated ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md))
- No `PAYMENT_LIVE_ENABLED`, no production credentials, no RLS weakening

---

## A. CODE-FIRST R14-B AUDIT SUMMARY

| Area | Classification | Notes |
|------|----------------|-------|
| Phase 1G finance ledger / settlement / mock payout | **A. IMPLEMENTED** | `finance.service.ts`, chart, journals, vendor payables, settlement batches |
| Per-intent payment reconciliation (sandbox) | **A. IMPLEMENTED** | R14-A `PaymentService.reconcile()` |
| Refund → ledger facts | **A. IMPLEMENTED** | `syncPayment` + `postOrderJournals` |
| Refund → settlement net calculation | **B. PARTIAL → FIXED** | Was **C. REAL DEFECT** — refund facts lacked `orderId`; `openSettlement()` queried by order |
| Reconcile MATCH → finance sync | **B. PARTIAL → FIXED** | Was gap — reconcile updated payment state without finance refresh |
| Finance reconciliation import | **B. PARTIAL → FIXED** | Was duplicate rows on repeat import |
| Finance reconciliation list API | **F. R14-B WORK → DONE** | `GET admin/finance/reconciliations` |
| PSP settlement file/API import | **F. R14-B WORK** | Not started — needs port/staging after live PSP |
| Payout execution ledger entries | **F. R14-B WORK** | Mock payout only; AP/clearing journal on PAID not implemented |
| Tax engine / statutory posting | **E. HUMAN/LEGAL** | R14-E; cart hardcodes tax 0 |
| Live payout rail | **E. HUMAN/LEGAL** | R14-C; OD-PAY-08 |
| Finance background workers | **F. R14-B WORK** | No scheduled settlement import worker |
| `r14b.reconciliation.e2e` | **F. R14-B WORK → DONE** | 5 tests added |
| Admin finance UI depth | **B. PARTIAL** | Dashboard counts only; break queue API now exists |

---

## B. SOURCE FILES INSPECTED

| Path | Role |
|------|------|
| `apps/api/src/finance/finance.service.ts` | Ledger, facts, settlement, payout, recon import |
| `apps/api/src/finance/admin.controller.ts` | Admin finance APIs |
| `apps/api/src/finance/chart.ts` | COA |
| `apps/api/src/finance/payout.port.ts` | Payout abstraction |
| `apps/api/src/finance/mock-payout.adapter.ts` | Sandbox payout |
| `apps/api/src/finance/finance.e2e.spec.ts` | Phase 1G finance e2e |
| `apps/api/src/finance/r6e.vendor.e2e.spec.ts` | Vendor settlement isolation |
| `apps/api/src/finance/journal.spec.ts` | Journal invariants |
| `apps/api/src/payment/payment.service.ts` | Payment reconcile + finance bridge |
| `apps/api/src/payment/mock.adapter.ts` | Sandbox gateway |
| `apps/api/src/payment/payment-webhook-recon.e2e.spec.ts` | R14-A recon regression |
| `apps/api/src/orders/order.service.ts` | Order → finance sync |
| `apps/api/src/cart/cart.service.ts` | Tax boundary (0/UNKNOWN) |
| `packages/database/prisma/schema.prisma` | Finance/payment models |
| `docs/blueprint/242_R14_IMPLEMENTATION_PLAN.md` | R14-B plan §330–341 |

---

## C. REAL DEFECTS FOUND & FIXED

### 1. Settlement refund undercount (provider-neutral)

**Defect:** `openSettlement()` summed refund facts by `orderId`, but refund facts were recorded with `paymentIntentId` only → `refundMinor` always 0 → vendor overpaid on net settlement.

**Fix:**

- `syncPayment()` — attach `orderId` to refund facts when order exists
- `openSettlement()` — use `refundTotalForOrder()` via payment intent lookup
- Regression: `r14b.reconciliation.e2e` test 1

### 2. Reconcile MATCH did not sync finance

**Defect:** `PaymentService.reconcile()` updated payment/recon state but did not call finance sync → R14-B acceptance “journal posts on match” failed for reconcile-only healing paths.

**Fix:**

- `syncFinanceAfterPaymentReconcile()` after MATCH (including duplicate MATCH re-sync)
- Regression: `r14b.reconciliation.e2e` tests 2, 5

### 3. Finance recon import duplicated rows

**Defect:** `importExistingRecon()` always inserted — repeated admin imports multiplied `finance_reconciliations`.

**Fix:** Skip insert when `(domain, internalRef, breakType, status)` already exists; return `{ imported, skipped, total }`.

### 4. Sandbox mock `resolve()` no-op for unknown providerRef

**Defect:** `MockPaymentGatewayAdapter.resolve()` only updated existing ledger rows — manual test providerRefs never reconciled.

**Fix:** Upsert ledger row on resolve (sandbox test/recon drill only).

---

## D. IMPLEMENTATION DELIVERED

| File | Change |
|------|--------|
| `apps/api/src/finance/finance.service.ts` | Refund/settlement fix; idempotent import; `listFinanceReconciliations()` |
| `apps/api/src/finance/admin.controller.ts` | `GET admin/finance/reconciliations` |
| `apps/api/src/payment/payment.service.ts` | `syncFinanceAfterPaymentReconcile()` wired into reconcile |
| `apps/api/src/payment/mock.adapter.ts` | Sandbox `resolve()` upsert |
| `apps/api/src/finance/r14b.reconciliation.e2e.spec.ts` | **Created** — 5 R14-B foundation tests |

**No schema migration.** RLS unchanged.

---

## E. TEST RESULTS (CR-284 run)

| Suite | Result |
|-------|--------|
| `r14b.reconciliation.e2e` | **5/5 PASS** |
| `payment-webhook-recon.e2e` | **20/20 PASS** (regression) |
| `finance.e2e` + `journal.spec` + `r6e.vendor` | **7/7 PASS** |
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |

---

## F. DB / RUNTIME STATUS

| Target | State |
|--------|-------|
| Repository migration head | **135** |
| Test DB (`worldpharma_test`) | **Up to date** |
| Dev DB (`worldpharma`) | **7 pending** (R14-A inventory/checkout migrations — operational lag from CR-282) |
| RLS / FORCE RLS | **Intact** — no finance RLS changes |

---

## G. SECURITY STATUS

**NONE** — no new blockers.

- No live PSP/payout activation
- No production payment guard changes
- No secrets committed
- Finance recon list/import remain admin permission-gated (`finance:read`, `finance:reconcile`)

---

## H. REMAINING R14-B WORK (provider-neutral + post-gate)

| Priority | Work | Class |
|----------|------|-------|
| 1 | PSP settlement import port + staging schema | F |
| 2 | Batch settlement matcher → ledger posting | F |
| 3 | Payout execution journal entries (AP → clearing) | F |
| 4 | Vendor payable adjustment on partial refund | F |
| 5 | Finance recon break resolution workflow | F |
| 6 | Finance admin UI break queue | F |
| 7 | Scheduled settlement import worker | F |
| 8 | Tax/statutory hooks | E (R14-E) |
| 9 | Live payout adapter | E (R14-C) |

---

## I. HUMAN/LEGAL BLOCKERS (not R14-B engineering)

Unchanged from R14-A — **0/7** ([283](283_R14_A_HUMAN_APPROVAL_INTAKE.md)):

PSP, production country, legal entity, MoR, PSP contract, vault/credentials, PCI scope/SAQ.

Additionally for R14-B full live scope per Book 242: **accounting rules**, **settlement calendar** (human/commercial).

---

## J. NEXT CR

**Recommended:** `CR-R14-B-SETTLEMENT-IMPORT-PORT-285`

**Prompt:**

> Implement provider-neutral PSP settlement import foundation for R14-B: add `SettlementImportPort` + sandbox file/API stub adapter, staging table migration with RLS, idempotent batch ingest into `finance_reconciliations`, and extend `r14b.reconciliation.e2e` for import→match→ledger path. No live PSP SDK. No human gate fabrication. Build on CR-284 reconcile→finance sync.

Do **not** execute CR-R14-A-IMPL-244 unchanged.

---

## K. FINAL VERDICT

**`R14_B_FOUNDATION_SLICE_COMPLETE`**

R14-B foundation audit complete. Provider-neutral defects in refund/settlement math and reconcile→finance sync are **fixed and tested**. R14-B full scope (PSP settlement import, live breaks at scale, payout ledger) remains — blocked on live PSP selection for provider-specific import, not on sandbox engineering readiness.
