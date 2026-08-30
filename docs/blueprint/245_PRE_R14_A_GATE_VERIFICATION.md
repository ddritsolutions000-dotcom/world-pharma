# 245 — Pre-R14-A human / legal / commercial gate verification

**CR:** `CR-PRE-R14-A-GATE-245`  
**Verdict:** **`R14_A_GATES_BLOCKED`**  
**Date:** 30 August 2026  
**Prior blocked impl:** [244](244_R14_A_LIVE_PSP_IMPLEMENTATION.md) (**R14_A_IMPLEMENTATION_BLOCKED**)  
**Plan:** [242](242_R14_IMPLEMENTATION_PLAN.md) · **Plan audit:** [243](243_POST_R14_PLAN_AUDIT.md)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Gate verification only. **No source, schema, migration, API, UI, test, config, routing, adapter, webhook, or country-pack changes were made.**

---

## 1. Executive summary

A systematic search of authoritative project evidence — blueprint books [35](35_OPEN_DECISIONS.md), [38](38_PHASE_0_DECISION_BOARD.md), [241](241_FULL_PROJECT_AUDIT.md)–[244](244_R14_A_LIVE_PSP_IMPLEMENTATION.md), open-decision catalog, policy validators, payment module, package dependencies, and `.env.example` — found **no explicit human/legal/commercial approvals** for any of the seven mandatory R14-A gates.

**All mandatory gates classify as `NOT EVIDENCED`.**

**R14-A implementation is not authorized.** Do not proceed to `CR-R14-A-IMPL-244` until humans publish gate evidence artifacts.

---

## 2. Gate-by-gate evidence table

| # | Gate | Classification | PSP / entity / reference | Approval status |
|---|------|----------------|--------------------------|-----------------|
| 1 | **Named PSP** | **NOT EVIDENCED** | No vendor named. Book 38 §2: “PSP vendor choice” = `REQUIRES_HUMAN_DECISION`. Book 35 OD-PAY-02 = capture mode (not vendor). Illustrative examples in Book 242 (Stripe/Razorpay/Adyen) are not approvals | **OPEN** |
| 2 | **First target country** | **NOT EVIDENCED** | OD-COUNTRY-01 open — “Empty pack + technical defaults; **no hardcoded IN**”. Book 38: “Do not hardcode a country”. Test country `TQ` is test data only — not production authorization | **OPEN** |
| 3 | **Legal entity** | **NOT EVIDENCED** | OD-BRAND-01 open (legal brand/entity). OD-I18N-06 open (legal entity per country). No `DECIDED` row in Book 35 | **OPEN** |
| 4 | **Merchant of Record (OD-PAY-01)** | **NOT EVIDENCED** | Book 35: “Do not hardcode; pack after LEGAL”. Book 38 §2: `REQUIRES_HUMAN_DECISION`. No board/legal memo or pack MoR field populated for launch | **OPEN** |
| 5 | **PSP contract** | **NOT EVIDENCED** | No contract reference, identifier, or signed-memo artifact in repo or blueprint. Book 38 §9: PSP contract = `REQUIRES_HUMAN_DECISION` for live payments | **OPEN** |
| 6 | **PSP credentials / vault** | **NOT EVIDENCED** | No PSP SDK in `package.json`. `.env.example` has no PSP secret keys. Seed uses `env:PAYMENT_MOCK_WEBHOOK_SECRET` for sandbox mock only. No vault reference for a named PSP | **OPEN** |
| 7 | **PCI scope acknowledgment** | **NOT EVIDENCED** | Book 35 confirms PCI principle (no PAN/CVV) as engineering default — not SAQ attestation. No SAQ reference, compliance memo, or signed acknowledgment artifact | **OPEN** |

**Decision rule:** ANY mandatory gate missing → **`R14_A_GATES_BLOCKED`**. All seven are missing.

---

## 3. PSP decision

| Field | Value |
|-------|-------|
| **PSP name** | **None authorized** |
| **Decision artifact** | None — Book 38 lists PSP vendor as `REQUIRES_HUMAN_DECISION`; no `DECIDED` entry |
| **Classification** | **NOT EVIDENCED** |
| **Notes** | Mock adapter `MOCK_PRIMARY` / `MOCK_FALLBACK` (sandbox seed) is not a PSP selection. OD-PAY-02 in Book 35 refers to AUTHORIZE vs CAPTURE per category — must not be conflated with vendor selection |

---

## 4. Target-country decision

| Field | Value |
|-------|-------|
| **Country** | **None authorized for production** |
| **Decision artifact** | OD-COUNTRY-01 — open, no `DECIDED` status |
| **Classification** | **NOT EVIDENCED** |
| **Notes** | Repository test fixtures (e.g. `TQ`) are engineering test data. Book 38 explicitly forbids inferring launch country from placeholders |

---

## 5. Legal entity decision

| Field | Value |
|-------|-------|
| **Legal entity** | **None finalized** |
| **Decision artifact** | OD-BRAND-01 (open), OD-I18N-06 (open) |
| **Classification** | **NOT EVIDENCED** |
| **Notes** | “World Pharma” remains a working title per Book 35. No `legal_entity_id` mapping published for a launch country |

---

## 6. MoR decision

