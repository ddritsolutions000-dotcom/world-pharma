# 62 — Phase 1G settlement, ledger, profitability (implementation plan)

**Status:** Plan — implemented as sandbox/mock in [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md)  
**Date:** 26 August 2026  
**Authorization:** Phase 1G **planning** only  
**Forbidden in this task:** production code, Prisma migrations, live PSP, live DHL, real money movement, real vendor payout, real affiliate payout, bank transfer, wallet product, Lab/Doctor settlement, Phase 1H+

Canonical: [13](13_LEDGER_SETTLEMENT.md), [43](43_ECOSYSTEM_BASELINE_LOCK.md), [50](50_PHASE_1_COMMERCE_BLUEPRINT.md) §5 / 1G, [12](12_PAYMENT_PLATFORM.md), [14](14_AFFILIATE_PLATFORM.md), [17](17_ADMIN_ERP.md), [18](18_GLOBALIZATION.md), [19](19_COMPLIANCE_FRAMEWORK.md), [20](20_DATABASE_ARCHITECTURE.md) §5.44–5.46, [21](21_API_ARCHITECTURE.md), [22](22_EVENT_ARCHITECTURE.md), [27](27_SECURITY_ARCHITECTURE.md), [35](35_OPEN_DECISIONS.md), [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md), [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md), [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md)

1F ends at mock carrier + **NULL≠0** actual freight on `CarrierCost`. 1E froze `OrderEconomicsSnapshot` with **estimates** (platform take 0 — no hardcoded %). 1D recorded sandbox captures, refunds, PSP recon exceptions, and `PaymentFxSnapshot`. This plan is the contract to turn those **immutable facts** into a double-entry journal, contribution engine, payables, settlement batches, and a payout **port** — without moving real money.

**Live payout rails, live PSP, live DHL, and statutory accounting treatment require separate authorization after LEGAL/FINANCE/COMPLIANCE review.**

---

## 0. Boundary

| In 1G (when coded later) | Out of 1G |
| --- | --- |
| Double-entry journal + configurable chart of accounts | Live PSP / live DHL / live bank |
| Consume 1D/1E/1F facts (do not rewrite them) | Recalculating old orders from today’s catalog |
| Contribution engine (explainable) | Calling contribution “net profit” |
| VendorPayable + SettlementBatch + PayoutPort | Real vendor/affiliate/bank payout |
| AffiliateLiability from frozen snapshot | Clinical affiliate enablement |
| Promo funding split (platform/vendor/split) | Invented tax/GST/VAT rates |
| Generic recon framework over PSP + carrier (+ vendor/affiliate/payout) | Five unrelated recon products |
| Finance admin read/approve (RBAC) | God-mode finance |
| Sandbox payout adapter (no-op / mock) | Real settlement money movement |

**1F → 1G:** `CarrierCost.amountMinor` (nullable) + `CarrierReconciliation` exceptions become freight expense facts.  
**1G → later:** posted journals + approved settlements feed a live `PayoutPort` **only after extra auth**.

Do **not** capture payment, create Orders, book carriers, or invent MoR/tax law.

**Examples in this document are illustrative posting shapes, not legal accounting advice. LEGAL/FINANCE/COMPLIANCE REVIEW REQUIRED.**

---

## 1. Existing facts to consume (do not duplicate)

