# Sprint 85 — Production payment / PSP activation readiness

Stabilization of the **Sprint 65** PSP-first onboarding path. No Stripe/Razorpay/Adyen/merchant credentials or real-money transactions were invented.

## Provider status (this environment)

| Field | Value |
|-------|--------|
| PSP provider | **NOT_SELECTED** |
| Sandbox payment | **SANDBOX_VERIFIED** (MOCK_* only) |
| Production payment | **EXTERNAL_GATED** |
| Enabled | **false** |
| Primary blocker | **NO_PRODUCTION_PSP** |
| Settlement / payout | **EXTERNAL_PAYOUT_GATED** (customer payment ≠ vendor payout) |
| Country / currency | **POLICY_DRIVEN** |

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Credentials alone never enable. Enablement guard requires: provider selected, non-mock adapter, `PAYMENT_ENVIRONMENT=production`, `PAYMENT_LIVE_ENABLED`, human approval, R14-A, production webhook, no emergency disable.

## Payment state machine

Intent: `CREATED` → `REQUIRES_ACTION` / `PROCESSING` → `AUTHORIZED` / `CAPTURED` / `FAILED` / `CANCELLED` / `EXPIRED` / `UNKNOWN` (+ `AUTHORIZED_COD`).

Refund: `REQUESTED` → `PROCESSING` → `REFUNDED` / `FAILED`.

**Forbidden:** `PAYMENT_FAILED → ORDER_PAID` without a verified payment result. Terminal states protected. Duplicate initiation/confirmation idempotent.

## Webhook security

- Unsigned / invalid signature → rejected
- Duplicate events → idempotent (no double-confirm)
- Production webhooks → **EXTERNAL_GATED** while PSP NOT_SELECTED
- Secrets / PAN / signing keys never logged

## Order / payment / settlement boundary

| Layer | Relationship |
|-------|----------------|
| Payment state | Source of paid eligibility |
| Order payment state | Must stay consistent with intent |
| Fulfillment | Unpaid / failed must not unlock paid-only paths |
| Vendor settlement | **EXTERNAL_PAYOUT_GATED** — payment success ≠ bank payout |

## Fail-closed production

When PSP = NOT_SELECTED:

- Production initiation must not succeed via silent sandbox fallback
- No fake production “Payment successful”
- No fake transaction / PSP reference / settlement
- Admin shows **NO_PRODUCTION_PSP** + **EXTERNAL_GATED**
- Sandbox MOCK_* continues for software verification

## Admin

- `/provider-activation` — Production payment / PSP activation readiness (Sprint 85)
- `/payments`, `/finance`, `/launch-readiness`
- `GET /api/v1/admin/control-plane/psp-onboarding`

## Exact tests performed

| Suite | Result |
|-------|--------|
| Unit S85 | **9/9** |
| Unit S65 regression | **8/8** |
| Unit payment rail (gate/config/recon/refund/method/observability) | **28/28** |
| Unit S64 Provider Activation | **10/10** |
| Unit S75 / S84 observability | **15/15** / **9/9** |
| Unit S77–S83 regressions | S77 **12/12**, S78 **11/11**, S79 **12/12**, S80 **10/10**, S81 **10/10**, S82 **8/8**, S83 **9/9** |
| Playwright S85 | **3/3** |
| Playwright S65 regression | **2/2** |

- Shots: `apps/test-results/s85-payment-shots/` (17 PNGs)
- Status artifact: `apps/test-results/s85-payment/final-psp-status.json`
- Native Android/iOS: **DEVICE_NOT_AVAILABLE** (390px = **RESPONSIVE_WEB_VERIFIED** only)
- Master Index: **#383**

See also: `S65_PSP_ONBOARDING.md`, `S64_PAYMENT_ACTIVATION.md`.
