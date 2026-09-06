# 93 — Global implementation roadmap (canonical execution overlay)

**Status:** Canonical **execution roadmap** from the current locked baseline  
**Change ID:** **CR-ROAD-93** (documentation only)  
**Date:** 27 August 2026  
**Does not implement:** any production code, UI, API, migration, PSP, DHL, payout, CMS/support product, care navigation, radiology, or live healthcare.

This book is the **single canonical implementation order** from **today’s state** forward. It does **not** replace locked product law in [43](43_ECOSYSTEM_BASELINE_LOCK.md). It **maps** historical phase names so they are not confused.

| Historical name | Meaning | This overlay |
| --- | --- | --- |
| [33](33_DEVELOPMENT_ROADMAP.md) “Phase 2” | Commerce **money kernel** | **R1** (done as 1D–1G **sandbox**) |
| [80](80_PHASE_2_ROADMAP.md) P2-HC | Care + diagnostics program | **R2+** (R2 done = HC-1/2) |
| CR-ECO-92 | Completeness slots | Slots placed below; **not authorized to code** |

**OD-ROAD-01** still owns calendar and staffing. This file has **no dates**.

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any regulated country enablement. Do not invent law. Do not hardcode India, INR, GST, UPI, DHL, timezone, language, tax, or medical statutes.

---

## 0. Change control (CR-ROAD-93)

| Field | Value |
| --- | --- |
| Problem | Completeness audit [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) reserved domains; execution order was split across [33](33_DEVELOPMENT_ROADMAP.md) and [80](80_PHASE_2_ROADMAP.md) with colliding “Phase 2” names. |
| Decision | **ACCEPT_WITH_CONDITIONS** — publish overlay **R0–R16**. Do not weaken lock: marketplace/doctor/lab **production traffic** still must not precede a working money kernel (already present as **sandbox**; **live** money is **R14**). |
| Implementation | **Forbidden in this task.** |
| Architecture | Modular monolith; one CMS; one support kernel; one notification kernel; isolated PHI search. |
| Contradiction | Vendor RN in [04](04_APPLICATION_ARCHITECTURE.md) vs web-only in [88](88_GLOBAL_APPLICATION_TOPOLOGY.md) — already resolved by CR-ECO-92 (web-only). Affiliate mobile remains DEFERRED. |

---

## 1. Current state (done — do not rebuild)

### R0 — Platform foundation (historical Phase 0) — **DONE**
Identity, RBAC, sessions, country packs (empty), partner dark model, design system, CI/CD, observability, application **shells**, security baseline.

### R1 — Commerce sandbox (1A–1G) — **DONE** (not live money)
Catalog/pricing, inventory/warehouse, cart/checkout, **sandbox** payment, order/fulfillment, **mock** logistics, **sandbox** ledger/settlement.

### R2 — Care foundation (P2-HC-1 / P2-HC-2) — **DONE** (not production telemedicine)
Doctor partner overlay; appointment + encounter **foundation**. No authorized production video, Rx, lab, or care-nav.

### Also done (docs + guards, not product completeness)
Company-owned admin ([86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md)); MNC retrofit ([87](87_GLOBAL_MNC_RETROFIT_AUDIT.md)); application topology ([88](88_GLOBAL_APPLICATION_TOPOLOGY.md)); company governance ([89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md)); completeness slots ([92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md)).

**FOUNDATION ≠ production-ready.** Customer/admin/doctor clients are shells + partial journeys. Live PSP/DHL/payouts are **not** done.

---

## 2. Hard rules (every future wave)

1. **MNC always:** Global Company → Region → Country → Legal Entity → Business Unit → Organization → Location. No single-country product.
2. Local behavior only via **country packs / config / adapters**.
3. **Company admin** ≠ **partner admin**. Partners never become company administrators ([86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md), [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md)).
4. One Customer product (mobile + web) for commerce + care + content + support — not separate customer SKUs.
5. One CMS. One Support/Helpdesk. One notification dispatcher. Clinical/PHI search **isolated**.
6. Care navigation is **not** diagnosis and **never** auto-prescribes.
7. Radiology is **not** pathology.
8. No generic Partner App. No affiliate mobile. No country forks. No Kafka/second identity.
9. **R14 (live money/carriers)** is a **go-live gate**, not a feature toggle.
10. New modules still need **CR → impact → security/compliance → architecture → decision → blueprint → implementation**.

---

## 3. Canonical wave order (R3–R16)

Waves may **design** in parallel. **Production enablement** follows dependencies and legal gates. Each wave still needs a **separate coding authorization**.

### R3 — Partner operations clients — **FUNCTIONAL (partner support CLOSED; engineering pause confirmed)**
**Plan:** [94](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md). **Implementation:** [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md) (**CR-R3-IMPLEMENT**, **CR-R3-HARDEN-99**). **Support entry:** [293](293_R3_PARTNER_SUPPORT_ENTRY.md) + [294](294_R3_MOBILE_STORE_SUPPORT_PARITY.md). **Support closure:** [295](295_R3_PARTNER_SUPPORT_CLOSURE.md) (**CR-R3-PARTNER-SUPPORT-CLOSURE-295**, **R3_PARTNER_SUPPORT_FUNCTIONAL_COMPLETE**). **Next-wave audit:** [296](296_NEXT_AUTHORIZED_ENGINEERING_WAVE.md) (**ROADMAP_ENGINEERING_PAUSE**).  
**Objective:** Operate existing R1 jobs with real partner UIs (still sandbox money).  
**Domains:** Store ops, delivery jobs, Partner Join UX.  
**Apps:** Store mobile+web, Delivery mobile, Partner Join web; Admin partner ops; Customer join/tracking OTP.  
**Depends:** R0, R1, CR-RLS-96.  
**Status:** **FUNCTIONAL** — partner support entry verified complete across all four shipped clients; **support CR chain closed**; not production-ready (sandbox OTP/carrier, legal gates open).  
**Accept:** store can pick/pack a sandbox order; rider can complete mock POD flow; join dark until pack `join_public`; applicant status when dark; **all R3 clients can file scoped support tickets** (verified CR-295).

### R4 — Telemedicine video — **LATER**
**Objective:** Waiting room + video on existing appointments (P2-HC-3).  
**Domains:** Telemedicine, notifications (reminders).  
**Apps:** Customer + Doctor mobile/web expansion.  
**Depends:** R2; SFU **OD-VID**; recording **off**.  
**Legal:** teleconsult licensing per country; recording consent.  
**Security:** tokens not stored; no PHI in push body.  
**Accept:** join/leave; disconnect does not complete encounter; pack can disable.

