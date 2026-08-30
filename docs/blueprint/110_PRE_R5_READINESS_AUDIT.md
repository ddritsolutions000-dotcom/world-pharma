# 110 — Global pre-R5 readiness audit (engineering gate)

**Status:** Audit + gate complete (no R5 coding)  
**Change ID:** **CR-PRE-R5-GATE-110**  
**Date:** 27 August 2026  
**Sources of truth:** [108](108_POST_R4_ECOSYSTEM_AUDIT.md) (**CR-POST-R4-AUDIT-108**), [109](109_POST_R4_ECOSYSTEM_HARDENING.md) (**CR-POST-R4-FIX-109**)  
**Related:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [107](107_R4_TELEMEDICINE_SANDBOX_IMPLEMENTATION.md) · [97](97_MULTI_TENANT_RLS_RETROFIT_IMPLEMENTATION.md) · [88](88_GLOBAL_APPLICATION_TOPOLOGY.md) · [35](35_OPEN_DECISIONS.md)

**Authority boundary:** AUDIT + ENGINEERING-GATE only. **No R5 / Rx / e-prescription / pharmacy dispensing / lab / radiology / CMS / CRM product.** No production LiveKit. No live PSP / DHL / bank / payout / real money. No new identity kernels, generic Partner App, affiliate mobile, or duplicate kernels. No invented medical/legal/tax rules. No fake screens or fake WebRTC.

**Migrations:** **None.**

---

## 0. FINAL STATUS

**PRE_R5_GREEN**

Engineering path for the next product wave (R5 Rx/pharmacy when separately authorized) does **not** require ecosystem restructuring. Attach points, singular kernels, RLS/tenancy, notification/support foundations, and post-R4 hardening from 109 are sufficient to begin R5 **after a dedicated coding CR**.

This gate **does not authorize R5 coding**. Legal/product/infra items remain open and are classified below; CMS/CRM and native LiveKit packaging are **not** R5 engineering blockers.

> **Follow-up plan:** Canonical R5 architecture is [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) (**CR-R5-AUTH-111** — **R5_PLAN_READY**). Implementation still requires a separate **CR-R5-IMPL-***.

---

## 1. Application / UI audit

| App | Path | Classification | Auth | Nav / states | ui-kit | API | Tenant scope | Notes |
|-----|------|----------------|------|--------------|-------|-----|--------------|-------|
| web-customer | `apps/web-customer` | **FOUNDATION** + video **SANDBOX** | OTP / customer audience | loading / empty / error / forbidden / network via shell | `@world-pharma/ui-kit` | Yes | Server-derived | Commerce + care; not production-ready |
| mobile (customer) | `apps/mobile` | **FOUNDATION** + video **SANDBOX** | OTP | NativeEmptyState + shell states | ui-kit native | Yes | Server-derived | Native media capability deferred (see §2) |
| web-admin | `apps/web-admin` | **FOUNDATION** | Admin JWT | Loading / Network / PermissionDenied | Yes | Yes | Company platform | Video sessions read-only |
| web-store | `apps/web-store` | **FUNCTIONAL** | Partner OTP | idle / loading / forbidden / network | Yes | Yes | Org + location | Pharmacy ops sandbox orders |
| mobile-store | `apps/mobile-store` | **FUNCTIONAL** | Partner OTP | Parity with store web | Yes | Yes | Org + location | |
| mobile-delivery | `apps/mobile-delivery` | **FUNCTIONAL** + carrier **SANDBOX** | Partner OTP | empty jobs / forbidden / network | Yes | Yes | Assigned jobs | Mock carrier; no live DHL |
| web-join | `apps/web-join` | **FUNCTIONAL** | `partner_applicant` OTP | EmptyStates | Yes | Yes | Applicant | Pack-gated |
| web-doctor | `apps/web-doctor` | **FOUNDATION** + video **SANDBOX** | Doctor OTP | Shell states | Yes | Yes | Doctor + clinical ACL | Encounter + video web |
| mobile-doctor | `apps/mobile-doctor` | **FOUNDATION** + video **SANDBOX** | Doctor OTP | credentials / orgs / settings (109) | Yes | Yes | Doctor + clinical ACL | Native media deferred |
| web-vendor | `apps/web-vendor` | **FOUNDATION** | Seller OTP | forbidden / network / EmptyState | Yes | Yes | Seller org | Empty-state heavy |
| ds-web | `apps/ds-web` | **FOUNDATION** | N/A (playground) | Gallery | ui-kit only | No product API | N/A | Non-product |

**PLANNED (registry, no app folder):** lab / pathologist / logistics / affiliate webs & mobiles.  
**DEFERRED:** affiliate mobile.  
**PRODUCTION-READY:** **none** (expected).

