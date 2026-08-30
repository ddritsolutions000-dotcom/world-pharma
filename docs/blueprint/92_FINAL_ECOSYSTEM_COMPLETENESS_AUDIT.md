# 92 — Final ecosystem completeness audit

**Status:** Blueprint change accepted **with conditions** (documentation only)  
**Change ID:** **CR-ECO-92**  
**Date:** 27 August 2026  
**Authority:** Completeness audit of the locked baseline. **No production implementation.**  
**Does not start:** prescription, lab, radiology, care navigation, CMS product, support desk product, CRM, live PSP, live DHL, real payouts, production telemedicine, CMS publishing, or any UI/API/migration.

This book is the **formal change record** and the **canonical completeness map** for capabilities that must not be forgotten. It does **not** authorize engineering to build those capabilities.

**Blueprint remains the single source of truth.** Locked requirements in [43](43_ECOSYSTEM_BASELINE_LOCK.md) are not silently rewritten. New slots enter only through this CR.

**OPEN HUMAN DECISION:** which reserved domains are funded after current healthcare slices.  
**LEGAL/COMPLIANCE REVIEW REQUIRED:** clinical decision-support, emergency routing, radiology operations, health-education claims, doctor/lab ratings, marketing channels (including WhatsApp), loyalty/membership inducement.

---

## 0. Change control (CR-ECO-92)

### 0.1 Problem

The locked baseline already covers pharmacy commerce, doctors, labs/pathology, logistics, payments, ledger, identity, MNC scope, and admin authority. A completeness pass found **first-class domains that were thin, implicit, or missing**:

- Care navigation / symptom-to-specialist (not in domain books as a bounded context)
- Radiology / imaging as its **own** context (today only mentioned as “imaging PDFs”)
- CMS as a **platform** (today banners/help/legal only)
- Support desk depth (tickets exist in CRM; not a multi-audience helpdesk)
- Commerce extras (wishlist, Q&A, subscriptions) scattered or thin
- Marketing/growth, search/personalization, analytics warehouse named but not inventoried as kernels
- Screen inventory in [25](25_UI_UX_ARCHITECTURE.md) / [78](78_HEALTHCARE_UI_UX_ARCHITECTURE.md) did not list the new journeys

### 0.2 Decision

| Field | Value |
| --- | --- |
| Decision | **ACCEPT_WITH_CONDITIONS** |
| Implementation | **Forbidden in this task.** Later work needs a **separate authorized phase** after this book. |
| Architecture | **Modular monolith remains canonical.** New names are **modules/bounded contexts**, not new deployables. |
| Law | **Not closed.** Empty Country Policy Packs stay empty. |
| Diagnosis | Platform **does not diagnose**. Care navigation is **decision-support / routing**, never a confirmed diagnosis, never auto-Rx. |

**Conditions:**

1. Do not represent AI/rules output as diagnosis or as a substitute for a licensed clinician.
2. Do not auto-prescribe from care navigation.
3. Red-flag / emergency paths must **prefer emergency guidance**, not normal doctor discovery.
4. Radiology is **not** a subtype of pathology.
5. One CMS, one notification kernel, one search kernel (with a **separate PHI/clinical index**).
6. Affiliate remains **web-only**. No generic Partner App.
7. Vendor remains **web-only** (aligns [88](88_GLOBAL_APPLICATION_TOPOLOGY.md); supersedes the RN line in [04](04_APPLICATION_ARCHITECTURE.md) §3 for vendor).
8. Partners never receive unrestricted company administration ([86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md), [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md)).

### 0.3 Impact

| Area | Impact |
| --- | --- |
| Journeys | New customer care-navigation journey; radiology booking/reporting; helpdesk; CMS authoring |
| Tables / APIs | **None now.** Logical modules reserved; no Prisma, no routes |
| Packs | Future keys: care_nav, radiology, cms, support, marketing channels, ratings — **values empty until legal review** |
| Phases | See §16. None of these start before existing unauthorized healthcare/money gates |
| Removed | Nothing locked is removed. Affiliate **mobile** remains **DEFERRED** (already [88](88_GLOBAL_APPLICATION_TOPOLOGY.md)) |
| Code | **No production code in CR-ECO-92** |