### R5 — Prescription + pharmacy dispensing — **R5-F KERNEL COMPLETE (R5-A…F engineering)**
**Objective:** Digital Rx artifact → pharmacy queue (P2-HC-4) on owned pharmacy.  
**Domains:** Prescription, pharmacy dispensing, catalog Rx flags.  
**Apps:** Doctor expansion; Store expansion; Customer Rx list.  
**Depends:** R2, R1 catalog; R4 if consult-origin Rx.  
**Legal:** e-Rx validity; still-verify default. **OD-RX-REFILL** before any auto-refill.  
**Security:** Rx image ACL; audit.  
**Accept:** signed Rx (non-legal until pack); pharmacy verify; no auto-dispense from OCR/AI.  
**Canonical plan:** [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) (**CR-R5-AUTH-111**).  
**R5-A foundation:** [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) (**CR-R5-IMPL-112**, **R5_A_IMPLEMENTED**).  
**R5-B prescribing UX:** [113](113_R5_B_PRESCRIBING_UX_PLAN.md) (plan) · [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) (**CR-R5-B-IMPL-114**, **R5_B_IMPLEMENTED**).  
**R5-C pharmacy dispensing:** [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) (plan) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) (**CR-R5-C-IMPL-116**, **R5_C_IMPLEMENTED**).  
**R5-D Order-from-Rx commercial handoff:** [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) (plan) · [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) (**CR-R5-D-IMPL-118**, **R5_D_IMPLEMENTED** — ED-R5D-01 Option B).  
**R5-E refill / subscription:** [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (plan) · [120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md) (**CR-R5-E-IMPL-120**, **R5_E_IMPLEMENTED** — ED-R5E-01 fail-closed; auto-refill OFF). **R5-F e-Rx kernel:** provider-neutral `ERxPort` wiring + `prescription_erx_submissions` audit (`SandboxERxAdapter` only; `ERX_PROVIDER=sandbox`; pack `rx_erx_provider_code`; L-RX-01 human gate for live country enablement). **R5_F_IMPLEMENTATION_COMPLETE** (Aug 2026 charter). Live government e-Rx provider activation remains **HUMAN_BLOCKED** (L-RX-01).  
**Post-R5 ecosystem audit:** [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md) (**CR-POST-R5-FULL-ECOSYSTEM-AUDIT-121**, **ECOSYSTEM_WITH_BLOCKERS**). Does **not** authorize R6 coding.  
**Pre-R6 readiness gate:** [122](122_PRE_R6_GLOBAL_READINESS_AUDIT.md) (**CR-PRE-R6-GATE-122**, **PRE_R6_WITH_BLOCKERS** — **READY FOR R6 PLANNING**; IMPL not authorized).  
**Pre-R6 blocker repair:** [123](123_PRE_R6_BLOCKER_REPAIR_IMPLEMENTATION.md) (**CR-PRE-R6-REPAIR-123**).  
**Pre-R6 final verification:** [124](124_PRE_R6_FINAL_VERIFICATION.md) (**CR-PRE-R6-VERIFY-124**, historically **PRE_R6_WITH_BLOCKERS** on P1-2).  
**Pre-R6 determinism fix:** [125](125_PRE_R6_TEST_DETERMINISM_FIX.md) (**CR-PRE-R6-DETERMINISM-FIX-125**, **PRE_R6_DETERMINISTIC** — three consecutive api:test 136/136).  
**R6 Vendor / Marketplace plan:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) (**CR-R6-AUTH-126**, **R6_PLAN_READY** — does **not** authorize R6 coding).  
**Pre-R6-A implementation gate:** [127](127_PRE_R6_A_IMPLEMENTATION_GATE.md) (**CR-PRE-R6-IMPLEMENTATION-GATE-127**, **R6_A_READY_FOR_IMPLEMENTATION** — does **not** start coding).  
**R6-A Vendor foundation:** [128](128_R6_A_VENDOR_FOUNDATION_IMPLEMENTATION.md) (**CR-R6-A-IMPL-128**, **R6_A_IMPLEMENTED** — R6-B+ NOT started).  
**Post-R6-A audit:** [129](129_POST_R6_A_AUDIT.md) (**CR-POST-R6-A-AUDIT-129**, **R6_A_GREEN_R6_B_READY** — R6-B NOT started).  
**R6-B Vendor catalog & commercial UX:** [130](130_R6_B_VENDOR_CATALOG_COMMERCIAL_IMPLEMENTATION.md) (**CR-R6-B-IMPL-130**, **R6_B_IMPLEMENTED**).  
**Post-R6-B audit:** [131](131_POST_R6_B_AUDIT.md) (**CR-POST-R6-B-AUDIT-131**, **R6_B_GREEN_R6_C_READY**).  
**R6-C Vendor inventory ops:** [132](132_R6_C_VENDOR_INVENTORY_IMPLEMENTATION.md) (**CR-R6-C-IMPL-132**, **R6_C_IMPLEMENTED**).  
**Post-R6-C hygiene & R6-D readiness:** [133](133_POST_R6_C_CODEBASE_HYGIENE_AND_R6_D_READINESS.md) (**CR-POST-R6-C-FILE-HYGIENE-133**, **R6_C_GREEN_R6_D_READY**).  
**R6-D Vendor order detail & fulfillment:** [134](134_R6_D_VENDOR_ORDER_FULFILLMENT_IMPLEMENTATION.md) (**CR-R6-D-IMPL-134**, **R6_D_IMPLEMENTED**).  
**Post-R6-D audit:** [135](135_POST_R6_D_AUDIT.md) (**CR-POST-R6-D-AUDIT-135**, **R6_D_GREEN_R6_E_READY**).  
**R6-E Vendor settlements + support/notifications:** [136](136_R6_E_VENDOR_SETTLEMENT_SUPPORT_IMPLEMENTATION.md) (**CR-R6-E-IMPL-136**, **R6_E_IMPLEMENTED**).  
**Post-R6-E audit:** [137](137_POST_R6_E_AUDIT.md) (**CR-POST-R6-E-AUDIT-137**, **R6_E_GREEN_R6_F_READY**).  
**R6-F Vendor marketplace attestation + pack gates + acceptance:** [138](138_R6_F_VENDOR_MARKETPLACE_ACCEPTANCE_IMPLEMENTATION.md) (**CR-R6-F-IMPL-138**, **R6_F_IMPLEMENTED**).  
**Post-R6 global ecosystem audit:** [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) (**CR-POST-R6-GLOBAL-AUDIT-139**, **ECOSYSTEM_R6_COMPLETE_R7_READY_FOR_PLANNING** — R7 NOT started).  
**R7 Laboratory diagnostics implementation plan:** [140](140_R7_IMPLEMENTATION_PLAN.md) (**CR-R7-AUTH-140**, **R7_PLAN_READY**).  
**R7-A Diagnostics foundation + Lab partner:** [141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md) (**CR-R7-A-IMPL-141**, **R7_A_IMPLEMENTED**).  
**Post-R7-A audit:** [142](142_POST_R7_A_AUDIT.md) (**CR-POST-R7-A-AUDIT-142**, **R7_A_GREEN_R7_B_READY** — R7-B NOT started).  
**R7-B Customer lab booking + sandbox payment:** [143](143_R7_B_CUSTOMER_LAB_BOOKING_IMPLEMENTATION.md) (**CR-R7-B-IMPL-143**, **R7_B_IMPLEMENTED**).  
**R7-C Phlebotomist + SAMPLE_COLLECTION + CoC:** [144](144_R7_C_SAMPLE_COLLECTION_COC_IMPLEMENTATION.md) (**CR-R7-C-IMPL-144**, **R7_C_IMPLEMENTED**).  
**R7-D Transport + accession + lab processing:** [145](145_R7_D_TRANSPORT_ACCESSION_PROCESSING_IMPLEMENTATION.md) (**CR-R7-D-IMPL-145**, **R7_D_IMPLEMENTED**).  
**R7-E Pathology + digital diagnostic report:** [146](146_R7_E_PATHOLOGY_DIGITAL_REPORT_IMPLEMENTATION.md) (**CR-R7-E-IMPL-146**, **R7_E_IMPLEMENTED**).  
**Post-R7-E audit:** [147](147_POST_R7_E_PATHOLOGY_DIGITAL_REPORT_AUDIT.md) (**CR-POST-R7-E-AUDIT-147**, **R7_E_WITH_BLOCKERS**).  
**R7-E audit blockers fix:** [148](148_R7_E_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) (**CR-R7-E-FIX-148**, **R7_E_BLOCKERS_CLOSED**).  
**R7-F Physical report + sandbox finance:** [149](149_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION_PLAN.md) (plan) · [150](150_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION.md) (**CR-R7-F-IMPL-150**, **R7_F_IMPLEMENTED**).  
**Post-R7 global ecosystem audit:** [151](151_POST_R7_GLOBAL_ECOSYSTEM_AUDIT.md) (**CR-POST-R7-GLOBAL-AUDIT-151**, **R7_GLOBAL_WITH_BLOCKERS** — R8 coding NOT authorized).  
**R7 global audit blockers fix:** [152](152_R7_GLOBAL_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md) (**CR-R7-GLOBAL-FIX-152**, **R7_GLOBAL_BLOCKERS_CLOSED**).  
**R7 final video regression fix:** [153](153_R7_FINAL_VIDEO_REGRESSION_FIX.md) (**CR-R7-FINAL-VIDEO-FIX-153**, **R7_FINAL_REGRESSION_GREEN**).  
**Post-R7 final closure audit:** [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) (**CR-POST-R7-FINAL-CLOSURE-154**, **R7_CLOSED_R8_READY_FOR_PLANNING**).  
**R8 Radiology / imaging implementation plan:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) (**CR-R8-AUTH-155**, **R8_PLAN_READY**).  
**R8-A Radiology foundation:** [156](156_R8_A_RADIOLOGY_FOUNDATION_IMPLEMENTATION.md) (**CR-R8-A-IMPL-156**, **R8_A_IMPLEMENTED**).  
**Post-R8-A audit:** [157](157_POST_R8_A_AUDIT.md) (**CR-POST-R8-A-AUDIT-157**, **R8_A_GREEN_R8_B_READY**).  
**R8-B customer booking + sandbox pay:** [158](158_R8_B_CUSTOMER_BOOKING_PAYMENT_IMPLEMENTATION.md) (**CR-R8-B-IMPL-158**, **R8_B_IMPLEMENTED**).  
**Post-R8-B audit:** [159](159_POST_R8_B_AUDIT.md) (**CR-POST-R8-B-AUDIT-159**, **R8_B_WITH_BLOCKERS**).  
**R8-B RN parity fix:** [160](160_R8_B_RN_PARITY_FIX_IMPLEMENTATION.md) (**CR-R8-B-FIX-160**, **R8_B_BLOCKERS_CLOSED**).  
**Post-R8-B final re-audit:** [161](161_POST_R8_B_FINAL_REAUDIT.md) (**CR-POST-R8-B-REAUDIT-161**, **R8_B_GREEN_R8_C_READY**).  
**R8-C acquisition + technician workflow:** [162](162_R8_C_RADIOLOGY_ACQUISITION_IMPLEMENTATION.md) (**CR-R8-C-IMPL-162**, **R8_C_IMPLEMENTED**).  
**Post-R8-C audit:** [163](163_POST_R8_C_AUDIT.md) (**CR-POST-R8-C-AUDIT-163**, **R8_C_GREEN_R8_D_READY**).