**i18n / a11y:** Foundations present via ui-kit / shared patterns; not claimed product-complete.  
**Security UX:** Session/forbidden paths present; no fake completeness screens added.

Evidence: `apps/api/src/identity/app-topology.ts`; books 108 §A–B, 109 §B.

---

## 2. Native video decision

| Question | Finding |
|----------|---------|
| What is missing? | LiveKit React Native SDK packaging; media plane when non-mock tokens issued |
| Abstraction sufficient? | **Yes** — `packages/shell-core/src/native-video-media.ts` `resolveNativeVideoMedia()` returns `mock_ui` \| `unavailable` \| `livekit_native`; `recordingEnabled: false` always |
| SDK required before R5? | **No** — R5 is Rx/pharmacy; consult-origin Rx may use web video sandbox; native WebRTC is a separate packaging CR |
| Sandbox contract consistent? | **Yes** — mock tokens → mock UI only; no fake WebRTC; web uses `livekit-client` boundary; MockVideoProvider default |

**Do not add LiveKit RN SDK under this gate.**

---

## 3. Maker / checker audit

Framework: `assertMakerChecker` (`apps/api/src/identity/dual-control.ts`). Partners never satisfy company dual-control via this helper alone. Callers decide when policy requires dual control — **no statutory rules invented**.

| Operation | Actor | Scope | Maker/checker | Audit / notes |
|-----------|-------|-------|---------------|---------------|
| Settlement batch approve | Company finance | Country / settlement policy | **Required when** `settlementPolicy.dualControl` | Finance service + security/outbox path |
| Payout approve | Company finance | Batch / country | **Required when** policy dualControl | Same |
| Policy pack publish | Company policy admin | Pack | **Optional** body `dual_control` | Policy admin service |
| Company privilege grant | Company authority | Company | **Custom dual-control** (self-approve reject) | `company-authority.service.ts` |
| Refund (payment) | Privileged payment actor | Payment intent | **RBAC only** — no `assertMakerChecker` | Architectural gap; product matrix required before inventing rules |
| Partner activation | Company partner admin | Application → org | **No** dual-control helper | Architectural gap |
| KYC doc approve / status | Company KYC | Case | **No** dual-control helper | Architectural gap |
| Governance read lists | Company | MNC entities | Read-only API | No mutation dual-control needed |
| Future regulated ops (e-Rx sign, dispense override, etc.) | TBD | Country pack | **Not invented** | R5 CR must define product matrix |

**Gap type:** architectural / product matrix — **not** an R5 schema or kernel-restructuring blocker.

---

## 4. Tenancy / MNC audit

### Hierarchy (schema)

| Layer | Model / mechanism |
|-------|-------------------|
| Global company | Platform / `app.company_scope` (no separate `GlobalCompany` table; company ≠ partner held) |
| Region | `OperatingRegion` |
| Country | `Country` |
| Legal Entity | `LegalEntity` |
| Business Unit | `BusinessUnit` |
| Organization | `Organization` |
| Location | `Location` |
| Person | `Person` (+ memberships) |

### Scope classes

| Scope | Behavior |
|-------|----------|
| Company staff | Platform / country / LE / BU GUCs; never partner-as-admin |
| Partner | Org + location membership; store/delivery/vendor/doctor overlays |
| Customer | Person-scoped; clinical ACL via consent/relationship |

### Controls verified

| Control | Evidence |
|---------|----------|
| Server-derived tenant context | `TenantContextInterceptor` → `buildUserTenantContext` |
| `SET LOCAL ROLE` + GUCs | `applyTenantGucs` (`SET LOCAL ROLE worldpharma_app` + `set_config`) |
| NOBYPASSRLS | Migration `20260827180000_multi_tenant_rls`; RLS e2e |
| Client headers ignored | RLS test: interceptor source must not match `x-organization-id` / `x-country-id` |
| Webhook / worker context | Webhooks → `workerTenantContext()` |
| Cross-country / org / location isolation | RLS e2e + R3 isolation e2e |

### Negative tests (this run)

| Suite | Result |
|-------|--------|
| RLS tenancy (`rls.tenancy.e2e.spec.ts`) | **8/8** (in API 127) |
| R3 isolation (`r3.isolation.e2e.spec.ts`) | **13/13** (in API 127) |

---

## 5. Shared kernel audit

