# 216 — Post-R12-E audit (wishlist + pack-gated loyalty)

**CR:** `CR-POST-R12-E-AUDIT-216`  
**Verdict:** `R12_E_GREEN_R12_F_READY`  
**Authority:** [215](215_R12_E_WISHLIST_LOYALTY_IMPLEMENTATION.md) · [214](214_POST_R12_D_AUDIT.md) · [205](205_R12_IMPLEMENTATION_PLAN.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only review of R12-E implementation against Book 215, Book 214 carry-forward gates, Book 205, and repository state. **No source, schema, migration, API, UI, test, or configuration changes were made during this CR.**

---

## 1. Executive summary

R12-E delivers the planned **person-scoped wishlist** (catalog-offer references), **pack-gated loyalty stub** (append-only ledger, fail-closed when disabled), **customer web + mobile wishlist UX**, **order-paid accrual hook**, and **admin loyalty program APIs** — without R12-F/G/H scope creep, reviews/Q&A, personalization, refill automation, affiliate mobile, live payouts, or PSP/settlement.

**Wishlist ownership, country scoping, catalog validation, RLS, RBAC, and loyalty ledger integrity are sound** in code and live database inspection. **No duplicate finance/payment ledger** was introduced. Loyalty remains non-clinical and non-monetary (`live_redemption: false` everywhere).

**Findings that do not block R12-F:**
- **TD-R12E-01:** web-admin loyalty program UI deferred — admin API only.
- **TD-R12E-02:** Wishlist POST accepts `Idempotency-Key` but does not wire Redis idempotency store (DB uniqueness still prevents duplicate rows).
- **TD-R12E-03:** Mobile PDP heart/save deferred — account wishlist screen only.
- **Audit note:** Admin `GET /admin/loyalty/programs` does not call `assertLoyaltyPackEnabled` (read-only; requires `loyalty:read`); customer-facing endpoints remain pack-gated.
- **Carried:** TD-R12B-06, TD-R12C-01…05, TD-R12D-01…05, OD-R12-07, R11 debt (unchanged).

**Next authorization:** `CR-R12-F-IMPL-217`

---

## 2. Implementation verification (Book 215 vs repository)

| Book 215 claim | Verified |
|----------------|----------|
| `WishlistItem`, `LoyaltyProgram`, `LoyaltyAccount`, `LoyaltyLedgerEntry` models | **YES** — `schema.prisma` |
| Migrations `20260829240000`–`20260829240200` | **YES** — applied; `prisma migrate status` → up to date (103 migrations) |
| `apps/api/src/wishlist/*` module | **YES** — service, controller, module, e2e |
| `apps/api/src/loyalty/*` module | **YES** — service, self + admin controllers, module |
| `WishlistModule`, `LoyaltyModule` in `app.module.ts` | **YES** |
| Order hook `OrderService.insertFromPayment` → `accrueForPaidOrder` | **YES** — post-transaction; `.catch(() => undefined)` |
| Policy `crm.loyalty.enabled` default `false` | **YES** — `document.ts`, `empty-pack.ts` |
| RBAC `loyalty:read`, `loyalty:manage` | **YES** — `authority.ts`, `rbac.service.ts` |
| Security events (5 types) | **YES** — `security-events.service.ts` + emit sites |
| web-customer `/account/wishlist` + PDP save | **YES** — `wishlist-page.tsx`, `product-detail.tsx` |
| mobile wishlist screen | **YES** — `wishlist-features.tsx`, navigation wired |
| web-admin loyalty UI | **NO** — deferred (**TD-R12E-01**) |
| No R12-F/G/H modules | **YES** — no reviews, personalization, refill marketing automation |

**Scope drift check:** No product reviews/Q&A, personalization kernels, refill marketing automation, affiliate mobile, live payouts, PSP transactions, settlement, R10-E/F, or R13 analytics/search introduced.

---

## 3. Wishlist security audit

| Control | Status |
|---------|--------|
| Person-scoped ownership server-authoritative | **PASS** — `personId` from JWT `principal.personId` only; never from body |
| Country scoping enforced | **PASS** — `resolveCountryByCode`; offer must match `countryId` |
| Cross-customer access fails safely | **PASS** — e2e: customer B list empty; remove → 404 |
| Wrong-country offer → safe failure | **PASS** — unpublished/wrong-country offer → 404 |
| Invalid/unpublished catalog offers → 404 | **PASS** — `OfferStatus.PUBLISHED` filter |
| Duplicate rows impossible (DB) | **PASS** — unique `(person_id, country_id, catalog_offer_id)` |
| DELETE cannot affect another customer | **PASS** — delete scoped to principal + unique key lookup |
| No client-supplied person ID override | **PASS** — no `person_id` in controller body |
| No broad catalog access introduced | **PASS** — wishlist returns only saved offers for principal |

### Database policies (live Docker DB — `world-pharma-postgres`)

| Table | FORCE RLS | `USING(true)` permissive | Notes |
|-------|-----------|--------------------------|-------|
| `wishlist_items` | **YES** | **0** | select/insert/delete person+country; `no_update` → `false` |
| `loyalty_programs` | **YES** | **0** | country admin/worker/platform |
| `loyalty_accounts` | **YES** | **0** | person read/insert own; no update/delete |
| `loyalty_ledger_entries` | **YES** | **0** | append-only insert; person read via account join |

**Grants (migration `20260829240200`):** wishlist SELECT/INSERT/DELETE; loyalty programs SELECT/INSERT/UPDATE; accounts/ledger SELECT/INSERT only — least-privilege, no ledger UPDATE/DELETE grants.

**Constraints:** FKs to `persons`, `countries`, `catalog_offers`; unique indexes per Book 215.

---

## 4. Wishlist idempotency (TD-R12E-02)

| Mechanism | Purpose | Implemented? |
|-----------|---------|--------------|
| DB unique `(person_id, country_id, catalog_offer_id)` | Prevent duplicate wishlist rows | **YES** — P2002 → `{ duplicate: true }` |
| `Idempotency-Key` HTTP header | Cross-retry semantic dedup (Redis store) | **NO** — param `_idempotencyKey` unused (**TD-R12E-02**) |

**Classification:** TD-R12E-02 is **correctly classified as technical debt**, not a security or data-integrity blocker. Duplicate adds for the same offer cannot create two rows; HTTP idempotency would only affect retry semantics for concurrent/different-payload scenarios. **Not silently resolved in this audit.**

---

## 5. Loyalty pack-gating

### Pack disabled (`crm.loyalty.enabled = false`)

| Expected | Verified |
|----------|----------|
| No loyalty accrual | **PASS** — `accrueForPaidOrder` returns `{ reason: 'loyalty_disabled' }` |
| No unauthorized ledger mutation | **PASS** — customer ledger → 403; accrual no-ops |
| No customer loyalty data leakage | **PASS** — balance `{ enabled: false }`; ledger 403 |
| Admin mutation fails closed | **PASS** — create/update → 403 via `assertLoyaltyPackEnabled` |
| Customer balance indicates disabled | **PASS** — e2e `enabled: false` |

### Pack enabled

| Expected | Verified |
|----------|----------|
| Active loyalty program required | **PASS** — `activeProgram()` filters `ACTIVE` |
| Authorized ledger operations | **PASS** — worker/platform insert via service; customer read-only |
| Deterministic balance | **PASS** — sum of `pointsDelta` from ledger |
| Country/person isolation | **PASS** — tenant context + RLS on accounts/ledger |

**UI gating is not the security boundary** — server enforces pack gate on accrual and customer ledger; admin mutations gated on write paths.

---

## 6. Loyalty ledger integrity

| Control | Status |
|---------|--------|
| Append-only semantics | **PASS** — `no_update` / `no_delete` policies; no UPDATE grant on ledger |
| No UPDATE/DELETE policy allowing mutation | **PASS** — live DB confirms `false` policies |
| Duplicate `order_paid` earn prevented | **PASS** — unique `(source, source_key, kind)` + pre-check; e2e duplicate accrue |
| Balance derives from ledger | **PASS** — `computeBalance()` sums entries |
| Program version/concurrency protection | **PASS** — PATCH checks `version`; conflict → 409 |
| No second finance/payment ledger | **PASS** — loyalty tables only; no payout/settlement code |

**Loyalty cannot create:** payouts, withdrawals, PSP transactions, settlement, or cash conversion — **confirmed** (no REDEEM path implemented; `live_redemption: false` in balance response).

---

## 7. Order integration (`order_paid` hook)

| Control | Status |
|---------|--------|
| Accrual after order creation/payment boundary | **PASS** — `accrueForPaidOrder` called after successful `insertFromPayment` transaction completes |
| Duplicate order processing does not double-award | **PASS** — ledger unique on `orderId` as `source_key` |
| Failed/unauthorized orders cannot create entries | **PASS** — hook only reached after payment eligibility + order insert |
| Loyalty failure cannot corrupt payment/order state | **PASS** — `.catch(() => undefined)` isolates loyalty errors |
| No clinical information in loyalty metadata | **PASS** — metadata `{ total_minor: string }` only |

Hook location: `order.service.ts` after order transaction `finally` block, before `return present(...)`.

---

## 8. API / RBAC (Book 205)

| Route | Auth | Guards | Verified |
|-------|------|--------|----------|
| `GET/POST/DELETE /api/v1/me/wishlist` | customer JWT | `JwtAuthGuard`, `AudienceGuard`, `customer` | **PASS** |
| `GET /api/v1/me/loyalty/balance` | customer JWT | same | **PASS** |
| `GET /api/v1/me/loyalty/ledger` | customer JWT | pack gate → 403 when disabled | **PASS** |
| `GET/POST/PATCH /api/v1/admin/loyalty/programs` | admin JWT | `PermissionsGuard`, `loyalty:read` / `loyalty:manage` | **PASS** |

**Safe failure modes:** 401 unauthenticated (e2e); 403 pack disabled / admin forbidden; 404 missing offer/wishlist item. Permissions not broadened beyond Book 205 R12-E surface.

---

## 9. PHI / clinical boundary

| Surface | Clinical data? |
|---------|----------------|
| Wishlist API responses | **NO** — catalog commerce metadata (slug, title, SKU, price) |
| Loyalty balance/ledger | **NO** — points, order_id, timestamps only |
| Security event payloads | **NO** — operational IDs only |
| web-customer / mobile wishlist UI | **NO** — commerce catalog fields |

Wishlist remains **commerce/catalog-only**. Loyalty remains **non-clinical**. No health timeline, lab values, imaging, prescriptions, care navigation, consent/break-glass, or clinical notes in R12-E paths.

---

## 10. Audit / security events

| Event | Emitted from | Payload (operational only) |
|-------|--------------|------------------------------|
| `WISHLIST_ITEM_ADDED` | `wishlist.service.ts` add | `wishlist_item_id`, `catalog_offer_id`, `country_id` |
| `WISHLIST_ITEM_REMOVED` | `wishlist.service.ts` remove | same shape |
| `LOYALTY_PROGRAM_CREATED` | `loyalty.service.ts` create | `program_id`, `country_id` |
| `LOYALTY_PROGRAM_UPDATED` | `loyalty.service.ts` update | `program_id`, `country_id`, `status` |
| `LOYALTY_LEDGER_ENTRY_RECORDED` | `loyalty.service.ts` accrue | `entry_id`, `order_id`, `points_delta`, `country_id` |

No PHI or clinical fields in metadata.

---

## 11. Tests

### R12-E evidence

| Case | Result |
|------|--------|
| Wishlist add | **PASS** — e2e |
| Duplicate add | **PASS** — `duplicate: true` |
| List | **PASS** |
| Remove | **PASS** |
| Cross-customer isolation | **PASS** |
| Invalid/unpublished offer | **PASS** — 404 |
| Loyalty pack disabled | **PASS** — balance off, ledger 403 |
| Loyalty enabled + accrue | **PASS** — service + balance 5 |
| Duplicate earn | **PASS** |
| Balance correctness | **PASS** |
| Authorization (401) | **PASS** |

**Suite:** `r12e.wishlist.e2e.spec.ts` — **1/1 PASS** (audit re-run).

### Regression

| Suite | Result | Classification |
|-------|--------|----------------|
| `r12d.affiliate.e2e` + `r12c.promo.e2e` | **7/7 PASS** | R12-C/D OK |
| `r12a.crm-kernel.e2e` | **6/6 PASS** | R12-A OK (isolated) |
| `r12b.marketing.e2e` | **2/7 PASS, 5 fail** | **test-infrastructure** — TD-R12B-06 policy cache (400 on campaign send); deterministic in isolation; not R12-E regression |
| `r11a.cms-support-kernel.e2e` | **PASS** | R11 OK |
| `r10a.care-nav-kernel.e2e` | **PASS** | R10 OK |
| `r9c.consent-scope-enforcement.e2e` | **PASS** | R9 OK |

Full API suite was **not** run; reported totals are from targeted audit runs above.

---

## 12. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** (cache hit) |
| `web-customer:typecheck` | **PASS** |
| `mobile:typecheck` | **PASS** |
| `web-admin:typecheck` | **Not re-run** — R12-E did not add web-admin loyalty UI (**TD-R12E-01**) |

---

## 13. Database / migration verification

| Check | Result |
|-------|--------|
| Migration ordering | **PASS** — schema → RLS → grants |
| Migration application | **PASS** — `prisma migrate status` up to date |
| Prisma schema alignment | **PASS** — models match migration SQL |
| RLS FORCE + deny-by-default | **PASS** — live DB inspection |
| Grants least-privilege | **PASS** |
| Indexes / unique / FK | **PASS** — per `20260829240000` |
| Append-only ledger policies | **PASS** |

No migrations modified during this audit.

---

## 14. Runtime verification

| Step | Method | Result |
|------|--------|--------|
| Docker Postgres/Redis | Live | **UP** — `world-pharma-postgres`, `world-pharma-redis` |
| Migration status | Live DB via Prisma | **Applied** — 3 R12-E migrations |
| RLS policies | **Docker DB** (`docker exec world-pharma-postgres psql`) | **PASS** — 4 tables FORCE RLS; 16 policies; no permissive `true` |
| Wishlist + loyalty flow | **E2E HTTP stack** | **PASS** — `r12e.wishlist.e2e.spec.ts` |
| API `/health/ready` | Not manually exercised | — |
| Browser/device manual | Not performed | web-customer/mobile verified via static review + typecheck |

**Distinction:** R12-E behavior verified via **e2e against test DB** and **live Docker policy inspection**, not a separate manual live session.

---

## 15. Technical debt classification

### Carried (unchanged)

| ID | Item | Blocker? |
|----|------|----------|
| TD-R12B-06 | Policy-cache test flake (R12-B e2e) | **NO** — test-infra |
| TD-R12C-01…05 | Promo debt per Book 212 | **NO** |
| TD-R12D-01…05 | Affiliate debt per Book 214 | **NO** |
| OD-R12-07 | Medicine advertising disabled/open | **NO** — product gate |
| R11 debts | per Book 204 | **NO** |

### R12-E debt

| ID | Item | Blocker? |
|----|------|----------|
| TD-R12E-01 | web-admin loyalty UI deferred | **NO** — admin API sufficient for R12-E |
| TD-R12E-02 | Wishlist `Idempotency-Key` stub | **NO** — DB uniqueness covers integrity |
| TD-R12E-03 | Mobile PDP heart deferred | **NO** — account wishlist delivered |

**No blocker-class debt identified for R12-F authorization.**

---

## 16. Boundary verification

| Phase | Expected | Actual |
|-------|----------|--------|
| R10-A/B/C/D | COMPLETE | **COMPLETE** — care-nav e2e pass |
| R10-E/F | NOT STARTED | **NOT STARTED** |
| R11-A/B/C/D/E | COMPLETE | **COMPLETE** — cms e2e pass |
| R12-A | COMPLETE | **COMPLETE** |
| R12-B | COMPLETE | **COMPLETE** (test flake only) |
| R12-C | COMPLETE | **COMPLETE** |
| R12-D | COMPLETE | **COMPLETE** |
| **R12-E** | **COMPLETE** | **COMPLETE** — audit confirms |
| R12-F/G/H | NOT STARTED | **NOT STARTED** |
| R13+ | NOT STARTED | **NOT STARTED** |

**Explicitly absent:** reviews/Q&A, personalization, refill marketing automation, affiliate mobile, live payouts, PSP/settlement, R10-E/F, R13 analytics/search.

---

## 17. Documentation

| Artifact | Status |
|----------|--------|
| `docs/blueprint/216_POST_R12_E_AUDIT.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |

No source/schema/API/UI/test/config changes.

---

## 18. Verdict

**`R12_E_GREEN_R12_F_READY`**

**Exact next authorization:** **`CR-R12-F-IMPL-217`**

HARD STOP — no R12-F implementation in this CR.
