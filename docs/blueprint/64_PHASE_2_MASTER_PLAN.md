# 64 — Phase 2 Healthcare Ecosystem Master Plan

**Status:** Blueprint only — **not implemented**  
**Date:** 27 August 2026  
**Authorization:** Planning / design only  
**Forbidden:** production code, Prisma migrations, UI, live PSP, live DHL, live payouts, invented law

**Relation to [33](33_DEVELOPMENT_ROADMAP.md):** Historical “Phase 2” in book 33 was the **commerce money kernel** (orders, payment, ledger). That work is **complete** as commerce slices **1D–1G**. This document set is **Phase 2 Healthcare Ecosystem (P2-HC)**: doctors, telemedicine, prescription, labs, samples, pathology, health record, healthcare CRM, and healthcare use of existing payment/logistics/ledger kernels.

**Lock:** [43](43_ECOSYSTEM_BASELINE_LOCK.md). This set **does not invent a second identity, payment, ledger, or event bus**. It is a Change Request–class expansion of **experience apps and care/diagnostics operating models** already named in the baseline (doctor, lab, phlebotomist, pathologist, health record). New deployment topology vs “one admin codebase” is **OD-P2-APP-01**.

Canonical: [08](08_DOCTOR_PLATFORM.md), [09](09_LAB_PLATFORM.md), [10](10_PHLEBOTOMIST_PLATFORM.md), [11](11_LOGISTICS_PLATFORM.md), [12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md), [14](14_AFFILIATE_PLATFORM.md), [15](15_CRM_PLATFORM.md), [16](16_HEALTH_RECORD.md), [18](18_GLOBALIZATION.md), [19](19_COMPLIANCE_FRAMEWORK.md), [20](20_DATABASE_ARCHITECTURE.md), [21](21_API_ARCHITECTURE.md), [22](22_EVENT_ARCHITECTURE.md), [27](27_SECURITY_ARCHITECTURE.md), [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

---

## 1. Goal

World Pharma becomes a **global healthcare ecosystem**, not only an online pharmacy.

End-to-end chain (logical, not a single screen):

```
CUSTOMER → MEDICINE STORE / MARKETPLACE
         → DOCTOR → TELECONSULT → PRESCRIPTION → PHARMACY
         → LAB TEST → HOME/CENTER COLLECTION → SAMPLE TRANSPORT
         → LAB PROCESSING → PATHOLOGIST → DIGITAL REPORT
         → OPTIONAL PHYSICAL REPORT DELIVERY
         → HEALTH RECORD → CRM (non-clinical)
         → PAYMENT KERNEL → LEDGER / SETTLEMENT
```

**One Person / Account.** Roles via memberships. Partner join via [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md). Clinical data is **not** commerce data.

Unknown Country Policy = **FAIL CLOSED**.

---

## 2. What already exists (must reuse)

| Kernel | Status | Healthcare reuse |
| --- | --- | --- |
| Identity, OTP, JWT, RBAC, MFA hooks | Phase 0 | All apps |
| Country Policy Packs | Phase 0 | Telehealth, Rx, lab, consent, tax, residency |
| Partner dark model + types | Phase 0 | Doctor, clinic, hospital, lab, pathologist, phlebotomist |
| Outbox + BullMQ | Phase 0 | All P2-HC events |
| Catalog + commercial rules | 1A | Lab test catalog **separate SKU class**; medicines stay catalog |
| Inventory / warehouse | 1B | Pharmacy only; samples are **custody**, not sellable stock |
| Cart / checkout | 1C | Lab booking and consult checkout **sessions**, not mixed v1 cart (**OD-CUS-01**) |
| Sandbox payments | 1D | `PaymentPort` for consult, lab, Rx, report delivery |
| Orders + fulfillment | 1E | Medicine orders; healthcare bookings are **Booking** aggregates |
| Mock logistics / `LogisticsJob` | 1F | `MEDICINE_DELIVERY`, `SAMPLE_COLLECTION`, `SAMPLE_TRANSPORT`, `REPORT_DELIVERY` |
| Sandbox ledger + contribution | 1G | Healthcare settlement **facts** into same journal; mock `PayoutPort` |

---

## 3. Bounded contexts (P2-HC)

| Context | Owner book | Kernel vs operating |
| --- | --- | --- |
| Doctor / clinic / hospital org | [65](65_DOCTOR_ECOSYSTEM.md) | Operating on partner + care |
| Telemedicine / video | [66](66_TELEMEDICINE_VIDEO.md) | Orchestration in kernel `video`; media plane vendor |
| Prescription | [67](67_PRESCRIPTION_ECOSYSTEM.md) | Kernel `prescription` |
| Lab catalog / booking / processing | [68](68_LAB_ECOSYSTEM.md) | Operating `diagnostics` |
| Sample collection + CoC | [69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md) | Diagnostics + logistics job |
| Pathology + reports | [70](70_PATHOLOGY_REPORTING.md) | Diagnostics |
| Health record + consent | [71](71_HEALTH_RECORD_CONSENT.md) | Kernel `health` |
| Healthcare CRM | [72](72_HEALTHCARE_CRM.md) | Kernel `crm` + `support`; **no clinical payload** |
| Healthcare payments / settlement | [73](73_HEALTHCARE_PAYMENTS_SETTLEMENT.md) | Same `payment` + `ledger` |
| Healthcare logistics | [74](74_HEALTHCARE_LOGISTICS.md) | Same `logistics` job types |
| Security / compliance | [75](75_HEALTHCARE_SECURITY_COMPLIANCE.md) | Packs + RLS/ABAC |
| Data | [76](76_HEALTHCARE_DATABASE.md) | Additive schema **when coded** |
| API / events | [77](77_HEALTHCARE_API_EVENTS.md) | `/api/v1` + outbox |
| App IA / UX | [78](78_HEALTHCARE_UI_UX_ARCHITECTURE.md) | Separate apps, shared ui-kit |
| Tests | [79](79_HEALTHCARE_TEST_STRATEGY.md) | |
| Roadmap | [80](80_PHASE_2_ROADMAP.md) | |
| Open decisions | [81](81_PHASE_2_OPEN_DECISIONS.md) | |
| Risks | [82](82_PHASE_2_RISK_REGISTER.md) | |

Hospital/clinic: **partner organization types**, not HIS/EMR replacement ([43] §1.2).

---

## 4. Application inventory (separate products)

**Do not merge into one Partner App.** Each has own UX, nav, permissions, workflows. Shared: ui-kit, API kernel, identity.

### 4.1 Mobile (React Native)

| ID | App | Users |
| --- | --- | --- |
| APP-CUS-M | Customer App | Patient / customer |
| APP-PHARM | Store App | Pharmacy / store staff |
| APP-DEL | Delivery App | Delivery partner |
| APP-DOC | Doctor App | Doctor |
| APP-LAB-S | Lab App | Lab floor staff |
| APP-PHE | Phlebotomist / collection App | Phlebotomist |
| APP-AFF-M | Affiliate App | Affiliate |

### 4.2 Web (Next.js)

| ID | App | Users |
| --- | --- | --- |
| APP-CUS-W | Customer Web | Customer |
| APP-PHARM-W | Store Web | Pharmacy ops |
| APP-VEND | Vendor Web | Marketplace vendor |
| APP-DOC-W | Doctor Web | Doctor / clinic admin |
| APP-LAB-W | Lab Web | Lab owner / manager |
| APP-PATH | Pathologist Web | Pathologist (web-first) |
| APP-LOG-W | Logistics / delivery operations Web | Dispatch / ops |
| APP-AFF-W | Affiliate Web | Affiliate |
| APP-ADM | Admin / ERP Web | Super, country, finance, CRM, compliance shells |
| APP-JOIN-W | Join / become a partner | Applicants ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)) |

