# 263 — R14-A human approval handoff

**CR:** `CR-R14-A-HUMAN-APPROVAL-HANDOFF-263`  
**Verdict:** **`R14_A_WAITING_FOR_HUMAN_APPROVAL`**  
**Date:** 30 August 2026  
**Purpose:** Final actionable handoff for project owner / legal / finance / compliance — **not another audit**

**Prior resolution:** [262](262_R14_A_HUMAN_GATE_RESOLUTION.md) (**0/7 — no authoritative evidence in repository**)  
**Intake record:** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md)  
**Owner fill surface:** [R14_A_OWNER_GATE_CHECKLIST.md](R14_A_OWNER_GATE_CHECKLIST.md)  
**Engineering:** [259](259_R14_A_ENGINEERING_PREPARATION.md) + [261](261_R14_A_ENGINEERING_HARDENING.md) (**COMPLETE**)

Documentation/handoff only. **No repository re-audit. No Book 35 `DECIDED` updates. No payment implementation changes.**

---

## 1. Current gate status

| # | Gate | Status | Evidenced? |
|---|------|--------|------------|
| 1 | Named PSP | **PENDING** | No |
| 2 | First production country | **PENDING** | No |
| 3 | Legal entity | **PENDING** | No |
| 4 | Merchant of Record (OD-PAY-01) | **PENDING** | No |
| 5 | PSP contract | **PENDING** | No |
| 6 | PSP vault / credentials | **PENDING** | No |
| 7 | PCI scope / SAQ | **PENDING** | No |

**Gates evidenced:** **0 / 7**

**CR-263 instruction body:** No human decisions supplied. Project is **waiting for owner decisions**.

---

## 2. Seven required decisions (owner intake form)

Complete all fields below with **authoritative human/legal/commercial evidence only**. Use **safe references** — never commit secrets or full contract text.

### Gate 1 — Named PSP

| Field | Owner input |
|-------|-------------|
| Vendor | **PENDING** |
| Approval authority | **PENDING** |
| Approval date | **PENDING** |
| Safe decision reference | **PENDING** |

**Stakeholder:** Finance + Legal  
**Safe reference example:** `GATE-PSP-001` / signed board memo ID (not API keys)

---

### Gate 2 — First production country

| Field | Owner input |
|-------|-------------|
| Country | **PENDING** |
| ISO2 | **PENDING** |
| Authorization authority | **PENDING** |
| Authorization date | **PENDING** |
| Safe decision reference | **PENDING** |

**Stakeholder:** Business + Legal  
**Maps to:** Book 35 **OD-COUNTRY-01**

---

### Gate 3 — Legal entity

| Field | Owner input |
|-------|-------------|
| Entity | **PENDING** |
| Jurisdiction | **PENDING** |
| Approval authority | **PENDING** |
| Approval date | **PENDING** |
| Safe decision reference | **PENDING** |

**Stakeholder:** Legal + Business  
**Maps to:** Book 35 **OD-BRAND-01**, **OD-I18N-06**

---

### Gate 4 — Merchant of Record

| Field | Owner input |
|-------|-------------|
| MoR model | **PENDING** |
| Responsible entity | **PENDING** |
| Approval authority | **PENDING** |
| Approval date | **PENDING** |
| OD-PAY-01 decision reference | **PENDING** |

**Stakeholder:** Legal + Finance  
**Maps to:** Book 35 **OD-PAY-01**  
**Valid models:** platform MoR · facilitator · vendor-as-seller (human decision required)

---

### Gate 5 — PSP contract

| Field | Owner input |
|-------|-------------|
| Contract safe reference | **PENDING** |
| Contract status | **PENDING** |
| Contract date | **PENDING** |
| Approval/signatory reference | **PENDING** |

**Stakeholder:** Finance + Legal  
**Safe reference example:** `CONTRACT-PSP-2026-XX` — metadata only, no full contract in repo

---

### Gate 6 — PSP vault / credentials

| Field | Owner input |
|-------|-------------|
| Vault/secret-manager | **PENDING** |
| Secret reference/path | **PENDING** |
| Environment | **PENDING** |
| Provisioning status | **PENDING** |

**Stakeholder:** Finance + Engineering Ops  
**Safe reference example:** `vault:prod/payments/{psp}/webhook-signing-key` — **path only**

