# 80 — Phase 2 Healthcare Ecosystem roadmap

**Status:** Blueprint — not a calendar commitment  
**Related:** [33](33_DEVELOPMENT_ROADMAP.md) · [64](64_PHASE_2_MASTER_PLAN.md)

**Naming:** [33] “Phase 2” = commerce money (done as **1D–1G**). This file = **P2-HC** (care + diagnostics). Maps to historical P4/P5 in [33]. **From current state, execute using [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) waves (R2+).**

**OD-ROAD-01** still owns calendar/staffing.

---

## 1. Gates

- P2-HC-1 doctor foundation and P2-HC-2 appointment/consultation foundation are **implemented** ([83](83_P2_HC1_DOCTOR_FOUNDATION_IMPLEMENTATION.md), [84](84_P2_HC2_APPOINTMENT_CONSULTATION_IMPLEMENTATION.md)). Video and later slices still need their own coding authorization.
- Country enablement of telehealth/lab/Rx = **legal fill of packs**, not a deploy flag flip alone.
- Live PSP/DHL/payout remain **separate** auths.

---

## 2. Slices (when authorized)

| Slice | Outcome | Depends |
| --- | --- | --- |
| P2-HC-0 / P2-HC-1 foundation | Doctor partner overlay, credentials, consent, org membership, admin verification, doctor apps | Phase 0 partner — **done in [83](83_P2_HC1_DOCTOR_FOUNDATION_IMPLEMENTATION.md)** |
| P2-HC-2 | Appointment + encounter foundation (no video) | P2-HC-1 — **done in [84](84_P2_HC2_APPOINTMENT_CONSULTATION_IMPLEMENTATION.md)** |
| P2-HC-3 | Video session + waiting room | SFU contract **OD-VID** |
| P2-HC-4 | Prescription artifact → pharmacy queue | P2-HC-2, catalog | Plan: [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) |
| P2-HC-5 | Lab catalog + booking + sandbox pay | 1C/1D patterns |
| P2-HC-6 | Phlebotomist jobs + CoC | Logistics jobs |
| P2-HC-7 | Lab processing + pathologist + digital report | Booking + CoC |
| P2-HC-8 | Physical report delivery job | 1F job types |
| P2-HC-9 | Health timeline + consent UX | Artifacts |
| P2-HC-10 | CRM flags + healthcare ledger facts | 1G |

**Allowed overlap:** design for 4–6 while 1–3 in test. **Production** diagnostics should not precede working CoC + consent.

---

## 3. Do not

Microservices extraction as a “phase”. Second identity. Kafka. HIS. Insurance core. Diagnostic AI that diagnoses.

---

## 4. Exit (P2-HC program)

Sandbox: book consult, complete without redirect-false-complete, issue Rx (non-legal), book lab, CoC to published report, consent revoke, contribution facts — **in authorized countries only after legal**. Until then, feature flags off.