**OD-P2-APP-01:** Whether APP-LOG-W and CRM finance shells are **separate Next.js deployments** vs **APP-ADM permission shells**. This master plan **requires distinct IA and tokens per audience**. Deployment packing is an engineering decision; **UX must not be a generic partner dump**.

---

## 5. Architecture decisions (P2-HC)

| ID | Decision |
| --- | --- |
| AD-P2-01 | Modular monolith + extractable `video` / `search` / `analytics` later. No Kafka in P2-HC. |
| AD-P2-02 | One identity. No second user table for doctors/labs. |
| AD-P2-03 | `PaymentPort` / `PayoutPort` / `CarrierPort` / `LogisticsJob` reused. |
| AD-P2-04 | LiveKit (or equivalent) **SFU**; platform does not build SFU ([43]). TURN required. Recording **off by default**. |
| AD-P2-05 | Clinical store separate from commerce tables. OpenSearch = non-PHI only. |
| AD-P2-06 | ConsentGrant + relationship (appointment/booking) for clinical access. |
| AD-P2-07 | Sample CoC is not parcel tracking. Separate state machine; logistics moves the bag. |
| AD-P2-08 | Published reports immutable; amendments = new `ReportVersion`. |
| AD-P2-09 | UUID v7. BIGINT money. FAIL CLOSED packs. |
| AD-P2-10 | Affiliate clinical categories **OFF** until pack + legal. |

---

## 6. Policy fail-closed keys (illustrative, empty until legal fill)

Packs may add keys such as: `telehealth.enabled`, `eprescribing.enabled`, `controlled_rx`, `lab.home_collection`, `specimen.transport`, `report.official_digital`, `recording.allowed`, `affiliate.clinical`. Missing key = deny.

**LEGAL/COMPLIANCE REVIEW REQUIRED** per country. No `if country === IN`.

---

## 7. Implementation order (when a coding CR is authorized)

See [80](80_PHASE_2_ROADMAP.md). Directional:

1. Care identity overlays + doctor/lab partner profiles (still dark until KYC ACTIVE)  
2. Appointment + consult (chat/audio first if video vendor not signed)  
3. Video session orchestration + waiting room  
4. Prescription artifact → pharmacy Rx queue  
5. Lab catalog + booking + payment  
6. Phlebotomist jobs + CoC  
7. Lab processing + pathologist + digital report  
8. Physical report delivery job  
9. Health record timeline + consent UX  
10. CRM non-clinical 360 + healthcare settlement facts  

**Do not** start P2-HC coding until this blueprint set is accepted and a coding task is issued. Live PSP/DHL/payout remain separately authorized.

---

## 8. Stop

This file is **design only**. Do not implement. Do not migrate. Do not enable telemedicine or diagnostics in any country pack without legal review.
