# 271 — R14-A order refund status sync (CR-271)

**CR:** `CR-R14-A-ORDER-REFUND-STATUS-271`  
**Verdict:** **`R14_A_ORDER_REFUND_STATUS_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [270](270_R14_A_REFUND_LISTENER_VERIFICATION.md) (**R14_A_REFUND_LISTENER_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Provider-neutral engineering CR: consume `PAYMENT_REFUNDED` and synchronize linked commerce orders to `REFUNDED` or `PARTIALLY_REFUNDED`. **No live PSP. No human gate changes.**

---

## 1. Existing PAYMENT_REFUNDED flow (pre-CR-271)

| Step | Location | Behavior |
|------|----------|----------|
| Emission | `PaymentService.executeRefund()` | Enqueues `PAYMENT_REFUNDED` after successful gateway refund + DB writes |
| Payload | `payment.service.ts` | `{ amount_minor, currency, sandbox }` |
| Aggregate | Outbox row | `aggregateType: PaymentIntent`, `aggregateId: intent.id` |
| Occurrence key | Outbox | `payment-refunded:{refundId}` (unique per refund row) |
| Prior consumer | None | Event type registered in envelope schema only — **no listener before CR-271** |

End-to-end refund chain after CR-269/270:

```
OrderService.requestRefund → REFUND_PENDING
  → PAYMENT_REFUND_REQUESTED
  → PaymentRefundListenerService → PaymentService.refundFromEvent → executeRefund
  → PAYMENT_REFUNDED (outbox)
  → [CR-271] OrderPaymentRefundedListenerService → OrderService.syncRefundStatusFromPaymentEvent
  → Order REFUNDED | PARTIALLY_REFUNDED
