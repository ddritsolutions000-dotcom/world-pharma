# 23 — Notification Architecture

**Status:** Blueprint  
**Audience:** Product, architecture, backend, mobile, CRM, compliance  
**Requirement IDs:** REQ-NOT, REQ-CRM, REQ-I18N, REQ-CMP  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Doctor](08_DOCTOR_PLATFORM.md) · [Lab](09_LAB_PLATFORM.md) · [Logistics](11_LOGISTICS_PLATFORM.md) · [Payment](12_PAYMENT_PLATFORM.md) · [CRM](15_CRM_PLATFORM.md) · [Health Record](16_HEALTH_RECORD.md) · [Events](22_EVENT_ARCHITECTURE.md) · [UI/UX](25_UI_UX_ARCHITECTURE.md) · [Design system](26_DESIGN_SYSTEM_SPEC.md)

Domain books may cite `23_NOTIFICATIONS.md`. **This file is the canonical notification architecture.** CRM **requests** sends; it does not own adapters ([15](15_CRM_PLATFORM.md)).

---

## 1. Purpose

The notification module is the **only** path that delivers messages to humans: customers, pharmacists, vendors, doctors, lab staff, pathologists, phlebotomists, riders, affiliates, and admins.

It exists so that:

- Domain modules emit events, not vendor SDKs
- Templates, locale, channel, and consent are consistent
- Healthcare content is minimized on unauthenticated channels
- Country Policy Packs can enable or forbid a channel without a rewrite

**ASSUMPTION (A-NOT-01):** One notification kernel in the modular monolith. Adapters are ports. Domain code never imports FCM, APNs, SES, Twilio, or a WhatsApp BSP SDK.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Unsolicited electronic communications, health-data in messages, medicine advertising, telemarketing, and WhatsApp/BSP licensing **per country**. Do not assume a channel is legal because it is technically available.

---

## 2. Boundaries

| Owns | Does not own |
| --- | --- |
| Template catalog, locale resolution, preference store | Business decisions (when an order is paid) |
| Dispatch, channel adapters, delivery receipts | Domain state machines |
| Quiet hours, frequency caps, suppression lists | CRM segmentation (CRM requests; this module executes) |
| In-app inbox projection | Push token lifecycle beyond bind/unbind APIs |
| OTP **delivery** (if identity calls this adapter) | OTP generation, rate limits, verification ([identity](05_CUSTOMER_PLATFORM.md)) |
| Deep-link routing metadata | Clinical payload storage ([16](16_HEALTH_RECORD.md)) |

CRM campaigns, lifecycle automations, and support macros **create a NotificationRequest**. This module applies policy and sends.

---

## 3. Channel catalog

| Channel | Typical use | Availability |
| --- | --- | --- |
| **Push** | Transactional + optional marketing | FCM (Android) + APNs (iOS); web push **OPEN DECISION (OD-NOT-09)** |
| **Email** | Receipts, reports-ready **link**, statements, marketing (opt-in) | SMTP/ESP adapter |
| **SMS** | OTP, high-priority transactional, fallback | Aggregator adapter; country pack `sms.enabled` |
| **WhatsApp** | Transactional templates where pack + legal allow | **BSP adapter only**; never assumed globally |
| **In-app** | Inbox, persistent record of transactional notices | All apps with a session |

**OPEN DECISION (OD-NOT-08):** Provider failover (primary/secondary SMS, ESP). Recommendation: port + ranked providers in pack; failover on 5xx/timeout only, with idempotency keys so the user is not double-charged per segment.

### 3.1 WhatsApp (non-negotiable rules)

**LEGAL/COMPLIANCE REVIEW REQUIRED** before any country enables WhatsApp.

| Rule | |
| --- | --- |
| Never assume WhatsApp is available in all countries | Country pack `notifications.whatsapp.enabled` default **false** |
| Never send free-form clinical or promotional text | Pre-approved **template** messages via a **Business Solution Provider (BSP)** |
| User-initiated vs business-initiated windows | Pack + BSP policy; do not invent Meta/WhatsApp policy in code |
| Healthcare body | Same minimization as SMS: no analytes, no Rx images, no diagnosis |
| Identity | Map to verified customer phone; do not scrape personal WhatsApp IDs from contacts |
| Marketing | Explicit opt-in per country (OD-CRM-06); default **off** |

**OPEN DECISION (OD-NOT-01):** Which BSP (and whether a second BSP). Engineering: `WhatsAppPort`. Legal/commercial pick the vendor.

**RISK:** Treating WhatsApp as a global default channel. Launch copy and OTP fallback must work with **push + SMS/email** when WhatsApp is off.

