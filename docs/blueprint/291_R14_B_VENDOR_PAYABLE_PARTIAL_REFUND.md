# 291 — R14-B vendor payable partial refund adjustment (CR-291)

**CR:** `CR-R14-B-VENDOR-PAYABLE-PARTIAL-REFUND-291`  
**Verdict:** **`R14_B_VENDOR_PAYABLE_PARTIAL_REFUND_COMPLETE`**  
**Date:** 30 August 2026  
**Method:** Extend existing `PaymentService` refund → `finance.syncOrder` path — no new listener, no migration

**Boundaries respected:**

- Reuses CR-270/271 refund execution and CR-284–290 finance/settlement architecture
- No live PSP, no live payout rail
- R14-A human gates **0/7** unchanged (not re-audited)
- No duplicate refund pipeline
- Ledger idempotency preserved and strengthened for concurrency
- Migration head **142** unchanged

---

## A. PRE-AUDIT FINDINGS

| Area | Finding |
|------|---------|
| Refund path | `PaymentService.executeRefund` → `PAYMENT_REFUNDED` outbox → `finance.syncPayment` + `finance.syncOrder` in worker tenant context |
| Vendor payable creation | `syncOrder` creates immutable `FinancialFact` `vendor_payable:{orderId}` + `vendorPayable` row (upsert `update: {}`) |
| CR-284 settlement net | `openSettlement` subtracts `refundTotalForOrder` from gross — **net correct at batch open** |
| **Concrete defect** | After partial refund, `vendorPayable.amountMinor` stayed at original gross; no AP_VENDOR ledger adjustment; settlement net correct but payable row and AP balance overstated |
| `customer_refund` journal | Customer/clearing side only — Dr `LIAB_UNEARNED`, Cr `AST_GATEWAY_CLEARING` |
| Refund facts (pre-fix) | Cumulative `refund_total:{intentId}:{refundedMinor}` facts **summed** on multiple partial refunds → double-count risk in `refundTotalForOrder` |

---

## B. ACCOUNTING INVARIANT

**Immutable original gross:** `FinancialFact` `vendor_payable:{orderId}` (never updated on refund)

**Outstanding vendor payable:**

```
outstanding = max(0, originalGross − paymentIntent.refundedMinor)
```

Matches CR-284 settlement net: `netMinor = originalGross − refunds`.

**Per-refund journal rule (`vendor_refund_adjustment`):**

```
Dr AP_VENDOR     vendorDebit
Cr LIAB_UNEARNED vendorDebit
```

Where `vendorDebit = min(refundIncrement, remainingVendorOutstanding)` and `remainingVendorOutstanding` decrements cumulatively across refund rows.

**Customer side (per refund row, idempotent):**

```
Dr LIAB_UNEARNED          refundAmount
Cr AST_GATEWAY_CLEARING   refundAmount
```

Pairs with vendor adjustment on `LIAB_UNEARNED` for balanced sandbox semantics.

---

## C. REFUND ATTRIBUTION

| Case | Handling |
|------|----------|
| Partial refund | One journal per `Refund` row; payable reduced by cumulative `refundedMinor` |
| Multiple partial refunds | Incremental journals; outstanding = original − total refunded |
| Partial → full refund | Final increment capped at remaining vendor outstanding → payable 0 |
| Duplicate refund event | `postJournal` idempotency `(sourceEventId, postingRuleId)` + P2002 race recovery |
| Already-refunded replay | `syncOrder` replay is no-op for journals and payable |
| No marketplace vendor payable | Platform-owned / no `vendor_payable` fact → skip vendor journal |
| Non-commerce / no order | No vendor attribution; no vendor journal |
| Cross-country | All writes scoped to `order.countryId` |
| Missing attribution | Fail closed — no vendor journal when no vendor fact |

---

## D. IMPLEMENTATION

| File | Change |
|------|--------|
| `finance.service.ts` | `postRefundJournalsForOrder` — per-refund customer + vendor journals |
| | `applyVendorPayableRefundAdjustments` — sync `vendorPayable.amountMinor` to outstanding |
| | `syncOrder` — call adjustment after `postOrderJournals` |
| | `syncPayment` — per-`Refund`-row facts (`refund:{refundId}`) + seed fallback |
| | `refundTotalForOrder` — authoritative `paymentIntent.refundedMinor` |
| | `openSettlement` — gross from immutable fact; net from fact − refunds; sync payable outstanding |
| | `postJournal` — P2002 duplicate recovery for concurrent replay |

**Idempotency keys:**

- Customer: `customer_refund:{refundId}` / `customer_refund:refund_total:{intentId}:{total}`
- Vendor: `vendor_refund:{refundId}` / `vendor_refund:refund_total:{intentId}:{total}`
- Posting rules: `customer_refund`, `vendor_refund_adjustment`

