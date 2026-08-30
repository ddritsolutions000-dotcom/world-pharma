# 269 — R14-A refund listener implementation (CR-269)

**CR:** `CR-R14-A-REFUND-LISTENER-269`  
**Verdict:** **`R14_A_REFUND_LISTENER_COMPLETE`** (verified by [270](270_R14_A_REFUND_LISTENER_VERIFICATION.md); was PARTIAL pending DB)  
**Date:** 30 August 2026  
**Prior foundation:** [268](268_R14_A_ENGINEERING_FOUNDATION.md)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval

Wired `PAYMENT_REFUND_REQUESTED` → `PaymentService.refundFromEvent` → `PaymentGatewayRegistry` → `PaymentGatewayPort`. **No live PSP. No human gate changes.**

---

## 1. Executive summary

Implemented the sandbox refund event consumer requested by CR-268:

- `PaymentRefundListenerService` registers on `EventHandlerRegistry` for `PAYMENT_REFUND_REQUESTED`
- `PaymentService.refundFromEvent()` validates envelope, enforces country/order/payment linkage, and executes refund via existing gateway registry path
- Refund execution extracted to `executeRefund()` shared with HTTP `refund()` API
- Idempotency key: `payment-refund-requested:{orderId}:{paymentIntentId}` (matches outbox occurrence key pattern)
- Inbox dedup + idempotency records prevent duplicate financial effects on redelivery

**Production activation remains DISABLED.**

---

## 2. Event flow

### Before CR-269

```
OrderService.requestRefund
  → ORDER_REFUND_PENDING outbox event
  → PAYMENT_REFUND_REQUESTED outbox event
  → (no consumer — payment refund not executed)
```

### After CR-269

```
OrderService.requestRefund
  → ORDER_REFUND_PENDING
  → PAYMENT_REFUND_REQUESTED (outbox)
  → EventWorkerService.handle
  → PaymentRefundListenerService.handle
  → PaymentService.refundFromEvent
  → PaymentService.refund (admin) / executeRefund
  → PaymentGatewayRegistry.resolve
  → PaymentGatewayPort.refund
  → PAYMENT_REFUNDED outbox event
```

Direct HTTP refund API unchanged: `POST /me/payments/intents/:id/refund` → `PaymentService.refund`.

---

## 3. Files changed

| File | Change |
|------|--------|
| `apps/api/src/payment/payment-refund.listener.ts` | **Created** — event consumer |
| `apps/api/src/payment/payment-refund.listener.spec.ts` | **Created** — unit tests |
| `apps/api/src/payment/payment-refund.listener.e2e.spec.ts` | **Created** — integration tests (A–L) |
| `apps/api/src/payment/payment.service.ts` | `refundFromEvent`, `executeRefund` extraction |
| `apps/api/src/payment/refund-orchestration.ts` | `parseRefundRequestedEnvelope` |
| `apps/api/src/payment/refund-orchestration.spec.ts` | Envelope parse tests |
| `apps/api/src/payment/payment.module.ts` | Register listener service |

**Migrations:** None

---

## 4. Idempotency behavior

| Layer | Mechanism |
|-------|-----------|
| Outbox enqueue | Unique `(aggregateId, type, occurrenceKey)` |
| Handler delivery | `InboxService.tryBegin(consumer, eventId)` — one handler run per event |
| Financial refund | `IdempotencyRecord(personId, key)` + `Refund.idempotencyKey` unique |
| Already refunded | Early return when `capturedMinor - refundedMinor <= 0` |
| COD orders | Listener no-op (no CARD gateway refund) |

---

## 5. State-machine behavior

- Only `CAPTURED` CARD payments are refunded via listener
- Invalid states throw `PAYMENT_NOT_REFUNDABLE` — worker retries per outbox convention, then dead-letters
- HTTP refund path unchanged — same `executeRefund` core
- Gateway resolution uses frozen attempt `routingJson` — production MOCK rejected by registry guards

---

## 6. Security checks

| Check | Status |
|-------|--------|
| No secrets committed | **PASS** |
| No PSP SDK added | **PASS** |
| Country scope validated (order + intent vs envelope) | **PASS** |
| Order↔payment link validated | **PASS** |
| No direct MockPaymentGatewayAdapter in listener | **PASS** |
| Human gates unchanged | **PASS** |
| Single canonical refund execution path (`executeRefund`) | **PASS** |
| Single PAYMENT_REFUND_REQUESTED handler registration | **PASS** |

---

## 7. Tests

| Suite | Status | Notes |
|-------|--------|-------|
| API typecheck | **PASS** | |
| API build | **PASS** | |
| `refund-orchestration.spec.ts` | **BLOCKED** | Postgres `127.0.0.1:55432` unreachable; Docker Desktop not running |
| `payment-refund.listener.spec.ts` | **BLOCKED** | Same global Jest setup dependency |
| `payment-refund.listener.e2e.spec.ts` (10 cases A–L) | **BLOCKED** | Requires Postgres + Redis |
| Full payment suite (prior CR-268 baseline) | **44 / 44 PASS** | When DB available |

**Test environment blocker:** `docker compose up -d` failed — Docker Desktop Linux engine pipe not available.

---

## 8. Human-gate status

Unchanged **0 / 7**. Book 35 and Book 247 not modified.

---

## 9. Production safety verification

| Control | Status |
|---------|--------|
| `PAYMENT_LIVE_ENABLED` default false | **UNCHANGED** |
| `payments.enabled` policy default false | **UNCHANGED** |
| MOCK_* production forbidden | **UNCHANGED** |
| No production country pack | **UNCHANGED** |
| No real PSP SDK | **UNCHANGED** |
| `clinical_search_enabled` false | **UNCHANGED** |

---

## 10. Remaining R14-A engineering work

1. Re-run integration tests when Postgres/Redis available
2. Optional: sync order status to `REFUNDED`/`PARTIALLY_REFUNDED` after `PAYMENT_REFUNDED`
3. Real PSP adapter (blocked on human gates)
4. Production routing activation (blocked on human gates)

---

## 11. Exact next CR

**`CR-R14-A-REFUND-LISTENER-VERIFY-270`** — Re-run payment + refund-listener test suites when Docker/Postgres is available; target **`R14_A_REFUND_LISTENER_COMPLETE`**

**Parallel (human track):** Owner supplies gate evidence via [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md)

**After listener verified + human gates:** **`CR-R14-A-IMPL-244`**

---

## 12. Final verdict

**`R14_A_REFUND_LISTENER_COMPLETE`** — verified in [270](270_R14_A_REFUND_LISTENER_VERIFICATION.md).

Listener implementation complete; all integration/regression tests passed with Postgres/Redis available (58/58 payment, 10/10 listener e2e).
