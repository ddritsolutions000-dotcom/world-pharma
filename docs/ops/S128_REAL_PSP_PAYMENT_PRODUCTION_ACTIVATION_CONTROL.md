# Sprint 128 — Real PSP / Payment Production Activation Control

**Status:** COMPLETE (activation control)  
**Master Index:** #426  
**CAN_PRODUCTION_LAUNCH:** NO  

## Purpose

Operational readiness to activate **one** real PSP/payment provider when external credentials, merchant approval, webhook configuration, and production environment are actually available.

Does **not** invent or simulate production payment activation.

## Authoritative source

`apps/api/src/payment/psp-payment-production-activation-control.ts`

Composes S28/S44/S65/S85/S88/S102/**S120** + S110/S116–S119/S123/S124/S126/S127.

**No parallel** payment, webhook, settlement, or idempotency frameworks.

## Lifecycle separation (hard)

`NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED`

**PROVIDER CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ PRODUCTION ENABLED**

## Activation gates (Admin)

Every gate reports BLOCKED / READY / EXTERNAL_GATED / MISSING with reason + scope + evidence required:

- Provider selected
- Merchant / account identifier
- Production credential refs
- Webhook endpoint + signing secret refs
- Callback/return configuration
- Markets / currencies / methods
- Refund + capture/authorization capability
- Settlement / reconciliation
- Environment + secret-manager refs
- Production deployment target
- Security certification

**Final activation state:** BLOCKED  
**Production payment:** BLOCKED  
**Primary blocker:** `NO_PRODUCTION_PSP`

## Invariants preserved

- UNPAID ≠ PAID
- FAILED cannot become PAID without verified result
- Browser / client paid flag insufficient for fulfillment
- Mock success insufficient for production
- Unsigned / invalid / wrong-env webhooks denied
- Duplicate callbacks/settlements idempotent
- Sandbox credentials cannot satisfy production

## Customer money safety

Forged success, amount/currency tampering, cross-user intent, unauthorized refund, vendor arbitrary refund, SoD bypass → DENIED / BLOCKED / IDEMPOTENT as applicable.

## Global policy

Policy-pack driven. No hardcoded India / INR / ₹ / UPI / IST / GST / PAN.

## Admin surfaces

- Launch: “PSP production activation control (Sprint 128 — why can’t we enable PSP?)”
- Provider Activation: “Real PSP / payment production activation control (Sprint 128)”
- API: `GET /api/v1/admin/control-plane/psp-payment-production-activation-control`

## Sandbox vs production

| | Sandbox | Production |
|--|---------|------------|
| Mock PSP | Allowed | Forbidden |
| Payment journey | SANDBOX_VERIFIED | BLOCKED |
| Activation | Not ENABLED | EXTERNAL_GATED |

## Tests

| Suite | Result |
|-------|--------|
| Unit S128 | **4/4** |
| Playwright S128 | **3/3** |
| Regression S85/S88/S102/S110/S116–S120/S123/S124/S126–S128 | **69/69** |
| Native | **DEVICE_NOT_AVAILABLE** |
| Responsive | **390 / 768 / 1024 / 1440** |

Screenshots: `apps/test-results/s128-psp-activation-control-shots/` (**9**)

Status artifact: `apps/test-results/s128-psp-activation-control/s128-status.json`

## Files

**Created**

- `apps/api/src/payment/psp-payment-production-activation-control.ts`
- `apps/api/src/payment/s128-psp-payment-production-activation-control.spec.ts`
- `apps/web-customer/e2e/helpers/s128-ui.ts`
- `apps/web-customer/src/__tests__/s128-psp-activation-control.spec.ts`
- `docs/ops/S128_REAL_PSP_PAYMENT_PRODUCTION_ACTIVATION_CONTROL.md`

**Modified**

- `apps/api/src/platform/admin-control-plane.controller.ts`
- `apps/api/src/platform/admin-control-plane.service.ts`
- `apps/web-admin/src/provider-activation-api.ts`
- `apps/web-admin/src/production-launch-control-admin.tsx`
- `apps/web-admin/src/provider-activation-admin.tsx`
- `apps/web-customer/playwright.config.ts`
- `docs/blueprint/00_MASTER_INDEX.md` (#425 → #426)

## Remaining external inputs

1. Real PSP/acquirer contract + merchant approval  
2. Production API + credential refs (secret manager only)  
3. Webhook endpoint + signing-secret + callback/return refs  
4. Market/currency/method policy configuration  
5. Settlement/reconciliation configuration  
6. Human SoD verification + approval (R14-A)  
7. EXTERNAL_PENTEST_REQUIRED  
8. Production foundation/deployment target (S117–S119)

## Explicit claims NOT made

- Real PSP production-enabled
- Real money captured/refunded/settled
- Production launch possible

## STOP

Do **not** auto-start Sprint 129.
