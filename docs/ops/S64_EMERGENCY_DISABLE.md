# Sprint 64 — Emergency disable & rollback

All live-capable rails support **ops-manual** disable. Prefer env live flags in the secret manager over code changes.

Global kill-switch (optional): `PROVIDER_EMERGENCY_DISABLE_ALL=true`  
Per-rail: `PROVIDER_EMERGENCY_DISABLE_<INTEGRATION_ID>=true` (e.g. `PROVIDER_EMERGENCY_DISABLE_PAYMENTS_PSP`)

## PSP / payments outage

1. Set `PAYMENT_LIVE_ENABLED=false` (and/or emergency disable).
2. Preserve existing `payment_intents`, attempts, webhooks, orders.
3. Refuse new live captures; **do not** fall back to sandbox mock success in production.
4. Keep webhook idempotency; reconcile UNKNOWN manually.
5. Audit: record disable reason in ops ticket.

## Carrier outage

1. `CARRIER_LIVE_ENABLED=false`.
2. Stop live shipment creation; preserve tracking state.
3. Do not invent carrier-confirmed events.
4. Sandbox mock carrier must remain unreachable from production env.

## OTP / messaging outage

1. `OTP_LIVE_ENABLED=false` / `COMMUNICATION_LIVE_ENABLED=false`.
2. Stop claiming messages were sent; return provider unavailable.
3. Preserve challenges/sessions/accounts.
4. **Never** enable `AUTH_DEV_REVEAL_OTP` in production.
5. Never log OTP codes.

## Payout outage

1. `PAYOUT_LIVE_ENABLED=false`.
2. Hold execution; preserve accrued liabilities/settlements.
3. Do not mark bank-executed / PAID without provider confirmation.

## Healthcare (eRx / video / PACS) outage

1. Disable healthcare live flag / emergency disable for the rail.
2. UI shows unavailable — never fabricate completion.
3. Preserve clinical records, prescriptions drafts, imaging metadata.
4. Sandbox adapters must not be labeled as legally active clinical services.

## Storage / KMS / scanner outage

1. Disable respective `*_LIVE_ENABLED` flags.
2. Fail closed on sensitive upload/download.
3. **Never** fall back to local disk for production-sensitive documents.

## PITR / database

- Do not “disable backups.” If restore capability is compromised, freeze risky schema deploys and escalate DBA.
- Restore drills only on disposable targets (`S64_RESTORE_DRILL.md`).

## Country suspend

- Use Admin control-plane country suspend when a whole market must stop accepting production traffic.
