# 218 — Post-R12-F audit (product reviews/Q&A + personalization hooks)

**CR:** `CR-POST-R12-F-AUDIT-218`  
**Verdict:** `R12_F_GREEN_R12_G_READY`  
**Authority:** [217](217_R12_F_REVIEWS_QA_PERSONALIZATION_IMPLEMENTATION.md) · [216](216_POST_R12_E_AUDIT.md) · [205](205_R12_IMPLEMENTATION_PLAN.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only review of R12-F implementation against Book 217, Book 205, and repository state. **No source, schema, migration, API, UI, test, or configuration changes were made during this CR.**

---

## 1. Executive summary

R12-F delivers the planned **moderated product reviews**, **product Q&A**, **append-only personalization event hooks**, **web-admin moderation queue** (`/reviews`), and **web-customer + mobile PDP review/Q&A UX** — without R12-G/H scope creep, doctor/lab ratings, clinical Q&A, ML recommendations, external personalization vendors, refill automation, affiliate mobile, live payouts, or PSP/settlement.

**Review/Q&A ownership, country scoping, verified-purchase gating, moderation state machines, RLS, RBAC, UGC safety, and personalization boundaries are sound** in code and live database inspection. **No recommendation engine, R13 analytics warehouse, or second abuse kernel** was introduced.

**Findings that do not block R12-G:**
- **TD-R12F-01:** Review POST accepts `Idempotency-Key` header but duplicate semantics rely on DB unique `(catalog_item_id, author_person_id, country_id)` — same class as TD-R12E-02.
- **TD-R12F-02:** `crm.personalization.retention_days` pack key defined; purge worker not implemented.
- **TD-R12F-03:** Mobile Q&A submit deferred — read + optional review submit only.
- **Carried:** TD-R12B-06, TD-R12A-ENV-01, TD-R12C-01…05, TD-R12D-01…05, TD-R12E-01…03, OD-R12-07, R11 debt (unchanged).

**Next authorization:** `CR-R12-G-IMPL-219`

---

## 2. Implementation verification (Book 217 vs repository)

| Book 217 claim | Verified |
|----------------|----------|
| `ProductReview`, `ProductReviewResponse`, `ProductQuestion`, `PersonalizationEvent` models | **YES** — `schema.prisma` |
| Migrations `20260829250000`–`20260829250200` | **YES** — applied; `prisma migrate status` → up to date (106 migrations) |
| `apps/api/src/reviews/*` module | **YES** — service, catalog/self/admin controllers, e2e |
| `apps/api/src/personalization/*` module | **YES** — service, customer controller |
| `ReviewsModule`, `PersonalizationModule` in `app.module.ts` | **YES** |
| Hooks: wishlist, cart, order | **YES** — `PRODUCT_ADDED_TO_WISHLIST`, `PRODUCT_ADDED_TO_CART`, `ORDER_PLACED` |
| RBAC `review:moderate` | **YES** — `authority.ts`, `rbac.service.ts` |
| Security events (5 types) | **YES** — `security-events.service.ts` + emit sites |
| `review_abuse` abuse signal | **YES** — `abuse.service.ts` |
| web-admin `/reviews` | **YES** — `reviews-list.tsx`, `app/reviews/page.tsx`, `nav.ts` |
| web-customer PDP Reviews + Q&A tabs | **YES** — `product-detail.tsx` |
| mobile review/Q&A read panel | **YES** — `reviews-features.tsx`, `app-root.tsx` |
| No R12-G/H modules | **YES** — no `crm_automation_runs`, refill marketing hooks |

**Scope drift check:** No doctor/lab ratings, clinical Q&A workflows, ML recommendation engine, external personalization vendor, R13 analytics/search, refill automation, affiliate mobile, payouts, or PSP.

---

## 3. Product reviews audit

| Control | Status |
|---------|--------|
| JWT-derived ownership (`authorPersonId` from `principal.personId` only) | **PASS** — `reviews.service.ts`; no client `person_id` |
| Country isolation | **PASS** — `resolveCountryByCode`; catalog item country check |
| Verified-purchase rule (OD-R12-04 default) | **PASS** — order line → variant → item match; 403 + `review_abuse` on failure |
| Rating 1–5 validation | **PASS** — `assertRating()` |
| Body/title validation | **PASS** — `assertSafeUgcText()` |
| Clinical-token rejection in UGC | **PASS** — forbidden token list; e2e 400 on `diagnosis` metadata |
| Duplicate handling | **PASS** — unique constraint; P2002 → `{ duplicate: true }`; e2e |
| State machine `SUBMITTED → APPROVED \| REJECTED` | **PASS** — `review-status.ts`; terminal states enforced |
| Invalid transition → 409 | **PASS** — e2e reject after approve → 409 |
| Version conflict → 409 | **PASS** — e2e version mismatch |
| Public visibility APPROVED only | **PASS** — `listPublicReviews` filters status; pending hidden from public GET |
| Catalog kernel reuse (`catalog_item_id` FK) | **PASS** — no duplicate product kernel |

---

## 4. Product Q&A audit

| Control | Status |
|---------|--------|
| Customer ownership | **PASS** — `authorPersonId` from JWT |
| Product/catalog scoping | **PASS** — `catalog_item_id` + published item check |
| Moderation state machine | **PASS** — same SUBMITTED → APPROVED/REJECTED pattern |
| APPROVED-only public visibility | **PASS** — `listPublicQuestions` |
| Admin answer on approve | **PASS** — `answer_body` on PATCH |
| No clinical Q&A | **PASS** — UGC safety scan; commerce/product scope only |

---

## 5. Moderation audit

| Control | Status |
|---------|--------|
| web-admin `/reviews` route | **PASS** |
| RBAC `review:moderate` | **PASS** — `AdminReviewsController`, `AdminQuestionsController` |
| Country scope on admin queries | **PASS** — `country_code` required; rows filtered by `countryId` |
| Approve/reject server-authoritative | **PASS** — `assertReviewTransition` / `assertQuestionTransition` |
| UI states (loading/empty/forbidden/network) | **PASS** — `reviews-list.tsx` |
| Public content moderated before exposure | **PASS** — not UI-filtered; API enforces status |

---

## 6. Personalization audit

| Control | Status |
|---------|--------|
| Append-only `personalization_events` | **PASS** — no UPDATE/DELETE grants; RLS `no_update`/`no_delete` |
| Idempotency `(source, source_key, event_kind)` | **PASS** — unique index; e2e duplicate returns same id |
| Allowed event kinds enum | **PASS** — `PersonalizationEventKind` (6 commerce events) |
| Clinical/PHI metadata rejection | **PASS** — `assertSafeMetadata()` shared with UGC safety |
| No ML/recommendation engine | **PASS** — hook table only; no scoring/ranking code |
| No external personalization vendor | **PASS** — no third-party integration |
| No R13 analytics warehouse | **PASS** — feed table only; no BI/search index |

**Hooks verified in code:**

| Event | Source |
|-------|--------|
| `PRODUCT_VIEWED` | Customer POST `/me/personalization/events` |
| `PRODUCT_ADDED_TO_WISHLIST` | `wishlist.service.ts` |
| `PRODUCT_ADDED_TO_CART` | `cart.service.ts` |
| `PRODUCT_REVIEWED` | `reviews.service.ts` submit |
| `PRODUCT_QUESTION_ASKED` | `reviews.service.ts` submit |
| `ORDER_PLACED` | `order.service.ts` post-payment |

---

## 7. Database / RLS audit

**Live Docker DB** (`world-pharma-postgres`, `worldpharma_test`):

| Table | FORCE RLS | Policies |
|-------|-----------|----------|
| `product_reviews` | **YES** | select/insert/update; `no_delete` → false |
| `product_review_responses` | **YES** | select/insert; no update/delete |
| `product_questions` | **YES** | select/insert/update; `no_delete` → false |
| `personalization_events` | **YES** | select/insert; append-only |

| Check | Result |
|-------|--------|
| `USING(true)` permissive policies | **0** |
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **YES** — `rolsuper=f`, `rolbypassrls=f` |
| Least-privilege grants | **PASS** — reviews/questions UPDATE for moderation; personalization INSERT-only |
| Unique constraints | **PASS** — review per person/item/country; personalization idempotency triple |
| Prisma schema alignment | **PASS** |

---

## 8. API / RBAC audit

| Route (Book 205 / 217) | Verified |
|------------------------|----------|
| GET `/api/v1/catalog/items/:id/reviews` | **YES** — public; APPROVED only |
| POST `/api/v1/catalog/items/:id/reviews` | **YES** — customer JWT |
| GET `/api/v1/catalog/items/:id/questions` | **YES** — public; APPROVED only |
| POST `/api/v1/catalog/items/:id/questions` | **YES** — customer JWT |
| GET `/api/v1/me/catalog/items/:id/review` | **YES** — own review status |
| POST `/api/v1/me/personalization/events` | **YES** — customer JWT |
| GET/PATCH `/api/v1/admin/reviews/*` | **YES** — `review:moderate` |
| GET/PATCH `/api/v1/admin/questions/*` | **YES** — `review:moderate` |

**OD-RATE-01 negative:** No doctor/lab rating endpoint — e2e `POST /catalog/doctors/.../reviews` → 404/405.

No undocumented R12-G+ APIs found.

---

## 9. PHI / privacy boundary

| Surface | Clinical data? |
|---------|----------------|
| Review/Q&A API responses | **NO** — commerce UGC only |
| Personalization metadata | **NO** — opaque IDs; clinical keys rejected |
| Security event payloads | **NO** — operational IDs only |
| web-customer / mobile UI | **NO** — product commerce fields |

No health timeline, lab values, imaging, prescriptions, care-navigation, consent/break-glass, or clinical inference in R12-F paths.

---

## 10. Audit / security events

| Event | Emitted from | Payload |
|-------|--------------|---------|
| `PRODUCT_REVIEW_SUBMITTED` | `reviews.service.ts` submit | `review_id`, `catalog_item_id`, `country_id` |
| `PRODUCT_REVIEW_MODERATED` | `reviews.service.ts` moderate | `review_id`, `country_id`, `status` |
| `PRODUCT_QUESTION_SUBMITTED` | `reviews.service.ts` submit question | `question_id`, `catalog_item_id`, `country_id` |
| `PRODUCT_QUESTION_MODERATED` | `reviews.service.ts` moderate question | `question_id`, `country_id`, `status` |
| `PERSONALIZATION_EVENT_RECORDED` | `personalization.service.ts` | `event_id`, `event_kind`, `country_id` |

No PHI, clinical text, or unnecessary PII in metadata.

---

## 11. Idempotency / concurrency

| Case | Status |
|------|--------|
| Duplicate review submission | **PASS** — DB unique + `{ duplicate: true }` |
| Personalization event idempotency | **PASS** — unique triple; e2e |
| Moderation version conflict | **PASS** — 409; e2e |
| Invalid transition after terminal | **PASS** — 409; e2e |
| TD-R12F-01 Idempotency-Key stub | **Documented** — not a security/data-integrity blocker |

---

## 12. Tests

### R12-F evidence

| Case | Result |
|------|--------|
| Review submit + verified purchase | **PASS** — e2e |
| Unverified purchase → 403 | **PASS** |
| Duplicate review | **PASS** |
| Moderation approve + public visibility | **PASS** |
| Invalid transition / version conflict | **PASS** |
| Q&A create + moderate + public read | **PASS** |
| Personalization + clinical metadata rejection | **PASS** |
| Personalization idempotency | **PASS** |
| Cross-customer / auth (401) | **PASS** |
| OD-RATE-01 negative | **PASS** |

**Suite:** `r12f.reviews.e2e.spec.ts` — **1/1 PASS** (audit re-run).

### Regression

| Suite | Result | Classification |
|-------|--------|----------------|
| `r12e.wishlist` + `r12c.promo` + `r12d.affiliate` | **8/8 PASS** | R12-E/C/D OK |
| `r11a.cms-support-kernel` + `r10a.care-nav-kernel` | **PASS** | R11/R10 OK |
| `r12a.crm-kernel` | **5/6 pass, 1 fail** | **test-infra** — TD-R12A-ENV-01 CRM 403; deterministic in isolation; not R12-F |
| `r12b.marketing` | **2/7 pass, 5 fail** | **test-infra** — TD-R12B-06 policy cache; not R12-F |

Full API suite was **not** run; reported totals are from targeted audit runs above.

---

## 13. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| `web-admin:typecheck` | **PASS** |
| `web-admin:build` | **PASS** |
| `web-customer:typecheck` | **PASS** |
| `mobile:typecheck` | **PASS** |

---

## 14. Runtime verification

| Step | Method | Result |
|------|--------|--------|
| Docker Postgres | Live | **UP** — `world-pharma-postgres` |
| Migration status | Prisma CLI | **Applied** — 106 migrations; 3 R12-F migrations |
| RLS policies | **Docker DB** `psql` | **PASS** — 4 tables FORCE RLS; 16 policies; 0 `USING(true)` |
| `worldpharma_app` role | **Docker DB** | **PASS** — not superuser; no bypass RLS |
| Review/Q&A/personalization lifecycle | **E2E HTTP** | **PASS** — `r12f.reviews.e2e.spec.ts` |
| Manual browser/device | Not performed | E2E covers API+DB integration |

---

## 15. Technical debt audit

### Carried (unchanged)

| ID | Item | Blocker? |
|----|------|----------|
| TD-R12B-06 | Policy-cache test flake | **NO** — test-infra |
| TD-R12A-ENV-01 | R12-A CRM e2e 403 | **NO** — test-infra |
| TD-R12C-01…05 | Promo debt | **NO** |
| TD-R12D-01…05 | Affiliate debt | **NO** |
| TD-R12E-01…03 | Wishlist/loyalty/mobile debt | **NO** |
| OD-R12-07 | Medicine advertising | **NO** |
| R11 debts | per Book 204 | **NO** |

### R12-F debt

| ID | Item | Blocker? |
|----|------|----------|
| TD-R12F-01 | Review `Idempotency-Key` stub | **NO** — DB uniqueness covers integrity |
| TD-R12F-02 | Personalization retention TTL — no purge worker | **NO** — sandbox debt |
| TD-R12F-03 | Mobile Q&A submit deferred | **NO** — read parity delivered |

**No blocker-class debt identified for R12-G authorization.**

---

## 16. Boundary verification

| Phase | Expected | Actual |
|-------|----------|--------|
| R10-A/B/C/D | COMPLETE | **COMPLETE** — care-nav e2e pass |
| R10-E/F | NOT STARTED | **NOT STARTED** |
| R11-A/B/C/D/E | COMPLETE | **COMPLETE** — cms e2e pass |
| R12-A | COMPLETE | **COMPLETE** (1 env flake) |
| R12-B | COMPLETE | **COMPLETE** (test flake) |
| R12-C | COMPLETE | **COMPLETE** |
| R12-D | COMPLETE | **COMPLETE** |
| R12-E | COMPLETE | **COMPLETE** |
| **R12-F** | **IMPLEMENTED** | **IMPLEMENTED** — audit confirms |
| R12-G/H | NOT STARTED | **NOT STARTED** |
| R13+ | NOT STARTED | **NOT STARTED** |

**Explicitly absent:** doctor/lab ratings, clinical Q&A, ML recommendations, external personalization vendors, R13 analytics/search, refill automation, affiliate mobile, payouts/PSP, R10-E/F.

---

## 17. Documentation

| Artifact | Status |
|----------|--------|
| `docs/blueprint/218_POST_R12_F_AUDIT.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |

No source/schema/API/UI/test/config changes.

---

## 18. Verdict

**`R12_F_GREEN_R12_G_READY`**

**Exact next authorization:** **`CR-R12-G-IMPL-219`**

HARD STOP — no R12-G implementation in this CR.
