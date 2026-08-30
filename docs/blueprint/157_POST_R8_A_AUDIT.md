# 157 — Post-R8-A audit (radiology foundation + UI completeness)

**Status:** Audit only — **no R8-B+ coding, no source changes**  
**Change ID:** **CR-POST-R8-A-AUDIT-157**  
**Date:** 28 August 2026  
**FINAL VERDICT:** **R8_A_GREEN_R8_B_READY**

**Authority:** Read-only verification after [156](156_R8_A_RADIOLOGY_FOUNDATION_IMPLEMENTATION.md) against [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md). **Do not** implement R8-B+, production healthcare, live PSP/money/carriers, PACS, LIS/HIS, or radiologist workflow under this CR.

**Canonical inputs:** [155](155_R8_RADIOLOGY_IMPLEMENTATION_PLAN.md) · [156](156_R8_A_RADIOLOGY_FOUNDATION_IMPLEMENTATION.md) · [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [00](00_MASTER_INDEX.md)

**Repo truth:** `apps/api/src/radiology/*` · `apps/web-radiology/*` · `apps/web-admin/src/partners-admin.tsx` · `packages/database/prisma` · regression runs executed 28 Aug 2026 (this CR).

---

## 0. Executive summary

R8-A foundation matches Book 156 and the R8-A slice of Book 155: separate radiology bounded context, `IMAGING_CENTER` org kind, `imaging_center` pack gate, `RADIOLOGY_PARTNER_SANDBOX_V1` attestation, admin accept/block, `IMAGING_STUDY`/`IMAGING_OWNED` catalog extension via the **existing** catalog kernel, and `apps/web-radiology` foundation screens with **real API** wiring. Deferred IA slots (schedule, bookings, settings) are labeled EmptyStates — **DEFERRED**, not fake R8-B product. R8-B+ domain code (booking, payment, acquisition, radiologist, reports, DICOM/PACS) is **absent**. R0–R7 regression remains green.

| Gate | Result |
|------|--------|
| R8-A scope vs repo | **PASS** |
| Required R8-A UI (Book 156) | **PASS** (deferred tabs correctly marked) |
| Security / RLS / isolation | **PASS** |
| Catalog additive / no duplicate kernel | **PASS** |
| PHI / clinical non-starts | **PASS** |
| API regression | **163/164** (1 flake) · **164/164 · 164/164 · 164/164** |
| Typecheck / web builds | **22/22** · **10/10** |
| R8-B+ coding | **NOT STARTED** |

**Plan deltas (non-blocking):** Book 155 also lists `RADIOLOGIST` partner type, R-W-03 catalog edit route, R-W-14 org settings, and A-W-01 dedicated imaging partners list — **not delivered** in R8-A; documented below. None block R8-B authorization.

---

## 1. Source-of-truth cross-check

| Claim (Book 156) | Repo truth |
|------------------|------------|
| Nest `RadiologyModule` | **Present** — `apps/api/src/radiology/radiology.module.ts` |
| `RadiologyCapabilityService` + Redis gate | **Present** — `radiology-capability.service.ts` |
| `RADIOLOGY_PARTNER_SANDBOX_V1` | **Present** — constant + attest endpoint |
| `IMAGING_CENTER` / `IMAGING_STUDY` / `IMAGING_OWNED` | **Present** — schema + migration `20260828210000_r8a_radiology_foundation` |
| `apps/web-radiology` FOUNDATION | **Present** — topology `APP-RAD-W` currentPath set |
| Admin imaging accept/block | **Present** — `partners-admin.tsx` + `/admin/imaging/*` |
| No booking / study / report tables | **Confirmed** — no `Imaging*` models; `information_schema` imaging tables = **0** |
| Booking/payment endpoints 404 | **Confirmed** — e2e asserts `/me/imaging/bookings` · `/radiology/payments` 404 |
| `booking_enabled: false` always | **Confirmed** — service type + e2e |

Book 156 is **not** green merely from tests — module inventory, UI wiring, and DB state were inspected.

---

## 2. R8-A scope (in / not started)

### In — audited present

| Area | Status |
|------|--------|
| Radiology bounded context (`apps/api/src/radiology/`) | **PASS** |
| IMAGING_CENTER org + membership access | **PASS** |
| `imaging_center` + `IMAGING_CENTER` pack gates (fail-closed) | **PASS** |
| Attestation + admin accept/block/reset | **PASS** |
| `IMAGING_STUDY` + `IMAGING_OWNED` catalog writes | **PASS** |
| Security events (`IMAGING_PARTNER_*`) | **PASS** |
| web-radiology R8-A screens | **PASS** (see §9) |
| web-admin imaging governance | **PASS** |

### Explicitly NOT STARTED (verified absent)

| Capability | Evidence |
|------------|----------|
| Customer imaging booking | No routes; e2e 404 on `/me/imaging/bookings` |
| Sandbox imaging payment | No `/radiology/payments` |
| Acquisition / technician / DICOM / PACS | No APIs, tables, or apps |
| Radiologist worklist / `web-radiologist` | No app; no `/radiologist/*` |
| Imaging report publication | No report models or endpoints |
| Physical report delivery (imaging) | No imaging physical-report admin |
| LIS/HIS / production healthcare | Explicitly off |
| R8-C/D/E/F / R9+ | No speculative code |

---

## 3. Data model / migration

| Item | Audit result |
|------|--------------|
| Migration `20260828210000_r8a_radiology_foundation` | **Present** on disk — additive enums only |
| Tables added | **0** |
| RLS policies added | **0** (catalog offers reuse `can_org(seller_org_id)`) |
| Speculative schema | **None** — no `ImagingBooking`, `ImagingStudy`, `ImagingReport`, acquisition, PACS |
| Destructive changes | **None** |
| Live enum values | `IMAGING_CENTER`, `IMAGING_STUDY`, `IMAGING_OWNED` confirmed in PostgreSQL |
| Live imaging-named tables | **0** |

**Note:** Jest `global-setup` runs `prisma migrate deploy` on `worldpharma_test` before API tests. `prisma migrate status` outside that harness may report pending rows when `_prisma_migrations` diverges; enum presence and test deploy confirm migration SQL is valid and applied in the test path.

---

## 4. Radiology boundary / no duplicate kernels

| Kernel | R8-A behavior |
|--------|---------------|
| Identity / JWT | Reused — no radiology identity store |
| Tenancy / RLS | Reused — no new `USING(true)` |
| Policy packs | Extended `imaging_center` + `IMAGING_CENTER` in shared policy |
| Catalog | Extended `catalog.service.ts` + `access.ts`; **no** second catalog module |
| Payment / order / logistics | **Not touched** for imaging |
| Audit / security events | Extended types on existing `SecurityEventsService` |
| Notifications | **Not added** for imaging |

**Cross-domain isolation (e2e):** Imaging A ↛ B · Lab ↛ `/radiology/*` · Vendor cannot write imaging catalog · wrong-org eligibility → 403.

---

## 5. Eligibility / packs / attestation

| Check | Result |
|-------|--------|
| `imaging_center` service key | **PASS** — `packages/shared/src/policy.ts` |
| `IMAGING_CENTER` org kind | **PASS** |
| Empty/disabled pack fail-closed | **PASS** — e2e `state: DISABLED` |
| `RADIOLOGY_PARTNER_SANDBOX_V1` | **PASS** — product ack; not legal cert (documented in service) |
| Admin acceptance separate from self-attest | **PASS** — Redis record + `setAcceptance` |
| accept / block / reset events | **PASS** — `IMAGING_PARTNER_ACCEPTED` / `BLOCKED` / `ACCEPTANCE_RESET` |
| `booking_enabled: false` | **PASS** — always in eligibility DTO |
| `live_payout: false` | **PASS** — always |
| Production healthcare flag | **None introduced** |

**Plan delta:** Book 155 R8-A scope also lists **`RADIOLOGIST` partner type** in policy — **not present** in `PARTNER_TYPE_CODES`. Deferred to R8-D radiologist onboarding; **not required for R8-B customer booking**.

---

## 6. Catalog

| Check | Result |
|-------|--------|
| Concept ≠ item ≠ offer (shared catalog kernel) | **PASS** — item/variant/offer/publish/price flow |
| `IMAGING_STUDY` items | **PASS** |
| `IMAGING_OWNED` offers | **PASS** — ownership enforced in controller + service |
| Vendor/lab cannot use imaging catalog writes | **PASS** — e2e |
| Inventory exclusion for `IMAGING_STUDY` | **PASS** — `catalog.service.ts` `withAvailability` |
| Duplicate catalog kernel | **None** |

---

## 7. Security / RLS (live DB)

| Check | Live result |
|-------|-------------|
| `worldpharma_app` NOSUPERUSER | **PASS** — `rolsuper: false` |
| `worldpharma_app` NOBYPASSRLS | **PASS** — `rolbypassrls: false` |
| `USING(true)` policy count | **0** |
| Tenant/org-scoped catalog access | **PASS** — `assertImagingOrgAccess` |

`rls.tenancy.e2e.spec.ts` — **PASS** (included in focused regression).

---

## 8. PHI / clinical data

| Surface | Finding |
|---------|---------|
| API DTOs / eligibility | Flags only (`booking_enabled`, `live_payout`); no findings |
| Security event metadata | Sanitized allowlist in `sanitizeActivityMetadata` |
| Catalog payloads | Commercial titles/SKU only; e2e asserts no diagnosis/dicom/patient_id |
| Notifications / URLs / logs | No imaging clinical payloads introduced |
| Admin imaging UI | Governance metadata only |

---

## 9. UI completeness — `apps/web-radiology`

Audited against **Book 156 claimed screens** (not full Book 155 R8-C+ inventory).

| Screen | Classification | Route / nav | API | State matrix |
|--------|----------------|-------------|-----|--------------|
| Sign-in | **IMPLEMENTED** | `/` | OTP shell | error on OTP fail |
| Dashboard | **IMPLEMENTED** | `#dashboard` | offer count via catalog | loading via org scope |
| Organization | **IMPLEMENTED** | `#organization` | `GET /radiology/organizations` | empty when none selected |
| Capabilities | **IMPLEMENTED** | `#capabilities` | eligibility + attest | loading, empty gate, 403→shell, validation |
| Catalog | **IMPLEMENTED** | `#catalog` | full CRUD + publish + price | loading, empty, form errors, 403 |
| Activity | **IMPLEMENTED** | `#activity` | `GET /capabilities/activity` | empty list, refresh |
| Schedule | **DEFERRED** (R8-B) | `#schedule` | EmptyState only | — |
| Bookings | **DEFERRED** (R8-B) | `#bookings` | EmptyState only | — |
| Settings | **DEFERRED** (later) | `#settings` | EmptyState only | — |
| Session expired | **IMPLEMENTED** | shell | — | `SessionExpiredState` |
| 403 / network | **IMPLEMENTED** | shell | — | `PermissionDeniedState` / `NetworkErrorState` |

**Shell-level:** 401 → `expire()`; responsive layout via ui-kit + sidebar (mirrors `web-lab` hash-tab pattern).

### Admin (`web-admin`)

| Screen (Book 155) | Classification | Evidence |
|-------------------|----------------|----------|
| A-W-03 Imaging acceptance | **IMPLEMENTED** | Load eligibility, accept, block — real `/admin/imaging/*` |
| A-W-01 Dedicated imaging partners list | **DEFERRED** | No `/admin/partners?type=IMAGING`; acceptance inline in partner detail |
| A-W-02 Partner detail + attestation | **PARTIAL** | Existing partner detail; imaging acceptance adjacent |

### Plan deltas vs Book 155 R8-A UI inventory

| Planned (155) | Status |
|---------------|--------|
| R-W-03 Catalog edit `/catalog/:id` | **DEFERRED** — create/list/publish/price inline; no PUT item endpoint |
| R-W-14 Org settings `/settings` | **DEFERRED** — EmptyState (matches Book 156) |

These are **documentation/plan breadth** gaps, not security or R8-B blockers (same pattern as R7-A deferred tabs per [142](142_POST_R7_A_AUDIT.md)).

---

## 10. Mobile

**R8-A customer mobile = deferred to R8-B**

Book 155 assigns customer RN imaging screens (C-M-01…C-M-09) to **R8-B**, not R8-A. No `Imaging*` screens in `apps/mobile`. Existing mobile tests unchanged.

| Suite | Result |
|-------|--------|
| `mobile` jest | **2/2** suites · **4/4** tests |
| `mobile-doctor` jest | **2/2** suites · **8/8** tests |

---

## 11. Security events / audit

| Check | Result |
|-------|--------|
| Actor server-derived | **PASS** — `CurrentPrincipal` / admin personId |
| Tenant/org server-derived | **PASS** — `assertImagingOrgAccess`; no client tenant headers |
| Country from org/pack resolver | **PASS** |
| Minimum metadata | **PASS** — sanitized activity allowlist |
| No PHI in events | **PASS** |

---

## 12. Tests (this audit — exact results)

| Suite | Result |
|-------|--------|
| `r8a.radiology.e2e.spec.ts` | **1/1** |
| Focused RLS + R3 + R5 + R6 + R7 + R8-A (11 suites) | **36/36** |
| Full API run 1 (audit) | **68/69** suites · **163/164** tests — **1 failure** (suite not captured; consistent with shared-DB isolation flake documented in [154](154_POST_R7_FINAL_CLOSURE_AUDIT.md) §12) |
| Full API run 2 | **69/69** suites · **164/164** tests |
| Full API run 3 | **69/69** suites · **164/164** tests |
| Full API run 4 | **69/69** suites · **164/164** tests |
| `nx run api:test` (no cache) | **PASS** |
| Workspace `nx run-many -t test` | **11/11** projects |
| `web-admin` jest | **9/9** suites · **12/12** tests |
| Typecheck | **22/22** projects |
| Web builds (10 apps incl. radiology) | **10/10** |

No retry-to-pass was used to claim green; the **163/164** run is reported as-is.

---

## 13. R0–R7 regression

Focused R7 chain (r7a–r7f) + RLS + R3 + R5 + R6 — **PASS** (36/36). Full API suite **164/164** on three consecutive isolated runs after one **163/164** flake. No R7 pathology immutability, video, inventory, or physical-report regressions investigated as failures.

---

## 14. File hygiene

| Check | Result |
|-------|--------|
| Duplicate radiology kernels | **None** — 7 files under `apps/api/src/radiology/` |
| Speculative R8-B+ source | **None** found |
| Duplicate controllers/services | **None** |
| `apps/web-radiology` | 13 source files — proportional to foundation |
| Temporary/backup files in radiology scope | **None** in source tree |

---

## 15. Production boundary

| Boundary | Status |
|----------|--------|
| Production healthcare | **OFF** |
| Live PSP / real money / bank payouts | **OFF** |
| Real carriers | **OFF** |
| Production LiveKit / recording | **OFF** |
| Live e-Rx / automatic refill | **OFF** |
| LIS/HIS / production PACS | **OFF** |
| R8-B/C/D/E/F / R9+ | **NOT STARTED** |

---

## 16. Global scorecard

| Domain | Status |
|--------|--------|
| R8-A foundation | **PASS** |
| Radiology boundary | **PASS** |
| Catalog | **PASS** |
| Eligibility/packs | **PASS** |
| Attestation | **PASS** |
| Admin governance | **PASS** (A-W-01 list deferred) |
| RLS | **PASS** |
| PHI | **PASS** |
| Security events | **PASS** |
| UI completeness | **PASS** (Book 156 scope; plan deltas noted) |
| Mobile parity | **N/A** — deferred to R8-B |
| Regression | **PASS** (one documented 163/164 flake) |
| Migrations | **PASS** (enum-only, additive) |
| Production boundary | **PASS** |

---

## 17. R8-B readiness

**R8-B is READY for a separate `CR-R8-B-IMPL` authorization.**

| Prerequisite | Status |
|--------------|--------|
| R8-A imaging org + catalog foundation | **Met** |
| Pack gates + attestation + admin acceptance | **Met** |
| Payment sandbox kernel (R1) | **Exists** (reuse for R8-B) |
| Customer web + mobile apps | **Exist** (extend in R8-B) |

**Non-blocking follow-ups (optional before or during R8-B):**

1. Add `RADIOLOGIST` to policy catalog when R8-D approaches (Book 155 ED-R8-08).
2. Dedicated admin imaging partners list (A-W-01) — UX convenience only.
3. Per-item catalog edit screen (R-W-03) — not required for customer browse/book in R8-B.
4. Shared-DB test isolation — continue canonical `--runInBand` path; occasional 163/164 flake is isolation debt, not a production defect ([154](154_POST_R7_FINAL_CLOSURE_AUDIT.md)).

**R8-B NOT STARTED. R8-B coding requires explicit CR authorization.**

---

## 18. Explicit non-starts

**R8-B NOT STARTED.**  
**R8-C NOT STARTED.**  
**R8-D NOT STARTED.**  
**R8-E NOT STARTED.**  
**R8-F NOT STARTED.**  
**R9+ NOT STARTED.**  
**Live money NOT enabled.**  
**No LIS/HIS.**  
**No PACS production.**

---

## Final declaration

**FINAL VERDICT: R8_A_GREEN_R8_B_READY**

**STOP.**