### R6 — Marketplace vendor web — **COMPLETE** ([138](138_R6_F_VENDOR_MARKETPLACE_ACCEPTANCE_IMPLEMENTATION.md) · [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md))
**Objective:** Vendor KYC + listings + orders + own settlements (historical Phase 3).  
**Domains:** Partner, catalog, order, ledger (vendor payables).  
**Apps:** Vendor **web**; Admin partner review; Customer marketplace browse.  
**Depends:** R1 money kernel; R0 partner engine; R6-A…F complete. **Production traffic** still not before sandbox money and **R14** for live settlement.  
**Legal:** marketplace operator, inducement.  
**Security:** vendor A ↛ vendor B.  
**Accept:** vendor lists offer in pack country; cannot see company finance.  
**Canonical plan:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md).

### R7 — Laboratory diagnostics — **R7 CLOSED (A–F)** · regression **GREEN** ([153](153_R7_FINAL_VIDEO_REGRESSION_FIX.md) · [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md))
**Objective:** Lab catalog, booking, sample collection, CoC, pathology, digital + physical reports (historical Phase 5 / P2-HC-5–8).  
**Domains:** Laboratory, Sample/CoC, Pathology, Reports, Logistics job types, Phlebotomist.  
**Apps:** Lab web (**FUNCTIONAL**), Phlebotomist mobile, Pathologist web, Customer lab+reports, Delivery for sample/report jobs; Lab staff mobile still **PLANNED** (deferred).  
**Depends:** R1 jobs+pay patterns; R0 consent hooks; **not** radiology.  
**Legal:** diagnostic marketplace, home collection, official e-reports — **human gates OPEN** ([151](151_POST_R7_GLOBAL_ECOSYSTEM_AUDIT.md) §15).  
**Security:** CoC append-only; pathologist ↛ unrelated cases; R7 tables FORCE RLS.  
**Accept:** book → collect → CoC → published report → optional physical delivery (sandbox pay/finance).  
**Canonical plan:** [140](140_R7_IMPLEMENTATION_PLAN.md). **R7-A–F** implemented; audit [151](151_POST_R7_GLOBAL_ECOSYSTEM_AUDIT.md); blockers [152](152_R7_GLOBAL_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md); video fix [153](153_R7_FINAL_VIDEO_REGRESSION_FIX.md) (**R7_FINAL_REGRESSION_GREEN**); closure [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) (**R7_CLOSED_R8_READY_FOR_PLANNING**).

### R8 — Radiology / imaging — **R8-F GREEN** ([155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [169](169_POST_R8_F_AUDIT.md))
**Objective:** Imaging BC live in sandbox ([92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) §7).  
**Domains:** Radiology/Imaging, Reports (`IMAGING_REPORT`), study scheduling, physical report delivery.  
**Apps:** Customer web+RN; **`web-radiology`**; **`web-radiologist`**; **`mobile-delivery`** `REPORT_DELIVERY`; admin imaging governance.  
**Depends:** R7 closed; R1 payment/logistics sandbox; object store; **not** pathology/lab code.  
**Legal:** **OD-RAD-01/02**, **OD-R8-***; ionizing radiation / reporting physician — **human gates OPEN**.  
**Security:** study metadata pointers; no public URLs; PHI not on commerce CDN; FORCE RLS.  
**Accept:** book modality → schedule → acquire → interpret → publish → optional physical delivery (sandbox finance).  
**Canonical plan:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md). **R8-A** [156] (**R8_A_IMPLEMENTED**); **R8-B** [158–161] (**R8_B_GREEN_R8_C_READY**); **R8-C** [162–163] (**R8_C_GREEN_R8_D_READY**); **R8-D** [164–165] (**R8_D_GREEN_R8_E_READY**); **R8-E** [166–167] (**R8_E_GREEN_R8_F_READY**); **R8-F** [168–169] (**R8_F_GREEN_R9_READY_FOR_PLANNING**). **R9 plan** [170](170_R9_IMPLEMENTATION_PLAN.md) (**R9_PLAN_READY**). **R9-A+ IMPL** requires separate authorization.

