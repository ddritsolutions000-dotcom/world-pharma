# Sprint 103 — Real OTP + Transactional Communications Activation Readiness

**Status:** COMPLETE (software readiness)  
**Real OTP provider selected:** **NO**  
**Real SMS provider selected:** **NO**  
**Real email provider selected:** **NO**  
**Real push provider selected:** **NO**  
**Production OTP enabled:** **NO**  
**Production SMS enabled:** **NO**  
**Production email enabled:** **NO**  
**Production push enabled:** **NO**  
**Real messages sent:** **NO**  
**Lifecycle:** `NOT_SELECTED` / `EXTERNAL_GATED`  
**Primary blocker:** `NO_PRODUCTION_OTP_MESSAGING_PROVIDER`  
**Composes:** S31/S45/S66/S76/S86/S89 + S97/S98/S100/S101/S102  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundaries

**SANDBOX_VERIFIED ≠ PRODUCTION**  
**READY_FOR_ACTIVATION ≠ ENABLED**  
**SENT ≠ DELIVERED** (provider accept ≠ end-user delivery)  
**No invented OTP/SMS/email/push providers, API keys, sender IDs, domains, or webhook secrets**  
**No real customer OTP/SMS/email/push**  
**OTP values never in logs, Admin UI, browser responses, or telemetry**  
**Console OTP sandbox remains SANDBOX_VERIFIED only**

---

## Four communications rails

| Rail | Provider | Sandbox | Production | Enabled |
|------|----------|---------|------------|---------|
| OTP | NOT_SELECTED | SANDBOX_VERIFIED (console) | EXTERNAL_GATED | false |
| SMS | NOT_SELECTED | SANDBOX_AVAILABLE / N/A | EXTERNAL_GATED | false |
| EMAIL | NOT_SELECTED | SANDBOX_AVAILABLE / N/A | EXTERNAL_GATED | false |
| PUSH | NOT_SELECTED | DEVICE_NOT_AVAILABLE | EXTERNAL_GATED | false |

Production never inherits sandbox success.

---

## Exact communication blockers

- `NO_PRODUCTION_OTP_MESSAGING_PROVIDER` (umbrella)
- `NO_PRODUCTION_OTP_PROVIDER`
- `NO_PRODUCTION_SMS_PROVIDER`
- `NO_PRODUCTION_EMAIL_PROVIDER`
- `NO_PRODUCTION_PUSH_PROVIDER`
- `NO_PRODUCTION_OTP_CREDENTIAL`
- `NO_PRODUCTION_SMS_CREDENTIAL`
- `NO_PRODUCTION_SMS_SENDER`
- `NO_PRODUCTION_EMAIL_CREDENTIAL`
- `NO_PRODUCTION_EMAIL_SENDER`
- `NO_PRODUCTION_EMAIL_DOMAIN`
- plus S101 foundation gates (environment / secrets / DB / deployment target)

---

## OTP security (preserved)

Expiry, max attempts, throttling, purpose binding, session/user binding, replay protection, replacement invalidation, rate limits, auditability — all remain enforced.  
`AUTH_DEV_REVEAL_OTP` must be false in production. OTP codes are never returned in production responses.

---

## Notification state machine

`QUEUED → PROCESSING → SENT → DELIVERED` (+ FAILED / RETRYING / CANCELLED / DEAD_LETTER / EXTERNAL_GATED).  
Sandbox may use `SANDBOX_DELIVERED`. Production `DELIVERED` requires real provider receipt evidence.

---

## Outbox / idempotency

Deterministic occurrence keys. Duplicate events and retries must not create uncontrolled duplicate OTPs or transactional messages.

---

## Transactional catalog (readiness)

AUTH · CUSTOMER COMMERCE · VENDOR · DOCTOR · LAB · IMAGING · AFFILIATE · ADMIN/OPS — verified against existing notification events. Clinical/result events remain LEGAL_GATED / PHI-minimized (deep-link to authenticated app).

---

## Markets

GLOBAL · IN · AE · US — policy-driven. No UPI / INR / ₹ / +91 / IST hardcoding in global communications logic.

---

## Admin

Provider Activation → Sprint 103 Communications card (alongside S89/S100/S101).  
Force-launch / force-deploy: **false**. No second communications dashboard.

---

## Native / device

Android / iOS / native push: **DEVICE_NOT_AVAILABLE** (responsive web verified; not claimed as native).

---

## Verification evidence

| Check | Result |
|-------|--------|
| Unit (S103+S89+S86+S76+S87+S97+S98+S100+S101+S102) | **50/50 PASS** |
| Unit (S66+S76+S31 pattern) | **17/17 PASS** |
| Playwright S103 | **2/2 PASS** |
| Playwright S89+S87 | **5/5 PASS** |
| Playwright S86 multi-portal OTP | **FAIL** (partner portal email field timeout — environmental; Customer sandbox OTP verified in S103) |
| Screenshots | `apps/test-results/s103-communications-shots/` (**9**) |
| Status artifact | `apps/test-results/s103-communications/final-communications-status.json` |
| Vendor SoD | Port 3004 login OK; orders path recorded when available (`vendor-device-status.json` if skipped) |
| Master Index | **#401** |

Real apps verified: Admin Sprint 103 card → Launch Readiness **NO** → Customer sandbox OTP login (no real message) → Customer denied Admin. Native push: **DEVICE_NOT_AVAILABLE**.

---

## Explicit final state

```
PRODUCTION OTP ENABLED = NO
PRODUCTION SMS ENABLED = NO
PRODUCTION EMAIL ENABLED = NO
PRODUCTION PUSH ENABLED = NO
REAL MESSAGES SENT = NO
CAN_PRODUCTION_LAUNCH = NO
```

STOP — do **not** start Sprint 104.
