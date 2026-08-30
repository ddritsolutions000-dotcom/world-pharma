# 282 — R14-A production-readiness baseline (CR-282)

**CR:** `CR-R14-A-PRODUCTION-READINESS-BASELINE-282`  
**Verdict:** **`R14_A_PRODUCTION_BASELINE_COMPLETE_HUMAN_GATES_BLOCKED`**  
**Date:** 30 August 2026  
**Method:** Code-first verification of repository, schema, migrations, tests, runtime, and production safety — **no code changes**.

**Prior state (accepted, not re-audited):**

- [280](280_R14_A_FINAL_CODE_AUDIT.md) — **`R14_A_ENGINEERING_COMPLETE`**
- [281](281_R14_A_HUMAN_GATE_EVIDENCE_CLOSE.md) — **`R14_A_GATE_EVIDENCE_INCOMPLETE`** (0/7)

**Human gates:** **0 / 7** — recorded only; no new evidence search in this CR.

---

## A. R14-A ENGINEERING

**`COMPLETE`**

Sandbox payment kernel (CR-268 through CR-279) verified in current source:

| Area | Code location | Status |
|------|---------------|--------|
| `PaymentGatewayPort` | `apps/api/src/payment/gateway.port.ts` | Present |
| `PaymentGatewayRegistry` | `apps/api/src/payment/gateway.registry.ts` | Present; MOCK only registered |
| `PaymentRouter` | `apps/api/src/payment/router.ts` | Present; `decide()` sandbox-only |
| Gateway capability validation | `apps/api/src/payment/gateway-capabilities.ts` | Present |
| Gateway environment handling | `payment.config.ts`, registries | Fail-closed for non-sandbox |
| Sandbox failover | `payment.service.ts` gateway loop | Present (CR-275) |
| Webhook registry | `webhook.registry.ts`, `sandbox.webhook.adapter.ts` | Present |
| Webhook signature/idempotency/replay | `webhook-orchestration.ts`, `hmac.ts`, `PaymentWebhookEvent` | Present |
| Reconciliation | `payment.service.ts` reconcile paths | Present (CR-272) |
| Checkout pay guard | `checkout-pay-guard.ts`, migration 134 | Present (CR-276) |
| Pre-submit failure audit | `payment-failed-attempt-audit.ts` | Present (CR-277) |
| Failed-payment reservation release | `checkout-reservation-release.ts` | Present (CR-278) |
| Checkout session payment state | `checkout-session-state.ts`, migration 135 | Present (CR-279) |
| Refund listener | `payment-refund.listener.ts` | Present (CR-270) |
| Order refund status sync | `order-payment-refunded.listener.ts` | Present (CR-271) |
| Admin payment observability | `payment-observability.ts`, `payments-admin.tsx` | Present (CR-273) |
| Routing matrix | `payment-routing-matrix.ts` | Present (CR-274) |
| RLS / FORCE RLS | `20260827180000_multi_tenant_rls` + domain RLS migrations | Intact on payment tables |
| Tenant/country isolation | RLS policies on `payment_intents`, gateways, webhooks | Intact |
| Production MOCK_* fail-closed | `assertSandboxGatewayCode` in config + registries | Present |
| `PAYMENT_LIVE_ENABLED` fail-closed | `payment.config.ts` | Defaults OFF (`!== 'true'`) |

Only registered gateway implementation: `MockPaymentGatewayAdapter` (`payment.module.ts`).

---

## B. HUMAN/LEGAL/COMMERCIAL

**0 / 7 gates evidenced** — all **BLOCKED** (per [281](281_R14_A_HUMAN_GATE_EVIDENCE_CLOSE.md); not re-searched):

| # | Gate | Status |
|---|------|--------|
| 1 | PSP | BLOCKED |
| 2 | Production country | BLOCKED |
| 3 | Legal entity | BLOCKED |
| 4 | MoR | BLOCKED |
| 5 | PSP contract | BLOCKED |
| 6 | Vault/credentials | BLOCKED |
| 7 | PCI scope/SAQ | BLOCKED |

---

## C. PRODUCTION OPERATIONAL

Exact prerequisites before any live payment activation:

| Prerequisite | Current state |
|--------------|---------------|
| All seven human gates closed with authoritative evidence | **0/7** |
| Dev DB migrations applied through head 135 | **7 pending** on `worldpharma` (see §2) |
| Production/staging DB `prisma migrate deploy` through 135 | Required at deploy time |
| Vault provisioned with PSP secret refs (not in repo) | Not evidenced |
| `PAYMENT_LIVE_ENABLED=true` set deliberately in target env | Not set (correct) |
| `PAYMENT_PRODUCTION_COUNTRIES` populated for launch ISO2 | Empty → fail-closed |
| `PAYMENT_RISK_ADAPTER` names approved production adapter | Not configured |
| `PAYMENT_GATEWAY_{CODE}_SECRET_REF` for live gateway | Not configured |
| Production country policy pack with `payments.enabled: true` | No authorized production pack |
| Production `payment_gateways` / routing rows (`environment: production`) | Not seeded |
| PSP webhook endpoint registered at provider | Not done |
| PCI SAQ / scope attestation on file | Not evidenced |
| Ops runbooks, on-call alerts for payment failures | Not in scope of R14-A engineering |
| Staging smoke with PSP test credentials | Blocked until gates + adapter |

---

## D. LIVE PSP IMPLEMENTATION

Work **remaining after PSP selection** (architecture-derived; not assumed complete):

| # | Work item | Why required (current architecture) |
|---|-----------|-------------------------------------|
| 1 | PSP SDK npm dependency | No live SDK in repo today |
| 2 | Live `PaymentGatewayPort` adapter | Only `MockPaymentGatewayAdapter` exists |
| 3 | Live `PaymentWebhookPort` adapter | Only `SandboxWebhookAdapter` registered |
| 4 | Register live adapters in `PaymentGatewayRegistry` / `PaymentWebhookRegistry` | `payment.module.ts` registers mock only |
| 5 | Production gateway DB rows + accounts + capabilities | Router reads `payment_gateways` by `environment` |
| 6 | Production routing rules | `payment_routing_rules` + `PaymentRouter.explain(..., 'production')` |
| 7 | Vault secret wiring via `PAYMENT_GATEWAY_*_SECRET_REF` | `assertProductionCredentialsPresent` |
| 8 | Production country authorization via `PAYMENT_PRODUCTION_COUNTRIES` | `assertProductionCountryAuthorized` |
| 9 | Production risk adapter via `PAYMENT_RISK_ADAPTER` | `assertProductionRiskConfigured` |
| 10 | Activate production routing path | `PaymentRouter.decide()` currently hardcodes `'sandbox'` |
| 11 | Authorized country pack (`payments.enabled`, methods, gateway_refs) | `payment.service.ts` fail-closed without pack |
| 12 | PSP-specific webhook signature + event mapping | Provider differs from sandbox HMAC adapter |
| 13 | PSP-specific reconciliation semantics | Capture/settlement timing may differ from mock |
| 14 | PSP-specific refund/capture/void behavior tests | Provider edge cases not covered by mock |
| 15 | Production smoke / canary tests (no real money in CI) | Not present |
| 16 | Operational dashboards/alerts for live payment SLOs | Admin observability is sandbox-oriented today |

**Not required again:** sandbox kernel, refund listener, order sync, webhook idempotency framework, pay guard, failed-attempt audit, reservation release, checkout PAID/FAILED — **already implemented**.

---

## E. SECURITY

**NONE** (engineering blockers).

Verified fail-closed controls:

- `PAYMENT_LIVE_ENABLED` defaults OFF (`payment.config.ts`)
- `emptyPolicyDocument().payments.enabled === false` (`empty-pack.ts`)
- `assertSandboxGatewayCode` blocks MOCK_* in production environment rows
- Gateway/webhook registries reject non-sandbox without live enablement
- `PaymentRouter.decide()` never queries production candidates
- No committed live PSP credentials (`sk_live`, `whsec_`, etc.) in payment source
- Clinical search remains disabled (`clinical_search_enabled: false` default; R13-G fail-closed)

---

## F. TEST/RUNTIME

### Database

| Target | Migrations in repo | Applied state |
|--------|-------------------|---------------|
| Repository head | **135** | — |
| Test DB (`worldpharma_test`) | 135 found | **Up to date** (no pending) |
| Dev DB (`worldpharma`) | 135 found | **7 pending** (not applied): |

Pending on dev (128→135):

- `20260830153000_r14a_inventory_lots_worker_platform_read`
- `20260830154500_r14a_inventory_reservable_lots`
- `20260830160000_r14a_reservable_lots_bucket_formula`
- `20260830161000_r14a_available_qty_bucket_formula`
- `20260830162000_r14a_balance_for_update`
- `20260830170000_r14a_checkout_session_successful_pay_guard` (**134**)
- `20260830180000_r14a_checkout_status_paid` (**135**)

Migrations **134** and **135** are present in repo; applied on test DB; **not yet applied on dev DB**.

RLS: payment tables covered by `20260827180000_multi_tenant_rls` (ENABLE + FORCE RLS). Migrations 134–135 are index/enum only — no RLS regression.

### Regression (CR-282 run — sequential, `--runInBand --skip-nx-cache`)