### R9 — Health record + consent UX — **CLOSED** ([170](170_R9_IMPLEMENTATION_PLAN.md) · [171](171_R9_A_HEALTH_RECORD_KERNEL_IMPLEMENTATION.md) · [172](172_POST_R9_A_AUDIT.md) · [173](173_R9_B_CUSTOMER_HEALTH_UI_IMPLEMENTATION.md) · [174](174_POST_R9_B_AUDIT.md) · [175](175_R9_C_CONSENT_SCOPE_IMPLEMENTATION.md) · [176](176_POST_R9_C_AUDIT.md) · [177](177_R9_D_DOCTOR_HEALTH_IMPLEMENTATION.md) · [178](178_POST_R9_D_AUDIT.md) · [179](179_R9_E_PRESCRIPTION_HEALTH_ARTIFACT_IMPLEMENTATION.md) · [180](180_POST_R9_E_AUDIT.md) · [181](181_R9_F_HEALTH_GOVERNANCE_IMPLEMENTATION.md) · [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md))
**Objective:** Patient-facing timeline, grant/revoke, break-glass review.  
**Domains:** Health Record, Consent.  
**Apps:** Customer Health tab; Admin consent audit; Doctor access via relationship+consent.  
**Depends:** artifacts from R5–R8 (`HealthArtifact` LAB/IMAGING from R7-E/R8-E; R5 Rx projection in R9-E).  
**Legal:** controller/processor, residency (**OD-EHR-01/02**, **OD-R9-06**).  
**Security:** deny-by-default clinical payload; CRM must not copy payloads; FORCE RLS on new tables.  
**Accept:** view own artifacts; revoke stops next access; doctor reads require relationship+consent; admin audit metadata-only.  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md). **R9-A** [171](171_R9_A_HEALTH_RECORD_KERNEL_IMPLEMENTATION.md) (**R9_A_IMPLEMENTED**); audit [172](172_POST_R9_A_AUDIT.md) (**R9_A_GREEN_R9_B_READY**). **R9-B** [173](173_R9_B_CUSTOMER_HEALTH_UI_IMPLEMENTATION.md) (**R9_B_IMPLEMENTED**); audit [174](174_POST_R9_B_AUDIT.md) (**R9_B_GREEN_R9_C_READY**). **R9-C** [175](175_R9_C_CONSENT_SCOPE_IMPLEMENTATION.md) (**R9_C_IMPLEMENTED**); audit [176](176_POST_R9_C_AUDIT.md) (**R9_C_GREEN_R9_D_READY**). **R9-D** [177](177_R9_D_DOCTOR_HEALTH_IMPLEMENTATION.md) (**R9_D_IMPLEMENTED**); audit [178](178_POST_R9_D_AUDIT.md) (**R9_D_GREEN_R9_E_READY**). **R9-E** [179](179_R9_E_PRESCRIPTION_HEALTH_ARTIFACT_IMPLEMENTATION.md) (**R9_E_IMPLEMENTED**); audit [180](180_POST_R9_E_AUDIT.md) (**R9_E_GREEN_R9_F_READY**). **R9-F** [181](181_R9_F_HEALTH_GOVERNANCE_IMPLEMENTATION.md) (**R9_F_IMPLEMENTED**); verified CR-R9-F-VERIFY-ENV-001. **Final closure audit** [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) (**R9_GREEN_CLOSED_R10_READY_FOR_PLANNING**). **R10+** requires separate planning CR — not started.

### R10 — Care navigation — **CLOSED** ([183](183_R10_IMPLEMENTATION_PLAN.md) · [184](184_POST_R10_PLAN_AUDIT.md) · [185](185_R10_A_CARE_NAVIGATION_KERNEL_IMPLEMENTATION.md) · [187](187_R10_B_CUSTOMER_CARE_NAVIGATION_UI_IMPLEMENTATION.md) · [189](189_R10_C_PROVIDER_MATCH_HANDOFF_IMPLEMENTATION.md) · [190](190_POST_R10_C_AUDIT.md) · [191](191_R10_D_ADMIN_OVERRIDE_IMPLEMENTATION.md) · [192](192_POST_R10_D_AUDIT.md))
**Objective:** Symptom/voice → clarify → red-flag → urgency → specialty + explanation → match → appointment/tele handoff.  
**Domains:** Care Navigation, Clinical Triage, Specialist Matching.  
**Apps:** Customer mobile+web only for intake; Admin/doctor override+audit.  
**Depends:** R2 doctor+slots; R4 for tele handoff; R9 closed ([182](182_POST_R9_FINAL_CLOSURE_AUDIT.md)); packs off by default.  
**Human:** **OD-CARE-01** (rules vs ML), **OD-CARE-02** emergency copy.  
**Legal:** decision-support, emergency routing — **not** diagnosis.  
**Security:** PHI not in events/notifications; clinician override audited.  
**Accept:** red-flag prefers emergency guidance; no auto-Rx; explanation + audit stored without claiming diagnosis.  
**Canonical plan:** [183](183_R10_IMPLEMENTATION_PLAN.md) (**R10_PLAN_READY**). **Plan audit** [184](184_POST_R10_PLAN_AUDIT.md) (**R10_PLAN_GREEN_R10_A_READY**). **R10-A** [185](185_R10_A_CARE_NAVIGATION_KERNEL_IMPLEMENTATION.md) (**R10_A_IMPLEMENTED**); audit **CR-POST-R10-A-AUDIT-186** proposed. **R10-B** [187](187_R10_B_CUSTOMER_CARE_NAVIGATION_UI_IMPLEMENTATION.md) (**R10_B_IMPLEMENTED**); audit [188](188_POST_R10_B_AUDIT.md) (**R10_B_GREEN_R10_C_READY**). **R10-C** [189](189_R10_C_PROVIDER_MATCH_HANDOFF_IMPLEMENTATION.md) (**R10_C_IMPLEMENTED**); audit [190](190_POST_R10_C_AUDIT.md) (**R10_C_GREEN_R10_D_READY**). **R10-D** [191](191_R10_D_ADMIN_OVERRIDE_IMPLEMENTATION.md) (**R10_D_IMPLEMENTED**); closure audit [192](192_POST_R10_D_AUDIT.md) (**R10_GREEN_CLOSED_R11_READY_FOR_PLANNING**). **R10-E** document uploads [297](297_R10_E_HEALTH_DOCUMENT_UPLOAD.md) (**R10_E_IMPLEMENTATION_COMPLETE**); **R10-E mobile upload parity** [298](298_R10_E_MOBILE_UPLOAD_PARITY.md) (**R10_E_MOBILE_UPLOAD_PARITY_COMPLETE**); **R10-F** consult-note projection [299](299_R10_F_CONSULT_NOTE_PROJECTION.md) (**R10_F_IMPLEMENTATION_COMPLETE**). Optional health-record expansion **COMPLETE**.

