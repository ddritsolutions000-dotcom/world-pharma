# 78 — Healthcare UI/UX architecture (apps, IA, states)

**Status:** Blueprint — **no screens implemented**  
**Related:** [25](25_UI_UX_ARCHITECTURE.md) · [26](26_DESIGN_SYSTEM.md) · [04](04_APPLICATION_ARCHITECTURE.md) · [64](64_PHASE_2_MASTER_PLAN.md)

Reuse **existing ui-kit**. No second design system. No legal brand. Healthcare tokens (if any): “clinical” density, waiting-room calm, **not** a new brand.

---

## 1. Shared UX rules

- Loading, empty, error, offline, permission-denied, session-expired states on every primary list.
- No PHI in push/SMS bodies.
- Destructive actions (cancel consult, publish report) confirm.
- Performance: code-split routes; RN FlashList/virtualization; images via CDN; cache non-PHI; optimistic slot hold with server confirm.

---

## 2. Customer App + Web (APP-CUS-M / APP-CUS-W)

**Purpose:** Super-app: pharmacy + care + labs + record.  
**Users:** Customer/patient.  
**Onboarding:** Existing OTP identity; healthcare profile fields optional until first booking.

**Nav:** Home · Pharmacy · Doctors · Labs · Orders · Health · Support · Profile  

**Screens (logical):** doctor search/profile, slot pick, pay, waiting room, in-call, consult summary, Rx list, lab catalog, booking, collection track, reports, consents, physical report request.

**CR-ECO-92 (PLANNED, not implemented):** Care navigation (symptom → questions → red-flag or specialty match → book/tele handoff); radiology booking; Help Center. **Not** a diagnosis product. Emergency path uses pack guidance first.

**Workflows:** book consult; attend; receive Rx → pharmacy; book lab; view report.  
**Permissions:** own data only.  
**Notifications:** appointment reminders, “report ready” (no values).  
**Offline:** browse cached catalog; no offline clinical write.  
**Security:** biometric optional; step-up for report download.  
**Perf:** first paint catalog < existing commerce SLA; video join p95 tracked.

---

## 3. Store App + Store Web (APP-PHARM / APP-PHARM-W)

**Purpose:** Pharmacy operations.  
**Users:** Store staff.  
**Nav:** Queue · Pick/Pack · Rx verification · Inventory · Orders · Settings  

**Workflows:** 1E fulfillment + **Rx artifact** review.  
**Permissions:** `order:fulfill`, `rx:verify` (new).  
**Offline:** pick list cache; confirm on reconnect.  
**Never:** full EHR.

Vendor Web (APP-VEND) stays **marketplace**, not a doctor/lab app.

---

## 4. Delivery App (APP-DEL)

**Purpose:** Medicine, sample **transport**, physical report **parcel**.  
**Nav:** Offers · Active job · Navigate · OTP/POD · Earnings · Profile  

**Payload:** address, OTP, seal id. **No PDF.**  
**Offline:** POD queue with idempotency.

---

## 5. Doctor App + Web (APP-DOC / APP-DOC-W)

**Purpose:** Care delivery.  
**Onboarding:** Partner join + credential upload.  
**Nav (mobile):** Today · Queue · Encounter · Rx · Earnings · Profile  
**Nav (web):** Calendar · Roster · Offers · Earnings · Documents · Settings  

**Workflows:** set availability; admit waiting room; complete encounter; issue Rx.  
**Permissions:** `encounter:*` only for linked patients.  
**Notifications:** new booking, patient in room.  
**Offline:** notes draft local encrypted; publish online.  
**Error:** call drop → RECONNECTING UI; do not auto-complete.

---

## 6. Lab Web + Lab App (APP-LAB-W / APP-LAB-S)

**Web nav:** Catalog · Bookings · Accession · Processing · Reports · Staff · Finance (own) · Settings  
**Staff RN nav:** Scan · Bench · Handover  

**Workflows:** publish tests; receive sample; reject; push to pathologist.  
**Permissions:** org-scoped.  
**Offline:** barcode scan queue.

---

## 7. Phlebotomist App (APP-PHE)

**Nav:** Jobs · Active · Collect · Handover · Earnings · Profile  

**Workflows:** accept → arrive → OTP → collect → seal → handover.  
**Minimum PII.** Failed collection reasons coded.  
**Offline:** CoC event queue; **no** overwrite of server seq.

---

## 8. Pathologist Web (APP-PATH)

**Nav:** Queue · Case · Report editor · Amendments · Profile  

**Workflows:** enter results; verify; publish; amend.  
**No** unrelated lab browse.

Radiology/imaging is **not** this app. Imaging worklist/report is a **PLANNED** radiology surface (**OD-RAD-01**). Do not reuse pathology case UI as a silent imaging product.

---

## 9. Logistics Ops Web (APP-LOG-W)

**Purpose:** Dispatch, SLA, exceptions.  
**Nav:** Map/list jobs · Exceptions · Partners · SLA  

**Not** a clinical viewer. Distinct from APP-DEL.

---

## 10. Affiliate Web only (APP-AFF-W)

**Mobile affiliate app: DEFERRED** ([88](88_GLOBAL_APPLICATION_TOPOLOGY.md), CR-ECO-92).  
**Nav (web):** Links · Conversions · Earnings · KYC · Profile  

Clinical attribution **OFF**. No patient names in conversion table unless pack + legal (default: order id only).

---

## 11. Admin / ERP (APP-ADM)

Existing shells + **Care ops**, **Diagnostics ops**, **Consent audit**, **Break-glass review**. Finance shell already 1G — healthcare facts appear as additional product types, not a second ledger UI.

---

## 12. Join (APP-JOIN-W)

Existing partner join; type-specific credential forms for doctor/lab/phlebotomist/pathologist.

---

## 13. Performance targets (directional)

| Surface | Target |
| --- | --- |
| Customer care home | Competitive with existing store home |
| Slot calendar | Server-paginated; no 90-day dump |
| RN lists | Virtualized |
| Video | Adaptive; audio fallback < N sec (measure, no fake SLA) |

No microservices for UX. CDN + Redis cache of **non-PHI** (slots, doctor cards).
