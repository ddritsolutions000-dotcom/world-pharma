# 268 — R14-A engineering foundation (CR-268)

**CR:** `CR-R14-A-ENGINEERING-FOUNDATION-268`  
**Verdict:** **`ENGINEERING_FOUNDATION_COMPLETE`**  
**Date:** 30 August 2026  
**Human gates:** **0 / 7 — unchanged; waiting on human approval** ([263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md))

Provider-neutral R14-A engineering pass. **No live PSP. No production activation. No Book 35/247 human evidence changes.**

---

## 1. Executive summary

Completed a code-first provider-neutral foundation for R14-A:

- Gateway/webhook capability validation and fail-closed registries
- Production-path structural guards (credentials, country, risk, live enablement)
- Sandbox-only active routing preserved
- Order↔payment refund alignment with `PAYMENT_REFUND_REQUESTED` emission
- Production risk fail-closed in `AllowlistRiskAdapter`
- Audit payload sanitization (no sensitive keys in outbox)
- Expanded test suite (`r14a.payment.e2e.spec.ts` + unit specs)

**Production activation remains DISABLED.** `PAYMENT_LIVE_ENABLED` defaults off. Sandbox MOCK gateways only.

---

## 2. Files changed

### Created

| File | Purpose |
|------|---------|
| `apps/api/src/payment/gateway-capabilities.ts` | Gateway/webhook capability validation |
| `apps/api/src/payment/refund-orchestration.ts` | Order↔payment refund eligibility |
| `apps/api/src/payment/refund-orchestration.spec.ts` | Refund orchestration unit tests |
| `apps/api/src/payment/allowlist.risk.spec.ts` | Production risk fail-closed tests |
| `apps/api/src/payment/r14a.payment.e2e.spec.ts` | R14-A foundation e2e + guard tests |

### Modified

| File | Change |
|------|--------|
| `apps/api/src/payment/gateway.port.ts` | Required `capabilities` on adapters |
| `apps/api/src/payment/webhook.port.ts` | Required webhook `capabilities` |
| `apps/api/src/payment/mock.adapter.ts` | Declares full gateway capabilities |
| `apps/api/src/payment/sandbox.webhook.adapter.ts` | Declares webhook capabilities |
| `apps/api/src/payment/gateway.registry.ts` | Capability validation; mock adapter decoupling |
| `apps/api/src/payment/webhook.registry.ts` | Register pattern + capability validation |
| `apps/api/src/payment/payment.config.ts` | Production prerequisites guards |
| `apps/api/src/payment/router.ts` | Production candidate query (fail-closed); sandbox-only `decide()` |
| `apps/api/src/payment/allowlist.risk.ts` | Production live mode fail-closed |
| `apps/api/src/payment/payment.service.ts` | Submit guards; audit sanitization |
| `apps/api/src/orders/order.service.ts` | Refund eligibility + `PAYMENT_REFUND_REQUESTED` |
| `apps/api/src/payment/payment.config.spec.ts` | Production guard tests |
| `apps/api/src/payment/gateway.registry.spec.ts` | Registry tests |
| `apps/api/src/payment/router.spec.ts` | Production routing fail-closed test |
| `.env.example` | `PAYMENT_PRODUCTION_COUNTRIES`, `PAYMENT_RISK_ADAPTER` placeholders |

### Documentation (this CR)

| File | Change |
|------|--------|
| `docs/blueprint/268_R14_A_ENGINEERING_FOUNDATION.md` | This record |
| `docs/blueprint/00_MASTER_INDEX.md` | Book 268 row |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R14-A engineering foundation status |

**Migrations:** None.

---

## 3. Engineering work completed

### Payment architecture

- `PaymentService` dispatches exclusively via `PaymentGatewayRegistry`
- Gateway selection from persisted `routingJson` / gateway code
- Unknown gateway codes fail closed (`UNKNOWN_PAYMENT_GATEWAY`)
- `MockPaymentGatewayAdapter` only registered in registry/module/tests — not in `PaymentService`
- Capability validation prevents incomplete adapter registration

### Provider-neutral live adapter contract

- `PaymentGatewayPort` requires: submit, status, capture, void, refund + `capabilities`
- `PaymentWebhookPort` requires: verify, parseEvent + `capabilities`
- No fake real-PSP implementation added

### Routing

- **Active:** sandbox only (`PaymentRouter.decide()` always queries sandbox)
- **Structural production path:** `candidates(input, 'production')` and `assertProductionRoutingReady()` fail closed without:
  - `PAYMENT_LIVE_ENABLED=true`
  - approved gateway secret ref
  - `PAYMENT_PRODUCTION_COUNTRIES` authorization
  - production risk adapter

### Webhooks

- Provider-neutral registry with capability validation
- Signature verification, idempotency, replay/stale timestamp protection preserved
- Conformance covered in `r14a.payment.e2e.spec.ts` and existing specs

### Refund consistency