**RISK:** Putting lab results or medicine names in a WhatsApp template. Forbidden unless legal pack explicitly allows a named, minimized template.

---

## 4. Message classes

| Class | Consent | Quiet hours | Examples |
| --- | --- | --- | --- |
| **Transactional / service** | Implied by the service relationship; still respect legal opt-out where law requires | May override quiet hours for **safety-critical** only | Order paid, OTP, “report ready” (link only), rider arriving, consult starting |
| **Operational professional** | Staff/partner role; not marketing | Shift-aware optional | New order queue, sample accession, panic **flag** to clinician |
| **Marketing / CRM** | Recorded marketing allow; default deny | Always honor quiet hours + frequency cap | Abandoned cart, win-back, promo rails |
| **Legal / compliance** | May be mandatory | Usually allowed | Privacy notice, consent change, legal hold notice to patient if pack requires |

**OPEN DECISION (OD-NOT-03):** Transactional vs marketing opt-in model (soft vs explicit). Engineering default: **no promotional send without recorded marketing preference allow**. Encode law in country pack after legal review.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Medicine advertising, health-condition marketing, and “reorder your Rx” copy (must not be a medical instruction).

---

## 5. Template model

### 5.1 Objects

| Object | Meaning |
| --- | --- |
| `NotificationTemplate` | `template_key`, channel, locale, class, variables, country availability |
| `NotificationRequest` | From event or CRM: `template_key`, `recipient_user_id`, `country_id`, `data` (ids + safe tokens), `correlation_id` |
| `NotificationMessage` | Rendered instance: channel, provider id, status |
| `InAppInboxItem` | Durable customer/staff inbox row |

Templates are **data**, not hardcoded per screen. CMS/country_admin may edit copy within **variable allowlists**. Clinical sentences are not free-form.

### 5.2 Locale resolution

1. Recipient preferred language (profile)
2. Country pack default language
3. Template fallback locale (usually `en` as last resort — **OPEN DECISION (OD-NOT-12)** whether `en` is always shipped)

RTL, date/time, and money formatting follow [18_GLOBALIZATION.md](18_GLOBALIZATION.md) (country pack). Notification body uses the same ICU/message-format rules as UI strings.

**ASSUMPTION (A-NOT-02):** Clinical artifact language (report PDF) may differ from UI/notification language. “Report ready” copy must not claim the PDF language.

### 5.3 Variable allowlist (safety)

Templates may interpolate **only** declared tokens, for example:

- `order_short_id`, `booking_short_id`, `eta_window` (coarse)
- `amount_formatted`, `currency`
- `deep_link` (authenticated app link)
- `reason_code` mapped to **approved** customer copy, not pharmacist free text

Forbidden in SMS/WhatsApp/email body unless pack + legal explicitly allow: medicine names for Rx, lab analytes, diagnosis, full address, full phone of rider, PAN.

---

## 6. Preference center

Every customer (and professional) has a **preference center** ([05](05_CUSTOMER_PLATFORM.md) inbox/settings).

| Dimension | Values |
| --- | --- |
| Channel | push, email, SMS, WhatsApp, in-app |
| Category | `orders`, `delivery`, `consults`, `labs`, `reports`, `payments`, `wallet`, `support`, `marketing`, `affiliate` (where relevant) |
| Marketing | Explicit allow/deny per channel |

Rules:

1. **Transactional** categories cannot be fully disabled if the product cannot function (OTP, “report available in app”, payment receipt). UI explains this. Where law requires a hard opt-out even for some transactional email, pack flags `transactional.email.optional`.
2. **Marketing** default deny until recorded allow (A-NOT / OD-NOT-03).
3. WhatsApp appears in the preference UI **only if** pack enables it.
4. Quiet hours are user-overridable within pack bounds (next section).
5. Support “reveal PII” is **not** a notification preference; it is RBAC ([03](03_USER_ROLES_AND_PERMISSIONS.md)).

**OPEN DECISION (OD-NOT-04):** In-app inbox retention (e.g. 90 days vs pack). Recommendation: retain transactional inbox items for the same window as the related order/booking, then archive; do not store clinical bodies in inbox.

---

## 7. Quiet hours

| Source | Role |
| --- | --- |
| Country pack `crm.quiet_hours` / `notifications.quiet_hours` | Default window (local time of recipient) |
| User preference | Narrower window allowed; cannot widen beyond pack for marketing |
| Template class | Marketing always suppressed in quiet hours. Transactional: send. Safety-critical (panic to clinician, OTP): send |

