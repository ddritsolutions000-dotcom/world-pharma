# 246 — Pre-R14-A gate re-verification

**CR:** `CR-PRE-R14-A-GATE-246`  
**Verdict:** **`R14_A_GATES_BLOCKED`**  
**Date:** 30 August 2026  
**Prior gate audit:** [245](245_PRE_R14_A_GATE_VERIFICATION.md) (**R14_A_GATES_BLOCKED**)  
**Prior blocked impl:** [244](244_R14_A_LIVE_PSP_IMPLEMENTATION.md)  
**Plan:** [242](242_R14_IMPLEMENTATION_PLAN.md) · **Plan audit:** [243](243_POST_R14_PLAN_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Re-verification only. **No source, schema, migration, API, UI, routing, adapter, webhook, config, or country-pack changes were made.**

---

## 1. Executive summary

CR-246 re-ran the seven mandatory R14-A human/legal/commercial gate checks after the stated expectation that the human/business team had published authoritative evidence.

A full re-scan of project artifacts found **no new gate evidence** since Book 245. Book 35 contains **no `DECIDED` rows** for PSP vendor, launch country, legal entity, or MoR. No gate artifact, contract reference, vault reference for a named PSP, or PCI SAQ acknowledgment was added to the repository.

**All seven mandatory gates remain `NOT EVIDENCED`.**

**R14-A implementation is not authorized.**

---

## 2. Seven-gate evidence table

| # | Gate | Classification | Change since Book 245 | Approval status |
|---|------|----------------|----------------------|-----------------|
| 1 | **Named PSP** | **NOT EVIDENCED** | No change | **OPEN** |
| 2 | **First target country** | **NOT EVIDENCED** | No change | **OPEN** |
| 3 | **Legal entity** | **NOT EVIDENCED** | No change | **OPEN** |
| 4 | **Merchant of Record (OD-PAY-01)** | **NOT EVIDENCED** | No change | **OPEN** |
| 5 | **PSP contract** | **NOT EVIDENCED** | No change | **OPEN** |
| 6 | **PSP credentials / vault** | **NOT EVIDENCED** | No change | **OPEN** |
| 7 | **PCI scope acknowledgment** | **NOT EVIDENCED** | No change | **OPEN** |

**Decision rule:** ANY mandatory gate not `EVIDENCED` → **`R14_A_GATES_BLOCKED`**.

---

## 3. Evidence references (re-scan)

### Sources searched (30 August 2026)

| Source | Finding |
|--------|---------|
| [35](35_OPEN_DECISIONS.md) | No `DECIDED` status on OD-COUNTRY-01, OD-BRAND-01, OD-PAY-01, or PSP vendor |
| [38](38_PHASE_0_DECISION_BOARD.md) | PSP vendor, MoR, launch country still `REQUIRES_HUMAN_DECISION` |
| `docs/blueprint/` (all books) | No new gate artifact between Book 245 and this CR |
| `docs/**/contract*`, `docs/**/evidence*` | **Absent** |
| `.env.example` | No PSP secret key placeholders |
| `package.json` (workspace) | No Stripe/Razorpay/Adyen SDK |
| `apps/api/src/payment/` | `MockPaymentGatewayAdapter` only; `router.ts` sandbox-only |
| `apps/api/src/policy/` | `payments.enabled` blocked in empty pack; `clinical_search_enabled` default `false` |
| Payment seed | `MOCK_PRIMARY` / `MOCK_FALLBACK`, `environment: 'sandbox'`, `env:PAYMENT_MOCK_WEBHOOK_SECRET` |

### Per-gate detail

| Gate | Evidence reference | Classification |
|------|-------------------|----------------|
| Named PSP | Book 38 §2 — “PSP vendor choice” = `REQUIRES_HUMAN_DECISION`; no vendor named | **NOT EVIDENCED** |
| First target country | OD-COUNTRY-01 open; test fixture `TQ` not production authorization | **NOT EVIDENCED** |
| Legal entity | OD-BRAND-01, OD-I18N-06 open | **NOT EVIDENCED** |
| MoR | OD-PAY-01 open — “Do not hardcode; pack after LEGAL” | **NOT EVIDENCED** |
| PSP contract | No safe contract identifier in repo | **NOT EVIDENCED** |
| Vault | Mock only: `env:PAYMENT_MOCK_WEBHOOK_SECRET` | **NOT EVIDENCED** |
| PCI | Book 35 engineering default only — no SAQ attestation | **NOT EVIDENCED** |

**No credentials, API keys, tokens, passwords, or signing secrets were printed or recorded.**

---

## 4. Additional technical checks

| Check | Result | Evidence |
|-------|--------|----------|
| Production activation authority | **NOT EVIDENCED** | No human approval artifact added |
| PSP webhook requirements documented | **PARTIAL** | Sandbox HMAC (`payment/hmac.ts`) — no named PSP provider docs |
| PSP vs `PaymentGatewayPort` capabilities | **NOT APPLICABLE** | No PSP selected; port defines `submit`, `capture`, `refund`, `void`, `status` |
| Production country pack not silently enabled | **PASS** | `policy/validator.ts` rejects `payments.enabled` in empty pack |
| Clinical search disabled | **PASS** | `clinical_search_enabled` default `false` |
| R14-B…G untouched | **PASS** | No `r14*.e2e`, no live adapters |
| Live payment routing not activated | **PASS** | `PaymentRouter` filters `environment: 'sandbox'` |

---

## 5. Missing / conflicting evidence

### Missing (all mandatory — unchanged from Book 245)

1. Named PSP vendor + approval artifact  
2. Authorized first production country (not test fixture)  
3. Finalized legal entity for that country  
4. OD-PAY-01 MoR decision with evidence reference  
5. Signed PSP contract safe reference  
6. Vault credential reference for named PSP (test environment minimum)  
7. PCI SAQ / scope acknowledgment  

### Expected but not found

CR-246 stated that human/business evidence should have been published. **No authoritative artifact was located** in:

- Book 35 `DECIDED` updates  
- New blueprint gate book (e.g. signed memo, contract ref sheet)  
- Policy pack with production live-payment flags for a named country  
- Vault/secret reference documentation for a named PSP  

### Conflicting

**None.** Book 245 and Book 246 findings are **consistent**.

---

## 6. Boundary verification

| Boundary | Status |
|----------|--------|
| No R14-A implementation | **PASS** |
| No live PSP / routing / webhooks | **PASS** |
| No production country-pack enablement | **PASS** |
| Clinical search disabled | **PASS** |
| R14-B…G not started | **PASS** |
| Documentation-only changes in this CR | **PASS** |

---

## 7. Documentation changes

| Artifact | Update |
|----------|--------|
| `docs/blueprint/246_PRE_R14_A_GATE_REVERIFICATION.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |

---

## 8. Final verdict and next authorization

### Verdict

**`R14_A_GATES_BLOCKED`**

### Reason

Re-verification found **no new authoritative evidence** for any of the seven mandatory gates. Repository state is unchanged from Book 245.

### Required before R14-A may proceed

Humans must publish evidence **into the project** (recommended minimum):

| Item | Suggested artifact |
|------|-------------------|
| PSP vendor | Book 35 `DECIDED` row or signed gate memo naming provider |
| Target country | OD-COUNTRY-01 `DECIDED` with ISO2 + authorization date |
| Legal entity | OD-BRAND-01 / OD-I18N-06 `DECIDED` with entity name |
| MoR | OD-PAY-01 `DECIDED` with model (platform MoR / facilitator / vendor-as-seller) |
| Contract | Safe reference only (e.g. contract ID, effective date, counterparty) |
| Vault | Secret ref path only (e.g. `vault:r14/psp/test/api-key`) — not the secret value |
| PCI | SAQ type + acknowledgment date + owner |

Then re-run gate verification targeting **`R14_A_GATES_GREEN`**.

### Exact next authorization

**Do not authorize `CR-R14-A-IMPL-244`.**

**Re-run `CR-PRE-R14-A-GATE-*`** after evidence is published.

**HARD STOP** — no R14-A implementation or live PSP activation.
