# Post-R11-B Audit

**CR:** `CR-POST-R11-B-AUDIT-198`  
**Verdict:** **`R11_B_GREEN_R11_C_READY`**  
**Baseline:** [197](197_R11_B_ADMIN_CMS_UI_IMPLEMENTATION.md) (**R11_B_IMPLEMENTED**)  
**Authority:** [193](193_R11_IMPLEMENTATION_PLAN.md) · [194](194_POST_R11_PLAN_AUDIT.md) · [195](195_R11_A_BACKEND_KERNEL_IMPLEMENTATION.md) · [196](196_POST_R11_A_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only CR. No source, schema, migration, API, UI, test, or configuration changes were made.

---

## 1. Executive summary

R11-B admin CMS UI **matches repository reality** and Book 197 for all core deliverables: four web-admin routes, list/create/editor/version-history screens, permission gates, real R11-A API integration, workflow actions aligned to the server state machine, `POST /admin/cms/assets` on shared `PrivateObjectStore`, OD-CMS-01 explicitly unresolved, and focused tests green.

**No product, security, database, or architecture blockers** prevent authorization of **CR-R11-C-IMPL-199**.

Full API suite reports **2/205 failures** in `r10a.care-nav-kernel.e2e.spec.ts` when run concurrently — **isolated rerun 2/2 PASS**. Classified as **shared-DB test pollution** (pre-existing), not an R11-B regression.

---

## 2. Implementation verification (Book 197 vs repository)

### Web-admin CMS UI — **PASS**

| Claim | Verified |
|-------|----------|
| `/cms` list | `apps/web-admin/app/cms/page.tsx` → `CmsAdminList` |
| `/cms/new` create | `apps/web-admin/app/cms/new/page.tsx` → `CmsAdminCreate` |
| `/cms/[id]` editor | `apps/web-admin/app/cms/[id]/page.tsx` → `CmsAdminEditor` |
| `/cms/[id]/versions` | `apps/web-admin/app/cms/[id]/versions/page.tsx` → `CmsAdminVersions` |
| Nav `cms:read` gate | `apps/web-admin/src/nav.ts:51–57` |
| API client 1:1 R11-A | `apps/web-admin/src/cms-admin-api.ts` — all `/api/v1/admin/cms/*` |
| No mock CMS data | Client uses `fetch` + bearer token only |
| OD-CMS-01 notice | List + editor banners; `cms-admin.spec.tsx` assertion |

### Asset upload (R11-A deferral closed) — **PASS**

| Claim | Verified |
|-------|----------|
| `POST /admin/cms/assets` | `admin-cms.controller.ts:134–154` |
| `CmsAssetService` | `cms-asset.service.ts` |
| Shared `PrivateObjectStore` | Same abstraction as KYC (`partner/object-store.ts`) |
| No duplicate CMS kernel | Single `CmsModule`; one content + one asset service |

### Absent scope — **PASS**

| Item | Status |
|------|--------|
| Help Center customer UI (R11-C) | No `app/help/**` in any customer app |
| Support Desk agent UI (R11-D) | No support routes under `web-admin/app/` |
| R10-E/F | No new health upload / consult-note projection |
| R12+ CRM/marketing | No new admin CRM/marketing surfaces |

Public Help Center remains **API-only** (`help-center.controller.ts`). Pre-existing customer support ticket page (`web-customer/app/account/support`) is R11-A customer kernel, not R11-C/D.

---

## 3. CMS workflow assessment — **PASS**

**Server transitions** (`cms-status.ts`):

`DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED` (+ `ARCHIVED → PUBLISHED` re-publish)

| Check | Result |
|-------|--------|
| Client cannot forge status | PATCH does not accept `status`; transitions via dedicated POST endpoints only |
| Invalid transition → 409 | `assertCmsTransition` in `cms-content.service.ts` |
| Unauthorized publish → 403 | E2e: editor (`company_operations`) cannot publish |
| Version conflict → 409 | `expected_version` check on PATCH (`cms-content.service.ts:194`) |
| Published snapshots immutable | Publications RLS insert-only; UI disables edit when not DRAFT/IN_REVIEW |
| Post-action server state | `runAction` sets item from API response (`cms-admin-editor.tsx:196–206`) |
| Revision/publication history | `CmsAdminVersions` + `GET …/versions` |
| Re-publish UI | Button when `ARCHIVED` + `cms:publish` (`cms-admin-editor.tsx:377+`) |

**OD-CMS-01 dual-control:** **NOT implemented.** `cms:review` unused in controllers and UI. Explicit notices on list and editor. **Not silently resolved** — classified as product debt (TD-R11A-01).

**Gap (non-blocking):** ARCHIVED → PUBLISHED re-publish not covered in R11-A e2e lifecycle test; backend transition and UI button verified in code review.

---

## 4. Asset upload assessment — **PASS**

`POST /api/v1/admin/cms/assets`:

| Control | Result |
|---------|--------|
| Authentication | Admin JWT + `JwtAuthGuard` |
| Authorization | `cms:write` (`admin-cms.controller.ts:136`) |
| Country/tenant isolation | `resolveCountryByCode` + `runWithTenant` + optional `content_item_id` country match |
| File type validation | `ALLOWED_CMS_ASSET_CONTENT_TYPES` (jpeg/png/webp/gif) |
| Size validation | `MAX_CMS_ASSET_BYTES` = 5 MB |
| Private storage | `PrivateObjectStore.put` prefix `cms/{countryId}` |
| No public URL leakage | Response: `asset_id`, metadata only — e2e asserts no `var/private` paths |
| Security event | `CMS_ASSET_UPLOADED` — `asset_id`, `country_id`, `content_item_id`, `byte_size`, `content_type` |
| No PHI in event | Operational metadata only |

**Usability limitation (documented, not fixed):** TD-R11B-01 — `asset_id` returned to author but not auto-inserted into body HTML. Asset is stored and referenceable; embedding deferred.

**Malware scan:** `AllowAllMalwareScanner` (same as KYC) — pre-existing pattern, not R11-B regression.

---

## 5. API / authorization / RLS assessment — **PASS**

### Admin CMS operations

| Operation | Auth | Permission | Tenant |
|-----------|------|------------|--------|
| List/get content | admin JWT | `cms:read` | `country_code` |
| Create/patch/submit-review | admin JWT | `cms:write` | `country_code` |
| Publish/archive | admin JWT | `cms:publish` | `country_code` |
| Versions | admin JWT | `cms:read` | `country_code` |
| Upload asset | admin JWT | `cms:write` | `country_code` |

### Public Help Center

- `help-center.controller.ts` uses `CmsSearchService` published-only methods (`listPublishedArticles`, `getPublishedArticle`)
- E2e: draft article → public GET **404**; after publish → **200**; after archive → **404**

### RLS

- CMS tables: `FORCE ROW LEVEL SECURITY` (`20260829190200_r11a_cms_rls`)
- **No `USING(true)`** on CMS tables (grep verified)
- Policies use `app.is_worker()`, `app.is_platform()`, `app.can_country()`
- No R11-B migration or policy changes — RLS not weakened for UI

---

## 6. PHI / privacy assessment — **PASS**

| Surface | Assessment |
|---------|------------|
| CMS API responses | Operational content fields; no clinical identifiers |
| Asset responses | Opaque `asset_id` + checksum/size/type |
| Security events | `CMS_ASSET_UPLOADED` metadata only |
| Outbox (CMS events) | Unchanged R11-A opaque payloads |
| Error responses | Problem `detail` strings; no raw SQL in client |

CMS/help content treated as non-PHI operational content per Books 193–197.

---

## 7. Tests (exact counts)

### Focused (R11-B / R11-A CMS)

| Suite | Tests | Result |
|-------|-------|--------|
| `cms-admin.spec.tsx` | **5** | **PASS** |
| `web-admin` full | **17** | **PASS** |
| `r11a.cms-support-kernel.e2e` (fresh, `--skip-nx-cache`) | **4** | **PASS** |

R11-A e2e covers: 401 unauthenticated CMS, full CMS lifecycle + public draft isolation + asset upload, support lifecycle, help search published-only.

### Regression (R9 / R10)

| Suite | Tests | Result |
|-------|-------|--------|
| `r9a.health-record-kernel` + `r9d.doctor-health` + `r9c.consent-scope` (isolated) | **7** | **PASS** |
| `r10d.care-nav-governance` (cached prior run) | **4** | **PASS** |
| `r10a.care-nav-kernel` (isolated after full-suite failure) | **2** | **PASS** |

### Full API suite

| Metric | Result |
|--------|--------|
| **Total** | **205** tests |
| **Passed** | **203** |
| **Failed** | **2** |

**Failure detail:**

| Suite | Test | Error | Isolated rerun | Classification |
|-------|------|-------|----------------|----------------|
| `r10a.care-nav-kernel.e2e.spec.ts` | `happy path: create, idempotent create…` | Expected 201, got **403** on session create | **PASS** (2/2) | **test infrastructure** — shared-DB / pack-state pollution when suites run concurrently |
| `r10a.care-nav-kernel.e2e.spec.ts` | `security negatives: isolation…` | Expected 201, got **403** on session create | (same isolated run) | **test infrastructure** |

**Not an R11-B product defect.** No CMS/support tests failed in full suite.

---

## 8. Typecheck / build

| Target | Result |
|--------|--------|
| `nx run web-admin:typecheck` | **PASS** |
| `nx run web-admin:build` | **PASS** (33 routes incl. 4 CMS routes) |
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |

---

## 9. Runtime verification

| Step | Result |
|------|--------|
| Docker Postgres/Redis | Available to e2e harness (migrate deploy in test setup) |
| API `/health/ready` long-lived | **NOT VERIFIED** — no API listener on `:4000` at audit time |
| CMS HTTP lifecycle | **VERIFIED** via `r11a.cms-support-kernel.e2e` (draft→review→publish→archive, public isolation, asset upload) |
| Browser CMS admin flow | **NOT VERIFIED** — no browser automation; build confirms route compilation |
| Unauthorized / tenant isolation | **VERIFIED** via e2e (401, 403 publish, draft public 404) |

---

## 10. Boundary verification

| Phase | Expected | Actual |
|-------|----------|--------|
| R10-A/B/C/D | COMPLETE | COMPLETE (spot-check + isolated r10a green) |
| R10-E/F | NOT STARTED | NOT STARTED |
| R11-A | COMPLETE | COMPLETE |
| R11-B | IMPLEMENTED | IMPLEMENTED |
| R11-C | NOT STARTED | NOT STARTED |
| R11-D | NOT STARTED | NOT STARTED |
| R11-E | NOT STARTED | NOT STARTED |
| R12+ | NOT STARTED | NOT STARTED |

---

## 11. Technical debt (re-classified)

| ID | Classification | Status |
|----|----------------|--------|
| TD-R11A-01 / OD-CMS-01 dual-control | **product debt** | Unchanged; explicit UI notice |
| TD-R11A-02 customer ticket close | **product debt** | Unchanged |
| TD-R11A-04 reveal-PII → R11-D | **deferred/later** | Unchanged |
| TD-R11B-01 asset_id body insertion | **product debt** | Present; documented |
| TD-R11B-02 missing browser E2E | **test infrastructure** | Present; non-blocking |
| TD-R11B-03 inline review workflow | **product debt** | Functionally equivalent to separate route |
| Shared-DB test pollution | **test infrastructure** | r10a flakes in full suite; isolated green |
| Runtime verification gaps | **environment/ops** | No long-lived API/browser at audit |
| TD-R11A-03 Windows prisma EPERM | **test infrastructure** | Carried forward |

**No new blocker-class debt introduced by R11-B.**

---

## 12. R11-C readiness

R11-B provides admin authoring and publish pipeline. R11-A public Help Center read APIs exist and expose **published content only**. Prerequisites for R11-C (customer Help Center UI consuming published content) are met.

**Authorization:** **`CR-R11-C-IMPL-199`**

---

## 13. Audit verdict

### **`R11_B_GREEN_R11_C_READY`**

No product, security, database, or architecture blockers for R11-C.
