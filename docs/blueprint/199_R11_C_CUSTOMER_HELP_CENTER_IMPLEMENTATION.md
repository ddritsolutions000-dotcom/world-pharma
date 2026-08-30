# R11-C Customer Help Center Implementation

**CR:** `CR-R11-C-IMPL-199`  
**Verdict:** `R11_C_IMPLEMENTED`  
**Authority:** [193](193_R11_IMPLEMENTATION_PLAN.md) · [194](194_POST_R11_PLAN_AUDIT.md) · [195](195_R11_A_BACKEND_KERNEL_IMPLEMENTATION.md) · [196](196_POST_R11_A_AUDIT.md) · [197](197_R11_B_ADMIN_CMS_UI_IMPLEMENTATION.md) · [198](198_POST_R11_B_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R11-C delivers the **customer Help Center** on web and mobile, consuming existing R11-A public Help APIs only. No R11-D/E, R10-E/F, or R12+ work was started. No backend API changes were required.

---

## 1. Scope delivered

| Area | Status |
|------|--------|
| Web `/help` home | **IMPLEMENTED** |
| Web category `/help/c/[categorySlug]` | **IMPLEMENTED** |
| Web article `/help/a/[articleSlug]` | **IMPLEMENTED** |
| Web search `/help/search` | **IMPLEMENTED** |
| Mobile help-home / category / article / search screens | **IMPLEMENTED** |
| Public Help API client (no auth) | **IMPLEMENTED** |
| Published-only content (server-enforced) | **IMPLEMENTED** |
| Loading / empty / retry / 404 states | **IMPLEMENTED** |
| Country/locale query params | **IMPLEMENTED** |
| Focused web + mobile tests | **IMPLEMENTED** |

### Explicit non-starts

- R11-D Support Desk agent UI
- R11-E closure audit
- R10-E/F health uploads / consult-note projection
- R12+ CRM/marketing/analytics
- New CMS/search/support kernels
- OD-CMS-01 resolution (unchanged)

---

## 2. Files changed

### Web-customer

- `apps/web-customer/src/help-api.ts` — public Help API client
- `apps/web-customer/src/help-shell.tsx` — public Help Center shell + nav
- `apps/web-customer/src/help-home-page.tsx`
- `apps/web-customer/src/help-category-page.tsx`
- `apps/web-customer/src/help-article-page.tsx`
- `apps/web-customer/src/help-search-page.tsx`
- `apps/web-customer/src/help-api.spec.ts`
- `apps/web-customer/src/help-home-page.spec.tsx`
- `apps/web-customer/src/customer-shell.tsx` — Help Center entry link
- `apps/web-customer/app/help/page.tsx`
- `apps/web-customer/app/help/c/[categorySlug]/page.tsx`
- `apps/web-customer/app/help/a/[articleSlug]/page.tsx`
- `apps/web-customer/app/help/search/page.tsx`

### Mobile

- `apps/mobile/src/help-api.ts`
- `apps/mobile/src/help-features.tsx` — HelpHomeScreen, HelpCategoryScreen, HelpArticleScreen, HelpSearchScreen
- `apps/mobile/src/help-parity.spec.ts`
- `apps/mobile/src/navigation.ts` — public help screens + `PUBLIC_HELP_SCREENS`
- `apps/mobile/src/app-root.tsx` — help routing (public + authenticated)

### Documentation

- `docs/blueprint/199_R11_C_CUSTOMER_HELP_CENTER_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 3. Web Help Center routes

| Route | Component | API |
|-------|-----------|-----|
| `/help` | `HelpHomeScreen` | categories, articles, banners |
| `/help/c/[categorySlug]` | `HelpCategoryScreen` | `GET /help/articles?category_slug=` |
| `/help/a/[articleSlug]` | `HelpArticleScreen` | `GET /help/articles/:slug` |
| `/help/search` | `HelpSearchScreen` | `GET /help/search?q=` |

Country/locale via `useCountries()` default (`XX` / `en`) and query params on search links.

**Public access:** no JWT required (Book 193).

---

## 4. Mobile Help Center screens

| Screen ID | Parity |
|-----------|--------|
| `help-home` | Web `/help` |
| `help-category` | Web `/help/c/[categorySlug]` |
| `help-article` | Web `/help/a/[articleSlug]` |
| `help-search` | Web `/help/search` |

`PUBLIC_HELP_SCREENS` allows unauthenticated access. Entry: welcome screen “Browse Help Center” button + `MORE_NAV` / `ACCOUNT_NAV` when signed in.

---

## 5. API integration

All calls target existing R11-A public endpoints:

| Client function | Endpoint |
|-----------------|----------|
| `fetchHelpCategories` | `GET /api/v1/help/categories` |
| `fetchHelpArticles` | `GET /api/v1/help/articles` |
| `fetchHelpArticle` | `GET /api/v1/help/articles/:slug` |
| `fetchHelpSearch` | `GET /api/v1/help/search` |
| `fetchHelpBanners` | `GET /api/v1/help/banners` |

Error handling via `HelpApiError`:

| Status | UI |
|--------|-----|
| 0 (network) | `NetworkErrorState` / `NativeNetworkErrorState` + retry |
| 400 | validation message (search query length) |
| 404 | article not found empty state |
| 5xx | generic error + retry |

No mock/hardcoded articles. No raw DB errors exposed.

---

## 6. Search behavior

Uses R11-A `CmsSearchService.search`:

- Published-only (`published: true` in DB query)
- Country + locale scoped
- Deterministic ordering: `title asc`, `slug asc`, `id asc`
- Max query length 200 (server validation → 400)
- Empty query returns empty results (server)
- No commerce search kernel duplication

---

## 7. Published-content / security assessment

| Check | Result |
|-------|--------|
| DRAFT / IN_REVIEW / ARCHIVED not in public APIs | Server-side `published: true` filter only |
| Client-side filtering as security boundary | **NOT used** |
| Direct slug guess on unpublished | **404** (R11-A e2e verified) |
| Country/locale isolation | `country_code` + RLS on search documents |
| No internal CMS metadata in UI | Only title, summary, body, category, type |
| No storage paths | API returns no `storage_key` |
| OD-CMS-01 | Unchanged; not silently resolved |

---

## 8. PHI / privacy assessment

Help Center content is operational/non-PHI. UI does not display author IDs, revision numbers, or internal audit data. No analytics hooks added. No article body in security events.

---

## 9. Tests (exact counts)

### Focused (R11-C)

| Suite | Tests | Result |
|-------|-------|--------|
| `web-customer` — `help-home-page.spec.tsx` | **4** | **PASS** |
| `web-customer` — `help-api.spec.tsx` | **3** | **PASS** |
| `mobile` — `help-parity.spec.ts` | **3** | **PASS** |

**R11-C focused total: 10**

### Regression

| Suite | Tests | Result |
|-------|-------|--------|
| `r11a.cms-support-kernel.e2e` (fresh) | **4** | **PASS** |
| `r10a.care-nav-kernel` (isolated) | **2** | **PASS** |
| `r9a.health-record-kernel` (isolated) | **1** | **PASS** |

### Full API suite

| Metric | Count |
|--------|-------|
| Total | **205** |
| Passed | **204** |
| Failed | **1** |

**Failure (not R11-C):**

| Suite | Test | Error | Isolated | Classification |
|-------|------|-------|----------|----------------|
| `r10a.care-nav-kernel.e2e.spec.ts` | `security negatives…` | Expected 409, got **403** | **PASS** (2/2) | **test infrastructure** — shared-DB pack-state pollution |

Concurrent R9/R10 spot-check also showed shared-DB flakes; isolated reruns green.

---

## 10. Typecheck / build

| Target | Result |
|--------|--------|
| `nx run web-customer:typecheck` | **PASS** |
| `nx run web-customer:build` | **PASS** (26 routes incl. 4 help routes) |
| `nx run mobile:typecheck` | **PASS** |
| API typecheck/build | **N/A** — no API changes |

---

## 11. Runtime verification

| Step | Result |
|------|--------|
| Docker Postgres/Redis (e2e harness) | Available |
| `/health/ready` long-lived API | **NOT VERIFIED** |
| Help public APIs (published/draft isolation) | **VERIFIED** via R11-A e2e |
| Web Help Center browser flow | **NOT VERIFIED** — no browser automation; build confirms routes |
| Mobile Help screens device runtime | **NOT VERIFIED** — no Android/iOS emulator in environment |
| Search validation (400) | **VERIFIED** in API unit path via client error handling tests |

---

## 12. Boundary verification

| Phase | Status |
|-------|--------|
| R10-A/B/C/D | COMPLETE |
| R10-E/F | NOT STARTED |
| R11-A/B | COMPLETE |
| **R11-C** | **IMPLEMENTED** |
| R11-D/E | NOT STARTED |
| R12+ | NOT STARTED |

No Support Desk UI. No CRM/marketing/analytics. No clinical automation added.

---

## 13. Technical debt

| ID | Classification | Note |
|----|----------------|------|
| TD-R11A-01 / OD-CMS-01 | product debt | Unchanged |
| TD-R11B-01 asset embedding | product debt | Unchanged |
| TD-R11B-02 browser E2E | test infrastructure | Unchanged |
| TD-R11B-03 inline review workflow | product debt | Unchanged |
| Shared-DB test pollution | test infrastructure | r10a/r9a/r10d flakes in concurrent runs |
| TD-R11C-01 | test infrastructure | No browser/mobile device E2E for Help Center |
| TD-R11C-02 | environment/ops | Long-lived API/browser runtime not verified |
| TD-R11C-03 | product debt | Locale hardcoded to `en` in mobile; web uses countries hook default |

---

## 14. Next step

**`CR-POST-R11-C-AUDIT-200`**
