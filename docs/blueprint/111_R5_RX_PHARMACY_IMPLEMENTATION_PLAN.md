# 111 — R5 prescription + pharmacy dispensing implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R5-AUTH-111**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_PLAN_READY**

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [110](110_PRE_R5_READINESS_AUDIT.md) · [109](109_POST_R4_ECOSYSTEM_HARDENING.md) · [108](108_POST_R4_ECOSYSTEM_AUDIT.md) · [06](06_PHARMACY_PLATFORM.md) · [08](08_DOCTOR_PLATFORM.md) · [16](16_HEALTH_RECORD.md) · [35](35_OPEN_DECISIONS.md) (**OD-RX-REFILL**, **OD-PHARM-04**, **OD-DOC-10**) · [43](43_ECOSYSTEM_BASELINE_LOCK.md) · [80](80_PHASE_2_ROADMAP.md) (P2-HC-4)

**Prerequisite:** [110](110_PRE_R5_READINESS_AUDIT.md) = **PRE_R5_GREEN** (engineering attach points exist).

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, or Rx tables under this CR. **Do not** enable e-Rx in any country. **Do not** connect live PSP/DHL/carriers or real-money / real-dispensing rails. **Do not** invent medical, pharmacy, prescription, licensing, tax, or telemedicine law. **Do not** create a second identity, order, payment, logistics, or finance kernel.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical R5 architecture so digital prescription artifacts and pharmacy dispensing can be implemented later **without restructuring** the global ecosystem.

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / Rx tables | Plan only |
| Country e-Rx enablement | Empty pack = fail closed |
| Live money / carriers / payouts | Separate production CRs |
| Invented classifications / retention clocks / license schemes | Legal/country packs |
| Dedicated generic Partner App or new pharmacy identity | Topology lock |
| Duplicate catalog / checkout / payment / order | Kernel lock |
| Autocomplete R5 coding authorization | Requires future **CR-R5-IMPL-*** |

### Acceptance of this plan

Humans can authorize a coding CR that implements sub-phases in §25 without redesigning identity, tenancy, commerce, or clinical access kernels.

---

## 1. Prescription domain

### 1.1 Bounded context

`prescription` owns structured clinical prescription artifacts and dispensing **authorization** state. It does **not** own commercial Order, Payment, Inventory truth, or LogisticsJob.

### 1.2 Core objects (logical — not migrated here)

| Object | Meaning |
|--------|---------|
| **Prescription** | Stable clinical identity for one prescribe episode (logical Rx header). Holds patient, prescriber, country, optional encounter link, current version pointer. |
| **PrescriptionVersion** | **Immutable** snapshot of clinical content. Amendments create a **new** version; never overwrite prior versions. |
| **PrescriptionLine** | Medication line on a version: clinical medication concept ref, dose/instructions, quantity authorized, duration hints, controlled/restricted **flags as pack-opaque codes** (no invented schedules). |
| **Prescriber** | Binding to existing `DoctorProfile` (+ `Person`) at version time; credentials referenced, not copied as legal proof. |
| **Patient** | Binding to existing `Person` (customer). Relationship to prescriber via existing `ClinicalRelationship` / consent purposes — not a parallel patient table. |
| **EncounterLink** | Optional FK to existing `Encounter` (and thus appointment). Consult-origin Rx preferred when R4 appointment exists; upload/OCR paths remain separate cases (see §1.7). |
| **PrescriptionAudit** | Append-only clinical access / mutation audit (or reuse `ClinicalAccessAudit` + security events) — **no clinical body in payloads**. |
| **DispensingCase** | Pharmacy-side workflow instance for a PrescriptionVersion at a fulfilling Location (validation → dispense authorization). Not an Order. |
| **DispenseEvent** | Immutable record of dispense / partial / reject / override decision by pharmacist Person. |
| **RepeatAuthorization** | Optional structure for repeats — **gated by OD-RX-REFILL + country pack**; default fail-closed (no auto-refill). |

### 1.3 Prescription status lifecycle (header)

Statuses are **server-owned**. Clients display projections only.

```
DRAFT
  → ISSUED                 [prescriber commits version 1]
  → SUPERSEDED             [new version issued; prior remains ISSUED historically via versions]
  → CANCELLED              [terminal for further dispense auth]
  → EXPIRED                [validity window ended per pack fields — do not invent durations]
  → FULLY_DISPENSED        [all authorized qty accounted by DispenseEvents — commercial order may still be open/closed separately]
```

