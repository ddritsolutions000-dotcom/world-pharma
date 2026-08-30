# 25 — UI / UX Architecture

**Status:** Blueprint  
**Audience:** Product, design, client engineering, QA  
**Requirement IDs:** REQ-CUST, REQ-PHARM, REQ-VEND, REQ-DOC, REQ-LAB, REQ-PHE, REQ-PATH, REQ-DEL, REQ-ADM  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business journeys J01–J21](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Applications](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Pharmacy](06_PHARMACY_PLATFORM.md) · [Vendor](07_VENDOR_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Phlebotomist](10_PHLEBOTOMIST_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [CRM](15_CRM_PLATFORM.md) · [Health](16_HEALTH_RECORD.md) · [Notifications](23_NOTIFICATION_ARCHITECTURE.md) · [Search](24_SEARCH_ARCHITECTURE.md) · [Design system spec](26_DESIGN_SYSTEM_SPEC.md) · **R5-B prescribing UX** [113](113_R5_B_PRESCRIBING_UX_PLAN.md) · **R5-C pharmacy desk** [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) (**R5_C_IMPLEMENTED**)

**This document is information architecture and interaction architecture. Do not start visual implementation from this file.** Tokens, density, and accessibility targets live in [26](26_DESIGN_SYSTEM_SPEC.md). No UI code, CSS, or components here.

---

## 1. Purpose and rules

| Rule | |
| --- | --- |
| One kernel, many role-native shells | [01](01_PRODUCT_VISION.md), [04](04_APPLICATION_ARCHITECTURE.md) |
| No pricing / Rx / slot logic on the client | Clients cache **display** rules only |
| Country first | Hide tiles and flows the pack disables; never hardcode a launch country |
| Trust over conversion | Healthcare empty/error copy; no dark patterns on consent, COD, or Rx |
| Accessibility | WCAG 2.2 AA target ([26](26_DESIGN_SYSTEM_SPEC.md)) |
| Poor network | Skeletons, last-known-good, queued field actions; **no offline pay** |

**OPEN DECISION (OD-UX-06):** Dark mode. Spec tokens in 26; product default **light** until brand (OD-DS-01) and clinical contrast are proven.

**OPEN DECISION (OD-UX-07):** Customer web vs mobile feature parity. Recommendation: **same journeys**; web may omit background location and rich push. Checkout, Rx, consult, reports **must** exist on both.

**OPEN DECISION (OD-UX-01):** Mixed medicine + lab + consult basket UI. Kernel CheckoutSession may compose children ([05](05_CUSTOMER_PLATFORM.md)); v1 UI may keep **three entry points** behind a pack flag.

---

## 2. Shared UX contracts (all apps)

Every screen family implements these five states. Copy is i18n + pack; never blame the user for a kernel failure.

### 2.1 Loading

- Skeleton of the **actual layout** (list, form, map chrome), not a blank canvas.
- Prefer **last-known-good + stale badge** for dashboards and queues.
- Payments, slot hold, Rx submit: blocking progress with **idempotent retry** messaging.
- Do not spin forever: timeout → error contract.

### 2.2 Empty

- One **primary CTA**; explain why empty (new store vs no jobs vs filtered out).
- Filters active → “clear filters”, not a generic zero.
- Healthcare: empty reports ≠ “you are healthy.” Neutral: “No reports yet.”

### 2.3 Error

- Retry + support entry (ticket id when known).
- Payment and clinical errors: **dedicated** copy (insufficient funds, Rx rejected reason **code**, identity mismatch). Not only “Something went wrong.”
- Never dump gateway or stack traces.

### 2.4 Permission

- OS permissions (camera, location, mic, notifications) requested **in context** (waiting room, scan, map), not on first launch dump.
- Denied: explain impact + deep link to OS settings; offer alternative (manual address, audio-only consult).
- RBAC: hide nav the role cannot use; if deep-linked, **403 explanation**, not a blank module.

### 2.5 Offline / degraded

| App class | Offline |
| --- | --- |
| Customer | Read cached catalog fragments, orders, report **metadata**; **block pay and booking confirm** |
| Pharmacy / vendor / lab web | Queue read-only; mutations fail clearly |
| Phlebotomist / rider | Queue GPS and status with `client_event_id`; conflict resolution on sync ([04](04_APPLICATION_ARCHITECTURE.md), [10](10_PHLEBOTOMIST_PLATFORM.md)) |
| Doctor consult | Media disconnect → reconnect + chat-as-source-of-truth ([08](08_DOCTOR_PLATFORM.md)); cannot “complete unpaid consult” offline |

Maps: **OPEN DECISION (OD-UX-05)** in-app map vs OS deep link. Tracking still shows status without a map if provider missing.

---

## 3. Cross-app IA principles

1. **Primary nav = daily jobs**, not org chart. Dense ERP (inventory, calendar, finance) lives on **web**; field jobs on **RN**.
2. **Status is a first-class object** (order, job, sample, appointment) — one tracking timeline, many labels by job type.
3. **Clinical vs commerce chrome** is visually distinct in 26 (Rx, panic, COD, consent). UX: never put “Buy now” on a panic banner.
4. **Deep links:** order, report, consult waiting room, referral, magic link (pack). Wrong `aud` token → re-auth, not privilege confusion ([03](03_USER_ROLES_AND_PERMISSIONS.md)).
5. **Notifications inbox** is a nav destination in customer + field apps ([23](23_NOTIFICATION_ARCHITECTURE.md)).

**OPEN DECISION (OD-UX-02):** One RN workspace with flavors vs many apps ([04](04_APPLICATION_ARCHITECTURE.md)). UX: **separate store listings** per audience regardless.

---

## 4. Customer mobile (APP-CUS-M)

**Users:** `customer` (caregiver later — **OPEN DECISION OD-UX-04** / OD-RBAC-03).  
**Auth:** Phone/email OTP; step-up for wallet/refund.

### 4.1 Navigation

**OPEN DECISION (OD-UX-03):** Bottom nav IA. Recommendation:

| Tab | Contents |
| --- | --- |
| Home | Country launchpad: search, service tiles (pack), banners, reorder, upcoming bookings, health shortcuts |
| Orders | Goods orders + delivery tracking |
| Care | Appointments, consults, Rx, labs, reports (or split **Health** tab) |
| Account | Profile, addresses, wallet, prefs, help, country |

If five tabs hurt reach: Home / Orders / Health / Account; Care nested in Health.

**Do not** show Lab/Doctor/Pharmacy tiles when pack disables them.

### 4.2 Information architecture (modules → screens)

| Area | Hierarchy |
| --- | --- |
| Auth | Splash → country (if not geo-forced) → register/login → OTP → legal consents |
| Home | CMS rails; search entry |
| Search | Typeahead → results (type tabs) → PDP |
| Medicines / products | PLP → PDP → offer compare (own vs vendor) → cart |
| Cart / checkout | Cart (goods only v1) → address → Rx attach → pay sheet |
| Orders | List → detail → tracking → OTP/POD instructions → invoice |
| Rx | Upload → status → confirm items → digital Rx viewer |
| Doctors | Discover → profile → slot → pay/hold → appointment → waiting room → consult |
| Labs | Tests/packages → prep → slot → address → booking → sample/report track |
| Health | Timeline, artifacts, consent grants, share |
| Wallet / payments | Balance, methods, refunds |
| Help | FAQ, tickets |
| Inbox | Notification center + preference center |

### 4.3 Journey mapping (customer)

See §15 for J01–J16 screen sequences. J17–J21 are not customer-primary (refunds/rewards may appear as **result** surfaces).

### 4.4 States (customer)

| State | Pattern |
| --- | --- |
| Empty home | Service tiles still shown; “Complete profile / add address” |
| Empty orders | “No orders” + search CTA |
| Empty reports | “No reports yet” + book test CTA if labs on |
| Loading PDP | Skeleton; stale price badge if cached |
| Payment error | Method-specific; retry; do not duplicate charge copy |
| Camera denied | Rx upload: gallery/PDF fallback |
| Mic/camera denied | Consult: audio fallback / reschedule |
| Offline | Banner; cart editable locally; **Pay** disabled |

**RISK:** Family sharing passwords (OD-CRM-01). UX: no “switch household” in v1; delivery “on behalf of” fields only if pack.

---

## 5. Customer web (APP-CUS-W)

**Same contracts and modules as mobile.** Differences:

| Topic | Web |
| --- | --- |
| Nav | Header: logo, location, search, cart, account, help. Footer: legal, country, language |
| SEO | Medicine, doctor, lab **public** pages; no indexed health records |
| Checkout | Same kernel CheckoutSession; PSP drop-in **inside adapter-controlled** frame ([12](12_PAYMENT_PLATFORM.md)) |
| Video | Waiting room in browser; permission prompts for camera/mic |
| Reports | Authenticated viewer; no public URLs |
| Density | Wider PLP grids; same empty/error/offline (offline weaker than RN cache) |

Country switch: warn cart/wallet isolation ([05](05_CUSTOMER_PLATFORM.md)).

---

## 6. Pharmacy (APP-PHARM RN + web)

**Roles:** `pharmacy_owner`, `pharmacy_manager`, `pharmacist`, `pharmacy_packer`, `pharmacy_buyer` ([03](03_USER_ROLES_AND_PERMISSIONS.md), [06](06_PHARMACY_PLATFORM.md)).

### 6.1 Navigation

| Surface | Primary nav |
| --- | --- |
| RN (store floor) | Queue · Rx desk (pharmacist) · Pack · Dispatch · More (returns, settings) |
| Web | Dashboard · Orders · Rx · Inventory · Purchasing · Transfers · Pricing · Invoices · Reports · Staff · Settings |

Packer **does not** see Rx image by default ([06](06_PHARMACY_PLATFORM.md)). Nav hides Rx desk.

### 6.2 Screen hierarchy

1. **Queue:** orders by SLA, filters (Rx, COD, OOS).
2. **Order detail:** lines, patient identity fields needed to dispense, actions Accept / Reject / Hold.
3. **Rx verification:** images + structured items; reject reasons; substitution propose (customer accept — OD-PHARM-09).
4. **Pick/pack:** scan, FEFO lot pick, photo of pack if pack requires.
5. **Dispatch:** create/confirm `MEDICINE_DELIVERY` job.
6. **Inventory (web-heavy):** lots, expiry, adjustments, GRN, transfers, PO.
7. **Exceptions:** OOS after pay, customer cancel, recall.

### 6.3 Journeys

J01/J03 fulfill, J02 Rx desk, J08 after digital Rx, J16 refund **request** (not card capture).

### 6.4 States

| Empty | New location: empty queue with SLA explanation |
| --- | --- |
| Loading | Queue poll + SSE ([04](04_APPLICATION_ARCHITECTURE.md)); stale badge |
| Error | Scan mismatch hard stop |
| Permission | Camera for scan; location not required |
| Offline | RN: show last queue; **block** verify/pack complete; retry queue with idempotency on Accept/Pack/Dispatch |

**RISK:** Packer counselling. UX copy: packer list is SKU/qty/form only.

---

## 7. Vendor (APP-VEND RN + web)

**Roles:** `vendor`, `vendor_staff`.

### 7.1 Navigation

| RN | Orders (SLA clock) · Inventory · More |
| --- | --- |
| Web | Onboarding/KYC · Catalog/listings · Inventory · Offers · Orders · Returns · Settlements · Support · Settings |

### 7.2 Hierarchy

Registration → KYC status → (blocked dashboard if not ACTIVE) → listing draft → publish requested → order accept/reject → pack → dispatch → settlements (read).

### 7.3 Journeys

J03, J18 (statement, not payout execution).

### 7.4 States

| Empty | No listings: CTA to create; KYC pending: **status screen**, not empty catalog |
| --- | --- |
| Error | Accept after OOS: reject/cancel path (F-OOS) |
| Permission | Org isolation: never other vendors’ cost/stock |
| Offline | Same as pharmacy: no accept offline |

Vendor timeout auto-cancel: prominent SLA countdown on order card (J03).

---

## 8. Doctor (APP-DOC RN + web)

**Roles:** `doctor`, `clinic_admin` (web-heavy).

### 8.1 Navigation

| RN | Today (queue/waiting room) · Calendar · Patients (consented) · Earnings · Inbox |
| --- | --- |
| Web | Calendar · Profile/KYC · Roster (clinic_admin) · Fees · Consult history · Earnings · Reviews |

**OPEN DECISION (OD-UX-08):** Clinic_admin vs doctor nav. Recommendation: web **roster + fees** for clinic_admin; RN remains doctor-personal queue.

### 8.2 Hierarchy

Onboarding/KYC → availability rules → appointment detail → waiting room → encounter (video/audio/chat) → notes → sign Rx → complete → earnings.

Patients list: **ConsentGrant required**; no national-ID search of all reports ([08](08_DOCTOR_PLATFORM.md)).

### 8.3 Journeys

J05 (doctor side), J06, J07, J19 (earnings view).

### 8.4 States

| Empty | No slots: CTA to set availability |
| --- | --- |
| Loading | Waiting room presence |
| Error | Media fail → audio / reschedule; recording denied → consult continues ([08](08_DOCTOR_PLATFORM.md)) |
| Permission | Camera/mic **in waiting room**; denied = audio-only or cannot start video SKU |
| Offline | Chat may queue; **do not** sign Rx offline if server cannot stamp |

Recording: **off by default**; consent UI is a blocking sheet only if pack allows recording.

**RISK:** Doctor using customer app with doctor token. UX: membership switcher explicit; `aud` separate.

---

## 9. Lab portal (APP-LAB-W)

**Roles:** `lab_owner`, `lab_manager`, `lab_staff` (web), `pathologist` may use portal **or** APP-PATH.

### 9.1 Navigation

Dashboard (TAT, accession volume) · Bookings · Accession / samples · Processing · QC · Reports (unsigned) · Catalog/offers · Capacity/slots · Staff · Settlements · Settings / KYC.

### 9.2 Hierarchy

KYC/accreditation → locations → catalog draft → capacity → case list → sample receive → processing → result entry → pathologist queue (if same portal) → release.

### 9.3 Journeys

J09 ops, J11 receive, J12 (if not separate path app), J14 print, J20.

### 9.4 States

| Empty | No bookings: capacity still configurable |
| --- | --- |
| Error | Barcode mismatch: **hard stop**, no skip |
| Permission | Result enter vs sign SoD — hide Sign for `lab_staff` |
| Offline | Web: mutations fail; do not fake accession |

Panic: worklist badge using **panic** semantic (26), not a toast-only.

---

## 10. Lab staff (APP-LAB-S RN)

**Role:** `lab_staff` floor work. Optional overlap with web ([04](04_APPLICATION_ARCHITECTURE.md)).

### 10.1 Navigation

Receive · Bench (processing) · Exceptions · More (profile, device).

### 10.2 Hierarchy

Scan receive → accession confirm → reject/accept → result entry (if pack allows on RN) → handover to pathologist queue.

### 10.3 Journeys

J11, parts of J12 (entry only, not sign).

### 10.4 States

Camera/scan permission in context. Offline: **do not** accession; queue scan ids if pack allows with `client_event_id` — **OPEN DECISION (OD-UX-10)** field write queue for lab staff vs phlebotomist-only. Recommendation: **phlebotomist/rider yes; lab staff on-prem no** (Wi-Fi assumed).

Empty: “No samples in receive queue.”

---

## 11. Pathologist (APP-PATH web)

**Role:** `pathologist`.

### 11.1 Navigation

Worklist (TAT, panic first) · Case review · Amendments · Audit (own actions).

### 11.2 Hierarchy

Filter location/TAT/panic → open results → send back / approve → digital sign (pack mechanism) → report generate confirmation.

### 11.3 Journeys

J12; panic workflow; amendment after release (new version, customer notify).

### 11.4 States

| Empty | Caught up: “No cases waiting” |
| --- | --- |
| Loading | Do not allow Sign until results+QC flags loaded |
| Error | Signature adapter fail: case stays APPROVED-pending-generate |
| Permission | No result enter if SoD |
| Offline | No sign |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** What constitutes a valid professional signature in the UI (OTP, cert, click-wrap) — pack, not a pretty button.

---

## 12. Phlebotomist (APP-PHE RN)

**Role:** `phlebotomist`. Auth: phone OTP + device bind + PIN/biometric.

### 12.1 Navigation

Today (offers + active job) · Navigate/job · History · Earnings · Availability (online/offline).

**No** global patient search. **No** EHR.

### 12.2 Hierarchy (job)

Offer → accept/reject → navigate → arriving → arrived → **identity verify (hard stop)** → kit/consent collect → collect → barcode → seal → photo if OD-PHE-07 → handover/transport.

### 12.3 Journeys

J10, J11 handover, J21 analog earnings.

### 12.4 States

| Empty | Online but no offers: “You’re available” + catchment hint |
| --- | --- |
| Loading | Offer TTL countdown |
| Error | Identity mismatch: **full stop**, collection screens disabled, reason `IDENTITY_MISMATCH` |
| Permission | Location **job-scoped**; camera for barcode; denied location → cannot accept new jobs |
| Offline | Queue status + custody events with `client_event_id`; show “pending sync” |

Customer phone: masked / proxy (**OD-PHE-12**). UX never reveals full number if pack forbids.

Going OFFLINE with active job: blocked ([11](11_LOGISTICS_PLATFORM.md)).

---

## 13. Delivery partner (APP-DEL RN)

**Role:** `delivery_partner`.

### 13.1 Navigation

Online toggle · Offers · Active job (map, OTP, COD, POD) · History · Earnings · KYC/payout profile.

### 13.2 Hierarchy

Offer (job type: medicine / sample transport / report) → accept → pickup scan → dropoff → OTP → POD photo/signature if pack → COD collect → complete.

**No specimen results** in any UI ([11](11_LOGISTICS_PLATFORM.md)).

### 13.3 Journeys

J04, J11 transport, J14–J15, J21.

### 13.4 States

| Empty | Offline: CTA go online; online no offers: wait |
| --- | --- |
| Error | OTP fail: retry + contactless path only if pack (OD-LOG-09) |
| Permission | Location for offers; camera for barcode/POD |
| Offline | Queue GPS pings + status; cannot invent OTP success |
| COD | Cash amount **semantic COD** pattern (26); shortage flow |

**RISK:** Fake POD. UX requires OTP/pack evidence; no “complete” without policy checks.

---

## 13b. Join us / Become a partner (APP-JOIN-W)

**Users:** anonymous → `partner_applicant`. After `ACTIVE`, type apps ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)).

