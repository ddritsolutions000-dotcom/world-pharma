# R14-A Owner Gate Checklist

**Canonical gate definition:** [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md)  
**Evidence log:** [247](247_R14_A_HUMAN_GATE_EVIDENCE.md)  
**Status:** **0 / 7** · **`R14_A_READINESS_INCOMPLETE — HUMAN_GATE_COLLECTION_REQUIRED`**

This is the **single fillable owner-input record** for R14-A live-PSP human gates. Replace every `PENDING` with an authoritative owner/legal/finance/compliance value and a **safe** reference. Do not invent values. Do not copy secrets, API keys, PAN/CVV, certificates, or full contract PDFs into this file.

**Rejected as evidence:** Book 242 example vendors · `MOCK*` · test countries `XX`/`TQ`/`PQ`/`TC` · `.env.example` vault templates · Book 35 “No PAN/CVV” · `pci.spec.ts` · **`DEV_PLACEHOLDER_*` / `ZZ` rows in the engineering config store** ([326](326_R14_A_ENGINEERING_CONFIG.md))

The admin/API store `GET /api/v1/admin/payments/r14a-gates` may contain DEV/DEMO placeholders so configuration can be tested. **Those rows are not this checklist and are not Book-263 evidence.** This file stays `PENDING` until real owner values are entered here.

When all seven gates are genuinely evidenced, update [247](247_R14_A_HUMAN_GATE_EVIDENCE.md) and Book 35 `DECIDED` rows via a dedicated intake. **Do not** set `PAYMENT_LIVE_ENABLED=true` and **do not** execute CR-244 from this checklist.

---

## R14-A Owner Gate Checklist

| Gate                  | Required owner value | Evidence/reference | Owner              | Status        |
| --------------------- | -------------------- | ------------------ | ------------------ | ------------- |
| 1. Named PSP          | PENDING              | PENDING            | Finance + Legal    | NOT_EVIDENCED |
| 2. Production country | PENDING              | PENDING            | Business + Legal   | NOT_EVIDENCED |
| 3. Legal entity       | PENDING              | PENDING            | Legal + Business   | NOT_EVIDENCED |
| 4. MoR                | PENDING              | PENDING            | Legal + Finance    | NOT_EVIDENCED |
| 5. PSP contract ID    | PENDING              | PENDING            | Finance + Legal    | NOT_EVIDENCED |
| 6. Vault path         | PENDING              | PENDING            | Finance + Eng Ops  | NOT_EVIDENCED |
| 7. PCI SAQ            | PENDING              | PENDING            | Compliance + Legal | NOT_EVIDENCED |

---

## Fill-in fields (replace PENDING only with real evidence)

### 1. Named PSP — Finance + Legal

| Field | Owner input |
| ----- | ----------- |
| PSP name | PENDING |
| Decision authority | PENDING |
| Decision date | PENDING |
| Decision/memo reference | PENDING |

### 2. First production country — Business + Legal

| Field | Owner input |
| ----- | ----------- |
| ISO2 | PENDING |
| Approval authority | PENDING |
| Approval date | PENDING |
| Approval reference | PENDING |

### 3. Legal entity — Legal + Business

| Field | Owner input |
| ----- | ----------- |
| Entity name | PENDING |
| Jurisdiction | PENDING |
| Legal approval reference | PENDING |

### 4. Merchant of Record — Legal + Finance

| Field | Owner input |
| ----- | ----------- |
| Selected model (`platform MoR` / `facilitator` / `vendor-as-seller`) | PENDING |
| Responsible entity | PENDING |
| OD-PAY-01 decision reference | PENDING |

### 5. PSP contract — Finance + Legal

| Field | Owner input |
| ----- | ----------- |
| Signed contract ID/reference only | PENDING |

### 6. Production vault/credential path — Finance + Eng Ops

| Field | Owner input |
| ----- | ----------- |
| Secret-manager path/reference only | PENDING |

Never store credentials, API keys, PAN, CVV, certificates, or webhook secrets here.

### 7. PCI SAQ / attestation — Compliance + Legal

| Field | Owner input |
| ----- | ----------- |
| Applicable SAQ type | PENDING |
| Attestation/reference ID | PENDING |

---

`R14_A_READINESS_INCOMPLETE — HUMAN_GATE_COLLECTION_REQUIRED`
