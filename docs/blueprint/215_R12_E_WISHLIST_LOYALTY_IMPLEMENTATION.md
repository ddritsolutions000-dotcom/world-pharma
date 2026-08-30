# R12-E Wishlist + optional loyalty implementation

**CR:** `CR-R12-E-IMPL-215`  
**Verdict:** `R12_E_IMPLEMENTED`  
**Next authorization:** `CR-POST-R12-E-AUDIT-216`  
**Authority:** [205](205_R12_IMPLEMENTATION_PLAN.md) · [214](214_POST_R12_D_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R12-E delivers **person-scoped wishlist** (catalog offer references), **pack-gated loyalty stub** (append-only ledger, fail-closed when disabled), **web-customer + mobile wishlist UX**, and **order-paid accrual hook** when loyalty is enabled. No R12-F+, reviews, personalization, refill automation, affiliate mobile, or live payouts.

---

## 1. Files changed

### Database

- `packages/database/prisma/schema.prisma` — `WishlistItem`, `LoyaltyProgram`, `LoyaltyAccount`, `LoyaltyLedgerEntry`
- `packages/database/prisma/migrations/20260829240000_r12e_wishlist_loyalty_schema/migration.sql`
- `packages/database/prisma/migrations/20260829240100_r12e_wishlist_loyalty_rls/migration.sql`
- `packages/database/prisma/migrations/20260829240200_r12e_wishlist_loyalty_grants/migration.sql`

### API

- `apps/api/src/wishlist/*` — service, controller, module, e2e
- `apps/api/src/loyalty/*` — service, controllers (self + admin), module
- `apps/api/src/orders/order.service.ts` — loyalty accrual on order creation
- `apps/api/src/orders/order.module.ts` — imports `LoyaltyModule`
- `apps/api/src/app/app.module.ts` — `WishlistModule`, `LoyaltyModule`
- `apps/api/src/policy/document.ts`, `empty-pack.ts` — `crm.loyalty.enabled` (default `false`)
- `apps/api/src/identity/authority.ts`, `rbac.service.ts` — `loyalty:read`, `loyalty:manage`
- `apps/api/src/identity/security-events.service.ts` — wishlist + loyalty events

### Web customer

- `apps/web-customer/src/wishlist-page.tsx`, `app/account/wishlist/page.tsx`
- `apps/web-customer/src/commerce-api.ts` — wishlist API helpers
- `apps/web-customer/src/product-detail.tsx` — save to wishlist
- `apps/web-customer/src/account-page.tsx` — nav link

### Mobile

- `apps/mobile/src/wishlist-features.tsx`, `commerce-api.ts`, `navigation.ts`, `app-root.tsx`, `customer-features.tsx`

### Documentation

- `docs/blueprint/215_R12_E_WISHLIST_LOYALTY_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 2. Wishlist

| Requirement | Status |
|-------------|--------|
| Person + country scoped | **YES** — `person_id`, `country_id` on row |
| Unique `(person_id, country_id, catalog_offer_id)` | **YES** |
| Idempotent add (duplicate → same row) | **YES** — P2002 + `duplicate: true` |
| Server-authoritative ownership | **YES** — principal `personId` only |
| Cross-customer denied | **YES** — e2e |
| Invalid/unpublished offer → 404 | **YES** |
| No clinical data | **YES** — catalog commerce metadata only |
| Reuses `CatalogOffer` kernel | **YES** — no duplicate catalog |

---

## 3. Wishlist API

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/v1/me/wishlist?country_code=` | customer JWT | list |
| POST | `/api/v1/me/wishlist` | customer JWT | add; `Idempotency-Key` accepted |
| DELETE | `/api/v1/me/wishlist?country_code=&catalog_offer_id=` | customer JWT | remove one |
| DELETE | `/api/v1/me/wishlist?country_code=` | customer JWT | clear all |

Security events: `WISHLIST_ITEM_ADDED`, `WISHLIST_ITEM_REMOVED`.

---

## 4. Loyalty (pack-gated stub)

| Requirement | Status |
|-------------|--------|
| Pack `crm.loyalty.enabled` default `false` | **YES** |
| Disabled → fail closed (ledger 403; balance shows `enabled: false`) | **YES** |
| Tables when enabled | `loyalty_programs`, `loyalty_accounts`, `loyalty_ledger_entries` |
| Append-only ledger | **YES** — no update/delete policies |
| Idempotent earn by `(source, source_key, kind)` | **YES** |
| Balance derived from ledger sum | **YES** |
| Order-paid accrual hook | **YES** — `OrderService.insertFromPayment` → `LoyaltyService.accrueForPaidOrder` |
| No cash conversion / payout / PSP | **YES** |

### Customer APIs

| Method | Route | When disabled |
|--------|-------|---------------|
| GET | `/api/v1/me/loyalty/balance?country_code=` | `{ enabled: false }` |
| GET | `/api/v1/me/loyalty/ledger?country_code=` | **403** |

### Admin APIs (pack must be enabled)

| Method | Route | RBAC |
|--------|-------|------|
| GET | `/api/v1/admin/loyalty/programs?country_code=` | `loyalty:read` |
| POST | `/api/v1/admin/loyalty/programs` | `loyalty:manage` |
| PATCH | `/api/v1/admin/loyalty/programs/:id?country_code=` | `loyalty:manage` |

Security events: `LOYALTY_PROGRAM_CREATED`, `LOYALTY_PROGRAM_UPDATED`, `LOYALTY_LEDGER_ENTRY_RECORDED`.

---

## 5. RLS / grants

All new tables: **FORCE RLS**, deny-by-default, no `USING(true)`.

- `wishlist_items`: person read/insert/delete own; worker/platform/country admin read
- `loyalty_programs`: country admin worker/platform CRUD (no delete)
- `loyalty_accounts`: person read/insert own
- `loyalty_ledger_entries`: append-only insert (worker/platform); person read via account join

Grants: wishlist INSERT/DELETE; loyalty programs UPDATE; accounts/ledger INSERT-only.

---

## 6. UI

| Surface | Delivered |
|---------|-----------|
| web-customer `/account/wishlist` | **YES** |
| web-customer PDP save | **YES** |
| mobile wishlist screen | **YES** |
| web-admin loyalty UI | **Deferred** — admin API only (**TD-R12E-01**) |

---

## 7. Tests

| Suite | Result |
|-------|--------|
| `r12e.wishlist.e2e.spec.ts` | **1/1 PASS** |
| R12-C/D regression (promo + affiliate) | **12/12 PASS** |

---

## 8. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | PASS |
| `api:build` | PASS |
| `web-customer:typecheck` | PASS |
| `mobile:typecheck` | PASS |

---

## 9. Technical debt

**Carried (unchanged):** TD-R12B-06, TD-R12C-01…05, TD-R12D-01…05, OD-R12-07, R11 debt

**New R12-E:**

| ID | Item |
|----|------|
| TD-R12E-01 | web-admin loyalty program UI deferred — admin API only |
| TD-R12E-02 | Wishlist POST `Idempotency-Key` header accepted but not wired to Redis idempotency store |
| TD-R12E-03 | Mobile PDP “save to wishlist” heart not added — account wishlist screen only |

---

## 10. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A/B/C/D | COMPLETE |
| **R12-E** | **IMPLEMENTED** |
| R12-F/G/H | NOT STARTED |
| R10-E/F, R13+ | NOT STARTED |
| Reviews, personalization, refill automation, affiliate mobile, payouts, PSP | **NOT introduced** |

---

## 11. Verdict

**`R12_E_IMPLEMENTED`**

**Exact next authorization:** **`CR-POST-R12-E-AUDIT-216`**

HARD STOP — no R12-F+.
