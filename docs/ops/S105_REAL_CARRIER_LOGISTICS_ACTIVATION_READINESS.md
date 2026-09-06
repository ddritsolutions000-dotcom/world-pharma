# Sprint 105 — Real Carrier / Logistics Production Activation Readiness

**Status:** COMPLETE (software readiness)  
**Real carrier selected:** **NO**  
**Production carrier enabled:** **NO**  
**Real shipment created:** **NO**  
**Lifecycle:** `NOT_SELECTED` / `EXTERNAL_GATED`  
**Primary blocker:** `NO_PRODUCTION_CARRIER_ADAPTER`  
**Composes:** S7/S26/S46/S67/S77/S90 + S95/S97/S98/S100/S101  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundaries

**SANDBOX_VERIFIED ≠ PRODUCTION**  
**READY_FOR_ACTIVATION ≠ ENABLED**  
**MockCarrierAdapter must never silently substitute for production**  
**No invented carriers / credentials / tracking numbers / GPS / POD**  
**No real carrier bookings or live shipments**  
**Cross-border medicine: LEGAL_GATED** (software capability ≠ legal availability)  
**Native rider/POD: DEVICE_NOT_AVAILABLE**

---

## Exact carrier blockers

- `NO_PRODUCTION_CARRIER_ADAPTER` (umbrella)
- `CARRIER_PROVIDER_NOT_SELECTED`
- `CARRIER_CREDENTIAL_REFERENCE_MISSING`
- `CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING`
- `CARRIER_WEBHOOK_CONFIGURATION_MISSING`
- `CARRIER_MARKET_CONFIGURATION_MISSING`
- `CARRIER_SERVICEABILITY_CONFIGURATION_MISSING`
- `CARRIER_TRACKING_CONFIGURATION_MISSING`
- plus S101 foundation gates where applicable

---

## Lifecycle

`NOT_SELECTED` → `CONFIGURATION_REQUIRED` → `CREDENTIALS_REQUIRED` → `VERIFICATION_REQUIRED` → `APPROVAL_REQUIRED` → `READY_FOR_ACTIVATION` → `ENABLED` / `DISABLED` / `EXTERNAL_GATED`

Initial state without a real carrier: **NOT_SELECTED** / **EXTERNAL_GATED**.

---

## Shipment / webhook / idempotency

Shipment path reuses S90 machine (LABEL_CREATED → … → DELIVERED + exception states).  
Unsigned/invalid carrier webhooks rejected. Terminal overwrite forbidden.  
Idempotent booking / duplicate webhook safety preserved.

---

## Serviceability / markets / cross-border

GLOBAL · IN · AE · US — policy-driven. No UPI/INR/₹/+91/IST hardcoding.  
Customer country may differ from source/carrier country; medicine import remains **LEGAL_GATED**.

---

## Admin

Provider Activation → Sprint 105 Real Carrier card (alongside S90/S100/S101).  
Force-launch / force-deploy: **false**.

---

## Verification evidence

| Check | Result |
|-------|--------|
| Unit (S105+S90+S77+S67+S87+S100+S101+S102+S103) | **55/55 PASS** |
| Playwright S105 | **3/3 PASS** |
| Playwright S90+S87 | **5/5 PASS** |
| Screenshots | `apps/test-results/s105-carrier-shots/` |
| Status artifact | `apps/test-results/s105-carrier/final-carrier-status.json` |
| Master Index | **#403** |

Real apps verified: Admin Sprint 105 card → Launch Readiness **NO** → Customer sandbox order/tracking → Vendor fulfillment (no carrier admin) → Logistics ops → Customer denied Admin. Native rider: **DEVICE_NOT_AVAILABLE**.

---

## Explicit final state

```
REAL CARRIER SELECTED = NO
PRODUCTION CARRIER ENABLED = NO
REAL SHIPMENT CREATED = NO
CAN_PRODUCTION_LAUNCH = NO
```

STOP — do **not** start Sprint 106.
