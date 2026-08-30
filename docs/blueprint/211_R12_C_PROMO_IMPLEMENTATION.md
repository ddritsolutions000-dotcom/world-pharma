# R12-C Promo admin + customer checkout promo implementation

**CR:** `CR-R12-C-IMPL-211`  
**Verdict:** `R12_C_IMPLEMENTED`  
**Authority:** [205](205_R12_IMPLEMENTATION_PLAN.md) · [206](206_POST_R12_PLAN_AUDIT.md) · [210](210_POST_R12_B_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R12-C delivers **promo campaign admin CRUD**, **lifecycle state machine**, **RLS hardening for legacy promo tables (TD-R12-PLAN-05)**, **customer checkout promo UX**, and **authoritative server-side discount calculation** only. No R12-D+ (affiliate, loyalty, wishlist, reviews, personalization, refill hooks, closure). No R10-E/F, R13+, live PSP/payouts, or medicine advertising enablement.

---

## 1. Scope delivered

| Area | Status |
|------|--------|
| `PromoCampaign` lifecycle (`DRAFT` → `ACTIVE` → `PAUSED` → `EXPIRED`) | **IMPLEMENTED** |
| Admin promo CRUD + redemptions list | **IMPLEMENTED** |
| RBAC `promo:read`, `promo:manage` | **IMPLEMENTED** |
| Security events (`PROMO_CAMPAIGN_*`) | **IMPLEMENTED** |
| Legacy promo RLS hardening (no `USING(true)`) | **IMPLEMENTED** |
| Shared `PromoEvaluatorService` + cart integration | **IMPLEMENTED** |
| Customer checkout promo apply/remove + quote refresh (web-customer) | **IMPLEMENTED** |
| Web-admin `/promo` shell | **IMPLEMENTED** |
| Focused R12-C unit + e2e tests | **IMPLEMENTED** |

### Explicit non-starts

- R12-D affiliate / referral web
- R12-E wishlist / loyalty
- R12-F reviews / personalization
- R12-G refill marketing hooks
- R12-H closure
- R10-E/F, R13+
- Live PSP, payouts, settlement changes
- OD-R12-07 medicine advertising (unchanged / disabled)

---

## 2. Files changed

### Database

- `packages/database/prisma/schema.prisma` — `PromoCampaignStatus`; `status`, `version`, `createdByPersonId`, `updatedAt` on `PromoCampaign`; `Person.promoCampaignsCreated`
- `packages/database/prisma/migrations/20260829220000_r12c_promo_schema/migration.sql`
- `packages/database/prisma/migrations/20260829220100_r12c_promo_rls/migration.sql`
- `packages/database/prisma/migrations/20260829220200_r12c_promo_grants/migration.sql`

### API — promo module (`apps/api/src/promo/`)

- `promo-status.ts` — transitions; invalid → 409; terminal `EXPIRED`
- `promo-evaluator.service.ts` — shared validation (active, expiry, country, min basket, max redemptions, discount)
- `promo-campaign.service.ts` — admin CRUD + redemptions
- `admin-promo.controller.ts` — `/admin/promo/campaigns`
- `promo.module.ts`
- `promo-status.spec.ts`
- `r12c.promo.e2e.spec.ts`

### API — integration

- `apps/api/src/app/app.module.ts` — `PromoModule`
- `apps/api/src/cart/cart.module.ts` — imports `PromoModule`
- `apps/api/src/cart/cart.service.ts` — `computePromo` via `PromoEvaluatorService` + worker tenant lookup
- `apps/api/src/identity/authority.ts` — `promo:read`, `promo:manage` grants
- `apps/api/src/identity/rbac.service.ts` — permission catalog
- `apps/api/src/identity/security-events.service.ts` — `PROMO_CAMPAIGN_*` types

### Web-admin

- `apps/web-admin/src/promo-api.ts`
- `apps/web-admin/src/promo-list.tsx`
- `apps/web-admin/app/promo/page.tsx`
- `apps/web-admin/src/nav.ts` — Promo nav (`promo:read`)

### Web-customer

- `apps/web-customer/src/commerce-api.ts` — `applyCheckoutPromo`, `removeCheckoutPromo`, `quoteCheckout`
- `apps/web-customer/src/checkout-page.tsx` — promo apply/remove UI + discount display

### Documentation

- `docs/blueprint/211_R12_C_PROMO_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 3. Repository audit (pre-implementation)

| Capability | Pre-R12-C | Post-R12-C |
|------------|-----------|------------|
| `PromoCampaign` / `PromoApplication` schema | **COMPLETE** | Extended with lifecycle |
| Checkout `POST .../promo` + `computePromo` | **PARTIAL** (no status check) | **COMPLETE** |
| Admin promo CRUD | **MISSING** | **IMPLEMENTED** |
| Legacy promo RLS | **`USING(true)`** (TD-R12-PLAN-05) | **HARDENED** |
| Customer promo UX | **MISSING** | **IMPLEMENTED** (web-customer) |
| RBAC `promo:*` | **MISSING** | **IMPLEMENTED** |

Existing cart/checkout/payment kernels were **extended**, not replaced.

---

## 4. Promo state machine

```
DRAFT → ACTIVE → PAUSED → EXPIRED
DRAFT → EXPIRED
ACTIVE → EXPIRED
PAUSED → ACTIVE | EXPIRED
```

| Rule | Enforcement |
|------|-------------|
| Invalid transition | 409 |
| Terminal `EXPIRED` status change | 409 |
| Optimistic `version` conflict | 409 |
| Field edits in `ACTIVE` (non-status) | 409 unless transitioning |
| Editable in `DRAFT` / `PAUSED` | PATCH allowed |

---

## 5. Admin APIs

| Method | Route | Permission |
|--------|-------|------------|
| GET | `/api/v1/admin/promo/campaigns` | `promo:read` |
| POST | `/api/v1/admin/promo/campaigns` | `promo:manage` |
| GET | `/api/v1/admin/promo/campaigns/:id` | `promo:read` |
| PATCH | `/api/v1/admin/promo/campaigns/:id` | `promo:manage` |
| GET | `/api/v1/admin/promo/campaigns/:id/redemptions` | `promo:read` |

Country scoping via `country_code` query/body; pharmacy pack gate (fail-closed). Security events on create/update/publish.

---

## 6. Customer checkout

| Method | Route | Behavior |
|--------|-------|----------|
| POST | `/api/v1/me/checkout/sessions/:id/promo` | Set/clear promo code (existing kernel) |
| POST | `/api/v1/me/checkout/sessions/:id/quote` | Authoritative discount via `PromoEvaluatorService` |

Web-customer `/checkout`: apply, remove, safe error states, server-calculated discount display. No client-side total mutation.

---

## 7. Promo rules (R12-C)

- Campaign must be `ACTIVE`
- Not past `expires_at`
- `country_id` must match checkout country
- `min_basket_minor` enforced
- `max_redemptions` / `redeemed_count` enforced
- Single promo per session (existing fingerprint behavior; no stacking change)
- Percent / fixed discount capped at sell total

---

## 8. Money / payment boundary

Promo affects checkout quote totals only through existing `buildQuote` → `checkout_quotes` → payment flow. **No** PSP, ledger, payout, or refund automation changes.

---

## 9. Security / RLS (TD-R12-PLAN-05)

**`promo_campaigns`:** FORCE RLS; deny-by-default; worker/platform/country-scoped admin policies; no customer-wide SELECT (lookup uses worker tenant in cart service).

**`promo_applications`:** FORCE RLS; customer SELECT/INSERT/DELETE via own checkout session; admin/worker read.

`worldpharma_app` remains NOSUPERUSER / NOBYPASSRLS.

---

## 10. RBAC

| Permission | Roles |
|------------|-------|
| `promo:manage` | `company_finance`, `company_operations` |
| `promo:read` | `company_finance`, `company_operations`, `company_support` |

---

## 11. Tests

| Suite | Result |
|-------|--------|
| `promo-status.spec.ts` | 3/3 pass |
| `r12c.promo.e2e.spec.ts` | 6/6 pass |

Coverage: admin CRUD, activate, invalid transition, version conflict, unauthorized 403, customer apply + discount, draft/inactive 422, wrong-country 422, terminal immutability 409, redemptions list.

---

## 12. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | PASS |
| `api:build` | PASS |
| `web-admin:typecheck` | PASS |
| `web-admin:build` | PASS |
| `web-customer:typecheck` | PASS |

Migrations applied: `20260829220000_r12c_promo_schema`, `20260829220100_r12c_promo_rls`, `20260829220200_r12c_promo_grants`.

---

## 13. Runtime

Live API smoke not executed in this CR (e2e + migrate deploy against test DB only). Docker/API `/health/ready` verification deferred to post-implementation audit.

---

## 14. Technical debt

| ID | Item | Status |
|----|------|--------|
| TD-R12-PLAN-05 | Legacy promo RLS `USING(true)` | **RESOLVED** in R12-C migrations |
| TD-R12B-06 | Policy cache invalidation after pack DB update | **OPEN** (carried) |
| Promo stacking | Single promo per quote (existing) | **UNCHANGED** — OD-AFF-07 TBD |
| Mobile checkout promo UX | web-customer only | **OPEN** — parity deferred |
| OD-R12-07 | Medicine advertising | **OPEN / disabled** |

---

## 15. Boundary verification

| Phase | Expected | Verified |
|-------|----------|----------|
| R12-A | COMPLETE | Yes |
| R12-B | COMPLETE | Yes |
| **R12-C** | IMPLEMENTED | Yes |
| R12-D–H | NOT STARTED | Yes |
| R10-E/F | NOT STARTED | Yes |
| R13+ | NOT STARTED | Yes |

---

## 16. Next authorization

**`CR-POST-R12-C-AUDIT-212`**
