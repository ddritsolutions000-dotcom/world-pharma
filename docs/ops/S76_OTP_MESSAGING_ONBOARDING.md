# Sprint 76 — Production OTP + transactional communications activation readiness

Stabilization of the **Sprint 66** messaging-first onboarding path. No messaging vendor was invented.

## Provider status (this environment)

| Channel | Provider | Sandbox | Production | Enabled |
|---------|----------|---------|------------|---------|
| OTP | **NOT_SELECTED** (ConsoleOtpAdapter) | **SANDBOX_VERIFIED** | **EXTERNAL_GATED** | false |
| SMS | **NOT_SELECTED** | SANDBOX_AVAILABLE | **EXTERNAL_GATED** | false |
| EMAIL | **NOT_SELECTED** | SANDBOX_AVAILABLE | **EXTERNAL_GATED** | false |
| PUSH | **NOT_SELECTED** | N/A | **EXTERNAL_GATED** | false (+ DEVICE_NOT_AVAILABLE) |

**Remaining blocker:** `NO_PRODUCTION_OTP_MESSAGING_PROVIDER`

Configured=false does **not** imply production delivery. Credentials alone ≠ ENABLED.

## Activation lifecycle (S64)

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Independent activation state per channel (OTP / SMS / EMAIL / PUSH).

Production enablement requires: provider + vault refs + verification + approval + legal/privacy + country coverage + security config + enablement guard `can_enable=true`.

## OTP security

| Control | Status |
|---------|--------|
| Never log OTP in production | Enforced (`ConsoleOtpAdapter` + `AUTH_DEV_REVEAL_OTP`) |
| Never return OTP in production API responses | `devCode` only when reveal + non-production |
| Expiry | Server-side TTL |
| Attempt limits / lock | `maxAttempts` → LOCKED |
| Resend throttling | `resendAvailableAt` |
| Purpose binding / replay prevention | Challenge purpose fixed; prior PENDING invalidated |
| Rate limits | Server-side Redis |
| `AUTH_DEV_REVEAL_OTP` in production | **MUST_BE_FALSE** |

Do not weaken auth for sandbox convenience.

## Notification state machine

Success path: `QUEUED → PROCESSING → SENT → DELIVERED` (plus `SANDBOX_DELIVERED` for in-app sandbox).

Failure: `FAILED` | `RETRYING` | `CANCELLED` | `DEAD_LETTER` | `EXTERNAL_GATED`

- **SENT** = accepted by provider  
- **DELIVERED** = confirmed to user (requires provider receipt)  
Without a live provider, SMS/email/push remain **EXTERNAL_GATED** — do not claim DELIVERED.

## Outbox / idempotency

- Deterministic `occurrence_key` prevents duplicate notifications  
- OTP resend throttled; retry must not spam  
- Failed notifications may retry safely when keys allow  

## Delivery receipts / webhooks

Architecture supports signature validation + idempotent receipts when a provider is supplied. Production callbacks remain **EXTERNAL_GATED** without a real vendor. Do not fabricate receipts.

## Consent

| Class | Marketing opt-in required? |
|-------|----------------------------|
| Security / authentication OTP | **No** |
| Order / payment / clinical / operational | **No** |
| Promotional / marketing | **Yes** |

## Country / global policy

World-Pharma is global. Messaging rail does not hardcode India / IN / INR / ₹ / UPI / +91 / IST.

Channel selection is **POLICY_DRIVEN**. Country-specific telecom/consent rules for live SMS remain **LEGAL_REVIEW_REQUIRED** when enabling.

## PHI minimization

Templates avoid unnecessary clinical detail; prefer authenticated destinations / deep-links already supported. Do not log message bodies with PHI or OTP.

## Emergency disable

- `OTP_LIVE_ENABLED=false` / `COMMUNICATION_LIVE_ENABLED=false`  
- or `PROVIDER_EMERGENCY_DISABLE_OTP_AUTH` / `PROVIDER_EMERGENCY_DISABLE_MESSAGING`  
Preserve challenges/sessions/events; do not claim delivered.

## Admin

- `/provider-activation` — OTP / messaging activation readiness (Sprint 76)  
- `/reliability` — ops signals (reuse S75)  
- `GET /api/v1/admin/control-plane/messaging-onboarding`

## Native mobile

Android = **DEVICE_NOT_AVAILABLE** · iOS = **DEVICE_NOT_AVAILABLE**  
390px browser = **RESPONSIVE_WEB_VERIFIED** (≠ native).

## Production prerequisites (external / human)

1. Real OTP + SMS + email (+ push if required) vendor contracts  
2. Vault secret refs + non-mock adapters  
3. Country/channel policy + legal/privacy clearance  
4. `PROVIDER_APPROVED_OTP_AUTH` (+ messaging approval)  
5. `AUTH_DEV_REVEAL_OTP=false` in staging/production  
6. Enablement guard `can_enable=true` before live flags  

## Explicit blockers

- `NO_PRODUCTION_OTP_MESSAGING_PROVIDER`  
- Production = **EXTERNAL_GATED**  
- Do **not** mark World-Pharma production-ready while communications and other external gates remain open.

**Sprint 86** finalizes this rail — see `S86_OTP_TRANSACTIONAL_COMMUNICATIONS_ONBOARDING.md` (umbrella + granular `NO_PRODUCTION_OTP_PROVIDER` / `NO_PRODUCTION_SMS_PROVIDER` / `NO_PRODUCTION_EMAIL_PROVIDER` / `NO_PRODUCTION_PUSH_PROVIDER`).