Notes:

- **Amendment** = new `PrescriptionVersion` + header may stay `ISSUED` with `current_version_id` advanced; prior versions remain readable for audit.
- **Cancellation** does not delete versions; blocks new dispensing authorization.
- Header status is derived where possible from versions + dispense events to avoid silent overwrite of clinical facts.

### 1.4 Version immutability

| Rule | Detail |
|------|--------|
| Write once | After `ISSUED`, a `PrescriptionVersion` row is immutable |
| Amend | Create version N+1; link `supersedes_version_id` |
| Cancel | Status transition + audit; versions untouched |
| Draft | Mutable only while `DRAFT`; publishing creates version 1 |

### 1.5 Medication lines & instructions

Store as structured fields on the version (opaque to commerce):

- Clinical medication concept id (see §4)
- Strength / form / route as **clinical text/codes** (pack schema — not invented)
- Dosage instructions (structured + free-text counselling notes)
- Quantity authorized / unit
- Days supply / duration (optional; pack-defined)
- Substitution allowed flag (**default false** until pharmacist workflow + OD-PHARM-09)
- Line-level restriction/controlled **opaque category code** (pack)

Customer **cannot** edit instructions after issue.

### 1.6 Validity / expiry

- Represent as explicit fields on version (`valid_from`, `valid_until` or equivalent) **populated only when pack/policy supplies rules**.
- Empty / unknown pack rule → **fail closed** for dispense authorization (cannot authorize dispense without validity resolution).
- Do **not** hardcode country retention or Rx act periods in application code.

### 1.7 Origins

| Origin | Path |
|--------|------|
| Encounter-origin | Doctor issues from active encounter / appointment context |
| Upload / image | Existing pharmacy **PrescriptionCase** / health artifact path ([06](06_PHARMACY_PLATFORM.md), [16](16_HEALTH_RECORD.md)) — OCR non-authoritative |
| External e-Rx | Via e-Rx port (§3) when pack enables |

All origins converge to structured `Prescription` + versions before digital dispense auth. Unsigned drafts are **not** dispensable ([08](08_DOCTOR_PLATFORM.md)).

### 1.8 Audit trail

Every create / view / amend / cancel / dispense / reject / partial / override / break-glass emits:

- Security event and/or clinical access audit
- Actor person id, purpose, resource ids
- **No** dosage text, medication names, or Rx body in event payloads

---

## 2. Prescription access (server-only)

Reuse: `Person`, `DoctorProfile`, `Encounter`, `ConsentGrant`, `ClinicalRelationship`, Country Policy Pack, RLS / tenant GUCs ([97](97_MULTI_TENANT_RLS_RETROFIT_IMPLEMENTATION.md), [110](110_PRE_R5_READINESS_AUDIT.md)).

**Clients never decide authorization.** UI may hide controls; API enforces.

| Action | Who (conceptual RBAC) | Required gates |
|--------|----------------------|----------------|
| **Create (draft/issue)** | Prescribing doctor (`DoctorProfile` membership) | Country pack `rx.prescribe.enabled`; active clinical relationship + consent purpose for treatment; encounter link when pack requires; credentials status per pack (not invented here) |
| **View** | Patient (self); prescribing doctor; dispensing pharmacist at assigned location case; company clinical auditor (read-only, audited) | Consent / relationship / dispense-purpose grant / company clinical read privilege; RLS person/org/location |
| **Amend** | Same doctor (or pack-defined covering clinician — **product/legal OD**) | Pack allows amend; not cancelled/expired; new version |
| **Cancel** | Prescribing doctor; limited company clinical ops if pack allows | Audit; blocks new dispense auth |
| **Dispense authorize** | `pharmacist` at fulfilling **Location** (owned pharmacy org) | Pack `rx.dispense.enabled`; OD-PHARM-04 still-verify default; DispensingCase assigned; inventory feasible |
| **Audit / oversight** | Company admin clinical read roles | Read-only; break-glass separate purpose + audit |

Partner vendor sellers **do not** receive company clinical authority. Marketplace vendor may fulfill commercial OTC/Rx-gated **orders** only under separate pack rules — R5 v1 focus is **owned pharmacy** queue (roadmap R5).

---

## 3. E-Rx boundary

### 3.1 Port

