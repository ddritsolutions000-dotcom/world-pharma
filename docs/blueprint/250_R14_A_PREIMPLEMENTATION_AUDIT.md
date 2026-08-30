# 250 — R14-A pre-implementation audit (comprehensive)

**CR:** `CR-R14-A-PREIMPLEMENTATION-AUDIT-250`  
**Verdict:** **`R14_A_ENGINEERING_READY_HUMAN_GATES_BLOCKED`**  
**Date:** 30 August 2026  
**Authority:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [241](241_FULL_PROJECT_AUDIT.md) · [242](242_R14_IMPLEMENTATION_PLAN.md) · [243](243_POST_R14_PLAN_AUDIT.md) · [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) · [248](248_PRE_R14_A_GATE_REVERIFICATION.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. **No source, schema, migration, API, UI, config, routing, adapter, webhook, or production activation changes were made.**

---

## 1. Executive summary

This audit re-scans the **current repository and project records** for R14-A readiness — beyond repeating the seven-gate block. It reconciles program state (R10–R14), engineering prerequisites, human/legal/commercial gates, database drift, security posture, test/build/runtime evidence, and blocker classification.

### Key findings

| Area | Assessment |
|------|------------|
| **Program (R12/R13)** | Closed; sandbox kernels intact |
| **R14 plan** | Green ([243](243_POST_R14_PLAN_AUDIT.md)); implementation not authorized |
| **R14-A engineering** | **Sandbox payment kernel ready**; known R14-A delta (port DI, production router, live webhooks) is **defined work**, not a redesign blocker |
| **Human/legal/commercial gates** | **0 / 7 evidenced** ([247](247_R14_A_HUMAN_GATE_EVIDENCE.md), [248](248_PRE_R14_A_GATE_REVERIFICATION.md)) |
| **Production readiness** | **NOT READY** — mock-only payment, human gates open, staging DB parity incomplete |

### Verdict

**`R14_A_ENGINEERING_READY_HUMAN_GATES_BLOCKED`**

Engineering can **define and scope** R14-A against existing kernels, but **`CR-R14-A-IMPL-244` is NOT authorized** until all seven human gates are evidenced and re-verified green.

---

## 2. Current complete project phase matrix

| Phase / wave | Status | Evidence | Notes |
|--------------|--------|----------|-------|
| **R10-E** (health uploads) | **NOT STARTED** | Book 241; no R10-E controllers | Optional; does not block R14-A |
| **R10-F** (consult notes) | **NOT STARTED** | Book 241 | Optional |
| **R12-A** CRM kernel | **IMPLEMENTED / AUDITED GREEN** | `r12a.crm-kernel.e2e` | Book 222 closed |
| **R12-B** Marketing | **IMPLEMENTED / AUDITED GREEN** | `r12b.marketing.e2e` | |
| **R12-C** Promo | **IMPLEMENTED / AUDITED GREEN** | `r12c.promo.e2e` | |
| **R12-D** Affiliate | **IMPLEMENTED / AUDITED GREEN** | `r12d.affiliate.e2e` | |
| **R12-E** Wishlist/loyalty | **IMPLEMENTED / AUDITED GREEN** | `r12e.wishlist.e2e` | |
| **R12-F** Reviews/personalization | **IMPLEMENTED / AUDITED GREEN** | `r12f.reviews.e2e` | |
| **R12-G** Refill hooks | **IMPLEMENTED / AUDITED GREEN** | `r12g.refill-hooks.e2e` | |
| **R12-H** Closure | **AUDITED GREEN** | Book 222 | No `r12h` spec by design |
| **R13-A** Search indexing | **IMPLEMENTED / AUDITED GREEN** | `r13a.search-indexing.e2e` | Book 240 closed |
| **R13-B** Discovery | **IMPLEMENTED** (env flake) | `r13b.discovery.e2e` | TD-REG-R13B-01 |
| **R13-C** Provider search | **IMPLEMENTED / AUDITED GREEN** | `r13c.provider-search.e2e` | |
| **R13-D** Recommendations | **IMPLEMENTED / AUDITED GREEN** | `r13d.recommendations.e2e` | |
| **R13-E** Analytics | **IMPLEMENTED / AUDITED GREEN** | `r13e.analytics.e2e` | TD-R13E-01 deferred |
| **R13-F** Admin BI | **IMPLEMENTED / AUDITED GREEN** | `r13f.analytics-admin.e2e` | |
| **R13-G** Clinical search | **IMPLEMENTED / DISABLED** | `r13g.clinical-search.e2e` | OD-R13-04; default off |
| **R13-H** Closure | **IMPLEMENTED / AUDITED GREEN** | `r13h.closure.e2e` | Book 240 |
| **R14-A** Live PSP | **PLANNED / BLOCKED** | Books 242, 244, 247–248 | Human gates 0/7 |
| **R14-B** Reconciliation | **PLANNED / NOT STARTED** | Book 242 | |
| **R14-C** Payout | **PLANNED / NOT STARTED** | Book 242 | |
| **R14-D** Carrier | **PLANNED / NOT STARTED** | Book 242 | |
| **R14-E** Tax hooks | **PLANNED / NOT STARTED** | Book 242 | |
| **R14-F** Go-live orchestration | **PLANNED / NOT STARTED** | Book 242 | |
| **R14-G** Closure | **PLANNED / NOT STARTED** | Book 242 | |
| **R14 production readiness** | **BLOCKED** | Books 241, 248 | Mock money; human gates open |

---

## 3. R14-A engineering readiness matrix

| Component | Current state | R14-A change required | Ready? | Notes |
|-----------|---------------|----------------------|--------|-------|
| `PaymentGatewayPort` | **Exists** (`gateway.port.ts`) | Live adapter impl | **Partial** | Port defines submit/capture/refund/void/status |
| `PaymentRouter` | **Exists** | Add `production` env routing | **Partial** | L36: `environment: 'sandbox'` only |
| Payment service/module | **Exists** | Refactor off hardcoded mock | **Gap** | Injects `MockPaymentGatewayAdapter` directly — not `PaymentGatewayPort` DI |
| Mock adapter | **Exists** | Keep for sandbox | **Yes** | `mock.adapter.ts` |
| Live PSP adapter | **Absent** | **R14-A scope** | **No** | Expected — not started |
| Webhook controller | **Exists** | Provider-specific verify | **Partial** | `webhook.controller.ts`; sandbox HMAC header |
| Webhook ingest | **Exists** | Extend for live PSP | **Partial** | `ingestWebhook` — `verifySandboxSignature`, idempotent `PaymentWebhookEvent` |
| HMAC/signature | **Sandbox only** | PSP-specific validators | **Partial** | `hmac.ts` |
| Idempotency | **Exists** | Reuse | **Yes** | Intent/attempt + Redis idempotency keys |
| Replay protection | **Exists** | Reuse | **Yes** | `providerEventId` unique constraint |
| State machine | **Exists** | Reuse | **Yes** | `state-machine.ts` + tests |
| Refund/capture/auth flow | **Exists (mock)** | Wire live port | **Partial** | `payment.service.ts` calls `this.mock.*` |
| Ledger integration | **Exists** | Extend for live | **Partial** | `FinanceService.syncPayment` on refund path |
| Reconciliation hooks | **Exists (sandbox)** | Live settlement import (R14-B) | **Partial** | `PaymentReconciliation` model + sandbox reconcile |
| Policy/country gating | **Exists** | Fail-closed reuse | **Yes** | `PolicyResolver`; `payments.enabled` gate |
| Environment separation | **Schema only** | Config + router | **Partial** | `PaymentGateway.environment` field; router not using production |
| Secrets handling | **Partial** | Vault refs for live | **Partial** | `secretRef` on gateway; seed uses `env:PAYMENT_MOCK_WEBHOOK_SECRET` |
| Failure/retry | **Exists** | Reuse Book 57 rules | **Yes** | Pre-submit failover; UNKNOWN reconcile |
| Audit/security events | **Partial** | Extend `PAYMENT_*` events | **Partial** | Outbox events; limited security-event wiring |
| Database/RLS | **Exists** | New tables if chargebacks | **Yes** | Payment tables from Book 57 migration |
| Tests | **Minimal** | `r14a.live-psp.e2e` per Book 242 | **Gap** | `payment.e2e.spec.ts` — **1 test**, sandbox only |
| PSP SDK in deps | **Absent** | Add when PSP named | **N/A** | Blocked on human gate 1 |

### Engineering blockers (independent of human approval)

| ID | Item | Classification | Blocks R14-A **start**? |
|----|------|----------------|-------------------------|
| ENG-R14A-01 | `PaymentService` hardwired to `MockPaymentGatewayAdapter` | **R14-A work item** | **No** — first R14-A task |
| ENG-R14A-02 | No `PaymentGatewayPort` DI provider | **R14-A work item** | **No** |
| ENG-R14A-03 | Sandbox-only webhook verification | **R14-A work item** | **No** |
| TD-WEB-TC-01 | `web-customer:typecheck` fail | **PRECONDITION** (customer UI go-live) | **No** for API/kernel R14-A |
| TD-REG-R13B-01 / TD-REG-ENV-01 | Test pollution | **DEBT** | **No**; close before R14-G |
| Main DB migration lag | ~28 behind repo | **PRECONDITION** (staging/prod parity) | **No** for coding in test mode |

**Conclusion:** Sandbox payment architecture is **sufficient to begin R14-A implementation** once human gates pass. No repository-level redesign blocker identified.

---

## 4. Seven human/legal/commercial gate matrix

Re-checked against [247](247_R14_A_HUMAN_GATE_EVIDENCE.md), [248](248_PRE_R14_A_GATE_REVERIFICATION.md), Books 35, 38 — **no new evidence since CR-249**.

| # | Gate | Status | Authoritative evidence | Sufficient for impl? | Missing |
|---|------|--------|------------------------|----------------------|---------|
| 1 | Named PSP | **NOT EVIDENCED** | None | **No** | Vendor name, authority, date, reference |
| 2 | First production country + ISO2 | **NOT EVIDENCED** | OD-COUNTRY-01 open | **No** | Country authorization |
| 3 | Legal entity | **NOT EVIDENCED** | OD-BRAND-01, OD-I18N-06 open | **No** | Entity + jurisdiction |
| 4 | MoR (OD-PAY-01) | **NOT EVIDENCED** | OD-PAY-01 open | **No** | MoR model + responsible entity |
| 5 | PSP contract | **NOT EVIDENCED** | None | **No** | Safe contract reference |
| 6 | PSP vault/credentials | **NOT EVIDENCED** | Mock secret only | **No** | Vault path for named PSP |
| 7 | PCI scope / SAQ | **NOT EVIDENCED** | Engineering default only | **No** | Compliance acknowledgment |

**Gates evidenced: 0 / 7** — unchanged from Book 248.

---

## 5. Database / migration readiness

| Item | Audit finding | Source |
|------|---------------|--------|
| Repository migration folders | **128** | Live count `packages/database/prisma/migrations` |
| `worldpharma_test` | **~130** records (Book 241) | Possible duplicate `_prisma_migrations` entries |
| Main `worldpharma` | **~100** applied (Book 241) | **~28 behind** repository |
| R14-A schema changes | **Likely optional/minor** | Book 242: possible `chargeback_events`, production gateway seed |
| RLS on payment tables | **Present** | Book 57 migration; sandbox payment RLS |
| Migration parity before **production** | **Required** | PRECONDITION — staging must match 128/128 |
| Migration parity before **R14-A coding** | **Recommended** not mandatory | Test DB generally current; main dev DB stale |
| Migrations run in this CR | **None** | HARD STOP |

**Prisma migrate status:** Not reliably captured in audit environment (CLI output empty). Book 241 evidence stands.

---

## 6. Security readiness

| Control | Status | Evidence |
|---------|--------|----------|
| No secret leakage in repo | **PASS** | No PSP keys in `.env.example`; mock secret ref only |
| No PAN/CVV storage | **PASS** | Book 35 CONFIRMED; `pci.spec.ts` |
| Webhook replay protection | **PASS** (sandbox) | `PaymentWebhookEvent` unique `providerEventId` |
| Signature validation | **PARTIAL** | Sandbox HMAC only — live PSP TBD |
| Idempotency | **PASS** | Payment + webhook duplicate handling |
| Authorization boundaries | **PASS** | Principal-scoped payment APIs |
| Country isolation | **PASS** | Policy + routing by country |
| Fail-closed production routing | **PASS** | Sandbox-only router filter; pack gates |
| Sandbox/live separation | **PARTIAL** | Schema `environment` field; not wired for production |
| Audit events | **PARTIAL** | Outbox `PAYMENT_*`; limited security-events |
| RLS | **PASS** (sandbox payment) | Book 57; Book 241 test DB spot-check |
| `USING(true)` regressions | **No new risk** | Book 241: 0 live on test DB |

---

## 7. Test / build / runtime evidence

### Build / typecheck (audit run 30 Aug 2026)

| Target | Result | Notes |
|--------|--------|-------|
| `api` (`tsc --noEmit`) | **PASS** | Direct `apps/api` tsc exit 0 |
| `web-customer` (`tsc --noEmit`) | **FAIL** | TD-WEB-TC-01: `store-home.tsx` L174 `onRetry` vs `action.onClick` |
| `web-admin` (`tsc --noEmit`) | **PASS** | Direct tsc exit 0 |
| `web-affiliate` | **NOT RUN** | Book 241: PASS at last full audit |
| `mobile` | **NOT RUN** | Book 241: PASS at last full audit |
| `api:build` (nx) | **NOT RUN** | nx wrapper produced no output in audit shell |

### Tests (audit run)

| Suite | Result | Notes |
|-------|--------|-------|
| `payment.e2e.spec.ts` | **1/1 PASS** | Single sandbox integration test; 16s |
| R12 regression (full) | **NOT RUN** | Book 241: 32/32 isolated; pollution if combined |
| R13 regression (full) | **NOT RUN** | Book 240: 34/35 isolated |

### Runtime

| Check | Result |
|-------|--------|
| `/health/ready` | **NOT REACHABLE** — API not running on localhost:3000 |
| Docker services | **NOT VERIFIED** |
| DB connectivity | **NOT VERIFIED** live (tests imply test DB when e2e runs) |
| Sandbox payment flow | **PASS** via `payment.e2e` |
| Webhook behavior | **Covered** in payment e2e (sandbox HMAC) |

### Failure classification

| Item | Type |
|------|------|
| TD-WEB-TC-01 | **DEBT** — genuine type error |
| TD-REG-R13B-01 / TD-REG-ENV-01 | **Test pollution** — environmental |
| R13b flake | **Environmental** per Book 240 |

---

## 8. R14-A implementation plan sanity check (Book 242 vs repo)

### Likely modules/files to change (R14-A — not implemented)

| Area | Files / modules |
|------|-----------------|
| Live adapter | `apps/api/src/payment/*.live.adapter.ts` (new) |
| Port DI | `payment.module.ts`, `payment.service.ts` |
| Router | `payment/router.ts` — production environment |
| Webhooks | `payment/hmac.ts` or provider module, `webhook.controller.ts` |
| Webhook ingest | `payment.service.ts` `ingestWebhook` |
| Seed/config | `payment/seed.ts` — production gateway rows (gated) |
| Tests | `payment/r14a.live-psp.e2e.spec.ts` (new) |
| Optional schema | chargeback events migration CR |
| Admin | `payment/admin.controller.ts` — reconcile views |

### Dependencies

- Named PSP (human gate 1) before adapter SDK selection  
- Vault credentials (gate 6) before integration testing against PSP test mode  
- Policy pack remains fail-closed — no auto-enable  

### Rollout / rollback (per Book 242)

- Rollback: `payments.enabled=false`; route sandbox only  
- Deploy order: migrate → API (when migrations exist)  
- Production activation: explicit pack publish + human gates  

---

## 9. Blocker / precondition / debt matrix

| ID | Item | Classification |
|----|------|----------------|
| HG-1..7 | All seven human gates | **HUMAN DECISION** — **BLOCKER** for R14-A impl |
| ENG-R14A-01..03 | Port DI, live adapter, live webhooks | **R14-A scope** — not pre-blockers |
| TD-WEB-TC-01 | Customer web typecheck | **PRECONDITION** for customer checkout go-live |
| DB-LAG | Main DB ~28 migrations behind | **PRECONDITION** for staging/prod parity |
| TD-REG-* | Test pollution | **DEBT** — hygiene before R14-G |
| TD-R13E-01 | Analytics worker wiring | **NON-BLOCKER** |
| PCI-SAQ | No attestation | **HUMAN DECISION** — gate 7 |
| RUNTIME | API not running in audit | **NON-BLOCKER** for audit |
| R10-E/F | Not started | **NON-BLOCKER** for R14-A |

---

## 10. Exact work remaining before R14-A

### Human track (BLOCKING)

1. Populate Book 247 with all seven gate decisions (safe references only)  
2. Update Book 35 `DECIDED` rows where applicable  
3. Re-run gate verification → **`R14_A_GATES_GREEN`**  

### Engineering track (after gates green)

1. Refactor `PaymentService` to use `PaymentGatewayPort` via router/DI  
2. Implement live PSP adapter (test mode first)  
3. Extend `PaymentRouter` for `production` environment (fail-closed default)  
4. Provider webhook signature + event mapping  
5. Add `r14a.live-psp.e2e` test suite per Book 242  
6. Optional: chargeback schema if required by PSP  

### Parallel hygiene (non-blocking for R14-A start)

- TD-WEB-TC-01 fix  
- Main DB `migrate deploy` for dev parity  
- TD-REG-* test isolation before R14-G  

---

## 11. Stale / superseded items

| Item | Status |
|------|--------|
| Book 241 migration count (128) | **Still accurate** |
| Book 248 gate verdict | **Still accurate** — confirmed |
| Book 247 incomplete | **Still accurate** — CR-249 did not add evidence |
| `R14_PLAN_GREEN` | **Still valid** — plan only, not impl auth |
| Illustrative PSP names in Book 242 | **Stale as approvals** — never were evidence |

---

## 12. Boundary verification

| Boundary | Result |
|----------|--------|
| R14-A unimplemented | **PASS** |
| Live PSP disabled | **PASS** |
| PaymentRouter sandbox-only | **PASS** |
| Production country pack disabled | **PASS** |
| Clinical search disabled | **PASS** |
| R14-B…G untouched | **PASS** |
| R12/R13 code unchanged in audit CR | **PASS** |
| No fabricated human approvals | **PASS** |

---

## 13. Final verdict and next authorization

### Verdict

**`R14_A_ENGINEERING_READY_HUMAN_GATES_BLOCKED`**

### Rationale

- **Engineering:** Sandbox payment kernel, port abstraction, router, webhooks (sandbox), state machine, finance hooks, and policy gates exist. R14-A work is **well-scoped extension**, not greenfield.  
- **Human/legal/commercial:** **0 / 7 gates evidenced** — definitive blocker per Books 247–248.  
- **Not** `R14_A_READY_FOR_IMPLEMENTATION` — human gates fail.  
- **Not** `R14_A_ENGINEERING_BLOCKED` — no technical redesign blocker prevents R14-A once gates pass.

### Exact next authorization

**Do NOT authorize `CR-R14-A-IMPL-244`.**

**Required next actions (in order):**

1. **Human owners** — supply seven gate decisions; complete [247](247_R14_A_HUMAN_GATE_EVIDENCE.md)  
2. **`CR-PRE-R14-A-GATE-251`** (or successor) — gate re-verification targeting **`R14_A_GATES_GREEN`**  
3. Only then **`CR-R14-A-IMPL-244`**

**HARD STOP** — no R14-A implementation in CR-250.

---

## 14. Documentation changes

| Artifact | Update |
|----------|--------|
| `docs/blueprint/250_R14_A_PREIMPLEMENTATION_AUDIT.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |
