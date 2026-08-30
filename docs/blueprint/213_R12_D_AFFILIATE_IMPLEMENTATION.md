# R12-D Affiliate web + referral infrastructure implementation

**CR:** `CR-R12-D-IMPL-213`  
**Verdict:** `R12_D_IMPLEMENTED`  
**Next authorization:** `CR-POST-R12-D-AUDIT-214`  
**Authority:** [205](205_R12_IMPLEMENTATION_PLAN.md) · [212](212_POST_R12_C_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R12-D delivers **referral codes**, **referral links**, **public click ingestion**, **affiliate self-service APIs**, **admin affiliate partner ops**, **`apps/web-affiliate`**, and **checkout attribution integration** with existing `AffiliateAttributionSnapshot` / `AffiliateLiability` kernels. No R12-E+, live payouts, affiliate mobile, or medicine advertising.

---

## 1. Repository audit (pre-implementation)

| Area | Pre-R12-D state | R12-D action |
|------|-----------------|--------------|
| `AffiliateAttributionSnapshot` | EXISTS — cart quote | **Extended** via referral code resolution |
| `AffiliateLiability` / finance admin approve/reverse | EXISTS | **Reused** — no duplicate kernel |
| `GET /me/affiliate/earnings` | PARTIAL — filtered customer orders | **Fixed** — org-scoped via referral codes |
| Referral codes / links / clicks DB | MISSING | **Added** |
| `apps/web-affiliate` | PLANNED (0 files) | **Created** |
| Dedicated `affiliate/` API module | MISSING | **Created** |
| RBAC `affiliate:read` / `affiliate:manage` | MISSING | **Added** |
| Public click endpoint | MISSING | **Added** |

**Reused kernels:** identity/JWT, finance liability, cart attribution snapshots, promo/marketing patterns (tenant context, security events, admin shell), `ConversionEvent` for `AFFILIATE_CLICK`, `abuse.service` `affiliate_abuse`.

---

## 2. Files changed

### Database

- `packages/database/prisma/schema.prisma` — `AffiliateReferralCode`, `AffiliateLink`, `AffiliateClick`; enums; relations on `Person`, `Country`, `Organization`, `Partner`
- `packages/database/prisma/migrations/20260829230000_r12d_affiliate_schema/migration.sql`
- `packages/database/prisma/migrations/20260829230100_r12d_affiliate_rls/migration.sql`
- `packages/database/prisma/migrations/20260829230200_r12d_affiliate_grants/migration.sql`

### API — affiliate module (`apps/api/src/affiliate/`)

- `affiliate-status.ts` — code/link transitions; normalization
- `affiliate-context.service.ts` — affiliate org operator resolution
- `affiliate-attribution.service.ts` — checkout code resolution (managed inactive stripped; legacy pass-through)
- `affiliate.service.ts` — codes, links, stats, earnings, admin partners
- `affiliate-click.service.ts` — public click ingest + dedupe
- `affiliate.controller.ts` — admin + self routes
- `public-affiliate.controller.ts` — `POST /public/affiliate/click`
- `affiliate.module.ts`
- `affiliate-status.spec.ts` (5 tests)
- `r12d.affiliate.e2e.spec.ts` (1 e2e, 6 assertions paths)

### API — integration

- `apps/api/src/app/app.module.ts` — `AffiliateModule`
- `apps/api/src/cart/cart.module.ts` — imports `AffiliateModule`
- `apps/api/src/cart/cart.service.ts` — resolves referral codes at checkout start
- `apps/api/src/finance/finance.module.ts` — removed duplicate `FinanceAffiliateController`
- `apps/api/src/finance/finance.service.ts` — removed broken customer-order earnings filter
- `apps/api/src/identity/authority.ts` — `affiliate:read`, `affiliate:manage`
- `apps/api/src/identity/rbac.service.ts` — permission catalog
- `apps/api/src/identity/security-events.service.ts` — `AFFILIATE_REFERRAL_CREATED`
- `apps/api/src/identity/app-topology.ts` — web-affiliate **IMPLEMENTED**
- `apps/api/src/identity/app-topology.spec.ts`

### Web-affiliate (new app)

- `apps/web-affiliate/` — Next.js shell: `/`, `/codes`, `/links`, `/earnings`, `/profile`
- `apps/web-affiliate/src/affiliate-api.ts`, `affiliate-hub.tsx`

### Web-admin

- `apps/web-admin/src/affiliate-api.ts`, `affiliate-list.tsx`
- `apps/web-admin/app/affiliates/page.tsx`
- `apps/web-admin/src/nav.ts` — Affiliates nav (`affiliate:read`)

### Documentation

- `docs/blueprint/213_R12_D_AFFILIATE_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 3. Schema / state machines

### `AffiliateReferralCode`

- States: `DRAFT` → `ACTIVE` / `INACTIVE` / `EXPIRED` (terminal)
- Unique `(country_id, code)`; org-owned; optional `partner_id`
- Version column; invalid transition → 409

### `AffiliateLink`

- States: `ACTIVE` ↔ `INACTIVE`
- FK to referral code; org + country scoped

### `AffiliateClick`

- Append-only; unique `click_id`; operational metadata only (no PII)

---

## 4. API inventory

| Method | Route | Actor | Auth | RBAC | Notes |
|--------|-------|-------|------|------|-------|
| GET | `/admin/affiliate/partners` | admin | JWT admin | `affiliate:read` | country |
| POST | `/admin/affiliate/referral-codes` | admin | JWT admin | `affiliate:manage` | idempotency header stub |
| GET | `/me/affiliate/earnings` | affiliate org op | JWT customer | org membership | org-scoped liabilities |
| GET/POST | `/me/affiliate/codes` | affiliate | JWT customer | org membership | self-service |
| PATCH | `/me/affiliate/codes/:id` | affiliate | JWT customer | org membership | version conflict 409 |
| GET/POST | `/me/affiliate/links` | affiliate | JWT customer | org membership | |
| GET | `/me/affiliate/stats` | affiliate | JWT customer | org membership | |
| POST | `/public/affiliate/click` | public | none | rate/abuse | click_id dedupe |

Finance admin approve/reverse remain at `/admin/finance/affiliate/:orderId/*` (existing kernel).

---

## 5. RLS / RBAC / security

- All affiliate tables: **FORCE RLS**; org read via `app.can_org`; admin via `app.can_country`; clicks insert worker/platform/country
- Grants: referral codes/links UPDATE; clicks INSERT-only
- `affiliate:read` → company_operations, company_finance, company_support
- `affiliate:manage` → company_operations
- Security event: `AFFILIATE_REFERRAL_CREATED`; click path emits `CONVERSION_EVENT_RECORDED`
- Public click: `affiliate_abuse` signal on invalid code/link; inactive → 410

---

## 6. Money / clinical boundaries

- **Money:** liability visibility only; `live_payout: false`; no PSP/payout/settlement paths added
- **Clinical:** checkout affiliate preview remains `clinical_blocked: true`, `payable: false`, `preview_minor: '0'`
- **OD-R12-07:** medicine advertising not enabled

---

## 7. Tests

| Suite | Result |
|-------|--------|
| `affiliate-status.spec.ts` | 5/5 PASS |
| `r12d.affiliate.e2e.spec.ts` | 1/1 PASS (codes, links, clicks, dedupe, stats, isolation, admin RBAC, earnings boundary) |

---

## 8. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | PASS |
| `api:build` | PASS |
| `web-admin:typecheck` | PASS |
| `web-affiliate:typecheck` | PASS |
| `web-affiliate:build` | PASS |

---

## 9. Runtime / migrations

- Migrations `20260829230000`–`30200` applied to `worldpharma_test` (127.0.0.1:55432)
- E2e exercises full HTTP stack against test DB (not manual Docker checklist)
- Existing checkout attribution kernel preserved; managed inactive codes stripped at checkout

---

## 10. Technical debt (carried + new)

**Carried (unchanged):** TD-R12C-01…05, TD-R12B-06, OD-R12-07, R11 debt

**New R12-D:**

| ID | Item |
|----|------|
| TD-R12D-01 | Admin referral-code idempotency header stub only |
| TD-R12D-02 | `AffiliateAccount` KYC lifecycle (Book 205 §9.5) deferred — org membership only |
| TD-R12D-03 | Affiliate web sign-in UX (OTP) not polished — shell uses session provider |
| TD-R12D-04 | Commission preview remains zero by design until OD-AFF / R14 |

---

## 11. Boundary verification

| Phase | Status |
|-------|--------|
| R12-A/B/C | COMPLETE (regression via existing suites) |
| **R12-D** | **IMPLEMENTED** |
| R12-E/F/G/H | NOT STARTED |
| R10-E/F, R13+ | NOT STARTED |
| Affiliate mobile, live payout, PSP, loyalty, wishlist, reviews, personalization, refill automation | **NOT introduced** |

---

## 12. Verdict

**`R12_D_IMPLEMENTED`**

**Exact next authorization:** **`CR-POST-R12-D-AUDIT-214`**

HARD STOP — no R12-E+.