```
ERxPort {
  submit(prescriptionVersionId) → providerRef | unsupported
  fetchStatus(providerRef) → opaque status
  cancel(providerRef) → result
}
```

- Default adapter: **`NullERxAdapter`** / disabled — always fail closed when pack/runtime provider is absent or mismatched.
- Country pack keys: `rx_erx_enabled` (default **false**) and optional `rx_erx_provider_code` — both required (with runtime `ERX_PROVIDER`) for sandbox submission.
- **Reconciliation (Aug 2026):** R5-F **engineering kernel COMPLETE** in source — `ErxRouter`, `ErxSubmissionService`, `SandboxERxAdapter`, `prescription_erx_submissions`, issue/amend/cancel wiring. **Live named provider adapter NOT present** — **HUMAN_BLOCKED** (L-RX-01). Do not re-implement the kernel.
- No invented government APIs, license numbers, signature crypto, or retention.

### 3.2 Platform signature vs legal e-Rx

- Platform may store an **internal integrity seal** for sandbox (“signed Rx non-legal until pack”) per [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md).
- Legal e-Rx validity is a **LEGAL/COMPLIANCE** gate per country — not resolved here.
- **OD-PHARM-04:** default **still verify** at pharmacy even if platform-signed.

---

## 4. Medicine / catalog model

**Do not duplicate catalog.** Separate clinical vs commercial truth:

| Layer | Owner | Role |
|-------|-------|------|
| **Clinical medication concept** | `prescription` (or shared clinical terminology table later) | What was prescribed clinically |
| **CatalogItem / Offer** | existing `catalog` | Commercial sellable product/variant |
| **Prescription instruction** | `PrescriptionLine` on immutable version | Dose / qty authorized |
| **Dispensed product** | DispenseEvent → CatalogItem + InventoryLot | What pharmacist actually released |

Rules:

- Mapping clinical concept → CatalogItem is a **dispensing decision**, not automatic SKU injection into cart without pharmacist/customer commercial step ([OD-DOC-10](35_OPEN_DECISIONS.md)).
- Catalog attributes (Rx-required flags, controlled opaque codes) are **hints for commerce gating**, not clinical authority.
- Expired/quarantined lots never become dispensed product.

---

## 5. Pharmacy dispensing workflow

```
PrescriptionVersion (ISSUED)
  → DispensingCase (QUEUED)
      → VALIDATING (pharmacist)
          → REJECTED (terminal for this case; reason codes pack-opaque)
          → AUTHORIZED_TO_DISPENSE (clinical auth)
              → inventory soft/hard allocation (existing inventory kernel)
                  → PARTIAL_DISPENSED | DISPENSED
                      → commercial handoff (§8) optional / customer-driven
```

| Principle | Detail |
|-----------|--------|
| Clinical ≠ commercial | Authorization does not create Order or Payment |
| No auto-dispense | Customer input / OCR / AI never alone completes dispense |
| Pharmacist action | Explicit accept / reject / partial |
| SoD | Packer cannot verify ([06](06_PHARMACY_PLATFORM.md)); pharmacist verifies |
| Duplicate dispense | Idempotent keys on DispenseEvent; reject double-full dispense of same version qty |

Partial dispense: remaining authorized qty stays on clinical side; new commercial lines only for dispensed qty.

---

## 6. Controlled / restricted medicines

| Rule | Detail |
|------|--------|
| Default | **Fail closed** |
| Capability | Country / category **opaque codes** in policy pack |
| Global schedules | **Forbidden** in code |
| Hooks | Escalation queue, dual-control hook (reuse `assertMakerChecker` **when product matrix requires** — do not invent statutory SoD) |
| Missing pack fields | Deny prescribe and deny dispense for flagged lines |

---

## 7. Refill / repeat — **OD-RX-REFILL**

| Topic | Plan position |
|-------|----------------|
| Are repeats allowed? | **Unknown until OD-RX-REFILL + country pack.** Default engineering: **no auto-refill**; no silent remaining-qty loop |
| Who authorizes repeat? | Recommendation until decided: **pharmacist and/or doctor re-authorize** (per OD-RX-REFILL row) — not customer self-approve |
| Remaining repeats | Represent only if pack enables; otherwise omit feature |
| Expiry | Reuse validity fields; expired Rx cannot refill |
| Customer request | Allowed as **request ticket** → notification → doctor/pharmacist review |
| Cancellation | Cancels open repeat authorizations; does not rewrite history |

