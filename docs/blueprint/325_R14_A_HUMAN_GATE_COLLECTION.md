# 325 — R14-A human-gate collection reconciliation

**CR:** `CR-325-R14-A-HUMAN-GATE-COLLECTION`  
**Date:** 31 August 2026  
**Type:** Documentation / evidence reconciliation only — **no product code, config, migrations, adapters, or live enablement**  
**Canonical gates:** [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md)  
**Evidence log:** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md)  
**Verdict:** **`R14_A_READINESS_INCOMPLETE — HUMAN_GATE_COLLECTION_REQUIRED`**

This CR asked to collect/reconcile **owner-provided real evidence** against Book 263. **This instruction body contained objectives and rules only — no vendor, ISO2, legal entity, MoR model, contract ID, vault path, or SAQ attestation values.** Repository scan found **no new authoritative artifacts**.

**Gates evidenced: 0 / 7.** Values were **not invented**.

**Not done (by design):** `PAYMENT_LIVE_ENABLED` left fail-closed; sandbox payment kernel untouched; **CR-R14-A-IMPL-244 not reopened**; R4 / R5-F / R15 / R16 not touched.

---

## A. Seven-gate evidence matrix

Book 263 field lists are the required evidence. Status vocabulary: `EVIDENCED` · `PARTIAL` · `NOT_EVIDENCED` · `NOT_APPLICABLE` (none of the seven are N/A — all block live PSP).

| # | Gate | Required evidence (Book 263) | Evidence found | Source/reference | Status | Owner/action |
| - | ---- | ---------------------------- | -------------- | ---------------- | ------ | ------------ |
| 1 | Named PSP | Vendor; approval authority; approval date; safe memo ID (e.g. `GATE-PSP-001`) | **None.** Registry codes are `MOCK*` only. No Stripe/Adyen/Razorpay dependency. Book 242 names are planning examples. | [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) §2 Gate 1; [38](38_PHASE_0_DECISION_BOARD.md) §1.3 PSP vendor = `REQUIRES_HUMAN_DECISION`; `apps/api/src/payment/gateway.registry.ts`; `package.json` | **NOT_EVIDENCED** | Finance + Legal: name an approved production PSP |
| 2 | First production country | Country; ISO2; authorizing authority; authorization date; safe ref. Maps OD-COUNTRY-01 | **None.** OD-COUNTRY-01 not `DECIDED`. `PAYMENT_PRODUCTION_COUNTRIES` empty (none authorized). `XX`/`TQ`/`PQ`/`TC` rejected as launch countries. | [263] §2 Gate 2; [35](35_OPEN_DECISIONS.md) OD-COUNTRY-01; `payment.config.ts` `isProductionCountryAuthorized`; `.env.example` | **NOT_EVIDENCED** | Business + Legal: authorize first live ISO2 |
| 3 | Legal entity | Entity name; jurisdiction; approval authority; date; safe ref. Maps OD-BRAND-01, OD-I18N-06 | **None.** No legal-entity memo in repo. | [263] §2 Gate 3; [35] OD-BRAND-01, OD-I18N-06 | **NOT_EVIDENCED** | Legal + Business: name the contracting entity |
| 4 | Merchant of Record (OD-PAY-01) | MoR model (platform MoR · facilitator · vendor-as-seller); responsible entity; authority; date; OD-PAY-01 decision ref | **None.** OD-PAY-01 remains “Do not hardcode; pack after LEGAL”. | [263] §2 Gate 4; [35] OD-PAY-01; [38] §1.3 | **NOT_EVIDENCED** | Legal + Finance: decide MoR model |
| 5 | PSP contract ID / metadata | Contract safe reference; status; date; signatory/safe ref. **No full contract text in git.** | **None.** No `CONTRACT-PSP-*`; no `legal/` or `contracts/` artifacts. | [263] §2 Gate 5 | **NOT_EVIDENCED** | Finance + Legal: record signed contract **ID** only |
| 6 | PSP vault / production credential path | Vault/secret-manager; **path only**; environment; provisioning status. **Never** API keys, tokens, PAN/CVV. | **None.** `.env.example` has a commented template `vault:prod/payments/{psp}/credential` — placeholder, not a provisioned path. Unit fixture `vault:prod/payments/mock/ref-only` is sandbox-only ([260](260_R14_A_GATE_INTAKE.md)). | [263] §2 Gate 6; `.env.example`; `payment.config.ts` `describeGatewaySecretRef` | **NOT_EVIDENCED** | Finance + Eng Ops: provision path **outside** git; record safe ref here |
| 7 | Applicable PCI SAQ / attestation | PCI scope; SAQ type; acknowledging authority; date; attestation ref | **None.** Book 35 CONFIRMED “No PAN/CVV” is an **engineering principle**. `pci.spec.ts` is a source scan, **not** an SAQ. | [263] §2 Gate 7 + §6; [35] CONFIRMED PCI row; `apps/api/src/payment/pci.spec.ts` | **NOT_EVIDENCED** | Compliance + Legal: SAQ type + attestation ID |

**R14-A readiness = 0/7**

---

## B. Production-readiness decision