**OPEN DECISION (OD-NOT-02):** Default quiet hours. Recommendation: **pack-defined**; engineering placeholder `22:00–08:00` local **must not** be treated as law. Ops sets per country.

Frequency caps (marketing): pack `notifications.marketing.max_per_day` / `max_per_week`. Transactional OTP has its own identity rate limits, not this cap.

**RISK:** Using quiet hours to delay “report ready” by hours. Digital report is stored immediately (J13); notification may queue to end of quiet hours **only if** pack says transactional reports wait — default **do not delay** report-ready (user expects care).

---

## 8. PII minimization (especially SMS)

SMS is logged by aggregators, visible on lock screens, and often shared phones.

| Channel | Allowed content | Forbidden |
| --- | --- | --- |
| SMS | OTP; short order/booking id; “Your report is ready in the app”; coarse ETA; deep link | Analytes, Rx item names, diagnosis, full address, rider personal number, PAN, panic **values** |
| WhatsApp | Same as SMS; approved templates only | Free-form clinical text |
| Email | Receipt line items for **commerce** (OTC names ok if pack allows); report = **authenticated link**, not PDF attachment by default | **OPEN DECISION (OD-NOT-07)** attaching report PDF. Recommendation: **link to app/web**, not attachment, until legal pack allows |
| Push | Same minimization as SMS; title/body both considered PII surfaces | Rich push with Rx images |
| In-app | May show more (order lines, report title) because session is authenticated | Still no extra clinical dump in a toast |

**Panic / critical lab values (OD-LAB-05 / OD-EVT-10):**

- Customer: “A result needs attention. Open the app / contact your clinician” — **no numbers in SMS**
- Pathologist / lab: in-app + push; phone escalation is an **ops playbook**, not an SMS of the analyte
- **LEGAL/COMPLIANCE REVIEW REQUIRED** for duty-to-notify

**RISK:** Support tickets quoting SMS bodies that contained health data. Store template id + redacted flag in CRM ([15](15_CRM_PLATFORM.md)).

---

## 9. Dispatch pipeline

```
Domain event (22) or CRM NotificationRequest
        │
        ▼
  Policy gate: country pack, channel enabled, preference, quiet hours,
               suppression (bounce, unsub, legal stop), feature flags
        │
        ▼
  Render template (locale + allowlisted variables)
        │
        ├── In-app inbox write (same transaction as outbox send rows)
        │
        ▼
  Channel adapters (BullMQ `evt.notify`) → provider
        │
        ▼
  Delivery receipt → status; bounce → suppression list
```

**ASSUMPTION (A-NOT-03):** Notification workers consume the event bus ([22](22_EVENT_ARCHITECTURE.md) `evt.notify`). CRM does not call SMS APIs.

Idempotency: `(template_key, aggregate_id, event_id, channel)`. At-least-once events must not produce duplicate OTPs **except** identity’s explicit resend.

Retry: default event retry ([22](22_EVENT_ARCHITECTURE.md) §6). OTP: short TTL; do not retry an expired OTP SMS. Provider 4xx (invalid number) → mark channel dead, fallback per pack (SMS → email, never WhatsApp surprise).

---

## 10. Event → template map (normative triggers)

Channels listed are **defaults**. Pack may remove a channel; it may not add WhatsApp without pack+legal.