**This plan does not resolve OD-RX-REFILL.** Sub-phase R5-E implementation is blocked on that decision + pack. Execution plan for R5-E (still plan-only): [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) (**CR-R5-E-AUTH-119**, **R5_E_PLAN_READY**).

---

## 8. Pharmacy order boundary (1C–1G reuse)

A prescription **never** automatically becomes an `Order`.

```
Clinical PrescriptionVersion
  → Dispensing authorization (DispenseEvent)
      → Customer (or pack-allowed pharmacy-assisted) commercial intent
          → Cart / CheckoutSession (1C)
              → PaymentIntent (1D sandbox)
                  → Order + fulfillment (1E)
                      → Shipment / logistics job (1F) if delivery
                          → Finance facts (1G) on commercial events only
```

| Rule | Detail |
|------|--------|
| Kernels | Reuse cart, payment, order, logistics, finance — **no second checkout** |
| OD-DOC-10 | Auto-add Rx to cart vs patient-driven “Order medicines” remains **OPEN** — plan default for R5-D: **patient-driven** handoff until decided |
| Revenue | **No** financial fact from prescription create/issue alone |
| Pickup | Order fulfillment at location without shipment still requires Order boundary |

Existing owned-pharmacy order states that include `RX_REVIEW` ([06](06_PHARMACY_PLATFORM.md)) apply to **order-attached** verification (uploads / cart Rx flags). Digital encounter-origin Rx uses DispensingCase first, then optional order.

---

## 9. Inventory

Reuse: lots, expiry, reservation, FEFO hint, location, seller organization, ownership ([06](06_PHARMACY_PLATFORM.md) §8, inventory kernel).

| Rule | Detail |
|------|--------|
| Validation | Dispense auth **checks** sellable qty; does not bypass holds |
| Negative stock | Forbidden |
| Expired / quarantine / damaged / recalled | Not allocatable |
| FEFO | Prefer earliest expiry; manager override audited |
| Allocation timing | Soft hold during checkout; hard allocate on existing ACCEPTED/paid rules — Rx reject must not leave stranded picks (align A-PHARM-06) |

---

## 10. Pharmacy roles / applications

### 10.1 Surfaces (no new apps)

| App | R5 responsibility |
|-----|-------------------|
| **web-store / mobile-store** | Rx queue, validation, pharmacist review, inventory availability, dispense/partial/reject, exception queue |
| **web-customer / mobile** | Rx list/detail, instructions, status, refill **request** (if enabled), privacy/consent states |
| **web-doctor / mobile-doctor** | Prescribe, draft/review, history, amend/cancel, encounter linkage |
| **web-vendor** | **No** clinical Rx desk in R5 v1; commercial seller only |
| **web-admin** | Read-only clinical oversight, pack enablement status, exceptions, audit |
| **web-join** | Unchanged partner onboarding |

### 10.2 Dedicated pharmacist app?

**Not necessary for R5.** Use existing **Store web + Store mobile** with `pharmacist` / `pharmacy_packer` / manager roles ([06](06_PHARMACY_PLATFORM.md), current topology). Logical APP-PHARM IDs map to these codebases — **do not** create a new Expo app or identity audience solely for pharmacists.

### 10.3 Forbidden

- Generic Partner App  
- Second pharmacy identity / JWT audience family without CR  
- Partners as company admin  

---

## 11. UI/UX plan (screens)

PHI: show minimum necessary; no Rx body in URLs; no clinical dumps in support chat.

### Customer (web + mobile parity)

| Screen | Purpose |
|--------|---------|
| Prescription list | Own Rx headers; status chips; empty/loading/error/403 |
| Prescription detail | Current version summary; versions history (read) |
| Medication instructions | Line instructions; counselling flags |
| Refill / reorder entry | **Request** only if pack + OD-RX-REFILL allow; else hidden |
| Dispensing / pharmacy status | Queue / authorized / dispensed / rejected (non-clinical reason labels) |
| Privacy / consent | Links to consent manage; expire messaging |

### Doctor (web + mobile parity)

| Screen | Purpose |
|--------|---------|
| Prescribe | From encounter context; pack-gated |
| Draft / review | Editable draft; issue confirms immutable version |
| Prescription history | Patient-scoped via clinical ACL |
| Amend / cancel | Explicit flows + confirmations |
| Encounter linkage | Show appointment/encounter refs |

### Store / pharmacy (web + mobile)

