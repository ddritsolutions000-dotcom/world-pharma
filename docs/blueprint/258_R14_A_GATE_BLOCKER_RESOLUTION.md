# 258 — R14-A gate blocker resolution

**CR:** `CR-R14-A-GATE-BLOCKER-RESOLUTION-258`  
**Verdict:** **`R14_A_HUMAN_GATES_STILL_BLOCKED`**  
**Date:** 30 August 2026  
**Method:** Search **repository code, configuration, and project artifacts** for authoritative human/business evidence — not repetition of prior blueprint audit conclusions alone.

**Intake record:** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) · **Prior intake:** [257](257_R14_A_HUMAN_GATE_EVIDENCE.md)  
**Gate verification:** [256](256_PRE_R14_A_FINAL_GATE_VERIFICATION.md) (**R14_A_GATES_BLOCKED**)  
**Engineering baseline:** [255](255_PRE_R14_FULL_REGRESSION_HYGIENE.md) (**PRE_R14_REGRESSION_GREEN**)

Blocker resolution and engineering precondition check only. **No source, schema, config, credential, or implementation changes.**

---

## 1. Executive summary

A targeted search of the **live repository and configuration** found **zero authoritative human/legal/commercial gate evidence** for R14-A.

No signed decision records, contract metadata, vault paths for a named production PSP, PCI SAQ acknowledgments, or production country/legal-entity/MoR approvals exist outside open blueprint registers.

**Gates evidenced: 0 / 7**

**R14-A implementation is NOT authorized.**

**Next action:** Project owner / legal / finance / compliance must supply real approvals. Engineering cannot proceed with live PSP work until all seven gates are evidenced and **`CR-PRE-R14-A-GATE-258`** (or successor final gate verification) returns green.

---

## 2. Seven-gate evidence matrix

| # | Gate | Authoritative value found? | Repository / project evidence | Status |
|---|------|---------------------------|------------------------------|--------|
| 1 | **Named PSP** | **No** | `apps/api/src/payment/seed.ts` — only `MOCK_PRIMARY` / `MOCK_FALLBACK` (`environment: 'sandbox'`, `secretRef: env:PAYMENT_MOCK_WEBHOOK_SECRET`). No Stripe/Razorpay/Adyen in workspace `package.json`. [35](35_OPEN_DECISIONS.md) — no vendor `DECIDED` row. [38](38_PHASE_0_DECISION_BOARD.md) §1.3 — PSP vendor = `REQUIRES_HUMAN_DECISION` | **MISSING** |
| 2 | **First production country** | **No** | [35](35_OPEN_DECISIONS.md) OD-COUNTRY-01 open. `empty-pack.ts` — `payments.enabled: false`. Test/e2e fixtures only (`MA`/`MB` in `mnc-scope.e2e.spec.ts` with `XXX` currency; `TQ`/`TC`/`XX` in other e2e) — **not production authorization** | **MISSING** |
| 3 | **Legal entity** | **No** | `LegalEntity` model exists (`packages/database/prisma/schema.prisma`) but no approved launch entity in repo. `mnc-scope.e2e.spec.ts` creates entity with `displayName: 'Config shell — OPEN HUMAN DECISION'` and `notes: 'OPEN HUMAN DECISION — no real legal identity'`. OD-BRAND-01 / OD-I18N-06 open in Book 35 | **MISSING** |
| 4 | **Merchant of Record (OD-PAY-01)** | **No** | OD-PAY-01 open in [35](35_OPEN_DECISIONS.md) and [38](38_PHASE_0_DECISION_BOARD.md) §1.3. No MoR model, responsible entity, or decision reference in code, config, or docs outside blueprint | **MISSING** |
| 5 | **PSP contract** | **No** | No `contracts/`, `legal/`, `commercial/`, or `compliance/` directories. No PDF/DOCX/JSON contract metadata in `docs/`. Book 38 §9 — PSP contract = `REQUIRES_HUMAN_DECISION` | **MISSING** |
| 6 | **PSP credentials / vault** | **No** (sandbox mock only) | `.env.example` — **no** PSP secret placeholders. `.env` — **no** `STRIPE_*` / `RAZORPAY_*` / `PSP_*` keys. `seed.ts` / `hmac.ts` — `env:PAYMENT_MOCK_WEBHOOK_SECRET` only (sandbox) | **MISSING** |
| 7 | **PCI scope / SAQ** | **No** | Book 35 CONFIRMED row — “No PAN/CVV on platform; PSP tokens only” (engineering principle). `payment/pci.spec.ts` — static source scan banning PAN/CVV/sk_live (**engineering guard, not SAQ**). No SAQ type, scope determination, or compliance sign-off artifact | **MISSING** |

