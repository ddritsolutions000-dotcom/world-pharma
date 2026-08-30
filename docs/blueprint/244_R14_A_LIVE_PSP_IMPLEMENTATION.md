# 244 — R14-A live PSP implementation (blocked)

**CR:** `CR-R14-A-IMPL-244`  
**Verdict:** **`R14_A_IMPLEMENTATION_BLOCKED`**  
**Date:** 30 August 2026  
**Plan:** [242](242_R14_IMPLEMENTATION_PLAN.md) · **Plan audit:** [243](243_POST_R14_PLAN_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**HARD STOP** — R14-A live PSP implementation was **not started**. No source, schema, migration, API, UI, test, config, or credential changes were made.

---

## 1. Executive summary

CR-R14-A-IMPL-244 requires **explicit human/legal/commercial gate evidence** before any live PSP engineering may begin. A pre-implementation gate audit found **zero evidenced approvals** for the minimum R14-A gates. Repository and blueprint state remain consistent with Book 243: **all human gates OPEN**.

**No PSP adapter, routing changes, webhook handlers, migrations, or R14-A tests were added.**

---

## 2. Human / legal gate evidence audit

| Required gate (CR-244) | Evidence searched | Status | Notes |
|------------------------|-------------------|--------|-------|
| OD-PAY-02 PSP selected and approved | [35](35_OPEN_DECISIONS.md), [38](38_PHASE_0_DECISION_BOARD.md), all blueprint books, repo | **NOT EVIDENCED** | Book 35 **OD-PAY-02** = AUTHORIZE vs CAPTURE per category (not PSP vendor). PSP vendor choice listed as `REQUIRES_HUMAN_DECISION` in Book 38 §2 — **no vendor named, no `DECIDED` row** |
| Legal entity finalized | Books 35, 38, 241, 243 | **NOT EVIDENCED** | **OD-BRAND-01** open; **OD-I18N-06** (legal entity per country) open |
| MoR direction finalized | [35](35_OPEN_DECISIONS.md) **OD-PAY-01** | **NOT EVIDENCED** | Status open — “Do not hardcode; pack after LEGAL” |
| PSP contract approved | Books 241, 243, repo | **NOT EVIDENCED** | No contract reference, signed memo, or gate artifact |
| PSP test/production credentials in approved vault | `.env*`, repo, docs | **NOT EVIDENCED** | No Stripe/Razorpay/Adyen SDK or secret refs; mock webhook secret only |
| First target country identified and authorized | **OD-COUNTRY-01** | **NOT EVIDENCED** | Book 38: “Do not hardcode a country”; no authorized launch country pack |

### Supporting audit citations

| Source | Statement |
|--------|-----------|
| Book 243 §8 | MoR, tax, PSP, payout, carrier, PCI, country go-live — **ALL OPEN** |
| Book 241 | “Human gates OPEN”; “Do not implement R14 until plan + human gates explicitly authorized” |
| Book 38 §9 | PSP contract — **REQUIRES_HUMAN_DECISION** for live payments |
| Book 35 §Phase 2 | “Phase 2 cannot go live without: OD-PAY-01, PSP adapter choice, OD-PAY-02 for goods” — none marked DECIDED |

**No pre-R14-A gate artifact** exists (cf. [127](127_PRE_R6_A_IMPLEMENTATION_GATE.md) pattern for R6).

---

## 3. Files changed

| File | Change |
|------|--------|
| `docs/blueprint/244_R14_A_LIVE_PSP_IMPLEMENTATION.md` | **Created** (this book — blocked record) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |

**No application code, schema, migrations, tests, or config changed.**

---

## 4. PSP adapter architecture

**Not implemented.** Planned architecture (Book 242 R14-A) remains:

- Extend `PaymentGatewayPort` in `apps/api/src/payment/`
- Register live adapter alongside `MockPaymentGatewayAdapter`
- Route via existing `PaymentRouter` with `environment: 'production'` when explicitly configured
- Webhook ingestion via existing `webhook.controller.ts` pattern

---

## 5. Routing / configuration behavior

**Not implemented.** Existing behavior unchanged:

- `PaymentRouter` filters `environment: 'sandbox'` only ([`payment/router.ts`](../../apps/api/src/payment/router.ts))
- Policy pack `payments.enabled` fail-closed; empty pack blocks live payments
- Mock adapters remain the only registered `PaymentGatewayPort` implementation

---

## 6. Webhook security and idempotency

**Not implemented.** Existing sandbox webhook handling unchanged (HMAC via `hmac.ts`, `PaymentWebhookEvent` idempotency per Book 57).

---

## 7. Database / migrations / RLS

**Not applicable** — no migrations created or applied.

---

## 8. Security / privacy assessment

No R14-A security surface was added. Clinical search remains disabled (`clinical_search_enabled` default `false`). No PSP credentials introduced.

---

## 9. Test results

| Suite | Result | Notes |
|-------|--------|-------|
| R14-A focused tests | **NOT RUN** | No R14-A implementation |
| Existing payment e2e | **NOT RUN** | No code changes; not required for blocked CR |

---

## 10. Typecheck / build results

| Target | Result | Notes |
|--------|--------|-------|
| `api:typecheck` | **NOT RUN** | No code changes |
| `api:build` | **NOT RUN** | No code changes |
| `web-customer:typecheck` | **NOT RUN** | No code changes |

---

## 11. Runtime evidence

No runtime changes. Payment kernel remains sandbox/mock only.

---

## 12. Technical debt

Unchanged from Book 243:

| ID | Status |
|----|--------|
| TD-WEB-TC-01 | Open |
| TD-REG-R13B-01 / TD-REG-ENV-01 | Open |
| Main DB migration lag (~28 behind) | Open |

---

## 13. Boundary verification

| Boundary | Status |
|----------|--------|
| R14-B…G not implemented | **PASS** (not started) |
| R12/R13 preserved | **PASS** (no changes) |
| Clinical search disabled | **PASS** |
| No live PSP / payout / carrier | **PASS** |
| No production country pack enablement | **PASS** |
| No duplicate payment kernel | **PASS** (no new code) |

---

## 14. Documentation changes

| Artifact | Update |
|----------|--------|
| `244_R14_A_LIVE_PSP_IMPLEMENTATION.md` | Created — blocked record |
| `00_MASTER_INDEX.md` | Book 244 row |
| `93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R14-A blocked; human gates required |

---

## 15. R14-B+ boundary

R14-B (settlement/reconciliation), R14-C (payout), R14-D (carrier), R14-E (tax), R14-F (go-live orchestration), R14-G (closure) — **not in scope** and **not started**.

---

## 16. Final verdict and next authorization

### Verdict

**`R14_A_IMPLEMENTATION_BLOCKED`**

### Reason

Required human/legal/commercial gates for the first target country are **not evidenced**. Per CR-244 authorization rules, live PSP implementation **must not proceed**.

### Required before re-attempting R14-A

Humans must produce and publish a **gate evidence artifact** (recommended: `CR-PRE-R14-A-GATE-*` or equivalent) documenting at minimum:

1. **Named PSP vendor** (contracted provider — not illustrative examples)
2. **First target country** (ISO + legal authorization)
3. **Legal entity** and **MoR direction** (OD-PAY-01 decided for that country)
4. **Signed PSP contract** reference (commercial approval)
5. **Vault/secret mechanism** for PSP test credentials (operational evidence — not committed to repo)
6. **PCI scope** acknowledgment for hosted-fields integration

### Exact next authorization

**Do not proceed to `CR-POST-R14-A-AUDIT-245`** — no implementation exists to audit.

**Re-authorize `CR-R14-A-IMPL-244`** (or successor gate CR) **only after** human gate evidence is published and verified.

**HARD STOP** — no R14-A implementation, live activation, production migration, or country enablement.
