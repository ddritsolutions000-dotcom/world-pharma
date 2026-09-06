# Sprint 89 — Production OTP + Transactional Communications Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production OTP enabled:** **NO**  
**Production SMS enabled:** **NO**  
**Production Email enabled:** **NO**  
**Production Push enabled:** **NO**  
**Umbrella blocker:** `NO_PRODUCTION_OTP_MESSAGING_PROVIDER`  
**Foundation:** Sprint 86 (final readiness) + Sprint 76 / 66  
**Launch control:** Sprint 87 remains `CAN_PRODUCTION_LAUNCH = NO`

---

## Channel status

| Channel | Provider | Sandbox | Production | Primary blocker |
|---------|----------|---------|------------|-----------------|
| OTP | `NOT_SELECTED` | `SANDBOX_VERIFIED` (Console) | `EXTERNAL_GATED` | `NO_PRODUCTION_OTP_PROVIDER` |
| SMS | `NOT_SELECTED` | `SANDBOX_AVAILABLE` | `EXTERNAL_GATED` | `NO_PRODUCTION_SMS_PROVIDER` |
| Email | `NOT_SELECTED` | `SANDBOX_AVAILABLE` | `EXTERNAL_GATED` | `NO_PRODUCTION_EMAIL_PROVIDER` |
| Push | `NOT_SELECTED` | N/A | `EXTERNAL_GATED` | `NO_PRODUCTION_PUSH_PROVIDER` + `DEVICE_NOT_AVAILABLE` |

No production vendor names, API keys, sender IDs, SMS numbers, email domains, or webhook secrets were invented.

---

## Production activation lifecycle

Canonical: `NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED` (+ `DISABLED`, `EXTERNAL_GATED`).

Credentials alone never return `ENABLED`. Enablement guard requires non-mock adapters, production env, live flags, human approval, `AUTH_DEV_REVEAL_OTP` off in production, country/legal gates, and no emergency disable.

---

## Required external configuration (references only)

| Category | Example reference key |
|----------|----------------------|
| OTP credential | `OTP_PROVIDER_SECRET_REF` |
| SMS credential | `SMS_PROVIDER_SECRET_REF` |
| SMS sender/origin | `SMS_SENDER_ORIGIN_REF` |
| Email credential | `EMAIL_PROVIDER_SECRET_REF` |
| Email sender | `EMAIL_SENDER_IDENTITY_REF` |
| Email domain | `EMAIL_SENDING_DOMAIN_REF` |
| Markets | `COMMUNICATION_PRODUCTION_COUNTRIES` |
| Env / live | `COMMUNICATION_ENVIRONMENT`, `OTP_LIVE_ENABLED` / `COMMUNICATION_LIVE_ENABLED` |

Safe metadata only: `provider_selected`, `reference_present`, `configured`, readiness `READY`/`MISSING`.

---

## Exact production blockers

Umbrella: **`NO_PRODUCTION_OTP_MESSAGING_PROVIDER`**

Channel: `NO_PRODUCTION_OTP_PROVIDER`, `NO_PRODUCTION_SMS_PROVIDER`, `NO_PRODUCTION_EMAIL_PROVIDER`, `NO_PRODUCTION_PUSH_PROVIDER`

Config (Sprint 89): `NO_PRODUCTION_OTP_CREDENTIAL`, `NO_PRODUCTION_SMS_CREDENTIAL`, `NO_PRODUCTION_SMS_SENDER`, `NO_PRODUCTION_EMAIL_CREDENTIAL`, `NO_PRODUCTION_EMAIL_SENDER`, `NO_PRODUCTION_EMAIL_DOMAIN`

---

## Notification lifecycle

`QUEUED` → `PROCESSING` → `SENT` → `DELIVERED` (+ `SANDBOX_DELIVERED` for in-app sandbox).

**SENT ≠ DELIVERED.** DELIVERED requires provider receipt. Failures: `FAILED` / `RETRYING` / `CANCELLED` / `DEAD_LETTER` / `EXTERNAL_GATED`.

Outbox: deterministic occurrence keys, duplicate-safe, retry-safe. OTP resend throttled.

---

## OTP security

Expiry, attempt limits, throttling, purpose binding, replay prevention, replacement invalidates prior, session binding. Never log/return OTP in production. `AUTH_DEV_REVEAL_OTP` must be false for production.

---

## Market / policy

`POLICY_DRIVEN`. Evaluation markets: GLOBAL / IN / AE / US. No hardcoded national payment or telecom assumptions in the messaging onboarding payload.

---

## Native / push

Android / iOS / native device: **`DEVICE_NOT_AVAILABLE`**. Responsive web verification is not native push proof.

---

## What must be supplied before activation

1. Real OTP/SMS/email/push vendor contracts  
2. Vault credential refs + SMS origin + verified email domain  
3. Non-mock adapters  
4. Country/legal review for live SMS  
5. Human approval flags; `AUTH_DEV_REVEAL_OTP=false` in production  
6. Delivery-status webhook secrets when the provider supplies them  

Until then:

**PRODUCTION OTP ENABLED = NO**  
**PRODUCTION SMS ENABLED = NO**  
**PRODUCTION EMAIL ENABLED = NO**  
**PRODUCTION PUSH ENABLED = NO**  
**CAN_PRODUCTION_LAUNCH = NO**

---

## Code touchpoints

- `apps/api/src/identity/messaging-first-onboarding.ts` (Sprint 89)
- `apps/api/src/identity/production-messaging-requirements.ts`
- Admin `/provider-activation` Sprint 89 card
- API `GET …/messaging-onboarding`
- Docs: this file