### 0.4 Security / compliance implications

- Care navigation and radiology process **health data** → consent, minimum necessary, residency, audit, break-glass, no PHI in events/notifications.
- Clinical search index **isolated** from commerce search.
- CRM/support **must not** copy clinical payloads.
- Marketing and WhatsApp remain pack + consent gated ([23](23_NOTIFICATION_ARCHITECTURE.md)).
- Doctor/lab ratings: defamation / professional-advertising law **OPEN**.

### 0.5 Dependencies

Doctor discovery + appointments ([65](65_DOCTOR_ECOSYSTEM.md), [84](84_P2_HC2_APPOINTMENT_CONSULTATION_IMPLEMENTATION.md)) before care-nav **handoff**. Lab/pathology books before radiology **adjacent** workflows. Notification kernel before CMS/support/marketing sends. Identity + country packs before any country enablement.

### 0.6 Implementation phase (reservation only)

See §16. **Not authorized to code.**

---

## 1. What was already covered (do not re-invent)

| Domain | Where | Status vs product |
| --- | --- | --- |
| Identity / Person | [40](40_IDENTITY_IMPLEMENTATION_NOTES.md), [03](03_USER_ROLES_AND_PERMISSIONS.md) | FOUNDATION in code |
| Partner / KYC / join | [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) | FOUNDATION (dark join) |
| Country policy | [18](18_GLOBALIZATION.md), [41](41_COUNTRY_POLICY_IMPLEMENTATION_NOTES.md) | FOUNDATION (empty packs) |
| MNC scope | [87](87_GLOBAL_MNC_RETROFIT_AUDIT.md), [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md) | FOUNDATION |
| Catalog, inventory, cart, checkout | Phase 1A–1C | FOUNDATION (commerce) |
| Payment, order, logistics, ledger | Phase 1D–1G | FOUNDATION (sandbox/mock) |
| Doctor + appointments | [65](65_DOCTOR_ECOSYSTEM.md), [83](83_P2_HC1_DOCTOR_FOUNDATION_IMPLEMENTATION.md)–[84](84_P2_HC2_APPOINTMENT_CONSULTATION_IMPLEMENTATION.md) | FOUNDATION (no video/Rx) |
| Telemedicine plan | [66](66_TELEMEDICINE_VIDEO.md) | PLANNED (video foundation may exist in repo; production telemedicine unauthorized) |
| Prescription plan | [67](67_PRESCRIPTION_ECOSYSTEM.md) | PLANNED |
| Lab, sample CoC, pathology, reports | [68](68_LAB_ECOSYSTEM.md)–[70](70_PATHOLOGY_REPORTING.md) | PLANNED |
| Health record + consent | [16](16_HEALTH_RECORD.md), [71](71_HEALTH_RECORD_CONSENT.md) | PLANNED |
| CRM (non-clinical 360) | [15](15_CRM_PLATFORM.md), [72](72_HEALTHCARE_CRM.md) | PLANNED |
| Support tickets (thin) | [15](15_CRM_PLATFORM.md) `support` | PLANNED |
| CMS banners/help/legal | [17](17_ADMIN_ERP.md) `M-ADM-CMS` | PLANNED (narrow) |
| Affiliate | [14](14_AFFILIATE_PLATFORM.md) | PLANNED (web) |
| Notifications | [23](23_NOTIFICATION_ARCHITECTURE.md) | FOUNDATION / PLANNED adapters |
| Search | [24](24_SEARCH_ARCHITECTURE.md) | PLANNED |
| Loyalty/coupons (gated) | [05](05_CUSTOMER_PLATFORM.md), Phase 7 | PLANNED |
| Reviews (commerce/doctor pack-gated) | [05](05_CUSTOMER_PLATFORM.md) | PLANNED |
| Admin/ERP + audit | [17](17_ADMIN_ERP.md), [86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md) | FOUNDATION shells |
| Observability | [30](30_OBSERVABILITY.md) | FOUNDATION |

