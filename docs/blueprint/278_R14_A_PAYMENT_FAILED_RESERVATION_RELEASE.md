# 278 — R14-A payment failed reservation release (CR-278)

**CR:** `CR-R14-A-PAYMENT-FAILED-RESERVATION-RELEASE-278`  
**Verdict:** **`R14_A_PAYMENT_FAILED_RESERVATION_RELEASE_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [277](277_R14_A_PAYMENT_FAILED_ATTEMPT_AUDIT.md) (**R14_A_PAYMENT_FAILED_ATTEMPT_AUDIT_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Release checkout inventory reservations when all gateways reject before submit (`409 PAYMENT_FAILED`), so repeated failed payment attempts cannot permanently hold stock. **No live PSP. No new payment kernel. No human gate changes.**

---

## 1. Reproduced root cause

| Symptom | `POST /me/checkout/sessions/:id/pay` with `pre_submit_fail_all` → **409**; `InventoryReservation` rows stay **`OPEN`**; `checkout_sessions.reservation_ids` unchanged |
|---------|---|
| Path | Quote auto-reserves (`cart.service` → `inventory.reserveForCheckout`) → pay → gateway loop → CR-277 `persistAllPreSubmitFailure()` (fresh tx) → HTTP tenant tx rollback → throw `409` |
| Why | CR-277 audit persist runs in `{ fresh: true }` tx and survives rollback; reservation create/update ran in the rolled-back HTTP tx but **no compensating release** existed |
| Impact | Each failed pay leaves an `OPEN` hold; with low stock (qty=1) or many retries, `availableUnits` drops to zero and other customers cannot checkout — oversell prevention blocks legitimate sales |

Observed during CR-277 e2e (needed qty=5000 to avoid exhaustion across repeated failure tests).

---

## 2. Reservation lifecycle

```
checkout session create
  → auto-quote
  → reserveForCheckout (OPEN reservation, lot balance reserved++)
  → pay
  → prepareCheckoutPayment / gateway failover
  → all pre-submit fail
  → persistAllPreSubmitFailure (fresh autonomous tx):
       1. releaseCheckoutReservationsForPaymentFailure
       2. persistPreSubmitFailureAudit (CR-277)
  → HTTP tx rollback
  → throw 409 PAYMENT_FAILED