### R11 — CMS + Help Center + Support desk — **CLOSED** ([193](193_R11_IMPLEMENTATION_PLAN.md) · [204](204_POST_R11_E_AUDIT.md))
**Objective:** One CMS (blog, education, news, landings, banners, FAQ, KB); one helpdesk (multi-queue).  
**Domains:** CMS, Support.  
**Apps:** Admin authoring; Customer Help; partner queues inside existing partner apps (not new apps).  
**Depends:** R0 identity; notifications.  
**Legal:** **OD-CMS-01** claims; **OD-SUP-01** chat vs ticket.  
**Security:** minimum-necessary ticket links; no unrestricted clinical paste.  
**Accept:** publish country-targeted article; ticket from order id without lab values.  
**Canonical plan:** [193](193_R11_IMPLEMENTATION_PLAN.md) (**R11_PLAN_READY**). Plan audit [194](194_POST_R11_PLAN_AUDIT.md) (**R11_PLAN_GREEN_R11_A_READY**). **R11-A** implemented [195](195_R11_A_BACKEND_KERNEL_IMPLEMENTATION.md) (**R11_A_IMPLEMENTED**); post-R11-A audit [196](196_POST_R11_A_AUDIT.md) (**R11_A_GREEN_R11_B_READY**). **R11-B** implemented [197](197_R11_B_ADMIN_CMS_UI_IMPLEMENTATION.md) (**R11_B_IMPLEMENTED**); post-R11-B audit [198](198_POST_R11_B_AUDIT.md) (**R11_B_GREEN_R11_C_READY**). **R11-C** implemented [199](199_R11_C_CUSTOMER_HELP_CENTER_IMPLEMENTATION.md) (**R11_C_IMPLEMENTED**); post-R11-C audit [200](200_POST_R11_C_AUDIT.md) (**R11_C_GREEN_R11_D_READY**). **R11-D** implemented [201](201_R11_D_SUPPORT_DESK_IMPLEMENTATION.md) (**R11_D_IMPLEMENTED**); post-R11-D audit [202](202_POST_R11_D_AUDIT.md) (**R11_D_GREEN_R11_E_READY**). **R11-E** implemented [203](203_R11_E_CLOSURE_IMPLEMENTATION.md) (**R11_E_IMPLEMENTED**); post-R11-E audit [204](204_POST_R11_E_AUDIT.md) (**R11_GREEN_CLOSED_R12_READY_FOR_PLANNING**). **R12+** NOT started.

### R12 — CRM, marketing, loyalty, affiliate, commerce extras — **CLOSED**
**Objective:** Non-clinical CRM 360; campaigns; coupons; affiliate **web**; referral; loyalty/membership; wishlist; reviews/Q&A; personalization hooks; subscription/refill **hooks** (clinical refill gated **OD-RX-REFILL**).  
**Domains:** CRM, Marketing, Affiliate, Loyalty, Reviews, Subscription.  
**Apps:** Admin CRM/marketing; Affiliate web; Customer expansion.  
**Depends:** R1 conversion events; R11 for content; consent for marketing.  
**Legal:** inducement, ads, doctor/lab ratings **OD-RATE-01**.  
**Security:** marketing opt-in; WhatsApp pack default off ([23](23_NOTIFICATION_ARCHITECTURE.md)).  
**Accept:** 360 without lab values; campaign send suppressed without consent.  
**Canonical plan:** [205](205_R12_IMPLEMENTATION_PLAN.md) (**R12_PLAN_READY**). Plan audit [206](206_POST_R12_PLAN_AUDIT.md) (**R12_PLAN_GREEN_R12_A_READY**). **R12-A** implemented [207](207_R12_A_CRM_MARKETING_PREFS_IMPLEMENTATION.md) (**R12_A_IMPLEMENTED**); post-R12-A audit [208](208_POST_R12_A_AUDIT.md) (**R12_A_GREEN_R12_B_READY**). **R12-B** implemented [209](209_R12_B_MARKETING_CAMPAIGNS_IMPLEMENTATION.md) (**R12_B_IMPLEMENTED**); post-R12-B audit [210](210_POST_R12_B_AUDIT.md) (**R12_B_GREEN_R12_C_READY**). **R12-C** implemented [211](211_R12_C_PROMO_IMPLEMENTATION.md) (**R12_C_IMPLEMENTED**); post-R12-C audit [212](212_POST_R12_C_AUDIT.md) (**R12_C_GREEN_R12_D_READY**). **R12-D** implemented [213](213_R12_D_AFFILIATE_IMPLEMENTATION.md) (**R12_D_IMPLEMENTED**); post-R12-D audit [214](214_POST_R12_D_AUDIT.md) (**R12_D_GREEN_R12_E_READY**). **R12-E** implemented [215](215_R12_E_WISHLIST_LOYALTY_IMPLEMENTATION.md) (**R12_E_IMPLEMENTED**); post-R12-E audit [216](216_POST_R12_E_AUDIT.md) (**R12_E_GREEN_R12_F_READY**). **R12-F** implemented [217](217_R12_F_REVIEWS_QA_PERSONALIZATION_IMPLEMENTATION.md) (**R12_F_IMPLEMENTED**); post-R12-F audit [218](218_POST_R12_F_AUDIT.md) (**R12_F_GREEN_R12_G_READY**). **R12-G** implemented [219](219_R12_G_REFILL_MARKETING_HOOKS_IMPLEMENTATION.md) (**R12_G_IMPLEMENTED**); post-R12-G audit [220](220_POST_R12_G_AUDIT.md) (**R12_G_GREEN_R12_H_READY**). **R12-H** closure [221](221_R12_H_CLOSURE_IMPLEMENTATION.md) (**R12_H_IMPLEMENTED**); post-R12-H audit [222](222_POST_R12_H_AUDIT.md) (**R12_GREEN_CLOSED_R13_READY_FOR_PLANNING**).

### R13 — Search, recommendations, analytics/BI — **CLOSED** ([223](223_R13_IMPLEMENTATION_PLAN.md) · [240](240_POST_R13_H_AUDIT.md))
**Objective:** Platform discovery + warehouse. Separate indexes: commerce, provider, content, help, **clinical/PHI**.  
**Domains:** Search, Recommendations, Analytics.  
**Depends:** R1 catalog; R11 content; R9 for PHI index.  
**Legal:** PHI analytics IAM; clinical search **legally disabled** (OD-R13-04).  
**Security:** clinical never in public commerce index.  
**Accept:** typeahead medicines ≠ symptom-to-drug “treatment”; clinical search role-gated.  
**Canonical plan:** [223](223_R13_IMPLEMENTATION_PLAN.md) (**R13_PLAN_READY**). **R13-A…H** implemented [225](225_R13_A_SEARCH_INDEXING_IMPLEMENTATION.md)–[239](239_R13_H_CLOSURE_IMPLEMENTATION.md); final audit [240](240_POST_R13_H_AUDIT.md) (**R13_GREEN_CLOSED**); full audit [241](241_FULL_PROJECT_AUDIT.md) (**R13_GREEN_CLOSED_R14_READY_FOR_PLANNING**). **`r13h.closure.e2e`** + phase e2e suites green at closure.

