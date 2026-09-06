# WORLD_PHARMA_S132 — Real PSP / Payment Production Activation

**Status:** COMPLETE (software activation path)  
**Master Index:** #428  
**CAN_PRODUCTION_LAUNCH:** NO  
**Production PSP:** EXTERNAL_GATED / BLOCKED (`NO_PRODUCTION_PSP`)  
**Real money processed:** NO  

## Implementation completed

Sprint 132 completes the **software-side production PSP activation path** on top of existing payment systems. Production remains **fail-closed** until genuine PSP credentials, secrets-manager resolution, a non-mock gateway adapter, human verification/approval, and live gates exist.

### Reused (not duplicated)

| Component | Source |
| --- | --- |
| Payment intents / submit | `payment.service.ts` (S28+) |
| State machine | `state-machine.ts` |
| Webhooks / idempotency | `ingestWebhook`, `PaymentWebhookRegistry`, sandbox HMAC |
| Refunds | existing refund orchestration |
| Reconciliation | existing payment recon |
| Production gate | `production-payment-gate.ts` (S44) |
| Enablement guard / lifecycle | `psp-first-onboarding.ts` (S88) |
| Config slots / prep | `psp-payment-activation-preparation.ts` (S120) |
| Activation control report | `psp-payment-production-activation-control.ts` (S128) |
| Secret **references** | env refs via `payment.config` / `production-psp-requirements` |

**S131 secrets-manager runtime resolver:** not present in repo → reported `MISSING`. No vault invented.

### New / extended

1. **`psp-payment-production-activation-path.ts` (S132)**  
   - Live configuration reference inventory (presence only; never secret values)  
   - Lifecycle derivation: `NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED`  
   - CONFIGURED only when provider + required refs present  
   - VERIFIED/APPROVED only via explicit human status env markers (never inferred from refs alone)  
   - ENABLED remains **false** until non-mock adapter + live gates (adapter still not registered)  
   - `assertProductionPspInitiationAllowed` / `assertProductionPspWebhookIngestAllowed`  
   - Client forged success rejection  
   - Illegal transition inventory  
   - Production webhook negative cases  

2. **`payment.service.ts`** — production initiate + webhook call S132 fail-closed asserts (mock gateway blocked in production).  

3. **Admin** — `GET /api/v1/admin/control-plane/psp-payment-production-activation-path`  
   Existing Launch + Provider PSP cards show S132 path badges (same surface; no second dashboard).  
   S128 control report embeds `s132_activation_path`.

## Files changed

- `apps/api/src/payment/psp-payment-production-activation-path.ts` (new)
- `apps/api/src/payment/s132-psp-payment-production-activation-path.spec.ts` (new)
- `apps/api/src/payment/payment.service.ts`
- `apps/api/src/payment/psp-payment-production-activation-control.ts`
- `apps/api/src/platform/admin-control-plane.controller.ts`
- `apps/api/src/platform/admin-control-plane.service.ts`
- `apps/web-admin/src/provider-activation-api.ts`
- `apps/web-admin/src/provider-activation-admin.tsx`
- `apps/web-admin/src/production-launch-control-admin.tsx`
- `apps/web-customer/src/__tests__/s132-psp-activation-path.spec.ts` (new)
- `docs/blueprint/WORLD_PHARMA_S132_REAL_PSP_PAYMENT_ACTIVATION.md` (this file)
- `docs/blueprint/00_MASTER_INDEX.md`

## Tests

```text
npx nx test api --testPathPattern=s132-psp-payment-production-activation-path
npx nx test api --testPathPattern=s128-psp-payment-production-activation-control
```

Expected: S132 unit cases PASS; S128 regression still PASS with `s132_activation_path` composed.

**Actual results (this sprint):**
- S132 + S128 unit: **14/14 PASS**
- Related regression (`state-machine`, `payment.config`, `s120-psp-payment-activation-preparation`): **25/25 PASS**

Covered: production without PSP · mock rejected · refs→CONFIGURED without auto-enable · forged client success · illegal transitions · webhook negatives · secret non-leak · S128 compose.

## Actual PSP status

| Field | Value |
| --- | --- |
| Provider | NOT_SELECTED (no real credentials in env) |
| Software activation path | COMPLETE |
| Lifecycle | NOT_SELECTED / EXTERNAL_GATED (CONFIGURED only if refs supplied) |
| Production enabled | false |
| Production payment | BLOCKED |
| Webhook production ready | false |
| Secrets manager runtime | MISSING |
| Sandbox mock payments | still available when `PAYMENT_ENVIRONMENT=sandbox` |

## External blocker

**NO_PRODUCTION_PSP** — requires real PSP/acquirer selection, merchant account, secret-manager-backed credential + webhook signing refs, non-mock `PaymentGatewayPort` adapter, human verification + approval, `PAYMENT_LIVE_ENABLED` + production env, deployment/security gates. Do not invent credentials.

STOP — do not auto-start the next sprint.
