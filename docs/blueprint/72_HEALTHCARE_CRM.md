# 72 — Healthcare CRM

**Status:** Blueprint — not implemented  
**Related:** [15](15_CRM_PLATFORM.md) · [71](71_HEALTH_RECORD_CONSENT.md)

CRM **reuses identity**. It does **not** duplicate Person. It does **not** auto-ingest clinical documents.

---

## 1. Customer 360 lanes

| Lane | CRM may store |
| --- | --- |
| Commerce | Order ids, SKU categories (non-Rx detail), delivery issues |
| Support | Tickets, tasks, CSAT |
| Marketing | Segments, campaigns, **marketing consent** |
| Clinical | **Only** “has_report”, “has_appointment” flags if pack allows — **never** notes/results |

---

## 2. Objects

Lead, Case, Ticket, Task, FollowUp, Campaign, Segment, CommunicationPreference, Interaction, ConsentGrant (marketing/support scopes).

---

## 3. Users

APP-ADM CRM shell. Permissions `crm:*`. `ticket:read` ≠ `health:read`.

---

## 4. Campaigns / affiliate

Campaigns respect communication + marketing consent. Affiliate clinical OFF ([14](14_AFFILIATE_PLATFORM.md)).

---

## 5. Open

Which operational flags are non-PHI; WhatsApp/SMS vendor; retention of chat transcripts.