### R14 — Live finance & live carriers — **GO-LIVE GATE** (plan ready; IMPL NOT authorized)
**Objective:** Real PSP, real carrier (e.g. DHL only if contracted), real payout, tax/statutory, actual-cost recon.  
**Depends:** named **legal entity**, MoR, PSP, tax, FX, payout provider, settlement rules, accounting, audit controls, carrier contract/credentials/coverage/regulated-shipping/pricing/recon.  
**Legal:** all of the above — **OPEN** until humans decide.  
**Security:** PCI still PSP-hosted; no PAN/CVV.  
**Accept:** country pack enables live rails; sandbox remains for other countries. **Do not mark production-ready without this gate.**  
**Plan:** [242](242_R14_IMPLEMENTATION_PLAN.md). **Audit:** [243](243_POST_R14_PLAN_AUDIT.md). **R14-A:** foundation [268](268_R14_A_ENGINEERING_FOUNDATION.md) (**ENGINEERING_FOUNDATION_COMPLETE**); refund listener [269](269_R14_A_REFUND_LISTENER_IMPLEMENTATION.md) + [270](270_R14_A_REFUND_LISTENER_VERIFICATION.md) (**R14_A_REFUND_LISTENER_COMPLETE**); order refund status [271](271_R14_A_ORDER_REFUND_STATUS.md) (**R14_A_ORDER_REFUND_STATUS_COMPLETE**); webhook recon [272](272_R14_A_PAYMENT_WEBHOOK_RECON.md) (**R14_A_PAYMENT_WEBHOOK_RECON_COMPLETE**); admin observability [273](273_R14_A_PAYMENT_ADMIN_OBSERVABILITY.md) (**R14_A_PAYMENT_ADMIN_OBSERVABILITY_COMPLETE**); routing matrix [274](274_R14_A_PAYMENT_ROUTING_MATRIX.md) (**R14_A_PAYMENT_ROUTING_MATRIX_COMPLETE**); sandbox failover [275](275_R14_A_PAYMENT_SANDBOX_FAILOVER.md) (**R14_A_PAYMENT_SANDBOX_FAILOVER_COMPLETE**); checkout pay guard [276](276_R14_A_PAYMENT_CHECKOUT_PAY_GUARD.md) (**R14_A_PAYMENT_CHECKOUT_PAY_GUARD_COMPLETE**); failed attempt audit [277](277_R14_A_PAYMENT_FAILED_ATTEMPT_AUDIT.md) (**R14_A_PAYMENT_FAILED_ATTEMPT_AUDIT_COMPLETE**); failed reservation release [278](278_R14_A_PAYMENT_FAILED_RESERVATION_RELEASE.md) (**R14_A_PAYMENT_FAILED_RESERVATION_RELEASE_COMPLETE**); checkout session state [279](279_R14_A_PAYMENT_CHECKOUT_SESSION_STATE.md) (**R14_A_PAYMENT_CHECKOUT_SESSION_STATE_COMPLETE**); final code audit [280](280_R14_A_FINAL_CODE_AUDIT.md) (**R14_A_ENGINEERING_COMPLETE**); evidence close [281](281_R14_A_HUMAN_GATE_EVIDENCE_CLOSE.md) (**INCOMPLETE — 0/7**); production baseline [282](282_R14_A_PRODUCTION_READINESS_BASELINE.md) (**R14_A_PRODUCTION_BASELINE_COMPLETE_HUMAN_GATES_BLOCKED**); human approval intake [283](283_R14_A_HUMAN_APPROVAL_INTAKE.md) (**R14_A_HUMAN_GATES_INCOMPLETE — 0/7**). **R14-B:** foundation audit [284](284_R14_B_FOUNDATION_AUDIT.md) (**R14_B_FOUNDATION_SLICE_COMPLETE**); settlement import port [285](285_R14_B_SETTLEMENT_IMPORT_PORT.md) (**R14_B_SETTLEMENT_IMPORT_PORT_COMPLETE**); payout execution ledger [286](286_R14_B_PAYOUT_LEDGER.md) (**R14_B_PAYOUT_LEDGER_COMPLETE**); reconciliation break workflow [287](287_R14_B_RECON_BREAK_WORKFLOW.md) (**R14_B_RECON_BREAK_WORKFLOW_COMPLETE**); settlement import worker [288](288_R14_B_SETTLEMENT_IMPORT_WORKER.md) (**R14_B_SETTLEMENT_IMPORT_WORKER_COMPLETE**); settlement schedule admin [289](289_R14_B_SETTLEMENT_SCHEDULE_ADMIN.md) (**R14_B_SETTLEMENT_SCHEDULE_ADMIN_COMPLETE**); break queue UI [290](290_R14_B_BREAK_QUEUE_UI.md) (**R14_B_BREAK_QUEUE_UI_COMPLETE**); vendor payable partial refund [291](291_R14_B_VENDOR_PAYABLE_PARTIAL_REFUND.md) (**R14_B_VENDOR_PAYABLE_PARTIAL_REFUND_COMPLETE**); post-R14B closure [292](292_R14_POST_R14B_CLOSURE_VERIFICATION.md) (**R14_B_SANDBOX_FINANCE_ENGINEERING_CLOSED**). Owner must supply [263](263_R14_A_HUMAN_APPROVAL_HANDOFF.md) decisions before live PSP wiring. **Do not execute CR-R14-A-IMPL-244 unchanged.** Sub-phases: R14-A live PSP (post-gates) → R14-B settlement import → R14-C … → R14-G closure.

### R15 — Company control-plane depth + BC/DR — **LATER / ongoing**
**Objective:** Workforce, maker-checker, feature flags, residency runbooks, DR tests; Business Unit membership if funded.  
**Domains:** Company governance, Compliance, Audit, Security.  
**Apps:** Admin/ERP expansion only.  
**Depends:** R0/R2 governance foundation.  
**Legal:** employment vs contractor; residency law.  
**Accept:** partner cannot grant `company_*`; DR drill documented.

### R16 — Second country / optional extract — **LATER**
Filled packs (not forks). Microservice extract **only** if a context forces it ([04](04_APPLICATION_ARCHITECTURE.md)). Not a substitute for R0–R14.

---

## 4. Application delivery order

| App | Surface | Status | Wave | Purpose / users | Nav (major) | Perms / data | Depends |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Customer | M+W | FOUNDATION | R3–R12 expand | One super-app: commerce+care+content+support | Home, Orders, Care/Health, Help, Account | `customer`; own person | R0–R1 |
| Admin/ERP | W | FOUNDATION | R3, R11–R15 | Company control plane | Identity, orgs, countries, finance, care ops, CMS, support, audit | company roles + scope | R0, [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md) |
| Doctor | M+W | FOUNDATION | R4–R5, R10 override | Care delivery | Today, queue, encounter, Rx, earnings | doctor + relationship+consent | R2 |
| Store | M+W | NEXT | R3, R5 | Location pharmacy ops | Queue, pack, Rx desk, inventory | org+location; never global finance | R1 |
| Delivery | M | NEXT | R3, R7 jobs | Assigned jobs | Offers, active, POD, earnings | assigned job only | R1 logistics |
| Partner Join | W | NEXT | R3 | Onboarding only | Apply, KYC, status | `partner_applicant` | R0 partner |
| Vendor | W | LATER | R6 | Seller ops | Catalog, orders, settlements | own seller org | R1, R6 |
| Lab | W | LATER | R7 | Lab org ops | Catalog, accession, processing | own lab | R7 |
| Lab staff | M | LATER | R7 | Bench workflow | Scan, bench, handover | assigned work | R7 |
| Phlebotomist | M | LATER | R7 | Collection | Jobs, collect, CoC | assigned patients | R7 |
| Pathologist | W | LATER | R7 | Assigned cases | Queue, case, report | assigned cases | R7 |
| Logistics/Ops | W | LATER | R3 shell, R7–R8 jobs | Company or contracted ops | Jobs, exceptions, SLA | logistics perms or delivery org | R1, R7 |
| Affiliate | W only | LATER | R12 | Attribution/earnings | Links, conversions, KYC | own affiliate org | R12 |
| Radiologist | W if OD-RAD-01 | LATER | R8 | Imaging worklist | Worklist, report | assigned studies | R8 |
| Affiliate mobile | — | DEFERRED | — | — | — | — | CR to reopen |
| Generic Partner App | — | DEFERRED | — | Forbidden | — | — | — |

**Permissions:** UI hide ≠ authz. Server RBAC + membership scope remain mandatory.