| Source | Models already in Prisma | 1G role |
| --- | --- | --- |
| 1A | `CatalogOffer.ownership` (`PLATFORM_OWNED` / `VENDOR_OWNED` / `MARKETPLACE`), `PriceVersion.costMinor`, `CommercialRule` (`takeBps`, `takeFlatMinor`, country/seller/category/SKU) | Ownership path + freeze `commercial_rule_id` |
| 1C | `PromoCampaign.funding` (`PLATFORM` / `VENDOR` / `SPLIT`), `PromoApplication`, `AffiliateAttributionSnapshot` | Promo split + affiliate **preview** |
| 1D | `PaymentIntent` (`CAPTURED`, `refundedMinor`, `UNKNOWN`), `PaymentTransaction.kind`, `Refund`, `PaymentReconciliation`, `PaymentFxSnapshot` | Only **confirmed** money posts; fees as separate facts; FX snapshot reuse |
| 1E | `Order` + frozen snapshots: pricing, tax, promo (`platformMinor`/`vendorMinor`), affiliate (`estimateMinor`, `clinicalBlocked`, `payable`), shipping (`chargedMinor`, `subsidyMinor`, `actualCostMinor` nullable), `OrderEconomicsSnapshot` | Order economics **freeze**; 1G does not reprice |
| 1F | `CarrierCost` (`kind`, `amountMinor` **nullable**, `currency`, `fxSnapshotId`), `CarrierCostAdjustment`, `CarrierReconciliation` | Actual freight; NULL stays unknown |

**Do not** create a second payment, order, promo, affiliate-attribution, FX, or carrier-cost store.

---

## 2. Core objective

Financial kernel for:

- `PLATFORM_OWNED` (first-party COGS, **no fake vendor payable**)
- `VENDOR_OWNED` / `MARKETPLACE` (vendor payable from **frozen** commercial rule)
- future warehouses / countries / PSPs / carriers
- promos, affiliate, tax snapshots, refunds, shipping subsidy vs actual freight
- vendor payables, settlement, payout **abstraction**
- contribution (not statutory net income)

**Forbidden formula:** `sale_price - product_cost`.

**Contribution (directional):**

```
customer_captured
− refunds_to_customer
− gateway_fees (when known)
− vendor_payable (marketplace) OR COGS (owned)
− affiliate_commission (when eligible)
− promo_platform_funded
− tax_collected_as_agent (if agent; OPEN)
− actual_carrier_cost (when known)
− other approved posted costs
= contribution
```

Missing facts stay **NULL / UNKNOWN**. They are **not** silently zero. Contribution status is `PROVISIONAL` until required actuals exist or are explicitly waived by policy.

Do **not** call this **net profit**. Operating profit and net profit require corporate opex, depreciation, tax expense — **out of 1G product scope**.

---

## 3. Money model

Every amount:

| Field | Rule |
| --- | --- |
| `amount_minor` | `BIGINT` minor units |
| `currency` | ISO-4217 `CHAR(3)` on the **same row** |
| Optional `fx_snapshot_id` | Only if a second currency is stored |

No floating point. Never silent FX. Original transaction currency is preserved ([12], [18], [20]). Reporting/settlement currency is additive via snapshot, never a replacement.

**NULL ≠ 0** for: actual carrier cost, gateway fee actual, COGS if cost version missing, tax when `TaxQuoteStatus.UNKNOWN`.

---

## 4. Architecture

```
1D Payment facts     1E Order snapshots     1F CarrierCost / recon
        \                    |                      /
         \                   |                     /
          v                  v                    v
                 FinancialFact (append-only, typed)
                          |
                          v
              PostingRule (country pack + CoA)
                          |
                          v
            Journal (POSTED) + JournalLine  ← SUM(D)=SUM(C)
                          |
          +---------------+---------------+
          v               v               v
   VendorPayable    AffiliateLiability   CarrierPayable/Expense
          |               |
          v               v
     SettlementBatch → PayoutPort (mock in 1G)
          |
          v
     ContributionSnapshot (derived, versioned; not a rewrite of facts)
```

SoT: PostgreSQL. Redis not financial SoT. Outbox + BullMQ only ([22], [43]). Modular monolith — **no finance microservice**.

---

## 5. Ledger

Align [13] and [20] §5.44–5.46.

| Entity | Role |
| --- | --- |
| `LedgerAccount` | Configurable CoA row per legal entity |
| `Journal` | Immutable header, status `POSTED` only in v1 ([13] OD-LED-11) |
| `JournalLine` | Debit or credit; `amount_minor` > 0; `dc` |
| `PostingRule` | Maps source event → lines; never hardcode accounts in adapters |
| `FinancialFact` | Normalized money fact **before** posting (capture, fee, freight, promo, …) |

