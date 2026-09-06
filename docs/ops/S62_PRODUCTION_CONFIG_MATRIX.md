> **Sprint 98** continues secrets/env activation readiness. See `S98_PRODUCTION_SECRETS_ENV_CONFIGURATION_ACTIVATION_READINESS.md`. Production secrets remain **EXTERNAL_GATED**.

# Sprint 62 — Production configuration matrix

Values are **names and safe defaults only**. Do not paste real credentials into this file or git.

| Group | DEV | SANDBOX | STAGING | PRODUCTION |
|-------|-----|---------|---------|------------|
| `NODE_ENV` | development | development/test | staging | production |
| `DATABASE_URL` | local docker | local/shared sandbox | managed staging | managed prod (**required**) |
| `REDIS_URL` | local | local/shared | managed | managed (**required**) |
| `PAYMENT_ENVIRONMENT` | sandbox | sandbox | sandbox until approved | `production` only after R14-A + PSP |
| `PAYMENT_LIVE_ENABLED` | unset/false | false | false | `true` only when live PSP authorized |
| `PAYMENT_GATEWAY_*_SECRET_REF` | optional | mock secret env | staging refs | secret-manager refs (**required** for live) |
| `COMMUNICATION_ENVIRONMENT` | sandbox | sandbox | sandbox | production after OTP vendor |
| `OTP_LIVE_ENABLED` / `COMMUNICATION_LIVE_ENABLED` | false | false | false | true only with VERIFIED provider |
| `AUTH_DEV_REVEAL_OTP` | may be true | may be true | **must be false** | **must be false** |
| `LOGISTICS_ENVIRONMENT` / `CARRIER_*` | sandbox | sandbox | sandbox | production only with live carrier adapter |
| `CARRIER_LIVE_ENABLED` / `LOGISTICS_LIVE_ENABLED` | false | false | false | true only when authorized |
| `HEALTHCARE_ENVIRONMENT` / `CLINICAL_*` / `HEALTHCARE_LIVE_ENABLED` | sandbox | sandbox | sandbox | production only with clinical adapters |
| `INFRASTRUCTURE_ENVIRONMENT` | development | development | staging | production only after storage/KMS/scanner |
| `OBJECT_STORAGE_*` | local backend | local | staging bucket refs | non-local bucket + secrets (**required**) |
| `FILE_SCANNING_*` / `MALWARE_SCANNER_*` | noop OK | noop OK | staging scanner | live scanner (**required**) |
| `SECRET_MANAGER_REF` / `KMS_KEY_REF` | optional | optional | refs | **required** |
| `METRICS_TOKEN` | optional | optional | recommended | recommended |
| `JWT_ACCESS_SECRET` / `OTP_PEPPER` | local | local | unique staging | unique prod (**required**) |
| Country policy packs | IN/AE/US/XX fixtures | same | same | activate only via control plane |
| Feature: live PSP/carrier/OTP/payout | OFF | OFF | OFF | OFF until human gates |

## Startup vs feature block

| Missing config | Behavior |
|----------------|----------|
| Database / Redis | `/health/ready` → **not_ready** (503) — process may run but traffic unsafe |
| PSP / OTP / carrier / clinical / storage live flags | **Feature-level fail-closed** (409/503); app may start |
| `AUTH_DEV_REVEAL_OTP` in production | **Must be disabled** by ops policy (treat as launch blocker) |
| Local object store when `INFRASTRUCTURE_ENVIRONMENT=production` | Storage assert **blocks** production activation paths |

## Country / globalization

Payment, carrier, and messaging availability are **country + dependency** scoped. Do not assume global INR/UPI/+91/IST. India policy-pack values remain valid for IN only.
