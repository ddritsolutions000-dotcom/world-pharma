# 205 — R12 CRM, marketing, loyalty, affiliate, commerce extras implementation plan

**Status:** Plan / design only — **no coding authorized**  
**Change ID:** **CR-R12-PLAN-205**  
**Date:** 29 August 2026  
**FINAL STATUS:** **R12_PLAN_READY**

**Prerequisite:** R11 closed — **R11_GREEN_CLOSED_R12_READY_FOR_PLANNING** ([204](204_POST_R11_E_AUDIT.md)). R10-A/B/C/D complete and closed. R10-E/F **deferred** — not in R12 scope.

**Sources of truth:**  
[93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [204](204_POST_R11_E_AUDIT.md) · [193](193_R11_IMPLEMENTATION_PLAN.md) · [15](15_CRM_PLATFORM.md) · [14](14_AFFILIATE_PLATFORM.md) · [17](17_ADMIN_ERP.md) · [35](35_OPEN_DECISIONS.md) · [27](27_SECURITY_ARCHITECTURE.md) · [21](21_API_ARCHITECTURE.md) · [20](20_DATABASE_ARCHITECTURE.md) · [23](23_NOTIFICATION_ARCHITECTURE.md) · `packages/database/prisma/schema.prisma` · `apps/api/src/*`

**Authority boundary:** Architecture and sequencing only. **Do not** write production code, Prisma migrations, UI, APIs, application folders, or database tables under this CR. **Do not** start R12-A/B/C/D/E/F/G/H implementation. **Do not** start R10-E/F, R13+, or R14 live-money work.

---

## 0. Purpose and non-goals

### Purpose

Define the canonical **R12** wave so future **CR-R12-*-IMPL** work can deliver Book 93 acceptance:

> **Non-clinical CRM 360**; **campaigns**; **coupons**; **affiliate web**; **referral**; **loyalty/membership**; **wishlist**; **reviews/Q&A**; **personalization hooks**; **subscription/refill marketing hooks** (clinical refill gated **OD-RX-REFILL**).

…without duplicating identity/RBAC, consent, health record, appointments, payment, logistics, notification/outbox, CMS/help/support, or finance/affiliate liability kernels; **without** absorbing R10-E/F, caregiver proxy, platform analytics search (R13), or live money (R14).

### Non-goals (this CR)

| Forbidden | Reason |
|-----------|--------|
| Production code / migrations / UI / APIs / tables | Plan only |
| R12 IMPL authorization | Requires **CR-POST-R12-PLAN-AUDIT-206** green, then **CR-R12-*-IMPL-*** |
| R10-E/F implementation | Separate deferred CR scope |
| R13+ planning / implementation | Explicit hard stop |
| Caregiver/household proxy (OD-CRM-01) | Legal gate — not v1 |
| Clinical automation, autonomous diagnosis/prescribing | Never without future CR |
| Doctor/lab **public ratings** (OD-RATE-01) | Pack-off; product reviews only in R12 |
| Live PSP, payouts, carriers, production healthcare | **R14** |
| WhatsApp/SMS production adapters unless pack + legal enable | Country-gated; sandbox in-app only v1 |
| External search/analytics vendors (Elasticsearch, BI warehouse) | **R13** |
| Affiliate mobile app | **DEFERRED** per Book 93 |
| Churn ML models | **OD-CRM-07** — rules v1 only |
| Auto-refill execution (OD-RX-REFILL) | R5-E shipped request/re-auth only; auto_execute OFF |
| Duplicate CMS, notification engine, or support ticket kernel | Extend R11 kernels |

### Boundary labels

| Label | Meaning |
|-------|---------|
| **ENGINEERING** | Sandbox, pack-gated, fail-closed — build when IMPL-authorized |
| **LEGAL** | Human/legal gate — blocks enablement, not necessarily planning |
| **PRODUCT** | Product decision — document as OD-R12-* if unresolved |
| **PRODUCTION** | Live traffic, live money, production healthcare — **NOT GRANTED** |

---

## 1. Canonical current state (verified 29 Aug 2026)

| Claim | Verified | Evidence |
|-------|----------|----------|
| R11 closed | **YES** | [204](204_POST_R11_E_AUDIT.md) — **R11_GREEN_CLOSED_R12_READY_FOR_PLANNING** |
| R10 care-nav closed | **YES** | [192](192_POST_R10_D_AUDIT.md) |
| R9 consent/RLS closed | **YES** | [182](182_POST_R9_FINAL_CLOSURE_AUDIT.md) |
| CRM API module | **NO** | No `apps/api/src/crm/` |
| Admin CRM/marketing UI | **NO** | `web-admin/src/nav.ts` — CMS + Support only |
| Affiliate web app | **NO** | `apps/web-affiliate` — PLANNED in `app-topology.ts`; 0 files |
| Promo checkout kernel | **PARTIAL** | `PromoCampaign`, `PromoApplication`; `cart.service.ts` `setPromo` / `computePromo` |
| Promo admin APIs | **NO** | No admin CRUD for campaigns |
| Affiliate attribution checkout | **PARTIAL** | `AffiliateAttributionSnapshot`; cart `affiliate_code`; order snapshots |
| Affiliate earnings API | **PARTIAL** | `GET /api/v1/me/affiliate/earnings`; finance admin approve/reverse |
| Affiliate referral codes/links DB | **NO** | No `ReferralCode` / click models — string `affiliateCode` only |
| Loyalty/membership | **NO** | No Prisma models |
| Wishlist | **NO** | No Prisma models |
| Product reviews/Q&A | **NO** | No product review models |
| Personalization kernel | **NO** | No event hook tables |
| Marketing preferences (durable) | **PARTIAL** | Redis via `notification.service.ts`; `marketing: false` default |
| Customer prefs UI | **YES** | `web-customer/src/preferences-page.tsx`; mobile `customer-features.tsx` |
| Marketing campaigns | **NO** | No CRM campaign tables or send pipeline |
| CRM 360 read model | **NO** | No projection service |
| Conversion event stream | **NO** | No dedicated conversion/analytics event table (Book 93 R1 dependency) |
| RxSubscription / RefillRequest | **YES** | R5-E clinical kernel — reuse for **hooks only** |
| CMS / Help / Support | **YES** | R11 complete — **reuse, do not duplicate** |
| Catalog commerce search | **YES** | `CatalogSearchDocument` — commerce only; **not** CRM/customer search |
| FORCE RLS baseline | **YES** | `20260827180000_multi_tenant_rls`; R11 migrations pattern |
| OD-CRM-* / OD-RATE-01 / OD-RX-REFILL | **OPEN** | [35](35_OPEN_DECISIONS.md) |

---

## 2. Current-state repository audit

Classification key: **COMPLETE** · **PARTIAL** · **MISSING** · **REUSABLE KERNEL** · **DEFERRED** · **OUT OF SCOPE**

### 2.1 CRM / Customer 360

| Capability | State | Evidence |
|------------|-------|----------|
| Customer 360 read model | **MISSING** | No `crm` module; [15](15_CRM_PLATFORM.md) spec only |
| Admin customer search | **MISSING** | No `/admin/customers` routes |
| Admin customer detail (360) | **MISSING** | [17](17_ADMIN_ERP.md) §6.29 spec only |
| Lifecycle stages | **MISSING** | [15](15_CRM_PLATFORM.md) §10 — no tables |
| Segments | **MISSING** | — |
| Leads / follow-up | **MISSING** | — |
| Support ticket slice in 360 | **REUSABLE KERNEL** | R11 `SupportTicket*` + admin support APIs |
| Order/commerce slice | **REUSABLE KERNEL** | `order.service.ts`, `Order*` models |
| Appointment/care slice (metadata) | **REUSABLE KERNEL** | `appointment.service.ts` — status/fees only |
| Lab/imaging slice (metadata) | **REUSABLE KERNEL** | `LabBooking`, imaging bookings — no result values |
| Payment slice (status) | **REUSABLE KERNEL** | `PaymentIntent`, order payment snapshots |
| Clinical payload in CRM | **OUT OF SCOPE** | OD-CRM-04 / OD-RBAC-02 — deny by default |
| `reveal-pii` audited reveal | **DEFERRED** | TD-R11A-04 — not implemented |
| Household/caregiver 360 | **DEFERRED** | OD-CRM-01 |
| B2B lead ownership | **DEFERRED** | OD-CRM-05 |

### 2.2 Marketing / campaigns

| Capability | State | Evidence |
|------------|-------|----------|
| Campaign objects (CRM) | **MISSING** | No `Campaign` Prisma model |
| Segment evaluation | **MISSING** | — |
| Campaign send pipeline | **MISSING** | Notification kernel exists but no campaign orchestrator |
| Marketing opt-in (durable) | **PARTIAL** | Redis prefs `marketing: false` default — **not audit-grade** |
| Consent gating before send | **MISSING** | No campaign send code |
| Suppression / unsubscribe list | **MISSING** | — |
| Abandoned cart automation | **MISSING** | Cart exists; no idle trigger job |
| WhatsApp/SMS channel | **DEFERRED** | OD-CRM-02 — pack-gated; not global v1 |
| Notification templates CMS overlap | **PRODUCT** | Resolve OD-R12-01 — may reuse CMS for creatives |
| Pack keys `crm.channels[]` | **MISSING** | [15](15_CRM_PLATFORM.md) §14 — not in policy schema yet |

### 2.3 Coupons / promos

| Capability | State | Evidence |
|------------|-------|----------|
| `PromoCampaign` schema | **COMPLETE** | `schema.prisma` L1812–1828 |
| Checkout promo apply | **COMPLETE** | `POST .../checkout/sessions/:id/promo`; `computePromo` |
| Promo redemption on order | **COMPLETE** | `OrderPromoSnapshot`; finance promo facts |
| Admin promo CRUD | **MISSING** | No admin controller |
| Campaign ↔ promo linkage in CRM | **MISSING** | Promo is checkout-only today |
| Customer promo UX (web/mobile) | **MISSING** | No `promo` in `apps/web-customer/src` |
| Stacking rules (affiliate + promo) | **PARTIAL** | Quote fingerprint includes both; **OD-AFF-07** rules TBD |
| Seed/test promos | **PARTIAL** | Finance e2e seeds campaigns directly |

### 2.4 Affiliate / referral

| Capability | State | Evidence |
|------------|-------|----------|
| Checkout attribution | **PARTIAL** | `AffiliateAttributionSnapshot`; `startCheckout(affiliateCode)` |
| Order affiliate snapshot | **COMPLETE** | `OrderAffiliateSnapshot`; `clinicalBlocked` default true |
| Affiliate liability + finance | **COMPLETE** | `AffiliateLiability`; `finance.service.ts`; admin approve/reverse |
| `GET me/affiliate/earnings` | **PARTIAL** | `affiliate.controller.ts` — list only |
| Referral codes / links / clicks | **MISSING** | No DB models per [14](14_AFFILIATE_PLATFORM.md) §5 |
| Affiliate web app | **MISSING** | `apps/web-affiliate` PLANNED, not created |
| Affiliate mobile | **DEFERRED** | Book 93 §4; `app-topology.spec.ts` |
| Admin affiliate partner ops UI | **PARTIAL** | Finance admin routes; no dedicated affiliate module UI |
| Self-referral / fraud signals | **PARTIAL** | `abuse.service.ts` type `affiliate_abuse` — no full rules |
| Clinical category earn default OFF | **COMPLETE** | `clinicalBlocked: true` on attribution + liability |

### 2.5 Loyalty / membership

| Capability | State | Evidence |
|------------|-------|----------|
| Loyalty program models | **MISSING** | No Prisma models |
| Points ledger | **MISSING** | Wallet/ledger exist for money — **not** points |
| Membership tiers | **MISSING** | — |
| OD-CRM-03 resolution | **PRODUCT** | Coupons first; loyalty if product commits |

### 2.6 Wishlist

| Capability | State | Evidence |
|------------|-------|----------|
| Wishlist models | **MISSING** | — |
| Customer wishlist UI | **MISSING** | web-customer / mobile |
| Wishlist → cart bridge | **MISSING** | — |

### 2.7 Reviews / ratings

| Capability | State | Evidence |
|------------|-------|----------|
| Product reviews | **MISSING** | — |
| Product Q&A | **MISSING** | — |
| Doctor/lab public ratings | **DEFERRED** | **OD-RATE-01** — pack-off; **not R12** |
| CMS "submit-review" workflow | **OUT OF SCOPE** | OD-CMS-01 medical-claim review — not commerce reviews |
| Vendor review moderation | **MISSING** | — |

### 2.8 Personalization

| Capability | State | Evidence |
|------------|-------|----------|
| Personalization event hooks | **MISSING** | Book 93 "hooks" — no tables |
| Recommendation engine | **DEFERRED** | **R13** |
| Rule-based surface hints | **MISSING** | — |

### 2.9 Subscription / refill hooks

| Capability | State | Evidence |
|------------|-------|----------|
| `RefillRequest` / `RxSubscription` | **COMPLETE** | R5-E — clinical kernel |
| Auto-refill execution | **OUT OF SCOPE** | `autoExecuteEnabled` default false; **OD-RX-REFILL** |
| Marketing reorder/reminder hooks | **MISSING** | No CRM automation tied to purchase history |
| Refill reminder notifications | **MISSING** | Notification prefs exist; no refill automation |

### 2.10 Analytics / search expansion

| Capability | State | Evidence |
|------------|-------|----------|
| Platform BI / warehouse | **DEFERRED** | **R13** |
| PHI analytics | **OUT OF SCOPE** | R13 with IAM |
| Commerce catalog search | **REUSABLE KERNEL** | `catalog/search.service.ts` |
| CMS/help search | **REUSABLE KERNEL** | R11 `CmsSearchService` |
| CRM customer search (deterministic) | **MISSING** | R12 may add DB search — not external vendor |
| Conversion event indexing | **MISSING** | Book 93 depends on R1 events — **R12-A must introduce minimal event log** |

### 2.11 R11 kernels (preserve)

| Kernel | State | Evidence |
|--------|-------|----------|
| CMS | **COMPLETE** | `apps/api/src/cms/` |
| Help Center | **COMPLETE** | public help APIs + customer/mobile UI |
| Support Desk | **COMPLETE** | admin + customer support; Postgres durable |
| Notification inbox/prefs | **REUSABLE KERNEL** | `notification.service.ts` |
| Outbox / security events | **REUSABLE KERNEL** | `outbox`, `SecurityEvent` patterns from R11 |

---

## 3. Canonical R12 scope

Aligned strictly with [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §R12.

### 3.1 IN SCOPE

| Domain | R12 capabilities |
|--------|------------------|
| **CRM** | Non-clinical Customer 360 read model; admin customer search/detail; lifecycle stage (rules v1); segments (rules v1); leads (customer inbound + handoff); link to existing support tickets |
| **Marketing** | Durable marketing preferences; suppression list; campaign objects; scheduled/batch send via notification kernel; consent gating; abandoned-cart / win-back **automation hooks** (in-app v1); pack-gated channel list |
| **Coupons** | Admin promo campaign CRUD; customer checkout promo UX; redemption visibility in 360 |
| **Affiliate** | `apps/web-affiliate` web app; referral codes/links; click/attribution records; expand `me/affiliate`; admin affiliate ops screens; preserve clinicalBlocked default |
| **Referral** | Customer referral program hooks (distinct from affiliate if OD-R12-02 resolves separate) — minimal v1: share link + attribution |
| **Loyalty** | Optional minimal program if OD-CRM-03 commits in R12 — else stub hooks only |
| **Wishlist** | Per-person saved catalog offers/items; add-to-cart bridge |
| **Reviews** | **Product** reviews + Q&A on catalog items — moderated; **not** doctor/lab ratings |
| **Personalization** | Append-only event hook table + server-side rule hints (no ML) |
| **Subscription/refill hooks** | Commerce reminders from **purchase history**; link to existing `RefillRequest` / `RxSubscription` status in 360; notification-only — **no auto-execute** |

**Book 93 acceptance (must pass R12-H):**

1. Admin 360 shows orders, bookings, tickets, payments **without lab values or clinical payloads**.
2. Campaign send **suppressed** when `marketing !== true` (explicit allow).
3. Affiliate web shows own earnings; clinical affiliate payout remains blocked by default.
4. Product review visible on catalog after moderation; no PHI in review text.

### 3.2 DEFERRED (R13+ or later CR)

| Item | Reason |
|------|--------|
| Platform search split indexes (commerce/provider/content/clinical) | **R13** |
| Recommendations / ML churn | **R13** / OD-CRM-07 |
| Analytics/BI dashboards | **R13** |
| Doctor/lab public ratings | **OD-RATE-01** |
| WhatsApp/SMS production BSP | OD-CRM-02 + legal |
| Live chat support | OD-CRM-08 / OD-SUP-01 |
| Affiliate mobile | Book 93 DEFERRED |
| Household/caregiver proxy | OD-CRM-01 |
| B2B corporate leads | OD-CRM-05 |
| Auto-refill execution | OD-RX-REFILL |
| R10-E/F | Explicitly deferred |
| Live money / payouts / carriers | **R14** |
| External search vendors | **R13** |

### 3.3 EXCLUDED (must not enter R12)

| Exclusion | Notes |
|-----------|-------|
| R10-E/F | Unless separately authorized |
| Caregiver proxy | Unless separately authorized |
| Clinical automation, autonomous diagnosis/prescribing | Never in R12 |
| Production healthcare integrations | Sandbox only |
| Live PSP, real payouts, tax, carriers | **R14** |
| PHI in marketing segments or campaign bodies | Forbidden |
| Doctor/lab star ratings | OD-RATE-01 |
| Duplicate support/CMS/notification kernels | Extend R11 |
| Platform rewrites unrelated to R12 domains | — |
| R13 analytics/marketing warehouse work | — |

---

## 4. Architecture — bounded contexts

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         apps/web-admin (shell)                          │
│  CRM 360 │ Marketing │ Promo admin │ Affiliate admin │ (existing CMS/Support)
└────────────┬──────────────────┬─────────────────┬──────────────────────┘
             │                  │                 │
     ┌───────▼───────┐  ┌───────▼────────┐  ┌─────▼──────┐
     │  CRM context  │  │ Marketing ctx  │  │ Affiliate  │
     │  (NEW kernel) │  │ (NEW kernel)   │  │ (EXTEND    │
     │               │  │                │  │  finance)  │
     └───────┬───────┘  └───────┬────────┘  └─────┬──────┘
             │                  │                  │
             │    ┌─────────────▼─────────────┐    │
             └───►│ Notification + Outbox     │◄───┘
                  │ (REUSE platform kernel)   │
                  └─────────────┬─────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│ Identity/RBAC │ Policy packs │ Audit/SecurityEvent │ Idempotency         │
│ Order │ Cart/Promo │ Payment │ Appointment │ Lab/Imaging │ Health (meta) │
│ CMS/Help/Support (R11) │ Catalog search (commerce)                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Kernel map

| Context | Existing reusable | New required | Owner module | Depends on |
|---------|-------------------|--------------|--------------|------------|
| **CRM 360** | Order, appointment, lab booking, payment, support ticket queries | Projection assembler + optional cache tables | `apps/api/src/crm/` | identity, order, clinical (metadata), support, payment |
| **Marketing** | notification.service, outbox, CMS (creatives) | Campaign, segment, send log, suppression | `crm/marketing` or `marketing/` submodule | CRM 360, notification, policy pack |
| **Promo** | PromoCampaign, cart checkout | Admin CRUD + CRM visibility | extend `cart` + `admin/promo` | catalog, cart |
| **Affiliate** | AffiliateLiability, cart attribution, finance | ReferralCode, Link, Click, Campaign rules | extend `finance/affiliate` + new `affiliate/` | identity, order, finance |
| **Loyalty** | ledger patterns (reference only) | Points account + append-only ledger | `crm/loyalty` | order events, policy pack |
| **Wishlist** | catalog offers | WishlistItem | `commerce/wishlist` | catalog, cart |
| **Reviews** | catalog items | ProductReview, ProductQuestion | `catalog/reviews` | catalog, moderation RBAC |
| **Personalization** | outbox | PersonalizationEvent (append-only) | `crm/personalization` | conversion events |
| **Refill hooks** | RefillRequest, RxSubscription | Automation triggers only | `crm/automation` | clinical (read status), notification |

### 4.2 Data boundaries

| Data | Write owner | CRM role |
|------|-------------|----------|
| Person/Account | identity | read masked |
| Orders | order | read metadata |
| PaymentIntent | payment | read status |
| ConsentGrant | clinical | **no read in CRM 360** |
| HealthArtifact | health | **deny** — pointer only if ever needed |
| SupportTicket | support (R11) | read + link |
| PromoCampaign | promo (R12 admin) | read redemption |
| AffiliateLiability | finance | read status |
| Campaign send | marketing | append-only log |

### 4.3 API boundaries

| Surface | Prefix | Audience |
|---------|--------|----------|
| Customer self | `/api/v1/me/*`, `/api/v1/wishlist`, `/api/v1/reviews` | customer JWT |
| Public catalog reviews | `/api/v1/catalog/*/reviews` | public read published only |
| Admin CRM | `/api/v1/admin/crm/*` | company/country admin |
| Admin marketing | `/api/v1/admin/marketing/*` | `campaign:send` |
| Admin promo | `/api/v1/admin/promo/*` | finance/marketing role |
| Admin affiliate | `/api/v1/admin/affiliate/*` | affiliate ops |
| Affiliate self | `/api/v1/me/affiliate/*` | affiliate org owner |
| Partner/vendor | **None in R12 v1** | — |

### 4.4 UI surfaces

| App | R12 additions |
|-----|---------------|
| **web-admin** | `/crm`, `/crm/customers/[id]`, `/marketing`, `/marketing/campaigns/[id]`, `/promo`, `/affiliates` |
| **web-affiliate** | **NEW** — `/`, `/links`, `/earnings`, `/profile` |
| **web-customer** | wishlist, product reviews, checkout promo, referral share, marketing prefs (exists — wire durable API) |
| **mobile** | parity: wishlist, promo at checkout, prefs, referral share |

### 4.5 Security model summary

- **Tenant:** `country_id` on all R12 tables; RLS via `app.can_country` / `app.can_person`.
- **Organization:** affiliate org scope for affiliate APIs; company roles for admin.
- **PHI:** CRM 360 **metadata-only** for care/lab/imaging; no artifact fetch from CRM services.
- **Marketing:** explicit opt-in; transactional notifications unaffected.
- **Object storage:** review images (if any) via `PrivateObjectStore` — no clinical uploads in reviews.

### 4.6 Tenant/country boundaries

- Segments, campaigns, promos, affiliate programs are **country-scoped**.
- Cross-country affiliate code collision handled per **OD-AFF** — unique per country program.
- Policy pack keys gate channels, medicine advertising, loyalty enablement.

---

## 5. Proposed R12 sub-phases

Independently auditable. Each IMPL CR delivers one phase only.

### R12-A — CRM kernel + marketing preferences + conversion events

**Scope:** CRM module; Customer 360 assembler (read-only); admin customer search/list/detail APIs; durable `marketing_preferences` table (migrate from Redis with backfill); minimal `conversion_events` append-only log (Book 93 R1 dependency); pack flags `crm_enabled`; RBAC permissions `crm:read`, `user:read`; admin CRM shell routes (read-only 360).

| Workstream | Deliverables |
|------------|--------------|
| Backend | `crm.module`, `Customer360Service`, `admin/crm.controller`, preferences migration |
| Database | `marketing_preferences`, `conversion_events`, optional `crm_customer_snapshots` |
| Web admin | `/crm`, `/crm/customers/[id]` — masked 360 tabs |
| Mobile | — |
| Security | FORCE RLS; deny health artifact joins; audit `CRM_CUSTOMER_VIEW` |
| PHI | Operational metadata only — **NO clinical payloads** |
| Idempotency | Preference PATCH idempotent; conversion event ingest idempotent by `(source, source_id, kind)` |
| Tests | `r12a.crm-kernel.e2e` — 360 without lab values; cross-country deny; marketing pref default false |
| Non-goals | Campaign send, segments, loyalty, affiliate web |

**Depends:** R11 support/order/appointment APIs stable.

---

### R12-B — Marketing campaigns + segments + consent gating

**Scope:** Segment definitions (rules v1 JSON); campaign lifecycle; batch send orchestrator calling notification kernel; suppression list; abandoned-cart trigger (sandbox scheduler); admin marketing UI.

| Workstream | Deliverables |
|------------|--------------|
| Backend | `MarketingService`, segment evaluator, send pipeline |
| Database | `crm_segments`, `crm_campaigns`, `crm_campaign_sends`, `crm_suppressions` |
| Web admin | `/marketing`, campaign editor, segment preview counts |
| Mobile | — |
| Security | `campaign:send` permission; no send if `marketing !== true` |
| PHI | Segments forbid clinical result fields — e2e negative |
| Idempotency | Send batch idempotency key per `(campaign_id, person_id, variant)` |
| Tests | `r12b.marketing.e2e` — suppressed without consent; send creates inbox only |
| Non-goals | WhatsApp production; ML segments; external ESP |

**Depends:** R12-A preferences + 360.

---

### R12-C — Promo admin + customer checkout UX

**Scope:** Admin CRUD for `PromoCampaign`; list redemptions; customer web/mobile promo entry at checkout; CRM 360 coupon slice.

| Workstream | Deliverables |
|------------|--------------|
| Backend | `admin/promo.controller`; validation (expiry, max redemptions, country) |
| Database | Extend `PromoCampaign` if needed (status, created_by — **plan only**); RLS on promo tables |
| Web admin | `/promo` list/editor |
| Web customer + mobile | Checkout promo field + apply/remove |
| Security | Admin RBAC; customer can only apply valid codes for own session |
| Idempotency | Existing checkout promo idempotency preserved |
| Tests | `r12c.promo.e2e` — admin create → customer apply → order snapshot |
| Non-goals | Loyalty points; stack rule changes beyond existing quote fingerprint |

**Depends:** R12-A (360 visibility). Can parallel R12-B after A.

---

### R12-D — Affiliate web + referral attribution

**Scope:** Create `apps/web-affiliate`; referral code/link/click models; expand `me/affiliate` (links, stats); admin affiliate partner screens; preserve `clinicalBlocked`.

| Workstream | Deliverables |
|------------|--------------|
| Backend | `affiliate/` module; referral CRUD; click ingest; link generator |
| Database | `affiliate_referral_codes`, `affiliate_links`, `affiliate_clicks`, `affiliate_campaigns` |
| Web affiliate | New app shell — links, earnings, KYC status read |
| Web admin | `/affiliates` — approve, fraud flags, commission review (integrate finance) |
| Security | Org isolation; affiliate cannot see other affiliates; admin finance SoD |
| PHI | None |
| Idempotency | Click ingest dedupe by `click_id` |
| Tests | `r12d.affiliate.e2e` — attribution → order → liability; clinical blocked |
| Non-goals | Affiliate mobile; live payout |

**Depends:** R12-A conversion events; existing finance liability kernel.

---

### R12-E — Loyalty (minimal) + wishlist

**Scope:** Wishlist CRUD; optional loyalty program if OD-CRM-03 resolved to include — else wishlist-only phase with loyalty stub tables disabled by pack.

| Workstream | Deliverables |
|------------|--------------|
| Backend | `wishlist.service`; optional `loyalty.service` |
| Database | `wishlist_items`; `loyalty_programs`, `loyalty_accounts`, `loyalty_ledger_entries` |
| Web customer + mobile | `/account/wishlist`; heart on catalog |
| Web admin | Loyalty program config (if enabled) |
| Security | Person-scoped wishlist RLS |
| PHI | None |
| Tests | `r12e.wishlist.e2e`; loyalty accrual on order paid (if enabled) |
| Non-goals | Stored-value legal compliance — **LEGAL** if redeemable for money |

**Depends:** R12-C (order events for loyalty accrual).

---

### R12-F — Product reviews/Q&A + personalization hooks

**Scope:** Moderated product reviews and Q&A; public read published; personalization event emission on view/cart/order (append-only).

| Workstream | Deliverables |
|------------|--------------|
| Backend | `reviews.service`, moderation transitions |
| Database | `product_reviews`, `product_review_responses`, `product_questions`, `personalization_events` |
| Web customer + mobile | Review form on product detail; Q&A list |
| Web admin | Review moderation queue |
| Security | Customer can review only verified purchasers (policy); no PHI in text — profanity/PII scan hook |
| PHI | Reviews must not accept clinical uploads |
| Tests | `r12f.reviews.e2e` — submit → moderate → publish; OD-RATE-01 negative (no doctor rating endpoint) |
| Non-goals | Doctor/lab ratings; recommendation ML |

**Depends:** Catalog; R12-A events.

---

### R12-G — Subscription/refill marketing hooks

**Scope:** Automation rules: reorder reminder from purchase history; refill status in 360; notification enqueue linking to existing refill request flow — **no** `autoExecuteEnabled` changes.

| Workstream | Deliverables |
|------------|--------------|
| Backend | `crm/automation` — purchase-history reminder; 360 refill slice |
| Database | `crm_automation_runs` append-only |
| Web customer + mobile | Reminder prefs copy; deep link to refill request |
| Security | Marketing consent for promotional reminders; transactional refill status exempt |
| PHI | Reminder copy commerce-only — "you ordered SKU X" not diagnosis |
| Tests | `r12g.refill-hooks.e2e` — reminder suppressed without marketing; refill API unchanged |
| Non-goals | Auto-refill; payment recurring |

**Depends:** R12-B automation framework; R5-E kernels **read-only**.

---

### R12-H — Closure / regression

**Scope:** Full R12 suite; R0–R11 regression; typecheck/build all apps including `web-affiliate`; runtime checklist; debt documentation.

| Workstream | Deliverables |
|------------|--------------|
| Tests | Combined `r12*.e2e`; full API target; web-admin/customer/mobile/affiliate unit tests |
| Docs | Implementation books per phase; update roadmap |
| Verdict target | **`R12_GREEN_CLOSED_R13_READY_FOR_PLANNING`** |

**Non-goals:** Any new feature scope.

---

## 6. Database planning (proposed — no migrations in this CR)

**Global RLS requirements for all new tables:**

- `ALTER TABLE ... FORCE ROW LEVEL SECURITY`
- Deny-by-default policies — **no `USING(true)`**
- `worldpharma_app` remains `NOSUPERUSER` + `NOBYPASSRLS`
- Country scope via `app.can_country(country_id)`; person scope via `app.can_person(person_id)` where applicable

### 6.1 `marketing_preferences`

| Attribute | Value |
|-----------|-------|
| Purpose | Durable marketing opt-in + channel toggles (replaces Redis) |
| Owner | person × country |
| PHI | **No** — preference flags only |
| PK | `id` UUID |
| FK | `person_id` → Person, `country_id` → Country |
| Unique | `(person_id, country_id)` |
| Indexes | `(country_id, marketing_allowed)` for segment queries |
| Append-only | No — mutable with audit event on marketing flag change |
| RLS | Person read/update own; admin read masked with `crm:read` |
| State machine | — |

Columns: `marketing_allowed` (bool default false), `email_allowed`, `push_allowed`, `sms_allowed`, `whatsapp_allowed`, `updated_at`, `version`.

### 6.2 `conversion_events`

| Attribute | Value |
|-----------|-------|
| Purpose | Minimal R1/R12 attribution feed for affiliate + CRM |
| Owner | country |
| PHI | **No** |
| PK | `id` UUID |
| FK | `person_id?`, `country_id`, `order_id?`, `session_id?` |
| Unique | `(source, source_key, event_kind)` idempotency |
| Indexes | `(country_id, occurred_at)`, `(person_id, occurred_at)` |
| Append-only | **Yes** — INSERT only policies |
| RLS | Admin/analyst read via country; person read own |

Event kinds: `ORDER_PAID`, `CHECKOUT_STARTED`, `CART_ABANDONED`, `BOOKING_COMPLETED`, `AFFILIATE_CLICK`, etc.

### 6.3 `crm_segments`

| Attribute | Value |
|-----------|-------|
| Purpose | Saved audience definitions (rules JSON v1) |
| Owner | country |
| PHI | **No** — rules validated to reject clinical fields |
| PK | `id` UUID |
| FK | `country_id`, `created_by` |
| Unique | `(country_id, code)` |
| Indexes | `(country_id, status)` |
| RLS | Country admin + `campaign:send` |

### 6.4 `crm_campaigns`

| Attribute | Value |
|-----------|-------|
| Purpose | Marketing campaign header |
| Owner | country |
| PHI | **No** |
| PK | `id` UUID |
| FK | `country_id`, `segment_id`, optional `cms_content_id` for creative |
| Unique | `(country_id, code)` |
| State machine | See §9.2 |
| RLS | Country scope + RBAC |

### 6.5 `crm_campaign_sends`

| Attribute | Value |
|-----------|-------|
| Purpose | Append-only send log per person |
| Owner | country |
| PHI | **No** — template_id only |
| PK | `id` UUID |
| FK | `campaign_id`, `person_id`, `country_id` |
| Unique | `(campaign_id, person_id, idempotency_key)` |
| Append-only | **Yes** |
| RLS | Admin; person read own send metadata |

### 6.6 `crm_suppressions`

| Attribute | Value |
|-----------|-------|
| Purpose | Unsubscribe/bounce/legal stop |
| Owner | person × country |
| PK | `id` UUID |
| Unique | `(person_id, country_id, channel)` |
| Append-only | Insert + soft revoke via `revoked_at` |

### 6.7 `crm_leads`

| Attribute | Value |
|-----------|-------|
| Purpose | Pre-customer inbound leads |
| Owner | country |
| PHI | **No** |
| PK | `id` UUID |
| FK | `country_id`, optional `person_id` after conversion |
| State machine | See §9.3 |
| RLS | Country ops roles |

### 6.8 Promo tables (existing + planned extensions)

**Existing:** `promo_campaigns`, `promo_applications` — add RLS if missing in R12-C migration.

**Planned columns on `PromoCampaign`:** `status` (DRAFT/ACTIVE/PAUSED/EXPIRED), `created_by`, `updated_at`, `tenant country enforcement`.

### 6.9 `affiliate_referral_codes`

| Attribute | Value |
|-----------|-------|
| Purpose | Human-readable codes per affiliate program |
| Owner | affiliate org × country |
| PK | `id` UUID |
| FK | `organization_id`, `country_id`, `partner_id` |
| Unique | `(country_id, code)` |
| RLS | Org members read own; admin read country |

### 6.10 `affiliate_links` / `affiliate_clicks`

| Attribute | Value |
|-----------|-------|
| Purpose | Signed links + click tracking |
| Owner | affiliate org |
| PHI | **No** |
| PK | UUID |
| FK | `referral_code_id`, `campaign_id?` |
| Unique clicks | `(click_id)` |
| Append-only | clicks — INSERT only |

### 6.11 `wishlist_items`

| Attribute | Value |
|-----------|-------|
| Purpose | Saved catalog offers |
| Owner | person |
| PK | `id` UUID |
| FK | `person_id`, `catalog_offer_id`, `country_id` |
| Unique | `(person_id, catalog_offer_id)` |
| RLS | Person own only |

### 6.12 `loyalty_programs`, `loyalty_accounts`, `loyalty_ledger_entries`

| Attribute | Value |
|-----------|-------|
| Purpose | Points accrual/redemption (if OD-CRM-03 enables) |
| Owner | country / person |
| PHI | **No** |
| Ledger | **Append-only** entries; balance derived |
| RLS | Person read own; admin configure program |
| Legal | **LEGAL/COMPLIANCE REVIEW REQUIRED** if redeemable for cash |

### 6.13 `product_reviews`, `product_questions`

| Attribute | Value |
|-----------|-------|
| Purpose | Moderated UGC on catalog items |
| Owner | country + catalog item |
| PHI | **Forbidden in content** — reject health claims |
| PK | UUID |
| FK | `catalog_item_id`, `author_person_id`, `order_id?` (verified purchase) |
| State machine | See §9.4 |
| RLS | Public read APPROVED only; author read own |

### 6.14 `personalization_events`

| Attribute | Value |
|-----------|-------|
| Purpose | Hook table for future R13 recommendations |
| Owner | person |
| PHI | **No** |
| Append-only | **Yes** |
| Retention | Pack-configured TTL |

### 6.15 `crm_automation_runs`

| Attribute | Value |
|-----------|-------|
| Purpose | Idempotent automation execution log |
| Owner | country |
| Append-only | **Yes** |
| Unique | `(automation_kind, source_id, person_id)` |

---

## 7. API inventory (planned — no implementation)

Legend: **Auth** JWT audience; **Scope** country/tenant; **PHI** none unless noted; **Audit** security event code.

### 7.1 Admin CRM

| Method | Route | Actor | Auth | Authorization | Scope | Idempotency | PHI | Audit | Errors |
|--------|-------|-------|------|---------------|-------|-------------|-----|-------|--------|
| GET | `/api/v1/admin/crm/customers` | company_support, country_admin | admin JWT | `crm:read` | country | — | none | — | 401,403 |
| GET | `/api/v1/admin/crm/customers/:personId` | same | admin JWT | `crm:read` | country | — | none | CRM_CUSTOMER_VIEW | 401,403,404 |
| GET | `/api/v1/admin/crm/customers/:personId/orders` | same | admin JWT | `crm:read` | country | — | none | — | 404 cross-country |
| GET | `/api/v1/admin/crm/customers/:personId/tickets` | same | admin JWT | `crm:read` | country | — | none | — | — |
| POST | `/api/v1/admin/crm/leads` | ops | admin JWT | `crm:write` | country | Key | none | CRM_LEAD_CREATED | 409 |
| PATCH | `/api/v1/admin/crm/leads/:id/status` | ops | admin JWT | `crm:write` | country | Key | none | CRM_LEAD_TRANSITION | 409 invalid transition |

**Explicitly absent:** any route returning health artifacts, lab values, Rx images, consult notes.

### 7.2 Admin marketing

| Method | Route | Actor | Auth | Authorization | Scope | Idempotency | PHI | Audit |
|--------|-------|-------|------|---------------|-------|-------------|-----|-------|
| GET/POST/PATCH | `/api/v1/admin/marketing/segments` | marketing | admin | `campaign:send` | country | POST Key | none | CRM_SEGMENT_* |
| GET/POST/PATCH | `/api/v1/admin/marketing/campaigns` | marketing | admin | `campaign:send` | country | POST Key | none | CRM_CAMPAIGN_* |
| POST | `/api/v1/admin/marketing/campaigns/:id/schedule` | marketing | admin | `campaign:send` | country | Key | none | CRM_CAMPAIGN_SCHEDULED |
| POST | `/api/v1/admin/marketing/campaigns/:id/send` | marketing | admin | `campaign:send` | country | Key | none | CRM_CAMPAIGN_SENT |
| GET | `/api/v1/admin/marketing/campaigns/:id/sends` | marketing | admin | `campaign:read` | country | — | none | — |

**Send precondition:** target `marketing_allowed === true`; else skip + log suppression.

### 7.3 Admin promo

| Method | Route | Actor | Auth | Authorization | Scope | Idempotency |
|--------|-------|-------|------|---------------|-------|-------------|
| GET/POST/PATCH | `/api/v1/admin/promo/campaigns` | finance/marketing | admin | `promo:manage` | country | POST/PATCH Key |
| GET | `/api/v1/admin/promo/campaigns/:id/redemptions` | finance | admin | `promo:read` | country | — |

### 7.4 Admin affiliate

| Method | Route | Actor | Auth | Authorization | Scope | Idempotency |
|--------|-------|-------|------|---------------|-------|-------------|
| GET | `/api/v1/admin/affiliate/partners` | growth | admin | `affiliate:read` | country | — |
| POST | `/api/v1/admin/affiliate/:orderId/approve` | finance | admin | existing | country | Key (exists) |
| POST | `/api/v1/admin/affiliate/:orderId/reverse` | finance | admin | existing | country | Key (exists) |
| POST | `/api/v1/admin/affiliate/referral-codes` | growth | admin | `affiliate:manage` | country | Key |

### 7.5 Customer APIs

| Method | Route | Actor | Auth | Authorization | Scope | Idempotency |
|--------|-------|-------|------|---------------|-------|-------------|
| GET/PATCH | `/api/v1/me/marketing-preferences` | customer | customer JWT | self | country | PATCH Key |
| GET/POST/DELETE | `/api/v1/me/wishlist` | customer | customer JWT | self | country | POST Key |
| GET/POST | `/api/v1/catalog/items/:id/reviews` | customer | customer JWT | self | country | POST Key |
| GET/POST | `/api/v1/catalog/items/:id/questions` | customer | customer JWT | self | country | POST Key |
| POST | `/api/v1/checkout/sessions/:id/promo` | customer | customer JWT | self | country | exists |
| POST | `/api/v1/checkout/sessions/:id/start` | customer | customer JWT | self + affiliate_code | exists |

### 7.6 Affiliate (partner) APIs

| Method | Route | Actor | Auth | Authorization | Scope |
|--------|-------|-------|------|---------------|-------|
| GET | `/api/v1/me/affiliate/earnings` | affiliate | customer JWT | org_owner affiliate | own org |
| GET/POST | `/api/v1/me/affiliate/links` | affiliate | customer JWT | org_owner | own org |
| GET | `/api/v1/me/affiliate/stats` | affiliate | customer JWT | org_owner | own org |

### 7.7 Public APIs

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/v1/catalog/items/:id/reviews` | none | APPROVED only; deterministic sort |
| POST | `/api/v1/public/affiliate/click` | none | Rate-limited; click_id dedupe |

---

## 8. UI inventory

### 8.1 Web customer

| Route | Flow | States |
|-------|------|--------|
| `/account/preferences` | Marketing + channel toggles | loading, empty N/A, error, forbidden, session expired — **exists; migrate to durable API** |
| `/account/wishlist` | Saved items → add to cart | empty, error, offline |
| `/checkout` | Promo code apply/remove | invalid code, expired, network |
| `/catalog/[slug]` | Reviews + Q&A tab | empty, moderated pending, error |
| `/account/referral` | Share referral link (if program enabled) | disabled by pack, error |

**Accessibility:** WCAG patterns from R11 — form labels, focus management, aria-live for save confirmations.  
**Localization:** country/locale from session; no hardcoded `en`/`XX` regression (carry TD-R11C-03 fix forward).

### 8.2 Mobile

| Screen | Parity |
|--------|--------|
| Preferences | marketing toggle — **exists** |
| Wishlist | **required** |
| Checkout promo | **required** |
| Product reviews | **required** read; submit optional v1 |
| Referral share | share sheet |

**Offline:** read-only cache for wishlist; queue preference PATCH with retry (improve TD-R11C-04 pattern).

### 8.3 Web admin

| Route | Flow |
|-------|------|
| `/crm` | Customer search → list |
| `/crm/customers/[personId]` | 360 tabs: Profile, Orders, Care (meta), Labs (meta), Payments, Tickets, Campaigns, Coupons, Affiliate |
| `/marketing` | Campaign list |
| `/marketing/campaigns/[id]` | Edit segment, schedule, send, view sends |
| `/marketing/segments/[id]` | Rule builder (rules v1) |
| `/promo` | Promo campaign CRUD |
| `/affiliates` | Partner list, referral codes, commission review |
| `/reviews` | Moderation queue |

**Governance:** permission-denied states; conflict 409 on campaign state transitions; no clinical tabs.

### 8.4 Web affiliate (new app)

| Route | Flow |
|-------|------|
| `/` | Dashboard — earnings summary |
| `/links` | Create/copy referral links |
| `/earnings` | Conversion list |
| `/profile` | KYC status read-only |

**Auth:** affiliate org JWT; redirect if not affiliate partner.

### 8.5 Partner/vendor

**OUT OF SCOPE** for R12 v1 unless explicitly added by future CR.

---

## 9. State machines

Server authoritative (`assert*Transition` pattern from R11). UI hints non-binding.

### 9.1 `PromoCampaign` (extended)

| State | Terminal |
|-------|----------|
| DRAFT → ACTIVE → PAUSED → EXPIRED | EXPIRED |

| Transition | Actor | Invalid |
|------------|-------|---------|
| DRAFT→ACTIVE | admin `promo:manage` | 409 |
| ACTIVE→PAUSED | admin | 409 |
| *→EXPIRED | system job or admin | — |

**Concurrency:** `version` column optimistic lock.

### 9.2 `CrmCampaign`

| State | Meaning |
|-------|---------|
| DRAFT | Editing |
| SCHEDULED | Future send |
| SENDING | Batch in progress |
| COMPLETED | Send finished |
| CANCELLED | Terminal |

**Invalid transition:** 409. **Idempotency:** send operation keyed.

### 9.3 `CrmLead`

| State | Terminal |
|-------|----------|
| NEW → CONTACTED → QUALIFIED → CONVERTED / DISQUALIFIED | CONVERTED, DISQUALIFIED |

### 9.4 `ProductReview`

| State | Terminal |
|-------|----------|
| SUBMITTED → APPROVED / REJECTED | APPROVED, REJECTED |

Public visibility: **APPROVED** only. **Rejected** visible to author as "not published".

### 9.5 `AffiliateAccount` (existing blueprint — implement if not in DB)

APPLIED → KYC_PENDING → APPROVED / REJECTED; SUSPENDED; CLOSED — per [14](14_AFFILIATE_PLATFORM.md) §4.

### 9.6 `RxSubscription` (existing — **read-only in R12**)

No new transitions in R12. R12-G may **read** status for 360 only.

---

## 10. Security / privacy / RLS / PHI model

### 10.1 Authentication

- All admin routes: JWT + `AudienceGuard` company/admin audiences.
- Customer routes: customer JWT, own person.
- Affiliate routes: customer JWT + affiliate org membership.
- Public review read: no auth; rate limit by IP.

### 10.2 RBAC (new permissions — plan)

| Permission | Grant |
|------------|-------|
| `crm:read` | support, country_admin, analyst (masked) |
| `crm:write` | country_admin, ops |
| `campaign:send` | marketing role, country_admin |
| `campaign:read` | analyst, marketing |
| `promo:manage` | finance, marketing |
| `promo:read` | support, finance |
| `affiliate:read` | growth, finance |
| `affiliate:manage` | growth |
| `review:moderate` | catalog ops, country_admin |

**Explicitly NOT granted to support:** `health_artifact:read`, clinical payload permissions.

### 10.3 Tenant / country / organization isolation

- Every query includes `country_id` from tenant context.
- Affiliate org APIs filter `organization_id` from membership.
- Cross-country customer lookup → 404 (not 403 leak).

### 10.4 RLS

- All §6 tables: FORCE RLS.
- Policies: `USING (app.can_country(country_id))` for admin context; person tables also `app.can_person(person_id)`.
- Append-only tables: deny UPDATE/DELETE for app role.
- Promo/affiliate tables currently **may lack RLS** — R12-C/D migrations must add.

### 10.5 Object storage

- Review media (if allowed): `PrivateObjectStore` — customer upload, admin moderate.
- **No** Rx/lab uploads in review flows.

### 10.6 Audit trails / security events

Emit: `CRM_CUSTOMER_VIEW`, `CRM_CAMPAIGN_SENT`, `MARKETING_PREF_CHANGED`, `PROMO_CAMPAIGN_PUBLISHED`, `AFFILIATE_REFERRAL_CREATED`, `PRODUCT_REVIEW_MODERATED`.

Payloads: opaque IDs only — no clinical content, no full email bodies.

### 10.7 Outbox / notifications

- Campaign send → `NotificationService.enqueueInbox` — generic title/body.
- Marketing messages **never** include lab values, diagnoses, or Rx details.
- Transactional order/refill status may send with `marketing: false` — classify as transactional in template metadata.

### 10.8 Rate limits

- Public affiliate click ingest: abuse service `affiliate_abuse`.
- Review submit: per-person daily cap.
- Campaign send: batch throttle in worker.

### 10.9 PHI touch domains

| Domain | PHI risk | Mitigation |
|--------|----------|------------|
| CRM 360 | **High if misimplemented** | Metadata-only projection; e2e matrix |
| Marketing segments | **High** | Schema validate rules — forbid clinical fields |
| Campaign bodies | Medium | Template IDs; CMS review for health claims |
| Product reviews | Medium | Moderation; no medical advice |
| Wishlist | Low | Commerce SKUs only |
| Affiliate | Low | No clinical earn default |
| Refill hooks | Medium | Commerce copy only; link to clinical flow separately |

**Default: NO clinical access from R12 modules.**

---

## 11. Search / analytics plan

### 11.1 R12 scope (in-wave)

| Need | Approach |
|------|----------|
| Admin customer search | Deterministic DB query: name hash, email/phone last4, person_id — **like CmsSearchService** |
| Segment preview counts | SQL over 360 projection + conversion_events — batch only |
| Product review browse | Filter on `catalog_item_id` + status APPROVED; sort created_at desc |
| Public catalog search | **Reuse** existing `CatalogSearchDocument` — no change |

### 11.2 R13 deferral

- Split indexes (commerce/provider/content/clinical/PHI)
- Typeahead recommendations
- BI warehouse / dashboards
- ML ranking

### 11.3 Indexed fields (R12 customer search)

`person_id`, masked `display_name`, `email_domain_hash`, `phone_last4`, `country_id`, `lifecycle_stage`, `last_order_at` — **no clinical fields**.

### 11.4 Privacy / retention

- `personalization_events`: pack TTL (e.g. 90 days sandbox).
- `conversion_events`: retain per finance/analytics policy — no PHI columns.
- Campaign sends: retain send metadata 24 months default — **LEGAL** per country.

---

## 12. Open decisions (`OD-R12-*`)

| ID | Question | Why it matters | Affected domains | Safe default if unresolved | Blocks impl? |
|----|----------|----------------|------------------|----------------------------|--------------|
| **OD-R12-01** | CMS vs dedicated template store for campaign creatives | Duplication vs unified content | Marketing | Reuse CMS published snippets as creative refs | No — default CMS refs |
| **OD-R12-02** | Customer referral program separate from affiliate partner program | Two attribution models | Affiliate, CRM | Single attribution kernel; `program_kind` enum | No — default single kernel |
| **OD-R12-03** | Loyalty points in R12 vs stub only | OD-CRM-03 | Loyalty | **Stub tables + pack `loyalty.enabled=false`** | No — wishlist ships without loyalty |
| **OD-R12-04** | Verified-purchase required for reviews | Fraud vs friction | Reviews | **Require order line match** | No |
| **OD-R12-05** | Promo stacking with affiliate (OD-AFF-07) | Margin | Promo, Affiliate | **Allow both; quote fingerprint already combines** | No |
| **OD-R12-06** | Migrate Redis notification prefs synchronously vs dual-write | Data loss risk | Marketing | Dual-write R12-A; Redis deprecated after cutover | No |
| **OD-R12-07** | Medicine advertising in campaigns | Legal | Marketing | **Pack `crm.medicine_advertising=false` default** | **Yes for med ads** — not for kernel |
| **OD-R12-08** | Analyst role access to 360 | Privacy | CRM | Analyst gets aggregated segments only; no 360 detail | No |

**Carried open decisions (not silently resolved):**

- OD-CRM-01 through OD-CRM-08
- OD-RATE-01 (doctor/lab ratings — **out of R12**)
- OD-RX-REFILL (auto-refill — **out of R12**)
- OD-AFF-06, OD-AFF-07

---

## 13. Engineering defaults (`ED-R12-*`)

| ID | Default |
|----|---------|
| **ED-R12-01** | Deny-by-default RBAC for all new permissions |
| **ED-R12-02** | `marketing_allowed` default **false** at DB level |
| **ED-R12-03** | Campaign send skips (not fails) when marketing false — log suppression |
| **ED-R12-04** | CRM 360 never calls health artifact services |
| **ED-R12-05** | Server-authoritative state machines — 409 on invalid transition |
| **ED-R12-06** | Idempotency-Key on all mutating POST/PATCH admin endpoints |
| **ED-R12-07** | Append-only send logs, conversion events, loyalty ledger, personalization events |
| **ED-R12-08** | FORCE RLS on every new table; no `USING(true)` |
| **ED-R12-09** | PHI-minimal security events — IDs only |
| **ED-R12-10** | Reuse notification/outbox/CMS/support kernels — no duplicate engines |
| **ED-R12-11** | Affiliate clinical earn **blocked** unless pack explicitly enables + legal checklist |
| **ED-R12-12** | `autoExecuteEnabled` on RxSubscription **never set true** in R12 code paths |
| **ED-R12-13** | Deterministic search sort orders (stable tie-break by id asc) |
| **ED-R12-14** | Pack flag `crm_enabled` default false in empty pack; true in XX sandbox test helper |
| **ED-R12-15** | Product reviews — no health claims; moderation required before public |
| **ED-R12-16** | No external search/analytics vendors in R12 |

---

## 14. Acceptance gates

| Gate | A | B | C | D | E | F | G | H |
|------|---|---|---|---|---|---|---|---|
| Focused e2e | crm 360 | campaign consent | promo flow | affiliate web | wishlist | reviews | refill hook | full R12 |
| RLS/tenancy negatives | **req** | **req** | **req** | **req** | **req** | **req** | **req** | **req** |
| Auth negatives | **req** | **req** | **req** | **req** | **req** | **req** | **req** | **req** |
| State-machine tests | — | campaign | promo | — | — | review | — | combined |
| Idempotency tests | prefs | send | promo apply | click | wishlist add | review submit | automation | — |
| Concurrency tests | prefs version | — | redemption count | — | — | — | — | — |
| PHI leakage tests | **360 matrix** | segment rules | — | — | — | review body | reminder copy | **full** |
| Migration verify | **req** | req | req | req | req | req | req | all R12 |
| Typecheck / build | API | +admin | +customer | +web-affiliate | +mobile | — | — | all apps |
| R0–R11 regression | spot | spot | spot | spot | spot | spot | spot | **full** |

**R12 closure target:** **`R12_GREEN_CLOSED_R13_READY_FOR_PLANNING`** — only after **CR-POST-R12-CLOSURE-AUDIT-*** with verification (R11 Book 204 precedent).

---

## 15. Technical debt (carry-forward from R11)

| ID | Status | Classification | R12 impact |
|----|--------|----------------|------------|
| OD-CMS-01 dual-control | Open | product | Campaign creatives may reference CMS — do not conflate |
| TD-R11A-04 `reveal-pii` | Open | deferred | CRM 360 uses masked fields until implemented |
| TD-R11B-02 browser E2E | Open | test infra | Extend pattern for CRM UI tests |
| TD-R11C-01 Help E2E | Open | test infra | — |
| TD-R11C-03 mobile locale/country | Open | product | **Fix during R12 customer work** |
| TD-R11E-01 ARCHIVED→PUBLISHED e2e | Open | product | — |
| TD-R11E-02 dev DB migrate drift | Open | ops | Same harness `migrate deploy` |
| Shared-DB test pollution | Open | test infra | Isolate R12 pack flags in e2e |
| Queue membership v1 | Open | architecture | CRM does not fix — document |
| Redis notification prefs | Open | architecture | **R12-A resolves** via migration |
| Promo tables lack RLS | Open | security | **R12-C must add** |
| No conversion event log | Open | architecture | **R12-A introduces** |

**Do not silently mark R11 debt resolved.**

---

## 16. R11 preservation (mandatory)

R12 **must preserve** without weakening:

| Kernel | Requirement |
|--------|-------------|
| R9 consent/break-glass | No CRM bypass; clinical access unchanged |
| R10 care navigation | No marketing override of safety routing |
| R11 CMS | Reuse for creatives/help — no second CMS |
| R11 Help Center | Public published-only — no draft leak |
| R11 Support Desk | Tickets remain Postgres durable; CLOSED terminal |
| Appointment/payment/logistics | R12 read-only metadata only |
| RLS/security | FORCE RLS; `worldpharma_app` NOBYPASSRLS |
| Support clinical boundary | No health routes in CRM/Support desk |

**No R12 feature may bypass existing authorization or clinical boundaries.**

---

## 17. R13 boundary (must not enter R12)

| R13 scope | Why excluded |
|-----------|--------------|
| Split search indexes (commerce/provider/content/clinical/PHI) | R13 kernel |
| Recommendation engine / ML | R13 |
| Analytics warehouse / BI dashboards | R13 |
| PHI analytics IAM | R13 + legal |
| Symptom-to-drug public search | Safety — R13 role-gated clinical search |
| External Elasticsearch/OpenSearch | R13 decision |

R12 may emit **`personalization_events`** and **`conversion_events`** as **feeds** for R13 — not consume them for ML.

---

## 18. Production boundaries (R12)

**Remain OFF:**

- Live PSP, live money, bank payouts, real carriers (**R14**)
- Production healthcare, live e-Rx, auto-refill execution
- WhatsApp/SMS production BSP (in-app/inbox sandbox only)
- External ESP/analytics/search vendors
- Doctor/lab public ratings
- Affiliate mobile

R12 is **sandbox-operational** CRM/marketing/commerce extras.

---

## 19. Regression requirements

### 19.1 Must preserve

- R0–R11 full API behavior (R9 consent, R10 care-nav, R11 CMS/help/support).
- R5-E refill request flow — R12-G must not mutate clinical state machines.
- Payment/logistics sandbox boundaries.
- Affiliate `clinicalBlocked` default true.

### 19.2 Focused regression (each IMPL CR)

| Batch | Suites |
|-------|--------|
| R12 core | `r12a.*` … `r12g.*` |
| R11 | `r11a`, cms-admin, help, support-desk |
| R10 + RLS | `r10a`, `r10d`, `rls.tenancy` |
| R9 consent | `r9c.consent-scope-enforcement` |
| Commerce | cart promo e2e, finance affiliate e2e |

### 19.3 Full suite (R12-H)

- `nx test api` — target ≥205/205 or document isolated flakes.
- web-admin, web-customer, mobile, web-affiliate builds PASS.

---

## 20. Verdict

**`R12_PLAN_READY`**

Repository audit confirms: R12 domains are predominantly **MISSING** except **PARTIAL** promo checkout, affiliate liability/attribution, notification prefs (Redis), and R5-E refill/subscription clinical kernels (hooks only). R11 kernels are **COMPLETE** and must be reused. Book 93 scope is clear; R10-E/F and R13+ are excluded.

**No product, security, or architecture blockers prevent R12 plan audit authorization.**

---

## 21. Next authorization

**`CR-POST-R12-PLAN-AUDIT-206`** — Post-plan audit of Book 205 against repository truth and Book 93 acceptance criteria. **Do not** start R12-A implementation until plan audit passes.

After plan audit green, first implementation CR (expected):

**`CR-R12-A-IMPL-207`** — R12-A CRM kernel + marketing preferences + conversion events + admin 360 shell.

**HARD STOP:** Do not implement R12, R10-E/F, or R13+ under this CR.
