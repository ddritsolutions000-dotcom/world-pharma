# 08 — Doctor Platform

**Status:** Blueprint  
**Audience:** Product, architecture, care engineering, operations, compliance, doctor-app clients  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business Architecture](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application Architecture](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Pharmacy / Rx](06_PHARMACY_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Payments](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Health Record](16_HEALTH_RECORD.md) · [Globalization](18_GLOBALIZATION.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Notifications](23_NOTIFICATION_ARCHITECTURE.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Infrastructure](29_INFRASTRUCTURE_ARCHITECTURE.md) · [Open Decisions](35_OPEN_DECISIONS.md) · **R5 plan** [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · **R5-B UX** [113](113_R5_B_PRESCRIBING_UX_PLAN.md) · **R5-C dispense** [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) · [116](116_R5_C_PHARMACY_DISPENSING_IMPLEMENTATION.md) · **R5-D Order-from-Rx plan** [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md)

**Requirement IDs:** REQ-DOC, REQ-VID, REQ-RX (digital), REQ-EHR (consented), REQ-NOT

---

## 1. Purpose

The Doctor Platform is the **care bounded context**: professional onboarding (**via** [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) `PartnerType=DOCTOR`), discovery inputs, calendar, appointments, encounters, real-time consult (video / audio / chat), consented access to health artifacts, digital prescription, follow-up, earnings, and reputation.

It does **not** own the WebRTC media plane (LiveKit), payment capture, ledger posting, or the health-record store. It **orchestrates** those kernels.

**Principle:** Clinical accountability stays with the licensed professional. The platform provides workflow, audit, and policy gates. It does not diagnose.

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any country enables telemedicine, e-prescription, advertising of clinical services, fee-splitting, or cross-border consults. This document does not invent those rules.

---

## 2. Scope

### 2.1 In

| Area | Meaning |
| --- | --- |
| Professional party | Doctor person, optional clinic org, locations of practice (virtual and/or physical as policy allows) |
| Onboarding | KYC, qualification, license, specialization, languages, profile completeness |
| Commercial care offer | Consult products (video, audio, chat), fees, currency, tax class |
| Calendar | Availability rules, blocks, generated slots, optimistic locking |
| Appointment | Booking, queue, waiting room (product), no-show hooks |
| Encounter | Clinical session record, notes, timer, completion |
| Media orchestration | Video session metadata, tokens, quality, consent, recording **flag** |
| Chat | Platform-persisted consult chat (source of truth) |
| Consented history | Read path to health artifacts via `ConsentGrant` only |
| Digital Rx | Structured prescription as encounter output → health artifact |
| Follow-up | Policy-bound window and/or paid follow-up booking |
| Earnings | Earning lines → settlement (ledger owns money movement) |
| Reviews | Patient ratings after eligible encounters |
| Notifications | Triggers only; templates in notification module |

### 2.2 Out

| Item | Owner |
| --- | --- |
| Unrestricted EHR browse | Forbidden. See §12 and [16_HEALTH_RECORD.md](16_HEALTH_RECORD.md) |
| Media SFU implementation | LiveKit. See §11 |
| Pharmacy dispense | [06_PHARMACY_PLATFORM.md](06_PHARMACY_PLATFORM.md) |
| Lab processing | [09_LAB_PLATFORM.md](09_LAB_PLATFORM.md) |
| Customer discovery UX screens | [05_CUSTOMER_PLATFORM.md](05_CUSTOMER_PLATFORM.md), [25_UI_UX_ARCHITECTURE.md](25_UI_UX_ARCHITECTURE.md) |
| Gateway charging | [12_PAYMENT_PLATFORM.md](12_PAYMENT_PLATFORM.md) |
| Hospital HIS replacement | Scope out ([01_PRODUCT_VISION.md](01_PRODUCT_VISION.md)) |

---

## 3. Applications

| App ID | Surface | Users | Primary jobs |
| --- | --- | --- | --- |
| APP-DOC (mobile) | React Native Android/iOS | `doctor` | Queue, join consult, notes, Rx, earnings, notifications |
| APP-DOC (web) | Next.js partner web | `doctor`, `clinic_admin` | Calendar density, profile, roster, reports, KYC upload |
| APP-CUS-* | Customer RN + web | `customer` | Discovery, book, waiting room, consult, Rx, follow-up |
| APP-ADM | Admin shells | `country_admin`, `operations`, `medical_reviewer`, `compliance_officer` | KYC queues, incidents, policy flags |

**ASSUMPTION (A-DOC-01):** One doctor RN flavor plus web for dense workflows, sharing the partner-web design system ([04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md) §5).

Auth: professional email + password, **MFA required**. No social login. JWT `aud` = doctor client family. See [03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §7 and [27_SECURITY_ARCHITECTURE.md](27_SECURITY_ARCHITECTURE.md).

**RISK:** A doctor using the customer app must not inherit `encounter:write` from a customer token. Membership selection and audience separation are mandatory.

---

## 4. Domain objects

Money fields are always `{ amount, currency }` in the booking’s country currency. Never assume a default country or currency.

| Object | Module | Responsibility |
| --- | --- | --- |
| `DoctorProfile` | care | Public and private professional profile |
| `DoctorLicense` | care + compliance | License credential, issuer code from **country pack**, expiry, verification status |
| `DoctorQualification` | care | Degree/training documents and verification status |
| `DoctorSpecialization` | care | Link to platform specialization taxonomy (not free-text only) |
| `DoctorLanguage` | care | BCP-47 language tags the doctor will consult in |
| `FeeSchedule` | care | Consult type → price + tax class + valid-from |
| `AvailabilityRule` | care | Recurring weekly windows, timezone of doctor, consult duration, buffer |
| `CalendarBlock` | care | Time-off, already-booked occupancy |
| `Slot` | care | Bookable instant; generated or materialized |
| `Appointment` | care | Commercial + scheduling unit (a `Booking`) |
| `Encounter` | care | Clinical session for an appointment |
| `ConsultNote` | care | Structured/unstructured note; health artifact on complete |
| `DigitalPrescription` | prescription | Structured Rx; signed artifact |
| `LabRecommendation` | care | Non-binding suggestion to book tests; does not accession samples |
| `VideoSession` | video | Media session metadata, consent, recording flag, quality summary |
| `ChatThread` / `ChatMessage` | care (chat) | Source of truth for consult messaging |
| `ConsentGrant` | health | Read gate for artifacts; **not** owned by care |
| `DoctorReview` | care | Rating + optional comment after eligible complete |
| `DoctorEarningLine` | care (emits) | Accrual intent; ledger posts |
| `KycCase` | party | Shared KYC case machine ([19_COMPLIANCE_FRAMEWORK.md](19_COMPLIANCE_FRAMEWORK.md)) |

### 4.1 DoctorProfile (fields)

| Field | Notes |
| --- | --- |
| `doctor_id` / `user_id` | Person |
| `organization_id` | Optional clinic |
| `country_id` | **Primary practice country** for licensing and telemedicine policy |
| `display_name` | Public |
| `bio` | CMS-safe text; medical claims **LEGAL REVIEW** for advertising rules |
| `photo_object_id` | KYC-checked |
| `gender_identity` / `pronouns` | Optional; customer filters **OPEN DECISION** OD-DOC-14 |
| `years_of_practice` | Declared; not a license substitute |
| `status` | See §5 |
| `languages[]` | BCP-47 |
| `specialization_ids[]` | Taxonomy |
| `consult_types[]` | `VIDEO`, `AUDIO`, `CHAT` as enabled by country pack |
| `default_duration_minutes` | Per consult type |
| `timezone` | IANA |
| `search_rank_signals` | Fill rate, on-time, rating aggregate — not a clinical quality claim |

**ASSUMPTION (A-DOC-02):** A doctor may later add **additional licensed countries** as extra `DoctorLicense` rows. Discovery and booking are always scoped to the **customer’s selected country** and that country’s telemedicine policy. Cross-border consult is blocked until policy explicitly allows it.

**OPEN DECISION (OD-DOC-06):** Whether one profile can be simultaneously `ACTIVE` in multiple countries, or a doctor maintains country-scoped profiles.

---

## 5. Onboarding and verification

### 5.1 Professional status machine

| State | Meaning |
| --- | --- |
| `DRAFT` | Started profile; not discoverable |
| `SUBMITTED` | Package submitted |
| `KYC_IN_REVIEW` | Identity/KYC case open |
| `QUALIFICATION_IN_REVIEW` | Education/training review |
| `LICENSE_IN_REVIEW` | License review |
| `NEEDS_RESUBMISSION` | Reviewer requested more evidence |
| `APPROVED` | Eligible to go live when fee + calendar complete |
| `ACTIVE` | Discoverable (if catalog publish rules pass) |
| `SUSPENDED` | Ops/compliance hold |
| `LICENSE_EXPIRED` | Auto or reviewer; not bookable |
| `REJECTED` | Terminal for this application; new application policy applies |
| `WITHDRAWN` | Doctor abandoned onboarding |

Happy path: `DRAFT` → `SUBMITTED` → `KYC_IN_REVIEW` → `QUALIFICATION_IN_REVIEW` → `LICENSE_IN_REVIEW` → `APPROVED` → `ACTIVE`.

Reviews may run in parallel **OPEN DECISION (OD-DOC-15)**. If parallel, `APPROVED` requires **all** of KYC, qualification, and license = verified.

**OPEN DECISION (OD-DOC-03 / OD-RBAC-01):** Dual control for doctor KYC approve. Default recommendation: two distinct reviewers for license approve in production; single reviewer allowed only in `dev`/`staging`.

### 5.2 KYC

Uses the shared `KycCase` ([19_COMPLIANCE_FRAMEWORK.md](19_COMPLIANCE_FRAMEWORK.md)):

- Government ID types are **country-pack enumerations**, not hardcoded.
- Selfie / liveness: country-pack + vendor adapter.
- Address proof: if required by pack.
- Sanctions/PEP screening: optional adapter; do not invent local AML law.

**SoD:** Submitter cannot approve. See [03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §10.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** What identity documents are lawful to collect and retain per country; retention clocks.

### 5.3 Qualification verification

| Step | Actor | Guard |
| --- | --- | --- |
| Upload certificates | doctor | Object store virus scan; MIME allow-list |
| Classify document type | doctor + reviewer | Types from country pack (degree, residency, board — **names not hardcoded**) |
| Review | `country_admin` or `medical_reviewer` | Original vs scan quality; not a legal credential by itself |
| Mark verified / reject | reviewer | Reason codes; doctor notified |

**ASSUMPTION (A-DOC-03):** Qualification verification is a **platform trust process**, not a substitute for statutory licensing.

### 5.4 License verification

| Field | Source |
| --- | --- |
| `country_id` | Booking country must match a verified license unless pack allows otherwise (**default: must match**) |
| `issuer_code` | Country pack registry of recognized issuers |
| `license_number` | Stored encrypted at rest; display masked |
| `valid_from` / `valid_to` | Required if issuer provides dates |
| `scope` | e.g. telemedicine allowed flag **only after legal encodes it** |
| `verification_method` | `MANUAL`, `REGISTRY_API` (adapter), `ATTESTATION` |
| `status` | `UNVERIFIED`, `VERIFIED`, `EXPIRED`, `REVOKED`, `SUSPENDED` |

Nightly job: licenses approaching expiry → notify; on `valid_to` pass → `LICENSE_EXPIRED` → appointments in the future auto-move per cancellation policy.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Whether the platform may display the doctor as “licensed” and what wording is allowed. Do not claim government endorsement.

**RISK:** Treating a scanned card as sufficient proof. Mitigation: country pack can require registry API or dual review.

### 5.5 Specialization and taxonomy

- Global specialization catalog with country enablement (some specialties may be undisplayable or restricted).
- Doctor selects from taxonomy; free-text “headline specialty” is optional marketing copy and **must not** bypass taxonomy filters.
- **LEGAL/COMPLIANCE REVIEW REQUIRED:** Protected titles (who may call themselves a given specialist).

### 5.6 Profile completeness gate (ACTIVE)

All must be true:

1. `DoctorProfile.status = APPROVED` or already `ACTIVE`
2. At least one `VERIFIED` license for the target country
3. At least one language
4. At least one enabled consult type with `FeeSchedule` in that country’s currency
5. Availability rules covering a configurable horizon **or** instant-queue enabled (OD-DOC-01)
6. Payout payout method KYC-complete (settlement blocked otherwise, but booking **OPEN DECISION (OD-DOC-16)** whether to allow book-without-payout-profile)

---

## 6. Languages, fees, and consult products

### 6.1 Languages

- Stored as BCP-47 (`ar`, `en`, `sw`, …).
- Customer discovery filters **intersection** of customer UI language preference (soft) and doctor consult languages (hard filter when customer sets “consult in”).
- Interpreter / third party on the call: **OPEN DECISION (OD-VID-03)** participant cap; default consult is **doctor + patient only** until policy allows caregiver or interpreter.

### 6.2 Consultation fee

| Dimension | Rule |
| --- | --- |
| Currency | Country of booking; no implicit conversion in the fee table |
| Consult type | Separate rows for `VIDEO`, `AUDIO`, `CHAT` |
| Duration | Price is for `default_duration_minutes`; overtime policy **OPEN DECISION (OD-DOC-17)** |
| Tax | Tax class from country pack; care does not invent VAT/GST rates |
| Promo | Checkout promotions; doctor net calculated after platform fee |
| Platform take | See OD-DOC-04 |

**OPEN DECISION (OD-DOC-04):** Doctor commercial model: percentage take-rate, flat per consult, subscription/SaaS, or hybrid. Must be country-gated because **LEGAL/COMPLIANCE REVIEW REQUIRED** on fee-splitting and inducement.

**OPEN DECISION (OD-DOC-07):** Whether `clinic_admin` can set or override employed doctors’ public fees.

### 6.3 Follow-up product

**OPEN DECISION (OD-DOC-05):** Follow-up included in original fee for N days vs always a new paid booking.

Until decided, implement **data model support for both**: `FollowUpPolicy` on `FeeSchedule` (`included_hours`, `max_included_sessions`, `channel_allowed`). Policy pack default = **no included follow-up** (safer commercially) until product sets otherwise.

---

## 7. Availability, calendar, and slots

### 7.1 Model

| Concept | Behavior |
| --- | --- |
| `AvailabilityRule` | Weekly recurrence in doctor timezone; converted to country/customer display TZ at read |
| `CalendarBlock` | Vacation, personal, admin holds |
| `Slot` | Materialized bookable unit of `duration + buffer` |
| Generation | Job generates slots for horizon H days (**OPEN DECISION OD-DOC-18**, recommend 14–28 days) |
| Booking | `SELECT … FOR UPDATE` or version column on `Slot`; never double-sell |

**ASSUMPTION (A-DOC-04):** v1 slots are **doctor-local** (one doctor calendar). Clinic multi-resource rooms are later.

### 7.2 Slot lifecycle

`OPEN` → `HELD` (checkout TTL) → `BOOKED` | `RELEASED` (TTL expiry or abandon) | `BLOCKED`.

Hold TTL aligns with payment intent expiry ([12_PAYMENT_PLATFORM.md](12_PAYMENT_PLATFORM.md)).

### 7.3 Instant / queue consults

**OPEN DECISION (OD-DOC-01):** Whether v1 includes **instant consult** (doctor online + queue) in addition to slotted appointments.

If enabled later: doctor `presence = ONLINE` + `accepting_instant`; customer joins `ConsultQueue`; match is not a `Slot` steal. Appointment is created as `CONFIRMED` with `scheduling_mode = INSTANT`.

---

## 8. Appointment and encounter state machines

Appointment is the **Booking** (commercial + schedule). Encounter is the **clinical session**. VideoSession is the **media** object. They are 1:1:1 in v1 **ASSUMPTION (A-DOC-05)** (one encounter per appointment; reschedule creates a new appointment).

### 8.1 Appointment states

| State | Customer-visible label (directional) |
| --- | --- |
| `DRAFT` | Slot chosen, not committed |
| `PAYMENT_PENDING` | Intent created |
| `CONFIRMED` | Paid or policy-allowed zero-price / org-paid |
| `REMINDER_SENT` | Optional sub-flag, not required as state |
| `PATIENT_IN_WAITING_ROOM` | Patient joined product waiting room |
| `IN_PROGRESS` | Encounter active |
| `COMPLETED` | Encounter completed |
| `CANCELLED_BY_PATIENT` | |
| `CANCELLED_BY_DOCTOR` | |
| `CANCELLED_BY_SYSTEM` | Policy, license, fraud, payment reverse |
| `EXPIRED` | Hold / unpaid timeout |
| `NO_SHOW_PATIENT` | |
| `NO_SHOW_DOCTOR` | |
| `RESCHEDULED` | Terminal; successor appointment id set |

### 8.2 Appointment transitions

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `DRAFT` | `PAYMENT_PENDING` | customer | checkout started | slot `HELD`; doctor `ACTIVE`; country teleconsult enabled; license valid |
| `DRAFT` | `EXPIRED` | system | hold TTL | unpaid |
| `PAYMENT_PENDING` | `CONFIRMED` | payment | capture/authorize success | slot still held; idempotent |
| `PAYMENT_PENDING` | `EXPIRED` | system | intent fail/timeout | release slot; no charge |
| `PAYMENT_PENDING` | `CANCELLED_BY_PATIENT` | customer | abandon | before capture |
| `CONFIRMED` | `PATIENT_IN_WAITING_ROOM` | patient | enter waiting room | within join window (policy); identity step if required (OD-DOC-12) |
| `CONFIRMED` | `IN_PROGRESS` | doctor or system | doctor admits / both connected | waiting room optional if doctor admits from queue without patient pre-join |
| `PATIENT_IN_WAITING_ROOM` | `IN_PROGRESS` | doctor | admit | doctor membership on this appointment |
| `IN_PROGRESS` | `COMPLETED` | doctor | complete encounter | timer/min duration policy (OD-DOC-17); required note fields per pack |
| `CONFIRMED` | `CANCELLED_BY_PATIENT` | customer | cancel | cancellation cutoff **OPEN DECISION OD-DOC-02** |
| `CONFIRMED` | `CANCELLED_BY_DOCTOR` | doctor / clinic_admin | cancel | reason code required; patient rebook offer; refund policy |
| `CONFIRMED` | `CANCELLED_BY_SYSTEM` | system / ops | license lapse, fraud, outage | reason; notify; refund path |
| `CONFIRMED` | `NO_SHOW_PATIENT` | system / doctor | no-show mark | **OD-DOC-02** grace minutes elapsed; doctor present |
| `CONFIRMED` / `PATIENT_IN_WAITING_ROOM` | `NO_SHOW_DOCTOR` | system / patient / ops | no-show mark | **OD-DOC-02** grace; patient present |
| `IN_PROGRESS` | `CANCELLED_BY_SYSTEM` | system | safety abort | rare; clinical note preserved |
| `CONFIRMED` | `RESCHEDULED` | customer or doctor | reschedule | policy window; new appointment `CONFIRMED` or `PAYMENT_PENDING` for fee delta |
| `COMPLETED` | — | — | terminal | amendments via encounter addendum, not state rewind |

Zero-price / org-paid bookings skip capture but still pass a `PaymentIntent` of amount 0 or `funding_source = ORGANIZATION` so ledger stays consistent.

### 8.3 Encounter states

| State | Meaning |
| --- | --- |
| `CREATED` | Opened when appointment confirms (or on first join — **ASSUMPTION: on confirm**) |
| `WAITING` | Waiting room occupied and/or doctor not admitted |
| `IN_CONSULT` | Clinical time running |
| `COMPLETED` | Doctor completed; artifacts finalized |
| `INCOMPLETE` | Ended without clinical completion (disconnect, dual no-show mid-call) |
| `VOID` | Never started; appointment cancelled/no-show |

| From | To | Actor | Event | Guards |
| --- | --- | --- | --- | --- |
| `CREATED` | `WAITING` | patient | waiting room join | appointment join window |
| `CREATED` or `WAITING` | `IN_CONSULT` | doctor | admit + media or chat-only start | `video:join` / chat participants |
| `IN_CONSULT` | `COMPLETED` | doctor | complete | see appointment complete guards |
| `IN_CONSULT` | `INCOMPLETE` | system | both disconnected beyond reconnect limit; or explicit abort | chat still readable |
| `WAITING` | `VOID` | system | appointment no-show/cancel | |
| `CREATED` | `VOID` | system | never joined | |

**ASSUMPTION (A-DOC-06):** Chat-only consults still create Encounter + timer. VideoSession may be absent if consult_type = `CHAT`. Whether chat-only is a paid SKU in v1 is **OD-DOC-08**.

### 8.4 No-show policy

**OPEN DECISION (OD-DOC-02):** No-show policies. Must be decided per country pack, not in code constants. Dimensions to configure (do not ship invented legal penalties):

| Lever | Options to decide |
| --- | --- |
| Patient grace minutes after slot start | e.g. none / 5 / 10 — **not preset as law** |
| Doctor grace minutes | |
| Patient no-show fee vs forfeit vs full refund | Legal + commercial |
| Doctor no-show | Full refund + voucher + doctor penalty / suspension threshold |
| Who may mark no-show | doctor, patient (request), system auto, ops override |
| Evidence | waiting-room join logs, presence, chat pings |
| Repeat offender | booking throttle |

Until OD-DOC-02 is closed: implement **state + reason codes + policy engine hooks** with a conservative technical default: **no automatic financial penalty**; only state transition + ops review queue. Auto-refund of unused consults can be enabled per pack without a penalty.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Consumer cancellation rights, cooling-off, and professional no-show fees.

---

## 9. Queue and waiting room (product)

Distinct from LiveKit rooms.

| Component | Behavior |
| --- | --- |
| Doctor queue | `CONFIRMED` appointments in join window, sorted by slot start, with presence badges |
| Patient waiting room | Pre-admit UX: device check, policy notices, recording consent **prompt if and only if recording is even eligible** (§11.6), chat available |
| Admit | Doctor admits one patient; others remain waiting |
| Late join | Allowed until complete; after complete, new media join denied |

Device check: camera/mic permissions, speaker test. Failure of video does not block **audio** or **chat** if those types are in the appointment.

---

## 10. Chat (source of truth)

**Decision (from [04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md) §8):** Platform chat is the source of truth and **must survive video disconnect**.

| Rule | Detail |
| --- | --- |
| Persistence | `ChatMessage` in OLTP; not LiveKit data-channel-only |
| Transport | API + WebSocket; clients may **also** send via data channel as echo, then reconcile by `client_message_id` |
| Participants | Appointment patient (and caregiver if OD-VID-03 allows), doctor; system actor for notices |
| Attachments | Images/PDFs as objects; malware scan; become health artifacts only if classified so with consent |
| Retention | **OPEN DECISION (OD-VID-05)**; country pack; clinical vs convenience chat may differ |
| After consult | Thread read-only except follow-up policy (OD-DOC-05) |
| Support | Support **does not** read clinical chat by default ([03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) OD-RBAC-02 analog) |

System messages (not doctor opinions): join, leave, reconnect, timer start/pause, “recording not active”, consent declined, consult completed.

---

## 11. Video architecture

**Media plane:** WebRTC via **LiveKit SFU**. World Pharma does **not** build an SFU.

**Recording is not a default.** Recording is **country-configurable AND consent-required**. Absence of a legal opinion means recording stays **off**.

### 11.1 Components

```
 Doctor RN/Web ──┐                      ┌──────────── LiveKit SFU ────────────┐
 Patient RN/Web ─┼── HTTPS API tokens ──┤  Signaling WS (SDP/ICE)              │
                 │                      │  Media (RTP) via SFU, not P2P mesh   │
                 │                      │  TURN/ICE for restricted NAT          │
                 │                      └───────────────┬──────────────────────┘
                 │                                      │ optional Egress
                 │                                      ▼
                 │                         Object store (only if recording
                 │                         legally allowed AND consented)
                 │
                 └── Platform Chat WS/API (SoT) ── PostgreSQL
                 └── Video module: VideoSession, tokens, consent, audit, quality
```

| Piece | Responsibility |
| --- | --- |
| Care module | Appointment/encounter lifecycle; requests session |
| Video module | `VideoSession` row, LiveKit room name, token mint, recording eligibility computation, quality ingest, audit |
| LiveKit | Signaling, SFU routing, optional egress |
| TURN | ICE relay when host/srflx fails |
| Token service | Short-lived credentials; **server** sets `canPublish`, `canSubscribe`, `hidden`, room join. Clients cannot self-grant recording |

**OPEN DECISION (OD-VID-01):** LiveKit Cloud vs self-hosted vs hybrid. Clients must not care. Adapter interface is mandatory ([04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md) §9).

### 11.2 Signaling

1. Client calls World Pharma `video:join` with `appointment_id`.
2. Server authorizes: role is participant; appointment in join window; encounter not `COMPLETED`/`VOID`.
3. Server ensures LiveKit room exists (room name = `VideoSession.id`, not patient name).
4. Server mints LiveKit JWT: `identity = user_id`, `name` = display display-safe, metadata **must not** include clinical payload.
5. Client connects to LiveKit **signaling** endpoint (WSS), publishes/subscribes per grants.
6. SDP/ICE is LiveKit’s protocol. World Pharma does not implement a second signaling server.

Waiting-room media policy: **recommend platform waiting room first** (no publish). On admit, re-mint token with `canPublish=true` or move participant to the consult room. **Do not** put waiting patients in the same live room as an in-progress other patient.

### 11.3 SFU

- All consult media is **SFU-routed** (scalability, recording egress, moderation, consistent NAT behavior).
- Simulcast / SVC as supported by the LiveKit SDK on RN and web.
- Doctor and patient typically send one video + one audio track. Screenshare is **OPEN DECISION (OD-VID-04)** and off until enabled per country (clinical images via chat upload are the v1 default for documents).

### 11.4 TURN and connectivity

- ICE servers include STUN + TURN from the LiveKit deployment.
- Force relay **only** as a country/network policy escape hatch (quality cost).
- Join timeout and ICE failure → UI offers **audio-only** then **chat-only**; appointment remains valid.
- **OPEN DECISION (OD-VID-07):** PSTN / phone-bridge fallback. Default v1: **no PSTN** until a licensed provider adapter exists.

### 11.5 Quality, adaptation, reconnection

| Signal | Use |
| --- | --- |
| SDK network quality | Shown to both parties; stored as `NetworkQualitySample` (interval, not raw RTP dump) |
| Packet loss / RTT / jitter | Pause camera (keep audio), then audio bitrate drop |
| Server consult timer | Continues during `RECONNECTING` unless policy pauses (**OPEN DECISION OD-VID-08**) |
| Reconnection | LiveKit SDK reconnect; `VideoSession.connection_state = RECONNECTING`; chat unaffected |
| Give-up | After N minutes **OPEN DECISION (OD-VID-09)** mark encounter `INCOMPLETE` unless doctor completes via chat |

Video join directional target: p95 < 5 s on good networks ([04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md) §11).

### 11.6 Recording flag and consent (mandatory)

| Layer | Rule |
| --- | --- |
| Country Policy Pack | `video.recording.allowed` boolean. **Default `false`.** |
| Feature flag | Runtime flag cannot override pack `false` |
| Session flag | `VideoSession.recording_requested` (never on by default) |
| Consent | Separate `RecordingConsent` per participant: `PENDING` / `GRANTED` / `DENIED` / `NOT_APPLICABLE` |
| Enable egress | **All** of: pack allows AND every required participant `GRANTED` AND server-side enable |
| Deny | Consult **continues without recording**. No coercion. |
| Chat notice | System message: recording is off, or on, as actual state |
| Storage | Egress to country-residency object store only; retention **OD-VID-02** after legal sets a clock |
| Access | Not in doctor EHR dump; break-glass + purpose; retention clock |
| Support | Cannot download recordings by default |

**Do not assume video recording is lawful.** Many jurisdictions restrict clinical recording. Product copy must not promise recordings.

**LEGAL/COMPLIANCE REVIEW REQUIRED** per country: whether recording may be offered at all, who is the controller, retention, patient access, and deletion.

**RISK:** Client SDK “enable recording” without server checks. Mitigation: LiveKit API keys only on server; egress started only by video module.

### 11.7 Consult timer

- Server starts `timer_started_at` when encounter → `IN_CONSULT` (not when patient opens the app).
- Both UIs display server time (NTP-style via API heartbeat), not only client clocks.
- Overtime: warn at duration; **OD-DOC-17** whether extra fee, hard stop, or doctor discretion.
- Timer is an **audit field**, not a clinical quality metric by itself.

### 11.8 VideoSession states

| State | Meaning |
| --- | --- |
| `CREATED` | Room reserved |
| `WAITING_ROOM` | At least one party in product waiting room; media may be idle |
| `LIVE` | At least one media publisher in consult room |
| `RECONNECTING` | Last publisher attempting reconnect |
| `ENDED` | Clean end with encounter complete/incomplete |
| `FAILED` | Room/media failure; chat may still work |

Recording is **not** a state. It is `recording_state = OFF | PENDING_CONSENT | ACTIVE | FAILED`.

### 11.9 Session audit (minimum)

Immutable audit events (actor, appointment_id, session_id, timestamp, country_id):

- Token minted / revoked
- Waiting room enter/leave
- Admit / deny
- Media join / leave / reconnect start / reconnect success / reconnect fail
- Track mute (client-reported)
- Network quality summary rollup
- Recording consent presented / granted / denied
- Recording egress start/stop (if any)
- Encounter complete
- Chat message ids (body stored in chat store, not duplicated into generic audit if pack forbids)

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Whether session audit is part of the medical record.

---

## 12. Secure doctor–patient data access

Doctors **do not** receive unrestricted EHR access.

### 12.1 What a doctor can always see (appointment-scoped)

Without a broad EHR grant, the treating doctor on **this** appointment may see:

- Patient display name, booking phone/email as provided for the consult, age/sex if patient shared for care
- This appointment’s chat, notes, Rx drafts they author
- Video quality is operational, not clinical history

**ASSUMPTION (A-DOC-07):** Work product of the current encounter is available to the assigned doctor as care delivery, still audited.

### 12.2 What requires ConsentGrant

Any of the following from **outside this encounter’s own work product**:

- Prior consult notes (including the same doctor’s past encounters — **OPEN DECISION (OD-DOC-19)** whether same-doctor history is exempt; **recommendation: still require grant or an explicit “continue care” grant at booking**)
- Uploaded prescriptions, pharmacy Rx images
- Lab reports, imaging PDFs
- Timeline search across artifacts
- Family member records

Server **reloads** `ConsentGrant` on every read. JWT must not be treated as proof of clinical access ([03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §8).

Grant conditions: `status = ACTIVE`, `grantee_id = this doctor` (or org if pack allows clinic grant — **OPEN DECISION OD-DOC-20**), `purpose` in allowed set (`treatment`, `follow_up`, `second_opinion`, …), time window, artifact scope (all vs listed ids).

Revoke is immediate for new reads. In-flight consult: doctor keeps current-encounter work product; prior artifacts disappear from UI on next fetch.

### 12.3 Customer booking-time consent

**ASSUMPTION (A-DOC-08):** Checkout can request a **narrow** grant: “this doctor, this appointment, purpose=treatment, duration = appointment + included follow-up window.” Pre-existing longitudinal record is **not** auto-shared.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Consent language, age of digital consent, caregiver grants (OD-RBAC-03).

### 12.4 Support, pharmacy, riders

Unchanged: no clinical payload. Pharmacists see Rx for verification, not the full EHR. See role matrix in [03_USER_ROLES_AND_PERMISSIONS.md](03_USER_ROLES_AND_PERMISSIONS.md) §5.

**RISK:** “View patient 360” screens on doctor web that call customer CRM APIs. Mitigation: separate DTOs; care 360 ≠ CRM 360.

---

## 13. Medical records, lab reports, and recommendations

| Flow | Behavior |
| --- | --- |
| Patient history UI | Artifact list from health module after grant check; typed cards (Rx, report, note) |
| Lab reports | Read-only; values not silently copied into notes without attribution |
| Request tests | `LabRecommendation` with test codes from catalog; patient books via J09 ([02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md)); doctor does not accession |
| Attach to encounter | References, not copies, unless snapshot required for legal record **LEGAL REVIEW** |

Doctors must not receive a dump of all platform lab results for a national ID search.

---

## 14. Digital prescription

Journey J07 ([02_BUSINESS_ARCHITECTURE.md](02_BUSINESS_ARCHITECTURE.md)).

| Step | Rule |
| --- | --- |
| Draft | During `IN_CONSULT` or shortly after complete within pack window |
| Structure | Drug identity (catalog or free-text with coding), strength, form, dose, route, frequency, duration, quantity, instructions, substitutions allowed flag |
| Country formulary | Warn on unmapped drugs; do not silently swap |
| Sign | Doctor authenticated step-up (MFA session fresh); signature payload hashed |
| Artifact | `HealthArtifact` type `PRESCRIPTION` for the patient |
| Pharmacy | Patient (or caregiver) initiates order J08; **OPEN DECISION (OD-DOC-10)** auto-route to pharmacy cart |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Whether electronic prescriptions are valid, required fields, controlled substances, and cross-border Rx. Unsigned drafts are not dispensable.

**OPEN DECISION (OD-DOC-10):** Auto-add Rx items to pharmacy cart vs patient-driven “Order medicines”. Canonical R5 handoff default until decided: **patient-driven** commercial step after dispensing authorization — see [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) §8 and [115](115_R5_C_PHARMACY_DISPENSING_PLAN.md) §7 (R5-D). Prescribing UX (without cart) is implemented in [114](114_R5_B_PRESCRIBING_UX_IMPLEMENTATION.md).

Failure modes: missing license for country, incomplete fields, unsigned draft, drug not in country catalog.

---

## 15. Follow-up

| Mode | After OD-DOC-05 |
| --- | --- |
| Included | Patient can reopen chat and/or book a follow-up slot without a new consult fee until window end |
| Paid | New appointment, possibly discounted `FeeSchedule` |
| Doctor-initiated | Doctor proposes slot; patient confirms and pays if required |

Follow-up still needs a valid license and country telemedicine flag.

---

## 16. Earnings and settlement

Journey J19.

| Event | Earning line |
| --- | --- |
| Encounter `COMPLETED` and not refunded | `DOCTOR_CONSULT_FEE` gross |
| Platform fee | Negative line or separate payable net |
| Tax withholding | Only if country pack defines it — **do not invent** |
| Refund / no-show | Reversal lines per OD-DOC-02 / payment policy |
| Payout | Settlement batch ([13_LEDGER_SETTLEMENT.md](13_LEDGER_SETTLEMENT.md)) |

Doctor app: earnings list, in-period totals, settlement status, invoices/receipts as legally required **after** finance templates exist.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Professional payment, invoicing, and fee-split.

Payout blocked if KYC/payout account incomplete.

---

## 17. Reviews

| Rule | Detail |
| --- | --- |
| Eligibility | Appointment `COMPLETED` (not no-show, not void) |
| Who | Patient rates doctor; **OPEN DECISION (OD-DOC-21)** whether doctors rate patients (default **no**) |
| Dimensions | Stars + optional tags (punctuality, communication) — not a diagnosis |
| Moderation | **OPEN DECISION (OD-DOC-09)** pre vs post moderation |
| Clinical content | Strip PHI from public display; reviews are marketing surface |
| Abuse | Report flow; country defamation **LEGAL REVIEW** |

Public profile shows aggregates only after minimum N reviews (config).

---

## 18. Notifications

Care emits intents; [23_NOTIFICATION_ARCHITECTURE.md](23_NOTIFICATION_ARCHITECTURE.md) sends.

| Trigger | Audience |
| --- | --- |
| KYC / license status | doctor |
| Slot booked / cancelled / rescheduled | both |
| Reminders | both; quiet hours per country pack |
| Waiting room | doctor |
| Chat message while backgrounded | other party |
| Earnings / payout | doctor |
| License expiry approaching | doctor, clinic_admin |
| Recording consent request | both — **only if recording eligible** |

Templates are i18n; no hardcoded market copy.

---

## 19. Country policy hooks (care / video)

| Key (illustrative) | Default technical value |
| --- | --- |
| `telemedicine.enabled` | false until legal sets true |
| `consult.types` | empty until enabled |
| `rx.electronic.enabled` | false |
| `video.recording.allowed` | **false** |
| `kyc.doctor.dual_control` | true recommended |
| `no_show.*` | unresolved OD-DOC-02 |
| `cross_border.consult` | false |

Launch country is TBD ([01_PRODUCT_VISION.md](01_PRODUCT_VISION.md) §8). **Do not hardcode a country.**

---

## 20. Domain events (outbound)

| Event | Typical consumers |
| --- | --- |
| `DoctorActivated` | search index |
| `AppointmentConfirmed` | notification, calendar, analytics |
| `AppointmentCancelled` | slot release, refund policy, search fill-rate |
| `EncounterCompleted` | earnings, reviews invite, health artifact publish |
| `PrescriptionSigned` | health, optional pharmacy mapping |
| `VideoSessionEnded` | analytics, audit rollup |
| `RecordingConsentDenied` | analytics (no clinical body) |

All events carry `country_id`, `actor_id`, `occurred_at`. Outbox required ([04_APPLICATION_ARCHITECTURE.md](04_APPLICATION_ARCHITECTURE.md)).

---

## 21. Traceability

| Journey | This doc |
| --- | --- |
| J05 book doctor | §7–8 |
| J06 video consult | §9–11 |
| J07 digital Rx | §14 |
| J08 order from Rx | pointer to 06 |
| J19 doctor settlement | §16 |

---

## 22. Open decisions (this document)

| ID | Question | Blocking? |
| --- | --- | --- |
| OD-DOC-01 | Instant queue consults in v1 vs slotted only | Product Phase 4 |
| OD-DOC-02 | No-show grace, fees, refunds, auto vs manual, evidence | **Yes** before paid consults |
| OD-DOC-03 | Dual control for doctor KYC/license (see OD-RBAC-01) | Launch |
| OD-DOC-04 | Take-rate vs SaaS vs hybrid | Commercial |
| OD-DOC-05 | Included follow-up window vs paid | Product |
| OD-DOC-06 | Multi-country active licenses on one profile | Before second country |
| OD-DOC-07 | Clinic admin fee override for employed doctors | Clinic org |
| OD-DOC-08 | Chat-only consult as a paid SKU vs video/audio only | Product |
| OD-DOC-09 | Review pre-moderation vs post | Public profiles |
| OD-DOC-10 | Auto-route digital Rx to pharmacy cart | After Rx |
| OD-DOC-11 | Employed vs independent payout split when a clinic org exists | Clinic org |
| OD-DOC-12 | Identity check at consult start (photo, ID, skip) | Country pack |
| OD-DOC-13 | Whether `clinic_admin` may cancel/reschedule without the doctor | Clinic org |
| OD-DOC-14 | Customer filter by doctor gender | Product + legal |
| OD-DOC-15 | Parallel vs sequential onboarding reviews | Ops |
| OD-DOC-16 | Allow bookings before payout profile complete | Finance |
| OD-DOC-17 | Overtime billing / hard stop | Care |
| OD-DOC-18 | Slot generation horizon | Ops |
| OD-DOC-19 | Same-doctor historical notes without new grant | Privacy |
| OD-DOC-20 | Clinic-level consent vs named doctor | Legal |
| OD-DOC-21 | Doctor rates patient | Default no |
| OD-VID-01 | LiveKit Cloud vs self-hosted | Infra |
| OD-VID-02 | Recording storage duration **if** recording is legally allowed and consented | Compliance |
| OD-VID-03 | Extra participants (caregiver, interpreter) | Product + legal |
| OD-VID-04 | Screenshare | Product |
| OD-VID-05 | Chat retention | Compliance |
| OD-VID-06 | Whether quality telemetry is clinical audit vs ops-only telemetry | Compliance |
| OD-VID-07 | PSTN bridge | Later |
| OD-VID-08 | Timer pauses during reconnect | Product |
| OD-VID-09 | Reconnect give-up minutes | Product |

Also catalogued in [35_OPEN_DECISIONS.md](35_OPEN_DECISIONS.md).