| Kernel | Single path | Duplicate? |
|--------|-------------|------------|
| Identity | `apps/api/src/identity/` | No |
| RBAC / RLS | identity RBAC + `tenancy/` + DB policies | No |
| Notifications | `platform/notification*.ts` + outbox handlers | No |
| Support | `platform/support.*` (Redis foundation) | No second helpdesk product |
| Catalog | `catalog/` | No |
| Inventory | `inventory/` | No |
| Cart / checkout | `cart/` | No |
| Payment | `payment/` (sandbox) | No |
| Orders | `orders/` | No |
| Logistics | `logistics/` (mock carrier) | No |
| Finance | `finance/` (mock payout) | No |
| Clinical access / consent | `clinical/` | No |
| Video | `clinical/video*` + shell panels | No |
| Search | catalog/search path | No second engine |
| CMS slot | Architectural slot only | Product **not** started — not duplicated |
| CRM slot | Architectural slot only | Product **not** started — not duplicated |
| Analytics slot | Slot only | Not duplicated |

UI: one `@world-pharma/ui-kit`.

---

## 6. PHI / security audit

Searched app sources for PHI console dumps, raw clinical JSON in DOM, PHI in query params, secrets in DOM, client-trusted tenant IDs.

| Check | Result |
|-------|--------|
| PHI console logs | No clear clinical PHI logging found |
| Raw clinical JSON rendering | Governance `cell()` locale-safe (109); no clinical dump panels |
| PHI in URL/query | No clear clinical PHI query patterns found |
| Tokens / secrets in DOM | Video tokens ephemeral session contract; not persisted as secrets in UI |
| Client-controlled authorization | RBAC server-side; clinical access server-enforced |
| Client tenant headers | Rejected / unused as authority |

**Fixes under this CR:** none (no clear engineering defects). Legal policy unchanged.

---

## 7. Notification kernel

| Aspect | Status |
|--------|--------|
| Path | Outbox → `EventHandlerRegistry` → `NotificationDispatchService` → Redis inbox (`NotificationService.enqueueInbox`) |
| Prefs | Category prefs gate fan-out |
| Bodies | Generic sandbox copy (no PHI payloads in inbox) |
| Idempotency / retry | Outbox occurrence keys + worker; inbox ids UUID |
| Failure | Handler isolation; external channels **disabled** |
| Tenant | Person-keyed inbox; domain events carry aggregate ids |
| Providers | Adapters **not invented** (SMS/WhatsApp/email still off) |

Sufficient foundation for R5 event fan-out without a second notification system.

---

## 8. Support kernel

| Aspect | Status |
|--------|--------|
| Implementation | Single `SupportService` (Redis tickets per person) |
| Audiences | Any authenticated person path can use shared kernel; **no** per-partner helpdesk forks |
| Ownership | `person_id` keyed; optional `reference_type` / `reference_id` |
| Isolation | Person list scope; not company-wide ticket DB yet |
| Audit / minimum necessary | Inbox ack generic; ticket body stays in support store |
| Lab / affiliate / etc. | Can attach later via same kernel + references — **do not** create separate support systems |

Product helpdesk / live chat remain OD-CRM-08 / later — not R5 blockers.

---

## 9. Data / database (R5 compatibility)

**No Rx / Prescription / Dispensing tables created** (confirmed absent from Prisma schema).

Existing attach points R5 should extend (not replace):

| Domain | Model(s) |
|--------|----------|
| Identity | `Person` |
| Doctor | `DoctorProfile` |
| Encounter | `Encounter` (+ appointments) |
| Consent | `ConsentGrant` (+ clinical relationships / access audits) |
| Catalog | `CatalogItem` / offers / country overlays (Rx **flags** later — not a second catalog) |
| Inventory | `InventoryLot` / balances / movements |
| Order | `Order` / items / fulfillment |
| Payment | `PaymentIntent` / attempts / refunds |
| Logistics | `Shipment` / jobs |
| Finance | `Journal` / settlement / payables |

R5 must **attach** prescription/dispensing artifacts to these kernels under a coding CR — not fork identity/order/payment.

---

## 10. R5 dependency contracts (consume, do not reimplement)

| Contract | What R5 consumes | Breaking-change risk |
|----------|------------------|----------------------|
| Doctor / encounter | `DoctorProfile`, appointments, `Encounter` lifecycle, clinical ACL | Medium if encounter status model rewritten |
| Consent / access | `ConsentGrant`, relationship checks, access audits | High if client-side consent invented |
| Catalog | `CatalogItem` (+ future Rx flags / controlled flags via country pack) | Medium if parallel “Product” identity created |
| Inventory | Lots / available qty at location | Medium if bypass reservation |
| Order | Existing order + fulfillment group / pick-pack | High if separate “RxOrder” commerce stack |
| Payment | Sandbox `PaymentIntent` path | High if live PSP assumed without CR |
| Logistics | Shipment / delivery assignment | Medium if pharmacy pickup invents parallel ship |
| Finance | Journals / settlement facts | Medium if Rx margin bypasses ledger |
| Notifications | Outbox event names + inbox | Low if new events registered in same kernel |
| Support | Shared tickets + references | Low |
| Country policy | Published policy packs / feature gates | High if hardcoding medical law in app |
| MNC tenant context | Server GUCs + RLS; never client headers | Critical if bypassed |