**Balance:** for each posted journal, Σ debit = Σ credit in the journal’s **balancing currency**. Multi-currency lines require `fx_snapshot_id` + `amount_accounting_minor`.

**Immutability:** no UPDATE/DELETE of posted journals or lines. Corrections: reversing journal (`reverses_journal_id`) + optional new correct journal. Idempotency: unique `(source_event_id, posting_rule_id)`.

**Unknown money:** PostingRule **fails closed** if a required amount is NULL. Do not post guessed freight or tax.

---

## 6. Chart of accounts

**Not hardcoded.** Seed a **logical** catalog (codes below are **illustrative**, not statutory). Each legal entity maps codes → accounts.

| Type | Illustrative codes | Notes |
| --- | --- | --- |
| ASSET | `AST_GATEWAY_CLEARING`, `AST_BANK`, `AST_COD_IN_TRANSIT`, `AST_INVENTORY` | Per PSP account / currency |
| LIABILITY | `AP_VENDOR`, `AP_AFFILIATE`, `AP_CARRIER`, `TAX_PAYABLE`, `LIAB_UNEARNED`, `AP_CUSTOMER_REFUND` | Wallet `LIAB_WALLET` is future ([13] §10) — **not 1G product** |
| REVENUE | `REV_OWNED_GOODS`, `REV_COMMISSION`, `REV_SHIPPING` | MoR OPEN |
| EXPENSE | `EXP_GATEWAY_FEE`, `EXP_FREIGHT`, `EXP_PROMO_PLATFORM`, `EXP_AFFILIATE` | |
| EQUITY | `EQ_RETAINED` | Period close OPEN (OD-LED-03) |
| COGS | `COGS_OWNED` | First-party only |

Country pack + finance config select accounts. **No 10%/15%/20% and no INR/USD/EUR assumption in code.**

---

## 7. Payment → ledger (1D)

Post **only** confirmed facts:

| Intent / transaction | Journal? |
| --- | --- |
| `CAPTURED` / capture txn | Yes — clearing + unearned/revenue per MoR rule |
| `AUTHORIZED` / `AUTHORIZED_COD` | Optional unearned; **not** revenue |
| `FAILED` / `CANCELLED` / `EXPIRED` | No revenue |
| `UNKNOWN` | **No post** until recon ([57]) |
| Redirect / client callback | Never trusted ([57]) |
| `Refund.REFUNDED` | Reversing / contra facts |
| Gateway fee (from recon or fee txn `kind`) | Separate `EXP_GATEWAY_FEE` when known; else NULL |

Reuse `PaymentReconciliation` breaks: missing, amount, currency, duplicate. 1G **does not rewrite** payment rows; it creates recon exceptions + optional adjustment journals after review.

---

## 8. Order → economics (1E)

`OrderEconomicsSnapshot` is the **commercial freeze**:

- customer paid, discount, tax, shipping charged/subsidy
- vendor payable **estimate**, platform take **estimate** (today 0)
- gateway fee **estimate**, affiliate **estimate**
- `actualCarrierCostMinor` nullable

1G:

1. Copies freeze into `EconomicSnapshot` version 1 (`source=ORDER_CREATE`).
2. **Never** reapplies today’s `CommercialRule` or catalog prices to old orders.
3. Appends later versions when actuals arrive (fee, freight, refund) — **new rows**, not UPDATE of v1.

Freeze at checkout/order: `commercial_rule_id`, `price_version_id`, promo funding split, affiliate bps/base, tax adapter ref.

---

## 9. Company-owned vs vendor economics

| `OfferOwnership` | Payable | Cost |
| --- | --- | --- |
| `PLATFORM_OWNED` | **No** `VendorPayable` | `PriceVersion.costMinor` frozen as COGS candidate; if missing → COGS UNKNOWN |
| `VENDOR_OWNED` / `MARKETPLACE` | `VendorPayable` from frozen `CommercialRule` | Vendor bears COGS; platform records take + fees |

