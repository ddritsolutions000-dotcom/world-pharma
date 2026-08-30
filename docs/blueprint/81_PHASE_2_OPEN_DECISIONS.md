# 81 — Phase 2 Healthcare open decisions

**Status:** Open catalog — do **not** close in engineering  
**Related:** [35](35_OPEN_DECISIONS.md) · [64](64_PHASE_2_MASTER_PLAN.md)

Do not invent values. Engineering may implement **hooks** with fail-closed defaults.

| ID | Question | Default until decided | Owner |
| --- | --- | --- | --- |
| OD-P2-APP-01 | Separate Next.js deploys vs ADM shells for LOG/CRM | Distinct IA required | eng + product |
| OD-P2-VID-01 | SFU regions / TURN placement | Regional; no country hardcode | eng + legal |
| OD-P2-VID-02 | Chat-only / audio-only SKUs | Pack | product + legal |
| OD-P2-VID-03 | Recording ever on | Off | legal |
| OD-P2-DOC-01 | Queue vs slots | Slots unless product pulls queue | product |
| OD-P2-DOC-04 | Doctor take-rate vs SaaS | Pack; no % in code | business + legal |
| OD-P2-RX-01 | E-sign legal validity | Abstraction only | legal |
| OD-P2-RX-02 | Controlled drug schedules | Pack tables | legal/clinical |
| OD-P2-LAB-01 | Home vs center first | Pack | product |
| OD-P2-LAB-02 | Digital report as official result | Pack | legal |
| OD-P2-COC-01 | Hash-chain on CoC events | Optional | eng + compliance |
| OD-P2-EHR-01 | Controller vs processor | Per country | legal |
| OD-P2-EHR-03 | Portability/export | Pack | legal |
| OD-P2-EHR-04 | Artifact residency | Pack | legal + eng |
| OD-P2-LOG-01 | Specimen courier vs platform fleet | Pack | ops + legal |
| OD-P2-PAY-01 | MoR for consults/labs | Same OD-PAY-01 | legal + finance |
| OD-P2-AFF-01 | Any clinical affiliate | **OFF** | legal |
| OD-P2-CUS-01 | Mixed consult+medicine cart | Kernel composite; UI split v1 | product |
| OD-PTR-04 | HOSPITAL vs CLINIC | Separate types | product |
| OD-COUNTRY-01 | First launch country | Empty pack | business + legal |
| OD-BRAND-01 | Legal brand | Working title only | business + legal |

Existing OD-DOC-*, OD-LAB-*, OD-EHR-*, OD-VID-* in [35](35_OPEN_DECISIONS.md) remain authoritative; this table **adds P2-HC IDs** without deleting them.