```

| Stage | Reservation state | Lot `reserved` |
|-------|-------------------|----------------|
| After quote | `OPEN` | incremented |
| After pre-submit fail (CR-278) | `RELEASED` | decremented (idempotent clamp) |
| After capture (unchanged) | consumed via order path | decremented via fulfillment |

---

## 3. Transaction-boundary decision

**Same pattern as CR-277:** release must run in **`runWithTenant(..., { fresh: true })`** inside `persistAllPreSubmitFailure()`, **before** audit persist, in **one** fresh `$transaction`.

| Alternative | Why rejected |
|-------------|--------------|
| Release inside HTTP tenant tx | Rolls back with payment failure throw — no effect |
| Async outbox-only release | Failure could lose release if consumer lag; harder to reason about idempotency with audit |
| Checkout-expiry job | Too slow; repeated failures exhaust stock before TTL |

Direct transactional compensation in the fresh tx is the smallest correct design: audit + release commit atomically; HTTP tx rollback cannot undo them.

---

## 4. Release mechanism

### `checkout-reservation-release.ts`

- Loads checkout session; validates `customerPersonId` + `countryId` (tenant/country scope)
- Skips when `skipInventoryHold` (Rx handoff path unchanged)
- For each `reservationIds` entry: if `OPEN`, calls existing `releaseReservation` kernel with idempotency key `payment-failed:{paymentIntentId}:{reservationId}`
- Clears `checkoutSession.reservationIds`
- Enqueues `CHECKOUT_PAYMENT_FAILED_RESERVATION_RELEASED` outbox event (occurrence key includes payment intent id)
- Returns `{ status: 'released' | 'already_released' | 'none', released_reservation_ids }`

### Payment integration (`payment.service.ts`)

`persistAllPreSubmitFailure()` order:

1. `inventory.releaseCheckoutReservationsForPaymentFailure(tx, …)` when `checkoutSessionId` present
2. `persistPreSubmitFailureAudit()` with `reservation_release` + `released_reservation_ids` merged into failure payload

Lab/imaging pre-submit failures unchanged (no checkout reservation).

---

## 5. Cases — release vs keep

| Case | Release? |
|------|----------|
| All pre-submit fail (`409 PAYMENT_FAILED`) | **Yes** |
| Primary fail + fallback success | **No** |
| Submitted gateway failure (`FAILED`, reservation kept for retry) | **No** |
| `UNKNOWN` / timeout (in-flight) | **No** |
| `CAPTURED` / CR-276 pay guard replay | **No** |
| `REQUIRES_ACTION` / authorized | **No** |
| COD checkout | Unchanged (no soft-reserve path) |
| Already `RELEASED` / `EXPIRED` reservation | Safe no-op (`already_released`) |
| Replay / duplicate failure persist | Idempotent release keys + OPEN-only loop |

---

## 6. Idempotency & inventory integrity

- Release uses existing `releaseReservation` inventory kernel (CR-275 clamp — reserved never negative)
- Idempotency key per `(paymentIntentId, reservationId)` prevents double decrement
- Cross-customer and cross-country blocked with **403**
- Wrong checkout linkage prevented by loading session from intent's `checkoutSessionId`
- No capture transaction, order, settlement, or refund side effects
- RLS / FORCE RLS unchanged; GRN-based inventory path unchanged

---

## 7. CR-277 compatibility

After CR-278, a pre-submit checkout failure has:

| Artifact | State |
|----------|-------|
| `PaymentIntent` | `FAILED` (durable, fresh tx) |
| `PaymentAttempt`(s) | `FAILED`, `submitted: false` |
| Admin observability | `failure_outcome: PRE_SUBMIT_FAILURE` |
| Failure payload | `reservation_release`, `released_reservation_ids` |
| Reservations | `RELEASED`; session `reservation_ids` cleared |
| Outbox | `PAYMENT_FAILED` + `CHECKOUT_PAYMENT_FAILED_RESERVATION_RELEASED` |

---

## 8. Code changes

| File | Change |
|------|--------|
| `checkout-reservation-release.ts` | Release helper + outbox event |
| `checkout-reservation-release.spec.ts` | Unit tests (5) |
| `inventory.service.ts` | `releaseCheckoutReservationsForPaymentFailure()` wrapper |
| `payment.module.ts` | Import `InventoryModule` |
| `payment.service.ts` | Release before audit in `persistAllPreSubmitFailure()` |
| `payment-failed-reservation-release.e2e.spec.ts` | 16 shared + qty=1 isolated runtime scenarios |

**Migration:** none (head remains **134**).

---

## 9. Tests

### Focused (17 tests)

- Pre-submit failure releases reservation; lot balance restored
- Second customer can reserve after failure
- Repeated failure does not double-release or negative reserved
- Failover success keeps reservation through capture
- UNKNOWN / in-flight keeps reservation
- Captured + duplicate pay unchanged (CR-276)
- Retry after FAILED with fresh session works
- Expired reservation safe no-op
- No capture tx / order on release
- CR-277 audit durable + outbox release event
- Submitted gateway failure → retry success keeps reservation until capture
- **qty=1 isolated runtime:** A holds → B blocked (409 cart add) → A fail → B checkout succeeds

### Full payment suite

**197 / 197 PASS** (includes CR-275…277 regressions).

### Other regression

| Suite | Result |
|-------|--------|
| cart e2e | PASS |
| order e2e | PASS (retry after flaky timeout in batch run) |
| inventory e2e | PASS |
| outbox e2e | PASS |
| API typecheck | PASS |
| API build | PASS |

---

## 10. Runtime verification

| Check | Result |
|-------|--------|
| Postgres / Redis | Healthy (test + local dev) |
| `GET /health/ready` | **HTTP 200** (`http://127.0.0.1:4000/health/ready`) |
| qty=1 scenario | Verified in isolated e2e (`country F1`, GRN seed qty=1) |

---

## 11. Security

- No PAN/CVV/secrets in release payload or observability fields
- RLS / FORCE RLS unchanged
- Tenant + country isolation on release (403 on mismatch)
- `PAYMENT_LIVE_ENABLED` off; production routing/country packs disabled
- MOCK_* production guard unchanged

---

## 12. Human gates

**0/7 — unchanged.** `CR-R14-A-IMPL-244` **NOT authorized** from this CR.

---

## 13. Remaining R14-A engineering gaps

| Priority | Track |
|----------|-------|
| R14-B reconciliation | Next major R14 track per [242](242_R14_IMPLEMENTATION_PLAN.md) — sandbox reconciliation depth |
| Human track (parallel) | Owner evidence [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) → `CR-R14-A-IMPL-244` when 7/7 gates evidenced |

**No new engineering CR auto-created.** R14-A checkout/payment kernel gaps through CR-279 are closed pending fresh code audit.

---

## 14. Verdict rationale

**`R14_A_PAYMENT_FAILED_RESERVATION_RELEASE_COMPLETE`** because:

- Root cause reproduced with Postgres-backed e2e
- Release runs in correct fresh-tx boundary with CR-277 audit
- qty=1 fail → release → second customer scenario verified
- Idempotency, failover, in-flight, and capture paths preserved
- Full payment suite 197/197 green; typecheck/build green
- Migration head 134 unchanged; runtime health 200