**IA:** Landing → type picker (pack) → country/region → register/OTP → profile steps → documents → status tracker (`DRAFT`…`ACTIVE`) → empty: type disabled in country; permission: customer token cannot open reviewer tools.

**Admin:** Partner applications worklist in APP-ADM ([17](17_ADMIN_ERP.md) `M-ADM-PTR`).

**J22:** Landing → submit → additional info → resubmit → approved → first dashboard.

---

## 14. Admin shells (APP-ADM Next.js)

**One codebase**, permission-based shells ([04](04_APPLICATION_ARCHITECTURE.md), [03](03_USER_ROLES_AND_PERMISSIONS.md)). URLs and nav differ; modules hide, not 404-as-empty.

**OPEN DECISION (OD-UX-09):** Exact admin IA grouping. Recommendation below.

### 14.1 Shells

| Shell | Roles | Primary nav |
| --- | --- | --- |
| Super / global | `super_admin`, `global_admin` | Policy packs, countries, feature flags, break-glass, secrets **not** in UI, global catalog taxonomy |
| Country | `country_admin`, `compliance_officer` | KYC queues, catalog publish, incidents, CMS, compliance holds |
| Operations | `operations`, `fleet_dispatcher` | Orders, jobs, lab exceptions, capacity, reassign |
| Finance | `finance` | Ledger, settlements, refunds approval, recon breaks, payouts |
| CRM / support | `support`, future CRM role | Tickets, 360 (masked), campaigns (request notify) |

