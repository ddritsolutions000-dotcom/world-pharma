# 206 — Post-R12 plan audit

**CR:** CR-POST-R12-PLAN-AUDIT-206  
**Verdict:** **R12_PLAN_GREEN_R12_A_READY**  
**Date:** 29 August 2026  
**Audited plan:** [205](205_R12_IMPLEMENTATION_PLAN.md)  
**Baseline:** [204](204_POST_R11_E_AUDIT.md) (**R11_GREEN_CLOSED_R12_READY_FOR_PLANNING**)  
**Canonical roadmap:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. No source, schema, migration, API, UI, test, or configuration changes were made.

---

## Executive summary

Independent audit confirms **Book 205 is a sound, internally consistent R12 implementation plan** aligned with Book 93 §R12 (CRM, marketing, loyalty, affiliate, commerce extras), Books [15](15_CRM_PLATFORM.md) / [14](14_AFFILIATE_PLATFORM.md) / [17](17_ADMIN_ERP.md), and repository truth verified 29 Aug 2026.

**No product, security, database, or architecture blockers** prevent authorization of **CR-R12-A-IMPL-207**.

Minor **planning/documentation debt** is recorded (marketing-preferences route naming vs existing API, review abuse/report workflow detail, optional 360 cache table, legacy promo RLS remediation timing) — none require plan revision before R12-A.

**No R12 implementation code exists** in the repository. R10-E/F and R13+ are not planned in Book 205.

---

## Audit scope

Documentation-only audit of CR-R12-PLAN-205 (Book 205) against Books [204](204_POST_R11_E_AUDIT.md), [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md), [35](35_OPEN_DECISIONS.md), and live repository inspection.

---

## 1. Current-state verification

Book 205 §1–§2 classifications **independently confirmed** against repository 29 Aug 2026.

| Domain | Book 205 | Audit | Evidence |
|--------|----------|-------|----------|
| CRM / Customer 360 | MISSING | **CONFIRMED** | No `apps/api/src/crm/`; no `admin/crm` routes |
| Marketing preferences | PARTIAL | **CONFIRMED** | `notification.service.ts` Redis; `GET/PATCH /api/v1/me/notifications/preferences` |
| Marketing campaigns | MISSING | **CONFIRMED** | No campaign/segment Prisma models |
| Segmentation | MISSING | **CONFIRMED** | — |
| Coupons/promos | PARTIAL | **CONFIRMED** | `PromoCampaign` L1812; `cart.service.ts` `setPromo`/`computePromo`; no admin CRUD |
| Affiliate/referral | PARTIAL | **CONFIRMED** | `AffiliateAttributionSnapshot`, `AffiliateLiability`, `me/affiliate/earnings`; no referral code DB |
| Loyalty | MISSING | **CONFIRMED** | No loyalty models |
| Wishlist | MISSING | **CONFIRMED** | — |
| Product reviews/Q&A | MISSING | **CONFIRMED** | — |
| Personalization hooks | MISSING | **CONFIRMED** | — |
| Refill/reorder marketing hooks | REUSABLE (clinical kernel only) | **CONFIRMED** | `RefillRequest`, `RxSubscription` exist; no CRM automation |
| Conversion events | MISSING | **CONFIRMED** | No conversion event table |
| CMS | COMPLETE | **CONFIRMED** | `apps/api/src/cms/` — 13 files; `CmsContent*` models |
| Help Center | COMPLETE | **CONFIRMED** | `help-center.controller.ts`; `web-customer/app/help/*` |
| Support Desk | COMPLETE | **CONFIRMED** | `admin-support.controller.ts`; `web-admin/app/support/*` |
| Notifications/outbox | REUSABLE KERNEL | **CONFIRMED** | `notification.controller.ts`, `OutboxService` in support kernel |
| Commerce search | REUSABLE KERNEL | **CONFIRMED** | `CatalogSearchDocument`; not CRM search |
| CMS search | REUSABLE KERNEL | **CONFIRMED** | `CmsContentSearchDocument`; `cms-search.service.ts` |
| Platform analytics/BI | DEFERRED | **CONFIRMED** | No warehouse; Book 205 assigns R13 |
| Doctor/lab ratings | DEFERRED | **CONFIRMED** | OD-RATE-01; no rating models |
| Affiliate web app | MISSING | **CONFIRMED** | `app-topology.ts` PLANNED; 0 files under `apps/web-affiliate` |
| Customer prefs UI | COMPLETE | **CONFIRMED** | `preferences-page.tsx`; mobile `customer-features.tsx` marketing toggle |

**No R12 implementation exists.** Book 205 current-state claims match repository.

---

