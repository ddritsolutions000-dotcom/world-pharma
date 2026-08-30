# 142 — Post-R7-A audit (foundation + UI completeness)

**Status:** Audit only — **no R7-B+ coding**  
**Change ID:** **CR-POST-R7-A-AUDIT-142**  
**Date:** 28 August 2026  
**FINAL VERDICT:** **R7_A_GREEN_R7_B_READY**

**Authority:** Verify repository after [141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md) against [140](140_R7_IMPLEMENTATION_PLAN.md). **Do not** implement R7-B+, create migrations, delete files, or invent LIS/HIS screens.

**Sources:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [141](141_R7_A_DIAGNOSTICS_LAB_FOUNDATION_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · `apps/api/src/lab/*` · `apps/web-lab/*` · `apps/web-admin/src/partners-admin.tsx` · `packages/database/prisma`

---

## 0. Verdict

R7-A foundation matches Books 140/141: Lab partner gates, pack fail-closed, `LAB_TEST`/`LAB_OWNED`, admin accept/block, and `web-lab` screens with **real API** wiring are present. Deferred IA slots (bookings/accession/processing/incidents) are labeled EmptyStates — **DEFERRED**, not fake R7-A product. Regression gates are green. No R7-B+ domain code found.

| Gate | Result |
|------|--------|
| R7-A scope vs repo | **PASS** |
| Required R7-A UI (hard gate) | **PASS** (deferred tabs correctly marked) |
| Security / RLS attestation | **PASS** |
| Catalog additive / no duplicate kernel | **PASS** |
| PHI / clinical non-starts | **PASS** |
| API regression | **59/59** · **143/143** |
| Typecheck / web builds / mobile typecheck | **19/19** · **7/7** · **4/4** |
| R7-B+ coding | **NOT STARTED** |

---

## 1. Source-of-truth cross-check

| Claim (Book 141) | Repo truth |
|------------------|------------|
| Nest `LabModule` | **Present** — `apps/api/src/lab/lab.module.ts` |
| Capability Redis gate + `LAB_PARTNER_SANDBOX_V1` | **Present** — `lab-capability.service.ts` |
| `LAB_TEST` / `LAB_OWNED` enums | **Present** — schema + migration `20260827230000_r7a_catalog_lab_test_kind` |
| `apps/web-lab` FOUNDATION | **Present** — topology `APP-LAB-W` currentPath set |
| Admin lab accept/block | **Present** — Partners admin section + `/admin/lab/*` |
| No booking / CoC / pathology tables | **Confirmed** — no `DiagnosticCase`/`LabBooking`/Sample models |
| Booking endpoints 404 | **Confirmed** — e2e asserts `/lab/bookings` · `/lab/payments` 404 |

Book 141 is **not** green merely from tests — UI and module inventory were inspected.

---

## 2. R7-A scope (in / not started)

### In — audited present

| Area | Status |
|------|--------|
| Lab partner foundation (Person→Partner→Org) | **PASS** |
| LAB org picker / membership | **PASS** |
| `lab_home` / `lab_center` + LAB type gates | **PASS** (fail-closed empty pack) |
| Attestation + admin accept/block | **PASS** |
| `LAB_TEST` + `LAB_OWNED` catalog writes | **PASS** |
| Security events (sanitized) | **PASS** |
| web-lab R7-A screens | **PASS** (see §3–4) |

### Explicitly NOT STARTED

| Capability | Evidence |
|------------|----------|
| Customer lab booking | No routes/module; e2e 404 |
| Sandbox lab payment | No `/lab/payments` |
| Home collection / phlebotomist / SAMPLE_COLLECTION / CoC | No apps; logistics note “contracts only” |
| Transport / accession / processing / pathology | EmptyStates + no APIs |
| Digital / physical report | Absent |
| LIS/HIS | Explicitly out |
| R8 radiology | Topology still PLANNED |

---

## 3. UI completeness — hard gate

### R7-A required surfaces (Books 140/141)

| Screen | Route / nav | API | Auth | Org scope | Pack gate | load/empty/err/401/403/session/net/success | Verdict |
|--------|-------------|-----|------|-----------|-----------|--------------------------------------------|---------|
| Sign-in (OTP) | `/` unauthenticated | shell OTP | customer aud | N/A | N/A | Yes | **PASS** |
| Session expired | `/` | expire() | — | — | — | SessionExpiredState | **PASS** |
| Org picker | hash shell | `GET /lab/organizations` | Yes | LAB only | N/A | load/empty/403/net | **PASS** |
| Organization context | `#organization` | org list fields | Yes | Selected LAB | N/A | empty if none | **PASS** |
| Location context | Org tab `location_id` | membership field only | Yes | Membership | N/A | Display-only; no location CRUD | **PARTIAL** (not EmptyState FAIL) |
| Capabilities / eligibility | `#capabilities` | eligibility + attest | Yes | `lab_org_id` | Shown + gates | load/blocked/attest success | **PASS** |
| Catalog list/create/publish/price | `#catalog` | `/lab/catalog/*` | Yes | LAB + ELIGIBLE | Write gated server-side | load/empty/form errors/403 via shell | **PASS** |
| Activity | `#activity` | `/lab/capabilities/activity` | Yes | LAB | N/A | empty + refresh; soft load | **PASS** |
| Dashboard offer count | `#dashboard` | offers GET | Yes | LAB | N/A | Errors swallowed → 0 | **PARTIAL** (minor) |
| Admin lab eligibility | Partners detail | `/admin/lab/*` | admin + `partner:manage` | UUID entry | Status shown | load/accept/block | **PASS** |

### Intentionally deferred (not FAIL)

| Nav slot | Label | Classification |
|----------|-------|----------------|
| `#bookings` | R7-B | **DEFERRED** |
| `#accession` | R7-D | **DEFERRED** |
| `#processing` | R7-D | **DEFERRED** |
| `#incidents` | Later ops | **DEFERRED** |

No deferred slot pretends to be live R7-A workflow. No fake booking payloads.

### Dead buttons / fake data

- Catalog Publish/Price call real APIs — **PASS**  
- Attest button real — **PASS**  
- Admin Accept/Block real — **PASS**  
- No unexplained placeholders on required R7-A screens — **PASS**

---

## 4. web-lab IA (actual)

Single Next route: **`/`** (hash tabs). No separate App Router pages per tab.

| Hash | Implementation |
|------|----------------|
| (auth) | OTP card |
| `#dashboard` | Offer count + lock copy |
| `#organization` | Legal/display/role/country/(optional location_id) |
| `#capabilities` | Eligibility + attest CTA |
| `#catalog` | Create LAB_TEST+offer; list; publish; price |
| `#activity` | Security-event list (manual refresh) |
| `#bookings` / `#accession` / `#processing` / `#incidents` | LaterPhase EmptyState |

**Location:** membership `location_id` shown when present; no lab location list API/UI in R7-A — acceptable PARTIAL vs full location ops.

---

## 5. Admin governance

| Check | Result |
|-------|--------|
| Load eligibility | **PASS** |
| Accept / Block | **PASS** |
| Status display (state, acceptance, booking=false, live_payout=false) | **PASS** |
| Permission | `partner:manage` + admin audience |
| Clinical / LIS console | **Absent** — **PASS** |
| Reset action in UI | API supports `reset`; UI omits — **PARTIAL** (non-blocking) |
| Company/partner boundary | Lab users still cannot hit company finance (e2e) |

---

## 6. Security / RLS

| Check | Result |
|-------|--------|
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **false / false** |
| ENABLE + FORCE RLS (public tables) | **156 / 156** |
| `USING(true)` / `WITH CHECK(true)` | **0** |
| Server-built tenant context | `buildUserTenantContext`; headers non-authoritative (RLS suite) |
| Lab A ↛ Lab B | **PASS** (r7a e2e) |
| Lab ↛ vendor org as lab | **PASS** |
| Partner ↛ company_* | Activation role `org_admin`; finance deny e2e |
| Empty pack fail-closed | **PASS** |
| Blocked / attestation gates | Capability service + e2e |
| Wrong location denied | **Not separately e2e’d** — org membership gate is primary; location optional on offers — **NOTE** |

---

## 7. Catalog safety

| Check | Result |
|-------|--------|
| `LAB_TEST` additive on `CatalogItemKind` | **PASS** |
| `LAB_OWNED` additive; requires `OrganizationKind.LAB` | **PASS** |
| Single catalog kernel | **PASS** — no parallel lab catalog tables |
| Vendor kind still required for VENDOR_OWNED | **PASS** (`assertOwnership`) |
| Cross-seller catalog list | Lab A cannot list Lab B offers — **PASS** |
| R5 pharmacy path | Untouched kernels; full API suite green |

---

## 8. Healthcare / PHI

| Check | Result |
|-------|--------|
| No diagnosis / clinical notes / Rx instructions in lab DTOs | **PASS** (e2e string deny + presenters) |
| Events metadata sanitized (lab_org_id, codes, flags) | **PASS** |
| `booking_enabled: false` / `live_payout: false` | **PASS** |
| Admin lab view non-clinical | **PASS** |
| No patient identifiers in foundation | **PASS** |

---

## 9. File hygiene (report only)

| PATH | Reason | Refs | Rec |
|------|--------|------|-----|
| `apps/api/src/lab/*` | Canonical R7-A module | Book 141 | **KEEP** |
| `apps/api/src/test/lab-partner.ts` | Test helper twin of marketplace-seller | e2e | **KEEP** |
| `apps/web-lab/src/lab-api.ts` | App-scoped client (vendor pattern) | web-lab | **KEEP** |
| `LabCapabilityService` vs `MarketplaceEligibilityService` | Parallel pack gate by domain — not duplicate kernel | catalog/lab | **KEEP** |
| `web-admin` orphan vendor-* panels | Pre-R7 debt (Book 133/139) | admin | **REVIEW** (not R7-A) |
| No `*fix*` / backup lab sources | — | — | — |

---

## 10. Database

| Item | Result |
|------|--------|
| Migration count | **47** |
| Status | Up to date (0 pending) |
| R7-A migration | `20260827230000_r7a_catalog_lab_test_kind` (enums only) |
| New lab domain tables | **None** |
| Enums live | `LAB_TEST`, `LAB_OWNED` confirmed in DB |

---

## 11. Regression (exact; no retry-to-pass)

| Suite | Result | Class |
|-------|--------|-------|
| Focused (r7a + rls + r3 + r6f + r5*) | **8/8** suites · **31/31** tests | **PASS** |
| `nx test api` | **59/59** · **143/143** | **PASS** |
| Typecheck (all) | **19/19** | **PASS** |
| Mobile typecheck (4 apps) | **4/4** | **PASS** |
| Web builds (7 incl. web-lab) | **7/7** | **PASS** |

---

## 12. Mobile impact

No Lab mobile created (correct). `mobile`, `mobile-store`, `mobile-doctor`, `mobile-delivery` typecheck **PASS**. No R7-A mobile regression observed.

---

## 13. Buffer / loading UX (violations only)

| Finding | Severity |
|---------|----------|
| Shared `LoadingState` = generic `Spinner` (`packages/ui-kit/src/web/states.tsx`) | **PARTIAL** vs healthcare-contextual loading rule (labels often medicine/lab-contextual; visual still generic) |
| Dashboard offer-count errors silently coerced to `0` | Soft — can mask failure as empty; not fake buffering over errors |

No redesign in this audit.

---

## 14. Final verdict

**R7_A_GREEN_R7_B_READY**

R7-B remains **unauthorized** by this audit. Next coding requires **CR-R7-B-IMPL**.

---

## Explicit non-starts

**R7-B/C/D/E/F NOT STARTED.**  
**R8+ NOT STARTED.**  
**Live money NOT enabled.**  
**No LIS/HIS.**  
**No production healthcare enablement.**

**STOP.**
