# Payment ops runbook

## Failed payment

1. Capture correlation / payment intent id.
2. Customer/admin payment observability endpoints (existing admin payment APIs).
3. Metrics: `payment_attempt_total`, `payment_failure_total`.
4. Confirm sandbox vs live: `PAYMENT_LIVE_ENABLED` must remain false unless explicitly authorized. Reliability snapshot shows `live_payment_enabled`.

## Compensation / refund issue

1. Refunds require `Idempotency-Key`.
2. Rate limit: Redis key `rl:payment:refund:{personId}` (20 / 900s).
3. Pay initiation rate limit: `rl:payment:pay:{personId}` (30 / 900s).
4. Duplicate refund with same idempotency key returns prior result via `idempotency_records`.

## Production PSP

Live PSP remains **EXTERNAL_GATED**. Do not toggle live flags to clear incidents.
See payment production boundary helpers / Main Admin R14-A gate docs.