## 2. Canonical R12 scope audit

| Check | Result |
|-------|--------|
| R12 = CRM 360 + campaigns + coupons + affiliate web + referral + loyalty + wishlist + reviews/Q&A + personalization hooks + refill hooks | **PASS** — Book 205 §3 matches Book 93 §R12 |
| R13 search/recommendations/BI excluded | **PASS** — §3.2, §11, §17 |
| R14 live money excluded | **PASS** — §0, §18 |
| R10-E/F excluded | **PASS** — §0, §3.3 |
| Caregiver/household proxy excluded | **PASS** — OD-CRM-01 deferred |
| Clinical automation / autonomous diagnosis/prescribing excluded | **PASS** — §0, §10 |
| OD-RATE-01 doctor/lab ratings excluded | **PASS** — product reviews only |
| OD-RX-REFILL auto-refill excluded | **PASS** — hooks only; `autoExecuteEnabled` default false preserved |
| Duplicate CMS/notification/support kernels excluded | **PASS** — §4, §0 |
| No scope creep into R13 PHI analytics | **PASS** |
| Book 93 acceptance criteria restated | **PASS** — §3.1, §14 |

**Scope mismatch:** None identified.

---

## 3. Architecture / kernel reuse

| Kernel | Duplicate planned? | Audit |
|--------|-------------------|-------|
| CMS (R11) | **NO** | Reuse for campaign creatives (OD-R12-01) |
| Notification | **NO** | Reuse `NotificationService`; campaign orchestrator calls inbox only |
| Support (R11) | **NO** | 360 reads tickets; no second ticket system |
| Payment / Order | **NO** | Read-only metadata in 360 |
| Finance / Affiliate liability | **NO** | Extend; R12-D adds referral attribution layer |
| Catalog / commerce search | **NO** | Reuse; separate CRM customer search planned |
| Health / consent | **NO** | Explicit deny in CRM 360 |
| Identity / RBAC | **NO** | New permissions only |

### New kernel ownership (verified in Book 205 §4)

| Kernel | Owner | Data source | API boundary | UI boundary | Security boundary |
|--------|-------|-------------|--------------|-------------|-------------------|
| CRM 360 | `crm/` | Order, appointment, lab, payment, support queries | `/admin/crm/*` | web-admin `/crm` | `crm:read`; metadata-only; RLS |
| Marketing | `marketing/` submodule | Segments, prefs, conversion events | `/admin/marketing/*` | web-admin `/marketing` | `campaign:send`; consent gate |
| Promo admin | extend `cart` | `PromoCampaign` | `/admin/promo/*` | web-admin `/promo` | `promo:manage` |
| Affiliate referral | extend `finance/affiliate` | New referral tables + existing liability | `/me/affiliate/*`, `/admin/affiliate/*` | web-affiliate + admin | org scope; clinicalBlocked |
| Wishlist | `commerce/wishlist` | Catalog offers | `/me/wishlist` | customer/mobile | person RLS |
| Reviews | `catalog/reviews` | Catalog items | catalog review routes | product detail + admin moderation | moderation RBAC |
| Personalization | `crm/personalization` | Append-only events | internal ingest | none v1 | retention TTL |
| Refill hooks | `crm/automation` | RxSubscription status read | automation internal | reminder deep links | marketing consent for promo reminders |

**Architecture blockers:** None.

---

## 4. R12-A readiness audit

Book 205 §5 R12-A is **sufficiently specified** for implementation authorization.

| Requirement | Specified? | Notes |
|-------------|------------|-------|
| Schema (`marketing_preferences`, `conversion_events`) | **YES** | §6.1–6.2 — PK/FK/unique/index/append-only |
| Optional `crm_customer_snapshots` | **PARTIAL** | Marked optional — cache strategy deferred to IMPL (TD-R12-PLAN-04) |
| FORCE RLS / deny-by-default | **YES** | §6 global + §10.4 |
| Permissions (`crm:read`, `user:read`) | **YES** | §10.2 — not yet in `authority.ts` (expected at IMPL) |
| Actor model | **YES** | company_support, country_admin |
| Country/tenant isolation | **YES** | §4.6, §10.3 |
| PHI boundaries | **YES** | §10.9; explicit absence of health routes §7.1 |
| Projection strategy | **YES** | Read-only assembler from domain services — no health artifact calls (§4.1, ED-R12-04) |
| Idempotency | **YES** | prefs PATCH; conversion `(source, source_key, event_kind)` |
| Audit events | **YES** | `CRM_CUSTOMER_VIEW`, `MARKETING_PREF_CHANGED` |
| Failure behavior | **YES** | 404 cross-country; 403 unauthorized |
| Concurrency | **YES** | `version` on marketing_preferences |
| Migration strategy | **YES** | Redis → Postgres dual-write (OD-R12-06 / ED-R12-06 default) |
| Test strategy | **YES** | `r12a.crm-kernel.e2e` — 360 without lab values |
| Admin UI shell | **YES** | `/crm`, `/crm/customers/[id]` |
| Non-goals | **YES** | No campaign send, segments, loyalty, affiliate web |