### 14.2 Shared admin patterns

- **Queue-first:** KYC, Rx exceptions, failed jobs, recon breaks.
- **Reason codes** + `X-Reason` on high-risk actions ([03](03_USER_ROLES_AND_PERMISSIONS.md)).
- **Reveal PII:** separate control, dual reason; default masked.
- **Clinical payload:** deny; support sees template names ([15](15_CRM_PLATFORM.md)).
- Empty: “Queue clear” vs “You lack permission.”
- Break-glass: time box, ticket id, post-review — not a hidden staff login.

### 14.3 Journeys

J16 ops/finance, J17–J21 finance, overlays on J01–J15 exceptions.

---

## 15. Journeys J01–J22 (UX level)

Happy path, failure UX, empty/loading/error/permission/offline. Detail screens live in domain books; this is the **cross-app choreography**.

### J01 — Customer buys medicine (OTC)

| Step | App / screen |
| --- | --- |
| Search → PDP → offer | Customer Home/Search/PDP |
| Cart → address → pay | Cart, Checkout, Payment |
| Confirm | Order detail |
| Pharmacy accept → pack → job | Pharmacy queue → pack → dispatch |
| Track → OTP | Customer tracking; rider job |
| Failures | Payment fail sheet; OOS after pay: refund/substitute (OD-CUS-14); address out of service; duplicate checkout disabled (idempotency) |
| Offline | Cannot pay |
| Empty | No offers in catchment: expand address / notify me (no fake stock) |

