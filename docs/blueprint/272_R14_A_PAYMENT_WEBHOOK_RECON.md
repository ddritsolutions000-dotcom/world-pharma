# 272 — R14-A payment webhook reconciliation (CR-272)

**CR:** `CR-R14-A-PAYMENT-WEBHOOK-RECON-272`  
**Verdict:** **`R14_A_PAYMENT_WEBHOOK_RECON_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [271](271_R14_A_ORDER_REFUND_STATUS.md) (**R14_A_ORDER_REFUND_STATUS_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Provider-neutral deepening of sandbox payment webhook idempotency and admin reconciliation. **No live PSP. No schema changes. No human gate changes.**

---

## 1. Existing architecture discovered (pre-CR-272)

| Component | Location | Behavior |
|-----------|----------|----------|
| Webhook endpoint | `PaymentWebhookController` `POST /api/v1/webhooks/payments/:gatewayId` | Raw body + HMAC headers → `PaymentService.ingestWebhook` |
| Webhook registry | `PaymentWebhookRegistry` | Maps gateway codes → `SandboxWebhookAdapter`; unknown codes fail closed |
| Sandbox adapter | `SandboxWebhookAdapter` | HMAC verify + optional timestamp skew + JSON parse |
| Event dedup | `PaymentWebhookEvent` | Unique `(gatewayId, providerEventId)` — P2002 → duplicate response |
| Signature | `hmac.ts` | `verifySandboxSignature` before mutation; timestamp optional (backward compatible) |
| Ingest flow | `PaymentService.ingestWebhook` | Verify → persist event → `applyStatus` via provider_ref lookup |
| State machine | `state-machine.ts` | Terminal intents (CAPTURED/FAILED/…) block regressions |
| Reconciliation | `PaymentService.reconcile` | Gateway `status()` → `applyStatus` + `PaymentReconciliation` row |
| Financial txn | `PaymentTransaction` | Created on capture/authorize in `applyStatus` |
| Outbox | `applyStatus` | Occurrence key `payment:{intentId}:{status}:{attemptId}` |

**Gap found:** webhook registry lacked `assertSandboxGatewayCode` (production MOCK rows not blocked at registry layer). Reconcile flagged `missing_transaction` before applying gateway truth for UNKNOWN intents. `applyStatus` could duplicate capture transactions on edge replays.

---

## 2. Code changes

### Created

| File | Purpose |
|------|---------|
| `apps/api/src/payment/webhook-orchestration.ts` | Shared webhook status mapping + `shouldApplyGatewayStatus` guard |
| `apps/api/src/payment/webhook-orchestration.spec.ts` | Unit tests |
| `apps/api/src/payment/payment-webhook-recon.e2e.spec.ts` | 18-scenario webhook/reconciliation e2e |

### Modified

| File | Change |
|------|--------|
| `apps/api/src/payment/payment.service.ts` | Reconcile idempotency; reconcile missing-txn guard fix; ingest uses `shouldApplyGatewayStatus`; `applyStatus` dedupes capture/auth txns; uses orchestration helpers |
| `apps/api/src/payment/webhook.registry.ts` | Added `assertSandboxGatewayCode` (align with payment gateway registry) |
| `apps/api/src/payment/webhook.registry.spec.ts` | Production MOCK forbidden test |
| `apps/api/src/payment/hmac.spec.ts` | Future timestamp rejection tests |

**Migrations:** None

---

## 3. Idempotency / replay behavior

| Layer | Mechanism |
|-------|-----------|
| Webhook event | `PaymentWebhookEvent` unique `(gatewayId, providerEventId)` → `{ duplicate: true }` |
| Same payload, new event_id | `applyStatus` early return when status unchanged; capture txn dedup by `(intentId, attemptId, kind)` |
| Stale/illegal webhook | `shouldApplyGatewayStatus` skips regressions; illegal transitions swallowed in ingest |
| Reconciliation repeat | If intent status matches gateway + prior MATCHED row → `{ duplicate: true }`, no new side effects |
| Outbox | Occurrence keys unchanged — no duplicate events for same transition |

---

## 4. Reconciliation behavior

- Uses canonical `PaymentGatewayRegistry.resolve` + `PaymentGatewayPort.status` + `applyStatus`
- UNKNOWN intents with gateway truth `captured` no longer false-BREAK on `missing_transaction` (only breaks when intent already CAPTURED/AUTHORIZED without ledger txn)
- Repeated reconcile returns `duplicate: true` without extra reconciliation rows or transactions
- Unknown gateway routing → `UNKNOWN_PAYMENT_GATEWAY` (409)
- Admin permission `payment:reconcile` required

---

## 5. Security verification

| Control | Status |
|---------|--------|
| HMAC before mutation | **VERIFIED** |
| Timestamp skew (300s) when supplied | **VERIFIED** |
| Missing timestamp accepted (sandbox contract) | **VERIFIED** |
| No PAN/CVV in payment sources | **VERIFIED** (`pci.spec.ts`) |
| Payload stored as HMAC cipher only | **UNCHANGED** |
| Production MOCK webhook forbidden | **FIXED + VERIFIED** |
| `PAYMENT_LIVE_ENABLED` default off | **UNCHANGED** |
| `payments.enabled` fail-closed | **UNCHANGED** |
| Human gates | **0/7 unchanged** |
| Books 35 / 247 | **NOT modified** |

---

## 6. Tests executed (CR-272)

```bash
npx jest apps/api/src/payment/payment-webhook-recon.e2e.spec.ts --runInBand
npx jest apps/api/src/payment/webhook-orchestration.spec.ts --runInBand
npx jest apps/api/src/payment/webhook.registry.spec.ts --runInBand
npx jest apps/api/src/payment/hmac.spec.ts --runInBand
npx jest apps/api/src/payment --runInBand
npx jest apps/api/src/payment/payment-refund.listener.e2e.spec.ts apps/api/src/orders/order-payment-refunded.listener.e2e.spec.ts --runInBand
npx jest apps/api/src/orders/order.e2e.spec.ts apps/api/src/events/outbox.e2e.spec.ts --runInBand
npx jest apps/api/src/crm/r12a.crm-kernel.e2e.spec.ts apps/api/src/search/r13a.search-indexing.e2e.spec.ts --runInBand
npx nx run api:typecheck
npx nx run api:build
npx nx run web-customer:typecheck
npx nx run web-admin:typecheck
```

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| Webhook recon e2e | **18** | 0 | 0 |
| Webhook orchestration unit | **4** | 0 | 0 |
| Webhook registry unit | **4** | 0 | 0 |
| HMAC unit | **6** | 0 | 0 |
| Full payment area (15 suites) | **87** | 0 | 0 |
| CR-270 refund listener e2e | **10** | 0 | 0 |
| CR-271 order refund status e2e | **10** | 0 | 0 |
| order.e2e + outbox.e2e | **7** | 0 | 0 |
| R12-A + R13-A regression | **7** | 0 | 0 |
| API typecheck / build | **PASS** | — | — |
| web-customer / web-admin typecheck | **PASS** | — | — |

**CR-272 focused:** 32 tests. **Payment regression:** 87/87 pass.

E2E scenarios: valid webhook, duplicate event_id, equivalent payload dedup, invalid/missing signature, valid/expired/future/missing timestamp, stale regression block, illegal transition, out-of-order auth→capture, unknown gateway, production MOCK rejection, reconcile success/idempotent/unknown gateway/permission denied, unknown provider_ref safe ingest.

---

## 7. Database / migrations

- `worldpharma`: **128/128** applied
- `worldpharma_test`: **128/128** applied
- **No migrations** run during CR-272

---

## 8. Runtime `/health/ready`

```json
{"status":"ready","postgres":"up","redis":"up","redis_version":"7.4.11","bullmq":"up"}
```

**HTTP 200**

---

## 9. Defects found and fixed

| Defect | Fix |
|--------|-----|
| `PaymentWebhookRegistry` allowed production MOCK environment rows | Added `assertSandboxGatewayCode` |
| Reconcile false `missing_transaction` BREAK for UNKNOWN intents behind gateway | Only break when intent already CAPTURED/AUTHORIZED without txn |
| `applyStatus` could duplicate capture/authorization transactions | Dedup by `(intentId, attemptId, kind)` before insert |
| Repeated reconcile created redundant MATCHED rows | Return `{ duplicate: true }` when status already aligned |

---

## 10. Human-gate status

**0 / 7** — unchanged. **`CR-R14-A-IMPL-244` NOT authorized.**

---

## 11. Remaining R14-A engineering work

1. Admin/customer payment status UX surfaces (optional)
2. Real PSP webhook adapter scaffold (blocked on human gates)
3. Production routing activation (blocked on human gates)

---

## 12. Exact next CR

**Engineering (recommended):** **`CR-R14-A-PAYMENT-ADMIN-OBSERVABILITY-273`** — sandbox payment admin observability (unknown queue, reconciliation breaks, webhook event audit views) without live PSP.

**Parallel (human track):** Owner evidence via [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) → **`CR-R14-A-IMPL-244`** when gates evidenced.

---

## 13. Final verdict

**`R14_A_PAYMENT_WEBHOOK_RECON_COMPLETE`**

Sandbox webhook ingestion and admin reconciliation are idempotent, stale-safe, and state-machine consistent. Full payment regression green (87/87). CR-270/271 listeners remain green.
