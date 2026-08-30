# 242 — R14 Live finance & live carriers implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** `CR-R14-PLAN-242`  
**Date:** 30 August 2026  
**FINAL STATUS:** **`R14_PLAN_READY`**

**Prerequisite:** R13 closed — **`R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`** ([240](240_POST_R13_H_AUDIT.md), [241](241_FULL_PROJECT_AUDIT.md)).

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [241](241_FULL_PROJECT_AUDIT.md) · [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) · [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) · [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md) · [21](21_API_ARCHITECTURE.md) · [20](20_DATABASE_ARCHITECTURE.md) · [27](27_SECURITY_ARCHITECTURE.md) · [35](35_OPEN_DECISIONS.md) · `apps/api/src/payment/` · `apps/api/src/finance/` · `apps/api/src/logistics/`

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, migrations, UI, policy enablement, credentials, or database changes under this CR. **Do not** start R14 implementation, R10-E/F, R13 expansion, or clinical-search enablement.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R14** go-live gate so future **CR-R14-*-IMPL** work can connect **live PSP**, **live payout**, **live carrier**, and **tax/statutory** rails to the existing sandbox commerce kernel — **without** duplicating payment, ledger, finance, logistics, or notification kernels.

R14 is a **GO-LIVE GATE**, not a feature sprint ([93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §R14). Technical implementation readiness ≠ production authorization.

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI / APIs | Plan only |
| R14 IMPL authorization | Requires **CR-POST-R14-PLAN-AUDIT-243** green, then human gates + **CR-R14-*-IMPL-*** |
| Live PSP/payout/carrier activation | EXTERNAL PROVIDER + HUMAN APPROVAL |
| Production country-pack enablement | HUMAN APPROVAL |
| `clinical_search_enabled` enablement | OD-R13-04 separate |
| R10-E/F implementation | Optional; does not block R14 planning |
| R13 expansion | Program closed |
| ML, symptom-to-drug, clinical decision support | Out of scope |
| Fixing TD-WEB-TC-01, test pollution, main DB lag | Separate hygiene CRs |

### Boundary labels

| Label | Meaning |
|-------|---------|
| **IMPLEMENTATION** | Engineering work in repo |
| **EXTERNAL PROVIDER DEPENDENCY** | Contracted third party required |
| **HUMAN APPROVAL** | Legal/commercial/ops sign-off |
| **OPERATIONAL GO-LIVE GATE** | Runbook, monitoring, rollback validated in prod-like env |

---

## 1. Current-state baseline (Book 241)

Incorporated from **CR-FULL-PROJECT-AUDIT-241** — not re-fixed in this CR.

| Item | Status |
|------|--------|
| R12-A–H | **COMPLETE** / CLOSED |
| R13-A–H | **COMPLETE** / CLOSED |
| R13-G clinical search | Implemented; **operationally disabled** (`clinical_search_enabled` default `false`) |
| R10-E/F | **NOT STARTED** (optional) |
| Live PSP | **NOT integrated** — `MockPaymentGatewayAdapter` only |
| Live payout | **No live rail** — `MockPayoutAdapter` + `PayoutPort` |
| Live carrier | **Mock logistics only** — `MockCarrierAdapter` + `CarrierPort` |
| Tax / MoR / legal entity | **Human gates OPEN** (OD-PAY-*, OD-MOR) |
| Production country packs | **Not authorized** |
| Repository migrations | **128** folders (`packages/database/prisma/migrations`) |
| `worldpharma_test` | **130** `_prisma_migrations` records (possible duplicate entries) |
| Main `worldpharma` | **100** applied — **~28 behind** repository; R13-G table absent |
| `web-customer:typecheck` | **FAIL** — TD-WEB-TC-01 |
| R13 test pollution | TD-REG-R13B-01, TD-REG-ENV-01 — **non-blocking** |

**R14 readiness today:** **NOT READY** for production money or carriers.

---

## 2. R14 architecture — kernel reuse

### 2.1 Existing kernels to extend (do not duplicate)

| Kernel | Module | R14 role |
|--------|--------|----------|
| Cart / checkout | `cart/` | Unchanged contract; quote remains server-authoritative |
| Orders | `orders/` | Fulfillment trigger after live capture |
| Payment | `payment/` — `PaymentService`, `PaymentRouter`, `PaymentGatewayPort`, webhooks | Add **production** gateway adapter(s) |
| Finance / ledger | `finance/` — journals, settlement, `AffiliateLiability` | Live settlement posting; payout orchestration |
| Refunds | `payment/` refund state machine | Live refund via PSP port |
| Reconciliation | `payment/` + `finance/` | PSP + carrier actual-cost recon |
| Affiliate liability | `AffiliateLiability` model + finance | Accrual exists; **payout execution** is R14 |
| Logistics / shipping | `logistics/` — `CarrierPort`, webhooks, state machine | Add **production** carrier adapter(s) |
| Notifications | `platform/notification*` + outbox | Payment/shipment/payout events |
| Outbox / events | `events/` | No second dispatcher |
| Identity / RBAC | `identity/` | Admin finance/logistics permissions |
| Policy resolver | `policy/` | `payments.enabled`, gateway_refs, carrier flags — **fail-closed** |
| Audit / security events | `identity/security-events.service.ts` | Payment/payout/carrier admin actions |

### 2.2 Adapter pattern (already present)

| Port | Sandbox adapter | R14 needs |
|------|-----------------|-----------|
| `PaymentGatewayPort` | `mock.adapter.ts` | **Live PSP adapter** (e.g. Stripe/Razorpay/Adyen — **OD-PAY-02**) |
| `PayoutPort` | `mock-payout.adapter.ts` | **Live payout adapter** (**OD-PAY-08**) |
| `CarrierPort` | `mock.adapter.ts` | **Live carrier adapter** (e.g. DHL — **contract**) |

`PaymentRouter` already filters `environment: 'sandbox'` ([`payment/router.ts`](../../apps/api/src/payment/router.ts) L36). R14 adds `production` environment routing without a second router.

### 2.3 Missing kernels (R14 scope)

| Gap | Classification |
|-----|----------------|
| Live PSP adapter implementation | **IMPLEMENTATION** + **EXTERNAL PROVIDER** |
| Chargeback/dispute ingestion | **IMPLEMENTATION** (schema + webhook) |
| Production payout KYC/beneficiary verification | **IMPLEMENTATION** + **HUMAN APPROVAL** |
| Tax calculation / invoicing engine | **IMPLEMENTATION** or **EXTERNAL PROVIDER** + **HUMAN APPROVAL** |
| FX rate source (live) | **EXTERNAL PROVIDER** |
| Country go-live orchestration service | **IMPLEMENTATION** (read-only gate checker) |
| Production secrets vault integration | **OPERATIONAL GO-LIVE GATE** |
| PCI SAQ / attestation workflow | **HUMAN APPROVAL** (PSP-hosted fields assumed) |

**No duplicate** payment, ledger, finance, or carrier kernels proposed.

---

## 3. Live PSP plan

| Topic | Classification | Notes |
|-------|----------------|-------|
| Provider selection | **HUMAN APPROVAL** (OD-PAY-02) | Named PSP per country/legal entity |
| Sandbox vs production separation | **IMPLEMENTATION** | `PaymentGateway.environment`; separate credentials via `secret_ref` |
| Payment authorization | **IMPLEMENTATION** | Extend `PaymentGatewayPort.submit` / state machine |
| Capture | **IMPLEMENTATION** | Port `capture()` — exists on interface |
| Payment failure | **IMPLEMENTATION** | Existing FAILED terminal states |
| Retries | **IMPLEMENTATION** | Pre-submit failover only (Book 57); post-submit UNKNOWN + reconcile |
| Webhook handling | **IMPLEMENTATION** | `webhook.controller.ts` + HMAC — extend for live provider |
| Webhook signature validation | **IMPLEMENTATION** | `payment/hmac.ts` pattern exists |
| Replay protection | **IMPLEMENTATION** | `PaymentWebhookEvent` idempotency (Book 57) |
| Idempotency | **IMPLEMENTATION** | Intent/attempt keys; checkout idempotency |
| Refund | **IMPLEMENTATION** | Port `refund()` + admin APIs |
| Chargeback/dispute | **IMPLEMENTATION** + **HUMAN APPROVAL** | New webhook types; MoR responsibility |
| Settlement (PSP → platform) | **IMPLEMENTATION** + **EXTERNAL PROVIDER** | PSP settlement reports |
| Reconciliation | **IMPLEMENTATION** | `PaymentReconciliation` — extend for live breaks |
| Failure recovery | **OPERATIONAL GO-LIVE GATE** | Runbooks for UNKNOWN intents |
| Monitoring | **OPERATIONAL GO-LIVE GATE** | Metrics exist (`payment_*`); alerting |
| Rollback | **OPERATIONAL GO-LIVE GATE** | Pack flag `payments.enabled=false`; route to sandbox |

**PCI:** Hosted fields / tokenization only — no PAN/CVV storage ([57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md)). **HUMAN APPROVAL** for SAQ scope.

---

## 4. Payout plan

| Topic | Classification | Notes |
|-------|----------------|-------|
| Affiliate payout readiness | **IMPLEMENTATION** | `AffiliateLiability` accrual exists; payout batch linkage |
| Payout provider | **EXTERNAL PROVIDER DEPENDENCY** + **HUMAN APPROVAL** (OD-PAY-08) |
| KYC / beneficiary verification | **HUMAN APPROVAL** + **IMPLEMENTATION** | Partner KYC exists; payout account verification new |
| Payout ledger boundary | **IMPLEMENTATION** | Post via existing `journal_lines`; separate payout accounts |
| Payout approval | **HUMAN APPROVAL** | Maker-checker for production batches (R15 overlap) |
| Payout execution | **IMPLEMENTATION** | `PayoutPort.submit` — live adapter |
| Reconciliation | **IMPLEMENTATION** | Match provider statements to `Payout` rows |
| Failure / reversal | **IMPLEMENTATION** | FAILED/UNKNOWN states; reversal journals |
| Audit events | **IMPLEMENTATION** | `PAYOUT_*` security events |
| Production controls | **OPERATIONAL GO-LIVE GATE** | Limits, dual approval, country scope |

**Separation:** `AffiliateLiability` = **obligation accrual** (R6/R12). **Payout execution** = R14 live rail. Vendor settlement uses `SettlementBatch` / `SettlementLine` — same payout port pattern, different beneficiary type.

---

## 5. Carrier plan

| Topic | Classification | Notes |
|-------|----------------|-------|
| Carrier provider | **EXTERNAL PROVIDER DEPENDENCY** + **HUMAN APPROVAL** | Contracted carrier (e.g. DHL if OD names it) |
| Production contract | **HUMAN APPROVAL** | Coverage, SLA, regulated shipping |
| Credentials | **EXTERNAL PROVIDER** + **OPERATIONAL GO-LIVE GATE** | Secrets store; no repo secrets |
| Shipment creation | **IMPLEMENTATION** | `CarrierPort.createShipment` |
| Labels | **IMPLEMENTATION** | `createLabel()` on port |
| Tracking | **IMPLEMENTATION** | `track()` + customer tracking UI |
| Status webhooks | **IMPLEMENTATION** | `webhook.controller.ts` + `verifyWebhook` |
| Cancellation | **IMPLEMENTATION** | `cancelShipment()` |
| Delivery failure / retries | **IMPLEMENTATION** + **OPERATIONAL** | State machine in `logistics/state.ts` |
| Reconciliation | **IMPLEMENTATION** | `fetchInvoice()` actual-cost vs quoted |
| Country-specific config | **IMPLEMENTATION** | Policy pack + routing rules |
| Monitoring | **OPERATIONAL GO-LIVE GATE** | Stuck shipments, webhook lag |
| Rollback | **OPERATIONAL GO-LIVE GATE** | Disable live carrier; mock fallback per country |

**Separation:** Mock carrier ([61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md)) remains for non-live countries. Production adapter selected by policy + router — same `CarrierPort`.

---

## 6. Tax / MoR / legal plan

Explicit **HUMAN APPROVAL** gates (do not assume approval):

| Gate | ID / topic | R14 technical hook |
|------|------------|---------------------|
| Legal entity per country | OD-BRAND / company structure | `legal_entity_id` on routing rules |
| Merchant of Record | OD-PAY-01 / OD-MOR | Pack field; refund/chargeback owner |
| Tax registration | Country tax authority | Pack `tax.*` config |
| Invoicing requirements | Statutory format | Invoice generation service (R14-E) |
| Payment ownership | MoR decision | PSP account ownership |
| Refund responsibility | MoR + policy | Refund APIs + ledger |
| Chargeback responsibility | MoR + PSP agreement | Dispute workflow |
| Payout obligations | Affiliate/vendor contracts | Settlement policy |
| Country-specific compliance | Pharmacy/Rx shipping if applicable | Pack `shipping.rx`, `shipping.controlled` |

**No legal/commercial approval is granted by this plan.**

---

## 7. Country-pack go-live plan

A country may enable **live rails** only when **all required gates** have evidence. Default: **OFF** (sandbox/mock).

### Prerequisites checklist (per country)

| # | Gate | Type |
|---|------|------|
| 1 | Legal entity + MoR signed | HUMAN APPROVAL |
| 2 | Tax registration + invoicing rules | HUMAN APPROVAL |
| 3 | PSP contract + production credentials | EXTERNAL + HUMAN |
| 4 | Payout provider + beneficiary rules | EXTERNAL + HUMAN |
| 5 | Carrier contract + coverage | EXTERNAL + HUMAN |
| 6 | Published policy pack with `payments.enabled=true`, production `gateway_refs`, carrier flags | HUMAN APPROVAL |
| 7 | Operational support runbook | OPERATIONAL |
| 8 | Monitoring + alerting | OPERATIONAL |
| 9 | Rollback tested | OPERATIONAL |
| 10 | `clinical_search_enabled` | **Separate OD-R13-04** — not part of R14 commerce go-live |

**Pack enablement remains OFF** until humans publish an approved pack version. Engineering provides a **read-only go-live readiness report** API (R14-F) — not auto-enable.

---

## 8. Security / privacy / PHI

| Control | R14 plan |
|---------|----------|
| RBAC | Finance (`finance:*`), payment admin, logistics admin — extend for live ops |
| RLS | New R14 tables follow FORCE RLS pattern; no `USING(true)` |
| Country / tenant isolation | Existing `runWithTenant`; pack-scoped routing |
| Webhook authentication | HMAC + timestamp + idempotent event store |
| Secrets management | `secret_ref` only in DB; vault injection at runtime — **OPERATIONAL** |
| Idempotency | Payment, payout, shipment booking keys |
| Replay protection | Webhook event IDs |
| Audit events | `PAYMENT_*`, `PAYOUT_*`, `CARRIER_*`, `COUNTRY_GO_LIVE_*` |
| Sensitive logging | No PAN/CVV; no raw webhook bodies in logs |
| PHI boundaries | R14 does not expand PHI; clinical search stays **disabled** (OD-R13-04) |
| Clinical data isolation | No change to R9/R13-G boundaries in R14 |

---

## 9. Database and migration strategy

**Current drift (audit 241 — do NOT fix in CR-242):**

| Target | State |
|--------|-------|
| Repository | 128 migration folders |
| `worldpharma_test` | 130 applied records |
| Main `worldpharma` | 100 applied (~28 behind) |

### Pre-production migration verification

| Step | Owner |
|------|-------|
| `prisma migrate diff` / status on staging | **IMPLEMENTATION** |
| Apply all migrations to staging clone | **OPERATIONAL** |
| Schema verification script (R13 tables + payment/finance) | **IMPLEMENTATION** |
| Align main dev DB before R14-IMPL | **OPERATIONAL** (non-blocker for planning) |

### Production migration gate

| Control | Classification |
|---------|----------------|
| Backup before migrate | **OPERATIONAL GO-LIVE GATE** |
| Ordered deploy (migrate → API) | **OPERATIONAL** |
| Rollback = forward-fix migration only | **OPERATIONAL** |
| No migrate in CR-242 | **This CR** |

---

## 10. R10-E/F dependency

| Question | Answer (Book 93 + Book 241) |
|----------|----------------------------|
| Does R10-E/F block R14 planning? | **No** |
| Does R10-E/F block any R14 sub-phase? | **No evidence** — health uploads and consult-note projection do not touch PSP/payout/carrier |
| Can R10-E/F proceed independently? | **Yes** — optional separate CRs |
| Scheduling | **UNRESOLVED — HUMAN/PLANNING DECISION REQUIRED** for priority only |

R14-A (PSP) does not depend on R10-E/F. If insufficient evidence emerges during R14-IMPL, re-assess — do not invent dependency now.

---

## 11. Technical debt classification

| ID | Description | Classification |
|----|-------------|----------------|
| **TD-WEB-TC-01** | web-customer typecheck | **Production-readiness dependency** (customer checkout UI build); **not R14-A blocker** for API/kernel |
| **TD-R13E-01** | Analytics worker not on outbox | **Non-blocker** for R14 |
| **TD-R13D-01/02/03** | Mobile/recs deferred | **Non-blocker** |
| **TD-REG-R13B-01** | r13b TQ pollution | **Non-blocker**; **test debt** |
| **TD-REG-ENV-01** | Cross-suite test pollution | **Non-blocker**; recommend hygiene before R14-H |
| **Main DB migration lag** | 100 vs 128 | **Production-readiness dependency** for dev/staging parity; **OPERATIONAL** |

None are **R14 blockers** for planning authorization. TD-REG-* should be closed before R14-G closure regression.

---

## 12. R14 phased implementation plan

Proposed sub-phases. Each requires separate **CR-R14-*-IMPL-*** after plan audit + human gates.

### R14-A — Live PSP kernel

| Attribute | Detail |
|-----------|--------|
| **Objective** | Production `PaymentGatewayPort` adapter + routing + webhooks |
| **Scope** | First contracted PSP; authorize/capture/refund; production `PaymentRouter` |
| **Dependencies** | OD-PAY-02 PSP selected; legal entity; sandbox parity tests |
| **Modules** | `payment/` — new `*.live.adapter.ts`, router env filter, webhook parser |
| **Schema** | Possible: `chargeback_events`, production gateway seed — migration CR |
| **API** | Extend webhooks; admin reconcile; no new customer surface required |
| **UI** | web-admin payments reconciliation views (enhance existing) |
| **Tests** | `r14a.live-psp.e2e` — sandbox contract tests + PSP test mode |
| **Security** | HMAC, replay, idempotency, no PAN storage |
| **Acceptance** | Test-mode capture/refund E2E; UNKNOWN reconcile path; pack gate OFF by default |
| **Rollback** | `payments.enabled=false`; route sandbox only |
| **External** | PSP SDK/API credentials |
| **Human** | MoR, PSP contract, PCI SAQ |

### R14-B — Settlement & PSP reconciliation

| Attribute | Detail |
|-----------|--------|
| **Objective** | PSP settlement reports → ledger; break detection |
| **Scope** | Import settlement files/API; `PaymentReconciliation` live breaks |
| **Dependencies** | R14-A |
| **Modules** | `payment/`, `finance/` |
| **Schema** | Settlement import staging tables if needed |
| **Tests** | `r14b.reconciliation.e2e` |
| **Acceptance** | Matched/break workflows; journal posts on match |
| **Human** | Accounting rules, settlement calendar |

### R14-C — Live payout execution

| Attribute | Detail |
|-----------|--------|
| **Objective** | `PayoutPort` live adapter for affiliate/vendor payouts |
| **Scope** | Batch approval → submit → reconcile; not liability accrual (exists) |
| **Dependencies** | R14-B (recommended); OD-PAY-08 |
| **Modules** | `finance/` |
| **Schema** | Beneficiary account verification fields |
| **Tests** | `r14c.payout.e2e` |
| **Acceptance** | Test-mode payout; failure/reversal; audit events |
| **External** | Payout provider |
| **Human** | KYC, dual approval |

### R14-D — Live carrier integration

| Attribute | Detail |
|-----------|--------|
| **Objective** | Production `CarrierPort` — quote, book, label, track, webhook |
| **Scope** | First contracted carrier; actual-cost recon |
| **Dependencies** | Carrier contract; R1 logistics state machine |
| **Modules** | `logistics/` |
| **Tests** | `r14d.carrier.e2e` |
| **Acceptance** | Label + tracking E2E in test env; webhook status updates |
| **External** | Carrier API |
| **Human** | Regulated shipping review, coverage map |

### R14-E — Tax & invoicing hooks

| Attribute | Detail |
|-----------|--------|
| **Objective** | Tax lines on orders/invoices per country pack |
| **Scope** | Technical hooks only; rules from approved pack |
| **Dependencies** | MoR + tax registration (**HUMAN**) |
| **Modules** | `orders/`, `finance/`, new `tax/` thin module or `finance/tax` |
| **Tests** | `r14e.tax.e2e` |
| **Acceptance** | Invoice artifact with tax breakdown; no live enable without pack |
| **Human** | Tax authority registration, invoice statutory format |

### R14-F — Country go-live orchestration

| Attribute | Detail |
|-----------|--------|
| **Objective** | Readiness report + admin workflow; **no auto-enable** |
| **Scope** | Gate matrix checker; pack publish still human-driven |
| **Dependencies** | R14-A…E implemented in test mode |
| **Modules** | `policy/`, `governance/`, web-admin |
| **Tests** | `r14f.go-live.e2e` |
| **Acceptance** | All gates red until evidence uploaded; fail-closed |
| **Human** | Final go-live sign-off committee |

### R14-G — Closure / regression

| Attribute | Detail |
|-----------|--------|
| **Objective** | Combined R14 + R12/R13 preservation; go-live gate matrix signed |
| **Scope** | `r14g.closure.e2e`; R12 32/32; R13 35/35; TD-REG-* hygiene |
| **Dependencies** | R14-A…F |
| **Verdict target** | **`R14_GREEN_PRODUCTION_GO_LIVE_AUTHORIZED`** (per-country, not global) |

**Parallel hygiene (optional, not R14 sub-phases):** TD-WEB-TC-01 fix; test DB reset; main DB migrate.

---

## 13. Go-live gate matrix

| Gate | Category | Evidence required | Owner | Status |
|------|----------|-------------------|-------|--------|
| R13 program closed | Technical | Book 240/241 | Engineering | **Evidence: 240/241** |
| Sandbox payment kernel | Technical | Book 57, `payment.e2e` | Engineering | **Evidence: repo** |
| Sandbox ledger/settlement | Technical | Book 63, `finance.e2e` | Engineering | **Evidence: repo** |
| Mock logistics kernel | Technical | Book 61, `logistics.e2e` | Engineering | **Evidence: repo** |
| Live PSP adapter | Technical | R14-A impl + test-mode E2E | Engineering | **NOT STARTED** |
| PSP contract + credentials | External Provider | Signed agreement, vault secrets | Commercial | **OPEN** |
| MoR designation | Human Approval | Board/legal memo | Legal | **OPEN** |
| Legal entity per country | Human Approval | Entity registration | Legal | **OPEN** |
| Tax registration | Human Approval | Tax IDs, rules doc | Legal/Finance | **OPEN** |
| PCI SAQ (hosted fields) | Human Approval | SAQ attestation | Compliance | **OPEN** |
| Live payout provider | External Provider | Contract + test payouts | Commercial | **OPEN** |
| Carrier contract | External Provider | DHL or alternate contract | Commercial | **OPEN** |
| Production pack publish | Human Approval | Published pack with live flags | Compliance + Legal | **OPEN** |
| Staging migration parity | Operational | 128/128 migrations applied | DevOps | **OPEN** (main DB behind) |
| Monitoring & alerting | Operational | Dashboards, on-call | Ops | **OPEN** |
| Rollback drill | Operational | Documented + exercised | Ops | **OPEN** |
| Clinical search | Human Approval | OD-R13-04 separate | Legal | **DISABLED** |
| R14 plan approved | Human Approval | Book 243 audit green | Program | **PENDING** |

No gate marked approved without evidence.

---

## 14. Production readiness summary

| Area | Already implemented | Sandbox-ready | Needs implementation | Needs external provider | Needs human approval | Needs operational validation |
|------|---------------------|---------------|----------------------|-------------------------|----------------------|------------------------------|
| Checkout / cart | ✓ | ✓ | | | | |
| Payment state machine | ✓ | ✓ | Live adapter | PSP | MoR, PCI | Webhook monitor |
| Refunds | ✓ | ✓ | Live refund path | PSP | | |
| Ledger / journals | ✓ | ✓ | Live settlement import | | Accounting rules | |
| Affiliate liability accrual | ✓ | ✓ | | | | |
| Payout execution | Port only | Mock | Live adapter | Payout provider | KYC | |
| Vendor settlement batches | ✓ | ✓ | Live payout link | | | |
| Logistics state machine | ✓ | ✓ | Live adapter | Carrier | Contract | |
| Tax / invoicing | Partial | | R14-E | Tax API optional | Tax reg | |
| Country live enablement | Pack schema | | R14-F checker | | Pack publish | Rollback drill |
| Customer web build | | | TD-WEB-TC-01 | | | |
| Clinical search | Infra only | Disabled | | | OD-R13-04 | |

**Code completion ≠ production ready.**

---

## 15. Explicit exclusions

- R13 expansion (search, analytics, clinical enablement)
- R10-E/F implementation
- ML / symptom-to-drug / clinical decision support
- Unauthorized clinical-search enablement
- Unauthorized PSP, payout, or carrier activation
- Unauthorized production country-pack publish
- Live credentials in repository
- R15 BC/DR (separate wave; overlaps maker-checker)

---

## 16. Documentation

| Artifact | Status |
|----------|--------|
| `docs/blueprint/242_R14_IMPLEMENTATION_PLAN.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |

No other files changed.

---

## 17. Final output

### 1. Verdict

**`R14_PLAN_READY`**

No blocker-class issues prevent plan audit. Implementation is **not** authorized.

### 2. Current R14 readiness

**NOT READY** — sandbox kernels exist; live rails, human gates, and operational validation are **OPEN**.

### 3. R14 phased implementation plan

**R14-A** PSP → **R14-B** reconciliation → **R14-C** payout → **R14-D** carrier → **R14-E** tax hooks → **R14-F** go-live orchestration → **R14-G** closure.

### 4. Human/legal/commercial approval checklist

MoR, legal entity, tax registration, PSP contract, payout provider, carrier contract, PCI SAQ, production pack publish, go-live committee sign-off. **All OPEN.**

### 5. Technical dependencies

Extend `PaymentGatewayPort`, `PayoutPort`, `CarrierPort`, `PaymentRouter`, finance settlement, policy pack gates. No duplicate kernels.

### 6. External-provider dependencies

PSP, payout provider, carrier, optional tax/FX API.

### 7. R10-E/F dependency status

**Does not block R14 planning or implementation phases.** May proceed independently. Priority: **UNRESOLVED — HUMAN/PLANNING DECISION REQUIRED.**

### 8. Technical-debt classification

TD-WEB-TC-01 → production-readiness; TD-REG-* → test hygiene before R14-G; main DB lag → operational; others non-blocker.

### 9. Production go-live blockers

Human/legal/commercial gates (MoR, tax, contracts); live adapter implementation; operational monitoring/rollback; staging DB parity; customer web typecheck for UI go-live.

### 10. Exact next authorization

**`CR-POST-R14-PLAN-AUDIT-243`** — post-R14-plan audit only.

After plan audit green + human gates for first country: **`CR-R14-A-IMPL-244`** (or next numbered IMPL CR per index convention).

**HARD STOP:** R14 implementation is **NOT** authorized in CR-242.