### J02 — Upload prescription

Upload (camera permission) → OCR assist banner **non-authoritative** → submitted → pharmacist Rx desk → customer confirm items → J01.  
Unreadable: reason + retry. Controlled drug: **LEGAL** block screen, not a generic reject. Identity mismatch: hard stop.

### J03 — Vendor order

Same as J01 with vendor seller banner. Vendor RN: SLA countdown. Timeout: customer copy “seller did not accept” + refund (J16). **No** multi-vendor split (A-BIZ-01).

### J04 — Track medicine delivery

Timeline + privacy-minimized map (OD-LOG-06). Reassignment notice. OTP screen. GPS stale: status still advances. Contactless: pack. Rider: POD.

### J05 — Book doctor

Discover (search doctors) → profile → slot (stolen = error + pick another) → pay/hold → confirmed. Teleconsult ineligible: pack explanation. Doctor: calendar fills.

### J06 — Video consultation

Appointment → waiting room (camera/mic permission) → join → timer → complete. Network: reconnect + chat. Recording denied: continue without recording. No-show: OD-DOC-02 copy, no invented penalty.

### J07 — Doctor creates Rx

Doctor encounter → structured Rx → sign. Customer: notification → artifact. Unsigned draft **not** in customer list.

### J08 — Order prescribed medicine

