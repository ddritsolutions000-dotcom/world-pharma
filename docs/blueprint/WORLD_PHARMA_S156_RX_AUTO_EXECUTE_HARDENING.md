# WORLD_PHARMA S156 — Rx Auto-Execute Hardening / Prescription Fulfillment Safety

**Sprint:** 156  
**Master backlog:** #453  
**Status:** SOFTWARE COMPLETE (fail-closed Rx commerce / auto-execute safety gate)  
**CAN_PRODUCTION_LAUNCH:** NO

## Current Rx flow (reused, not rebuilt)

```text
prescription / eRx (sandbox or EXTERNAL_GATED live)
  → prescription validation / seal / validity window
  → dispensing case (pharmacy review → AUTHORIZED → DISPENSED + COMPLETE)
  → R5-D handoff / marketplace cart attach (prescription_case_id)
  → quote / checkout / order
  → vendor pick/pack → dispatch
```

Parallel path: `RxSubscription` + `tryExecuteDueSubscriptions` remains **inert** (`executed: 0`) per OD-RX-REFILL / ED-R5E-01.

Domain storage (unchanged):

| Concern | Where |
| --- | --- |
| Rx status | `Prescription.status` |
| Validity | `PrescriptionVersion.validFrom` / `validUntil` + `sealedAt` |
| Case ↔ order | `DispensingCase`, `DispenseEvent`, `Order.dispenseEventId` / handoff keys |
| Pharmacy review | Dispensing case status machine (QUEUED → … → DISPENSED) |
| Country policy | Published pack `healthcare.rx_dispense_enabled`, `rx_subscription_auto_execute` |

## Root gap (S151)

Marketplace cart previously treated **any non-null** `prescriptionCaseId` as sufficient for Rx quote/checkout. A forged UUID could pass commercial attach without a real patient-owned DISPENSED case.

Clinical handoff (`RxHandoffService`) and dispensing completion were already fail-closed; the **commerce attach** path was the genuine hole.

## Safety gates implemented

Authoritative module: `apps/api/src/clinical/rx-fulfillment-safety-gate.ts` (`RxFulfillmentSafetyGate`).

Wired into:

- `CartService.buildQuote` — Rx-required lines must evaluate to `ELIGIBLE` / `AUTO_EXECUTE` or quote fails closed with machine-readable `reason_code`
- `RefillService.tryExecuteDueSubscriptions` — evaluates due rows, audits decisions, **never executes** (`execution_authorized: false`)

Minimum checks (domain-backed only):

1. Case id present  
2. UUID shape valid  
3. Case exists  
4. Patient matches cart customer  
5. Country matches cart market  
6. Not CANCELLED / EXPIRED / DRAFT  
7. Current sealed version + validity window  
8. Country pack `rx_dispense_enabled`  
9. Case DISPENSED + COMPLETE event + line mappings  
10. Catalog variant / qty vs mappings when represented  
11. No prior order on same COMPLETE event (`RX_ALREADY_EXECUTED`)  
12. Review-in-progress → `REVIEW_REQUIRED` (not silent execute)

Decisions: `ELIGIBLE` | `AUTO_EXECUTE` | `REVIEW_REQUIRED` | `BLOCKED` + `reason_code` + customer-safe message.

## State transitions (commerce)

| Gate decision | Checkout outcome |
| --- | --- |
| ELIGIBLE | Quote may proceed |
| REVIEW_REQUIRED | 422 — pharmacy/clinical review still required |
| BLOCKED | 422 — machine-readable reason (expired, revoked, mismatch, policy, already executed, …) |
| AUTO_EXECUTE | Reserved; subscription worker still does not execute |

Vendor DTO adds `rx_fulfillment_status` (safe labels: Prescription required / Review required / Ready for fulfillment / Expired / Revoked / Blocked). No clinical payload in vendor UI.

## Idempotency / duplicate protection

- Existing checkout / handoff idempotency keys retained  
- Gate blocks re-attach when `Order` already linked to COMPLETE `dispenseEventId`  
- Subscription path never creates fulfillment duplicates (`executed: 0`)  
- Outbox audit occurrence includes context + reason (no clinical lines)

## Country / policy

Uses `PolicyResolver.isRxDispenseEnabled` / `isRxSubscriptionAutoExecuteEnabled`. Missing or false pack → **fail closed** (`RX_POLICY_DISABLED` / `AUTO_EXECUTE_POLICY_OFF`). No India-hardcoded rules.

## Authorization / clinical security

- Server-side gate on quote (session start invokes quote) — client cannot bypass with forged id  
- Patient ownership enforced  
- Audit: `RX_FULFILLMENT_SAFETY_GATE` outbox payload = decision + ids only (no dosages / line text)  
- Vendor sees status label only  
- Production eRx remains EXTERNAL_GATED (`NO_PRODUCTION_ERX_PROVIDER`)

## Tests

| Suite | Coverage |
| --- | --- |
| `s156-rx-fulfillment-safety.spec.ts` | UUID helpers, labels, contract |
| `s156-rx-fulfillment-safety-gate.mock.spec.ts` | Eligible + 14 negative/idempotency/audit paths |
| `s156-rx-fulfillment-safety.db.spec.ts` | Live DB forge / patient / expired when fixtures exist |
| `customer-pharmacy-convenience` **D** | API: missing → `RX_REQUIRED`; forged UUID → blocked |

Focused run: **27/27** S156 + e2e D + policy `isRxDispense` related — pass.

## Runtime validation

Sandbox/API e2e (test fixtures only):

- Missing prescription on Rx SKU → blocked  
- Forged `prescription_case_id` → blocked (`RX_CASE_NOT_FOUND`)  
- Eligible path remains the existing DISPENSED + mappings + handoff flow (not rebuilt)

**AUTHENTICATED_BROWSER_CLICKTHROUGH:** NOT_COMPLETED (OTP / full clinical fixture browser path not run this sprint).

**Production eRx execution:** NOT claimed / NOT enabled.

## Production external dependencies

| Dependency | State |
| --- | --- |
| Live eRx provider | EXTERNAL_GATED |
| Live pharmacy dispensing network | EXTERNAL_GATED / not enabled by S156 |
| Auto-execute worker / legal OD-RX-REFILL | NOT AUTHORIZED — scheduler inert |
| `CAN_PRODUCTION_LAUNCH` | **NO** |

## What was not rebuilt

- Prescription / eRx engines  
- Medicine ordering / pharmacy / cart / checkout / fulfillment engines  
- HL7/FHIR  
- New provider activation framework  
- Fake eRx provider  
- Automatic dispense merely because cart has Rx medicine  

## Next genuine coding gap

After S156 closes Rx commerce attach hardening: **HL7/FHIR (or chosen clinical interchange) adapters** when a lab/clinical network is selected remain the primary genuine coding gap (still EXTERNAL_GATED until contracted). Do not auto-start next sprint.
