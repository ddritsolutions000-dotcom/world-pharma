# 119 — R5-E refill / subscription plan

**Status:** Plan complete — **implemented by [120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md)**  
**Change ID:** **CR-R5-E-AUTH-119** (plan) → **CR-R5-E-IMPL-120** (code)  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_E_PLAN_READY** (historical) · implementation status **R5_E_IMPLEMENTED** in Book 120

**Sources of truth:**  
[111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) (**R5_C_IMPLEMENTED**) · [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) · [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md) (**R5_D_IMPLEMENTED**) · [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md) · [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [35](35_OPEN_DECISIONS.md) (**OD-RX-REFILL**, **OD-DOC-10**, **OD-PHARM-04**, **OD-PHARM-09**) · [55](55_PHASE_1C_CART_CHECKOUT_IMPLEMENTATION.md) · [57](57_PHASE_1D_PAYMENT_IMPLEMENTATION.md) · [59](59_PHASE_1E_ORDER_FULFILLMENT_IMPLEMENTATION.md) · [61](61_PHASE_1F_LOGISTICS_IMPLEMENTATION.md) · [63](63_PHASE_1G_SETTLEMENT_LEDGER_PROFITABILITY_IMPLEMENTATION.md) · [25](25_UI_UX_ARCHITECTURE.md) · [67](67_PRESCRIPTION_ECOSYSTEM.md) · [120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md)

**Prerequisite:** R5-A/B/C/D live; 1C–1G sandbox commerce kernels live. **OD-RX-REFILL remains unresolved** — this plan does **not** invent refill or subscription law.

**Authority boundary (this Book 119 CR):** Originally **PLAN ONLY.** Production coding for R5-E was authorized and completed under **CR-R5-E-IMPL-120**. Do **not** start R6 under this document.

---

## 0. Purpose and non-goals

### Purpose

Define the complete **R5-E refill / repeat / (optional) subscription** engineering contract so a future **CR-R5-E-IMPL-*** can:

1. evaluate refill eligibility without mutating sealed clinical or commercial history;
2. create a **new** clinical dispense cycle (when product/legal allow) and a **new** commercial Order via **R5-D → 1C–1G reuse**;
3. keep **OD-RX-REFILL** as an explicit human/legal gate (not silently “resolved” in code);
4. isolate automatic recurring refill (**subscription**) as a **separate**, pack-gated product that is **not** assumed legally permitted.

### Layer separation (must stay distinct)

| Layer | Kernel | Truth |
|-------|--------|-------|
| **Prescription** (+ sealed `PrescriptionVersion` / lines) | R5-A | Clinical authorization artifact — **immutable after seal** |
| **RefillRequest / RepeatAuthorization** *(planned)* | R5-E | Eligibility + authorization ledger for a **new** fill cycle |
| **DispensingCase / DispenseEvent** | R5-C | Pharmacy workflow + **new** lot mapping + consume |
| **RxCommerceHandoff** | R5-D | Patient-driven cart seed from **this** dispense event |
| **Cart / CheckoutQuote** | 1C | **New** frozen commercial offer |
| **PaymentIntent** | 1D | **New** server payment fact |
| **Order** | 1E | **New** commercial fulfillment SoT (`dispenseEventId` unique) |
| **Shipment** | 1F | Logistics (mock only today) |
| **FinancialFact / Journal** | 1G | Sandbox facts from **this** Order/payment only |
| **RxSubscription** *(optional, gated)* | R5-E / later | Schedule + consent + pause — **not** a second Order kernel |

```
Prior DISPENSED cycle (immutable history)
  → Refill eligibility (server, fail-closed)
      → RefillRequest (+ optional clinical re-auth)
          → NEW DispensingCase / DispenseEvent (R5-C)
              → NEW inventory PICK at complete (consume-once for THIS event)
                  → R5-D handoff (skip hold; no second PICK)
                      → NEW quote → NEW PaymentIntent → NEW Order
                          → 1E → 1F → 1G
```

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations | Plan only |
| Resolving OD-RX-REFILL as law | Human + legal |
| Mutating sealed PrescriptionVersion or old Order | Immutability |
| Auto-diagnosis / auto-Rx / silent substitution | Clinical safety |
| Cloning cart/payment/order/shipment/finance/notification kernels | Ecosystem lock |
| Assuming automatic recurring dispensing is legal | Country pack + OD-RX-REFILL |
| Live PSP / DHL / bank payout | Separate CRs |
| Dedicated pharmacist app / Partner App / affiliate mobile | Topology lock |
| India / INR / GST hardcoding | MNC pack model |
| Starting R5-F or R6 | Scope lock |

---

## 1. Current-state audit (implemented vs missing)

### 1.1 R5-A Prescription — **IMPLEMENTED**

| Exists | Missing for R5-E |
|--------|------------------|
| `Prescription`, sealed `PrescriptionVersion`, lines, status history | `refill_count` / remaining-repeat ledger |
| Amend = **new** version (no in-place mutation) | Status model for multi-fill (today first complete → `FULLY_DISPENSED`) |
| Patient / doctor isolation | `RepeatAuthorization` aggregate |

**Anchors:** `apps/api/src/clinical/prescription.service.ts` · Prisma `Prescription*` · Book [112](112_R5_A_PRESCRIPTION_FOUNDATION_IMPLEMENTATION.md)

### 1.2 R5-B Prescribing UX — **IMPLEMENTED**

| Exists | Missing for R5-E |
|--------|------------------|
| Doctor prescribe / issue / amend / cancel UX | Refill CTA; re-auth workflow screens |
| Clinical-concept lines (E-R5B-01 catalog hint still open) | Doctor refill-approval inbox (if OD requires it) |

**Anchors:** Books [113](113_R5_B_PRESCRIBING_UX_PLAN.md) / [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md)

### 1.3 R5-C Dispensing — **IMPLEMENTED**

| Exists | Missing for R5-E |
|--------|------------------|
| `DispensingCase` SM; map lines; COMPLETE → `consumeForDispense` (`PICK` / `rx_dispense`) | Opening a **second** case for the same Rx version for a repeat |
| OD-R5C-01 **full_line_only** (no partial) | Multi-fill / remaining-qty dispense semantics |
| Enqueue on ISSUE/amend | Enqueue-on-refill-authorization path |
| Still-verify default (OD-PHARM-04) | Pack keys for refill desk |

**Anchors:** `dispensing.service.ts` · `inventory.service.ts#consumeForDispense` · Books [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) / [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md)

### 1.4 R5-D Order-from-Rx — **IMPLEMENTED**

| Exists | Missing for R5-E |
|--------|------------------|
| Eligibility + `POST /customer/rx-handoff` | Refill-specific eligibility API |
| `skipInventoryHold`; unique `Order.dispenseEventId` | Linking handoff to `RefillRequest` id |
| Idempotent `RxCommerceHandoff` | — |
| ED-R5D-01 Option B (no second PICK at Order) | — |

**Anchors:** `rx-handoff.service.ts` · Book [118](118_R5_D_ORDER_FROM_RX_IMPLEMENTATION.md)

### 1.5 Commerce 1C–1G — **IMPLEMENTED (sandbox)**

| Phase | Reuse for R5-E |
|-------|----------------|
| **1C** | New cart/session/quote freeze per refill cycle |
| **1D** | New `PaymentIntent`; CAPTURED / permitted AUTHORIZED_COD only → Order |
| **1E** | New Order; unique payment + unique dispense event |
| **1F** | Mock shipment from Order |
| **1G** | Facts only from this cycle’s events; NULL = UNKNOWN |

**Code search confirmation:** zero `refill` / `subscription` / `refill_count` matches in `apps/api` or Prisma schema. **R5-E is entirely unimplemented.**

### 1.6 What R5-E must reuse (do not clone)

| Kernel | Must reuse |
|--------|------------|
| R5-A | Sealed versions; amend = N+1 |
| R5-C | Dispense SM + `consumeForDispense` per **new** `DispenseEvent` |
| R5-D | Handoff + skip-hold Order path |
| 1C–1G | Cart, payment, order, logistics, finance |
| Support / notifications / outbox | Existing kernels only |
| Store Web + Store Mobile | Pharmacy desk surfaces |
| Customer Web + Mobile (Expo) | Refill UX parity |

---

## 2. Refill boundary (immutability)

A refill **never**:

- mutates a sealed `PrescriptionVersion` or its lines;
- mutates or “extends” a previous `Order`;
- reuses a previous `dispenseEventId` for a second Order;
- re-consumes inventory already PICK’d for a prior COMPLETE event;
- invents remaining quantity by rewriting clinical history.

| Object | Role in refill |
|--------|----------------|
| Prescription | Parent clinical case (status/expiry/ownership checks) |
| PrescriptionVersion | Immutable clinical SoT for **this** authorization window |
| Prior DispensingCase / DispenseEvent | Historical evidence only |
| Prior Order | Historical commercial evidence only |
| Refill eligibility | Computed server decision (audited) |
| RefillRequest / RepeatAuthorization | **New** ledger rows (planned) |
| New DispenseEvent | **New** clinical fill + inventory consume |
| New CheckoutQuote | **New** frozen commercial offer |
| New PaymentIntent | **New** payment fact |
| New Order | **New** fulfillment SoT |

---

## 3. OD-RX-REFILL — audit (do not silently resolve)

### 3.1 Canonical status ([35](35_OPEN_DECISIONS.md))

| Field | Value |
|-------|--------|
| **ID** | **OD-RX-REFILL** |
| **Question** | Auto-refill vs re-authorization |
| **Recommendation until decided** | Pharmacist/doctor re-authorize default; **unresolved** — R5-E **implementation** blocked for auto/subscription until decided |
| **Owner** | clinical + legal |

### 3.2 Product options and consequences

| Option | Meaning | Engineering consequence | Legal risk if assumed without pack |
|--------|---------|-------------------------|-------------------------------------|
| **A. Patient-requested refill** | Customer submits request only | Ticket/request → review queue; no auto dispense/order | Low if review mandatory |
| **B. Doctor-authorized refill** | Doctor must approve before new case | Doctor workflow + consent/relationship checks | Medium — licensing/country |
| **C. Prescription-level refill allowance** | Original Rx encodes N repeats | Remaining-count ledger; pack must define representation | Medium — controlled drugs often forbid |
| **D. Automatic refill / subscription** | Scheduler creates cycles | Subscription SM + payment retry + pause | **High** — do not assume permitted |
| **E. Fresh clinical review required** | New consult / amend before fill | May require new `PrescriptionVersion` or encounter | Medium — may be mandatory for some classes |

### 3.3 Engineering-safe default *(not law)*

**ED-R5E-01 (engineering recommendation until OD-RX-REFILL + pack):**

1. **Fail-closed:** refill feature **off** unless country pack explicitly enables.
2. **Default authorization model:** **request + clinical re-authorization** (doctor and/or pharmacist per pack) — aligned with OD-RX-REFILL recommendation.
3. **No auto-refill / no subscription scheduler** until a **separate** human decision + pack keys approve it.
4. Customer “Request refill” may exist as a **non-commercial** request only when pack enables request UX; it must **not** create Order/Payment by itself.

> **Human/legal decision remains separate.** ED-R5E-01 is scaffolding guidance only. Country packs and OD-RX-REFILL may forbid even request UX.

---

## 4. Eligibility (server-side, fail-closed)

Planned `RefillEligibilityService` checks (all server-authoritative):

| Check | Fail closed when |
|-------|------------------|
| Prescription status | DRAFT / CANCELLED / EXPIRED / not eligible terminal |
| Version validity | Outside `valid_from` / `valid_until` (or pack-equivalent) |
| Remaining / allowance | Missing when pack requires counts; or remaining ≤ 0 |
| Patient ownership | Caller ≠ patient |
| Doctor relationship / consent | Pack requires and relationship/consent missing or revoked |
| Country pack | `rx.refill.enabled` (name TBD) false/absent |
| Medication restrictions | Controlled / restricted class not allowed to repeat under pack |
| Prior dispense / order | No completed prior fill when pack requires prior DISPENSED; open duplicate refill in flight |
| Safety / unresolved clinical flags | Pack-defined blocks present |
| Idempotency / race | Concurrent request for same key already in progress |

**Unknown policy data ⇒ deny.** Never invent remaining quantity or “assume one free refill.”

---

## 5. No auto-diagnosis / no auto-Rx

Refill must **not** become:

- symptom triage or diagnosis;
- automatic prescribing of new molecules;
- silent clinical substitution;
- autonomous dose/regimen changes;
- OCR/AI-driven medication selection without human clinical authorization.

Commercial SKU selection for a refill cycle must follow **R5-C mapping rules** (OD-PHARM-09) on the **new** dispense — not rewrite the sealed clinical version.

---

## 6. Commercial flow (reuse R5-D → 1C–1G)

```
Eligible refill (+ required re-auth)
  → NEW R5-C dispense COMPLETE (new DispenseEvent + PICK)
  → R5-D handoff (patient-driven unless OD-DOC-10 later changes)
  → NEW frozen 1C quote
  → checkout
  → 1D server-confirmed payment (CAPTURED | permitted AUTHORIZED_COD)
  → NEW Order (unique payment_intent_id + unique dispense_event_id)
  → 1E fulfillment → 1F mock logistics → 1G sandbox facts
```

| Forbidden | Why |
|-----------|-----|
| Clone Order from prior Order | Immutability + wrong economics |
| Clone PaymentIntent | 1D integrity |
| Skip dispense and “reship old lot” | Inventory + clinical verification |
| Create Order from CREATED/PROCESSING/UNKNOWN/FAILED/redirect | 1D gate |

---

## 7. Inventory

### 7.1 Audit of consume-once (R5-C / R5-D)

| Step | Behavior today |
|------|----------------|
| R5-C COMPLETE | Hard `PICK` keyed by `dispenseEventId` |
| R5-D quote/Order | `skipInventoryHold` — **no** second PICK |
| `Order.dispenseEventId` | **@unique** — one Order per dispense event |

### 7.2 Refill rule

Every refill is a **new commercial transaction** and a **new clinical dispense event**:

- **New** inventory consume at the new COMPLETE;
- **Must not** reuse prior event’s consumption;
- Concurrent refill races: unique constraints on handoff key / dispense event / payment intent + idempotency records;
- Prevent negative available via existing inventory invariants;
- Non-Rx 1E path remains unchanged.

**Planned invariant ED-R5E-02:**  
`prior_dispense_event_id ≠ new_dispense_event_id` and Order B must not reference Event A’s consume.

---

## 8. Payment / idempotency

Reuse 1D:

| Rule | Detail |
|------|--------|
| New PaymentIntent per refill cycle | Never reuse prior intent |
| Idempotency boundary | `refill_request_id` + customer Idempotency-Key + payment occurrence keys |
| UNKNOWN / FAILED / PROCESSING / redirect | **Zero** Order |
| Retries | Converge to same PaymentIntent / same Order |
| Duplicate payment webhook | No second Order |

---

## 9. Subscription (optional, separately gated)

Automatic recurring refill is **not** assumed legally permitted.

If a future OD + pack enables it, plan a **separate** `RxSubscription` aggregate:

| Concern | Plan |
|---------|------|
| State | ACTIVE / PAUSED / CANCELLED / EXPIRED_BLOCKED / PAYMENT_FAILED |
| Schedule | Next attempt date; timezone from location/country |
| Pause / resume / cancel | Customer + admin permissioned; audit each transition |
| Failed payment | No Order; notify; backoff; no silent retry forever |
| Expired prescription | Block cycle; require re-auth / new version |
| Price changes | Re-quote each cycle; never reuse old quote economics |
| Consent | Explicit subscription consent artifact |
| Notifications | Reminder + failure + upcoming refill (outbox) |
| Max / review rules | Pack-defined caps; forced clinical review after N cycles |

**Do not** implement subscription under the first R5-E IMPL CR unless OD-RX-REFILL + pack explicitly authorize Option D. Prefer shipping **request + re-auth** first.

Commerce CRM “subscription hooks” (roadmap R12) are **non-clinical** and must not bypass OD-RX-REFILL.

---

## 10. Customer UI (web + mobile Expo)

| Step | Behavior |
|------|----------|
| Prescription detail | Clinical panel separate from refill panel |
| Eligibility | Server result; CTA hidden when disabled |
| Request refill | Creates `RefillRequest` only (if pack allows) |
| Medicine review | Show commercial mapping after new dispense / authorized mapping — no clinical instruction edit |
| Quote → checkout → pay → Order | Reuse R5-D / 1C–1E UX |
| Fulfillment / shipment | Existing order tracking |
| Subscription (if ever enabled) | Manage / pause / resume / cancel / next date |

Buffering: healthcare/medicine contextual loading; never hide errors behind buffering.

---

## 11. Doctor UI

| Mode | Behavior |
|------|----------|
| Read-only | Refill request status, history, linked Order ids (minimum necessary) |
| Fresh clinical authorization required | Separate workflow: approve / deny / require amend / require encounter — **not** cart/payment controls |
| Forbidden | Mutate payment, Order economics, inventory |

Mobile doctor: parity for read-only + approval actions if pack requires doctor re-auth.

---

## 12. Store UI

Reuse Store Web + Store Mobile pharmacy desk:

- New refill-originated `DispensingCase` in existing queue;
- Minimum necessary clinical lines for verify/map/complete;
- Link to commercial Order after patient handoff (as R5-D);
- No dedicated pharmacist app.

---

## 13. Admin

Company-permissioned oversight:

`refill request → eligibility outcome → re-auth → dispense → quote → payment → Order → shipment → finance refs`

No unrestricted PHI dump. Audit trail required.

---

## 14. Support

Reuse support kernel. Correlate ids only:

`refill_request_id → prescription_id → dispensing_case_id → order_id → payment_intent_id → shipment_id`

Do not duplicate clinical records into tickets.

---

## 15. Notifications

Reuse outbox + notification kernel. Planned contracts (names indicative):

| Event | Purpose |
|-------|---------|
| `REFILL_REQUESTED` | Request created |
| `REFILL_APPROVED` / `REFILL_REJECTED` | Re-auth outcome |
| `REFILL_ELIGIBILITY_DENIED` | Fail-closed reason code (safe copy) |
| `REFILL_STATUS_CHANGED` | Generic status (already named in Book 111) |
| Subscription reminders *(if enabled)* | Upcoming / failed / paused |

No second notification system. No PHI in push bodies beyond minimum necessary.

---

## 16. Finance

Reuse 1G. Each actual refill Order produces its **own** supported facts from real events.

Do **not** invent:

- recurring revenue recognition without events;
- profit, vendor payable, tax, freight, gateway fees;
- “subscription MRR” as ledger truth.

NULL remains NULL / UNKNOWN.

---

## 17. MNC / country

- No India / INR / GST hardcoding.
- Country packs control: refill enablement, who re-authorizes, remaining-count rules, controlled classes, subscription (if ever), COD for refill Orders.
- Preserve hierarchy: region → country → legal entity → BU → organization → location.
- Client-supplied tenant headers remain non-authoritative.

---

## 18. Security / RLS

| Actor | Scope |
|-------|--------|
| Customer | Own refill/prescription/order/payment |
| Doctor | Relationship + consent + policy |
| Store | Organization / location desk |
| Vendor | Own seller catalog/orders only |
| Admin | Permissioned company governance |

Preserve Person isolation, GUC/RLS, and existing tenancy tests as regression gates.

---

## 19. Mobile topology

- Customer + Store: React Native + Expo (Android **and** iOS), parity with web.
- **No** dedicated pharmacist app.
- **No** generic Partner App.
- **No** affiliate mobile for refill.

---

## 20. Audit / history

Every refill request, approval, rejection, cancellation, eligibility decision, and commercial handoff must be auditable (append-only events / history rows).

Old prescription versions and old Orders remain immutable forever.

---

## 21. Test plan (future IMPL CR)

| Area | Cases |
|------|--------|
| Eligibility | eligible; expired; cancelled; unauthorized patient; doctor/consent failure; pack disabled; medication restriction |
| Concurrency | concurrent refill requests; duplicate refill request; duplicate payment event |
| Payment | UNKNOWN → 0 Order; FAILED → 0 Order; new PaymentIntent per refill; new Order per refill |
| Inventory | consume-once on **new** dispense; prior dispense not consumed again; no negative stock |
| Isolation | RLS; customer/store/doctor/admin |
| Subscription *(if enabled)* | pause/resume/cancel; expired Rx mid-subscription; failed recurring payment; price change between cycles |
| Clinical safety | audit immutability; no auto-diagnosis; no auto-Rx; no silent substitution |
| Regression | R0–R4; R5-A/B/C/D green |

---

## 22. Open decisions

### 22.1 Preserve (do not silently resolve)

| ID | Status |
|----|--------|
| **OD-RX-REFILL** | Unresolved — blocks auto-refill / subscription; gates R5-E IMPL product shape |
| **OD-DOC-10** | Still open historically; R5-D shipped patient-driven — refill handoff should follow same unless re-decided |
| **E-R5B-01** | Catalog hint vs clinical-concept-only (engineering) |
| **OD-PHARM-04** | Still-verify default — refill desk must not skip verify unless pack + OD say so |
| **OD-PHARM-09** | Substitution / customer accept rules on **new** map |

### 22.2 New R5-E decisions (separate lanes)

| ID | Lane | Question |
|----|------|----------|
| **OD-R5E-01** | Product + legal | Who may approve a refill request: doctor only / pharmacist only / either / pack matrix? |
| **OD-R5E-02** | Product + legal | Are remaining-repeat counts allowed on sealed Rx, or only via `RepeatAuthorization`? |
| **OD-R5E-03** | Legal | Controlled-substance repeats — always deny vs pack whitelist? |
| **OD-R5E-04** | Product + legal | Is subscription/recurring refill ever in-scope for sandbox? |
| **OD-R5E-05** | Product | After first DISPENSED, Rx status model for multi-fill (`PARTIALLY_REPEATABLE` vs keep `ISSUED` + ledger)? |
| **ED-R5E-01** | Engineering | Fail-closed + request/re-auth default (this book) |
| **ED-R5E-02** | Engineering | New `DispenseEvent` mandatory per refill Order |
| **ED-R5E-03** | Engineering | Subscription aggregate isolated from Order factory |

| Lane | Owners |
|------|--------|
| Engineering | Platform |
| Product | Product + pharmacy ops |
| Legal / compliance | Clinical counsel + country counsel |
| Human governance | Change board / CR authorization |

---

## 23. Proposed aggregates / APIs *(plan only — not authorized)*

Indicative names for a future IMPL CR:

| Aggregate | Purpose |
|-----------|---------|
| `RefillRequest` | Customer/doctor/pharmacist request + status history |
| `RepeatAuthorization` | Pack-gated remaining / approval artifact |
| `RxSubscription` | Optional schedule (only if OD-R5E-04 allows) |

| API (indicative) | Role |
|------------------|------|
| `GET …/prescriptions/:id/refill-eligibility` | Fail-closed eligibility |
| `POST …/refill-requests` | Create request (Idempotency-Key) |
| `POST …/refill-requests/:id/approve\|reject` | Re-auth actors |
| Then | Existing R5-C desk + R5-D handoff + 1C–1G |

---

## 24. Implementation gate (future)

A future **CR-R5-E-IMPL-*** may proceed only when:

1. This plan is accepted (**R5_E_PLAN_READY**);
2. **OD-RX-REFILL** (and needed OD-R5E-*) have human decisions **or** IMPL explicitly ships **fail-closed request/re-auth only** with auto-refill **off**;
3. Country pack keys defined;
4. No live PSP/DHL/payouts in scope;
5. R5-A/B/C/D regression suite remains green.

---

## 25. Explicit non-starts

| Item | Status |
|------|--------|
| R5-E production code | **NOT STARTED** |
| Prisma migrations for refill/subscription | **NOT STARTED** |
| Auto-refill / subscription scheduler | **NOT STARTED** |
| Live PSP / DHL / payouts | **NOT STARTED** |
| R5-F live e-Rx | **NOT STARTED** |
| R6 | **NOT STARTED** |

---

## 26. Final status

**R5_E_PLAN_READY**

STOP. Do not implement R5-E. Do not start R6.
