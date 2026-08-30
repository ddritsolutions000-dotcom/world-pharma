# 115 — R5-C pharmacy dispensing plan

**Status:** Plan complete — **implementation authorized and delivered via CR-R5-C-IMPL-116**  
**Change ID:** **CR-R5-C-AUTH-115** (plan) · see **[116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md)** for IMPL  
**Date:** 27 August 2026  
**FINAL STATUS (plan CR):** **R5_C_PLAN_READY**  
**Implementation status:** **R5_C_IMPLEMENTED** ([116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md), **CR-R5-C-IMPL-116**)

**Sources of truth:**  
[111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) (**R5_A_IMPLEMENTED**) · [113](113_R5_B_PRESCRIBING_UX_PLAN.md) · [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) (**R5_B_IMPLEMENTED**) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) (**R5_C_IMPLEMENTED**) · [06](06_PHARMACY_PLATFORM.md) · [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md) · [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md) · [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) · [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md) · [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) · [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md) · [35](35_OPEN_DECISIONS.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [25](25_UI_UX_ARCHITECTURE.md)

**Prerequisite:** R5-A foundation + R5-B prescribing UX are live. Store preview field list prepared in [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md). `DispensingBoundaryPort` is implemented by `DispensingService` under **CR-R5-C-IMPL-116**.

**Authority boundary (this plan CR historically):** PLAN ONLY for CR-R5-C-AUTH-115. Coding was performed only under **CR-R5-C-IMPL-116**. **Do not** start R5-D commercial handoff from this document alone.

---

## 0. Purpose and non-goals

### Purpose

Define the complete **R5-C pharmacy dispensing** engineering contract on top of immutable Prescription Foundation (R5-A) and prescribing UX (R5-B) so a future **CR-R5-C-IMPL-*** can ship owned-pharmacy validation → dispense decision → lot selection → dispense completion **without** restructuring identity, catalog, order, payment, inventory, logistics, or finance kernels.

### R5-A / R5-B / R5-C / R5-D

| Layer | Status | Role |
|-------|--------|------|
| **R5-A** | Done | Prescription / versions / lines / RLS / pack gates |
| **R5-B** | Done | Doctor prescribe UX; customer read; store **contract prep only** |
| **R5-C** | **This plan** | Pharmacy desk: DispensingCase + DispenseEvent; inventory **eligibility** + authorized consume; no automatic Order |
| **R5-D** | Later | Commercial handoff (cart/checkout/payment/order) — **OD-DOC-10**; not authorized here |

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations | Plan only |
| R5-D Order-from-Rx implementation | Separate phase + OD-DOC-10 |
| Refill / OD-RX-REFILL product | R5-E + legal |
| Live e-Rx / NullERx override | R5-F + legal |
| Dedicated pharmacist app / second identity | Topology lock |
| Invented partial-dispense / controlled / tax law | Legal/pack |
| Duplicate payment / order / shipment / finance kernels | Ecosystem lock |
| Live PSP / DHL / payouts | Production CRs |
| Silent clinical→SKU substitution | OD-PHARM-09 + pack |

---

## 1. Pharmacy dispensing boundary

### 1.1 Layer separation (must stay distinct)

| Layer | Owner | Truth |
|-------|-------|-------|
| **Prescription** (+ immutable `PrescriptionVersion` / lines) | `prescription` (R5-A) | Clinical authorization artifact |
| **Clinical medication concept** | Line fields (`clinical_concept_*`) | What was prescribed |
| **Commercial CatalogItem / variant** | Existing `catalog` | What can be sold |
| **Inventory lot** | Existing 1B inventory | What physical stock exists |
| **DispensingCase / DispenseEvent** | R5-C (to implement) | Pharmacy workflow + immutable dispense facts |
| **Order** | Existing 1E | Commercial fulfillment — **never** created by prescribe or by dispense alone in R5-C |

```
ISSUED PrescriptionVersion
  → DispensingCase (location-scoped queue)
      → pharmacist validate (OD-PHARM-04 still-verify default)
          → REJECTED | AUTHORIZED_TO_DISPENSE
              → lot selection + qty check (no mutation yet)
                  → DispenseEvent (authorized complete)  [inventory consume only here]
                      → optional commercial handoff contract → R5-D (not this CR)
```

### 1.2 Hard boundary rules

| Rule | Detail |
|------|--------|
| Prescribe ≠ revenue | Creating/issuing/amending Rx creates **no** Order, Payment, Journal, or shipment |
| Dispense ≠ Order | Completing a DispenseEvent does **not** auto-create Order in R5-C |
| Clinical immutability | Dispense never rewrites sealed PrescriptionVersion lines |
| Noop today | Existing `NoopDispensingBoundary` / `r5b_dispensing_not_implemented` remains until IMPL CR replaces it |

### 1.3 Objects to introduce in a future IMPL CR (logical)

| Object | Meaning |
|--------|---------|
| **DispensingCase** | Workflow instance for one `PrescriptionVersion` at one fulfilling **Location** (owned pharmacy org) |
| **DispenseEvent** | Immutable pharmacist decision: reject / authorize / complete (and partial **only if** OD-R5C-01 allows) |
| **DispenseLineMapping** | Explicit clinical line → CatalogItem/variant (+ optional lot) chosen for that event — never silent |
| **DispenseQtyLedger** | Server-derived remaining authorized qty vs dispensed qty (derived, auditable) |

Reuse R5-B store preview fields as the **minimum** store read model:  
`prescription_id`, `current_version_id`, `status`, `country_id`, `encounter_id`, `line_clinical_labels`, `quantity_authorized`, `restriction_category_codes`.

---

## 2. Pharmacy actor model

### 2.1 Identity / tenancy (no new kernels)

Reuse: `Person`, Membership, Organization (`PHARMACY_OWNED`), Location, Partner (doctor already separate), JWT audiences already in topology (`store` / partner family as implemented).

| Actor | Surface | Scope |
|-------|---------|-------|
| `pharmacist` | Store web + Store mobile | Location: verify / reject / map / dispense |
| `pharmacy_packer` | Store web + Store mobile | Pack/pick only — **cannot** verify Rx (SoD, [06](06_PHARMACY_PLATFORM.md)) |
| `pharmacy_manager` / `pharmacy_owner` | Store web (+ mobile as needed) | Exceptions, overrides with audit; not global clinical |
| Customer | Customer web/mobile | Own Rx + dispense **status** only |
| Doctor | Doctor web/mobile | Read-only dispense status where ACL allows |
| Admin | Admin web | Metadata / pack / exception oversight — permissioned |
| Vendor | Vendor web | **No** pharmacy clinical desk in R5-C |

### 2.2 Dedicated pharmacist app?

**No.** Logical APP-PHARM maps to existing **web-store** + **mobile-store** (React Native + Expo, Android + iOS). Creating a dedicated pharmacist app requires a **future human decision** + CR — not R5-C.

### 2.3 Forbidden

- Second identity / JWT audience solely for pharmacists without CR  
- Generic Partner App  
- Company admin treated as pharmacist by default  
- Vendor seeing owned-pharmacy clinical Rx bodies  

---

## 3. Dispense eligibility (server-side, fail-closed)

All checks run on the **server**. Clients may preview; APIs enforce.

| Gate | Pass when | Fail closed when |
|------|-----------|------------------|
| Prescription header status | `ISSUED` (and not cancelled) | `DRAFT`, `CANCELLED`, unknown |
| Version | Current sealed version (or pack-defined allowed version) | Unsealed draft; wrong version id |
| Validity window | Pack-supplied `valid_from`/`valid_until` resolve and current time in window | Empty/unknown validity rule **or** expired |
| Patient | Case patient matches Rx patient | Mismatch / missing |
| Encounter | Present when pack requires; consistent with Rx | Required but missing |
| Prescriber | Bound `DoctorProfile` / partner on Rx | Missing / inactive per pack policy only |
| Consent / clinical access | Store purpose for dispense (pack-defined purpose code) + relationship/org rules as implemented | Deny without inventing new consent law |
| Country pack | `rx_dispense_enabled` (and related) true | Absent/false |
| Restriction codes | Line opaque codes ⊆ pack allow-list | Unknown / not allow-listed |
| Clinical→catalog mapping | Explicit pharmacist mapping recorded | Auto-map only / missing map when pack requires map |
| Inventory availability | Sellable qty ≥ requested at Location | Insufficient |
| Lot status | Active, not recalled | Quarantine / damaged / recalled / inactive |
| Lot expiry | `expires_on` satisfies pack `inventory.dispense_min_remaining_days` when set | Expired / below min remaining |
| FEFO | Prefer earliest expiry when `inventory.fefo_required` | Override only with audited manager reason |
| Actor SoD | Pharmacist (or pack-defined verify role) | Packer-only token |
| Location scope | Membership at fulfilling Location + org ownership | Cross-location / other org |
| Idempotency | Valid Idempotency-Key on mutating dispense APIs | Missing key on mutate |

**Do not invent** dosage appropriateness, interaction checking, allergy engines, statutory schedules, or license-number formats in R5-C.

---

## 4. Prescription → commercial mapping

| Principle | Detail |
|-----------|--------|
| Clinical truth stays clinical | Mapping lives on **DispenseLineMapping / DispenseEvent**, not on sealed PrescriptionLine rewrite |
| Hint ≠ authority | R5-A optional `suggested_catalog_item_id` is a **hint** only |
| Explicit selection | Pharmacist selects CatalogItem/variant (search existing catalog APIs) |
| No silent substitution | Different molecule/strength/form than clinical concept → blocked unless pack + **OD-PHARM-09** path (customer accept when required) |
| Same-SKU pack-size | May be pharmacist-only **if** pack allows — else OD |
| No CatalogItem creation from dispense | Do not invent SKUs at desk |

---

## 5. Inventory / lot

Reuse **1B** lots/balances/reservations/movements and **1E** consume-once allocation patterns ([53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md), [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md)).

| Concern | R5-C rule |
|---------|-----------|
| Mutation timing | **No** inventory mutation until authorized **dispense complete** action (or pack-defined hard allocate step — OD-R5C-02) |
| Lot selection | Pharmacist picks eligible lots; FEFO is **hint** when pack sets `inventory.fefo_required` |
| Expiry / quarantine / damage / recall | Not selectable |
| Quantity | Requested ≤ remaining authorized clinical qty **and** ≤ available sellable |
| Consume-once | Reservation/allocation ids cannot double-consume |
| Negative stock | Forbidden |
| Concurrency | Row/lot locking or equivalent; concurrent second full dispense → reject / idempotent replay |
| Audit | Movement + DispenseEvent reference; no PHI/dosage in security event payloads |

Rejecting a case must not leave stranded picks (align A-PHARM-06 / existing release patterns).

---

## 6. Dispensing state machine

### 6.1 DispensingCase (proposed)

```
QUEUED
  → VALIDATING
      → REJECTED                 [terminal for this case]
      → AUTHORIZED_TO_DISPENSE
          → DISPENSING           [lot/qty confirmed; inventory not yet final unless OD-R5C-02]
              → DISPENSED        [DispenseEvent sealed; inventory consumed]
              → FAILED           [technical / inventory race — retryable under policy]
      → CANCELLED_CASE           [pharmacy abandon before complete; Rx may remain ISSUED]
```

Illegal transitions → `409` with opaque reason codes (no invented legal text).

### 6.2 Prescription header interaction

| After | Header may become |
|-------|-------------------|
| Full qty accounted | `FULLY_DISPENSED` (R5-A enum already reserved; first writer in R5-C IMPL) |
| Cancel Rx | Blocks new cases; existing open cases → reject/cancel per policy |
| Amend (new version) | New case targets **current** version; prior version cases close/supersede per OD-R5C-03 |

### 6.3 Partial dispense / exceptions

| Topic | Plan position |
|-------|----------------|
| Partial qty | **OD-R5C-01** — do **not** silently invent partial-dispense law. Until decided: either **full-line-only** (engineering default recommendation) or pack-gated partial with remaining qty ledger |
| Multi-location split | OD-PHARM-02 remains **No v1** |
| Override FEFO / damaged | Manager + reason + audit only; still cannot dispense expired/quarantine if pack forbids |

### 6.4 Upload / OCR PrescriptionCase

Existing order-attached `RX_REVIEW` paths ([06](06_PHARMACY_PLATFORM.md)) may **parallel** R5-C. Digital encounter-origin Rx uses **DispensingCase first**. Do not merge aggregates silently.

---

## 7. Order handoff (contract only — R5-D)

### 7.1 When Order may be created

**Not in R5-C runtime.** Spec for future R5-D:

```
DispenseEvent (DISPENSED) [clinical auth fact]
  → commercial intent (patient-driven default per OD-DOC-10)
      → Cart / CheckoutSession (1C) with frozen quote
          → PaymentIntent (1D) — server payment fact only
              → Order (1E) — one Order per payment intent; Idempotency-Key
                  → allocation consume-once
                      → Shipment / job (1F) if delivery
                          → finance facts (1G) on commercial events only
```

### 7.2 Preserve 1D–1G boundaries

| Rule | Held |
|------|------|
| Payment fact from server | Yes |
| Frozen 1C quote authoritative | Yes |
| No client redirect creates Order | Yes |
| Idempotency mandatory | Yes |
| One Order per payment intent | Yes |
| Inventory reservation consume-once | Yes |
| Prescribe/dispense alone ≠ Order | Yes |

Pickup without shipment still requires Order boundary when goods change ownership commercially.

---

## 8. Payment

| Item | R5-C position |
|------|----------------|
| Kernel | Existing **1D** only |
| New PSP | **No** |
| Live payment | **No** |
| COD | Remains **country-policy gated** (existing) |
| Dispense complete | Does **not** capture payment |

---

## 9. Store UI (web + mobile parity)

Surfaces: `apps/web-store`, `apps/mobile-store`. Shared ui-kit + shell states.

| Screen / flow | Behavior |
|---------------|----------|
| Prescription queue | Location-scoped DispensingCases; filters by status |
| Case open | Minimum-necessary patient projection (ids/initials as already authorized); encounter/country; version number |
| Version review | Clinical labels + qty authorized; restriction opaque codes; **no** unrelated EHR dump |
| Product mapping | Catalog search → explicit map; show “hint” if `suggested_catalog_item_id` |
| Lot selection | Eligible lots only; FEFO ordering when pack requires; expiry visible |
| Quantity validation | Client assist + server enforce |
| Dispense confirm | Explicit CTA; Idempotency-Key |
| Reject | Reason code (opaque); confirm |
| Exceptions / history | Case timeline; actor; timestamps |
| States | Loading (healthcare-context buffering), empty, error, 403, session-expired, network, policy-disabled (`rx_dispense_enabled` off) |

Packer UI: pack queue only — no verify CTAs.

**PHI:** no dosage in URLs; no clinical JSON dumps; packer default must not see Rx images when product later adds images ([06](06_PHARMACY_PLATFORM.md)).

---

## 10. Customer UI

| Surface | Behavior |
|---------|----------|
| Existing Rx list/detail (R5-B) | Retain; add **dispensing status** chip (queued / rejected / dispensed / unavailable) |
| Messaging | Privacy-safe (“Pharmacy is reviewing” / “Ready” / “Could not dispense”) — **no** lot codes, staff names, internal notes |
| Actions | **No** edit Rx; **no** refill CTA (R5-E); **no** auto-cart (R5-D / OD-DOC-10) |
| Order link | Only if R5-D later attaches Order — show commercial status then |

---

## 11. Doctor UI

| Surface | Behavior |
|---------|----------|
| Prescription detail | Read-only **dispense status** + timestamps where clinical ACL allows |
| Forbidden | Doctor cannot modify DispenseEvent / lots / mappings via this surface |
| Amend/cancel | Existing R5-B flows; may invalidate open cases per §6 |

---

## 12. Admin

| Allowed | Forbidden |
|---------|-----------|
| Case metadata, status, location/org ids, audit timestamps | Unrestricted browsing of medication lines / dosages |
| Pack enablement status (`rx_dispense_enabled`) | Company-admin bypass of clinical/store ACL |
| Exception queues (ops) | Break-glass without existing security purpose + audit |

Extend R5-A/B `prescription:read` metadata pattern; do **not** add privileged clinical dump APIs in R5-C.

---

## 13. Support

| Allowed on ticket | Forbidden |
|-------------------|-----------|
| `reference_type=prescription` / `dispensing_case` + UUID | Dosage, medication list, Rx images, lot PHI |
| Optional `order_id` when R5-D exists | Pasting clinical JSON into ticket body |

Deep links open authorized Store/Customer/Doctor UI after ACL. Align OD-SUP-01 (ticket-first).

---

## 14. Logistics

If/when Order exists (R5-D): reuse **1E/1F** only. No new shipment kernel. No DHL/live carrier. Store last-mile default (OD-PHARM-01).

R5-C itself creates **no** LogisticsJob.

---

## 15. Finance

If/when Order exists (R5-D): reuse **1G** sandbox facts only. R5-C creates **no** revenue, payable, COGS, tax, profit, or payout entries. Do not invent GST/VAT.

---

## 16. Security / RLS

| Path | Rule |
|------|------|
| Clinical read of Rx | Person → DoctorProfile → Encounter → Relationship → Consent → Policy → RLS (existing) |
| Store desk | Organization + **Location** membership; case assignment |
| Customer | Own `patient_person_id` only |
| Vendor | No owned-pharmacy clinical data |
| Admin | Permissioned metadata; no unrestricted clinical |
| Events / logs | Actor, resource ids, reason codes — **no** drug names/doses |

---

## 17. MNC / country

| Rule | Detail |
|------|--------|
| Enablement | `rx_dispense_enabled` (+ related) via published pack — empty/false = fail closed |
| Tenancy | Encounter/Rx country + Location country consistency checks |
| Hardcoding | No India / INR / GST / country branches in application code |
| Hierarchy | Region / legal entity / business unit remain canonical |
| R5-C IMPL | Does **not** flip packs on for any country |

---

## 18. Mobile

| App | R5-C |
|-----|------|
| **mobile-store** | Pharmacy desk parity with web-store (queue → review → map → lot → dispense/reject) |
| Platforms | Android + iOS (Expo) |
| Pharmacist-only app | **Not created** |
| Offline | Do not complete dispense offline if server cannot stamp; queue is not authority ([25](25_UI_UX_ARCHITECTURE.md)) |

---

## 19. Notifications (contracts only)

Reuse outbox → notification dispatch. No second engine.

| Event (illustrative) | Recipients | Body rule |
|----------------------|------------|-----------|
| `DISPENSING_CASE_QUEUED` | Store location staff (optional) | No drug names |
| `DISPENSING_REJECTED` | Patient | Generic “could not be dispensed” |
| `DISPENSING_COMPLETED` | Patient | Generic “pharmacy completed review/dispense” |
| `PRESCRIPTION_ACTION_REQUIRED` | Reserved / R5-D–E | — |

No provider credentials invented.

---

## 20. Buffering / loading UX

Apply global World Pharma UX rule ([25](25_UI_UX_ARCHITECTURE.md) / prior R5-B):

- Where loading/buffering is unavoidable, use **healthcare/medicine-contextual** visuals — not unrelated decoration  
- Do **not** make correctness depend on decorative assets loading  
- Never hide errors behind spinners; keep empty/error/403/session/network/policy states distinct  

---

## 21. Audit

Every dispensing mutation records:

| Field | Requirement |
|-------|-------------|
| Actor | `Person` id (+ membership/location) |
| Timestamp | Server time |
| Action | queue / validate / reject / map / select-lot / dispense / cancel-case / override |
| Reference | `prescription_id`, `version_id`, `dispensing_case_id`, `dispense_event_id`, optional inventory movement ids |
| Reason | Opaque `reason_code` where applicable |
| Immutability | DispenseEvent append-only; no overwrite of sealed events |

Security/clinical access events: **no** clinical body in payloads.

---

## 22. Test plan (future IMPL CR)

| ID | Case |
|----|------|
| T-C-AUTH | Only location pharmacist can dispense; packer cannot verify |
| T-C-STS | Expired / cancelled / draft Rx cannot enter DISPENSED |
| T-C-VER | Version immutability: dispense cannot alter sealed lines |
| T-C-ISO-P | Patient A cannot see patient B case |
| T-C-ISO-L | Store location A cannot open location B queue |
| T-C-LOT-X | Expired / quarantine / damaged / recalled lot rejected |
| T-C-FEFO | FEFO hint ordering when pack requires; audited override |
| T-C-CONC | Concurrent double dispense → one success + reject/idempotent |
| T-C-ONCE | Consume-once reservation/allocation |
| T-C-NEG | Negative stock impossible |
| T-C-DUP | Duplicate Idempotency-Key replays same DispenseEvent |
| T-C-MAP | No silent substitution; unmapped line blocked when required |
| T-C-PAY | Dispense does not create PaymentIntent / capture |
| T-C-UNK | Payment UNKNOWN paths unchanged (1D); R5-C independent |
| T-C-ORD | Dispense does not create Order; R5-D boundary held |
| T-C-SHIP | No shipment/job from R5-C alone |
| T-C-RLS | Cross-tenant denied |
| T-C-ADM | Admin metadata only; no dosage in list payload |
| T-C-PAR | Web/mobile store parity smoke |
| T-C-SIDE | Zero unintended payment/inventory/shipment deltas on reject/validate-only |

---

## 23. Open decisions

### Preserved unresolved (do not silently resolve)

| ID | Topic | Notes |
|----|--------|-------|
| **OD-RX-REFILL** | Auto-refill vs re-authorization | R5-E blocked |
| **OD-PHARM-04** | Skip Rx desk if platform-signed | Default **still verify** — held for R5-C |
| **OD-DOC-10** | Auto-route Rx to cart vs patient-driven | R5-D |
| **E-R5B-01** | Catalog hint picker in prescribe UX | Clinical-concept-only until decided; R5-C mapping is pharmacist-side |

Also still relevant: **OD-PHARM-05** (central vs location desk), **OD-PHARM-08** (explicit Accept vs auto), **OD-PHARM-09** (substitution customer accept), **OD-PHARM-01/02**.

### New R5-C decisions

#### ENGINEERING

| ID | Topic | Recommendation until decided |
|----|--------|------------------------------|
| **OD-R5C-01** | Partial dispense allowed in v1? | Prefer **full-line-only** until legal/product decide |
| **OD-R5C-02** | Soft-hold vs hard-allocate before DispenseEvent seal | Soft check in validate; hard consume on complete (align 1E) |
| **OD-R5C-03** | Open cases when Rx amended to new version | Supersede/close prior-version cases; queue new case for current version |
| **OD-R5C-04** | Auto-enqueue DispensingCase on ISSUE vs pharmacy pull | Pull/queue on first store open **or** outbox enqueue — pick in IMPL CR |
| E-R5C-01 | Schema: new tables vs extend PrescriptionCase | Prefer new DispensingCase for digital encounter-origin Rx |

#### PRODUCT

| ID | Topic |
|----|--------|
| P-R5C-01 | Customer-visible reject reason granularity |
| P-R5C-02 | Whether doctor sees pharmacy location name |
| P-R5C-03 | Exception SLA / escalation UI |

#### LEGAL / COMPLIANCE

| ID | Topic |
|----|--------|
| L-RX-* | e-Rx validity, controlled handling, required fields — **unresolved** |
| L-R5C-01 | Who may legally dispense / counselling duties — pack/human |
| L-R5C-02 | Partial fill statutory rules — **do not invent** |
| **OD-PHARM-04** | Still-verify default (held) |

---

## 24. Implementation recommendation (future CR only)

Suggested **CR-R5-C-IMPL-*** slices:

1. Schema: DispensingCase + DispenseEvent (+ mapping/qty ledger) + RLS  
2. Replace `NoopDispensingBoundary` with real port wired to cases  
3. Store APIs: queue / get / validate / reject / map / select-lot / complete (+ Idempotency-Key)  
4. Inventory eligibility + consume on complete (1B/1E reuse)  
5. Store web + mobile desk UX  
6. Customer/doctor status projections  
7. Admin metadata extensions  
8. Notification outbox events  
9. Full §22 tests + regression  

**Stop before R5-D** unless a separate CR authorizes commercial handoff. R5-D plan (not coding): [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) (**R5_D_PLAN_READY**).

---

## 25. Traceability

| Artifact | Role |
|----------|------|
| [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) §5–§10, §25 R5-C | Parent R5 architecture |
| [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) | Foundation SoT |
| [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) | UX + store preview contract |
| [06](06_PHARMACY_PLATFORM.md) | Owned pharmacy roles / FEFO / SoD |
| [53](53_PHASE_1B_INVENTORY_WAREHOUSE_IMPLEMENTATION.md) / [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md) | Lot / allocate / consume-once |
| J07 / J08 | Doctor creates Rx; customer orders from Rx (commercial = R5-D) |

---

## 26. Authorization statement

**CR-R5-C-AUTH-115 does not authorize R5-C coding, migrations, country enablement, Order-from-Rx, refill, live e-Rx, or live money/carriers.**

Next human step: approve this plan → issue **CR-R5-C-IMPL-*** when ready. **Do not start R5-D from this document.**

---

**FINAL STATUS: R5_C_PLAN_READY**
