# Sprint 90 — Production Carrier / Logistics Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production carrier enabled:** **NO**  
**Provider:** `NOT_SELECTED`  
**Lifecycle:** `NOT_SELECTED`  
**Production:** `EXTERNAL_GATED`  
**Primary blocker:** `NO_PRODUCTION_CARRIER_ADAPTER`  
**Foundation:** Sprint 77 + Sprint 67  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Current status

| Field | Value |
|-------|-------|
| Provider | `NOT_SELECTED` |
| Adapter | MockCarrierAdapter only |
| Sandbox | `SANDBOX_VERIFIED` |
| Shipment creation | `SANDBOX_ONLY` |
| Tracking | `SANDBOX_VERIFIED` (sandbox) |
| Webhook | `SANDBOX_ONLY` |
| Serviceability | `POLICY_DRIVEN` |
| Coverage | `CARRIER_COVERAGE_EXTERNAL_GATED` |
| Shipping cost | `SANDBOX_ONLY` (not live carrier quote) |
| POD | `DEVICE_NOT_AVAILABLE` |
| Returns/RTO | `POLICY_REQUIRED` |
| Force-launch | **false** |

No carrier brand, API key, webhook secret, account ID, coverage map, or POD evidence was invented.

---

## Activation lifecycle

`NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED` (+ `DISABLED`, `EXTERNAL_GATED`).

Credentials alone never return `ENABLED`. Enablement guard requires non-mock adapter, production logistics env, live flag, human approval, production webhook readiness, country/legal gates.

---

## Required external configuration (references)

| Category | Example key |
|----------|-------------|
| API credential | `CARRIER_PRODUCTION_SECRET_REF` |
| Account | `CARRIER_ACCOUNT_REF` |
| Webhook secret | `CARRIER_WEBHOOK_SECRET_REF` |
| Webhook endpoint | `CARRIER_WEBHOOK_ENDPOINT_REF` |
| Markets | `CARRIER_PRODUCTION_COUNTRIES` |
| Serviceability | `CARRIER_SERVICEABILITY_CONFIG_REF` |
| Tracking | `CARRIER_TRACKING_CONFIG_REF` |

---

## Exact production blockers

Umbrella: **`NO_PRODUCTION_CARRIER_ADAPTER`**

Granular: `CARRIER_PROVIDER_NOT_SELECTED`, `CARRIER_CREDENTIAL_REFERENCE_MISSING`, `CARRIER_WEBHOOK_SECRET_REFERENCE_MISSING`, `CARRIER_WEBHOOK_CONFIGURATION_MISSING`, `CARRIER_MARKET_CONFIGURATION_MISSING`, `CARRIER_SERVICEABILITY_CONFIGURATION_MISSING`, `CARRIER_TRACKING_CONFIGURATION_MISSING`

---

## Shipment / tracking

Order → fulfillment → READY_TO_SHIP → SHIPMENT_CREATED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED.

Tracking: LABEL_CREATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED.

Rules: idempotent booking, duplicate tracking events safe, terminal overwrite forbidden, untrusted client cannot mark DELIVERED, production delivery requires provider evidence.

---

## Webhook security

Unsigned/invalid webhooks fail-closed. Production signature verification EXTERNAL_GATED without secret refs. Correlation IDs preserved. Secrets never logged.

---

## Serviceability / markets

`POLICY_DRIVEN`. Evaluation markets: GLOBAL / IN / AE / US. Source/fulfillment country is **not** assumed equal to customer country. No hardcoded UPI/INR/₹/+91/IST in onboarding payload.

---

## POD / returns / native

POD: **`DEVICE_NOT_AVAILABLE`** (native rider not verified). Sandbox POD remains SANDBOX_ONLY if present. Returns/RTO: **`POLICY_REQUIRED`**. Android/iOS: **`DEVICE_NOT_AVAILABLE`**.

---

## What must be supplied before activation

1. Real carrier contract + non-mock adapter  
2. Vault credential + account + webhook refs  
3. Market + serviceability + tracking configuration  
4. Legal/ops clearance + human approval  
5. Explicit live flag after verification  

Until then: **PRODUCTION CARRIER ENABLED = NO** and **CAN_PRODUCTION_LAUNCH = NO**.

---

## Code touchpoints

- `carrier-first-onboarding.ts` (Sprint 90)
- `production-carrier-requirements.ts`
- Admin `/provider-activation` Sprint 90 card
- Launch control consumes `remaining_blockers`
- Docs: this file
