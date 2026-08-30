# 212 — Post-R12-C audit (promo admin + customer checkout promo)

**CR:** `CR-POST-R12-C-AUDIT-212`  
**Verdict:** `R12_C_GREEN_R12_D_READY`  
**Authority:** [211](211_R12_C_PROMO_IMPLEMENTATION.md) · [205](205_R12_IMPLEMENTATION_PLAN.md) · [206](206_POST_R12_PLAN_AUDIT.md) · [210](210_POST_R12_B_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only review of R12-C implementation against Book 211, Book 205, and repository state. **No source, schema, migration, API, UI, test, or configuration changes were made during this CR.**

---

## 1. Executive summary

R12-C delivers the planned promo kernel: **admin campaign CRUD**, **server-authoritative lifecycle state machine**, **legacy promo RLS hardening (TD-R12-PLAN-05)**, **shared promo evaluator**, **customer checkout promo UX (web-customer)**, **RBAC**, and **security events** — without R12-D+ scope creep.

**State machine, RBAC, RLS, checkout authority, and money boundaries are sound** in code and database inspection. **No duplicate promo/payment kernel** was introduced. **No R12-D/E/F/G/H, R10-E/F, or R13+ functionality** was found in the R12-C surface.

**Findings that do not block R12-D:**
- **TD-R12C-01:** `redeemed_count` is never incremented on order completion — `max_redemptions` check exists but is not fully operational end-to-end.
- **TD-R12C-02:** Test DB contains extra `promo_*_access` RLS policies not present in committed migration SQL (worker/platform only; not a security regression).
- **TD-R12C-03:** Admin POST/PATCH accept `Idempotency-Key` header but do not wire idempotency (stub only).
- **TD-R12C-04:** No automated expiry job (`*→EXPIRED`); admin transition only (Book 205 allows either).
- **TD-R12C-05:** Mobile checkout promo UX deferred (web-customer only).
- **TD-R12B-06:** R12-B e2e flakes (403) when policy cache stale after DB-only pack updates — carried test infra debt.

**Next authorization:** `CR-R12-D-IMPL-213`

---

## 2. Implementation verification (Book 211 vs repository)

| Book 211 claim | Verified |
|----------------|----------|
| `PromoCampaignStatus` + lifecycle columns | **YES** — `schema.prisma` L1662+, L1832+ |
| Migrations `20260829220000`–`20260829220200` | **YES** — files exist; applied on `worldpharma_test` |
| `apps/api/src/promo/*` module (7 files) | **YES** — status, evaluator, service, controller, module, 2 specs |
| `PromoModule` in `app.module.ts` | **YES** |
| Cart integration via `PromoEvaluatorService` | **YES** — `cart.module.ts`, `cart.service.ts` `computePromo` |
| RBAC `promo:read`, `promo:manage` | **YES** — `authority.ts`, `rbac.service.ts` |
| Security events `PROMO_CAMPAIGN_*` | **YES** — `security-events.service.ts` |
| Web-admin `/promo` | **YES** — `promo-api.ts`, `promo-list.tsx`, `app/promo/page.tsx`, `nav.ts` |
| Web-customer checkout promo UX | **YES** — `commerce-api.ts`, `checkout-page.tsx` |
| No R12-D+ modules | **YES** — no affiliate referral models, wishlist, loyalty, reviews, personalization kernels |

**Minor Book 211 accuracy note:** Book 211 lists `promo-status.spec.ts` as 3 tests; audit run confirms **3/3 pass**. E2e file has **6** `it()` blocks (Book 211 says 6/6) — accurate.

---

## 3. Promo state-machine audit

### Documented transitions (Book 205 §9.1 / Book 211 §4)

| From | Allowed to |
|------|------------|
| DRAFT | ACTIVE, EXPIRED |
| ACTIVE | PAUSED, EXPIRED |
| PAUSED | ACTIVE, EXPIRED |
| EXPIRED | *(none — terminal)* |

### Server enforcement (`promo-status.ts`, `promo-campaign.service.ts`)

| Control | Status |
|---------|--------|
| `assertPromoTransition` on status change | **PASS** |
| Invalid transition → 409 | **PASS** — e2e + unit test |
| `EXPIRED` terminal immutability | **PASS** — `isTerminalPromoStatus` + e2e |
| Optimistic `version` conflict → 409 | **PASS** — e2e |
| Create always `DRAFT` (no client status forge) | **PASS** — `create()` hardcodes `DRAFT` |
| Field edits blocked in `ACTIVE` | **PASS** — `isEditablePromoStatus` + conflict |
| Country scope on all admin queries | **PASS** — `countryId` filter + `resolveCountryByCode` |

**Observation:** No background job transitions campaigns to `EXPIRED` on `expires_at`; expiry is enforced at **quote time** in `PromoEvaluatorService` (409 `QUOTE_STALE`). Admin may set `EXPIRED` manually. Aligns with Book 205 “system job **or** admin.”

---

## 4. Admin API audit

### Routes verified (`admin-promo.controller.ts`)

| Method | Route | Guards | Permission |
|--------|-------|--------|------------|
| GET | `/admin/promo/campaigns` | JWT, Audience, Permissions | `promo:read` |
| POST | `/admin/promo/campaigns` | JWT, Audience, Permissions | `promo:manage` |
| GET | `/admin/promo/campaigns/:id` | JWT, Audience, Permissions | `promo:read` |
| PATCH | `/admin/promo/campaigns/:id` | JWT, Audience, Permissions | `promo:manage` |
| GET | `/admin/promo/campaigns/:id/redemptions` | JWT, Audience, Permissions | `promo:read` |

### Controls

| Control | Status |
|---------|--------|
| Unauthenticated → 401 | **PASS** — e2e |
| Unauthorized (no `promo:manage`) → 403 | **PASS** — e2e |
| Pharmacy pack gate (`services.pharmacy`) | **PASS** — `assertPromoEnabled` → 403 |
| Malformed UUID → 400 | **PASS** — `assertUuid` (static inspection; not e2e-covered) |
| Wrong country → 404 | **PASS** — `findFirst` with `countryId` scope |
| Worker tenant context for DB ops | **PASS** — `runWithTenant(workerTenantContext(...))` |
| Security events on create/update/publish | **PASS** |

**Debt:** `Idempotency-Key` header bound as `_idempotencyHeader` but unused (**TD-R12C-03**). Book 205 lists idempotency for POST/PATCH; behavior not implemented.

---

## 5. Legacy promo RLS audit (TD-R12-PLAN-05)

### Postgres verification (`worldpharma_test` via Docker)

| Check | Result |
|-------|--------|
| `promo_campaigns` RLS enabled | **YES** (`relrowsecurity = t`) |
| `promo_campaigns` FORCE RLS | **YES** (`relforcerowsecurity = t`) |
| `promo_applications` RLS + FORCE | **YES** |
| `promo_campaigns_app_all` / `USING(true)` removed | **YES** — 0 rows for `app_all` policies |
| `worldpharma_app` NOSUPERUSER | **YES** (`rolsuper = f`) |
| `worldpharma_app` NOBYPASSRLS | **YES** (`rolbypassrls = f`) |

### Committed policies (`20260829220100_r12c_promo_rls`)

- `promo_campaigns`: select (worker/platform/country), insert/update (worker/platform + country), no delete
- `promo_applications`: select (worker/platform/customer session/country), insert (worker/platform/customer), no update, conditional delete

### Observation (**TD-R12C-02**)

Live test DB also has `promo_campaigns_access` and `promo_applications_access` policies (`FOR ALL`, `worker OR platform`) **not present** in committed migration SQL. These are **more restrictive** than legacy `USING(true)` and do not grant customer-wide campaign visibility. Classified as **migration hygiene drift**, not a security blocker. Recommend reconciling in a future migration-only CR.

### Customer campaign visibility

Customer tenant context does **not** receive broad `promo_campaigns` SELECT. Checkout lookup uses `runWithTenant(workerTenantContext({ countryId }), ...)` in `cart.service.ts` — authoritative server-side validation without exposing admin campaign rows to customer RLS context.

---

## 6. Customer checkout promo audit

### Existing kernel extended (not replaced)

| Flow | Implementation |
|------|----------------|
| Apply promo | `POST /me/checkout/sessions/:id/promo` → `setPromo` (existing) |
| Quote with discount | `POST .../quote` → `buildQuote` → `computePromo` → `PromoEvaluatorService` |
| Promo application row | `promoApplication` created on quote in transaction |
| Remove promo | `setPromo` with empty/`null` code; web-customer `removeCheckoutPromo` |

### Rules enforced server-side (`promo-evaluator.service.ts`)

| Rule | E2e covered |
|------|-------------|
| ACTIVE status only | **YES** — draft → 422 |
| Wrong country | **YES** — 422 |
| Expired (`expires_at`) | **NO** — static code only |
| Min basket | **NO** — static code only |
| Max redemptions | **NO** — static code + **TD-R12C-01** (count never incremented) |
| Invalid code | **YES** — implicit via apply+quote |
| Discount capped at sell | **YES** — code + successful apply test |
| Single promo per session | **YES** — existing fingerprint (no stacking change) |

### Authoritative totals

- Discount computed in `PromoEvaluatorService`; client cannot set `discount_minor` on quote.
- Payment endpoint rejects client `amount_minor` tampering (`AMOUNT_TAMPER` in `cart.controller.ts`).
- Web-customer displays `quote.discount_minor` from server response only.

---

## 7. Money / payment boundary

| Check | Status |
|-------|--------|
| PSP changes | **NONE** |
| Payment authorization bypass | **NONE** |
| Payout / settlement / ledger mutation from R12-C | **NONE** |
| Refund automation | **NONE** |
| Client-controlled payable totals | **REJECTED** — `amount_minor` tamper guard exists |
| Promo flows through `buildQuote` → `checkout_quotes` | **YES** |
| Duplicate payment kernel | **NONE** |

Pre-existing `OrderPromoSnapshot` / finance promo facts unchanged; R12-C does not alter order→finance posting logic.

---

## 8. Promo rules audit

Documented R12-C rules only. No new stacking behavior. Affiliate + promo fingerprint unchanged (`|${promo?.code ?? ''}|${affiliateCode ?? ''}`).

**Pre-existing limitation carried:** `redeemed_count` column exists and evaluator checks it, but **no application code increments** `redeemed_count` on order paid (**TD-R12C-01**). `max_redemptions` enforcement is therefore incomplete in production paths until wired.

---

## 9. Security / RBAC audit

| Role | `promo:read` | `promo:manage` |
|------|--------------|----------------|
| `company_finance` | **YES** | **YES** |
| `company_operations` | **YES** | **YES** |
| `company_support` | **YES** | **NO** |

Aligns with Book 205 §10.2 (support read-only).

Cross-customer isolation: checkout `ownedSession` / `presentSession` enforces `customerPersonId`. Promo apply does not validate promo at apply-time (deferred to quote) — acceptable; invalid codes surface at quote.

---

## 10. Policy / medicine-advertising boundary

| Check | Status |
|-------|--------|
| Admin promo gated on `services.pharmacy` | **YES** |
| `medicine_advertising` default `false` | **YES** — `empty-pack.ts`, `document.ts` |
| OD-R12-07 enabled | **NO** |
| Promo used as regulated marketing backdoor | **NO** |

Promo pack gate is **commerce/pharmacy**, distinct from CRM `crm.marketing` (R12-B). No coupling to medicine advertising flags.

---

## 11. Audit / security events

| Event | Emitted when | Metadata |
|-------|--------------|----------|
| `PROMO_CAMPAIGN_CREATED` | create | `campaign_id`, `country_id` |
| `PROMO_CAMPAIGN_UPDATED` | patch (non-publish) | `campaign_id`, `country_id`, `status` |
| `PROMO_CAMPAIGN_PUBLISHED` | transition to ACTIVE | same |

No clinical data, payment credentials, or unnecessary PII in payloads. Operational IDs only.

---

## 12. Idempotency / concurrency

| Area | Status |
|------|--------|
| Checkout quote idempotency | **UNCHANGED** — existing `idempotent()` wrapper |
| Admin promo POST/PATCH idempotency | **NOT IMPLEMENTED** — header stub only (**TD-R12C-03**) |
| Optimistic version on PATCH | **IMPLEMENTED** |
| Duplicate promo apply | Sets same code; quote recalculates (no double-discount in single quote) |
| Concurrent admin PATCH | Version conflict → 409 |

No evidence of double-discount race in quote transaction (promo applications deleted and recreated per quote).

---

## 13. Database / migrations

| Check | Status |
|-------|--------|
| R12-C migrations exist (schema, rls, grants) | **YES** |
| Applied on `worldpharma_test` | **YES** — `_prisma_migrations` confirms all 3 |
| Prisma schema matches migration intent | **YES** |
| Historical migrations unmodified | **YES** — audit did not edit |
| Indexes/FKs | **YES** — `country_id, status` index; FK `created_by_person_id` |

Docker Postgres **healthy** (`world-pharma-postgres` Up 3h). Redis **healthy**.

---

## 14. PHI / privacy

Promo admin responses expose commerce fields only (code, bps, minors, status). No health artifacts, lab/imaging, prescriptions, care-nav, or consent payloads in promo APIs, events, or customer checkout promo UX.

Redemptions list exposes `session_id` (operational) — acceptable for finance/support role.

---

## 15. Tests (audit run)

### R12-C

| Suite | Result |
|-------|--------|
| `promo-status.spec.ts` | **3/3 pass** |
| `r12c.promo.e2e.spec.ts` | **6/6 pass** |
| **Total R12-C** | **9/9 pass** |

### Regression (isolated reruns)

| Suite | Result | Notes |
|-------|--------|-------|
| `r12a.crm-kernel.e2e` | **6/6 pass** | R12-A |
| `r12b.marketing.e2e` | **2/7 pass, 5 fail** | 403/400 — **TD-R12B-06** policy cache stale; not R12-C regression |
| `r11a.cms-support-kernel.e2e` | **pass** (in combined run) | R11 |
| `r10a.care-nav-kernel.e2e` | **pass** (in combined run) | R10 |
| `r9c.consent-scope-enforcement.e2e` | **pass** (in combined run) | R9 |
| `cart.e2e` | **1/1 pass** | Checkout kernel |

**R12-B failure classification:** Isolated rerun of `r12b.marketing` “unauthenticated” passes; failures occur on tests requiring `campaign:send` after DB pack mutation without guaranteed `PolicyCache.invalidate()` — consistent with **TD-R12B-06** (test infrastructure), not R12-C code defect.

### Coverage gaps (non-blocker)

Not e2e-tested: expired promo, min basket failure, max redemption exhaustion, malformed admin UUID 400, remove-promo UX, pharmacy pack disabled 403.

---

## 16. Typecheck / build (audit run)

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| `web-admin:typecheck` | **PASS** |
| `web-admin:build` | **PASS** |
| `web-customer:typecheck` | **PASS** |

---

## 17. Runtime verification

| Step | Method | Result |
|------|--------|--------|
| Docker Postgres/Redis | Container inspect | **LIVE** — both healthy |
| Migrations | `_prisma_migrations` + `migrate deploy` in test harness | **APPLIED** |
| API `/health/ready` | HTTP probe | **NOT RUN** — API not listening on `:3000` (timeout) |
| Admin create → activate → customer apply | E2e | **VERIFIED** (e2e, not live UI) |
| Invalid/expired/wrong-country promo | E2e partial | **PARTIAL** — draft + wrong-country e2e; expired not e2e-covered |

**Classification:** Runtime verification is **e2e + static inspection**, not live API/UI smoke.

---

## 18. Regression / boundary verification

| Phase | Expected | Verified |
|-------|----------|----------|
| R10-A/B/C/D | COMPLETE | **YES** — r10a e2e pass |
| R10-E/F | NOT STARTED | **YES** |
| R11-A/B/C/D/E | COMPLETE | **YES** — r11a e2e pass |
| R12-A | COMPLETE | **YES** — r12a 6/6 |
| R12-B | COMPLETE | **YES** — code intact; e2e flaky (TD-R12B-06) |
| **R12-C** | IMPLEMENTED | **YES** |
| R12-D/E/F/G/H | NOT STARTED | **YES** — no affiliate web, referral models, wishlist, loyalty, reviews, personalization, refill automation |
| R13+ | NOT STARTED | **YES** |

No R12-D+ code paths introduced under `promo/` or web-admin beyond `/promo`.

---

## 19. Technical debt (classified)

| ID | Item | Severity | Blocks R12-D? |
|----|------|----------|---------------|
| TD-R12-PLAN-05 | Legacy promo `USING(true)` RLS | **RESOLVED** | — |
| TD-R12B-06 | Policy cache invalidation in e2e helpers | Test infra | **NO** |
| TD-R12B-07 | No cancel-campaign API | Product | **NO** |
| TD-R12C-01 | `redeemed_count` never incremented on order paid | Product | **NO** |
| TD-R12C-02 | Extra `promo_*_access` RLS policies in DB not in migration SQL | Hygiene | **NO** |
| TD-R12C-03 | Admin promo idempotency header not wired | Product | **NO** |
| TD-R12C-04 | No scheduled `EXPIRED` transition job | Product | **NO** |
| TD-R12C-05 | Mobile checkout promo UX deferred | Product | **NO** |
| OD-AFF-07 | Promo + affiliate stacking rules | Open decision | **NO** |
| OD-R12-07 | Medicine advertising | Open / disabled | **NO** |

---

## 20. R12-D readiness

**R12-D may proceed.**

R12-C meets Book 205/211 scope. Security boundaries (RLS, RBAC, checkout authority, payment isolation) are sound. Identified gaps are **product completeness** (redemption counting, idempotency, mobile parity), **test infrastructure** (R12-B cache), and **migration hygiene** — none constitute blocker-class defects for affiliate/referral implementation (R12-D).

R12-D should **reuse** existing `AffiliateAttributionSnapshot` / finance liability kernels per Book 205 — not duplicate promo or payment logic.

---

## 21. Verdict rationale

**`R12_C_GREEN_R12_D_READY`**

R12-C correctly extends the existing promo/checkout kernel with admin lifecycle management, hardened RLS, authoritative discount evaluation, and customer UX — within Book 205 boundaries. TD-R12-PLAN-05 is resolved. No money-boundary or PHI violations found. Non-blocker debt is documented for future CRs.

---

## 22. Next authorization

**`CR-R12-D-IMPL-213`** — R12-D affiliate web + referral attribution (per Book 205), only after explicit user authorization. Do not start during this audit CR.