---

## 2. Missing or under-specified (now reserved)

| Gap | Why it mattered | Slot |
| --- | --- | --- |
| Symptom → specialty routing | Only a search “do not synonym symptom to drug” rule existed | **CareNavigation**, **ClinicalTriage**, **SpecialistMatching** |
| Radiology / imaging | Imaging PDFs mentioned; no imaging BC, no modality workflow | **Radiology/Imaging** |
| CMS as education/news/SEO platform | CMS = home rails + help + legal | **CMS** expanded (still one platform) |
| Multi-audience helpdesk | Tickets under CRM, not partner/doctor/lab/delivery desks | **Support** kernel (central) |
| Wishlist, Q&A, subscriptions/refill, personalization | Partial commerce; not inventoried | Commerce completeness (PLANNED) |
| Marketing/growth kernel | Campaigns inside CRM; no A/B, attribution map | **Marketing** (uses notification kernel) |
| Analytics warehouse / exec dashboards | Observability ≠ commercial/clinical BI | **Analytics** (split PHI governance) |
| Workforce / maker-checker / DR as named MNC controls | Partially in admin/security | Documented under company control plane |
| Pathologist vs radiologist apps | Pathologist web exists; no radiologist surface | Radiologist **web** PLANNED; not a generic partner app |

---

## 3. Hard rules (care navigation)

This is **not** an autonomous diagnosis system.

| Must | Must not |
| --- | --- |
| Free-text and **architecture** for voice (adapter later) | Claim “AI diagnosed you” |
| Structured follow-ups, red-flag / urgency | Auto-prescribe |
| Specialty + doctor/clinic/hospital match (location + availability) | Bypass country pack / teleconsult law |
| Explain why a path was suggested | Hide the recommendation from audit |
| Human clinician override | Unattended clinical authority |
| Consent + privacy controls | Put PHI in marketing or ordinary search |
| Handoff to appointment / teleconsult **if pack allows** | Skip emergency guidance on red flags |

Emergency/red-flag: show **urgent/emergency-care guidance** from the **country pack** (no hardcoded national numbers). Do not funnel those users into ordinary discovery as the primary CTA.

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any model, rules engine, or vendor is chosen (**OD-CARE-01**).

---

## 4. Canonical application inventory (confirmed)

Canonical client list is [88](88_GLOBAL_APPLICATION_TOPOLOGY.md). CR-ECO-92 **confirms** it.

### 4.1 Mobile

| App | Path | Status |
| --- | --- | --- |
| Customer | `apps/mobile` | FOUNDATION |
| Store | `apps/mobile-store` | PLANNED |
| Delivery | `apps/mobile-delivery` | PLANNED |
| Doctor | `apps/mobile-doctor` | FOUNDATION |
| Lab staff | `apps/mobile-lab` | PLANNED |
| Phlebotomist | `apps/mobile-phlebotomist` | PLANNED |

### 4.2 Web

| App | Path | Status |
| --- | --- | --- |
| Customer | `apps/web-customer` | FOUNDATION |
| Store | `apps/web-store` | PLANNED |
| Vendor | `apps/web-vendor` | PLANNED (APIs exist) |
| Doctor | `apps/web-doctor` | FOUNDATION |
| Lab | `apps/web-lab` | PLANNED |
| Pathologist | `apps/web-pathologist` | PLANNED |
| Logistics / Ops | `apps/web-logistics` | PLANNED |
| Affiliate | `apps/web-affiliate` | PLANNED |
| Admin / ERP | `apps/web-admin` | FOUNDATION |
| Partner Join | `apps/web-join` | PLANNED |

### 4.3 Explicitly not apps

| Not an app | Stance |
| --- | --- |
| Generic Partner App | **Forbidden** |
| Affiliate mobile | **DEFERRED** |
| Vendor mobile | **Not in inventory** (web-only) |
| Radiologist | **PLANNED web module/app later**; do not invent in this CR as a shipped client |
| Independent blog/support/CMS sites | **Forbidden** — use kernels + existing clients |

