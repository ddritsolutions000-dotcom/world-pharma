# Security ops runbook

## Suspicious admin activity

1. Review security events via existing security-events APIs / Main Admin surfaces.
2. Correlate with `x-correlation-id` and admin person id.
3. Revoke sessions via existing session revocation paths if needed.

## Secret exposure response

1. Rotate affected secrets (`JWT_ACCESS_SECRET`, `OTP_PEPPER`, webhook secrets, DB/Redis credentials, `METRICS_TOKEN`).
2. Confirm diagnostics never return secrets: `/health`, `/health/ready`, `/metrics`, reliability snapshot.
3. Confirm logs use redaction helpers (`redactText`) — passwords/OTP/tokens must not appear.
4. Invalidate leaked API tokens / admin sessions.

## Configuration safety

- `parseEnv()` fail-fast on invalid/missing required config.
- Staging/production forbid `AUTH_DEV_REVEAL_OTP`.
- Live payment flags are explicit and default off.
