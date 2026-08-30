# R12-F Product reviews/Q&A + personalization hooks

**CR:** `CR-R12-F-IMPL-217`  
**Verdict:** `R12_F_IMPLEMENTED`  
**Next authorization:** `CR-POST-R12-F-AUDIT-218`  
**Authority:** [205](205_R12_IMPLEMENTATION_PLAN.md) · [216](216_POST_R12_E_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R12-F delivers **moderated product reviews**, **product Q&A**, **append-only personalization event hooks**, **web-admin moderation queue**, and **web-customer + mobile PDP review/Q&A UX**. No R12-G/H, doctor/lab ratings, ML recommendations, or R13 analytics.

---

## 1. Files changed

### Database

- `packages/database/prisma/schema.prisma` — `ProductReview`, `ProductReviewResponse`, `ProductQuestion`, `PersonalizationEvent`
- `packages/database/prisma/migrations/20260829250000_r12f_reviews_personalization_schema/migration.sql`
- `packages/database/prisma/migrations/20260829250100_r12f_reviews_personalization_rls/migration.sql`
- `packages/database/prisma/migrations/20260829250200_r12f_reviews_personalization_grants/migration.sql`

### API

- `apps/api/src/reviews/*` — service, catalog + self + admin controllers, review state machine, UGC safety
- `apps/api/src/personalization/*` — append-only event service + customer controller
- `apps/api/src/wishlist/wishlist.service.ts` — `PRODUCT_ADDED_TO_WISHLIST` hook
- `apps/api/src/cart/cart.service.ts` — `PRODUCT_ADDED_TO_CART` hook
- `apps/api/src/orders/order.service.ts` — `ORDER_PLACED` hook
- `apps/api/src/identity/authority.ts`, `rbac.service.ts` — `review:moderate`
- `apps/api/src/identity/security-events.service.ts` — review/Q&A/personalization events
- `apps/api/src/security/abuse.service.ts` — `review_abuse` signal
- `apps/api/src/policy/document.ts`, `empty-pack.ts` — `crm.reviews`, `crm.personalization`

### Web admin

- `apps/web-admin/src/reviews-api.ts`, `reviews-list.tsx`, `app/reviews/page.tsx`, `nav.ts`

### Web customer + mobile

- `apps/web-customer/src/product-detail.tsx` — Reviews + Q&A tabs
- `apps/web-customer/src/commerce-api.ts` — review/Q&A/personalization helpers
- `apps/mobile/src/reviews-features.tsx`, `commerce-api.ts`, `app-root.tsx`

### Documentation

- `docs/blueprint/217_R12_F_REVIEWS_QA_PERSONALIZATION_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 2. Product reviews

| Requirement | Status |
|-------------|--------|
| Authenticated customer submit | **YES** |
| Server-authoritative `authorPersonId` | **YES** — JWT only |
| Country/tenant scope | **YES** |
| Rating 1–5 validation | **YES** |
| Body validation + clinical token rejection | **YES** — `ugc-safety.ts` |
| Verified purchase (OD-R12-04 default) | **YES** — order line match |
| Duplicate per person/item/country | **YES** — unique constraint + P2002 |
| State machine SUBMITTED → APPROVED/REJECTED | **YES** — 409 on invalid |
| Public visibility APPROVED only | **YES** |
| Catalog kernel reuse | **YES** — `catalog_item_id` FK |

---

## 3. Product Q&A

| Requirement | Status |
|-------------|--------|
| Customer question creation | **YES** |
| Product association | **YES** |
| Moderation/publication | **YES** — same state machine pattern |
| Ownership isolation | **YES** |
| Admin moderation + answer | **YES** |
| Non-clinical only | **YES** — UGC safety scan |

---

## 4. Moderation (web-admin)

| Requirement | Status |
|-------------|--------|
| `/reviews` moderation queue | **YES** |
| RBAC `review:moderate` | **YES** |
| Pending filters | **YES** — status query param |
| Approve/reject + version conflict 409 | **YES** |
| Loading/empty/error/forbidden states | **YES** |

---

## 5. Personalization hooks

| Event | Trigger |
|-------|---------|
| `PRODUCT_VIEWED` | Customer POST `/me/personalization/events` (PDP) |
| `PRODUCT_ADDED_TO_WISHLIST` | Wishlist add |
| `PRODUCT_ADDED_TO_CART` | Cart add |
| `PRODUCT_REVIEWED` | Review submit |
| `PRODUCT_QUESTION_ASKED` | Question submit |
| `ORDER_PLACED` | Order paid hook |

Append-only `personalization_events` with unique `(source, source_key, event_kind)`. No ML, no external vendor, no clinical metadata.

---

## 6. API routes

| Method | Route | Auth |
|--------|-------|------|
| GET | `/api/v1/catalog/items/:id/reviews?country=` | public |
| POST | `/api/v1/catalog/items/:id/reviews` | customer |
| GET | `/api/v1/catalog/items/:id/questions?country=` | public |
| POST | `/api/v1/catalog/items/:id/questions` | customer |
| GET | `/api/v1/me/catalog/items/:id/review?country_code=` | customer |
| POST | `/api/v1/me/personalization/events` | customer |
| GET | `/api/v1/admin/reviews/moderation` | admin `review:moderate` |
| PATCH | `/api/v1/admin/reviews/:id` | admin `review:moderate` |
| GET | `/api/v1/admin/questions/moderation` | admin `review:moderate` |
| PATCH | `/api/v1/admin/questions/:id` | admin `review:moderate` |

---

## 7. Tests

| Suite | Result |
|-------|--------|
| `r12f.reviews.e2e.spec.ts` | **1/1 PASS** |
| R12-E/C/D regression | **8/8 PASS** |

---

## 8. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | PASS |
| `api:build` | PASS |
| `web-admin:typecheck` | PASS |
| `web-customer:typecheck` | PASS |
| `mobile:typecheck` | PASS |

---

## 9. Technical debt

**Carried (unchanged):** TD-R12B-06, TD-R12C-01…05, TD-R12D-01…05, TD-R12E-01…03, OD-R12-07, R11 debt

**New R12-F:**

| ID | Item |
|----|------|
| TD-R12F-01 | Review `Idempotency-Key` accepted on POST but duplicate semantics rely on DB unique (same class as TD-R12E-02) |
| TD-R12F-02 | Personalization retention TTL pack key defined but purge worker not implemented |
| TD-R12F-03 | Mobile Q&A submit deferred — read + optional review submit only |

---

## 10. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A/B/C/D/E | COMPLETE |
| **R12-F** | **IMPLEMENTED** |
| R12-G/H | NOT STARTED |
| R10-E/F, R13+ | NOT STARTED |
| Doctor/lab ratings, ML, affiliate mobile, payouts, PSP | **NOT introduced** |

---

## 11. Verdict

**`R12_F_IMPLEMENTED`**

**Exact next authorization:** **`CR-POST-R12-F-AUDIT-218`**

HARD STOP — no R12-G+.