**Consult-origin Rx:** may depend on R4 sandbox encounter/video **ids**, not production LiveKit.

---

## 11. CMS / CRM

| Question | Answer |
|----------|--------|
| Architectural slot ready? | **Yes** (single-kernel rule; no duplicate engines) |
| Shared kernel dependency? | Notifications / support / identity / country pack — not separate CMS/CRM runtimes |
| Product decision required? | **Yes** (OD-CMS-*, OD-CRM-*, helpdesk) |
| Blocker for R5? | **No** — R5 is Rx + pharmacy dispensing; does not require CMS/CRM product |

---

## 12. Legal / human gates (separated)

### ENGINEERING BLOCKER (for starting R5 coding after CR)
**None** that force restructuring. Residual engineering work (native LiveKit SDK, universal maker/checker matrix, external notification adapters, planned partner apps) is **orthogonal** or correctly deferred.

### PRODUCT DECISION
- Authorize **CR-R5-*** coding scope (doctor Rx UX, store Rx desk, customer Rx list)
- OD-RX-REFILL before any auto-refill behavior
- Maker/checker matrix for refunds / partner activation (if required by ops policy)
- CMS/CRM timing (not R5-blocking)

### LEGAL / COMPLIANCE DECISION
- e-Rx validity / still-verify default per country pack (roadmap R5)
- L-R4-* / OD-VID-* for **production** telemedicine (not required to start R5 sandbox coding)
- Country packs / controller-processor / licenses (Phase-0 board) for production enablement

### PRODUCTION INFRA DECISION
- LiveKit production credentials / residency (OD-VID-01)
- Live PSP / DHL / bank payout (R14 / Phase-0 MoR)
- Native LiveKit RN packaging CR (mobile media only)

---

## 13. Tests / builds (this gate)

| Suite | Result |
|-------|--------|
| Typecheck | **18/18 PASS** |
| API (incl. RLS 8 + R3 13 + video) | **127/127 PASS** |
| shell-core | **12/12** |
| shell-web | **3/3** |
| web-customer | **8/8** |
| web-doctor | **2/2** |
| web-admin | **12/12** |
| mobile | **4/4** |
| mobile-doctor | **7/7** |
| ui-kit | **10/10** (suite green) |
| Builds | **api, web-customer, web-doctor, web-admin, web-store, web-join, web-vendor** — PASS |

Tests were **not** weakened.

---

## 14. Final readiness scorecard

| ID | Area | Verdict |
|----|------|---------|
| **A** | Application readiness | **GREEN for R5 attach** — store/doctor/customer foundations present; planned apps correctly absent |
| **B** | UI readiness | **GREEN enough** — no fake screens; doctor mobile parity closed in 109; native video media deferred honestly |
| **C** | Backend readiness | **GREEN** — singular commerce + clinical kernels; sandbox money/carrier/video held |
| **D** | Security / RLS readiness | **GREEN** — NOBYPASSRLS, SET LOCAL, negative tests pass |
| **E** | MNC governance readiness | **GREEN for R5 start** — hierarchy + scopes held; maker/checker framework present (not universal — product matrix) |
| **F** | Video readiness | **SANDBOX GREEN** — native SDK **not** required before R5 |
| **G** | Notification / support readiness | **FOUNDATION GREEN** — single kernels; providers not invented |
| **H** | R5 dependency readiness | **GREEN** — attach models exist; no Rx tables yet (correct) |
| **I** | Engineering blockers | **None for R5 start** (orthogonal items listed §12) |
| **J** | Human / product decisions | Coding CR + OD-RX-REFILL + scope; CMS/CRM optional later |
| **K** | Legal / compliance gates | e-Rx / country packs / production telemedicine — **open**, not engineering-blocked |
| **L** | Production blockers | Live money, live carriers, production LiveKit, recording — **correctly held** |

---

## 15. Authorization statement

**R5 coding is NOT authorized by CR-PRE-R5-GATE-110.**

Humans may issue a separate **CR-R5-*** for prescription + pharmacy dispensing that:

1. Extends existing Person / Doctor / Encounter / Consent / Catalog / Inventory / Order / Payment / Logistics / Finance kernels  
2. Keeps still-verify / no auto-dispense from OCR/AI  
3. Does not invent medical law or enable live money / production LiveKit  

Recommended next human action: review this gate → decide R5 coding CR scope **or** continue production-telemedicine legal track — without treating CMS/CRM as R5 blockers.

---

**FINAL STATUS: PRE_R5_GREEN**
