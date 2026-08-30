# 113 — R5-B prescribing UX plan

**Status:** Plan complete; **implemented under [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md)**  
**Change ID:** **CR-R5-B-AUTH-113** (plan) → **CR-R5-B-IMPL-114** (implementation)  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_B_PLAN_READY** (historical) → see **R5_B_IMPLEMENTED** in Book 114

**Sources of truth:**  
[111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) (**R5_A_IMPLEMENTED**) · [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) (**R5_B_IMPLEMENTED**) · [08](08_DOCTOR_PLATFORM.md) · [16](16_HEALTH_RECORD.md) · [25](25_UI_UX_ARCHITECTURE.md) · [26](26_DESIGN_SYSTEM_SPEC.md) · [35](35_OPEN_DECISIONS.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Prerequisite:** R5-A foundation (immutable versions, RLS, pack fail-closed, doctor/customer/admin APIs) is live under [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md).

**Authority boundary (historical for this book):** PLAN ONLY at CR-R5-B-AUTH-113. Implementation authorized separately as **CR-R5-B-IMPL-114**. **Do not** start R5-C dispensing, refill, live e-Rx, or country enablement from this plan alone. **Do not** invent medical, pharmacy, dosage, contraindication, or prescribing law.

---

## 0. Purpose and non-goals

### Purpose

Define the complete **R5-B prescribing UX** and its engineering contract on top of the immutable Prescription Foundation so a future **CR-R5-B-IMPL-*** can ship doctor prescribing UX and customer read UX **without restructuring** kernels or inventing clinical rules.

### R5-A vs R5-B

| Layer | R5-A (done) | R5-B (this plan) |
|-------|-------------|------------------|
| Domain / API core | Create / issue / amend / cancel / list / get | UX polish + optional draft-line update contract; encounter-entry flows; review confirmation |
| Doctor UI | Foundation screens | Full prescribing workflow UX (compose → review → issue) |
| Customer UI | List / detail read-only | Refined read UX (versions, privacy states, instructions) |
| Store | Noop dispensing boundary | Preview contract for R5-C only (no UI) |
| Dispense / Order / pay | Forbidden | Still forbidden |

### Non-goals

| Forbidden | Reason |
|-----------|--------|
| R5-B implementation in this CR | Plan only |
| R5-C pharmacy dispensing UI/API | Separate phase |
| Refill / OD-RX-REFILL product | R5-E + legal |
| Live e-Rx / NullERx override | R5-F + legal |
| Country-specific prescribing enablement | Pack + human decision |
| Autonomous diagnosis / auto-Rx / AI-as-authority | Safety lock ([111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) §22) |
| Duplicate catalog / order / payment kernels | Ecosystem lock |
| Dedicated pharmacist app | Topology lock |

---

## 1. Doctor prescribing workflow

### 1.1 Happy path

```
Active Encounter (authorized)
  → Open “Prescribe” from encounter / appointments context
      → Create DRAFT (version 1 unsealed)  [POST /doctor/prescriptions]
          → Enter / edit medication lines (clinical concepts + instructions)
              → Client validation (required fields) + server validation
                  → Review screen (confirmation)
                      → ISSUE (seal version 1)  [POST …/issue + Idempotency-Key]
                          → Success: issued detail + history
```

Alternate entries:

- Prescriptions list → “New” requires selecting an **authorized encounter** (no orphan Rx).
- From appointment detail when encounter exists / can be ensured by existing clinical APIs (reuse R5-A encounter link rules — **no parallel encounter model**).

### 1.2 Draft lifecycle (UX + server)

| State | Doctor can | Doctor cannot |
|-------|------------|---------------|
| **DRAFT** | Edit lines (if R5-B draft-update API authorized); discard/cancel; open review; issue | Customer edit; dispense; create Order |
| **ISSUED** | View; amend (new version); cancel | Mutate sealed version lines |
| **CANCELLED** | View history | Issue / amend |

**Draft save / retry:** mutating calls use **Idempotency-Key**; UI shows “Saving…” / “Saved” / “Retry” on network failure without duplicating drafts when the same key is replayed.

**Discard:** cancel draft (`POST …/cancel`) rather than hard-delete; versions remain for audit.

### 1.3 Validation (no invented clinical rules)

| Layer | Checks |
|-------|--------|
| Client | Required: concept code/label, dosage instructions, quantity; non-empty line list; block issue with empty lines |
| Server (existing R5-A) | Pack `rx_prescribe_enabled`; encounter ownership; clinical access; restriction codes fail-closed; line field presence |
| Not in R5-B | Dosage appropriateness, interactions, allergies, statutory schedules, license number formats |

Warnings/errors shown only when **supported by existing policy/API** (e.g. pack disabled → policy-disabled state; restriction denied → 403 with non-PHI reason code).

### 1.4 Review → issue

Dedicated **Review** step before ISSUE (see §5). Issue is a **confirming action** with explicit CTA (“Issue prescription”), not silent auto-issue on save.

### 1.5 Cancel

- Available on DRAFT and ISSUED (per R5-A transitions).
- Confirmation dialog: irreversible for further dispense auth; history retained.
- Optional `reason_code` (opaque product codes — not invented legal texts).

### 1.6 Amend / version

See §6. Amend never overwrites sealed lines.

### 1.7 Error / recovery states

| Condition | UX |
|-----------|-----|
| Session expired | SessionExpiredState → re-auth doctor audience |
| 403 clinical access / consent | Explain “access not available”; link to consent/relationship guidance **without** PHI dump |
| Pack disabled | Policy-disabled empty state (“Prescribing not enabled for this country pack”) |
| 409 illegal transition | Show current status; disable illegal CTAs |
| Network / 5xx | NetworkErrorState + idempotent retry |
| Idempotent replay | Treat as success; show existing resource |

---

## 2. Medication entry

### 2.1 Three layers (must stay distinct)

| Layer | R5-B UX | Owner |
|-------|---------|-------|
| **Clinical medication concept** | Primary entry: `clinical_concept_code` + `clinical_concept_label` (+ strength/form/route text as optional clinical descriptors) | `prescription` lines |
| **Commercial CatalogItem / variant** | Optional **hint** only (`suggested_catalog_item_id`) — search/select from existing catalog APIs if pack allows commercial hints; **never** becomes clinical truth | existing `catalog` |
| **Dispensed lot** | **Out of scope** — R5-C | inventory |

### 2.2 Rules

- Do **not** create CatalogItem rows from prescribing.
- Do **not** require a catalog match to issue (clinical concept is sufficient).
- Substitution allowed defaults **false** until pharmacist workflow (OD-PHARM-09) — UI toggle only if pack/product allows; still not dispensing.
- Restricted lines: if doctor enters an opaque `restriction_category_code`, server fail-closes unless pack allow-list includes it; UI must not invent schedule lists.

### 2.3 Entry UX patterns

- Add line / remove line / reorder by line number.
- Instructions free-text + quantity/unit fields (structured enough for R5-A schema).
- No “auto-fill from symptoms,” no care-nav → Rx pipeline.

---

## 3. Clinical safety boundaries

| Rule | Enforcement |
|------|-------------|
| Customer cannot create/edit prescriptions | Customer APIs are GET-only; UI has no editors |
| Doctor is final prescribing authority | Issue/amend/cancel require doctor audience + DoctorProfile |
| No autonomous diagnosis | No AI CTA that issues Rx |
| No automatic Rx from symptoms / care-nav | No product hook in R5-B |
| No client-side authorization | Hide CTAs for UX only; server denies |
| No Order / inventory / payment / shipment side effects | R5-A `commerce: false` contract held |

---

## 4. Patient context (minimum necessary)

Shown on prescribe / review screens **only** after server-authorized access:

| Field | Purpose |
|-------|---------|
| Patient display name / initials (existing person projection already used in care UX) | Identify subject |
| Encounter id / appointment time / modality | Linkage confirmation |
| Country (from encounter) | Pack context |
| Consent / relationship status indicators (allowed/denied codes, not document bodies) | Access clarity |

**Not shown unless already authorized elsewhere and necessary:** full address, payment methods, unrelated health artifacts, raw clinical notes dump, other patients’ data.

Controls: existing `ClinicalRelationship`, `ConsentGrant`, encounter ownership, RLS — **frontend never grants access**.

---

## 5. Prescription review (pre-ISSUE)

### 5.1 Screen content

| Block | Content |
|-------|---------|
| Patient | Minimum necessary (§4) |
| Encounter | Id, schedule summary, status |
| Medication lines | Concept label, instructions, qty/unit, restriction code if any |
| Validity | `valid_from` / `valid_until` **only if** server/pack populated — empty = do not invent dates; show “Validity set by pack/policy when available” |
| Warnings/errors | Only from API/policy (pack off, restriction denied, validation) |
| Confirmation | Explicit checkbox or confirm dialog: “I am issuing this prescription” (product copy — not a legal attestation unless pack/legal later says so) |

### 5.2 Actions

- **Back to edit** (DRAFT only)
- **Issue** → Idempotency-Key → success navigates to issued detail
- **Cancel draft** (secondary)

Unsigned drafts remain **not dispensable** ([08](08_DOCTOR_PLATFORM.md), [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md)).

---

## 6. Amendment UX + API behavior

| Concern | Behavior |
|---------|----------|
| Immutability | Prior `PrescriptionVersion` rows unchanged (`sealed_at` retained) |
| UX | “Amend” opens a **new line editor** prefilled from current version for convenience; submit creates version N+1 |
| API | Existing `POST /doctor/prescriptions/:id/amend` + Idempotency-Key; requires ISSUED + `rx_amend_enabled` |
| Header status | Remains **ISSUED**; `current_version_id` advances |
| Customer view | Shows current version prominently; prior versions listed as read-only history |
| Illegal | Amend from DRAFT/CANCELLED → 409; UI disables |

No “edit in place” of sealed instructions.

---

## 7. Customer experience (read-only)

### 7.1 Screens

| Screen | Behavior |
|--------|----------|
| **List** | Own prescriptions; status chip (DRAFT may be hidden from customer **or** shown as “Pending” — **product OD-R5B-01**); empty/loading/error/403 |
| **Detail** | Current version instructions (minimum necessary); status; issued/cancelled timestamps |
| **Version history** | Indicate “Version 2 of 2 (current)” / prior versions expandable; no edit |
| **Privacy** | Link to consent/privacy account screens; expired session handling |

### 7.2 Hard rules

- **Never** edit clinical instructions.
- **Never** put dosage text in URLs/query strings.
- No refill CTA in R5-B (R5-E / OD-RX-REFILL).
- No “Add to cart” in R5-B (R5-D / OD-DOC-10).

---

## 8. Store preview boundary (not R5-C)

**Do not implement dispensing UI or APIs in R5-B.**

Define **future R5-C read model** needs from prescription (server-side projection later):

| Needed later | Not exposed now |
|--------------|-----------------|
| Prescription id + current version id | Full unrelated EHR |
| Status ISSUED / CANCELLED | Draft-only doctor notes outside Rx |
| Line clinical labels + qty authorized (for verify desk) | Customer payment data |
| Restriction opaque codes | Company finance |
| Encounter/country ids for tenancy | Raw consent documents |

Store users in R5-B: **no new screens**. Packer still must not see Rx images by default when R5-C lands ([06](06_PHARMACY_PLATFORM.md)).

---

## 9. Admin

| Allowed | Forbidden |
|---------|-----------|
| Metadata list/detail already in R5-A (`prescription:read`) | Unrestricted clinical browsing of all medication lines in ops dashboards |
| Status / version numbers / ids / audit timestamps | Company admin bypass of clinical access |
| Pack enablement status (policy UI, if already present) | Break-glass without existing security purpose + audit |

R5-B may refine copy (“Operational metadata only”) — **no** new privileged clinical payload APIs.

---

## 10. Notifications (contracts only)

Reuse outbox → notification dispatch ([109](109_POST_R4_ECOSYSTEM_HARDENING.md) / [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md)).

| Event | Recipients (server-resolved) | Body rule |
|-------|------------------------------|-----------|
| `PRESCRIPTION_CREATED` | Optional doctor confirm; patient only if product wants draft visibility | No drug names / doses |
| `PRESCRIPTION_ISSUED` | Patient | Generic “A prescription is available” |
| `PRESCRIPTION_AMENDED` | Patient | Generic “A prescription was updated” |
| `PRESCRIPTION_CANCELLED` | Patient | Generic “A prescription was cancelled” |
| `PRESCRIPTION_ACTION_REQUIRED` | Reserved for R5-C/E | — |

No second notification engine. No provider credentials invented.

---

## 11. Support

| Allowed on ticket | Forbidden |
|-------------------|-----------|
| `reference_type=prescription`, `reference_id=<uuid>` | Copy of dosage, medication list, Rx images |
| Optional `encounter_id` / `order_id` when commercial phase exists | Pasting clinical JSON into ticket body |

Deep link opens authorized clinical UI after ACL. Align OD-SUP-01 (ticket-first).

---

## 12. Mobile (RN + Expo)

| App | Parity |
|-----|--------|
| **mobile-doctor** | Same workflow as web-doctor: encounter entry, draft lines, review, issue, amend, cancel, list/detail |
| **mobile (customer)** | List + detail + version indication + states |
| Platforms | Android + iOS |
| Shell | Existing ui-kit native + shell-core abstractions |
| Pharmacist app | **Not created** |

Offline: do **not** issue/amend offline if server cannot stamp ([25](25_UI_UX_ARCHITECTURE.md)); queue is not authority.

---

## 13. Accessibility / i18n / UX states

Use shared **ui-kit** / **shell** patterns ([25](25_UI_UX_ARCHITECTURE.md), [26](26_DESIGN_SYSTEM_SPEC.md)).

| State | Requirement |
|-------|-------------|
| Loading | Contextual healthcare loading/buffering — **no network-dependent decorative assets** required for correctness |
| Empty | “No prescriptions yet” / “Select an encounter to prescribe” |
| Error | Problem+json title/detail; clinical vs commerce chrome distinct |
| 403 | Access denied without leaking existence of others’ Rx where 404 is preferred (match R5-A isolation) |
| Session expired | Re-auth |
| Network | Retry; preserve draft form local state carefully; rely on Idempotency-Key on submit |
| Policy-disabled | Pack off messaging |
| Draft save / retry | Non-destructive retry |
| Confirmation | Issue / cancel / amend confirms |

i18n: all user-visible strings via existing locale patterns; no hardcoded country copy for medical law.

---

## 14. MNC / country

| Rule | Detail |
|------|--------|
| Enablement | `rx_prescribe_enabled` / `rx_amend_enabled` (and related) via published pack — empty/false = fail closed |
| Tenancy | Server GUCs + RLS; encounter country authoritative |
| Hardcoding | No India/INR/country branches in UX code |
| Partner ≠ company | Held |

R5-B does **not** flip packs on for any country.

---

## 15. API contract (specify only — do not implement here)

### 15.1 Reuse as-is (R5-A)

| Op | Path |
|----|------|
| List/get doctor | `GET /doctor/prescriptions`, `GET /doctor/prescriptions/:id` |
| Create draft | `POST /doctor/prescriptions` + Idempotency-Key |
| Issue | `POST /doctor/prescriptions/:id/issue` + Idempotency-Key |
| Amend | `POST /doctor/prescriptions/:id/amend` + Idempotency-Key |
| Cancel | `POST /doctor/prescriptions/:id/cancel` + Idempotency-Key |
| Customer list/get | `GET /customer/prescriptions`, `GET /customer/prescriptions/:id` |
| Admin metadata | `GET /admin/prescriptions`, `GET /admin/prescriptions/:id` |

### 15.2 Optional R5-B additions (engineering OD)

| Op | Intent | Notes |
|----|--------|-------|
| `PATCH /doctor/prescriptions/:id/draft-lines` | Replace unsealed draft lines without recreate | Only while DRAFT & unsealed; Idempotency-Key; **OD-R5B-02** |
| `GET /doctor/encounters/:id/prescription-context` | Minimum patient/encounter projection for prescribe chrome | No new PHI beyond existing care projections |
| Catalog hint search | Reuse existing catalog search APIs | Optional `suggested_catalog_item_id` |

If OD-R5B-02 is deferred, R5-B UX may recreate draft or use amend-only after issue; prefer draft-lines PATCH for good UX.

### 15.3 Explicitly out of R5-B API

Dispense, inventory allocate, cart attach, e-Rx submit success paths, refill authorize.

---

## 16. Test plan

| ID | Case |
|----|------|
| T-B-DOC | Only owning doctor can issue/amend/cancel |
| T-B-ISO | Patient A cannot read patient B |
| T-B-ENC | Create without encounter / wrong encounter → deny |
| T-B-CON | Missing consent → 403 |
| T-B-DRF | Draft create + (optional) draft-lines update |
| T-B-ISS | Issue seals version; unsigned not dispensable |
| T-B-CAN | Cancel blocks further issue/amend |
| T-B-AMD | Amend creates v2; v1 instructions unchanged |
| T-B-IDM | Duplicate Idempotency-Key replays |
| T-B-RLS | Cross-tenant denied |
| T-B-MNC | Pack off → policy-disabled / service disabled |
| T-B-CUS | Customer UI/API read-only (no mutate verbs) |
| T-B-ADM | Admin metadata only; no dosage in list payload |
| T-B-PAR | Web/mobile parity smoke for prescribe + customer detail |
| T-B-COM | No Order / inventory / payment / shipment / journal deltas on issue |

---

## 17. Open decisions

### ENGINEERING

| ID | Topic |
|----|--------|
| **OD-R5B-02** | Draft-lines PATCH vs recreate-draft only |
| E-R5B-01 | Catalog hint picker in prescribe UX or clinical-concept-only v1 |
| E-R5B-02 | Whether DRAFT is visible to customer |

### PRODUCT

| ID | Topic |
|----|--------|
| **OD-R5B-01** | Customer visibility of DRAFT (“Pending” vs hide) |
| **OD-DOC-10** | Auto-route to cart — **deferred to R5-D**; not R5-B |
| P-R5B-01 | Confirm-checkbox copy tone (clinical vs legal attestation) |

### LEGAL / COMPLIANCE

| ID | Topic |
|----|--------|
| L-RX-* | e-Rx validity, required fields, controlled handling — **unresolved** |
| **OD-RX-REFILL** | **Unresolved** — not part of R5-B |
| **OD-PHARM-04** | Still verify default — pharmacy phase |

Do **not** silently resolve OD-RX-REFILL or prescribing law in R5-B.

---

## 18. Implementation recommendation (future CR only)

When humans authorize **CR-R5-B-IMPL-***:

1. Doctor web/mobile: encounter → draft → lines → review → issue/amend/cancel UX  
2. Optional draft-lines API if OD-R5B-02 approved  
3. Customer web/mobile read UX polish  
4. Notification copy wiring (existing events)  
5. Tests from §16  

**Does not** authorize R5-C/D/E/F.

---

## 19. Traceability

| Artifact | Role |
|----------|------|
| [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) §25 R5-B | Phase definition |
| [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) | Foundation SoT |
| [08](08_DOCTOR_PLATFORM.md) | Digital Rx / unsigned drafts |
| [25](25_UI_UX_ARCHITECTURE.md) | Cross-app UX / parity / offline |
| J07 | Doctor creates prescription |

---

## 20. Authorization statement

**CR-R5-B-AUTH-113** authorized the plan only. Implementation is recorded in **[114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md)** (**CR-R5-B-IMPL-114**, **R5_B_IMPLEMENTED**).

**Do not start R5-C from this document** without a separate authorization CR.

---

**FINAL STATUS (this book): R5_B_PLAN_READY** — implementation SoT: **R5_B_IMPLEMENTED** in Book 114
