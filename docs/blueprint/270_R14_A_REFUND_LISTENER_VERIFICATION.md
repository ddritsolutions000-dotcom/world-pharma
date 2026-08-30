# 270 — R14-A refund listener verification (CR-270)

**CR:** `CR-R14-A-REFUND-LISTENER-VERIFY-270`  
**Verdict:** **`R14_A_REFUND_LISTENER_COMPLETE`**  
**Date:** 30 August 2026  
**Closes:** [269](269_R14_A_REFUND_LISTENER_IMPLEMENTATION.md) (**PARTIAL → COMPLETE**)  
**Human gates:** **0 / 7 unchanged** — waiting on human approval ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Verification/regression CR for CR-269. Brought local Postgres/Redis up, ran full payment + refund-listener suites against `worldpharma_test`, confirmed runtime health, and fixed one genuine e2e test-isolation defect. **No live PSP. No human gate changes. No production activation.**

---

## 1. Infrastructure status

| Component | Status | Detail |
|-----------|--------|--------|
| Docker Desktop | **UP** | Linux engine available |
| `world-pharma-postgres` | **HEALTHY** | `127.0.0.1:55432` (`POSTGRES_PORT` from `.env`) |
| `world-pharma-redis` | **HEALTHY** | `127.0.0.1:56379` |
| Postgres reachability | **PASS** | Dev + test DBs reachable |
| Redis / BullMQ | **PASS** | Confirmed via `/health/ready` |

Started via repository `docker compose` configuration (existing compose file; no changes).

---

## 2. Database / migration status

| Database | Migrations applied | Repository migration count | Pending |
|----------|---------------------|----------------------------|---------|
| `worldpharma` | **128** | **128** | **0** |
| `worldpharma_test` | **128** | **128** | **0** |

- **No migrations run** during CR-270 (no pending migrations).
- **RLS / FORCE RLS:** **227** public tables with `relrowsecurity AND relforcerowsecurity` — intact.
- **No destructive reset** commands executed.

---

## 3. Files changed (CR-270)

| File | Change |
|------|--------|
| `apps/api/src/payment/payment-refund.listener.e2e.spec.ts` | Test isolation fixes: `jest.setTimeout(120_000)`; inventory refresh in `beforeEach`; checkout/pay assertions; `refundSpy.mockRestore()` in `try/finally` (fixes state pollution in tests J–L after test I) |
| `docs/blueprint/270_R14_A_REFUND_LISTENER_VERIFICATION.md` | This record |
| `docs/blueprint/269_R14_A_REFUND_LISTENER_IMPLEMENTATION.md` | Verdict updated to **COMPLETE** (verified by CR-270) |
| `docs/blueprint/00_MASTER_INDEX.md` | Book 270 row; Book 269 verdict |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R14-A refund listener **COMPLETE** |

**Production code:** No changes to listener, payment service, or orchestration logic — CR-269 implementation verified as-is.

---

## 4. CR-269 behavior verified (A–L)

| Case | Expected | Result |
|------|----------|--------|
| **A** Valid `PAYMENT_REFUND_REQUESTED` | Exactly one refund execution | **PASS** |
| **B** Duplicate event | No duplicate financial side effect | **PASS** (with C) |
| **C** Already-refunded payment | Deterministic idempotent no-op | **PASS** (with B) |
| **D** Missing order/payment | Safe failure, no gateway refund | **PASS** |
| **E** Invalid payment state | Safely rejected, no refund | **PASS** |
| **F** Gateway/environment mismatch | Fail closed | **PASS** (with H) |
| **G** Sandbox `MOCK_*` gateway | Works per sandbox contract | **PASS** |
| **H** Production `MOCK_*` gateway | Rejected | **PASS** (with F) |
| **I** Retry / transient failure | Retry does not duplicate financial effects | **PASS** |
| **J** Tenant/country isolation | Cross-scope refund blocked | **PASS** |
| **K** `OrderService.requestRefund` flow | Emits event; listener completes refund | **PASS** |
| **L** `PaymentService.refund` (HTTP) | Direct refund path still correct | **PASS** |

---

## 5. Test commands executed

All commands run from repository root with Docker Postgres/Redis healthy.

### CR-269 focused suites

```bash
npx jest apps/api/src/payment/payment-refund.listener.e2e.spec.ts --runInBand
npx jest apps/api/src/payment/payment-refund.listener.spec.ts --runInBand
npx jest apps/api/src/payment/refund-orchestration.spec.ts --runInBand
```

### Full payment regression (`apps/api/src/payment/**`)

```bash
npx jest apps/api/src/payment --runInBand
```

Includes: unit tests, refund orchestration, gateway registry, webhooks, payment config/router, CR-269 listener tests, `r14a.payment.e2e.spec.ts`.

### Relevant regression

```bash
npx jest apps/api/src/orders/order.e2e.spec.ts --runInBand
npx jest apps/api/src/events/outbox.e2e.spec.ts --runInBand
npx jest apps/api/src/crm/r12a.crm.e2e.spec.ts --runInBand
npx jest apps/api/src/search/r13a.search.e2e.spec.ts --runInBand
npx nx run api:typecheck
npx nx run api:build
npx nx run web-customer:typecheck
```

### Runtime

```bash
npx nx serve api
# GET http://127.0.0.1:4000/health/ready
```

---