| Screen | Purpose |
|--------|---------|
| Prescription queue | Location-scoped DispensingCases |
| Validation | Identity/Rx checks; still-verify checklist |
| Pharmacist review | Clinical vs catalog mapping |
| Inventory availability | Lot/FEFO hints |
| Substitution boundary | Propose only; customer accept per OD-PHARM-09 |
| Dispense / partial / reject | Explicit actions + reasons |
| Exception queue | Controlled fail-closed escalations |

### Admin

| Screen | Purpose |
|--------|---------|
| Clinical oversight | Read-only Rx metadata; audited views |
| Policy / config status | Pack flags on/off (not inventing content) |
| Exceptions | Escalation list |
| Audit | Security / clinical access timelines |

---

## 12. Mobile requirement

- Existing mobiles remain **React Native + Expo**, **Android + iOS**.
- No iOS-only / Android-only duplicate products.
- Shared abstractions in `shell-core` / `shell-native` / ui-kit; native-only bits behind capability flags (same pattern as video media).
- Store + doctor + customer mobile parity for R5 screens in §11.

---

## 13. Notifications

Reuse outbox → `NotificationDispatchService` → inbox ([109](109_POST_R4_ECOSYSTEM_HARDENING.md)). **No second engine.**

| Future event (illustrative names) | Recipients (server-resolved) |
|-----------------------------------|------------------------------|
| `PRESCRIPTION_CREATED` / `ISSUED` | Patient; optional doctor confirm |
| `PRESCRIPTION_ACTION_REQUIRED` | Pharmacist location staff / doctor |
| `DISPENSING_STATUS_CHANGED` | Patient |
| `REFILL_STATUS_CHANGED` | Patient; doctor/pharmacist if review |
| `PRESCRIPTION_EXCEPTION` | Pharmacist; company ops if pack |

Bodies: generic; **no PHI / drug names** in push or inbox body.

Idempotency: outbox `occurrenceKey` per aggregate + status.

---

## 14. Support

Reuse `SupportService` kernel.

| Allowed reference | Content in ticket |
|-------------------|-------------------|
| `prescription_id` | Id only |
| `dispensing_case_id` | Id only |
| `order_id` | Id only |
| `appointment_id` | Id only |

**Never** copy dosage, medication lists, or Rx images into ordinary support tickets. Deep links open authorized clinical UI after ACL.

---

## 15. Search

| Index | Content |
|-------|---------|
| Public / commerce search | Catalog offers only — **no** patient Rx |
| Clinical search | Isolated, ACL’d, never shared with commerce Elasticsearch/typesense indexes |

PHI must not appear in product search documents or CDN.

---

## 16. Finance (1G)

| Event | Creates commercial facts? |
|-------|---------------------------|
| Prescription draft/issue | **No** |
| Dispense authorization alone | **No** (unless pack invents a fee — **not assumed**) |
| Order paid / captured / refund | **Yes** — existing payment → ledger path |
| Payout | **Out of scope** (mock only until production CR) |

Prescription is not a revenue object.

---

## 17. Logistics (1F)

- Dispense authorization **does not** create `Shipment` / logistics job.
- Shipment only after valid Order fulfillment path requiring delivery.
- Pickup orders: logistics optional; inventory still decremented via order/fulfillment.

---

## 18. Audit / security

| Action | Mechanism |
|--------|-----------|
| create / amend / cancel | Security event + prescription audit |
| view | Clinical access audit (purpose-scoped) |
| dispense / reject / partial | DispenseEvent + security event |
| override / break-glass | Explicit purpose; dual-control hook if pack requires |
| Payload rule | Resource ids + actor + action — **no clinical content** |

Reuse existing `security_events` and `clinical_access_audits` patterns.

---

## 19. MNC / country

Scope chain (server GUCs + RLS):

**Company → Region → Country → Legal Entity → Business Unit → Organization → Location → Person**

| Rule | Detail |
|------|--------|
| Enablement | Country policy pack flags only |
| Empty pack | Fail closed (`rx.prescribe` / `rx.dispense` / `rx.erx` off) |
| Hardcoded country branches | **Forbidden** |
| Cross-country Rx | Fail closed unless future pack + legal CR |
| Partner ≠ company | Held |

---

## 20. Data retention / export (hooks only)

Architecture hooks (no periods invented):