`CommercialRule` already has `takeBps` + `takeFlatMinor` + country/seller/category/item/variant + validity window. 1G **snapshots the chosen rule** onto the order/economics row. Later 15% does not change last month’s 12%.

**No magic numbers in code.**

---

## 10. Vendor payable

`VendorPayable` (new), states:

`PENDING → ELIGIBLE → ON_HOLD → APPROVED → SCHEDULED → PAID`  
also `REVERSED`

Eligibility inputs (all **data/policy**, not a universal T+7):

- order/shipment state (recommend recognize at **delivery/POD** — [13] OD-LED-08, still OPEN)
- refunds / chargebacks
- return window (country pack)
- contract terms / hold
- KYC / vendor ACTIVE

Configurable `T+N` on pack/contract. **Do not invent a global payout delay.**

Refunds **before** settlement reduce payable (not platform loss) except platform goodwill ([13] OD-LED-06).

---

## 11. Affiliate

Consume `OrderAffiliateSnapshot` + `AffiliateAttributionSnapshot`.

`AffiliateLiability` states: `PENDING → APPROVED → PAYABLE → PAID` + `REVERSED`.

- Amount frozen at order (preview may exist; payable uses freeze).
- `clinicalBlocked=true` → **no liability object** (or VOID). Clinical categories default OFF until legal pack sign-off ([14]).
- Pending is **not** AP ([13] §8.6). Post `AP_AFFILIATE` only on APPROVED.
- Liability must not exceed captured eligible economics. Refund → reverse or clawback AR.
- **No payout in 1G implementation** (same as vendor: mock `PayoutPort` only).

---

## 12. Promo

Reuse `PromoFunding`: `PLATFORM` / `VENDOR` / `SPLIT`.

Ledger must show **separately**:

- customer discount (reduces GMV/revenue presentation)
- platform promo expense (`platformMinor`)
- vendor-funded slice (`vendorMinor`) — reduces vendor payable, **not** hidden inside it without a line

Do not collapse subsidy into a single “discount” P&L bucket.

---

## 13. Tax

Reuse `OrderTaxSnapshot` (`status`, `taxMinor`, `adapterRef`). Do **not** hardcode GST/VAT/HST/sales tax.

Snapshot fields (plan): tax category, jurisdiction, amount, currency, provider/ref.

If status is UNKNOWN, tax fact is UNKNOWN — fail-closed for posting that requires tax. **LEGAL/COMPLIANCE REVIEW REQUIRED.** MoR vs marketplace facilitator (OD-PAY-01) changes whether tax is liability vs pass-through.

---

## 14. Carrier / shipping economics

Distinguish **five** amounts ([61]):

| Concept | Source |
| --- | --- |
| Customer shipping charge | `OrderShippingSnapshot.chargedMinor` |
| Platform / vendor shipping subsidy | order shipping + 1F quote subsidies |
| Carrier quoted | `CarrierCost` kind quoted |
| Actual carrier + surcharges | `CarrierCost` kinds actual/fuel/remote/… |
| Adjustments | `CarrierCostAdjustment` (append-only) |

**Customer charge ≠ carrier cost.** NULL actual ≠ 0. Contribution stays `PROVISIONAL` until actual is posted or policy marks freight waived.

1G may post `EXP_FREIGHT` / `AP_CARRIER` when actual is known. Quoted-only is not actual expense.

---

## 15. Refunds and chargebacks

Refunds **originate in 1D** (`Refund`). 1G consumes `PAYMENT_REFUNDED`.

Support: full, partial, multiple partials; optional shipping refund; promo/affiliate/vendor reversals **per policy**. Not every cost is refundable (actual freight already incurred may remain expense).

**Do not create money from refunds.** Refund ≤ captured − already refunded ([57]).

Chargebacks/disputes (future): new `FinancialFact` + reversing/reserve journals (`LIAB_CHARGEBACK_RESERVE`). **Never UPDATE** the original capture journal.

---

## 16. Reconciliation framework (one)

