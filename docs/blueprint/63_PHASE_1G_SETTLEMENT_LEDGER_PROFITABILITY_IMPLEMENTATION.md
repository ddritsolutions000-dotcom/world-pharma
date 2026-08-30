# 63 — Phase 1G settlement, ledger, profitability implementation

**Status:** Implemented (sandbox / mock payout only)  
**Date:** 26 August 2026  
**Authorization:** Phase 1G coding — **MOCK/SANDBOX MONEY MOVEMENT ONLY**  
**Stop:** Do not start a new phase. Do not enable live PSP, DHL, bank, vendor, or affiliate payout.

Plan: [62](62_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_PLAN.md). Payments remain sandbox ([57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md)). Carriers remain mock ([61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md)).

**R5-D note:** Rx Orders post sandbox facts only after eligible payment — [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) (**R5_D_IMPLEMENTED**; no live payout). Prescribe/dispense alone create no finance facts.  
**R5-E note:** Each refill Order posts its own facts; no invented recurring revenue — plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**R5_E_PLAN_READY**).

## Architecture

Module `apps/api/src/finance/`. Facts from 1D/1E/1F are copied into append-only `FinancialFact` rows. Posting rules create balanced `Journal` + `JournalLine` rows. Contribution is derived from facts, never from `sale − cost`. `PayoutPort` + `MockPayoutAdapter` is the only payout rail.

PostgreSQL is financial SoT. Outbox + BullMQ only. No finance microservice.

## Database

Additive migration `20260826270000_finance_ledger`. UUID v7. BIGINT minors. Explicit currency. RLS enabled on finance tables. Unique `(source_event_id, posting_rule_id)` on journals. Unique `source_key` on facts. Unique payout `idempotency_key` / `provider_ref`.

## Ledger and CoA

Configurable `LedgerAccount` per country. Seeded codes are **illustrative**, not statutory. Posted journals cannot be updated; corrections reverse. Debits must equal credits.

## Facts and integrations

- Capture / refund from `PaymentIntent` (`FAILED` / `UNKNOWN` → no revenue)
- Order freeze: tax, shipping, promo split, affiliate, COGS or vendor payable
- Carrier quoted/actual from `CarrierCost` (**NULL actual stays NULL**)
- Generic recon import from existing payment + carrier recon rows

## Payables, settlement, payout

Vendor payable frozen take-rate. T+N from `SettlementPolicy.holdDays` (default 0 — not invented). Dual control optional. Mock payout states include `UNKNOWN`, which cannot auto-resubmit.

## Profitability

`ContributionSnapshot` with GMV, revenues, costs, contribution. Labelled **contribution, not net profit**. Status `PROVISIONAL` until required actuals exist.

## API / UI

Admin `/admin/finance/*` with `finance:read|post|approve|settle|reconcile`. Vendor `/vendor/settlements`. Affiliate `/me/affiliate/earnings`. Customer has no economics APIs. Admin Finance page is sandbox-labelled.

## Events

`LEDGER_JOURNAL_POSTED`, payable/settlement/payout/affiliate/promo/refund/recon/contribution types. Payout events are sandbox/mock. No live `VENDOR_PAID` / `AFFILIATE_PAID`.

## Tests

`journal.spec.ts` + `finance.e2e.spec.ts`: balanced journals, frozen take-rate, NULL freight, UNKNOWN payout block, RBAC, contribution from facts.

## Limitations

Sandbox payment, mock carrier, mock payout. No live money. MoR, tax law, T+N, CoA statutory mapping remain OPEN.

## Stop

**Do not start the next phase. Do not enable live payout/PSP/DHL.**