---

## 5. Domain delivery order (kernels)

| Order | Domain | Wave |
| --- | --- | --- |
| Done | Identity, Security, Observability, CI/CD, Policy packs (empty), Partner dark, Catalog, Inventory, Cart, Checkout, Payment (sandbox), Order, Logistics (mock), Ledger (sandbox), Doctor, Appointments, MNC scope, Audit | R0–R2 |
| Next | Store/delivery/join **clients** on existing domains | R3 |
| Then | Telemedicine | R4 |
| Then | Prescription, Pharmacy dispensing | R5 |
| Then | Vendor marketplace | R6 |
| Then | Laboratory, Sample/CoC, Pathology, Reports (lab), Phlebotomist | R7 |
| Then | Radiology/Imaging | R8 |
| Then | Health Record UX, Consent UX — **plan ready** [170](170_R9_IMPLEMENTATION_PLAN.md) | R9 |
| Then | Care Navigation, Clinical Triage, Specialist Matching | R10 |
| Then | CMS (blog/education), Support/Helpdesk | R11 |
| Then | CRM, Marketing, Loyalty, Membership, Referral, Wishlist, Reviews, Q&A, Subscription/refill (gated) | R12 |
| Then | Search (split indexes), Recommendations, Analytics/BI | R13 |
| Gate | Live PSP, live carrier, real payout, tax/statutory, real settlement | R14 |
| Ongoing | Workforce, maker-checker, flags, residency, BC/DR | R15 |
| Optional | Second country packs; extract | R16 |

Notifications remain **one kernel** from R0; templates added each wave — never a second engine.

---

## 6. Company vs partner admin

| | Company Admin / ERP | Partner admin |
| --- | --- | --- |
| Scope | Global → region → country → legal entity → BU → org → location | Own organization / location only |
| May | Governance, workforce, finance, compliance, audit, policy, flags, residency, DR | Operational queues for own org |
| Must not | Be granted by Join or org admin | Receive `company_*`, pack publish, global finance, break-glass grant |

---

## 7. Customer master experience (one product)

Customer mobile + web remain **one experience**. Roadmap adds screens **inside** that product, not new customer apps:

Commerce (catalog, cart, pay, orders, tracking, wishlist, reviews, membership, subscriptions) · Care navigation · Appointments · Telemedicine · Pharmacy/Rx · Labs · Radiology · Reports · Health record · Support/Help/Blog · Notifications.

---

## 8. Care navigation placement (R10)

```
Symptom / voice (adapter)
  → clarification questions
  → red-flag detection
  → if emergency: pack urgency guidance (not discovery-first)
  → else specialty recommendation + explanation
  → doctor / clinic / hospital match (geo, pack, availability)
  → appointment handoff (R2) / telemedicine handoff (R4)
  → clinician override + audit
```

Not autonomous diagnosis. No automatic prescription. Pack-off until **OD-CARE-01/02** + legal.

---

## 9. Search / AI

| Index | Contents | Public? |
| --- | --- | --- |
| Commerce | Products, sellers, stores | Pack-public |
| Provider | Doctors, labs, imaging sites | Pack-public cards only |
| Content | CMS articles | Pack-public |
| Help | Help Center | Pack-public |
| Clinical/PHI | Records, tickets with clinical refs | **Never** public; separate IAM |

Do not synonym a symptom to a drug as treatment ([24](24_SEARCH_ARCHITECTURE.md)).

---

## 10. Financial go-live (R14) — checklist

Do **not** call live money “production-ready” until **all** are explicit: legal entity, MoR, PSP, tax, FX, compliance, payout provider, settlement rules, accounting, audit.  
Live DHL/carrier: contract, credentials, country coverage, regulated shipping review, pricing, actual-cost reconciliation.  
Until then: sandbox/mock only.

---

## 11. Legal / compliance gates (do not invent law)

