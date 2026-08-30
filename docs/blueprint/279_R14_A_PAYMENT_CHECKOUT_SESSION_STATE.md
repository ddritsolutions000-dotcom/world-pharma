# 279 — R14-A payment checkout session state (CR-279)

**CR:** `CR-R14-A-PAYMENT-CHECKOUT-SESSION-STATE-279`  
**Verdict:** **`R14_A_PAYMENT_CHECKOUT_SESSION_STATE_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [278](278_R14_A_PAYMENT_FAILED_RESERVATION_RELEASE.md) (**R14_A_PAYMENT_FAILED_RESERVATION_RELEASE_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Align `CheckoutSession.status` with terminal payment outcomes while preserving pay-guard, failed-attempt audit, reservation release, refund sync, and retry semantics. **No live PSP. No human gate changes.**

---

## 1. Original defect

| Symptom | After `CAPTURED` or pre-submit `409 PAYMENT_FAILED`, checkout session stayed **`READY_FOR_PAYMENT`** |
|---------|---|
| Impact | Session state did not reflect paid or retryable-failed lifecycle; observability and client UX misleading |
| Pay guard (CR-276) | Still blocked duplicate capture via `PaymentIntent` — but checkout row looked unpaid |

---

## 2. Existing state machine (schema)

`CheckoutStatus` enum (migration `20260826230000_cart_checkout` + CR-279):

| Status | Meaning |
|--------|---------|
| `VALIDATING` | Session created |
| `QUOTED` | Quote frozen |
| `REVALIDATION_REQUIRED` | Cart/price changed |
| `READY_FOR_PAYMENT` | Quoted + holds (payable / in-flight) |
| **`PAID`** | **CR-279 — terminal successful payment** |
| `FAILED` | Pre-submit permanent failure (retryable) |
| `EXPIRED` / `CANCELLED` | Terminal non-payment |

No separate `REQUIRES_ACTION` checkout status — in-flight payments keep `READY_FOR_PAYMENT` (payment intent carries `REQUIRES_ACTION` / `UNKNOWN`).

---

## 3. Chosen state mapping

| Payment outcome | Checkout transition | Reservation |
|-----------------|----------------------|-------------|
| `CAPTURED` / `AUTHORIZED_COD` | → **`PAID`** | Consumed on order (unchanged) |
| All pre-submit fail (CR-277/278) | → **`FAILED`** | Released (CR-278) |
| Submitted gateway `FAILED` (retry path) | **unchanged** `READY_FOR_PAYMENT` | Kept for retry |
| `CREATED` / `PROCESSING` / `UNKNOWN` / `REQUIRES_ACTION` / `AUTHORIZED` | **unchanged** `READY_FOR_PAYMENT` | Unchanged |
| `PAYMENT_REFUNDED` (CR-270/271) | **unchanged** `PAID` | Order refund sync only |
| Re-quote after `FAILED` | → `READY_FOR_PAYMENT` (existing cart quote path) | Re-open hold (see §6) |

**Retry:** `isCheckoutSessionPayable()` allows `READY_FOR_PAYMENT`, `QUOTED`, `FAILED`, and `PAID` (idempotent pay replay). CR-276 pay guard unchanged.

**No regression:** `PAID` never transitions back to `FAILED`.

---

## 4. Transaction / event design

Direct transactional updates (same boundary as payment side effects) — **not** a parallel listener:

| Trigger | Location | Tx |
|---------|----------|-----|
| Capture / COD success | `PaymentService.applyStatus()` + COD path | Same `$transaction` as intent update + `PAYMENT_CAPTURED` outbox |
| Pre-submit failure | `PaymentService.persistAllPreSubmitFailure()` | Same fresh tx as CR-277 audit + CR-278 release |

Helper: `cart/checkout-session-state.ts` → `applyCheckoutSessionPaymentOutcome()`

- Validates customer + country scope (403 on mismatch)
- Idempotent: no-op if already at target or `PAID` when failure arrives
- Emits `CHECKOUT_SESSION_PAID` outbox (occurrence key `checkout-session-paid:{paymentIntentId}`) once on transition to `PAID`

Does **not** duplicate `PAYMENT_CAPTURED` semantics — checkout-specific terminal marker only.

---

## 5. Re-quote after released hold (CR-278 interaction)

**Bug found during CR-279 runtime test:** `reserveForCheckout` returned **RELEASED** rows by idempotency key on re-quote, causing `RESERVATION_UNAVAILABLE` on retry pay.

**Fix (`inventory.service.ts`):** When idempotency key matches a `RELEASED` / `EXPIRED` / `CANCELLED` checkout hold, **re-open** the row with a fresh lot pick and `checkout_requote` movement instead of returning stale status.

---

## 6. Code changes

| File | Change |
|------|--------|
| `migrations/20260830180000_r14a_checkout_status_paid` | Add `PAID` to `CheckoutStatus` |
| `cart/checkout-session-state.ts` | Mapping + apply helper + `isCheckoutSessionPayable()` |
| `cart/checkout-session-state.spec.ts` | Unit tests (7) |
| `payment.service.ts` | Wire capture/COD/pre-submit paths; pay eligibility |
| `inventory.service.ts` | Re-open released checkout holds on re-quote |
| `events/envelope.ts` | `CHECKOUT_SESSION_PAID` |
| `payment-checkout-session-state.e2e.spec.ts` | 8 e2e scenarios |

**Migration head:** **135**

---

## 7. Tests

### Focused (15 unit + e2e)

- READY_FOR_PAYMENT → PAID on capture; CHECKOUT_SESSION_PAID outbox
- Pre-submit fail → FAILED + CR-278 release
- UNKNOWN / REQUIRES_ACTION stay READY_FOR_PAYMENT
- Submitted gateway fail → retry → PAID
- FAILED → requote → pay success → PAID
- Duplicate capture idempotent; refund leaves PAID
- Cross-customer/country blocked (unit)

### Full payment suite

**205 / 205 PASS**

### Other regression

| Suite | Result |
|-------|--------|
| cart / order / outbox e2e | PASS |
| API typecheck + build | PASS |

---

## 8. Runtime verification

| Check | Result |
|-------|--------|
| `GET /health/ready` | **HTTP 200** |
| Fail → FAILED → requote → capture → PAID | Verified in e2e |

---

## 9. Security

Unchanged: RLS/FORCE RLS, tenant/country isolation, no PAN/CVV, `PAYMENT_LIVE_ENABLED` off, MOCK_* production guard, no live PSP.

---

## 10. Human gates

**0/7 — unchanged.** `CR-R14-A-IMPL-244` **NOT authorized**.

---

## 11. Remaining R14-A engineering gaps

| Category | Items |
|----------|-------|
| **A. Engineering** | R14-B sandbox reconciliation depth per [242](242_R14_IMPLEMENTATION_PLAN.md); any further payment kernel gaps discovered by code audit only |
| **B. Human/legal/commercial** | 0/7 gates — [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) |
| **C. Production prerequisites** | Live PSP, legal entity, MoR, carrier/payout contracts — **not authorized** |

**No new engineering CR auto-created.**

---

## 12. Verdict rationale

**`R14_A_PAYMENT_CHECKOUT_SESSION_STATE_COMPLETE`** — mapping verified in schema/code; capture → PAID; pre-submit fail → FAILED; in-flight unchanged; retry + requote path green; CR-270–278 regressions pass; migration 135; runtime health 200.
