# Sprint 64 — Payment activation human steps

Do **not** enable a real PSP in this sprint without merchant credentials and R14-A completion.

## Path (fail-closed)

1. **CONFIGURED** — Secret manager holds gateway `secretRef`; `PaymentGateway.environment=production`; no mock provider id.
2. **Connectivity verification** — Provider SDK/API health (ops); never log secrets.
3. **Merchant/account verification** — Confirm merchant account active with PSP.
4. **Test transaction strategy** — PSP-approved test mode or controlled low-value live test with finance oversight.
5. **Webhook verification** — Signed webhooks; idempotent `event_id`; reject unsigned.
6. **Reconciliation verification** — Settlement file / PSP dashboard vs `payment_intents`.
7. **APPROVED** — R14-A human gates complete + `PROVIDER_APPROVED_PAYMENTS_PSP` (or equivalent ops record).
8. **ENABLED** — `PAYMENT_ENVIRONMENT=production` **and** `PAYMENT_LIVE_ENABLED=true` **and** live adapter registered.

## Safety invariants

- Sandbox mock **cannot** run when `PAYMENT_ENVIRONMENT=production`.
- Production **cannot** silently fall back to sandbox success.
- Paid orders only after server-side `CAPTURED` / `AUTHORIZED_COD`.
- Duplicate webhooks remain idempotent.
- Payout does **not** execute merely because an order is paid (`EXTERNAL_PAYOUT_GATED` until Phase 5).

## Disable

See `S64_EMERGENCY_DISABLE.md` — `PAYMENT_LIVE_ENABLED=false`.
