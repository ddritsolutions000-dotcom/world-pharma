# 277 — R14-A payment failed attempt audit (CR-277)

**CR:** `CR-R14-A-PAYMENT-FAILED-ATTEMPT-AUDIT-277`  
**Verdict:** **`R14_A_PAYMENT_FAILED_ATTEMPT_AUDIT_COMPLETE`**  
**Date:** 30 August 2026  
**Prior work:** [276](276_R14_A_PAYMENT_CHECKOUT_PAY_GUARD.md) (**R14_A_PAYMENT_CHECKOUT_PAY_GUARD_COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Persist pre-submit gateway failure attempts so they remain auditable after the HTTP tenant transaction rolls back on `409 PAYMENT_FAILED`. **No live PSP. No new payment kernel. No human gate changes.**

---

## 1. Reproduced root cause

| Symptom | `POST /me/checkout/sessions/:id/pay` with `pre_submit_fail_all` → **409**; no committed `PaymentIntent` / `PaymentAttempt` rows afterward |
|---------|---|
| Path | `TenantInterceptor` → `runWithTenant` (HTTP tx) → `createAndSubmit` → gateway loop → throw `PAYMENT_FAILED` |
| Records created in-request | `PaymentIntent` (`CREATED`→`FAILED`), `PaymentAttempt`(s) (`FAILED`, `submitted: false`), outbox `PAYMENT_INTENT_CREATED` + `PAYMENT_FAILED` |
| On throw | Entire HTTP tenant transaction rolls back → **all records vanish** |
| CR-275 diagnosis | **Still correct on CR-276 code** — pay guard did not change transaction boundary |

Successful failover (`201`) commits normally; only all-pre-submit-fail throw paths were affected.

---

## 2. Transaction-boundary decision

Reuse existing **`runWithTenant(..., { fresh: true })`** autonomous transaction pattern (same approach as `HealthAccessService.recordAccess` / clinical denied-read audit).

Before throwing `409 PAYMENT_FAILED`:

1. Collect in-memory snapshots of failed pre-submit attempts during the gateway loop.
2. Call `persistAllPreSubmitFailure()` in a **fresh** tenant transaction.
3. Persist `PaymentIntent` (`FAILED`) + all `PaymentAttempt` rows + outbox events.
4. Request transaction rolls back its uncommitted copies; fresh tx survives.

**No schema change required** — reuses existing `PaymentIntent` / `PaymentAttempt` / outbox models.

---

## 3. Persistence design

| Field / behavior | Source |
|------------------|--------|
| Checkout / booking reference | `checkoutSessionId`, `labBookingId`, `imagingBookingId` on intent |
| Tenant/country scope | `customerPersonId`, `countryId`; RLS via worker tenant context |
| Gateway code/environment | `routingJson` on each attempt |
| Attempt sequence | `createdAt` ordering → `attempt_number` in observability |
| Failure classification | Existing `classifyAttemptFailure` (`pre_submit_transient`, `pre_submit_permanent`) |
| Safe error code | `errorCode` only (e.g. `PRE_SUBMIT_REJECTED`) — no PAN/CVV/secrets |
| Idempotency | Skip persist if intent id already committed (`findUnique` guard) |
| Financial semantics | `FAILED` intent, `submitted: false` attempts — **no** capture tx, order, or settlement events |

### Financial safety

- Does **not** emit `PAYMENT_CAPTURED`, `PAYMENT_REFUNDED`, or order-created events.
- Does **not** create `PaymentTransaction` rows.
- Does **not** call `orders.createFromPayment`.
- Audit-only; no money movement.

---

## 4. Code changes

| File | Change |
|------|--------|
| `payment-failed-attempt-audit.ts` | `persistPreSubmitFailureAudit()` — fresh-tx persist helper |
| `payment.service.ts` | Collect pre-submit attempt snapshots; `throwAllPreSubmitFailure()` / `persistAllPreSubmitFailure()`; wired in checkout + lab + imaging paths |
| `payment-observability.ts` | `failure_outcome: PRE_SUBMIT_FAILURE`; improved pre-submit `classifyPaymentFailure`; per-attempt `failure_outcome` |
| `admin.controller.ts` | `checkout_session_id` query on admin payment search |
| `payment-failed-attempt-audit.e2e.spec.ts` | 20 mandatory scenarios |
| `payment-sandbox-failover.e2e.spec.ts` | Tests 3–5 assert post-rollback persistence |
| `payments-admin-api.ts` / `payments-admin.tsx` | Display `failure_outcome` |

**Migration:** none (head remains **134**).

---

## 5. Admin observability

Existing `GET /admin/payments/:id/observability` works for durably persisted failed intents.

New / extended surfaces:

- `failure_outcome: PRE_SUBMIT_FAILURE` on payment summary (distinct from `CAPTURED` / `AUTHORIZED` / refund states)
- Per-attempt `failure_outcome: PRE_SUBMIT_FAILURE` + `failure_classification` (`pre_submit_transient` / `pre_submit_permanent`)
- `GET /admin/payments?checkout_session_id=…` — find failed checkout payments after 409
- Fallback history unchanged for success paths (primary fail + fallback success shows both attempts)

RBAC: `payment:read` unchanged. Tenant/country isolation via existing worker tenant context + country filter.

---

## 6. Tests

### Focused (`payment-failed-attempt-audit.e2e.spec.ts`) — 20/20

Covers: persist on all-pre-submit-fail, survive rollback, failover dual-attempt history, dual-failure audit, classification, gateway/env, ordering, idempotent persist, retry new intent, captured replay guard, no financial tx/order events, tenant/country isolation, admin RBAC, sensitive-field absence, CR-275/276 regression.

### Regression

| Suite | Result |
|-------|--------|
| `apps/api/src/payment` (23 suites) | **185/185 pass** |
| `payment-sandbox-failover.e2e.spec.ts` | 18/18 (tests 3–5 extended) |
| `cart.e2e`, `order.e2e` | pass |
| `outbox.e2e` | 6/6 pass |
| CR-270–276 | included in payment suite |
| `api:typecheck`, `api:build` | pass |
| `web-admin:typecheck`, `payments-admin` tests | 14/14 pass |

### Commands

```bash
npx nx test api --testPathPatterns="apps/api/src/payment"
npx nx test api --testPathPatterns="payment-failed-attempt-audit.e2e"
npx nx run api:typecheck && npx nx run api:build
npx nx run web-admin:typecheck && npx nx test web-admin --testPathPatterns="payments-admin"
```

---

## 7. Runtime / migration

| Check | Result |
|-------|--------|
| Migration head | **134** — no new migration |
| Dev/test DB | aligned |
| Postgres + Redis | healthy |
| `GET /health/ready` | **HTTP 200** (`http://127.0.0.1:4000/health/ready`) |
| Rollback survival | Verified in e2e tests 1–2 against real local DB |

---

## 8. Security

- No PAN/CVV/secrets in persisted audit or admin responses  
- `sanitizeObservabilityPayload` on outbox audit payloads  
- RLS / FORCE RLS unchanged  
- `PAYMENT_LIVE_ENABLED` off; production routing/country packs disabled  
- MOCK_* production guard unchanged  
- Tenant/country isolation verified in e2e  

---

## 9. Human gates

**0/7 — unchanged.** `CR-R14-A-IMPL-244` **NOT authorized** from this CR.

---

## 10. Remaining R14-A engineering gaps

| Priority | CR / track |
|----------|------------|
| Checkout session terminal state | Align checkout session status with payment outcome (`FAILED` / post-capture terminal) — currently stays `READY_FOR_PAYMENT` after capture or failure |
| R14-B reconciliation | Next major R14 track per [242](242_R14_IMPLEMENTATION_PLAN.md) — sandbox reconciliation depth |
| Human track (parallel) | Owner evidence [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) → `CR-R14-A-IMPL-244` when 7/7 gates evidenced |

**Next engineering work:** checkout session terminal state alignment (if verified as operational gap) or R14-B per plan — **not** another human-gate audit loop.