| Field | Value |
|-------|-------|
| **MoR model** | **None decided** |
| **Decision artifact** | OD-PAY-01 — open in Books 35 and 38 |
| **Classification** | **NOT EVIDENCED** |
| **Notes** | Options (platform MoR vs facilitator vs vendor-as-seller) remain undecided. Blocks honest chargeback/tax configuration per Book 12 |

---

## 7. Contract evidence

| Field | Value |
|-------|-------|
| **Contract reference** | **None** |
| **Classification** | **NOT EVIDENCED** |
| **Notes** | No safe identifier (contract number, effective date, counterparty memo) exists in project artifacts. No `/legal/` or external contract registry in repo |

---

## 8. Vault evidence

| Field | Value |
|-------|-------|
| **Vault / secret reference** | **None for named PSP** |
| **Environment** | Sandbox mock only: `env:PAYMENT_MOCK_WEBHOOK_SECRET` (payment seed) |
| **Classification** | **NOT EVIDENCED** |
| **Availability** | Mock webhook secret pattern exists for sandbox testing — **not** evidence of approved PSP test/production credentials |

**No secrets, API keys, tokens, or webhook signing values are recorded in this document.**

---

## 9. PCI evidence

| Field | Value |
|-------|-------|
| **Scope / SAQ** | **None attested** |
| **Classification** | **NOT EVIDENCED** |
| **Evidence reference** | Book 35 CONFIRMED row: “PCI — No PAN/CVV on platform; PSP tokens only” — this is an **engineering default**, not human SAQ acknowledgment |
| **Notes** | R14-A requires explicit PCI scope/SAQ responsibility sign-off before live PSP integration. Not present |

---

## 10. Additional technical gate checks

| Check | Result | Evidence |
|-------|--------|----------|
| PSP production activation authority documented | **NOT EVIDENCED** | No human approval artifact; Book 243 matrix rows OPEN |
| Webhook signing/verification requirements documented | **PARTIAL** | Sandbox HMAC pattern exists (`payment/hmac.ts`, Book 57) — provider-specific live requirements cannot be documented without named PSP |
| Refund/capture capabilities vs `PaymentGatewayPort` | **NOT APPLICABLE** | Port defines `capture()`, `refund()`, `void()`, `status()` — capability match cannot be verified without named PSP |
| Country production pack not silently enabled | **PASS** | `policy/validator.ts` rejects `payments.enabled` in empty pack; `policy.e2e` asserts `payments.enabled === false` |
| Clinical search disabled | **PASS** | `clinical_search_enabled` default `false` in `policy/document.ts` and `empty-pack.ts` |
| R14-B…G not started | **PASS** | No `r14*.e2e`, no live adapters, only Books 242–244 in docs |
| Live payment routing not activated | **PASS** | `PaymentRouter` filters `environment: 'sandbox'` only; seed gateways `environment: 'sandbox'` |
| Mock-only adapter registration | **PASS** | `PaymentModule` registers `MockPaymentGatewayAdapter` only |

---

## 11. Missing / conflicting evidence

### Missing (all mandatory)

1. Named PSP vendor + approval artifact  
2. Authorized first production country  
3. Finalized legal entity for that country  
4. OD-PAY-01 MoR decision  
5. Signed PSP contract safe reference  
6. Vault credential reference for named PSP (test environment)  
7. PCI SAQ / scope acknowledgment  

### Conflicting

**None identified.** All sources consistently report gates **OPEN** (Books 241, 243, 244, 35, 38).

### Common misclassification risks (rejected)

| Cannot count as evidence | Reason |
|--------------------------|--------|
| Book 242 illustrative PSP examples | Planning placeholders |
| OD-PAY-02 capture-mode default | Not PSP vendor selection |
| `MOCK_PRIMARY` sandbox gateway | Mock adapter, not live PSP |
| Test country `TQ` / engineering fixtures | Not production authorization |
| PCI engineering default in Book 35 | Not SAQ attestation |
| `R14_PLAN_GREEN` (Book 243) | Plan approval ≠ human/commercial gate approval |

---

## 12. Boundary verification

| Boundary | Status |
|----------|--------|
| No R14-A implementation | **PASS** |
| No live PSP / routing / webhooks | **PASS** |
| No production country-pack enablement | **PASS** |
| Clinical search disabled | **PASS** |
| R14-B…G not started | **PASS** |
| No code/schema/migration changes in this CR | **PASS** |

---

## 13. Documentation changes

| Artifact | Update |
|----------|--------|
| `docs/blueprint/245_PRE_R14_A_GATE_VERIFICATION.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |

---

## 14. Final verdict and next authorization

### Verdict

**`R14_A_GATES_BLOCKED`**

### Reason

All seven mandatory human/legal/commercial gates are **`NOT EVIDENCED`**. Repository assumptions, planning documents, sandbox mocks, and engineering defaults do not constitute human approval.

### Exact next authorization

**Do not authorize `CR-R14-A-IMPL-244`.**

Humans must first publish gate evidence (update Book 35 with `DECIDED` rows and/or a signed gate artifact) covering all seven mandatory items, then re-run gate verification.

**Suggested sequence:**

1. Human track — close OD-COUNTRY-01, OD-BRAND-01, OD-PAY-01, PSP vendor selection, contract, vault, PCI SAQ  
2. **`CR-PRE-R14-A-GATE-*`** (re-verification) — target **`R14_A_GATES_GREEN`**  
3. Only then: **`CR-R14-A-IMPL-244`**

**HARD STOP** — no R14-A implementation or live PSP activation.