**0/7 is less than 7/7** → **`HUMAN_GATE_COLLECTION_REQUIRED`**

Do **not** implement live PSP. Do **not** treat this CR as authorization to rewrite or execute [244](244_R14_A_LIVE_PSP_IMPLEMENTATION.md).

If 7/7 were ever evidenced: still **do not implement from 244** (stale). Next would be a **fresh** source audit + **new** implementation scope CR. That condition is **not met**.

---

## C. Engineering verification (current source)

| Check | Result |
| ----- | ------ |
| `PAYMENT_LIVE_ENABLED` | Fail-closed: `isLivePaymentEnabled()` is `=== 'true'` only. Unset in `.env`. `.env.example` comments `false`. **Not set to true by this CR.** |
| Live PSP adapter | **Absent.** `PaymentGatewayRegistry` registers mock codes only. |
| Production-country allowlist | Empty → no ISO2 authorized (`isProductionCountryAuthorized`). |
| Routing / guards | Non-sandbox resolve calls `assertSandboxOnlyRuntime`. Submit path `assertPaymentSubmitAllowed` → sandbox only. Production request without live flag → `LIVE_PAYMENTS_DISABLED`. Mock codes blocked on production env. |
| Sandbox payment kernel | **Unchanged** (this CR). Prior R14-A sandbox engineering (268–280) remains the kernel; live rails off. |
| CR-R14-A-IMPL-244 | **Not executed, not reopened.** Book 244 is a blocked record; later books (280/282/93/324) say do not execute unchanged. |

No authorized unblocked **engineering** prerequisite for live PSP was found. Missing items are **human/legal/commercial**.

---

## D. Evidence gap list (owners must supply — do not invent)

Copy into a signed memo or fill [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) §2. Safe references only.

### Gate 1 — Named PSP (Finance + Legal)

- Production PSP **legal vendor name** (not `MOCK_*`, not Book 242 examples unless that vendor is actually contracted)
- Approval authority + date
- Safe decision ID (e.g. board memo), **not** API keys

### Gate 2 — First production country (Business + Legal)

- Country name + **ISO2** that is a real launch market (not `XX`/`TQ`)
- Authorizing authority + date
- Safe decision ID (closes OD-COUNTRY-01 as `DECIDED` via a later intake CR **only when real**)

### Gate 3 — Legal entity (Legal + Business)

- Contracting entity legal name + jurisdiction
- Approval authority + date
- Safe decision ID (OD-BRAND-01 / OD-I18N-06)

### Gate 4 — MoR / OD-PAY-01 (Legal + Finance)

- Chosen model: platform MoR **or** facilitator **or** vendor-as-seller
- Responsible entity
- Approval authority + date + OD-PAY-01 decision reference

### Gate 5 — Contract metadata (Finance + Legal)

- Contract **safe ID** (e.g. `CONTRACT-PSP-2026-…`)
- Status (signed / in force) + date + signatory reference
- **Do not** commit the contract PDF

### Gate 6 — Vault path (Finance + Eng Ops)

- Secret manager name + **path** (e.g. `vault:prod/payments/{actual-psp}/webhook-signing-key`)
- Environment = production; provisioning status
- **Do not** commit the secret

### Gate 7 — PCI SAQ (Compliance + Legal)

- In-scope description + **SAQ type** (or documented inapplicability **signed by compliance**, not inferred by engineering)
- Acknowledging authority + date + attestation reference
- **Do not** treat `pci.spec.ts` or “No PAN/CVV” as this gate

---

## E. Scope-control conclusion

| Tempting next item | Classification |
| ------------------ | -------------- |
| Fill gates with Stripe/Razorpay/Adyen from Book 242 | **NOT AUTHORIZED** (placeholders) |
| Enable `PAYMENT_LIVE_ENABLED` | **HUMAN-BLOCKED** (0/7) |
| Execute / rewrite CR-244 now | **NOT AUTHORIZED** (stale; gates open) |
| Add live PSP SDK “to be ready” | **NOT AUTHORIZED** |
| R14-A sandbox kernel (268–280) | **ALREADY COMPLETE** |
| R14-B sandbox finance | **ALREADY COMPLETE** |
| R0–R13 sandbox | **ALREADY COMPLETE** |
| Live eRx / LiveKit / live carrier / payout | **HUMAN-BLOCKED** (out of R14-A 7 gates) |
| R15 / R16 | **DEFERRED** |
| Wallet / OpenSearch / extra channels | **DEFERRED** |
| Another engineering CR for numbering | **NOT AUTHORIZED** |
| Requirement-level payment **defect** in sandbox | **None proven** this scan |

---

## Book 35 / 247

- [35](35_OPEN_DECISIONS.md): **no `DECIDED` rows** applied (no owner values).
- [247](247_R14_A_HUMAN_GATE_EVIDENCE.md): intake note added; **field values remain `NOT EVIDENCED`**.

---

## Final verdict

**`R14_A_READINESS_INCOMPLETE — HUMAN_GATE_COLLECTION_REQUIRED`**

Next action remains **human**: complete Book 263 §2 with real evidence. Engineering stays paused on live PSP.