Generic `ReconciliationException`:

| Field | |
| --- | --- |
| `domain` | `PSP` / `CARRIER` / `VENDOR_SETTLEMENT` / `AFFILIATE` / `PAYOUT` |
| `status` | reuse `MATCHED` / `BREAK` / `INVESTIGATE` |
| `break_type` | missing, amount, currency, duplicate, unexpected fee, weight, unknown txn |
| `internal_ref` / `external_ref` | |
| `amount_minor` / `currency` nullable | |

**Consume, do not clone:** `PaymentReconciliation`, `CarrierReconciliation`. 1G may wrap them as `domain` rows or view-union. Posting adjustments only after `finance:reconcile` review. **Never rewrite history.**

---

## 17. Settlement and payout

`SettlementPeriod` → `SettlementBatch` → `SettlementLine` (per vendor/affiliate × country × currency).

Line math: gross payable − refunds − chargebacks ± adjustments − fees = **net payable**. **No single global settlement currency.**

`PayoutPort`: `create({ idempotencyKey, amount, currency, beneficiaryRef })` → provider ref.

1G adapter: **MockPayoutAdapter** (sandbox). No bank, no PSP payout, no live rail.

Payout states: `CREATED → APPROVED → SUBMITTED → PROCESSING → PAID` + `FAILED` / `UNKNOWN` / `REVERSED`.

**UNKNOWN must not auto-retry a second submit** until recon (same dual-book rule as 1D/1F). Unique payout reference + provider reference. Idempotency key required.

Maker-checker: creator ≠ approver where pack requires dual control ([17] SoD).

---

## 18. Multi-currency and FX

Three layers: **transaction**, **settlement**, **reporting**. None assumed INR/USD/EUR.

Reuse/extend `PaymentFxSnapshot` (base, quote, `rateMinor`, source, `quotedAt`). Historical FX is **never overwritten**. New rates = new rows.

A journal that mixes currencies **must** carry FX snapshot on converted lines. Otherwise reject post.

---

## 19. Profitability engine

Deterministic, fact-driven. Inputs are journal facts + snapshots, not live catalog.

| Output | Meaning |
| --- | --- |
| GMV | Merchandise + shipping charged (pack definition — freeze) |
| Gross / net revenue | After discounts / agent-tax handling (OPEN) |
| COGS | Owned only |
| Vendor cost | Marketplace payable |
| Gateway / promo / affiliate / tax / shipping revenue / actual freight | |
| **Contribution** | Residual after known costs |
| Contribution % | contribution / net revenue (NULL if denominator 0 or UNKNOWN inputs) |

Status: `PROVISIONAL` | `COMPLETE` | `BLOCKED_UNKNOWN`.

Every output traces to `FinancialFact` ids. **Not net profit / not operating profit.**

---

## 20. Automatic lifecycle

| Event (existing or 1G) | Effect |
| --- | --- |
| `PAYMENT_CAPTURED` | Fact + journal (if posting rule ok) |
| `ORDER_CREATED` | Economic snapshot v1 from 1E freeze |
| `SHIPMENT_DELIVERED` | Vendor payable eligibility clock (if pack = delivery) |
| `CARRIER_COST_RECORDED` | Freight fact; contribution refresh |
| `PAYMENT_REFUNDED` | Refund facts + reversals |
| Affiliate approved | Liability + AP |
| Recon exception | Exception row; no silent rewrite |
| Settlement approved / payout * | Batch + payout state; mock rail |

Each step **appends**. No destructive recalc of posted journals.

---

## 21. Illustrative journals (not advice)

Customer prepaid marketplace (shape):

| Dr | Cr |
| --- | --- |
| `AST_GATEWAY_CLEARING` captured | `REV_COMMISSION` take / `AP_VENDOR` vendor share / `TAX_PAYABLE` tax / `REV_SHIPPING` charge |

