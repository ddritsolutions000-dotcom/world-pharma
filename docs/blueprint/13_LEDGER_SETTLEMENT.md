# 13 — Ledger and Settlement

**Status:** Blueprint  
**Audience:** Finance, architecture, engineering, compliance, operations  
**Requirement IDs:** REQ-LED, REQ-FX (accounting side), REQ-WAL (liability), REQ-PAY (events in)  
**Journeys:** **J16** refund, **J17** affiliate commission, **J18** vendor settlement, **J19** doctor settlement, **J20** lab settlement, **J21** delivery partner earnings; all paid commercial flows  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Admin ERP](17_ADMIN_ERP.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose

The ledger is the **system of record for who is owed what, who holds whose money, and why**. It is double-entry-style, auditable, and country-entity aware.

Payment ([12](12_PAYMENT_PLATFORM.md)) records **instrument movement** with a PSP. The ledger records **economic allocation** among:

| Participant | Typical role in books |
| --- | --- |
| **Platform** | Merchant cash, fees, commission revenue, wallet liability, tax payable, FX P&L |
| **Pharmacy** (owned) | Revenue of first-party pharmacy (or intercompany), COGS operationally elsewhere |
| **Vendor** | Payable for marketplace goods |
| **Doctor** | Payable for completed consults (minus platform fee) |
| **Lab** | Payable for diagnostics |
| **Delivery partner** | Earnings payable |
| **Affiliate** | Commission payable after pending → approved |

**Principle from vision:** Money is never informal. Every fee, commission, tax, refund, COD, and payout is a ledger event.

---

## 2. Boundaries

| Owns | Does not own |
| --- | --- |
| Chart of accounts (logical), journal, balances | Gateway tokens, PAN, PSP SDKs |
| Payables, receivables, settlement batches, payout instructions | PaymentIntent state machine |
| Commission/fee/tax **posting** from domain events | Tax **rate tables** source (tax engine; ledger posts the computed amounts) |
| Reconciliation **breaks vs payment recon** and vs payout banks | Affiliate attribution (reads approved commissions) |
| Period close, legal-entity books views | Operational inventory valuation as WMS truth (may post COGS later) |

**ASSUMPTION (A-LED-01):** One logical ledger in the modular monolith; **partitioned by legal entity and country**. Physical split only if residency requires it ([18](18_GLOBALIZATION.md)).

**OPEN DECISION (OD-LED-04):** One global ledger with entity dimension vs separate ledgers per legal entity. Recommendation: **one journal store, mandatory `legal_entity_id` + `country_id` on every line**, no cross-entity lines in a single journal entry (intercompany entries are paired).

---

## 3. Design principles

1. **Double-entry-style.** Every `JournalEntry` has lines that **balance** in the **entry’s balancing currency**. Additional reporting currencies are stored, never substituted for the original.
2. **Journal is IMMUTABLE.** No update of posted lines, no soft delete. Corrections are **reversing entries** (and optionally a new correct entry). Reversals reference `reverses_entry_id`.
3. **Every financial event is attributable.** Actor (user/system), reason, source event id, correlation to order/booking/job/commission.
4. **Original money preserved.** Lines store `amount` + `currency` as posted; if the entry also has accounting-currency amounts, they reference `fx_snapshot_id` from payment or treasury. Never destroy payment currency (12 §4).
5. **Settlement is a batch over payable balances**, not an informal spreadsheet.
6. **Do not invent tax law.** Tax codes come from the tax engine + country pack after **LEGAL/COMPLIANCE REVIEW REQUIRED**.

---

## 4. Participants and accounts payable/receivable

Each participant is a **Party** ([02](02_BUSINESS_ARCHITECTURE.md) Party context) with one or more **ledger sub-accounts**.

| Participant type | Sub-accounts (logical) | Settlement trigger (directional) |
| --- | --- | --- |
| Platform | Cash at gateway, undeposited COD, wallet liability, tax payable, revenue, expenses, FX, clearing | N/A (we are the books) |
| Pharmacy owned | Intercompany or location P&L as policy | **OD-LED-09** internal vs same-entity |
| Vendor | `AP_VENDOR` | J18: delivered + return window − fees |
| Doctor | `AP_DOCTOR` | J19: consult completed and not refunded |
| Lab | `AP_LAB` | J20: report released **or** bill-on-accession — **OD-LED-01** |
| Delivery partner | `AP_RIDER` | J21: job complete per earnings rules |
| Affiliate | `AP_AFFILIATE` | J17: commission **approved** (not pending) |
| Customer | `AR_CUSTOMER` (rare: failed refund, COD short), `LIAB_WALLET` | Refund queues, wallet |

A person with multiple roles (doctor who is also a customer) has **separate sub-accounts**. Do not net doctor payables against their medicine purchases unless a country pack + legal explicitly allows set-off.

---

## 5. Chart of accounts (logical)

This is a **logical** chart. Implementation maps to tables; account codes are configurable per legal entity. Not a statutory chart — local G/L mapping is a finance configuration.

### 5.1 Assets

| Code (logical) | Name | Notes |
| --- | --- | --- |
| `AST_GATEWAY_CASH` | Cash / receivables at PSP | Per gateway + merchant account + currency |
| `AST_BANK` | Operating bank | Payout source |
| `AST_COD_IN_TRANSIT` | COD collected not remitted | Rider/cash-in-transit |
| `AST_FX_CLEARING` | FX in flight | Temporary |

### 5.2 Liabilities

| Code | Name | Notes |
| --- | --- | --- |
| `LIAB_WALLET` | Customer stored-value liability | Matches wallet ops balance |
| `LIAB_UNEARNED` | Unearned / deferred (auth or prepay) | Consult hold, membership |
| `AP_VENDOR` | Vendor payable | |
| `AP_DOCTOR` | Doctor payable | |
| `AP_LAB` | Lab payable | |
| `AP_RIDER` | Delivery partner payable | |
| `AP_AFFILIATE` | Affiliate payable | Approved only |
| `AP_CUSTOMER_REFUND` | Refund due when PSP refund failed | J16 failure path |
| `TAX_PAYABLE` | Tax collected not remitted | Do not invent tax names |
| `LIAB_CHARGEBACK_RESERVE` | Dispute reserve | |

### 5.3 Equity / P&L (simplified)

| Code | Name | Notes |
| --- | --- | --- |
| `REV_PHARMACY` | First-party product revenue | |
| `REV_COMMISSION` | Marketplace / lab / other take-rate | |
| `REV_DELIVERY_FEE` | Delivery/convenience fee (platform share) | |
| `REV_MEMBERSHIP` | Membership | **OPEN DECISION** in 02 |
| `REV_CONSULT_FEE` | Platform share of consult | **OD** take-rate vs SaaS in 02 |
| `EXP_PSP_FEE` | PSP processing fees | From recon |
| `EXP_RIDER` | Rider earnings (if treated as expense) | **OD-LED-05** |
| `EXP_PROMO` | Platform-funded promo | **OD-LED-06** |
| `EXP_REFUND` | Refund expense / contra-revenue | Policy: contra-revenue vs expense |
| `PNL_FX` | FX differences | OD-FX-01 |

Contra-revenue vs expense for refunds: **OD-LED-10**. Recommendation: **contra-revenue** for returns of own goods; **expense** for goodwill; **reduce AP** for marketplace before settlement.

---

## 6. Journal entry (immutable)

| Field (logical) | Meaning |
| --- | --- |
| `journal_entry_id` | Stable; never reused |
| `legal_entity_id` / `country_id` | Required |
| `booked_at` | Accounting time (may differ from event time; both stored) |
| `source_event_id` / `source_type` | PaymentCaptured, JobCompleted, etc. |
| `correlation_ids` | order, booking, job, refund, commission, settlement_batch |
| `description` | Human finance description |
| `actor` | System or `finance` user |
| `status` | `POSTED` only for this design (no draft in v1 **OD-LED-11**) |
| `reverses_entry_id` | If this is a reversing entry |
| `lines[]` | Debit/credit lines |

Each line: `account`, `participant_id?`, `amount_minor`, `currency`, `fx_snapshot_id?`, `amount_accounting?`, `debit_or_credit`.

**Balance rule:** Sum of signed amounts in the **entry balancing currency** = 0. If lines are multi-currency, use pairing via FX snapshot so accounting-currency debits = credits.

**Forbidden:** `UPDATE` posted lines; `deleted_at` on journal; “fix amount” in place after recon.

**ASSUMPTION (A-LED-02):** Idempotent posting keyed by `source_event_id` + `posting_rule_id`. Duplicate events do not create a second economic entry.

---

## 7. Posting rule engine

Domain events **never** insert journal rows from adapters. A **PostingRule** maps `source_type` + country pack + category → lines.

| Input | Output |
| --- | --- |
| Event payload (amounts already computed by tax/pricing/payment) | Balanced JournalEntry |
| Country pack: settlement timing, tax codes | Account selection |
| Participant ids | Sub-ledger |

If a required amount is missing, **fail the outbox consumer** and alert finance — do not post unbalanced or guessed tax.

---

## 8. Posting examples

Amounts below are **illustrative shapes**, not prices. Currencies are placeholders (`CCY`). Tax is a single “tax” line because this blueprint does **not** invent a tax regime.

### 8.1 Order paid (customer captured) — first-party pharmacy goods

**Event:** `PaymentCaptured` on an owned-pharmacy Order.  
**Economic idea:** Cash at gateway increases; revenue and tax and optional delivery fee; **do not** yet pay the rider.

| Account | Dr | Cr | Currency |
| --- | --- | --- | --- |
| `AST_GATEWAY_CASH` | Order total (payment currency) | | Payment currency |
| `REV_PHARMACY` | | Net goods | Order/payment as posted |
| `TAX_PAYABLE` | | Tax | As computed |
| `REV_DELIVERY_FEE` | | Delivery fee if platform | As computed |

If capture is in payment currency ≠ accounting currency, also store accounting amounts via `fx_snapshot_id` from 12. **Do not replace** the payment-currency debit.

Wallet tender: Dr `LIAB_WALLET` instead of (or in combination with) `AST_GATEWAY_CASH`.

COD: Dr `AST_COD_IN_TRANSIT` (not gateway) until rider remits.

**Marketplace variant (J03 / J18 later):**

| Account | Dr | Cr |
| --- | --- | --- |
| `AST_GATEWAY_CASH` | Customer total | |
| `AP_VENDOR` | | Vendor share (gross or net — **OD-LED-07**) |
| `REV_COMMISSION` | | Platform commission |
| `TAX_PAYABLE` | | As computed |
| `REV_DELIVERY_FEE` | | If platform-owned fee |

**OPEN DECISION (OD-LED-08):** Recognize vendor payable at capture, dispatch, delivery, or after return window. Recommendation aligned with J18: **recognize payable at delivery (POD)**; until then, platform holds `LIAB_UNEARNED` or a clearing account so cash is not treated as platform unrestricted revenue. **LEGAL/COMPLIANCE REVIEW REQUIRED** with OD-PAY-01 (merchant of record).

### 8.2 Delivery complete — rider earnings (J21)

**Event:** `LogisticsJobCompleted` (medicine delivery or sample/report job as configured).

| Account | Dr | Cr |
| --- | --- | --- |
| `EXP_RIDER` (or COGS-delivery) | Earnings | |
| `AP_RIDER` | | Earnings |

Surge, distance, job type from logistics earnings rules. Dispute/fake POD: do not post until job is `COMPLETED` without open fraud hold.

COD remittance (same or later event `RiderCashRemitted`):

| Account | Dr | Cr |
| --- | --- | --- |
| `AST_BANK` or `AST_GATEWAY_CASH` | Cash in | |
| `AST_COD_IN_TRANSIT` | | Cash in |

Short/over: `AR`/`AP` to rider with operations reason. **OD-PAY-04**.

### 8.3 Consult complete (J19)

**Event:** `EncounterCompleted` **and** payment captured (or capture-on-complete per OD-PAY-02). If only authorized, do **not** move to `AP_DOCTOR`.

| Account | Dr | Cr |
| --- | --- | --- |
| `LIAB_UNEARNED` (if previously deferred) | Consult fee | |
| `AP_DOCTOR` | | Doctor net |
| `REV_CONSULT_FEE` | | Platform fee |

If never deferred (immediate capture booked to unearned at pay): same reclass on complete.

Refund before complete: reverse unearned; do not create doctor payable.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Professional fee-splitting / kickback rules. Country pack may force **SaaS subscription** instead of %-of-fee (02 revenue table).

### 8.4 Report released (J20)

**Event:** `ReportReleased` **or** accession event if OD-LED-01 = bill-on-accession.

| Account | Dr | Cr |
| --- | --- | --- |
| `LIAB_UNEARNED` | Test price | |
| `AP_LAB` | | Lab net |
| `REV_COMMISSION` | | Platform |
| `AP_PHE` or `AP_RIDER` | | If collection earnings not already posted |

Phlebotomist vs rider: collection job completion may have already posted J21-style earnings; do not double count.

**OPEN DECISION (OD-LED-01):** Bill-on-booking vs bill-on-report vs bill-on-accession (also in 02 J20). Recommendation: **cash captured at booking (unearned); recognize lab payable on report release**; failed collection → J16 refund path.

### 8.5 Refund (J16)

**Event:** `RefundSucceeded` (instrument) and/or `WalletBalanceChanged` credit.

Instrument refund of first-party order (full):

| Account | Dr | Cr |
| --- | --- | --- |
| `REV_PHARMACY` (contra) / `EXP_REFUND` | Original net | |
| `TAX_PAYABLE` | Tax originally credited, if legally reversible | |
| `AST_GATEWAY_CASH` | | Refund amount in **payment currency** |

Partial refund: same shape for the partial money; original capture entry **untouched**.

If gateway refund **fails**:

| Account | Dr | Cr |
| --- | --- | --- |
| contra-revenue / expense | | |
| `AP_CUSTOMER_REFUND` | | Amount due |

When finance later succeeds or pays manually, reverse `AP_CUSTOMER_REFUND` against cash/wallet.

Marketplace refund **before** vendor settlement: reduce `AP_VENDOR` rather than taking platform loss, except platform-funded goodwill (**OD-LED-06**).

FX: refund amount in original **payment currency**; delta vs accounting/settlement → `PNL_FX` (OD-FX-01).

### 8.6 Affiliate pending → approved (J17)

**Pending** is **not** a payable. Optional memo/statistical record only.

**Event:** `AffiliateCommissionApproved`.

| Account | Dr | Cr |
| --- | --- | --- |
| `EXP_AFFILIATE` or contra `REV_COMMISSION` | Commission | |
| `AP_AFFILIATE` | | Commission |

**Event:** `AffiliateCommissionReversed` (cancel, fraud, self-referral): **reversing entry** of the approval (or of a pending memo). If already settled, create `AR_AFFILIATE` clawback; do not delete the original journal.

Funding: platform P&L (02). Must not create illegal inducement — see [14](14_AFFILIATE_PLATFORM.md). If country pack disables commission for a category, **no posting rule fires**.

### 8.7 Rider earnings

Covered in 8.2. Multi-job types (medicine, sample, physical report) use the same `AP_RIDER` with `job_type` analytics dimensions — not separate hidden ledgers.

---

## 9. Settlement cycles and payout

### 9.1 Cycle configuration

**Per participant type × country × legal entity** (not a global weekly assumption):

| Parameter | Meaning |
| --- | --- |
| Cycle cadence | Daily / weekly / monthly |
| Hold / return window | Offset days after recognition |
| Minimum payout | Skip and roll |
| KYC gate | No payout if KYC not approved ([19](19_COMPLIANCE_FRAMEWORK.md)) |
| Netting | Refunds, chargebacks, fines, device loans |
| Payout rail | PayoutPort from 12 |

Examples of **directional** defaults (overridable; not law): vendor weekly after return window; doctor weekly after complete; lab weekly after report; rider weekly; affiliate monthly after hold. **OPEN DECISION (OD-LED-12)** exact calendars per first launch country.

### 9.2 Settlement batch state machine

| Status | Meaning |
| --- | --- |
| `OPEN` | Accruing payables |
| `PREVIEW` | Finance can inspect |
| `APPROVED` | Dual control if above threshold (03 SoD) |
| `EXECUTED` | Payout instructions sent |
| `PARTIAL_FAILED` | Some rails failed; remaining stay payable |
| `CLOSED` | All lines paid or written off with reversing entries |
| `CANCELLED` | Only from `PREVIEW`; does not delete journal |

Executing a batch:

1. Select posted `AP_*` lines in window, not already reserved.
2. Net adjustments.
3. Create `SettlementBatch` + line items (immutable once executed).
4. Call PayoutPort with **Idempotency-Key** per line (12).
5. On payout success: Dr `AP_*`, Cr `AST_BANK` (or gateway payout account).
6. On fail: leave AP; retry with new attempt id, same batch line.

**Permission:** `settlement:execute` and `payout:approve` — finance; dual control above threshold (03 §10). Settlement execute vs period close are segregated.

### 9.3 Net vs gross

**OPEN DECISION (OD-LED-07):** Payout net of commission vs gross payout plus platform invoice. Recommendation: **net payout for marketplace v1**; still **show gross, commission, tax, fees** on the participant statement (vendor/doctor/lab dashboards).

---

## 10. Wallet liability

Operational wallet ([12](12_PAYMENT_PLATFORM.md) §11) must equal `LIAB_WALLET` per customer × country × currency.

| Event | Posting |
| --- | --- |
| Promo credit | Dr `EXP_PROMO` / Cr `LIAB_WALLET` |
| Refund to wallet | See 8.5; Cr `LIAB_WALLET` instead of gateway cash |
| Spend at checkout | Dr `LIAB_WALLET` / Cr revenue/AP as in 8.1 |
| Manual finance credit | Dual control; `wallet:credit` |

Daily recon: wallet ops sum vs sub-ledger. Breaks are incidents, not silent patches.

---

## 11. Reconciliation with payment gateways

Payment module produces matched PSP files (12 §15). Ledger posts:

| Recon outcome | Ledger action |
| --- | --- |
| Matched capture | Already posted from `PaymentCaptured`; recon may post **fee** if not included |
| PSP fee | Dr `EXP_PSP_FEE` / Cr `AST_GATEWAY_CASH` (fee currency) |
| Settlement to bank | Dr `AST_BANK` / Cr `AST_GATEWAY_CASH` |
| `AMOUNT_BREAK` / `FX_BREAK` | Suspense `AST_FX_CLEARING` or recon suspense; **do not** rewrite journal history |
| `MISSING_INTERNAL` | Investigate duplicate PSP payment; may need new posting after confirmation |
| `MISSING_PSP` | Payment says captured, PSP file lacks it — do not reverse customer order automatically |

**Period close:** finance closes a country×entity×period; posting after close goes to next period or requires reversing + restatement entries with `compliance_officer` visibility. **OD-LED-03**.

---

## 12. Tax, fees, promo

| Topic | Rule |
| --- | --- |
| Tax | Amounts computed outside ledger; posted to `TAX_PAYABLE` as given. **LEGAL/COMPLIANCE REVIEW REQUIRED** per country. **OD-LED-02** internal tables vs third-party engine. |
| PSP fees | From recon, not guessed as a % in posting rules (unless a documented estimate with later true-up entries). |
| Promo | **OD-LED-06** platform vs vendor funded. Platform-funded: `EXP_PROMO`. Vendor-funded: reduce `AP_VENDOR`. |
| Membership | Unearned over term if multi-period — **OD-LED-13**. |

---

## 13. Audit, immutability, access

- Journal export for auditors: append-only.
- Access: `ledger:read` finance; no clinical payloads on ledger lines (store ids only).
- Support cannot post.
- Break-glass does not allow silent line edits.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Retention of financial records vs health records differ; see [19](19_COMPLIANCE_FRAMEWORK.md) and [16](16_HEALTH_RECORD.md). Do not apply one retention clock to both.

---

## 14. Permissions

| Permission | Role |
| --- | --- |
| `ledger:read` | finance |
| `settlement:execute` | finance + system |
| `payout:approve` | finance |
| `payment:refund` | finance / policy engine (payment module) |
| `wallet:credit` | system; finance dual control |

SoD: refund vs payout approve above threshold; settlement execute vs period close (03).

---

## 15. Country Policy Pack keys (ledger)

| Key | Purpose |
| --- | --- |
| `ledger.legal_entity_id` | Books owner for that country |
| `settlement.{vendor,doctor,lab,rider,affiliate}.cadence` | Cycles |
| `settlement.{type}.hold_days` | Return/hold |
| `settlement.min_payout` | Minimum |
| `ledger.bill_lab_on` | `booking` / `accession` / `report` |
| `ledger.set_off_roles` | Default false |

---

## 16. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-LED-01 | Silent journal edits | Immutability; reversing only |
| R-LED-02 | Unbalanced multi-currency | Balance in accounting currency via snapshot; keep original |
| R-LED-03 | Paying pending affiliate | Payable only on approved |
| R-LED-04 | Double posting from webhook retries | Idempotent `source_event_id` |
| R-LED-05 | Netting doctor pay vs personal purchases | Forbidden unless legal pack |
| R-LED-06 | Treating gateway settlement currency as the only amount | Preserve payment currency |
| R-LED-07 | Illegal fee-split | Country gate + legal review on doctor/affiliate/lab rules |

---

## 17. Assumptions

| ID | Statement |
| --- | --- |
| A-LED-01 | Logical single ledger, entity+country on every line |
| A-LED-02 | Idempotent posting by source event + rule |
| A-LED-03 | Pending commissions are not payables |
| A-LED-04 | No invented statutory account codes |

---

## 18. Open decisions

| ID | Question | Recommendation until decided |
| --- | --- | --- |
| OD-LED-01 | Lab bill-on-booking vs accession vs report | Capture at booking (unearned); recognize AP on report release |
| OD-LED-02 | Tax engine internal vs third party | Internal tables v1; port for later |
| OD-LED-03 | Period close cadence | Monthly per entity; daily ops recon |
| OD-LED-04 | Ledger grain vs legal entity | One store, mandatory entity_id |
| OD-LED-05 | Rider employee vs contractor accounting | Country pack; expense vs payable only — not employment law |
| OD-LED-06 | Promo funded by platform vs vendor | Explicit `funded_by` on promo |
| OD-LED-07 | Net vs gross participant payout | Net v1; gross on statements |
| OD-LED-08 | Vendor payable recognition timing | At delivery/POD; return window before settlement |
| OD-LED-09 | Owned pharmacy as same entity vs intercompany | Same entity v1 unless multi-company pack |
| OD-LED-10 | Refund contra-revenue vs expense | Contra for returns; expense for goodwill |
| OD-LED-11 | Draft journal in v1 | No; POSTED only |
| OD-LED-12 | Exact settlement calendars | Config per country; not hardcoded |
| OD-LED-13 | Membership revenue recognition | Defer if term > one period |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Tax remittance, marketplace withholding, professional fee-split, stored-value liability, and payout as wages vs vendor payments. This document does not choose a jurisdiction’s accounting standard (IFRS/local GAAP) — **OD-LED-14**.

**OPEN DECISION (OD-LED-14):** Accounting standard and external G/L export format per legal entity.