Digital Rx → Order medicines → mapped SKUs → J01/J02. Unmapped/strength mismatch: explain + pharmacist path. Partial fill: explicit.

### J09 — Book lab test

Test/package → prep (fasting conflict: OD-LAB-10 block vs warn) → home vs center → slot → address → pay → booking. Age/gender: OD-LAB-11. Geo: no silent book outside catchment.

### J10 — Phlebotomist collects

Customer: arriving status. Phlebotomist: verify → collect. Failures: unavailable, consent withdraw, insufficient, **identity mismatch full stop**, unsafe stop. Offline queue with pending sync.

### J11 — Sample reaches lab

Customer: “at lab / processing” (no barcode values). Lab staff: receive scan. Temperature/lost: delay copy + support. Mismatch: hard stop.

### J12 — Pathologist approves

Customer: wait + delay messaging; **no** action. Pathologist worklist; panic semantic. Amendment: versioned, notify (J13). Signer unavailable: SLA, not customer panic values.

### J13 — Digital report

Push/email/in-app → authenticated viewer → health timeline → share via **consent** UI (purpose, scope, expiry, revoke). Notify fail: report still in records. Unauthorized family: no household switch.

### J14 — Hard copy request

Pay print fee if any → lab print → pack → REPORT_DELIVERY track. Print fail: status + retry. Lost pack: OD-CUS-11 / OD-LAB-07.