| Suite | Result | Notes |
|-------|--------|-------|
| Payment (full) | **205/205 PASS** | Isolated run |
| cart.e2e + order.e2e + outbox.e2e + inventory.e2e | **8/9 PASS** | `order.e2e` failed default 5s timeout in batch |
| order.e2e (retry, 60s timeout) | **1/1 PASS** | **Test infrastructure** — not production defect |
| Refund listener + order refund + R12/R13 spot | **91/91 PASS** | 19 suites |
| `api:typecheck` | **PASS** | |
| `api:build` | **PASS** | |
| `web-admin:typecheck` | **PASS** | |
| `web-admin` payments-admin | **14/14 PASS** | |
| `web-customer:typecheck` | **PASS** | |

**Known infra debt (unchanged from CR-280):** batch e2e can hit Jest 5s default timeout or shared-country inventory pressure; isolated/`runInBand` runs are green.

### Runtime (safe sandbox verification)

| Component | Result |
|-----------|--------|
| Postgres | **up** |
| Redis | **up** (7.4.11) |
| BullMQ | **up** |
| API | **up** (port 4000) |
| `GET /health/ready` | **HTTP 200** — `{"status":"ready","postgres":"up","redis":"up","redis_version":"7.4.11","bullmq":"up"}` |

No live money exercised. Sandbox lifecycle only.

---

## G. CR-244 STATUS

**`CR-R14-A-IMPL-244` is partially stale and must NOT be executed unchanged.**

| CR-244 scope (as written) | Current repo state |
|---------------------------|-------------------|
| Extend `PaymentGatewayPort` + register live adapter | Port exists; **live adapter not implemented** — still required |
| Sandbox webhook/idempotency | **Done** (CR-261, CR-272) |
| Sandbox routing / failover / guards / audit / release / checkout state | **Done** (CR-268–279) |
| Refund listener + order sync | **Done** (CR-270–271) |
| Admin observability + routing matrix | **Done** (CR-273–274) |
| Human gate evidence | **Still 0/7** |

Executing CR-244 unchanged would duplicate completed sandbox engineering and under-specify provider-specific live wiring.

**Recommended successor (conceptual only — do NOT implement here):**

`CR-R14-A-LIVE-PSP-WIRING-{PROVIDER}` — e.g. `CR-R14-A-STRIPE-LIVE-WIRING-283` **only after** a named PSP is gate-approved. Scope: items in §D only.

---

## H. NEXT ACTION

**Human gates remain 0/7 → STOP engineering work.** Wait for real owner decisions via [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md).

When all seven gates are supplied in the future:

1. **Do NOT** execute `CR-R14-A-IMPL-244` unchanged.
2. Create a **narrow, provider-specific** implementation plan/CR from §D.
3. Apply pending dev DB migrations before local/staging validation.
4. Do **not** enable `PAYMENT_LIVE_ENABLED` until vault, country pack, routing rows, and PCI evidence are in place.

**Do not create another engineering CR** unless a new, reproducible code defect is found.

---

## Production safety check (code/config evidence)

| Check | Evidence | Result |
|-------|----------|--------|
| `PAYMENT_LIVE_ENABLED` defaults OFF | `isLivePaymentEnabled()` returns true only for `=== 'true'` | **PASS** |
| `payments.enabled` fail-closed | `emptyPolicyDocument()` → `enabled: false`; service checks | **PASS** |
| MOCK_* cannot execute in production | `assertSandboxGatewayCode` + registry resolve | **PASS** |
| No production country pack accidentally active | `PAYMENT_PRODUCTION_COUNTRIES` empty; no authorized launch pack | **PASS** |
| No real PSP credentials committed | Repo grep — test refs only in specs | **PASS** |
| No hardcoded live secrets | Payment source uses `*_SECRET_REF` indirection | **PASS** |
| Production routing cannot activate accidentally | `decide()` → `'sandbox'` only; production query requires prerequisites | **PASS** |
| Live webhook cannot accept MOCK_* in production | `webhook.registry.ts` same guards | **PASS** |
| Clinical search unchanged/disabled | `clinical_search_enabled` default false; R13-G RLS | **PASS** |

---

## Files changed (this CR)

| File | Change |
|------|--------|
| `docs/blueprint/282_R14_A_PRODUCTION_READINESS_BASELINE.md` | Created (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | Updated — book 282 row |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | Updated — production baseline frozen |

**No application code, schema, migrations, tests, or config changed.**

---

## Final verdict

**`R14_A_PRODUCTION_BASELINE_COMPLETE_HUMAN_GATES_BLOCKED`**

R14-A sandbox engineering baseline is verified and frozen. Production payment activation remains blocked exclusively by human/legal/commercial gates (0/7) and operational prerequisites in §C — not by missing sandbox kernel work.
