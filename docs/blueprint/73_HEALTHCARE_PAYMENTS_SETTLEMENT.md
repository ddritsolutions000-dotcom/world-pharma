# 73 — Healthcare payments and settlement

**Status:** Blueprint — not implemented  
**Related:** [12](12_PAYMENT_PLATFORM.md) · [13](13_LEDGER_SETTLEMENT.md) · [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) · [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md)

**Do not create a second payment or ledger system.** Reuse `PaymentPort`, sandbox PSP, mock `PayoutPort`.

Live PSP / live payout: **separate authorization**.

---

## 1. Chargeable healthcare products

| Product | Payment | Settlement participant |
| --- | --- | --- |
| Doctor consult | Hold/capture per pack | Doctor payable |
| Lab booking | Capture on confirm | Lab payable |
| Medicine | Existing 1D–1E | Vendor/platform COGS |
| Physical report delivery | Fee line | Carrier + platform |

Clinical vs commerce **may** differ in tax/settlement class — **pack + legal**, not hardcoded.

---

## 2. Refunds

Consult: pack (no-show, doctor cancel). Lab: before collection vs after draw. Medicine: existing 1E. **Do not invent** restocking fees.

UNKNOWN payment: no healthcare booking confirm ([57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md)).

---

## 3. Ledger

Same 1G journal. New fact kinds (when coded): `CONSULT_FEE`, `LAB_PAYABLE`, `DOCTOR_PAYABLE`, `REPORT_DELIVERY_FEE`. Contribution engine extended — still **not net profit**. NULL costs stay NULL.

Doctor/lab T+N: `SettlementPolicy` per partner type — **not** a global invented delay.

---

## 4. Wallet

Country-gated ([43](43_ECOSYSTEM_BASELINE_LOCK.md)). Healthcare wallet spend: pack. No clinical data on wallet statements.

---

## 5. Open

MoR for consults vs marketplace; tax on healthcare; COD for labs; insurance — **out of v1**.
