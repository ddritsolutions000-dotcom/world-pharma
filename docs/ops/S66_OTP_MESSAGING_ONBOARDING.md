# Sprint 66 — OTP / transactional messaging onboarding

> **Sprint 76** stabilizes this rail for production activation readiness. See `docs/ops/S76_OTP_MESSAGING_ONBOARDING.md`. Remaining blocker remains `NO_PRODUCTION_OTP_MESSAGING_PROVIDER` until a real vendor is supplied.

## Availability (this environment)

| Channel | Provider | Production | Status |
|---------|----------|------------|--------|
| OTP | **NOT_SELECTED** (ConsoleOtpAdapter only) | **EXTERNAL_GATED** | SANDBOX_VERIFIED |
| SMS | **NOT_SELECTED** | **EXTERNAL_GATED** | EXTERNAL_GATED |
| EMAIL | **NOT_SELECTED** | **EXTERNAL_GATED** | EXTERNAL_GATED |
| PUSH | **NOT_SELECTED** (FCM UNCONFIGURED) | **EXTERNAL_GATED** | NOT_VERIFIED + DEVICE_NOT_AVAILABLE |

No Twilio/SendGrid/SES/Msg91 (or other) SDK or live credentials were introduced.

## Safe path verified

1. Sandbox console OTP login remains available (`AUTH_DEV_REVEAL_OTP` in development only).
2. Production fail-closed: `COMMUNICATION_ENVIRONMENT=production` without live flag → `LIVE_OTP_DISABLED`.
3. Mock/CONSOLE provider ids forbidden for production OTP dependency.
4. OTP plaintext never logged when `NODE_ENV` or communication env is production.
5. Enablement guard requires non-mock adapters + approvals + live flag (credentials alone ≠ ENABLED).
6. Transactional SMS/email catalog = CONSOLE / EXTERNAL_GATED; in-app notifications remain software-path.
7. Native push = DEVICE_NOT_AVAILABLE (390px web ≠ native).

## Admin

- `/provider-activation` — OTP / messaging onboarding card
- `GET /api/v1/admin/control-plane/messaging-onboarding`

## Emergency disable

- `OTP_LIVE_ENABLED=false` / `COMMUNICATION_LIVE_ENABLED=false`
- or `PROVIDER_EMERGENCY_DISABLE_OTP_AUTH` / `PROVIDER_EMERGENCY_DISABLE_MESSAGING`
- Preserve challenges/sessions/notification events; do not claim delivered

## When a real provider is supplied

1. Register non-mock `OtpAdapter` + messaging adapters.
2. Vault secret refs; templates/sender IDs.
3. `PROVIDER_APPROVED_OTP_AUTH` (+ messaging approval).
4. `AUTH_DEV_REVEAL_OTP=false` in staging/production.
5. Set live flags only after enablement guard `can_enable=true`.
