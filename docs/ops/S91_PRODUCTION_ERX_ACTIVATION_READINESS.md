# Sprint 91 — Production eRx / Prescription Transmission Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production eRx enabled:** **NO**  
**Provider:** `NOT_SELECTED`  
**Lifecycle:** `NOT_SELECTED`  
**Production:** `EXTERNAL_GATED`  
**Transmission:** `SANDBOX_ONLY`  
**Primary blocker:** `NO_PRODUCTION_ERX_PROVIDER`  
**Foundation:** Sprint 78 + Sprint 68  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundary

**ISSUED ≠ LEGALLY_TRANSMITTED**

Internal prescription records (`DRAFT` / `ISSUED` / …) remain available.  
`SandboxERxAdapter` is **not** legal electronic prescription transmission.

---

## Current status

| Field | Value |
|-------|-------|
| Provider | `NOT_SELECTED` |
| Adapters | Null / Sandbox only |
| Sandbox | `SANDBOX_VERIFIED` |
| Transmission | `SANDBOX_ONLY` |
| Legal/clinical gate | `EXTERNAL_GATED` |
| Controlled substances | `LEGAL_GATED` |
| Pharmacy network | `EXTERNAL_GATED` |
| Force-launch | **false** |

No eRx vendor, NCPDP/Surescripts credentials, pharmacy IDs, or legal ACKs were invented.

---

## Activation lifecycle

`NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED` (+ `DISABLED`, `EXTERNAL_GATED`).

Credentials alone never return `ENABLED`.

---

## Required external configuration (references)

| Category | Example key |
|----------|-------------|
| Credential | `ERX_PROVIDER_SECRET_REF` |
| Network/account | `ERX_NETWORK_ACCOUNT_REF` |
| Endpoint | `ERX_ENDPOINT_REF` |
| Callback secret | `ERX_CALLBACK_SECRET_REF` |
| Market/legal pack | `ERX_MARKET_LEGAL_CONFIG_REF` |

---

## Exact production blockers

Umbrella: **`NO_PRODUCTION_ERX_PROVIDER`** (+ related **`NO_PRODUCTION_CLINICAL_ADAPTER`**)

Granular: `ERX_PROVIDER_NOT_SELECTED`, `ERX_CREDENTIAL_REFERENCE_MISSING`, `ERX_NETWORK_ACCOUNT_REFERENCE_MISSING`, `ERX_ENDPOINT_CONFIGURATION_MISSING`, `ERX_CALLBACK_CONFIGURATION_MISSING`, `ERX_MARKET_LEGAL_CONFIGURATION_MISSING`, `ERX_PRESCRIBER_ELIGIBILITY_CONFIGURATION_MISSING`, `ERX_PHARMACY_NETWORK_CONFIGURATION_MISSING`

---

## Prescription / submission machines

Prescription: `DRAFT` → `ISSUED` → `FULLY_DISPENSED` (+ `SUPERSEDED` / `CANCELLED` / `EXPIRED`).

Submission: `PENDING` / `SUBMITTED` / `FAILED` / `UNSUPPORTED` / `CANCELLED` (sandbox only; never legal without provider).

Conceptual aliases: `TRANSMISSION_PENDING`→`PENDING`, etc. — do not invent a second domain machine.

Idempotency: `prescriptionVersionId` + outbox occurrence keys; timeout ≠ auto-TRANSMITTED.

---

## Eligibility distinctions

Document verified ≠ clinical approved ≠ eRx production enabled.  
Pharmacy verified ≠ eRx network configured.

---

## Country / controlled substances

`POLICY_DRIVEN` markets: GLOBAL / IN / AE / US.  
Controlled substances: **`LEGAL_GATED`**. Do not invent DEA/equivalent authorization.

---

## Permissions

Customer: view own Rx only; cannot issue/transmit.  
Doctor: scoped clinical; cannot bypass provider gate.  
Pharmacy/vendor: fulfillment minimum necessary; cannot issue/impersonate.  
Admin: activation oversight ≠ universal PHI.

---

## What must be supplied before activation

1. Real eRx vendor contract + non-mock adapter  
2. Vault refs + network account + callback  
3. Per-market legal/clinical clearance  
4. Prescriber + pharmacy network eligibility  
5. Human approval + live healthcare flag after verification  

Until then: **PRODUCTION ERX ENABLED = NO** and **CAN_PRODUCTION_LAUNCH = NO**.