---

## 3. Exact repository / project evidence searched

| Location | Finding |
|----------|---------|
| `docs/` (non-blueprint) | No PDF/DOCX/CSV/JSON approval artifacts |
| `docs/blueprint/` | Intake/audit books only ([247](247_R14_A_HUMAN_GATE_EVIDENCE.md), [245](245_PRE_R14_A_GATE_VERIFICATION.md)–[257](257_R14_A_HUMAN_GATE_EVIDENCE.md)); all record **0/7** |
| [35](35_OPEN_DECISIONS.md) | **Zero `DECIDED` rows** for OD-COUNTRY-01, OD-BRAND-01, OD-I18N-06, OD-PAY-01, or PSP vendor |
| [38](38_PHASE_0_DECISION_BOARD.md) | PSP, country, legal entity, MoR, PSP contract remain **`REQUIRES_HUMAN_DECISION`** |
| `.env.example` / `.env` | No production PSP credential references |
| `package.json` (workspace) | No PSP SDK dependencies |
| `apps/api/src/payment/` | `MockPaymentGatewayAdapter` only; `PaymentRouter` filters `environment: 'sandbox'`; `PaymentService` calls `this.mock` for all submits |
| `apps/api/src/policy/empty-pack.ts` | `payments.enabled: false`, `gateway_refs: []` |
| `packages/database/prisma/schema.prisma` | `LegalEntity`, `PaymentGateway`, `Country` models exist — **schema capability only**, not human approval |
| `contracts/`, `legal/`, `commercial/`, `gate-evidence/` | **Absent** from repository |
| `.github/` | No payment/legal approval workflows or artifacts |

**Rejected as human authorization:** planning examples in [242](242_R14_IMPLEMENTATION_PLAN.md); `MOCK_*` gateways; sandbox webhook secret; test countries; engineering PCI guard; Book 255 regression green; R14 plan green.

---

## 4. Stakeholder / action required per missing gate

| # | Gate | Required artifact / value | Authority (owner) | Safe reference format | Engineering without it? |
|---|------|---------------------------|-------------------|----------------------|-------------------------|
| 1 | Named PSP | Vendor legal name; approving role; approval date; decision memo ID | **Finance + legal** (PSP selection) | e.g. `GATE-PSP-001` / signed board memo ref — **no API keys** | **No** — adapter target unknown |
| 2 | Production country | Country name; ISO2; authorizing role; authorization date | **Business + legal** | e.g. `OD-COUNTRY-01-DEC-2026-XX` + ISO2 | **No** — pack/routing scope unknown |
| 3 | Legal entity | Registered entity name; jurisdiction; approving role; date | **Legal + business** | e.g. company reg no. or internal legal memo ref | **No** — settlement/tax entity unknown |
| 4 | MoR (OD-PAY-01) | Model (platform MoR / facilitator / vendor-as-seller); responsible entity; date | **Legal + finance** | e.g. `OD-PAY-01-DEC-…` cross-ref to legal memo | **No** — chargeback/refund owner unknown |
| 5 | PSP contract | Contract/reference ID; status; date; signatory ref | **Finance + legal** | e.g. `CONTRACT-PSP-…` — **metadata only, no full text in repo** | **No** — commercial terms unapproved |
| 6 | Vault / credentials | Vault name; safe secret path; environment; provisioning status | **Finance + eng ops** | e.g. `vault:prod/payments/{psp}/webhook-signing-key` — **path only** | **No** — cannot wire live adapter |
| 7 | PCI scope / SAQ | Applicable scope; SAQ type or determination; acknowledging role; date | **Compliance / legal** | e.g. `PCI-SAQ-A-EP-2026-…` attestation ref | **No** — compliance posture unsigned |

---