### J15 — Hard copy delivered

OTP/POD complete. Same logistics failures as J04.

### J16 — Refund

Customer: request/status/destination. Finance: approve if dual control. Gateway fail: “processing” + wallet/payable. COD collected: reverse logistics + cash policy, not card refund. FX: show original currency.

### J17 — Affiliate commission

Affiliate app/web (not specified as separate APP in 04 — **ASSUMPTION (A-UX-01):** affiliate uses **web partner + customer referral** until a dedicated app). Pending → hold → approved → settlement. Self-referral: blocked copy. Clinical category off: cannot create link.

### J18 — Vendor settlement

Vendor settlements list → statement (gross, fees, net) → payout status. KYC fail: payout held, fulfillment may continue.

### J19 — Doctor settlement

Doctor earnings → statement. **LEGAL** fee-split. Refunded consult: line reversed.

### J20 — Lab settlement

Lab portal settlements. Bill-on-booking vs report: OD-LAB-02 shown as **policy label**, not a toggle for staff to invent.

### J21 — Delivery partner earnings

Rider earnings by job type, surge labels as **policy**, weekly payout. Dispute: ticket, not silent hide.

### J22 — Partner joins

APP-JOIN-W: type + country → OTP → profile → documents → status (`UNDER_REVIEW` / `ADDITIONAL_INFORMATION_REQUIRED`) → `ACTIVE` → type dashboard. Empty: type not in pack. Error: reject reasons, not generic fail. Permission: applicant cannot open admin queue.