`apps/ds-web` remains design-system playground only.

---

## 5. Canonical platform kernels (slots)

All are **modules in the modular monolith** unless a future ADR extracts one (payment, video, search, tracking, analytics ingest — [04](04_APPLICATION_ARCHITECTURE.md)).

| Kernel | Already in baseline? | Completeness |
| --- | --- | --- |
| Identity | Yes | FOUNDATION |
| Partner | Yes | FOUNDATION |
| Country Policy | Yes | FOUNDATION |
| MNC Scope | Yes | FOUNDATION |
| Catalog | Yes | FOUNDATION |
| Inventory | Yes | FOUNDATION |
| Cart | Yes | FOUNDATION |
| Checkout | Yes | FOUNDATION |
| Payment | Yes | FOUNDATION (sandbox) |
| Order | Yes | FOUNDATION |
| Logistics | Yes | FOUNDATION (mock carrier) |
| Finance / Ledger | Yes | FOUNDATION (mock payout) |
| Doctor | Yes | FOUNDATION |
| Appointments | Yes | FOUNDATION |
| Telemedicine | Yes (plan) | PLANNED / unauthorized prod |
| Prescription | Yes (plan) | PLANNED |
| Pharmacy | Yes | FOUNDATION |
| Laboratory | Yes (plan) | PLANNED |
| Sample / CoC | Yes (plan) | PLANNED |
| Pathology | Yes (plan) | PLANNED |
| **Radiology / Imaging** | **Missing as BC** | **PLANNED (new slot)** |
| Reports | Yes (pathology/lab) | PLANNED; radiology reports separate type |
| Health Record | Yes | PLANNED |
| Consent | Yes | PLANNED |
| **Care Navigation** | **Missing** | **PLANNED** |
| **Clinical Triage** | **Missing** | **PLANNED** (rules/pack; not diagnosis) |
| **Specialist Matching** | Thin (doctor search) | **PLANNED** (extends search + slots) |
| CRM | Yes | PLANNED |
| CMS | Thin | **PLANNED (expanded)** |
| Support | Thin tickets | **PLANNED (expanded helpdesk)** |
| Search | Yes | PLANNED |
| Recommendations | Thin | PLANNED |
| Marketing | Inside CRM | PLANNED (named kernel; uses notifications) |
| Notifications | Yes | FOUNDATION / PLANNED channels |
| Reviews / Ratings | Partial | PLANNED |
| Loyalty / Membership | Yes (gated) | PLANNED |
| Subscription / Refill | **Missing as BC** | **PLANNED** |
| Analytics | Observability only | PLANNED (warehouse) |
| Compliance | Yes | FOUNDATION |
| Audit | Yes | FOUNDATION |
| Security | Yes | FOUNDATION |
| Observability | Yes | FOUNDATION |

---

## 6. Care navigation architecture (slot)

**Modules:** `care_navigation` (orchestration), `clinical_triage` (urgency + red flags), `specialist_matching` (uses doctor/org/location/slot read models).

```
Customer text | voice-adapter
    → understand (rules/NLP vendor — OPEN)
    → follow-up questions
    → triage (routine | urgent | emergency)
    → if emergency: pack emergency guidance + optional human line (not discovery-first)
    → else: specialty suggestion + explanation
    → match doctors/clinics/hospitals (geo, pack, availability)
    → handoff Appointment | Teleconsult (pack)
    → clinician override + audit
```

**Data (logical, not migrated):** CareNavSession, TriageResult (codes not free-text diagnosis), MatchSet, RecommendationExplanation, OverrideEvent, Consent binding.

**Voice:** architecture slot + STT adapter; **not** a second product. Fail closed if pack disables audio PHI.

**Clients:** Customer mobile + customer web only for intake. Admin/clinical ops: override + audit. Partners do not own the engine.

---

## 7. Radiology / imaging architecture (slot)

**Bounded context:** `radiology` — **not** pathology, **not** generic lab.