## 6. Test counts (CR-270 execution)

| Suite | Passed | Failed | Skipped | Blocked |
|-------|--------|--------|---------|---------|
| `payment-refund.listener.e2e.spec.ts` | **10** | 0 | 0 | 0 |
| `payment-refund.listener.spec.ts` | **included below** | 0 | 0 | 0 |
| `refund-orchestration.spec.ts` | **included below** | 0 | 0 | 0 |
| **All `apps/api/src/payment/**`** | **58** (13 suites) | 0 | 0 | 0 |
| `order.e2e.spec.ts` | **included in 14** | 0 | 0 | 0 |
| `outbox.e2e.spec.ts` | **included in 14** | 0 | 0 | 0 |
| `r12a.crm.e2e.spec.ts` | **included in 14** | 0 | 0 | 0 |
| `r13a.search.e2e.spec.ts` | **included in 14** | 0 | 0 | 0 |
| **Relevant order/event/R12/R13 total** | **14** (4 suites) | 0 | 0 | 0 |
| API typecheck | **PASS** | — | — | — |
| API build | **PASS** | — | — | — |
| `web-customer` typecheck | **PASS** | — | — | — |

**Grand total executed in CR-270:** **72** Jest tests passed (58 payment + 14 relevant regression), **0** failed, **0** skipped, **0** blocked.

---

## 7. API typecheck / build

| Check | Result |
|-------|--------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |
| `nx run web-customer:typecheck` | **PASS** |

---

## 8. Runtime `/health/ready`

API started via `npx nx serve api` (port **4000**).

```json
{
  "status": "ready",
  "postgres": "up",
  "redis": "up",
  "redis_version": "7.4.11",
  "bullmq": "up"
}
```

**HTTP 200** — Postgres, Redis, and BullMQ all healthy. Startup log confirms `PaymentRefundListenerService` registered: `{"event":"payment_refund_listener_registered"}`.

---

## 9. Code integrity checks

| Check | Result |
|-------|--------|
| Exactly one canonical `PAYMENT_REFUND_REQUESTED` listener | **PASS** — `PaymentRefundListenerService` only |
| No direct `MockPaymentGatewayAdapter` call in listener | **PASS** — uses `PaymentService.refundFromEvent` → registry |
| HTTP refund and event refund share `executeRefund` | **PASS** |
| No duplicate listener registration | **PASS** |
| No production path selects `MOCK_*` | **PASS** — registry + config guards |
| Idempotency + state-machine protections active | **PASS** |

Key symbols verified in repository: `PAYMENT_REFUND_REQUESTED`, `PaymentService.refund`, `refundFromEvent`, `executeRefund`, `MockPaymentGatewayAdapter`, `PaymentRefundListenerService`, `EventHandlerRegistry`.

---

## 10. Security / production boundary

| Control | Status |
|---------|--------|
| `PAYMENT_LIVE_ENABLED` default disabled | **UNCHANGED** — requires explicit `true` |
| `payments.enabled` fail-closed / default-off | **UNCHANGED** |
| `MOCK_*` cannot run in production | **VERIFIED** (tests F/H + registry guards) |
| No PSP SDK added | **UNCHANGED** |
| No secrets committed | **UNCHANGED** |
| No production country pack enabled | **UNCHANGED** |
| Clinical search disabled | **UNCHANGED** — `clinical_search_enabled` defaults `false` |
| Human-gate values not fabricated | **UNCHANGED** — **0/7** |

---

## 11. Defects found and fixed

| Defect | Fix |
|--------|-----|
| E2e `beforeAll` exceeded default 5s Jest timeout | `jest.setTimeout(120_000)` |
| Inventory exhaustion caused checkout/pay failures | `beforeEach` inventory refresh + `inventoryLotId` |
| Test I `jest.restoreAllMocks()` broke tests J–L | Scoped `refundSpy.mockRestore()` in `try/finally` |

No production-code defects found in CR-269 listener implementation.

---

## 12. Human-gate status

**0 / 7** — unchanged. Books 35 and 247 not modified. **`CR-R14-A-IMPL-244` NOT authorized.**

---

## 13. Remaining R14-A engineering work

1. **Order status sync** — optional: transition order to `REFUNDED` / `PARTIALLY_REFUNDED` after `PAYMENT_REFUNDED` consumer (not yet implemented)
2. **Webhook reconciliation depth** — production-grade idempotency for live PSP webhooks (blocked on human gates)
3. **Real PSP adapter** — blocked on human gates ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))
4. **Production routing activation** — blocked on human gates

---

## 14. Exact next CR

**Engineering (recommended):** **`CR-R14-A-ORDER-REFUND-STATUS-271`** — consume `PAYMENT_REFUNDED` and sync order aggregate status (`REFUNDED` / `PARTIALLY_REFUNDED`) with regression tests; PSP-neutral; no human-gate audit loop.

**Parallel (human track):** Owner supplies gate evidence via [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) → then **`CR-R14-A-IMPL-244`** when gates evidenced (not before).

---

## 15. Final verdict

**`R14_A_REFUND_LISTENER_COMPLETE`**

CR-269 `PAYMENT_REFUND_REQUESTED` listener is verified against real Postgres/Redis test infrastructure. Full payment regression green. Runtime healthy. Human gates remain **0/7**. Do **not** proceed to live PSP implementation from this CR.