Gateway fee: Dr `EXP_GATEWAY_FEE` / Cr `AST_GATEWAY_CLEARING`.  
Freight actual: Dr `EXP_FREIGHT` / Cr `AP_CARRIER`.  
Affiliate approved: Dr `EXP_AFFILIATE` / Cr `AP_AFFILIATE`.  
Promo platform: Dr `EXP_PROMO_PLATFORM` / Cr clearing or contra-revenue.  
Owned goods: Dr `AST_GATEWAY_CLEARING` / Cr `REV_OWNED_GOODS` (+ tax); Dr `COGS_OWNED` / Cr `AST_INVENTORY` **when inventory accounting is authorized** (may lag 1G).

Exact treatment depends on MoR, tax, and accountants. **LEGAL/FINANCE/COMPLIANCE REVIEW REQUIRED.**

---

## 22. Events

Existing Outbox + BullMQ only. Candidate types:

`LEDGER_JOURNAL_POSTED`, `PAYMENT_RECONCILED`, `CARRIER_COST_RECORDED` (exists), `VENDOR_PAYABLE_CREATED`, `VENDOR_PAYABLE_ADJUSTED`, `SETTLEMENT_CREATED`, `SETTLEMENT_APPROVED`, `PAYOUT_SUBMITTED`, `PAYOUT_PAID`, `PAYOUT_FAILED`, `PAYOUT_UNKNOWN`, `PAYOUT_REVERSED`, `AFFILIATE_LIABILITY_CREATED`, `AFFILIATE_REVERSED`, `PROMO_COST_RECORDED`, `REFUND_FINANCIAL_FACT_RECORDED`, `RECONCILIATION_EXCEPTION_CREATED`, `CONTRIBUTION_SNAPSHOT_CREATED`

Do **not** emit `VENDOR_PAID` / `AFFILIATE_PAID` for mock. Real paid events only when a live rail is authorized.

Occurrence keys: `(type, aggregate_id, posting_rule_id)` or fact id. No second bus.

---

## 23. Database plan (logical — **no migration in this task**)

New (additive, UUID v7, BIGINT minors, `country_id`, `legal_entity_id` where required, `created_at`):

`ledger_accounts`, `journals`, `journal_lines`, `posting_rules`, `financial_facts`, `economic_snapshots` (versioned), `vendor_payables`, `affiliate_liabilities`, `settlement_periods`, `settlement_batches`, `settlement_lines`, `payouts`, `promo_cost_facts`, `tax_facts` (if snapshot must be richer than `OrderTaxSnapshot`), `fx_snapshots` (**reuse/extend** `payment_fx_snapshots`), `reconciliation_exceptions` (generic), `financial_adjustments`, `approval_tasks` (maker-checker)

Reuse: payment*, order* snapshots, `commercial_rules`, `carrier_costs`, `carrier_reconciliations`, `payment_reconciliations`.

RLS: finance by permission + country/entity; vendor sees own settlements only; affiliate own earnings; customer **no** internal economics.

---

## 24. API plan

Follow existing `/api/v1` + `admin` / `vendor` / `me` prefixes ([21], current Nest controllers).

| Surface | Examples |
| --- | --- |
| Admin | `GET /admin/finance/dashboard`, `.../ledger`, `.../journals/:id`, `.../reconciliation`, `.../settlements`, `.../payouts`, `.../profitability` |
| Admin mutations | `POST .../settlements/:id/approve`, `POST .../payouts/:id/submit` (mock), `POST .../journals/:id/reverse` |
| Vendor | `GET /vendor/settlements`, `GET /vendor/settlements/:id` (own seller org) |
| Affiliate | `GET /affiliate/earnings` (own; no PHI) |
| Customer | **No** contribution/payable/fee APIs |

Permissions: `finance:read`, `finance:post`, `finance:approve`, `finance:settle`, `finance:reconcile`, `finance:admin`. Not implied by `order:admin` or `logistics:admin`.

---

## 25. Finance admin UI

Admin ERP finance shell ([17]): dashboard, ledger, journals, facts, vendor settlements, affiliate liabilities, carrier costs, gateway fees, recon exceptions, refunds, chargebacks, payouts (sandbox), contribution reports.