| Owns | Does not own |
| --- | --- |
| Modality catalog (X-ray, US, CT, MRI, etc. as **pack-configured types**, no invented clinical protocols) | Pathology microscopy / LIS |
| Imaging site, equipment calendar, contrast/prep **content from provider + pack** | Sample CoC (lab) |
| Order, appointment, image-study pointer (object store), radiologist worklist | DICOM viewer vendor choice (**OD-RAD-02**) |
| Report artifact type `IMAGING_REPORT` in health record | Treating imaging PDF as a lab analyte |

**Surfaces (PLANNED):** customer booking (reuse appointment/lab booking patterns); imaging-center ops may share **lab web** with a radiology mode **or** a later radiologist web — **OD-RAD-01**. Do not create a generic Partner App.

**LEGAL:** ionizing radiation, reporting physician identity, official report status — **OPEN**.

---

## 8. CMS / content platform (expanded slot)

**One** `cms` kernel. No per-app WordPress.

**Must cover (PLANNED):** blog, articles, health/medicine/lab/clinical education, news, landing pages, banners, FAQ, Help Center articles, authors, categories, tags, draft/review/publish, schedule, localization, country targeting, SEO, media library, versioning, content audit.

**Already covered:** banners, help, legal versions ([17](17_ADMIN_ERP.md) §6.29).

**Not v1:** social network / UGC community (still out of lock §1.2). Education content is **company-published**, pack-approved claims.

**LEGAL:** medicine advertising and health claims.

---

## 9. Support / helpdesk (expanded slot)

**One** `support` kernel, many **queues** (customer, partner, vendor, store, doctor, lab, delivery, affiliate). Not eight products.

**Capabilities (PLANNED):** Help Center (CMS), tickets, conversations, attachments, categories, priority, SLA, assignment, escalation, internal notes, canned replies, KB, CSAT, complaint/dispute, fraud escalation, compliance escalation, audit.

**Links (read, minimum necessary):** Order, Payment, Delivery, Appointment, Lab booking id, Partner/KYC case, Account. **No** unrestricted clinical payload.

---

## 10–15. Other reserved capabilities (summary)

| Domain | Rule |
| --- | --- |
| CRM | Global **non-clinical** 360 for customer/partner/vendor; leads, tasks, campaigns, retention. **No** free copy of health record ([15](15_CRM_PLATFORM.md), [72](72_HEALTHCARE_CRM.md)) |
| Commerce extras | Wishlist, reviews/ratings (incl. seller/store; doctor/lab **pack + legal**), product Q&A, subscription/refill, membership/loyalty, referral, recommendations, personalization |
| Marketing | Campaigns, promo, coupons, affiliate, referral, loyalty, membership, segmentation, attribution, email/SMS/push/WhatsApp adapter, abandoned cart, re-engagement, experiment slot. **Consent + pack** |
| Notifications | Sole dispatcher ([23](23_NOTIFICATION_ARCHITECTURE.md)). Templates: security, OTP, order, payment, delivery, appointments, lab, reports, KYC, finance, support, marketing |
| Search | Global + product/doctor/lab/article/help/store/location; typeahead, filters. **PHI/clinical search isolated** |
| Analytics | Commerce, product, seller, logistics, healthcare **ops**, support, marketing, finance, exec, region/country/entity. **Clinical/PHI analytics separate IAM** |
| MNC control | Hierarchy in [89](89_COMPANY_GOVERNANCE_AND_AUTHORIZATION.md). Add explicit **PLANNED** admin capabilities: workforce, approval/maker-checker, feature flags, data residency ops, BC/DR runbooks. Partners ≠ company admin |

---

## 16. Suggested later phases (not a calendar, not authorization)