| Hook | Use |
|------|-----|
| Retention class on Prescription / versions | Pack/legal later |
| Patient access / export job | Health record export port ([16](16_HEALTH_RECORD.md)) |
| Correction | New version only (immutability) |
| Legal hold | Flag preventing purge jobs |

Do not invent statutory rights or clocks in code.

---

## 21. Pharmacy / vendor boundary

| Actor | Authority |
|-------|-----------|
| Company-owned pharmacy org / store Location | Dispense queue for owned fulfillment |
| Marketplace vendor org | Commercial seller; **no** company clinical admin; R5 v1 clinical desk = owned store |
| Seller organization on Order | Exactly one seller per Order (A-PHARM-02) |
| Fulfilling location | Inventory + pharmacist membership |
| Prescriber | Doctor partner / DoctorProfile |
| Dispensing pharmacist | Store location membership + pharmacist role |

No partner receives company-level privilege grants.

---

## 22. Safety boundary (explicit prohibitions)

1. Autonomous diagnosis  
2. AI-generated prescription as final authority  
3. Automatic Rx from symptoms / care-nav  
4. Automatic medication substitution without authorized workflow (+ customer accept when OD-PHARM-09)  
5. Customer editing prescription instructions  
6. Bypassing country policy packs  
7. Bypassing consent / clinical relationship / RLS  
8. OCR / upload treated as signed dispensable Rx without pharmacist verification  
9. Auto-refill without OD-RX-REFILL + pack  
10. Client-side authorization decisions  

---

## 23. Test plan matrix

| ID | Case |
|----|------|
| T-RX-ISO | Patient A cannot read patient B Rx |
| T-RX-DOC | Non-prescriber doctor cannot amend others’ Rx without pack grant |
| T-RX-CON | Missing consent / relationship → 403 create/view |
| T-RX-ENC | Encounter-required pack blocks issue without encounter |
| T-RX-IMM | Issued version bytes immutable (DB update denied / API reject) |
| T-RX-AMD | Amend creates version N+1; N readable |
| T-RX-CAN | Cancel blocks new dispense auth |
| T-RX-CTL | Controlled/restricted without pack → deny |
| T-RX-INV | Cannot authorize dispense without sellable non-expired lot |
| T-RX-EXP | Expired lot / expired Rx → reject |
| T-RX-PAR | Partial dispense qty accounting |
| T-RX-DUP | Duplicate full dispense rejected / idempotent |
| T-RX-ORD | Issue Rx does not create Order/Payment |
| T-RX-RLS | Cross-org / cross-location pharmacist denied |
| T-RX-MNC | Country A pack off → deny; country B isolated |
| T-RX-NOT | Notification idempotent occurrence keys; no PHI body |
| T-RX-SUP | Support ticket stores ids only |
| T-RX-AUD | View/dispense emit audits without clinical payload |
| T-RX-UI | Web/mobile parity smoke for list/detail/queue |

---

## 24. Open decisions (do not silently resolve)

### ENGINEERING

| ID | Topic |
|----|--------|
| E-RX-01 | Clinical medication concept table vs pack terminology port |
| E-RX-02 | DispensingCase id strategy vs reuse PrescriptionCase naming from [06](06_PHARMACY_PLATFORM.md) |
| E-RX-03 | Whether upload-Rx and digital-Rx share one header type with origin enum |

### PRODUCT

| ID | Topic |
|----|--------|
| **OD-DOC-10** | Auto-route digital Rx to pharmacy cart vs patient-driven order |
| **OD-PHARM-05** | Central country Rx desk vs location pharmacist (default: location) |
| **OD-PHARM-09** | Substitution needs customer accept |
| P-RX-01 | Pharmacy-assisted checkout vs customer-only handoff |
| P-RX-02 | Vendor marketplace Rx desk in later wave (not R5 v1) |

### LEGAL / COMPLIANCE

| ID | Topic |
|----|--------|
| L-RX-01 | e-Rx legal validity per country |
| L-RX-02 | Required Rx fields / controlled substance handling |
| L-RX-03 | Cross-border prescribe/dispense |
| **OD-PHARM-04** | Still verify default (held) |
| Retention / patient rights | Hooks only — periods not invented |

### OPERATIONS

| ID | Topic |
|----|--------|
| **OD-PHARM-08** | Explicit Accept vs auto after allocate |
| O-RX-01 | Exception SLA / escalation routing |
| Maker/checker matrix for dispense override | Product + ops; use framework when required |

### COUNTRY / MNC

