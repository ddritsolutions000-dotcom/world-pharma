# Sprint 86 — Final OTP + transactional communications activation readiness

Stabilization of the **Sprint 76** (foundation **Sprint 66**) messaging-first onboarding path. No OTP/SMS/email/push vendor, credentials, sender IDs, or production delivery success were invented.

## Provider status (this environment)

| Channel | Provider | Sandbox | Production | Blocker |
|---------|----------|---------|------------|---------|
| OTP | **NOT_SELECTED** (ConsoleOtpAdapter) | **SANDBOX_VERIFIED** | **EXTERNAL_GATED** | **NO_PRODUCTION_OTP_PROVIDER** |
| SMS | **NOT_SELECTED** | SANDBOX_AVAILABLE | **EXTERNAL_GATED** | **NO_PRODUCTION_SMS_PROVIDER** |
| EMAIL | **NOT_SELECTED** | SANDBOX_AVAILABLE | **EXTERNAL_GATED** | **NO_PRODUCTION_EMAIL_PROVIDER** |
| PUSH | **NOT_SELECTED** | N/A | **EXTERNAL_GATED** | **NO_PRODUCTION_PUSH_PROVIDER** (+ DEVICE_NOT_AVAILABLE) |

**Umbrella blocker:** `NO_PRODUCTION_OTP_MESSAGING_PROVIDER`  
**Sandbox authentication:** **SANDBOX_VERIFIED**  
**Production authentication:** **EXTERNAL_GATED**

Configured=false does **not** imply production delivery. Credentials alone ≠ ENABLED.

## Activation lifecycle

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` (+ `DISABLED` / `EXTERNAL_GATED`)

Independent activation state per channel. Production enablement requires non-mock adapters + vault refs + human approval + legal/privacy + country policy + `AUTH_DEV_REVEAL_OTP=false` + enablement guard `can_enable=true`.

## OTP security

Expiry, attempt limits, resend throttling, purpose binding, replay prevention, replacement invalidation, session binding, server-side rate limits. OTP never logged/returned in production. `AUTH_DEV_REVEAL_OTP` production = **MUST_BE_FALSE**.

## Notification state machine

`QUEUED → PROCESSING → SENT → DELIVERED` (+ `SANDBOX_DELIVERED` for in-app sandbox).

Failures: `FAILED` | `RETRYING` | `CANCELLED` | `DEAD_LETTER` | `EXTERNAL_GATED`

**SENT ≠ DELIVERED.** DELIVERED requires provider receipt. SMS/email/push without a provider stay **EXTERNAL_GATED** — never fake DELIVERED.

## Outbox / idempotency

Deterministic `occurrence_key`; duplicate events safe; OTP resend throttled; retry safe.

## Transactional coverage (software)

Order / payment / refund / shipment / delivery events: in-app **SANDBOX_VERIFIED**.  
Consultation / lab / imaging / prescription: **POLICY_REQUIRED** or **LEGAL_GATED** where applicable.  
SMS/email/push production channels: **EXTERNAL_GATED**.

## Country / localization

**POLICY_DRIVEN.** No hardcoded IN / INR / ₹ / UPI / +91 / IST in shared messaging onboarding.

## Admin

- `/provider-activation` — OTP / transactional communications activation readiness (Sprint 86)
- `/reliability`, `/launch-readiness`
- `GET /api/v1/admin/control-plane/messaging-onboarding`

## Exact tests performed

| Suite | Result |
|-------|--------|
| Unit S86 | **6/6** |
| Unit S76 regression | **11/11** |
| Unit S66 regression | **6/6** |
| Unit production-otp-gate | **5/5** |
| Unit S64 / S75 / S84 / S85 | **10/10** / **15/15** / **9/9** / **9/9** |
| Unit S77–S83 | S77 **12/12**, S78 **11/11**, S79 **12/12**, S80 **10/10**, S81 **10/10**, S82 **8/8**, S83 **9/9** |
| Playwright S86 | **3/3** |
| Playwright S76 regression | **3/3** |

- Shots: `apps/test-results/s86-communications-shots/` (21 PNGs; **no OTP values**)
- Status: `apps/test-results/s86-communications/final-communications-status.json`
- Native: **DEVICE_NOT_AVAILABLE** (390px = **RESPONSIVE_WEB_VERIFIED** only)
- Master Index: **#384**

See also: `S76_OTP_MESSAGING_ONBOARDING.md`, `S66_OTP_MESSAGING_ONBOARDING.md`.