| Slot | Earliest logical phase | Gate |
| --- | --- | --- |
| Care nav / triage / matching | After doctor search + appointments exist | Legal **OD-CARE-01**; pack off by default |
| Radiology | After or beside Phase 5 diagnostics | **OD-RAD-01/02**; not inside pathology code |
| CMS expansion | Phase 7–8 | Claims legal review |
| Support helpdesk | Phase 7 | PHI minimization |
| CRM/marketing/loyalty | Phase 7 | Inducement + marketing law |
| Subscription/refill | After pharmacy orders stable | Clinical refill vs commerce **OD-RX-REFILL** |
| Analytics warehouse | Phase 8 | PHI warehouse isolation |
| Experiments / personalization | Phase 8+ | No clinical targeting without consent |

**None of the above is authorized by CR-ECO-92.**

---

## 17. UI/UX screen inventory (new/expanded) — status

Statuses: **IMPLEMENTED** | **FOUNDATION** | **PLANNED** | **DEFERRED**.  
**IMPLEMENTED = 0** for these rows. Never claim planned UI is implemented.

| Screen / flow | Apps | Status |
| --- | --- | --- |
| Care nav: symptom text | Customer M/W | PLANNED |
| Care nav: voice capture | Customer M/W | PLANNED (adapter) |
| Follow-up questions | Customer M/W | PLANNED |
| Red-flag / emergency guidance | Customer M/W | PLANNED |
| Specialty explanation | Customer M/W | PLANNED |
| Match list + book/tele handoff | Customer M/W | PLANNED |
| Clinician override console | Admin + doctor web | PLANNED |
| Care-nav audit | Admin | PLANNED |
| Radiology catalog/book | Customer M/W | PLANNED |
| Imaging worklist / report | Radiologist or lab-web mode | PLANNED |
| CMS authoring | Admin | PLANNED |
| Help Center (customer) | Customer M/W | PLANNED |
| Ticket / chat support | Customer + partner apps | PLANNED |
| Wishlist | Customer M/W | PLANNED |
| Reviews / Q&A | Customer M/W | PLANNED |
| Subscription / refill manager | Customer M/W | PLANNED |
| Campaign builder | Admin | PLANNED |
| Exec analytics | Admin | PLANNED |
| Affiliate mobile | — | DEFERRED |
| Generic partner app | — | DEFERRED |
| Autonomous diagnosis UI | — | DEFERRED (forbidden product) |

Existing commerce/care screens keep the statuses in [88](88_GLOBAL_APPLICATION_TOPOLOGY.md) and [78](78_HEALTHCARE_UI_UX_ARCHITECTURE.md).

---

## 18. Open human decisions (new)

| ID | Question | Must not be guessed in code |
| --- | --- | --- |
| **OD-CARE-01** | May care navigation use ML/NLP vendor vs rules only? | Legal + clinical |
| **OD-CARE-02** | Emergency copy and call-to-action per country | Legal + ops; pack CMS |
| **OD-RAD-01** | Radiologist web vs lab-web radiology mode | Product + ops |
| **OD-RAD-02** | DICOM/PACS viewer (vendor vs in-app) | Clinical + security |
| **OD-CMS-01** | Medical-claim workflow for education content | Legal |
| **OD-SUP-01** | Chat vs ticket-first for clinical-adjacent queues | Product + privacy |
| **OD-RX-REFILL** | Auto-refill vs pharmacist/doctor re-authorize | Clinical + legal |
| **OD-RATE-01** | Doctor/lab public ratings on/off | Legal (already related OD-DOC-09) |

Existing ODs (country, brand, MoR, PSP, telemedicine, recording off, wallet, WhatsApp) **remain open**.

---

## 19. Regression impact

**Code:** none required for CR-ECO-92.  
**Docs:** this book; index; lock pointer; [04](04_APPLICATION_ARCHITECTURE.md), [25](25_UI_UX_ARCHITECTURE.md), [35](35_OPEN_DECISIONS.md), [78](78_HEALTHCARE_UI_UX_ARCHITECTURE.md), [88](88_GLOBAL_APPLICATION_TOPOLOGY.md).  
**Risk if ignored:** building a second CMS, treating radiology as lab, shipping “symptom AI” as diagnosis, or a generic Partner App.

---

## 20. Books 90–91

**90** and **91** are unused. This completeness audit is **92** as requested. Do not invent 90–91 to fill the gap.