| Event ([22](22_EVENT_ARCHITECTURE.md)) | Audience | Template key (logical) | Default channels | Class | Notes |
| --- | --- | --- | --- | --- | --- |
| `ORDER_PAID` | Customer | `order.confirmed` | Push, in-app, email | Tx | No Rx line names in SMS |
| `ORDER_PAID` | Pharmacy / vendor | `order.new_seller` | Push, in-app | Ops | |
| `ORDER_CANCELLED` | Customer, seller | `order.cancelled` | Push, in-app, email | Tx | Reason **code** copy |
| `RX_VERIFIED` | Customer | `rx.verified_confirm_items` | Push, in-app | Tx | Then confirm SKUs in app |
| `RX_REJECTED` | Customer | `rx.rejected` | Push, in-app, SMS optional | Tx | Reason code; re-upload CTA |
| `DELIVERY_ASSIGNED` | Customer | `delivery.assigned` | Push, in-app | Tx | Minimized geo |
| `DELIVERY_COMPLETED` | Customer | `delivery.completed` | Push, in-app, email | Tx | |
| `JOB_FAILED` | Customer, ops | `job.failed` | Push, in-app | Tx | Reassign copy, not blame |
| `APPOINTMENT_BOOKED` | Customer, doctor | `appointment.confirmed` | Push, email, in-app | Tx | Calendar invite optional **OD-NOT-13** |
| `APPOINTMENT_CANCELLED` | Both | `appointment.cancelled` | Push, in-app, email | Tx | Refund path J16 |
| `CONSULTATION_STARTED` | Other party if not in-app | `consult.started` | Push | Tx | Quiet hours: send |
| `PRESCRIPTION_SIGNED` | Customer | `rx.digital.ready` | Push, in-app | Tx | Authenticated viewer |
| `LAB_BOOKED` | Customer | `lab.booked_prep` | Push, email, in-app | Tx | Prep/fasting CMS, not diagnosis |
| `SAMPLE_COLLECTED` | Customer | `lab.sample_collected` | Push, in-app | Tx | |
| `SAMPLE_RECEIVED` | Customer | `lab.sample_at_lab` | In-app, push optional | Tx | Low spam |
| `SAMPLE_REJECTED` | Customer | `lab.recollection` | Push, in-app, SMS | Tx | |
| `REPORT_GENERATED` | Lab/pathology ops | — | In-app | Ops | **Not** customer |
| `REPORT_RELEASED` | Customer | `report.ready` | Push, in-app, email (link) | Tx | **No result values** |
| `REPORT_AMENDED` | Customer | `report.amended` | Push, in-app | Tx | |
| `REPORT_PRINTED` | Customer | `report.print_packing` | In-app | Tx | |
| `PHYSICAL_REPORT_DELIVERED` / `DELIVERY_COMPLETED` | Customer | `report.hardcopy_delivered` | Push, in-app | Tx | J15 |
| `PANIC_VALUE_DETECTED` | Pathologist / ops; customer per pack | `lab.panic.clinician` / `lab.panic.patient_generic` | In-app, push; SMS **flag only** | Safety | OD-LAB-05 |
| `PAYMENT_SUCCESS` | Customer | `payment.receipt` | Email, in-app | Tx | |
| `PAYMENT_FAILED` | Customer | `payment.failed` | Push, in-app | Tx | Stop when paid |
| `REFUND_CREATED` | Customer | `refund.started` | Push, in-app, email | Tx | J16 |
| `REFUND_SUCCEEDED` | Customer | `refund.completed` | Push, in-app, email | Tx | |
| `SETTLEMENT_CREATED` | Participant | `settlement.statement_ready` | Email, in-app | Ops | Not “paid” |
| `PAYOUT_COMPLETED` | Participant | `payout.completed` | Push, email | Ops | J18–J21 |
| `AFFILIATE_CONVERSION` | Affiliate | `affiliate.conversion_pending` | In-app | Ops | No customer PII |
| `AFFILIATE_COMMISSION_APPROVED` | Affiliate | `affiliate.commission_approved` | In-app, email | Ops | J17 |
| `CONSENT_REVOKED` | Patient; doctor (access lost) | `consent.revoked` | In-app, email | Legal | |
| `KYC_STATUS_CHANGED` | Professional | `kyc.status` | Email, in-app | Ops | |
| `PARTNER_REGISTERED` | Applicant | `partner.registered` | Email, in-app | Tx | |
| `PARTNER_APPLICATION_SUBMITTED` | Applicant | `partner.under_review` | Email, in-app | Tx | |
| `PARTNER_DOCUMENT_REJECTED` | Applicant | `partner.document_rejected` | Email, in-app | Tx | No file bytes |
| `PARTNER_INFORMATION_REQUESTED` | Applicant | `partner.info_required` | Email, in-app | Tx | |
| `PARTNER_APPROVED` | Partner | `partner.approved` | Email, in-app | Tx | |
| `PARTNER_REJECTED` | Applicant | `partner.rejected` | Email, in-app | Tx | |
| `PARTNER_SUSPENDED` | Partner | `partner.suspended` | Email, in-app | Tx | |
| `PARTNER_REACTIVATED` | Partner | `partner.reactivated` | Email, in-app | Tx | |
| `PARTNER_DOCUMENT_EXPIRING` | Partner | `partner.document_expiring` | Email, in-app | Tx | |
| `PARTNER_INVITE_SENT` | Invitee | `partner.invited` | Email | Tx | |
| `TICKET_OPENED` | Support; customer ack | `ticket.opened` | In-app | Tx | |
| Identity OTP | User | `auth.otp` | SMS and/or email; WhatsApp **only if pack** | Tx | Identity owns generation |
| Abandoned cart (CRM) | Customer | `crm.abandoned_cart` | Push, email | Marketing | No clinical contents |
| Consult reminder | Both | `appointment.reminder` | Push, in-app | Tx | Quiet hours: still send within join window |

