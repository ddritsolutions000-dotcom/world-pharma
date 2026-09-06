# Sprint 65 — First real PSP onboarding

## Availability check (this environment)

| Field | Value |
|-------|--------|
| Provider | **NOT_SELECTED** |
| Real PSP credentials | **Not supplied** |
| Non-mock adapters registered | **None** (MOCK_* only) |
| Production | **EXTERNAL_GATED** |
| Enabled | **false** |

Do **not** invent a PSP. Do **not** claim live payments.

## Safe path verified without live PSP

1. Sandbox mock checkout remains available (`PAYMENT_ENVIRONMENT=sandbox`).
2. Production fail-closed: mock gateway forbidden in production rows; `PAYMENT_ENVIRONMENT=production` without `PAYMENT_LIVE_ENABLED` → `LIVE_PAYMENTS_DISABLED`.
3. Activation lifecycle (S64): CONFIGURED → VERIFIED → APPROVED → ENABLED — credentials alone never enable.
4. Enablement guard (`evaluatePspEnablementGuard`) requires provider selected, non-mock adapter, production env, live flag, human approval, R14-A, production webhook, no emergency disable.
5. Webhooks: sandbox signature/idempotency tests; production webhook **EXTERNAL_GATED** until real adapter.
6. Settlement: customer payment ≠ vendor payout (`EXTERNAL_PAYOUT_GATED`).
7. Country/currency: policy-driven (no global INR/UPI/+91).

## Admin

- `/provider-activation` — First PSP onboarding card
- `GET /api/v1/admin/control-plane/psp-onboarding`

## When a real PSP is supplied later

1. Register non-mock `PaymentGatewayPort` + webhook port.
2. Vault `PAYMENT_GATEWAY_*_SECRET_REF` (never in git).
3. Complete R14-A + `PROVIDER_APPROVED_PAYMENTS_PSP`.
4. Production webhook verify.
5. Set `PAYMENT_ENVIRONMENT=production` + `PAYMENT_LIVE_ENABLED=true` only after guard `can_enable=true`.
6. Prefer provider test mode — no real customer money without business authorization.

See also: `S64_PAYMENT_ACTIVATION.md`, `S64_EMERGENCY_DISABLE.md`.

**Sprint 85** extends this rail for production payment activation readiness — see `S85_PSP_PAYMENT_ONBOARDING.md` (blocker **NO_PRODUCTION_PSP**).
