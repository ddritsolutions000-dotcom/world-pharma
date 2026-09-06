# Sprint 88 — Production PSP Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production PSP enabled:** **NO**  
**Provider selected:** **NO** (`NOT_SELECTED`)  
**Production lifecycle:** `NOT_SELECTED` / production posture `EXTERNAL_GATED`  
**Primary blocker:** `NO_PRODUCTION_PSP`  
**Foundation:** Sprint 85 (readiness) + Sprint 65 (first onboarding)  
**Launch control:** Sprint 87 remains fail-closed (`CAN_PRODUCTION_LAUNCH = NO`)

---

## Current provider status

| Field | Value |
|-------|-------|
| Provider | `NOT_SELECTED` |
| Registered adapters | `MOCK_*` only |
| Environment | `sandbox` (typical local) |
| Configured / Verified / Approved / Enabled | all **false** for production |
| Sandbox payment | `SANDBOX_VERIFIED` |
| Production payment | `EXTERNAL_GATED` |
| Settlement / payout | `EXTERNAL_PAYOUT_GATED` |
| Force-launch | **false** (not available) |

No production PSP brand, merchant ID, API key, webhook secret, or certificate is present in this repository. None were invented for this sprint.

---

## Production activation lifecycle

Canonical states:

`NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED`  
Also: `DISABLED`, `EXTERNAL_GATED`

Today the rail evaluates to **`NOT_SELECTED`** with production payment **`EXTERNAL_GATED`**.

Credentials / vault references alone never return `ENABLED`. The enablement guard requires:

1. Non-mock `PaymentGatewayPort` adapter registered  
2. `PAYMENT_ENVIRONMENT=production`  
3. `PAYMENT_LIVE_ENABLED=true`  
4. Human approval (`PROVIDER_APPROVED_PAYMENTS_PSP` / R14-A)  
5. Production webhook readiness  
6. No emergency disable  

Even when the guard’s checklist is hypothetically complete, **do not auto-activate** real credentials found in an environment — human ops approval remains mandatory.

---

## Required external configuration (references only)

Never store secret values in app config, logs, Admin UI, audit records, or tests. Use vault **references**:

| Category | Reference / key (example) |
|----------|---------------------------|
| Provider identity | Ops-selected non-mock gateway code (not invented here) |
| Merchant / account ID | Merchant contract out-of-band |
| API credential | `PAYMENT_GATEWAY_PRODUCTION_SECRET_REF` |
| Webhook signing secret | `PAYMENT_WEBHOOK_SECRET_REF` |
| Webhook endpoint | `PAYMENT_WEBHOOK_ENDPOINT_REF` |
| Environment separation | `PAYMENT_ENVIRONMENT` + `PAYMENT_LIVE_ENABLED` |
| Markets | `PAYMENT_PRODUCTION_COUNTRIES` (ISO2 list) |
| Currencies | `PAYMENT_PRODUCTION_CURRENCIES` |
| Reconciliation / settlement | `PAYMENT_RECONCILIATION_CONFIG_REF` |
| Capture / refund / methods | Country policy packs (policy-driven) |
| Idempotency / retry / timeout | Existing payment intent + webhook handlers |

Safe metadata only: `configured=true/false`, `reference_present=true/false`, `provider_selected=true/false`.

---

## Exact production blockers

Umbrella (never remove):

- **`NO_PRODUCTION_PSP`**

Granular validation (Sprint 88):

- `PSP_PROVIDER_NOT_SELECTED`
- `PSP_CREDENTIAL_REFERENCE_MISSING`
- `PSP_WEBHOOK_SECRET_REFERENCE_MISSING`
- `PSP_WEBHOOK_CONFIGURATION_MISSING`
- `PSP_ENVIRONMENT_MISMATCH` (when live flag set outside production env)
- `PSP_MARKET_CONFIGURATION_MISSING`
- `PSP_CURRENCY_CONFIGURATION_MISSING`
- `PSP_RECONCILIATION_CONFIGURATION_MISSING`

Admin readiness badges (current expected):

| Badge | Expected |
|-------|----------|
| Provider | `NOT_SELECTED` |
| Environment | `SANDBOX` / `PRODUCTION` |
| Configuration | `MISSING` |
| Webhook | `MISSING` |
| Markets | `MISSING` |
| Currencies | `MISSING` |
| Reconciliation | `MISSING` |
| Production activation | **`EXTERNAL_GATED`** (never fake green) |

---

## Webhook security

- Unsigned / invalid webhooks are **rejected** (fail-closed).
- Production signature verification uses the configured **secret reference** when present — not client claims.
- Idempotency preserved; duplicate callbacks must not double-apply payment.
- Client-side “payment successful” never marks an order paid.
- `FAILED` → `PAID` without verified provider evidence is forbidden.
- Terminal states are protected; correlation / request IDs preserved.
- Sandbox/mock webhook tests are used; no fabricated “production successful” PSP payloads.

---

## Payment state-machine guarantees

Intent statuses include: `CREATED`, `REQUIRES_ACTION`, `PROCESSING`, `AUTHORIZED`, `AUTHORIZED_COD`, `CAPTURED`, `FAILED`, `CANCELLED`, `EXPIRED`, `UNKNOWN`.

Refund statuses: `REQUESTED`, `PROCESSING`, `REFUNDED`, `FAILED`.

Rules retained:

- duplicate initiation / confirmation idempotent  
- invalid transitions rejected  
- terminal states protected  
- failed / cancelled payment does not create a paid order  
- order/payment consistency + amount/currency integrity  
- seller/customer/order ownership boundaries  

---

## Refund / reconciliation boundary

- Sandbox refunds: `SANDBOX_SUPPORTED` where the existing UI/API path allows.
- Production refunds: `EXTERNAL_GATED` until real PSP.
- **Customer payment ≠ vendor payout** — settlement remains `EXTERNAL_PAYOUT_GATED` (S30/S71).
- Reconciliation config is reference-gated (`PAYMENT_RECONCILIATION_CONFIG_REF`).

---

## Market / currency policy behavior

- No hardcoded `IN` / `INR` / `₹` / `UPI` / `+91` / `IST` in the PSP onboarding payload.
- Country/currency/methods/capture-refund behavior remain **policy-driven**.
- IN / AE / US sandbox policy behavior stays intact for local verification.

---

## What must be supplied before activation

1. Real PSP merchant contract + selected provider identity  
2. Vault refs for API credentials + webhook secrets + endpoint registration  
3. Production market + currency authorization lists  
4. Non-mock `PaymentGatewayPort` adapter implementation  
5. R14-A / human approval evidence  
6. Reconciliation / settlement ops configuration  
7. Explicit production env + live flag after verification  

Until then: **PRODUCTION PSP ENABLED = NO**.

---

## Admin surface

- Existing `/provider-activation` Sprint 88 PSP card (no second provider system).
- Launch readiness (`/launch-readiness`) continues to surface `NO_PRODUCTION_PSP` via Sprint 87 control.
- Customer access to Admin PSP controls remains denied (SoD).

---

## Code / docs touchpoints

- `apps/api/src/payment/psp-first-onboarding.ts` (Sprint 88)
- `apps/api/src/payment/production-psp-requirements.ts` (validation)
- `apps/api/src/ops/provider-activation-contracts.ts` (`PAYMENTS_PSP` refs)
- Admin `provider-activation-admin.tsx` Sprint 88 card
- API: `GET /api/v1/admin/control-plane/psp-onboarding`
- Tests: `s88-psp-activation.spec.ts`, Playwright `s88-psp.spec.ts`