- `assessOrderRefundEligibility()` blocks order `REFUND_PENDING` when linked CARD payment is not refundable
- Emits `PAYMENT_REFUND_REQUESTED` on valid order refund request
- Payment refund flow unchanged (idempotent); no invented refund policy

### Configuration / secrets

- `assertLiveProductionPrerequisites`, `assertProductionCredentialsPresent`, `assertProductionCountryAuthorized`, `assertProductionRiskConfigured`
- Secret refs from env only (`PAYMENT_GATEWAY_*_SECRET_REF`); no secrets in source

### Risk boundary

- `AllowlistRiskAdapter` allows sandbox; **denies production live mode** without approved `PAYMENT_RISK_ADAPTER`

### Observability

- `sanitizeAuditPayload()` strips sensitive keys from payment outbox payloads

---

## 4. Tests executed

| Suite | Result |
|-------|--------|
| Payment tests (11 suites) | **44 / 44 PASS** |
| API typecheck | **PASS** |
| API build (webpack) | **PASS** |
| R12 sample (`r12a.crm-kernel.e2e`) | **PASS** |
| R13 sample (`r13a.search-indexing.e2e`) | **PASS** |
| web-customer typecheck | **PASS** |
| `/health/ready` | **Not run** (API not running locally) |
| Migrations | **128 / 128 up to date** |

### Payment test breakdown

| File | Tests |
|------|-------|
| `payment.e2e.spec.ts` | 1 |
| `r14a.payment.e2e.spec.ts` | 11 |
| `payment.config.spec.ts` | 9 |
| `gateway.registry.spec.ts` | 3 |
| `webhook.registry.spec.ts` | 3 |
| `hmac.spec.ts` | 4 |
| `state-machine.spec.ts` | (existing) |
| `router.spec.ts` | 2 |
| `pci.spec.ts` | 1 |
| `refund-orchestration.spec.ts` | 4 |
| `allowlist.risk.spec.ts` | 2 |

---

## 5. Security findings

| Check | Status |
|-------|--------|
| No PAN/CVV storage | **PASS** (`pci.spec.ts`) |
| No secret leakage in audit payloads | **PASS** (sanitization) |
| Production cannot use MOCK_* gateway | **PASS** (`MOCK_GATEWAY_PRODUCTION_FORBIDDEN`) |
| Production cannot run without `PAYMENT_LIVE_ENABLED` | **PASS** |
| Country scope via policy + production country list | **PASS** |
| Webhook replay cannot duplicate financial effects | **PASS** (e2e verified) |
| No secrets committed | **PASS** |
| Human gates not fabricated | **PASS** |

### Code audit (post-implementation)

| Pattern | Finding |
|---------|---------|
| Direct `MockPaymentGatewayAdapter` in production paths | **None** — registry/module/tests only |
| Hardcoded production secrets | **None** |
| Live PSP SDK / placeholder adapters | **None** |
| Production payment bypass | **None** — fail-closed guards added |

---

## 6. Remaining provider-specific work (requires human gates)

1. Named PSP adapter implementation (Stripe/Razorpay/Adyen/etc.)
2. Live webhook adapter for chosen PSP
3. Production gateway DB rows + secret provisioning
4. Production country pack authorization
5. Production risk/fraud adapter
6. PCI SAQ attestation integration
7. **`CR-R14-A-IMPL-244`** — live PSP wiring (NOT authorized)

---

## 7. Remaining human/legal gates (unchanged)

| Gate | Status |
|------|--------|
| Named PSP | **OPEN** |
| Production country | **OPEN** |
| Legal entity | **OPEN** |
| MoR (OD-PAY-01) | **OPEN** |
| PSP contract | **OPEN** |
| PSP vault credentials | **OPEN** |
| PCI approval | **OPEN** |

Book 35: **no `DECIDED` rows modified.** Book 247: **no evidence fabricated.**

---

## 8. Blockers discovered

None engineering-side. **Primary blocker remains human gate evidence 0/7.**

---

## 9. Production activation status

**DISABLED.**

- `PAYMENT_LIVE_ENABLED` not set (defaults false)
- Sandbox-only routing active
- `payments.enabled` policy default unchanged
- No production country packs enabled

---

## 10. Exact next CR

**While human gates remain 0/7:**

**`CR-R14-A-REFUND-LISTENER-269`** — Wire sandbox `PAYMENT_REFUND_REQUESTED` → `PaymentService.refund` listener (provider-neutral, no live PSP)

**After human gates close (7/7 evidenced):**

1. Owner evidence intake
2. **`CR-PRE-R14-A-GATE-268`** (or successor) → `R14_A_GATES_GREEN`
3. **`CR-R14-A-IMPL-244`** — authorized live PSP implementation

---

## 11. Final verdict

**`ENGINEERING_FOUNDATION_COMPLETE`**

Provider-neutral R14-A foundation is in place. Live money remains blocked pending human approval.