| ID | Topic |
|----|--------|
| Pack keys for prescribe/dispense/erx/refill | Enablement only; empty = off |
| First pilot country | Human decision |

### PRODUCTION INFRA

| ID | Topic |
|----|--------|
| Live PSP / DHL / payout | Not R5; R14 / money CRs |
| E-Rx provider credentials | After L-RX-01 |
| Object store ACL for Rx images | Production hardening CR |

### CLINICAL / LEGAL (explicit)

| ID | Topic |
|----|--------|
| **OD-RX-REFILL** | Auto-refill vs re-authorization — **UNRESOLVED**; R5-E blocked |

---

## 25. Implementation order (recommended sub-phases)

Dependency-adjusted sequence:

| Phase | Name | Delivers | Depends |
|-------|------|----------|---------|
| **R5-A** | Prescription foundation | Schema + domain services + RLS + audit + pack fail-closed gates (sandbox) | 110 green; coding CR |
| **R5-B** | Prescribing UX | Doctor web/mobile draft/issue/history/amend/cancel; encounter link | R5-A | Plan: [113](113_R5_B_PRESCRIBING_UX_PLAN.md) |
| **R5-C** | Pharmacy validation / dispensing | Store web/mobile queue; validate; dispense/partial/reject; inventory checks | R5-A/B; owned pharmacy store apps | Plan: [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) |
| **R5-D** | Commercial handoff | Cart/order/payment/fulfillment from authorized dispense (1C–1G); no auto Order on issue | R5-C; OD-DOC-10 guidance | Plan: [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) |
| **R5-E** | Refill / repeat | Request + re-auth flows | R5-C/D; **OD-RX-REFILL** + pack; plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md) |
| **R5-F** | Country / e-Rx adapters | `ERxPort` adapter behind pack + submission audit | R5-A; **KERNEL COMPLETE** (Aug 2026); live provider **HUMAN_BLOCKED** (L-RX-01) |

Upload/OCR verification enhancements may parallel R5-C using existing PrescriptionCase paths without blocking digital prescribe.

**Coding authorization:** each phase (or R5-A alone) requires an explicit **CR-R5-IMPL-*** — **not** this document.

> **Update:** R5-A implemented under [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) (**CR-R5-IMPL-112**). R5-B implemented under [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) (**CR-R5-B-IMPL-114**). R5-C implemented under [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) (**CR-R5-C-IMPL-116**). R5-D implemented under [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) (**CR-R5-D-IMPL-118**, **R5_D_IMPLEMENTED**; plan [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md)). R5-E implemented under [120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md) (**CR-R5-E-IMPL-120**, **R5_E_IMPLEMENTED**; plan [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md)). **R5-F engineering kernel COMPLETE** (Aug 2026 charter) — `ERxPort` + `ErxRouter` + `ErxSubmissionService` + `prescription_erx_submissions` + `SandboxERxAdapter` only; **live named provider adapter NOT authorized** until L-RX-01 + explicit provider CR. See [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §R5.

---

## 26. Traceability

| Blueprint / CR | Role |
|----------------|------|
| [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) R5 | Wave objective |
| [110](110_PRE_R5_READINESS_AUDIT.md) | Engineering readiness |
| [06](06_PHARMACY_PLATFORM.md) | Owned pharmacy / Rx desk / inventory |
| [08](08_DOCTOR_PLATFORM.md) | Digital Rx / OD-DOC-10 |
| [16](16_HEALTH_RECORD.md) | Artifacts / consent purposes |
| P2-HC-4 ([80](80_PHASE_2_ROADMAP.md)) | Prescription → pharmacy queue |
| J07 / J08 ([00](00_MASTER_INDEX.md)) | Doctor creates Rx; customer orders from Rx |

---

## 27. Authorization statement

**CR-R5-AUTH-111 does not authorize R5 coding, migrations, country enablement, e-Rx go-live, or live money.**

**Reconciliation (Aug 2026):** R5-A…F **engineering** is implemented in source. R5-F **live provider activation** remains **HUMAN_BLOCKED** (L-RX-01) — no named provider, credentials, or production pack enablement in repo. Sandbox support (`SandboxERxAdapter`, `ERX_PROVIDER=sandbox`) must not be read as production e-Rx authorization.

Next human step: approve this architecture → issue **CR-R5-IMPL-*** for **R5-A** (or a scoped subset) when ready.

---

**FINAL STATUS: R5_PLAN_READY**