Filters: country, currency, seller/vendor, category, SKU, warehouse, carrier, date, channel. **No PHI**, no Rx images, no lab PDFs, no PAN/CVV.

Vendor: own statement only. Isolation tests required.

---

## 26. Security, audit, dual control

JWT + RBAC + RLS. Secrets as `secret_ref` only. Never log PAN, CVV, PSP secrets, bank credentials, OTP, KYC docs.

Sensitive ops: maker / checker / timestamp / reason / before-after. Creator must not approve own payout when pack requires dual control.

Idempotency on post, settle, payout submit.

---

## 27. Performance

Async posting via outbox workers. No PSP/carrier I/O inside order-create txn (already true). Indexes: journal by entity+booked_at, payable by vendor+status, settlement by period, payout idempotency unique. Paginated admin lists. No finance microservice.

---

## 28. State machines (strict)

| Aggregate | Notes |
| --- | --- |
| Journal | `POSTED` only v1; reverse via new journal |
| VendorPayable | §10; illegal skip PAID |
| AffiliateLiability | §11 |
| SettlementBatch | OPEN → PREVIEW → APPROVED → EXECUTED / CANCELLED / PARTIAL_FAILED / CLOSED ([13] §9.2) |
| Payout | §17; UNKNOWN no auto re-submit |
| ReconciliationException | INVESTIGATE → MATCHED / BREAK (open) / CLOSED |

Illegal transitions → 409 problem+json.

---

## 29. Test plan (when coding is authorized)

1. Double-entry balances  
2. Duplicate journal blocked  
3. Posted journal immutable  
4. Capture → journal  
5. Refund → reversal  
6. Vendor payable from frozen rule  
7. Vendor refund reduces payable  
8–10. Promo platform / vendor / split  
11–12. Affiliate liability + reverse  
13–14. Carrier actual vs **NULL remains unknown**  
15. Gateway fee fact  
16–17. Multi-currency + FX snapshot immutable  
18. Settlement batch  
19–20. Payout idempotency + UNKNOWN no double submit  
21. Chargeback fact (no overwrite)  
22–23. PSP + carrier recon  
24. Vendor isolation  
25. Finance RBAC  
26. Dual approval  
27. Contribution reproducible from facts  
28. Owned-goods path (no fake AP)  
29. Vendor-owned path  
30. Rule change does not alter old orders  
31. Historical FX unchanged  
32. No double payout  
33. No PHI in reports  
34. RLS  

**Critical path:** vendor SKU → capture → fee → payable → delivered → actual freight → affiliate → promo split → optional refund → settlement → mock payout. Contribution replayable from immutable facts.

---

## 30. Open decisions (remain OPEN)

Do **not** close:

MoR / marketplace facilitator (OD-PAY-01); controller/processor; launch country; legal entity; PSP; tax provider; FX provider; DHL contract; vendor payout terms / T+N; settlement currency; payout provider; COD remittance; affiliate clinical legality (OD-AFF-03); accounting treatment (contra-revenue vs expense OD-LED-10); CoA statutory mapping; refund/chargeback policy; payable recognition timing (OD-LED-08); net vs gross payout (OD-LED-07); period close (OD-LED-03); wallet ([13] §10); doctor/lab/rider payables (future phases).

---

## 31. Acceptance (future coding)

Must include: balanced immutable journals, configurable CoA, multi-currency + FX snapshots, payment/order/carrier facts, vendor payable + settlement + mock payout idempotency, affiliate liabilities, promo funding, tax snapshot, generic recon, contribution engine (owned + vendor), finance RBAC + maker-checker, audit, RLS, reports, events, tests.

**Must remain absent** until extra auth: live payout provider, real bank transfer, real vendor/affiliate payout, live PSP, live DHL, real settlement money movement.

---

## 32. Stop

After a coding task meets §31 with **sandbox/mock rails only**: **STOP.** Do not enable live payout. Do not start wallet/Lab/Doctor settlement. Do not call contribution net profit.