**CRM metadata-only:** **PASS** — Book 205 explicitly forbids health artifact routes and service calls. Support/clinical kernels cannot be bypassed through CRM because 360 is a projection layer with no `health_artifact:read` grant.

**Minor debt:** Book 205 §7.5 routes `/me/marketing-preferences` but live API is `/me/notifications/preferences` — resolve in R12-A (alias or migrate) — **TD-R12-PLAN-01**.

---

## 5. Database audit

All §6 proposed tables reviewed.

| Table | Purpose / scope / PHI | PK/FK/unique/index | Append-only | State machine | RLS plan |
|-------|----------------------|-------------------|-------------|---------------|----------|
| `marketing_preferences` | person×country; non-PHI | **YES** | mutable + audit | — | **YES** |
| `conversion_events` | country; non-PHI | **YES** | **YES** | — | **YES** |
| `crm_segments` | country; non-PHI | **YES** | — | — | **YES** |
| `crm_campaigns` | country; non-PHI | **YES** | — | §9.2 | **YES** |
| `crm_campaign_sends` | country; non-PHI | **YES** | **YES** | — | **YES** |
| `crm_suppressions` | person×country | **YES** | soft revoke | — | **YES** |
| `crm_leads` | country; non-PHI | **YES** | — | §9.3 | **YES** |
| Promo (existing) | extend | partial | — | §9.1 | **DEBT** — legacy `USING(true)` |
| Affiliate referral tables | org×country | **YES** | clicks append-only | — | **YES** |
| `wishlist_items` | person | **YES** | — | — | **YES** |
| Loyalty tables | country/person | **YES** | ledger append-only | — | **YES** |
| Product review/Q&A | catalog | **YES** | — | §9.4 | **YES** |
| `personalization_events` | person | **YES** | **YES** | — | **YES** |
| `crm_automation_runs` | country | **YES** | **YES** | — | **YES** |

**Legacy RLS debt (pre-R12):** `promo_campaigns`, `promo_applications`, `affiliate_attribution_snapshots` use `USING(true)` from `20260826230000_cart_checkout`. Book 205 §6.8 and §15 acknowledge remediation in R12-C/D — **not a plan blocker**; R12-A tables must not copy this pattern.

**`worldpharma_app` NOSUPERUSER NOBYPASSRLS:** Confirmed baseline in R11 migrations (`20260829190200_r11a_cms_rls`, `20260829190300_r11a_support_rls`) — R11 CMS/support policies use `app.can_country` / `app.can_person`, not `USING(true)`.

**Database blockers:** None for R12-A.

---

## 6. API audit

Book 205 §7 inventories planned endpoints with method, route, actor, auth, authorization, scope, idempotency, PHI, audit, and errors for admin CRM, marketing, promo, affiliate, customer, and public surfaces.

| Check | Result |
|-------|--------|
| Customer / admin / affiliate / public separation | **PASS** |
| Vendor/partner APIs absent in R12 v1 | **PASS** — §4.3 |
| No clinical API via CRM | **PASS** — §7.1 explicit absence |
| Mutation idempotency specified | **PASS** |
| Existing checkout promo/affiliate preserved | **PASS** — §7.5 |

**Gaps (non-blocking documentation debt):**

| ID | Gap | Classification |
|----|-----|----------------|
| TD-R12-PLAN-01 | `/me/marketing-preferences` vs live `/me/notifications/preferences` | planning/documentation |
| TD-R12-PLAN-02 | Review report/abuse endpoint not enumerated | planning/documentation — moderation queue covers v1 |

---

## 7. UI audit

| Surface | Planned | States covered |
|---------|---------|----------------|
| web-customer | prefs (exists), wishlist, promo checkout, reviews, referral | loading, empty, error, forbidden, session expired in prefs |
| mobile | parity listed §8.2 | offline/retry noted |
| web-admin | crm, marketing, promo, affiliates, review moderation | permission-denied, conflict 409 |
| web-affiliate | new app — Book 93 justified | dashboard, links, earnings |

**Omissions (minor):** Review abuse/report UI flow not detailed — defer to R12-F IMPL with TD-R12-PLAN-02.

---

## 8. State-machine audit

