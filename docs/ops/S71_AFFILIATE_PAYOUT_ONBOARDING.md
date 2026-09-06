# Sprint 71 — Affiliate / partner payout production onboarding readiness

## Availability (this environment)

| Field | Value |
|-------|-------|
| Provider | **NOT_SELECTED** (MockPayoutAdapter only) |
| Environment | sandbox (default) |
| Configured | false |
| Verified | false |
| Approved | false |
| Enabled | false |
| Sandbox | **SANDBOX_VERIFIED** (accrual / statements / mock payout simulation) |
| Production | **EXTERNAL_GATED** |
| Payout status | **SANDBOX_ONLY** |
| Beneficiary / KYC | **EXTERNAL_GATED** |
| Country / currency | **POLICY_DRIVEN** |
| Legal/financial gate | **EXTERNAL_GATED** |
| Double-payout protection | **SANDBOX_VERIFIED** (idempotency keys) |
| Ledger protection | **SANDBOX_VERIFIED** |
| Remaining blocker | **NO_PRODUCTION_PAYOUT_ADAPTER** |

No bank/wallet vendor, real beneficiary transfer, or live payout credentials were invented.

## Architecture boundary

| Layer | Meaning |
|-------|---------|
| Commission / accrual | Ledger facts from attributable transactions |
| Settlement statement | Period eligibility / netting |
| Sandbox payout | `MockPayoutAdapter` simulation (`sandbox: true`) — zero network |
| Production disbursement | Non-mock `PayoutPort` + KYC + rails + live flags — **not present** |

Accrual / “eligible” **does not** mean bank-paid.

## Existing payout statuses

`CREATED → APPROVED → SUBMITTED → PROCESSING → PAID` (+ `FAILED` / `UNKNOWN` / `REVERSED`)

Affiliate cannot mark PAID; provider/reconciliation is authoritative for completion.

## Safe path verified

1. Affiliate portal earnings/statement remain available in sandbox.
2. Finance settlement + mock payout path remains sandbox-only.
3. Idempotent payout create uses `idempotencyKey` uniqueness.
4. Enablement guard requires non-mock adapter + KYC + webhook + dual-control + legal + `PAYOUT_LIVE_ENABLED`.
5. Emergency disable: `PAYOUT_LIVE_ENABLED=false` or `PROVIDER_EMERGENCY_DISABLE_AFFILIATE_PAYOUT` — preserve ledger; do not invent PAID.

## Admin

- `/provider-activation` — Affiliate / partner payout onboarding card
- `GET /api/v1/admin/control-plane/affiliate-payout-onboarding`

## When a real payout provider is supplied

1. Register non-mock `PayoutPort` adapter (submit + signed webhook + recon).
2. Vault secret refs; beneficiary rails; KYC/AML evidence.
3. Clear legal/financial gate; dual-control attested.
4. `PROVIDER_APPROVED_AFFILIATE_PAYOUT=true`.
5. Set `PAYMENT_ENVIRONMENT=production` + `PAYOUT_LIVE_ENABLED=true` only after enablement guard `can_enable=true`.
6. Do **not** execute a real bank transfer without explicit authorization.
