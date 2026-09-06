# Sprint 120 — Real PSP / Payment Activation Preparation + Payment Production Gate

**Status:** COMPLETE (activation preparation — no live PSP / no real money)  
**Master Index:** #418  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  

| Plane | State |
|-------|--------|
| PSP lifecycle | **NOT_SELECTED** |
| Production credentials | **MISSING** |
| Webhook | **NOT_CONFIGURED** |
| Verification | **NOT_VERIFIED** |
| Approval | **NOT_APPROVED** |
| Enablement | **EXTERNAL_GATED** |
| Production payment | **BLOCKED** |
| Sandbox payment | **SANDBOX_VERIFIED** |

**Security statement:** S88 lifecycle reused — no second PSP framework. Existing gateway/webhook/idempotency/refund architecture retained. Unsigned webhooks rejected. NO CAPTURE → NO PAID ORDER. Mock forbidden in production.

## Goal

Prepare existing payment architecture so a **real** PSP account + credentials + webhooks can later activate by **configuration**, without rewriting commerce/payment code.

## Authoritative source

`apps/api/src/payment/psp-payment-activation-preparation.ts` composes:

| Plane | Module |
|-------|--------|
| PSP lifecycle | **S88** `NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED` |
| Real activation prep | S102 |
| Gateway / SM / webhooks / idempotency | S28/S44 existing |
| Security | S116 |
| Foundation / release / deploy | S117–S119 |
| Launch control | S87 |

## Configuration references (no secret values)

Provider, endpoint, merchant, public/secret key refs, webhook endpoint/signing secret, methods, currencies, markets, refund/capture mode, idempotency, reconciliation, environment identity.

## Fail-closed

Production initiation blocked when NOT_SELECTED / NOT_CONFIGURED / NOT_VERIFIED / EXTERNAL_GATED. No mock fallback in production. Sandbox mock remains allowed in sandbox.

## External inputs still required

Real PSP contract, merchant account, credential + webhook refs in secrets manager, market/currency config, human approval, security certification, production foundation (S117–S119).

## Admin

- Launch readiness: “why can’t we take payments?” (S120)
- Provider activation: Sprint 120 card
- API: `GET /api/v1/admin/control-plane/psp-payment-activation-preparation`

## Tests

| Suite | Result |
|-------|--------|
| Unit S120 | **5/5** |
| Playwright S120 | **3/3** |
| Regression S85+S88+S102+S116–S119+S120 | **43/43** |
| Screenshots | `apps/test-results/s120-psp-shots/` (**8**) |
| Responsive | 390 / 768 / 1024 / 1440 |
| Native | **DEVICE_NOT_AVAILABLE** |

## STOP

Sprint 120 complete. Do **not** invent a PSP. Do **not** process real money. Do **not** auto-start Sprint 121.