| Entity | States / transitions / terminal / 409 / idempotency / version | Server-authoritative |
|--------|--------------------------------------------------------------|---------------------|
| PromoCampaign | §9.1 | **YES** |
| CrmCampaign | §9.2 | **YES** |
| CrmLead | §9.3 | **YES** |
| ProductReview | §9.4 | **YES** |
| AffiliateAccount | §9.5 blueprint — no DB model yet | **YES** at R12-D |
| RxSubscription | §9.6 read-only in R12 | **YES** — no R12 mutations |

---

## 9. Marketing / consent safety

| Check | Result |
|-------|--------|
| Marketing default OFF | **PASS** — ED-R12-02; DB default false planned |
| Explicit opt-in required | **PASS** — ED-R12-03 skip-not-fail |
| Unsubscribe / suppression | **PASS** — `crm_suppressions` §6.6 |
| Country/tenant scope | **PASS** |
| `campaign:send` authorization | **PASS** |
| Transactional vs marketing separation | **PASS** — §10.7 classifies transactional refill/status |
| Notification kernel reused | **PASS** |
| Outbox PHI-minimal | **PASS** — §10.6–10.7 |

**Ambiguity recorded (not silently resolved):** OD-R12-07 medicine advertising — pack default false; legal gate for med ads enablement.

---

## 10. CRM / PHI boundary

| Forbidden in 360 | Plan enforcement | Audit |
|------------------|------------------|-------|
| Health timeline | No health service calls | **PASS** |
| Lab reports / values | Metadata only | **PASS** |
| Imaging payloads | Metadata only | **PASS** |
| Prescriptions / Rx images | Deny | **PASS** |
| Care-nav narratives | Not in scope | **PASS** |
| Consent/break-glass payloads | Not in CRM | **PASS** |

E2e PHI matrix required at R12-A — **PASS** as gate §14.

---

## 11. Affiliate / money boundary

| Check | Result |
|-------|--------|
| No live PSP | **PASS** — R14 excluded |
| No live payout execution | **PASS** — reuse liability approve/reverse (sandbox) |
| No ledger duplication | **PASS** — finance kernel owns posting |
| Attribution separate from money movement | **PASS** — referral/click vs `AffiliateLiability` |
| `clinicalBlocked` default preserved | **PASS** — repository + plan |

---

## 12. Reviews / UGC safety

| Check | Result |
|-------|--------|
| Product reviews only | **PASS** |
| Doctor/lab ratings deferred (OD-RATE-01) | **PASS** |
| Moderation before public | **PASS** — SUBMITTED→APPROVED |
| Abuse/report handling | **PARTIAL** — TD-R12-PLAN-02 |
| No medical-advice workflow | **PASS** |
| No PHI in public reviews | **PASS** — ED-R12-15 |

---

## 13. Loyalty / wishlist / personalization

| Area | Audit |
|------|-------|
| Loyalty minimal/stub | **PASS** — OD-R12-03 default pack off |
| Append-only ledger if enabled | **PASS** — §6.12 |
| No financial-value promises | **PASS** — LEGAL note |
| Wishlist person ownership | **PASS** — §6.11 |
| Idempotent add/remove | **PASS** — unique `(person_id, catalog_offer_id)` |
| Personalization hooks only | **PASS** — no ML; no clinical recommendations |
| Retention boundaries | **PASS** — pack TTL §6.14 |

---

## 14. Refill / subscription boundary

| Prohibited | Plan | Audit |
|------------|------|-------|
| Auto-refill execution | EXCLUDED | **PASS** |
| Prescription modification | EXCLUDED | **PASS** |
| Clinical decisions | EXCLUDED | **PASS** |
| Pharmacy fulfillment changes | EXCLUDED | **PASS** |

R12-G limited to marketing reminders + 360 status read — **PASS**.

---

## 15. Search / analytics boundary

| Check | Result |
|-------|--------|
| R12 does not absorb R13 | **PASS** |
| Deterministic CRM customer search only | **PASS** — §11.1 |
| Reuse catalog + CMS search | **PASS** |
| No external search vendor | **PASS** — ED-R12-16 |
| No recommendation/ML | **PASS** |
| No BI warehouse | **PASS** |
| No PHI analytics | **PASS** |

---

## 16. Security / RLS audit

Book 205 §10 and §14 gates cover:

| Threat | Planned mitigation | Audit |
|--------|---------------------|-------|
| Unauthenticated admin CRM | JWT + audience | **PASS** |
| Cross-customer access | person RLS + 404 | **PASS** |
| Wrong country | `app.can_country` | **PASS** |
| Wrong org (affiliate) | membership filter | **PASS** |
| Unauthorized admin | RBAC deny-default | **PASS** |
| Disabled packs | `crm_enabled` | **PASS** |
| Malformed IDs | validation → 400 | **PASS** (IMPL) |
| Terminal state mutation | 409 | **PASS** |
| Idempotency conflicts | Key dedupe | **PASS** |

