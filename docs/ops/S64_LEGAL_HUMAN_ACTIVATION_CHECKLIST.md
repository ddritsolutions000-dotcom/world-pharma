# Sprint 64 — Legal / human activation checklist

Software cannot self-certify compliance. Every item stays open until the responsible party supplies evidence.

Statuses: `OPEN` | `IN_PROGRESS` | `READY_FOR_VERIFICATION` | `VERIFIED` | `BLOCKED` | `EXTERNAL_GATED`

| ID | Category | Item | STATUS | OWNER | EVIDENCE REQUIRED | BLOCKER | NEXT ACTION |
|----|----------|------|--------|-------|-------------------|---------|-------------|
| L1 | LEGAL | Pharmacy / wholesale distribution licenses | EXTERNAL_GATED | Legal / country counsel | License copies + validity dates | Missing licenses | Engage counsel for first country |
| L2 | LEGAL | Privacy / data protection (health data) | EXTERNAL_GATED | DPO / Legal | DPIA / DPA / residency decision | Incomplete privacy pack | Complete privacy review |
| L3 | LEGAL | Medicine import/export / distribution rules | EXTERNAL_GATED | Legal / Regulatory | Written determination | Unclear cross-border rules | Country-specific memo |
| L4 | HEALTHCARE/REGULATORY | Provider credentialing / accreditation | EXTERNAL_GATED | Clinical ops | Accreditation evidence | No live registry | Select KYC/accreditation path |
| L5 | HEALTHCARE/REGULATORY | eRx market approval | EXTERNAL_GATED | Clinical / Regulatory | Vendor + regulator approval | No eRx vendor | Contract eRx after legal OK |
| L6 | HEALTHCARE/REGULATORY | Telemedicine / video clinical approval | EXTERNAL_GATED | Clinical | Policy + vendor | Not approved | Clinical governance sign-off |
| L7 | HEALTHCARE/REGULATORY | Imaging / PACS clinical IT approval | EXTERNAL_GATED | Imaging IT | PACS contract + connectivity | No PACS | Site onboarding |
| L8 | PROVIDER | Live PSP merchant agreement | EXTERNAL_GATED | Payments / Finance | Merchant ID + R14-A evidence | R14-A 0/7 | Complete R14-A gates |
| L9 | PROVIDER | OTP / messaging vendor contract | EXTERNAL_GATED | Identity | Sender IDs + contract | No vendor | Procure SMS/email |
| L10 | PROVIDER | Carrier contract + webhooks | EXTERNAL_GATED | Logistics | Account + zones | No carrier | Procure carrier |
| L11 | PROVIDER | Affiliate payout / bank rail | EXTERNAL_GATED | Finance / Compliance | Payout account + AML | EXTERNAL_PAYOUT_GATED | Procure payout provider |
| L12 | PROVIDER | KYC vendor | EXTERNAL_GATED | Trust & Safety | API account | No KYC | Procure KYC |
| L13 | BUSINESS | First-country commercial go-live decision | OPEN | Business owner | Written authorization | Not signed | Board/ops authorization |
| L14 | BUSINESS | Payments compliance / MoR | EXTERNAL_GATED | Finance | MoR / compliance pack | Incomplete | Finance + legal |
| L15 | BUSINESS | Affiliate marketing / payout compliance | EXTERNAL_GATED | Compliance | Policy + disclosures | Incomplete | Compliance review |
| L16 | INFRASTRUCTURE | Managed Postgres + PITR + off-site | EXTERNAL_GATED | Platform / DBA | PITR + restore drill record | RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED | Provision + drill |
| L17 | INFRASTRUCTURE | Object storage + KMS + malware scanner | EXTERNAL_GATED | Platform / Security | Bucket/KMS/AV refs | NO_PRODUCTION_* adapters | Provision cloud security stack |
| L18 | INFRASTRUCTURE | APM + pager | EXTERNAL_GATED | SRE | APM project + on-call | APM_PAGER_EXTERNAL_GATED | Connect monitoring |
| L19 | ENGINEERING | Provider activation framework in software | VERIFIED | Engineering | S64 contracts + Admin Activation Center | — | Maintain fail-closed gates |
| L20 | ENGINEERING | Sandbox ≠ production separation | VERIFIED | Engineering | Live flags + gates + tests | — | Keep AUTH_DEV_REVEAL_OTP false in prod |
| L21 | OPERATIONS | On-call + runbooks + emergency disable | READY_FOR_VERIFICATION | Ops | Signed runbook ack | Staffing | Staff on-call before Phase 8 |
| L22 | OPERATIONS | Controlled launch cohort plan | OPEN | Ops / Business | Cohort definition | Missing plan | Draft Phase 8 plan |

Related: `S63_LEGAL_REGULATORY_LAUNCH_GATE.md`, `S64_PRODUCTION_ACTIVATION_SEQUENCE.md`, `S64_EMERGENCY_DISABLE.md`.
