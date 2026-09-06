# Sprint 92 — Production Telemedicine / Live Video Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production video enabled:** **NO**  
**Provider:** `NOT_SELECTED`  
**Lifecycle:** `NOT_SELECTED`  
**Production:** `EXTERNAL_GATED`  
**Session / live:** `SANDBOX_ONLY`  
**Primary blocker:** `NO_PRODUCTION_VIDEO_PROVIDER`  
**Foundation:** Sprint 79 + Sprint 69  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundaries

**APPOINTMENT ≠ LIVE VIDEO SESSION**  
**SESSION CREATED ≠ LIVE CONSULTATION COMPLETED**  
**LIVE VIDEO ≠ RECORDING**

Sandbox consultation + `MockVideoProvider` remain available.  
LiveKit env refs (if present) are **not** production telemedicine selection.

---

## Current status

| Field | Value |
|-------|-------|
| Provider | `NOT_SELECTED` |
| Adapter | Mock / sandbox LiveKit refs only |
| Sandbox | `SANDBOX_VERIFIED` |
| Session creation | `SANDBOX_ONLY` |
| Live session | `SANDBOX_ONLY` |
| Consent | Sandbox verified; production LEGAL_GATED |
| Recording | `PRODUCTION_RECORDING_EXTERNAL_GATED` |
| Webhook | `EXTERNAL_GATED` |
| Legal/clinical gate | `EXTERNAL_GATED` |
| Storage/KMS | `EXTERNAL_GATED` (reuse S82) |
| Force-launch | **false** |
| Native Android/iOS | `DEVICE_NOT_AVAILABLE` |

No video vendor, API keys, signing secrets, rooms, recordings, or live ACKs were invented.

---

## Activation lifecycle

`NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED` (+ `DISABLED`, `EXTERNAL_GATED`).

Credentials alone never return `ENABLED`.

---

## Required external configuration (references)

| Category | Example key |
|----------|-------------|
| Credential | `VIDEO_PROVIDER_SECRET_REF` |
| API endpoint | `VIDEO_API_ENDPOINT_REF` |
| Token signing | `VIDEO_TOKEN_SIGNING_SECRET_REF` |
| Callback secret | `VIDEO_CALLBACK_SECRET_REF` |
| Market/legal pack | `VIDEO_MARKET_LEGAL_CONFIG_REF` |
| Recording storage | `VIDEO_RECORDING_STORAGE_REF` |

Never store raw secrets in app config or Admin UI.

---

## Exact production blockers

Umbrella: **`NO_PRODUCTION_VIDEO_PROVIDER`** (+ related **`NO_PRODUCTION_CLINICAL_ADAPTER`**)

Granular: `VIDEO_PROVIDER_NOT_SELECTED`, `VIDEO_CREDENTIAL_REFERENCE_MISSING`, `VIDEO_API_ENDPOINT_REFERENCE_MISSING`, `VIDEO_TOKEN_SIGNING_REFERENCE_MISSING`, `VIDEO_CALLBACK_CONFIGURATION_MISSING`, `VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING`, `VIDEO_RECORDING_STORAGE_CONFIGURATION_MISSING`, `VIDEO_CONSENT_POLICY_CONFIGURATION_MISSING`

---

## Session lifecycle

Canonical path: `CREATED` → `READY` → `DOCTOR_JOINED` → `CUSTOMER_JOINED` → `IN_PROGRESS` → `ENDED`  
Exceptions: `FAILED` / `EXPIRED`

- Terminal overwrite forbidden  
- Duplicate start/end idempotent  
- Timeout must not auto-promote to live/completed  

---

## Participant authorization + tokens

- Customer: own authorized consultation only; cannot impersonate doctor  
- Doctor: scoped appointments only; cannot bypass provider activation  
- Admin: operational readiness only — not unrestricted clinical video access  
- Tokens: session-scoped, participant-validated, short-lived where applicable, never logged; sandbox tokens marked `SANDBOX_ONLY`

---

## Consent + recording + webhooks

- Missing/revoked consent blocks required video actions  
- Production recording stays EXTERNAL_GATED without provider + storage/KMS + retention + legal config  
- Unsigned/invalid/unknown callbacks fail closed; duplicates idempotent; no secrets/PHI in logs  
- Without a real provider, production callback activation remains EXTERNAL_GATED

---

## Country / policy

Policy-driven evaluation markets: **GLOBAL / IN / AE / US**.  
Do not invent telemedicine legal rules; unmodeled requirements = `LEGAL_GATED` / policy gate.

---

## Sandbox limitations

- Sandbox UI/session shell ≠ production live video  
- Do not claim camera/mic native verification without a device (`DEVICE_NOT_AVAILABLE`)  
- Responsive web (390/768/1024/1440) ≠ native testing  

---

## Required external approvals

1. Signed telemedicine video vendor contract + DPA  
2. Vault credential / endpoint / signing / webhook refs  
3. Market legal + consent packs certified  
4. Recording decision (off by default) + S82 storage/KMS if ever enabled  
5. Human `PROVIDER_APPROVED_VIDEO` + healthcare live flag **after** enablement guard  

---

**PRODUCTION VIDEO ENABLED = NO**  
**CAN_PRODUCTION_LAUNCH = NO**
