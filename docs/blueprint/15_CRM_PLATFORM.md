# 15 — CRM Platform

**Status:** Blueprint  
**Audience:** Growth, support, product, architecture, compliance  
**Requirement IDs:** REQ-CRM, REQ-SUP  
**Journeys:** All customer journeys (360 view); tickets overlay J01–J16; abandoned checkout; reorder; **caregiver/family is open**  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Affiliate](14_AFFILIATE_PLATFORM.md) · [Health record](16_HEALTH_RECORD.md) · [Admin ERP](17_ADMIN_ERP.md) · [Notifications](23_NOTIFICATION_ARCHITECTURE.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Analytics](30_OBSERVABILITY.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose

CRM is the **Customer 360 and lifecycle** kernel: one profile that operations, support, and growth can use without cloning identity or clinical systems.

It must:

- Assemble a **commerce + care operational** view of the customer
- Run segmentation, campaigns, automation, leads, and retention
- Handle support tickets with **PII minimization**
- **Never** treat support as a clinician: **full clinical payloads are deny-by-default** ([03](03_USER_ROLES_AND_PERMISSIONS.md))

CRM is not the health record. It may show **that** a report exists and when it was released; it must not render lab values, Rx images, or consult notes unless a distinct, audited permission says otherwise (**OD-CRM-04** / **OD-RBAC-02**).

---

## 2. Boundaries

| Owns | Does not own |
| --- | --- |
| Customer 360 read models, segments, campaigns, automations | Order mutation (may **request** cancel/refund) |
| Leads, follow-ups, lifecycle stage | Payment capture, ledger posting |
| Tickets, macros, CSAT | Identity source of truth (identity module) |
| Campaign interaction history | Consent for **clinical access** (health module) |
| Marketing communication preferences (logical) | Template rendering/dispatch (notification module executes) |
| Loyalty **program hooks** | Wallet ledger liability (12/13) |

**ASSUMPTION (A-CRM-01):** APP-CRM is a **shell of the admin Next.js app** ([04](04_APPLICATION_ARCHITECTURE.md) APP-CRM), not a separate backend.

---

## 3. Customer 360

A 360 document is a **read model** projected from domain events. CRM does not become a second write model for orders or artifacts.

### 3.1 Profile

| Slice | Content | Support default visibility |
| --- | --- | --- |
| Identity | Name, country, language, verified phone/email (masked), account status | Masked; reveal-PII with reason (03) |
| Addresses | Delivery/collection | Last-used; full list on need |
| Preferences | Notification channels, marketing opt-in | Yes |
| KYC flags | Customer-level if any (not clinician KYC) | Status only |

### 3.2 Orders

Pharmacy and marketplace orders: status, amounts (original currency preserved), items **commercial names**, fulfillment/job status. No Rx image thumbnails by default.

### 3.3 Medicine history (commerce)

Dispensed/purchased SKUs, refill cadence, abandoned carts with medicine SKUs. This is **purchase history**, not a clinical medication list. The clinical medication/allergy list lives in [16](16_HEALTH_RECORD.md). 360 may show “ordered SKU X on date” without strength-as-clinical-record unless the health module projects a consented medication artifact.

**RISK:** Treating commerce SKU history as a complete medication record. UX must label it as **purchase history**.

### 3.4 Doctor history

Appointments, specialty, status, fees paid. **No consult notes, chat transcripts, or recordings** in support 360. Doctor-facing apps use care module + consent, not CRM.

### 3.5 Lab history

Bookings, collection status, report **released yes/no**, print jobs. **No result values** in support 360.

### 3.6 Payments

Intents, methods (tokenized brand/last4 if PCI-safe), capture/refund status, wallet balance **amount** (not a bank). Finance-level journal is APP-FIN, not CRM. Support sees payment **status** to explain J16, not the ability to capture.

### 3.7 Support

Open/closed tickets, CSAT, SLA breaches.

### 3.8 Campaign interaction

Sends, opens/clicks if the channel provides them, unsubscribes, suppression.

### 3.9 Coupons

Issued, redeemed, stacked with affiliate (**OD-AFF-07**).

### 3.10 Loyalty

Points/tier if enabled (**OD-CRM-03**). Ledger posts liability if points are stored value-like (**LEGAL/COMPLIANCE REVIEW REQUIRED** if redeemable for money).

### 3.11 Affiliate

`referred_by_affiliate_id`, conversion flags. Support cannot edit attribution without an audited growth tool ([14](14_AFFILIATE_PLATFORM.md)).

### 3.12 Communication history

Notifications sent (channel, template id, not necessarily full body if it contained clinical content). **If a message included a report or Rx, support sees template name + “clinical content redacted”.**

---

## 4. Access control (non-negotiable)

From [03](03_USER_ROLES_AND_PERMISSIONS.md):

| Role | PII | Clinical payload | Money write |
| --- | --- | --- | --- |
| `support` | Masked; reveal-PII + reason | **No payload by default** | Limited cancel **request**; no capture |
| `analyst` | Analytics grain | No clinical payload | None |
| `country_admin` | Operational | No unless break-glass | No ledger post |
| `finance` | Settlement ids | None | Refund/payout in finance app |

Permissions:

| Permission | Use |
| --- | --- |
| `ticket:handle` | support |
| `campaign:send` | CRM role / country_admin |
| `user:read` | support masked; self |
| `health_artifact:read` | **Not** granted to support |
| `user:impersonate` | super_admin only, time-boxed |

**OPEN DECISION (OD-CRM-04):** Support may ever see Rx images? Default **no** (same as **OD-RBAC-02**). If a country later needs “unreadable upload” debugging, use a **pharmacist/Rx desk** tool, not CRM.

Break-glass clinical access is [16](16_HEALTH_RECORD.md) + 03, not a CRM toggle.

---

## 5. Caregiver / family

**OPEN DECISION (OD-CRM-01):** Caregiver/family accounts legal model per country (also **OD-RBAC-03**, **OD-EHR-05**).

Until decided:

- CRM 360 is **one Person = one customer profile**.
- Do not implement shared family wallets or unrestricted “parent sees all reports.”
- If a proxy is required for a minor or authorized caregiver, it is a **ConsentGrant / legal proxy** in health + identity, not a CRM household checkbox.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Age of consent, parental access, and dependent accounts. Do not invent a global family model.

**ASSUMPTION (A-CRM-02):** v1 ships without multi-profile households; a single login does not switch “for” another adult patient.

---

## 6. Segmentation

Segments are **queries over the 360 read model + events**, evaluated in batch or near-real-time.

| Dimension class | Examples |
| --- | --- |
| Identity | Country, language, tenure |
| Commerce | AOV, last order, Rx vs OTC mix, vendor vs owned |
| Care | Last consult, specialty, no-show |
| Diagnostics | Last booking, incomplete collection |
| Engagement | App recency, campaign suppression |
| Risk | Refund velocity, COD abuse (flags, not PAN) |
| Lifecycle | See §10 |

**Forbidden in segments used for marketing:** clinical result values, diagnosis text, allergy lists, unless **LEGAL/COMPLIANCE REVIEW REQUIRED** and a **separate health-marketing consent** exists. Default: segment on **service use** (“has completed a lab booking”) not on **result content**.

---

## 7. Campaigns and automation

### 7.1 Campaigns

| Object | Meaning |
| --- | --- |
| `Campaign` (CRM) | Audience segment + offer + channel mix + schedule + country |
| `CampaignVariant` | Experiment |
| `SuppressionList` | Unsub, bounce, legal stop |

Channels execute via [23](23_NOTIFICATION_ARCHITECTURE.md) adapters (push, email, SMS, WhatsApp BSP **country-gated**).

**OPEN DECISION (OD-CRM-02):** WhatsApp/SMS as CRM channel. Recommendation: **country pack**; no global assumption of a single messenger.

**OPEN DECISION (OD-CRM-06):** Marketing opt-in model (soft opt-in vs explicit). Encode per country after legal review. Engineering default: **no promotional send without recorded marketing preference allow**.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Advertising of medicines, unsolicited electronic communications, and health-related marketing.

Campaigns must respect:

- Country service availability (do not advertise home collection where pack is off)
- Affiliate creative rules if the send is affiliate-funded (rare)
- Quiet hours / frequency caps in pack

### 7.2 Automation (lifecycle jobs)

| Automation | Trigger | Guardrails |
| --- | --- | --- |
| Abandoned cart | Cart idle; checkout not paid | No clinical contents in push body; do not nag after unsub |
| Abandoned payment | `PaymentFailed` | Idempotent; stop when paid |
| Reorder reminder | Predicted refill from **purchase history** | Not a medical instruction; copy is commerce; Rx still needs valid Rx |
| Appointment reminder | Care module | Operational, not marketing if transactional |
| Report ready | `ReportReleased` | Transactional; body has no result values |
| Win-back / retention | Lapsed lifecycle | Marketing consent |
| Churn save | Churn score | Same |

Automations **request** notifications; they do not send SMS from CRM code.

---

## 8. Leads and follow-up

Leads are **pre-customer or B2B** objects.

| Type | v1 |
| --- | --- |
| Customer inbound (callback, incomplete signup) | Yes |
| Doctor/lab/vendor onboarding lead | Yes, handed to KYC/ops |
| Corporate health / insurance | **OPEN DECISION** in 01 — not assumed |

**OPEN DECISION (OD-CRM-05):** Lead ownership for B2B later. v1: country_admin/operations queue.

Follow-up tasks: assignee, due, outcome. Not a second ticket system — a lead can **convert** to a ticket or to a party KYC case.

---

## 9. Tickets (support)

State machine (Ticket):

| Status | Meaning |
| --- | --- |
| `OPEN` | New |
| `PENDING_CUSTOMER` | Waiting |
| `PENDING_INTERNAL` | Ops/pharmacy/lab |
| `ESCALATED` | Finance, medical reviewer, compliance |
| `RESOLVED` | |
| `CLOSED` | |
| `REOPENED` | |

| Field (logical) | Meaning |
| --- | --- |
| `ticket_id` | |
| `customer_id` / `country_id` | |
| `topic` | Order, booking, payment, app, privacy, other |
| `linked_objects` | order_id, job_id, booking_id — **not** artifact payloads |
| `pii_reveal_events[]` | Who revealed what, why |
| `sla_policy_id` | Country pack |

Support **allowed actions** (policy):

- Add notes, request customer documents (non-clinical unless Rx desk)
- Request cancel / refund (finance or policy engine executes)
- Reorder **link** for the customer to complete in the super app

Support **forbidden**:

- `health_artifact:read` full payload
- Ledger posting
- Impersonation
- Changing affiliate attribution casually
- Enabling video recording

Medical complaints (adverse event, drug quality): escalate to **compliance / pharmacy** workflows, not closed as a normal ticket. **LEGAL/COMPLIANCE REVIEW REQUIRED** for pharmacovigilance in countries where that duty exists — CRM is the intake, not the validated safety database.

---

## 10. Lifecycle, retention, churn

| Stage (directional) | Meaning |
| --- | --- |
| `VISITOR` | Anonymous tracking limited by consent |
| `REGISTERED` | Account, no order |
| `ACTIVE_COMMERCE` | Recent order |
| `ACTIVE_CARE` | Recent consult/lab |
| `LAPSED` | No activity in configurable window |
| `CHURN_RISK` | Model or rule |
| `CHURNED` | |
| `BLOCKED` | Fraud/compliance |

Churn models: **OD-CRM-07** (rules v1 vs ML). Recommendation: **rules v1** (recency/frequency); ML later in analytics ([30](30_OBSERVABILITY.md)).

Retention plays must not use clinical result content.

---

## 11. Coupons and loyalty

| Object | CRM role |
| --- | --- |
| Coupon campaign | Audience + code generation |
| Redemption | Recorded from order/pricing events |
| Loyalty | Optional program |

**OPEN DECISION (OD-CRM-03):** Membership/loyalty in v1 (also 02). Recommendation: **coupons in v1**; points/membership if product commits; wallet promo credits via 12/13 rather than a second points currency unless designed.

Stacking with affiliate: 14 OD-AFF-07.

---

## 12. Data minimization and retention

- 360 stores **pointers** to clinical artifacts, not copies of payloads.
- Communication bodies that included health data: store template id + redacted flag; full body in notification log with health-class retention ([19](19_COMPLIANCE_FRAMEWORK.md)).
- Support recordings/chat: later phase ([04](04_APPLICATION_ARCHITECTURE.md) live chat later).
- Export/delete subject requests: CRM must honor identity-driven erasure **except** legal hold and financial record retention. **OD-EHR** / 19.

Analyst role: aggregated dashboards; no clinical payload.

---

## 13. Events consumed / emitted

**Consumed:** Identity changes, order/booking/job/payment/refund, report released (flag only), affiliate bind, ticket messages, notification delivery receipts.

**Emitted:** `TicketOpened`, `RefundRequested`, `CampaignSent`, `SegmentEntered`, `LifecycleChanged`.

CRM never emits `PaymentCapture` or `JournalEntry`.

---

## 14. Country Policy Pack keys

| Key | Purpose |
| --- | --- |
| `crm.channels[]` | email, sms, push, whatsapp, other |
| `crm.marketing.opt_in_model` | |
| `crm.quiet_hours` | |
| `crm.ticket.sla` | |
| `crm.support.reveal_pii` | Dual control / reason codes |
| `crm.households.enabled` | Default false (OD-CRM-01) |
| `crm.medicine_advertising` | Campaign allow/deny |

---

## 15. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-CRM-01 | Support sees Rx/lab payloads | Deny `health_artifact:read`; redacted comms |
| R-CRM-02 | Marketing using diagnoses | Segment on service use not results; legal on health marketing |
| R-CRM-03 | Informal family access | No household switch until OD-CRM-01 |
| R-CRM-04 | CRM writes a second order truth | Read model + request actions |
| R-CRM-05 | Unsolicited health ads | Country pack + opt-in |
| R-CRM-06 | Ticket becomes a shadow EHR | Linked ids only |

---

## 16. Assumptions

| ID | Statement |
| --- | --- |
| A-CRM-01 | Admin shell, not a separate CRM SaaS core for v1 |
| A-CRM-02 | No multi-adult household profiles in v1 |
| A-CRM-03 | 360 is projected; domains remain source of truth |
| A-CRM-04 | Support cancel/refund is a request unless policy auto-executes |

---

## 17. Open decisions

| ID | Question | Recommendation until decided |
| --- | --- | --- |
| OD-CRM-01 | Caregiver/family legal model | No household in v1; proxy only via consent/legal in 16 |
| OD-CRM-02 | WhatsApp/SMS CRM channels | Country-gated adapters |
| OD-CRM-03 | Loyalty/membership in v1 | Coupons first; membership per 02 |
| OD-CRM-04 | Support see Rx images | **No** |
| OD-CRM-05 | B2B lead ownership | Out of v1 product; ops queue only |
| OD-CRM-06 | Marketing opt-in model | Explicit allow; per country legal |
| OD-CRM-07 | Churn ML vs rules | Rules v1 |
| OD-CRM-08 | Live support chat | Later; tickets async first (04) |

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Marketing communications, medicine advertising, pharmacovigilance intake, and family/caregiver access. Align with [16](16_HEALTH_RECORD.md) and [19](19_COMPLIANCE_FRAMEWORK.md).