| Wave | Gate (review required) |
| --- | --- |
| R4 | Telehealth license, recording, cross-border consult |
| R5 | e-Rx, dispensing, **OD-RX-REFILL** — plan [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md); **R5-A…E done**; **R5-F engineering kernel COMPLETE** (sandbox adapter only; live provider **HUMAN_BLOCKED** L-RX-01); post-R5 audit [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md) (**ECOSYSTEM_WITH_BLOCKERS** — see §22 reconciliation) |
| R6 | Marketplace vendor web — **COMPLETE** [138](138_R6_F_VENDOR_MARKETPLACE_ACCEPTANCE_IMPLEMENTATION.md); audit [139](139_POST_R6_GLOBAL_ECOSYSTEM_AUDIT.md) (**ECOSYSTEM_R6_COMPLETE_R7_READY_FOR_PLANNING**); **R7 not started** |
| R7 | Lab marketplace — **R7 CLOSED** [150](150_R7_F_PHYSICAL_REPORT_FINANCE_IMPLEMENTATION.md); blockers [152](152_R7_GLOBAL_AUDIT_BLOCKERS_FIX_IMPLEMENTATION.md); regression [153](153_R7_FINAL_VIDEO_REGRESSION_FIX.md) **R7_FINAL_REGRESSION_GREEN**; closure [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) **R7_CLOSED_R8_READY_FOR_PLANNING** |
| R8 | Radiology/imaging — **R8-F GREEN** [169](169_POST_R8_F_AUDIT.md) (**R8_F_GREEN_R9_READY_FOR_PLANNING**) |
| R9 | Health record + consent UX — **CLOSED** [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) (**R9_GREEN_CLOSED_R10_READY_FOR_PLANNING**); controller/processor, residency (**OD-EHR-01/02**, **OD-R9-06**) remain human gates |
| R10 | Care navigation — **CLOSED** [192](192_POST_R10_D_AUDIT.md) (**R10_GREEN_CLOSED_R11_READY_FOR_PLANNING**); R10-A…D implemented [185](185_R10_A_CARE_NAVIGATION_KERNEL_IMPLEMENTATION.md) [187](187_R10_B_CUSTOMER_CARE_NAVIGATION_UI_IMPLEMENTATION.md) [189](189_R10_C_PROVIDER_MATCH_HANDOFF_IMPLEMENTATION.md) [191](191_R10_D_ADMIN_OVERRIDE_IMPLEMENTATION.md); **R10-E** uploads [297](297_R10_E_HEALTH_DOCUMENT_UPLOAD.md) + mobile [298](298_R10_E_MOBILE_UPLOAD_PARITY.md); **R10-F** consult notes [299](299_R10_F_CONSULT_NOTE_PROJECTION.md) — optional health expansion **COMPLETE**; OD-CARE-01/02 |
| R11 | CMS + Help Center + Support — **CLOSED** [204](204_POST_R11_E_AUDIT.md) (**R11_GREEN_CLOSED_R12_READY_FOR_PLANNING**); plan [193](193_R11_IMPLEMENTATION_PLAN.md); **R11-A** [195](195_R11_A_BACKEND_KERNEL_IMPLEMENTATION.md); **R11-B** [197](197_R11_B_ADMIN_CMS_UI_IMPLEMENTATION.md); **R11-C** [199](199_R11_C_CUSTOMER_HELP_CENTER_IMPLEMENTATION.md); **R11-D** [201](201_R11_D_SUPPORT_DESK_IMPLEMENTATION.md); **R11-E** [203](203_R11_E_CLOSURE_IMPLEMENTATION.md); R12 NOT started; OD-CMS-01/OD-SUP-01 |
| R12 | CRM, marketing, loyalty, affiliate — **CLOSED** [222](222_POST_R12_H_AUDIT.md) (**R12_GREEN_CLOSED_R13_READY_FOR_PLANNING**); plan [205](205_R12_IMPLEMENTATION_PLAN.md); **R12-A…H** [207](207_R12_A_CRM_MARKETING_PREFS_IMPLEMENTATION.md) [209](209_R12_B_MARKETING_CAMPAIGNS_IMPLEMENTATION.md) [211](211_R12_C_PROMO_IMPLEMENTATION.md) [213](213_R12_D_AFFILIATE_IMPLEMENTATION.md) [215](215_R12_E_WISHLIST_LOYALTY_IMPLEMENTATION.md) [217](217_R12_F_REVIEWS_QA_PERSONALIZATION_IMPLEMENTATION.md) [219](219_R12_G_REFILL_MARKETING_HOOKS_IMPLEMENTATION.md) [221](221_R12_H_CLOSURE_IMPLEMENTATION.md); OD-CRM-*, OD-RATE-01, OD-RX-REFILL |
| R13 | Search, recommendations, analytics/BI — **CLOSED** [240](240_POST_R13_H_AUDIT.md) (**R13_GREEN_CLOSED**); full audit [241](241_FULL_PROJECT_AUDIT.md); plan [223](223_R13_IMPLEMENTATION_PLAN.md); **R13-A…H** [225](225_R13_A_SEARCH_INDEXING_IMPLEMENTATION.md)–[239](239_R13_H_CLOSURE_IMPLEMENTATION.md); clinical search **legally disabled** (OD-R13-04); **`R13_GREEN_CLOSED_R14_READY_FOR_PLANNING`** |
| R14 | Payments — **PLAN GREEN** [242](242_R14_IMPLEMENTATION_PLAN.md) [243](243_POST_R14_PLAN_AUDIT.md); foundation [268](268_R14_A_ENGINEERING_FOUNDATION.md); refund listener [269](269_R14_A_REFUND_LISTENER_IMPLEMENTATION.md) + [270](270_R14_A_REFUND_LISTENER_VERIFICATION.md) (**COMPLETE**); order refund status [271](271_R14_A_ORDER_REFUND_STATUS.md) (**COMPLETE**); webhook recon [272](272_R14_A_PAYMENT_WEBHOOK_RECON.md) (**COMPLETE**); admin observability [273](273_R14_A_PAYMENT_ADMIN_OBSERVABILITY.md) (**COMPLETE**); routing matrix [274](274_R14_A_PAYMENT_ROUTING_MATRIX.md) (**COMPLETE**); sandbox failover [275](275_R14_A_PAYMENT_SANDBOX_FAILOVER.md) (**COMPLETE**); checkout pay guard [276](276_R14_A_PAYMENT_CHECKOUT_PAY_GUARD.md) (**COMPLETE**); failed attempt audit [277](277_R14_A_PAYMENT_FAILED_ATTEMPT_AUDIT.md) (**COMPLETE**); failed reservation release [278](278_R14_A_PAYMENT_FAILED_RESERVATION_RELEASE.md) (**COMPLETE**); checkout session state [279](279_R14_A_PAYMENT_CHECKOUT_SESSION_STATE.md) (**COMPLETE**); final code audit [280](280_R14_A_FINAL_CODE_AUDIT.md) (**R14_A_ENGINEERING_COMPLETE**); evidence close [281](281_R14_A_HUMAN_GATE_EVIDENCE_CLOSE.md) (**INCOMPLETE — 0/7**); production baseline [282](282_R14_A_PRODUCTION_READINESS_BASELINE.md) (**R14_A_PRODUCTION_BASELINE_COMPLETE_HUMAN_GATES_BLOCKED**); human approval intake [283](283_R14_A_HUMAN_APPROVAL_INTAKE.md) (**R14_A_HUMAN_GATES_INCOMPLETE — 0/7**); **R14-B** foundation [284](284_R14_B_FOUNDATION_AUDIT.md) (**R14_B_FOUNDATION_SLICE_COMPLETE**); settlement import [285](285_R14_B_SETTLEMENT_IMPORT_PORT.md) (**R14_B_SETTLEMENT_IMPORT_PORT_COMPLETE**); payout ledger [286](286_R14_B_PAYOUT_LEDGER.md) (**R14_B_PAYOUT_LEDGER_COMPLETE**); reconciliation break workflow [287](287_R14_B_RECON_BREAK_WORKFLOW.md) (**R14_B_RECON_BREAK_WORKFLOW_COMPLETE**); settlement import worker [288](288_R14_B_SETTLEMENT_IMPORT_WORKER.md) (**R14_B_SETTLEMENT_IMPORT_WORKER_COMPLETE**); settlement schedule admin [289](289_R14_B_SETTLEMENT_SCHEDULE_ADMIN.md) (**R14_B_SETTLEMENT_SCHEDULE_ADMIN_COMPLETE**); break queue UI [290](290_R14_B_BREAK_QUEUE_UI.md) (**R14_B_BREAK_QUEUE_UI_COMPLETE**); vendor payable partial refund [291](291_R14_B_VENDOR_PAYABLE_PARTIAL_REFUND.md) (**R14_B_VENDOR_PAYABLE_PARTIAL_REFUND_COMPLETE**); post-R14B closure [292](292_R14_POST_R14B_CLOSURE_VERIFICATION.md) (**R14_B_SANDBOX_FINANCE_ENGINEERING_CLOSED**); **live PSP NOT authorized**; **CR-R14-A-IMPL-244 partially stale — do not execute unchanged** |
| R15 | Employment, residency, DR evidence |

---

## 12. Human decisions still open

Existing [35](35_OPEN_DECISIONS.md) (country, brand, MoR, PSP, cloud, OT-OBS, video vendor, wallet, WhatsApp, etc.) **plus** CR-ECO-92: OD-CARE-01/02, OD-RAD-01/02, OD-CMS-01, OD-SUP-01, OD-RX-REFILL, OD-RATE-01, **OD-ROAD-01** (calendar).

**Default next coding authorization:** Live PSP still paused ([324](324_FINAL_ENGINEERING_HANDOFF.md)). [326](326_R14_A_ENGINEERING_CONFIG.md) is **engineering config only** (`R14_A_ENGINEERING_CONFIG_READY`, live **blocked**). PATH A checklist **0/7**. Not CR-244.

**Pre-R4 UI gate:** [100](100_GLOBAL_UI_UX_COMPLETENESS_AUDIT.md) (**CR-UI-AUDIT-100**) — R4 prerequisite checklist §12; overall ecosystem ~28–32% UI/product complete (judgment, not a repo metric).

---

## 13. Intentionally never (unless a future CR)

Generic Partner App; affiliate mobile; country-forked apps; second identity; Kafka as SoT; hospital HIS; insurance/TPA core; autonomous diagnosis; auto-Rx from care-nav; radiology-as-pathology; per-app CMS/notification engines; public PHI search; partner as company admin; PAN/CVV on platform.

---

## 14. Per-wave template (use when authorizing code)

Each authorized wave must restate: objective, domains, applications, dependencies, human decisions, legal gates, security, acceptance criteria — then implement **only** that wave.

---

## 15. Documentation-only confirmation

CR-ROAD-93 changes **Blueprint docs** ([93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md), index, lock pointer, [33](33_DEVELOPMENT_ROADMAP.md) pointer). **No production implementation.**