**Database isolation required in addition to service auth** — **PASS** — FORCE RLS on all new tables.

---

## 17. Open decisions audit

| ID | Still open? | Blocker? | Default |
|----|-------------|----------|---------|
| OD-R12-01 CMS creatives | **YES** | No | CMS refs |
| OD-R12-02 referral vs affiliate | **YES** | No | single kernel + `program_kind` |
| OD-R12-03 loyalty in R12 | **YES** | No | pack off / stub |
| OD-R12-04 verified purchase reviews | **YES** | No | require order match |
| OD-R12-05 promo+affiliate stacking | **YES** | No | allow both |
| OD-R12-06 Redis prefs migration | **YES** | No | dual-write |
| OD-R12-07 medicine ads | **YES** | Legal for med ads only | pack false |
| OD-R12-08 analyst 360 access | **YES** | No | segments only |
| OD-CRM-01–08 | **YES** | No (household/chat block product scope) | per Book 15 |
| OD-RATE-01 | **YES** | No for R12 | out of scope |
| OD-RX-REFILL | **YES** | No for R12 hooks | auto_execute OFF |
| OD-AFF-06/07 | **YES** | No | per Book 14 |

**No product/legal decisions silently resolved.**

---

## 18. Acceptance gates

Book 205 §14 defines per-phase gates (e2e, RLS negatives, auth negatives, state machines, idempotency, concurrency, PHI leakage, migrations, typecheck/build, R0–R11 regression).

**Final closure target:** `R12_GREEN_CLOSED_R13_READY_FOR_PLANNING` — **consistent with Book 93** R13 sequencing.

**Audit:** **PASS**

---

## 19. Technical debt

### Carried from R11 (unchanged — not silently resolved)

| ID | Classification |
|----|----------------|
| OD-CMS-01 | product |
| TD-R11A-04 reveal-pii | deferred |
| TD-R11B-02 browser E2E | test infrastructure |
| TD-R11C-01/02/03/04 | test infra / ops / product |
| TD-R11E-01/02 | product / ops |
| Shared-DB test pollution | test infrastructure |
| Queue membership v1 | architecture |

### New R12 planning debt (non-blocking)

| ID | Item | Classification |
|----|------|----------------|
| TD-R12-PLAN-01 | Marketing prefs API route naming mismatch | planning/documentation |
| TD-R12-PLAN-02 | Review abuse/report API/UI not fully specified | planning/documentation |
| TD-R12-PLAN-03 | 360 field-level response schema deferred to IMPL | planning/documentation |
| TD-R12-PLAN-04 | Optional `crm_customer_snapshots` cache TBD | architecture |
| TD-R12-PLAN-05 | Legacy promo/affiliate `USING(true)` RLS | security/database — R12-C/D |
| TD-R12-PLAN-06 | New RBAC permissions not yet in `authority.ts` | expected pre-IMPL |

**No blocker-class debt.**

---

## 20. R11 preservation

| Kernel | Preserve? | Audit |
|--------|-----------|-------|
| R9 consent/break-glass | **YES** | **PASS** — Book 205 §16 |
| R10 care navigation | **YES** | **PASS** |
| R11 CMS | **YES** | **PASS** — reuse only |
| R11 Help Center | **YES** | **PASS** |
| R11 Support Desk | **YES** | **PASS** |
| Appointment/order/payment/logistics | **YES** | **PASS** — read-only |
| FORCE RLS / deny-by-default | **YES** | **PASS** |

Verified: R11 code present and unchanged during this audit.

---

## 21. R13 boundary

Book 205 §17 explicitly excludes R13 search, recommendations, BI, PHI analytics, external vendors. **No R13 implementation or planning added.** **PASS**

---

## 22. Blocker classification

**No blockers identified.**

All recorded debt is **planning/documentation**, **test infrastructure**, **environment/ops**, or **deferred scope** — none block R12-A authorization.

---

## 23. Audit verdict

### **R12_PLAN_GREEN_R12_A_READY**

---

## 24. Next authorization

**`CR-R12-A-IMPL-207`** — R12-A CRM kernel + durable marketing preferences + conversion events + admin Customer 360 shell (migrations, RLS, focused e2e only).

**HARD STOP:** Do not implement R12-B/C/D/E/F/G/H, R10-E/F, or R13+ without separate IMPL CRs after R12-A audit green.