J07 customer receive = `PRESCRIPTION_SIGNED` / `HEALTH_ARTIFACT_RELEASED`. J13 = `REPORT_RELEASED`. Failure of push **does not** mean the report is missing.

---

## 11. Recipients by app

| Audience | Apps | Token / address |
| --- | --- | --- |
| Customer | APP-CUS-M, APP-CUS-W | Push tokens, email, phone E.164, in-app |
| Pharmacy | APP-PHARM | Staff user + location topic (new-order) |
| Vendor | APP-VEND | Org topic + user |
| Doctor | APP-DOC | User; waiting-room high priority |
| Lab / pathologist | APP-LAB-W, APP-PATH | Email + in-app; panic in-app first |
| Phlebotomist / rider | APP-PHE, APP-DEL | Push; SMS fallback for job offer **OD-NOT-14** |
| Admin | APP-ADM shells | Email + in-app; no clinical body |

**RISK:** Broadcasting a customer’s report-ready to a doctor without ConsentGrant. Doctor notify only if grant `ACTIVE` and purpose matches ([16](16_HEALTH_RECORD.md)).

---

## 12. Observability and retention

| Signal | |
| --- | --- |
| Provider accept / bounce / click | Store on `NotificationMessage` |
| Never log | OTP code, full SMS body if it contained health class data (hash + template id) |
| Retention | Delivery logs: pack; health-class messages: [19](19_COMPLIANCE_FRAMEWORK.md) |

**RISK:** Using notification logs as a shadow EHR (R-CRM-06). Linked ids only.

---

## 13. Country Policy Pack keys (illustrative)

| Key | Purpose |
| --- | --- |
| `notifications.channels[]` | push, email, sms, whatsapp, in_app |
| `notifications.whatsapp.enabled` | Default false |
| `notifications.quiet_hours` | Local window |
| `notifications.marketing.opt_in_model` | After legal |
| `notifications.sms.report_results_allowed` | Default false |
| `notifications.email.attach_report_pdf` | Default false |
| `notifications.otp.channels[]` | Identity + this adapter |
| `lab.panic.notify.channels[]` | OD-LAB-05 |

Do not hardcode a launch country or “WhatsApp is how India works.”

---

## 14. Open decisions (this document)

| ID | Question | Recommendation |
| --- | --- | --- |
| **OD-NOT-01** | WhatsApp BSP vendor | Adapter now; vendor after legal |
| **OD-NOT-02** | Default quiet hours | Pack-defined; 22:00–08:00 is a placeholder only |
| **OD-NOT-03** | Marketing opt-in model | Explicit allow; no promo without it |
| **OD-NOT-04** | In-app inbox retention | Align with related object; no clinical body |
| **OD-NOT-05** | OTP channel priority | Pack: SMS vs WhatsApp vs email; never WhatsApp-only globally |
| **OD-NOT-06** | Panic notification channels | In-app + clinician push; SMS body without values; phone SOP |
| **OD-NOT-07** | Email may attach report PDF | Default **no**; authenticated link |
| **OD-NOT-08** | Provider failover | Ranked adapters + idempotency |
| **OD-NOT-09** | Web push vs FCM/APNs only | Web: in-app + email first; web push later |
| **OD-NOT-10** | Calendar invites (.ics) | Optional after privacy review |
| **OD-NOT-11** | Staff new-order sound / SLA ping | Location topic; mute after hours per shift |
| **OD-NOT-12** | Fallback locale | Pack default, then `en` if shipped |
| **OD-NOT-13** | Doctor calendar invites | OD with OD-NOT-10 |
| **OD-NOT-14** | Job-offer SMS to riders | Pack; PII-minimized |

Also OD-CRM-02, OD-LAB-05.

---

## 15. Assumptions, risks, legal (index)

| ID | Type | Statement |
| --- | --- | --- |
| A-NOT-01 | ASSUMPTION | Single kernel; adapters only |
| A-NOT-02 | ASSUMPTION | Artifact language may ≠ notification language |
| A-NOT-03 | ASSUMPTION | Workers consume `evt.notify`; CRM does not send SMS |
| | RISK | WhatsApp assumed global |
| | RISK | Results/Rx in SMS or lock-screen push |
| | RISK | Doctor notified without consent |
| | RISK | Quiet hours delaying report-ready |
| | LEGAL | Comms law, health-data in messages, medicine ads, WhatsApp/BSP, panic duties |

Channel execution for CRM: this document. Event names: [22](22_EVENT_ARCHITECTURE.md). Inbox UX: [25](25_UI_UX_ARCHITECTURE.md).