## 5. Engineering preconditions (non-human)

Verified 30 August 2026 without source changes:

| Item | Classification | Evidence | Notes |
|------|----------------|----------|-------|
| API typecheck | **NON-BLOCKER** | `tsc -p apps/api` — pass | Ready per Book 254 |
| web-customer typecheck | **NON-BLOCKER** | `tsc -p apps/web-customer` — pass | TD-WEB-TC-01 fixed in CR-254 |
| DB migration parity (dev) | **NON-BLOCKER** | `prisma migrate status` — 128/128 up to date | Fixed in CR-254 |
| DB migration parity (test) | **NON-BLOCKER** | Jest global-setup — no pending migrations | |
| Payment e2e + PCI spec | **NON-BLOCKER** | 2 suites, 2 tests — pass | Sandbox only |
| Full regression (Book 255) | **NON-BLOCKER** | 230 tests — pass | Run sequentially |
| `payments.enabled: false` (empty pack) | **PRECONDITION** | `empty-pack.ts` | Expected until country pack + human gates |
| `PaymentService` hardwired to `this.mock` | **DEBT** | 8 call sites in `payment.service.ts` | Must be refactored **during** R14-A impl after PSP named — not a pre-human blocker |
| `PaymentRouter` sandbox filter | **PRECONDITION** | `router.ts:36` | Correct fail-closed until production env authorized |
| No live PSP SDK / adapter | **PRECONDITION** | `payment.module.ts` | Expected — R14-A work item |
| No production vault refs | **PRECONDITION** | `.env*` | Expected until gate 6 |

**Engineering blockers preventing R14-A start (after human gates):** **None identified.**

Human gates remain the **sole authorization blocker**.

---

## 6. Book consistency check

| Book | Consistent with repo search? |
|------|------------------------------|
| [35](35_OPEN_DECISIONS.md) | **Yes** — open decisions; no contradictory `DECIDED` rows |
| [38](38_PHASE_0_DECISION_BOARD.md) | **Yes** — all R14-A items `REQUIRES_HUMAN_DECISION` |
| [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) | **Yes** — 0/7; no populated gate fields |
| [256](256_PRE_R14_A_FINAL_GATE_VERIFICATION.md) | **Yes** — blocked verdict matches live repo |
| [257](257_R14_A_HUMAN_GATE_EVIDENCE.md) | **Yes** — incomplete intake matches this search |

**Contradictions:** **None.**

**Book 247 / Book 35 updates:** **None applied** — no authoritative evidence discovered to populate.

---

## 7. Security / scope confirmation

| Boundary rule | Status |
|---------------|--------|
| No R14-A implementation | **PASS** |
| No PSP SDK / live adapter | **PASS** |
| No PaymentRouter change | **PASS** |
| No production payments / country packs | **PASS** |
| No R14-B–G / clinical search changes | **PASS** |
| No secrets committed or recorded | **PASS** |
| No fabricated approvals | **PASS** |

---

## 8. Authorization status

| Question | Answer |
|----------|--------|
| R14-A implementation authorized? | **NO** |
| `CR-R14-A-IMPL-244` authorized? | **NO** |
| `CR-PRE-R14-A-GATE-258` (final gate verification) may run? | **NO** — prerequisite 7/7 evidenced not met |

---

## 9. Exact next CR

**HARD STOP at 0/7.**

**Required path:**

1. **Project owner** supplies all seven gate decisions with safe references only (via **`CR-R14-A-HUMAN-GATE-EVIDENCE-257`** successor intake or owner-provided artifact bundle added to project records).
2. Populate [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) and Book 35 `DECIDED` rows where applicable.
3. Run **`CR-PRE-R14-A-GATE-258`** (final gate verification) → target **`R14_A_GATES_GREEN`**.
4. Only then authorize **`CR-R14-A-IMPL-244`**.

**Do not** run another gate audit loop until human approvals are supplied.

---

## 10. Final verdict

### Verdict

**`R14_A_HUMAN_GATES_STILL_BLOCKED`**

### Reason

Repository-wide search found **no authoritative human/legal/commercial/compliance evidence** for any of the seven mandatory R14-A gates. Engineering preconditions are satisfied; **human authorization is the sole blocker**.