```

---

## 2. Order state transition logic

| Payment state (post-refund) | Order target status |
|----------------------------|---------------------|
| `refundedMinor >= capturedMinor` (remaining ≤ 0) | `REFUNDED` |
| `refundedMinor > 0` and remainder > 0 | `PARTIALLY_REFUNDED` |

Implemented in `resolveOrderRefundStatusFromIntent()` (`refund-orchestration.ts`).

`OrderService.syncRefundStatusFromPaymentEvent()`:

- Validates envelope + country scope (payment + order vs envelope)
- No-op when no commerce order exists (lab/imaging payments)
- No-op when order already at target or `REFUNDED` (no regression)
- No-op when already `PARTIALLY_REFUNDED` and target remains partial
- Skips illegal transitions (order not in refund workflow) without mutating
- Uses existing private `transition()` → state machine + `ORDER_REFUNDED` outbox event
- Reason/occurrence key: `payment_refunded:{targetStatus}` (avoids duplicate outbox keys across partial→full)

---

## 3. Files created / modified

| File | Change |
|------|--------|
| `apps/api/src/orders/order-payment-refunded.listener.ts` | **Created** — canonical `PAYMENT_REFUNDED` consumer |
| `apps/api/src/orders/order-payment-refunded.listener.spec.ts` | **Created** — unit tests |
| `apps/api/src/orders/order-payment-refunded.listener.e2e.spec.ts` | **Created** — integration tests (1–10) |
| `apps/api/src/orders/order.service.ts` | `syncRefundStatusFromPaymentEvent()` |
| `apps/api/src/orders/order.module.ts` | Register listener service |
| `apps/api/src/payment/refund-orchestration.ts` | `resolveOrderRefundStatusFromIntent`, `parsePaymentRefundedEnvelope` |
| `apps/api/src/payment/refund-orchestration.spec.ts` | Status resolver + envelope tests |
| `docs/blueprint/271_R14_A_ORDER_REFUND_STATUS.md` | This record |
| `docs/blueprint/00_MASTER_INDEX.md` | Book 271 row |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R14-A order refund status |

**Migrations:** None

---

## 4. Idempotency / replay behavior

| Layer | Mechanism |
|-------|-----------|
| Handler delivery | `InboxService.tryBegin(consumer, eventId)` — one run per consumer per event |
| Duplicate same `PAYMENT_REFUNDED` event | Inbox skip on replay; order status unchanged |
| Already `REFUNDED` | Early return — never regress to `PARTIALLY_REFUNDED` |
| Partial then partial | Second event no-ops at order layer (already `PARTIALLY_REFUNDED`) |
| Partial then full | Transitions `PARTIALLY_REFUNDED` → `REFUNDED` with distinct outbox occurrence key |
| Per-refund events | Each refund emits unique `payment-refunded:{refundId}` outbox row |

---

## 5. Tenant / country safety

- Rejects envelope when `countryId` ≠ payment intent country
- Rejects envelope when `countryId` ≠ order country
- Missing payment intent → not-found error (worker fail/retry convention)
- No order for intent → safe no-op (non-commerce payments)

---

## 6. Tests executed (CR-271)

```bash
npx jest apps/api/src/orders/order-payment-refunded.listener.e2e.spec.ts --runInBand
npx jest apps/api/src/orders/order-payment-refunded.listener.spec.ts --runInBand
npx jest apps/api/src/payment/refund-orchestration.spec.ts --runInBand
npx jest apps/api/src/payment --runInBand
npx jest apps/api/src/orders/order.e2e.spec.ts apps/api/src/events/outbox.e2e.spec.ts --runInBand
npx jest apps/api/src/crm/r12a.crm-kernel.e2e.spec.ts apps/api/src/search/r13a.search-indexing.e2e.spec.ts --runInBand
npx nx run api:typecheck
npx nx run api:build
npx nx run web-customer:typecheck
```

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| Order refund status e2e | **10** | 0 | 0 |
| Order refund status unit | **2** | 0 | 0 |
| Refund orchestration spec | **10** | 0 | 0 |
| Full payment area | **62** (13 suites) | 0 | 0 |
| order.e2e + outbox.e2e | **7** (2 suites) | 0 | 0 |
| R12-A + R13-A regression | **7** (2 suites) | 0 | 0 |
| API typecheck | **PASS** | — | — |
| API build | **PASS** | — | — |
| web-customer typecheck | **PASS** | — | — |

**CR-271 focused total:** **22** tests passed. **Combined regression executed:** **98** Jest tests passed (62 payment + 10 order refund e2e + 7 order/outbox + 7 R12/R13 + overlapping orchestration/unit counted in focused).

E2E scenarios covered: full→REFUNDED, partial→PARTIALLY_REFUNDED, multiple partials, final→REFUNDED, duplicate idempotent, REFUNDED replay, missing payment fail-closed, country mismatch blocked, order refund request end-to-end, direct HTTP payment refund unchanged, CR-269 payment listener regression (within payment suite).

---

## 7. Runtime `/health/ready`

```json
{"status":"ready","postgres":"up","redis":"up","redis_version":"7.4.11","bullmq":"up"}
```

**HTTP 200** — API dev server from prior session; Postgres, Redis, BullMQ healthy. Startup registers `order_payment_refunded_listener_registered`.

---

## 8. Security / boundary verification

| Control | Status |
|---------|--------|
| `PAYMENT_LIVE_ENABLED` default off | **UNCHANGED** |
| `payments.enabled` fail-closed | **UNCHANGED** |
| `MOCK_*` forbidden in production | **UNCHANGED** |
| No PSP SDK / live adapter | **UNCHANGED** |
| No secrets committed | **UNCHANGED** |
| No production country pack | **UNCHANGED** |
| Clinical search disabled | **UNCHANGED** |
| Human gates not fabricated | **0/7** |
| Books 35 / 247 | **NOT modified** |

---

## 9. Code integrity

| Check | Result |
|-------|--------|
| Exactly one `PAYMENT_REFUNDED` listener | **PASS** — `OrderPaymentRefundedListenerService` only |
| No duplicate listener registration | **PASS** |
| Reuses `EventHandlerRegistry` + `InboxService` + `OrderService.transition` | **PASS** |
| No direct table manipulation from listener | **PASS** |
| CR-269 refund listener unchanged | **PASS** (62/62 payment tests) |

---

## 10. Defects found and fixed

| Defect | Fix |
|--------|-----|
| Duplicate outbox occurrence key when transitioning `PARTIALLY_REFUNDED` → `REFUNDED` (same `payment_refunded` reason) | Reason suffix includes target status: `payment_refunded:{REFUNDED\|PARTIALLY_REFUNDED}` |

---

## 11. Human-gate status

**0 / 7** — unchanged. **`CR-R14-A-IMPL-244` NOT authorized.**

---

## 12. Remaining R14-A engineering work

1. **End-to-end refund UX** — optional admin/customer surfaces for partial refund visibility
2. **Webhook reconciliation depth** for live PSP (blocked on human gates)
3. **Real PSP adapter** (blocked on human gates)
4. **Production routing activation** (blocked on human gates)

---

## 13. Exact next CR

**Engineering (recommended):** **`CR-R14-A-PAYMENT-WEBHOOK-RECON-272`** — deepen sandbox webhook idempotency / reconciliation hooks ahead of live PSP (provider-neutral; no human-gate audit loop).

**Parallel (human track):** Owner evidence via [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) → **`CR-R14-A-IMPL-244`** when gates evidenced.

---

## 14. Final verdict

**`R14_A_ORDER_REFUND_STATUS_COMPLETE`**

`PAYMENT_REFUNDED` now synchronizes commerce orders to `REFUNDED` / `PARTIALLY_REFUNDED` with idempotent, country-scoped, state-machine-safe behavior. Full payment and relevant regression green.
