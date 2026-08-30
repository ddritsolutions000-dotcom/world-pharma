# R11-B Admin CMS UI Implementation

**CR:** `CR-R11-B-IMPL-197`  
**Verdict:** `R11_B_IMPLEMENTED`  
**Authority:** [193](193_R11_IMPLEMENTATION_PLAN.md) · [194](194_POST_R11_PLAN_AUDIT.md) · [195](195_R11_A_BACKEND_KERNEL_IMPLEMENTATION.md) · [196](196_POST_R11_A_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R11-B delivers the **web-admin CMS authoring experience** on top of the existing R11-A backend kernel. No R11-C/D/E, R10-E/F, or R12+ work was started.

---

## 1. Scope delivered

| Area | Status |
|------|--------|
| CMS content list (country/status/type filters) | **IMPLEMENTED** |
| CMS content create / editor | **IMPLEMENTED** |
| Workflow actions (submit review, publish, archive, re-publish) | **IMPLEMENTED** |
| Revision + publication version history view | **IMPLEMENTED** |
| Country/locale + content type/category fields | **IMPLEMENTED** |
| `POST /admin/cms/assets` (deferred from R11-A) | **IMPLEMENTED** |
| Permission gating (`cms:read`, `cms:write`, `cms:publish`) | **IMPLEMENTED** |
| OD-CMS-01 notice (dual-control not active) | **IMPLEMENTED** |
| Focused web-admin + R11-A e2e tests | **IMPLEMENTED** |

### Explicit non-starts

- R11-C Help Center customer UI
- R11-D Support Desk agent UI
- R11-E closure audit
- R10-E/F health-record uploads / consult-note projection
- R12+ CRM/marketing/analytics
- Separate review route (workflow inline in editor per Book 193 functional scope)
- OD-CMS-01 dual-control enforcement (open decision — UI does not pretend it is active)

---

## 2. Files changed

### API — asset upload (R11-A deferral closed)

- `apps/api/src/cms/cms-asset.service.ts` — **NEW** — private object-store upload, `cms_content_assets` row, security event
- `apps/api/src/cms/cms.module.ts` — registers `CmsAssetService`, imports `PartnerModule`
- `apps/api/src/cms/admin-cms.controller.ts` — `POST assets` (`cms:write`)
- `apps/api/src/partner/object-store.ts` — `ALLOWED_CMS_ASSET_CONTENT_TYPES`, `MAX_CMS_ASSET_BYTES` (5 MB)
- `apps/api/src/identity/security-events.service.ts` — `CMS_ASSET_UPLOADED`
- `apps/api/src/cms/r11a.cms-support-kernel.e2e.spec.ts` — asset upload assertion in CMS lifecycle

### Web-admin — CMS UI

- `apps/web-admin/src/cms-admin-api.ts` — API client, types, error class
- `apps/web-admin/src/cms-admin-list.tsx` — list + filters
- `apps/web-admin/src/cms-admin-editor.tsx` — create + editor + workflow + asset upload
- `apps/web-admin/src/cms-admin-versions.tsx` — revision/publication tables
- `apps/web-admin/src/cms-admin.spec.tsx` — focused unit tests
- `apps/web-admin/src/nav.ts` — CMS nav item (`cms:read`)
- `apps/web-admin/src/admin-shell.spec.tsx` — CMS nav hidden without permission
- `apps/web-admin/app/cms/page.tsx`
- `apps/web-admin/app/cms/new/page.tsx`
- `apps/web-admin/app/cms/[id]/page.tsx`
- `apps/web-admin/app/cms/[id]/versions/page.tsx`

### Documentation

- `docs/blueprint/197_R11_B_ADMIN_CMS_UI_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 3. CMS UI routes

| Route | Component | Permission |
|-------|-----------|------------|
| `/cms` | `CmsAdminList` | `cms:read` (nav); write actions gated in UI |
| `/cms/new` | `CmsAdminCreate` | `cms:write` |
| `/cms/[id]` | `CmsAdminEditor` | read via API; edit/workflow per status + permissions |
| `/cms/[id]/versions` | `CmsAdminVersions` | `cms:read` |

Country scoping via `?country=XX` query param (matches R11-A `country_code` API contract).

---

## 4. Workflow implementation

UI reflects server state machine only — no client-side status forging:

`DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED` (+ `ARCHIVED → PUBLISHED` re-publish)

| State | UI behavior |
|-------|-------------|
| `DRAFT` / `IN_REVIEW` | Editable fields when `cms:write`; submit review when DRAFT |
| `IN_REVIEW` | Publish when `cms:publish` |
| `PUBLISHED` | Read-only body; archive when `cms:publish` |
| `ARCHIVED` | Read-only; re-publish when `cms:publish` |

After each successful mutation the editor reloads authoritative server state. Errors surface API `detail` + HTTP status (403, 404, 409, validation).

**OD-CMS-01:** Banner on list and editor states dual-control is **not** implemented. `cms:review` permission is not used in UI or backend publish path (unchanged from R11-A).

---

## 5. Asset implementation

`POST /api/v1/admin/cms/assets`

- Auth: admin JWT + `cms:write`
- Tenant: `country_code` resolved; optional `content_item_id` validated against country
- Storage: existing `PrivateObjectStore` (`cms/{countryId}/…` prefix) — no public URLs returned
- Validation: jpeg/png/webp/gif only; max 5 MB; base64 JSON body (KYC upload pattern)
- Response: opaque `asset_id`, `content_type`, `byte_size`, `checksum_sha256` — **no `storage_key`**
- Security event: `CMS_ASSET_UPLOADED` with operational metadata only (no file bytes, no PHI)
- Malware scan hook: `AllowAllMalwareScanner` (same as partner KYC pattern)

Editor exposes file picker on content detail; returned `asset_id` shown to author (embedding in body markup deferred — asset reference only per Book 193 narrow scope).

---

## 6. API integration

All CMS operations call real R11-A admin endpoints via `cmsAdminCall`:

- `GET/POST/PATCH /api/v1/admin/cms/content*`
- `POST …/submit-review`, `…/publish`, `…/archive`
- `GET …/versions`
- `POST /api/v1/admin/cms/assets`

Error handling:

| Status | UI handling |
|--------|-------------|
| 401 | Session shell / unauthenticated fetch failure |
| 403 | `PermissionDeniedState` or inline action error |
| 404 | "Content not found" |
| 409 | Action error with status (version conflict / invalid transition) |
| 4xx validation | API `detail` message |
| 5xx / network | `NetworkErrorState` with retry |

No mock CMS data. No raw database errors exposed.

---

## 7. Security / RLS / PHI assessment

| Check | Result |
|-------|--------|
| Unauthorized admin → denied | API 401/403; UI permission gates |
| Wrong country/tenant → denied | R11-A RLS + `country_code` on all calls |
| Draft/review not in public help APIs | Unchanged R11-A; e2e regression green |
| No PHI in CMS security events | `CMS_ASSET_UPLOADED` metadata only |
| No public object-store exposure | Private store; opaque `asset_id` only |
| RLS deny-by-default | No schema/policy changes; no `USING(true)` |
| OD-CMS-01 not silently resolved | Explicit UI notice; `cms:review` still unused |

---

## 8. Tests

| Suite | Count | Result |
|-------|-------|--------|
| `apps/web-admin` — `cms-admin.spec.tsx` | 5 | **PASS** |
| `apps/web-admin` — full suite | 17 | **PASS** |
| `apps/api` — `r11a.cms-support-kernel.e2e.spec.ts` (incl. asset upload) | 4 | **PASS** |
| `apps/api` — R9/R10 spot-check (`r9a`, `r10a`, `r10d`) | 7 | **PASS** |

**Total R11-B focused:** web-admin CMS 5 + R11-A e2e 4 = **9 new/extended assertions** in CMS scope.  
**Regression spot-check:** R9/R10 **7/7 PASS**.

---

## 9. Typecheck / build

| Target | Result |
|--------|--------|
| `nx run web-admin:typecheck` | **PASS** |
| `nx run web-admin:build` | **PASS** (33 routes incl. `/cms`, `/cms/new`, `/cms/[id]`, `/cms/[id]/versions`) |
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |

---

## 10. Runtime verification

| Step | Result |
|------|--------|
| Docker Postgres/Redis | Used by e2e (migrate deploy in test harness) |
| API `/health/ready` on long-lived server | **NOT VERIFIED** — no API process on `:3000`/`:4000` at CR time |
| CMS draft → review → publish → archive (HTTP) | **VERIFIED** via R11-A e2e (incl. public help read + asset upload) |
| Browser CMS admin routes | **NOT VERIFIED** — no browser automation in environment; production build confirms routes compile |
| Unauthorized / isolation | **VERIFIED** via e2e (403 publish, public draft 404, customer ticket isolation unchanged) |

---

## 11. Regression / boundaries

| Phase | Status |
|-------|--------|
| R10-A/B/C/D | COMPLETE (spot-check green) |
| R10-E/F | NOT STARTED |
| R11-A | COMPLETE |
| **R11-B** | **IMPLEMENTED** |
| R11-C/D/E | NOT STARTED |
| R12+ | NOT STARTED |

No Help Center customer UI. No Support Desk UI. No R9/R10 clinical kernel changes.

---

## 12. Technical debt

### Carried forward (unchanged)

| ID | Note |
|----|------|
| TD-R11A-01 | OD-CMS-01 dual-control not enforced |
| TD-R11A-02 | Customer close limited to OPEN/WAITING_CUSTOMER |
| TD-R11A-04 | `reveal-pii` deferred to R11-D |
| TD-R11A-03 | Windows `prisma generate` EPERM flake |

### New (R11-B, non-blocking)

| ID | Class | Note |
|----|-------|------|
| TD-R11B-01 | UX | Asset `asset_id` returned but not auto-inserted into body HTML — author copies reference manually |
| TD-R11B-02 | test | Browser E2E for CMS admin not added; Jest + API e2e only |
| TD-R11B-03 | product | Separate `/cms/[id]/review` route from Book 193 wireframe merged into editor (functionally equivalent) |

---

## 13. Next step

**`CR-POST-R11-B-AUDIT-198`**