**NEVER record:** API keys, passwords, tokens, webhook secrets, PAN/CVV, private credentials

---

### Gate 7 — PCI scope

| Field | Owner input |
|-------|-------------|
| PCI scope | **PENDING** |
| SAQ type | **PENDING** |
| Acknowledging authority | **PENDING** |
| Acknowledgment date | **PENDING** |
| Safe evidence reference | **PENDING** |

**Stakeholder:** Compliance / Legal  
**Safe reference example:** `PCI-SAQ-A-EP-2026-XX` attestation ref

**Rejected as compliance approval:** Book 35 PCI engineering principle; `payment/pci.spec.ts` no-PAN guard

---

## 3. Evidence supplied in CR-263

**None.** All seven gates remain **PENDING**.

---

## 4. Missing decisions

All seven gates require owner input before R14-A live PSP work may proceed:

1. Named PSP  
2. First production country + ISO2  
3. Legal entity + jurisdiction  
4. Merchant of Record (OD-PAY-01)  
5. PSP contract metadata  
6. Vault credential safe reference  
7. PCI scope / SAQ acknowledgment  

---

## 5. Responsible stakeholder categories

| Gate | Primary owners |
|------|----------------|
| 1 PSP | Finance, Legal |
| 2 Country | Business, Legal |
| 3 Legal entity | Legal, Business |
| 4 MoR | Legal, Finance |
| 5 Contract | Finance, Legal |
| 6 Vault | Finance, Engineering Ops |
| 7 PCI | Compliance, Legal |

---

## 6. Security handling rules

| Rule | Requirement |
|------|-------------|
| Secrets in repository | **Forbidden** — safe paths/references only |
| Full contract text in repo | **Forbidden** — metadata only |
| Mock/sandbox as PSP selection | **Rejected** — `MOCK_*` is test only |
| Test countries as launch authorization | **Rejected** — `PQ`, `TQ`, `TC`, `XX`, etc. |
| Engineering readiness as approval | **Rejected** — prep/hardening ≠ business sign-off |
| PCI source guard as SAQ | **Rejected** — compliance attestation required |

When decisions are supplied, update [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) and Book 35 `DECIDED` rows via a dedicated intake CR — not this handoff alone.

---

## 7. Engineering readiness (informational — not authorization)

| Item | Status |
|------|--------|
| R14-A engineering preparation ([259](259_R14_A_ENGINEERING_PREPARATION.md)) | **COMPLETE** |
| R14-A engineering hardening ([261](261_R14_A_ENGINEERING_HARDENING.md)) | **COMPLETE** |
| Payment regression / typechecks | **PASS** (per CR-261) |
| Dev/test migrations | **128/128** |
| `/health/ready` | **200** |
| Sandbox payment | **WORKING** |
| Live PSP | **NOT IMPLEMENTED** (correct until gates close) |

Engineering is ready at the **abstraction level**. **Human gates block live implementation.**

---

## 8. Exact next action

### For project owner / stakeholders

1. Enter authoritative values on the single fillable checklist: [R14_A_OWNER_GATE_CHECKLIST.md](R14_A_OWNER_GATE_CHECKLIST.md) (also complete §2 below).  
2. Submit via **`CR-R14-A-HUMAN-GATE-RESOLUTION-262`** successor intake (or owner-approved artifact bundle added to project records).  
3. Engineering will populate [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) and Book 35 `DECIDED` rows **only when genuine evidence is supplied**.

### For engineering (after 7/7 evidenced)

1. Declare **`R14_A_HUMAN_GATES_READY_FOR_FINAL_VERIFICATION`**  
2. Run **`CR-PRE-R14-A-GATE-264`** → target **`R14_A_GATES_GREEN`**  
3. Only then authorize **`CR-R14-A-IMPL-244`**

### Do NOT

- Run another gate audit CR while decisions are missing  
- Implement live PSP functionality  
- Fabricate approvals  

---

## 9. Final verdict

### Verdict

**`R14_A_WAITING_FOR_HUMAN_APPROVAL`**

### Reason

CR-263 contains no owner-supplied gate decisions. CR-262 already confirmed **0/7** authoritative evidence in project records. This handoff record defines exactly what stakeholders must provide. **R14-A live PSP implementation remains NOT authorized.**