---

## 16. Consent, Rx, panic, COD (UX rules)

| Pattern | UX rule |
| --- | --- |
| Consent | Purpose, artifact list, duration, who, revoke path. No pre-ticked marketing inside clinical consent |
| Rx warning | Distinct from error; cannot look like a promo chip ([26](26_DESIGN_SYSTEM_SPEC.md)) |
| Panic | Persistent banner + worklist; not toast-only; customer sees **generic** attention copy unless pack says otherwise |
| COD | Amount prominence at checkout **and** rider collect; receipt |
| OTP | Accessible input; resend cooldown; no OTP in logs |

---

## 17. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| **OD-UX-01** | Mixed basket UI | Kernel yes; v1 UI separate entry points + pack flag |
| **OD-UX-02** | RN flavors vs many apps | Flavors + separate store listings (04) |
| **OD-UX-03** | Customer bottom nav | Home / Orders / Health / Account (Care inside Health) |
| **OD-UX-04** | Caregiver UX | Not v1; legal model OD-RBAC-03 |
| **OD-UX-05** | Maps in-app vs deep link | Adapter; status without map |
| **OD-UX-06** | Dark mode | Later; AA contrast first |
| **OD-UX-07** | Web vs mobile parity | Same journeys; native extras optional |
| **OD-UX-08** | Clinic_admin nav | Web roster/fees; RN doctor queue |
| **OD-UX-09** | Admin IA grouping | Five shells in one Next app |
| **OD-UX-10** | Offline write queue | Field apps yes; lab staff on-prem no |

---

## 18. Assumptions, risks, legal (index)

| ID | Type | Statement |
| --- | --- | --- |
| A-UX-01 | ASSUMPTION | Affiliate v1 is partner web + customer referral, not a sixth store listing |
| A-CUS-01 | ASSUMPTION | Mobile and web share contracts |
| | RISK | Privilege confusion via deep links |
| | RISK | Dark patterns on consent/COD/Rx |
| | RISK | Toast-only panic |
| | RISK | Offline pay |
| | LEGAL | Recording, e-sign UI, contactless POD, caregiver, ads on home rails |

Visual language: [26](26_DESIGN_SYSTEM_SPEC.md). Do not implement screens until that spec and country pack flags exist.

---

## 19. Completeness screen addendum (CR-ECO-92)

**None of these screens are IMPLEMENTED.** Full table: [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) §17.

| Family | Screens | Status |
| --- | --- | --- |
| Care navigation | Symptom text, voice slot, follow-ups, red-flag, specialty explanation, match + book/tele handoff | **PLANNED** |
| Care ops | Clinician override, recommendation audit | **PLANNED** |
| Radiology | Catalog/book, worklist, imaging report (not pathology case UI) | **PLANNED** |
| CMS | Authoring, schedule, localization, SEO, media, versioning | **PLANNED** |
| Support | Help Center, tickets, queues (customer/partner/store/doctor/lab/delivery/affiliate) | **PLANNED** |
| Commerce extras | Wishlist, reviews/Q&A, subscription/refill | **PLANNED** — clinical refill plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**R5_E_PLAN_READY**; coding not authorized) |
| Marketing / analytics | Campaign builder, exec dashboards | **PLANNED** |
| Affiliate mobile | — | **DEFERRED** |
| Diagnosis-as-product UI | — | **DEFERRED** (forbidden) |

Customer nav may later add **Care** / “Check symptoms” **behind pack**, never as a diagnosis tile. Same design system ([26](26_DESIGN_SYSTEM_SPEC.md)).