**No new listener** — existing `executeRefund` → `syncOrder` hook extended.

---

## E. SETTLEMENT INTERACTION

| Case | Behaviour |
|------|-----------|
| Refund before settlement | Batch line: `gross_minor` = original fact; `net_minor` = outstanding |
| Refund after settlement | Historical batch line unchanged; payable row reflects refund |
| Settlement replay / resync | Idempotent — no double adjustment |
| Multiple refunds | Single gross, cumulative `refund_minor`, correct net |

CR-284 net logic preserved; payable row now aligned with settlement net.

---

## F. RLS / COUNTRY / RBAC

- Tenant context unchanged (`workerTenantContext` on refund finance sync)
- Country scope from order/payment intent
- No global RLS bypass
- Finance permissions unchanged

---

## G. TESTS

| Suite | Result |
|-------|--------|
| `r14b.vendor-payable-refund.e2e` | **15/15 PASS** (scenarios A–O) |
| `r14b.reconciliation.e2e` | PASS (test 1 updated for adjusted payable) |
| `r14b.settlement-import.e2e` | PASS |
| `r14b.settlement-import-worker.e2e` | PASS |
| `r14b.settlement-schedule-admin.e2e` | PASS |
| `r14b.payout-ledger.e2e` | PASS |
| `r14b.recon-break.e2e` | PASS |
| `finance.e2e` | PASS |
| `payment-refund.listener.e2e` | PASS |
| `order-payment-refunded.listener.e2e` | PASS |
| `api:typecheck` | PASS |

**Migration:** Not required — existing `vendorPayable`, `Refund`, `journal` uniqueness sufficient.

---

## H. RUNTIME VERIFICATION

| Check | Result |
|-------|--------|
| Postgres test DB | healthy (142 migrations applied) |
| Redis | required by e2e — healthy during test run |
| `/health/ready` | **Not verified** — API not running on `:3000` at audit time |
| Workers/listeners | Refund path verified via e2e (no new registration) |

**Blocker:** Start API dev server to confirm `/health/ready = 200` in live environment.

---

## I. POST-IMPLEMENTATION AUDIT

| # | Check | Status |
|---|-------|--------|
| 1 | Partial refund reduces vendor payable | GREEN |
| 2 | Multiple refunds accumulate correctly | GREEN |
| 3 | Full refund after partials → payable 0 | GREEN |
| 4 | Duplicate refund events cannot double-post | GREEN |
| 5 | Concurrent syncOrder cannot double-post (P2002) | GREEN |
| 6 | Uses existing ledger primitives | GREEN |
| 7 | No duplicate refund pipeline | GREEN |
| 8 | Settlement net remains correct | GREEN |
| 9 | Payout ledger remains correct | GREEN |
| 10 | Reconciliation / break workflow unchanged | GREEN |
| 11 | Idempotency keys deterministic | GREEN |
| 12 | Money in minor units (`bigint`) | GREEN |
| 13 | Country/RLS isolation intact | GREEN |
| 14 | RBAC intact | GREEN |
| 15 | No live PSP introduced | GREEN |
| 16 | No fabricated human gates | GREEN |
| 17 | R14-A guards unchanged | GREEN |
| 18 | Tests exercise real accounting paths | GREEN |
| 19 | No dead accounting code | GREEN |
| 20 | Refund fact double-count fixed | GREEN |

---

## J. DEFECTS FIXED

1. **Vendor payable not reduced on refund** — `applyVendorPayableRefundAdjustments`
2. **Missing AP_VENDOR journal** — `vendor_refund_adjustment` per refund row
3. **Cumulative refund fact double-count** — per-row facts + `refundedMinor` authoritative total
4. **Cumulative customer_refund journal duplication** — per-refund idempotency
5. **Settlement gross/net when payable pre-adjusted** — `openSettlement` uses immutable fact gross
6. **Concurrent journal race** — P2002 recovery in `postJournal`

---

## K. FRESH R14-B GAP SCAN

After CR-291 source audit of sandbox/provider-neutral R14-B finance scope:

| Area | Status |
|------|--------|
| Settlement import port/worker/schedule | COMPLETE (CR-285–289) |
| Payout execution ledger | COMPLETE (CR-286) |
| Reconciliation break workflow + UI | COMPLETE (CR-287, CR-290) |
| Refund → settlement net | COMPLETE (CR-284) |
| Refund → vendor payable + AP ledger | **COMPLETE (CR-291)** |
| Sandbox payout rail | COMPLETE (mock) |
| Finance admin observability | COMPLETE |

**Verdict:** **R14-B sandbox/provider-neutral finance engineering is COMPLETE.**

No further artificial CRs recommended for R14-B. Next roadmap phase should follow [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) beyond sandbox finance (e.g. R14-A human gates when owner evidence exists, or next track per master roadmap).

R14-A human gates remain **0/7** — separate track, not re-audited here.
