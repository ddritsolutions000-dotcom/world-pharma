# 172 — Post-R9-A audit

**CR:** CR-POST-R9-A-AUDIT-172  
**Verdict:** **R9_A_GREEN_R9_B_READY**  
**Date:** 29 August 2026  
**Audited implementation:** [171](171_R9_A_HEALTH_RECORD_KERNEL_IMPLEMENTATION.md)  
**Canonical plan:** [170](170_R9_IMPLEMENTATION_PLAN.md)

---

## Executive summary

Repository inspection confirms **R9-A is implemented within Book 170 R9-A scope**. Backend kernel (timeline, artifact access, patient APIs), two additive migrations, R7/R8 publish projection hooks, policy gate, RLS, and focused e2e are present. **No accidental R9-B/C/D/E/F or R10+ code** was found.

**No product-level security, RLS, PHI, or R9-A functional blockers** were identified.

**Full API suite did not achieve 173/173 in all audit runs** due to **pre-existing shared-DB test isolation debt** (`order.e2e` timeout under suite load, `company-authority.e2e` policy pollution) — same class as [169](169_POST_R8_F_AUDIT.md). Failures are **intermittent / infrastructure**, not R9-A regressions. Focused R9-A + R7 + R8 + RLS regression: **50/50 PASS**.

**Runtime:** `/health/ready` and R9-A routes verified via e2e supertest. **BROWSER_RUNTIME_NOT_VERIFIED**, **MOBILE_RUNTIME_NOT_VERIFIED** (expected — no R9-A UI).

---

## Audit scope

Documentation-only audit of CR-R9-A-IMPL-171 against Books [170](170_R9_IMPLEMENTATION_PLAN.md), [171](171_R9_A_HEALTH_RECORD_KERNEL_IMPLEMENTATION.md), and repository truth. **No code, schema, migration, test, or UI changes.**

---

## Implementation verification

| Item | Status | Evidence |
|------|--------|----------|
| `HealthTimelineService` | **EXISTS** | `apps/api/src/health/health-timeline.service.ts` |
| `HealthArtifactService` | **EXISTS** | `apps/api/src/health/health-artifact.service.ts` |
| `HealthAccessService` | **EXISTS** | Same file (co-located) |
| R9 `HealthController` | **EXISTS** | `apps/api/src/health/health.controller.ts` (`@Controller('health')`) |
| `HealthModule` | **EXISTS** | Registered in `app.module.ts` |
| R9-A e2e | **EXISTS** | `r9a.health-record-kernel.e2e.spec.ts` |
| R7 projection hook | **EXISTS** | `pathology.service.ts` → `projectArtifactPublished` |
| R8 projection hook | **EXISTS** | `interpretation.service.ts` → `projectArtifactPublished` |
| Policy gate | **EXISTS** | `health_timeline_enabled` + `isHealthTimelineEnabled()` |
| Security event | **EXISTS** | `HEALTH_ARTIFACT_READ` |
| R9-B UI | **NOT STARTED** | No `/health` routes in web-customer/mobile |
| R9-C consent enforcement | **NOT STARTED** | No scope validation on health reads |
| R9-D doctor APIs | **NOT STARTED** | No `/health/patients/*` routes |
| R9-E prescription projection | **NOT STARTED** | No `PRESCRIPTION_STRUCTURED` enum extension |
| R9-F admin/break-glass | **NOT STARTED** | No `/admin/health/*` routes |
| R10+ | **NOT STARTED** | — |

**Note:** Infrastructure health (`/health/ready`) remains in `apps/api/src/app/health.controller.ts` — separate from R9 record APIs under `/api/v1/health/*`.

---

## Database / migrations

| Check | Result |
|-------|--------|
| Migration count | **70** (`prisma migrate status`) |
| Pending migrations | **0** |
| `health_timeline_events` | **EXISTS** with FKs, indexes, partial unique on `(source_module, source_id, event_type)` WHERE ACTIVE |
| `health_artifact_access_audits` | **EXISTS** with FKs, indexes |
| `health_artifacts` extensions | **EXISTS** — `country_id`, `title`, `status` |
| Destructive migration | **NONE** (additive only) |
| Append-only audits | **YES** — UPDATE/DELETE policies `USING(false)` |

Migrations:

1. `20260829160000_r9a_health_record_kernel`
2. `20260829160100_r9a_health_timeline_rls_fix`

---

## RLS / tenancy

| Check | Result |
|-------|--------|
| RLS enabled | **YES** on both R9 tables |
| FORCE RLS | **YES** on both R9 tables |
| `USING(true)` on R9 tables | **0** (verified via `rls.tenancy.e2e.spec.ts` global check + r9a e2e) |
| `worldpharma_app` NOSUPERUSER | **PASS** |
| `worldpharma_app` NOBYPASSRLS | **PASS** |
| Patient A ↛ B | **PASS** (r9a e2e) |
| Wrong country | **PASS** (403/404 as designed) |
| Disabled pack | **PASS** (403) |

RLS fix migration broadened timeline INSERT/SELECT for worker/org publication paths (required for R7/R8 publish under worker tenant).

---

## Timeline verification

| Check | Result |
|-------|--------|
| R7-E LAB_REPORT projection | **PASS** — `source_module: lab`, `event_type: ARTIFACT_PUBLISHED`, artifact FK |
| R8-E IMAGING_REPORT projection | **PASS (source)** — hook in `interpretation.service.ts`; r8e e2e regression **PASS** |
| Deterministic ordering | **PASS** — `occurred_at DESC`, `id DESC` |
| Idempotent projection | **PASS** — unique partial index + service dedupe; r9a e2e verifies count stable |
| No clinical body in timeline rows | **PASS** — title only; r9a grep on timeline JSON |
| Pre-R9-A backfill | **NOT DONE** — accurately documented in Book 171; artifacts published before R9-A lack timeline rows |

**Test gap (non-blocking):** R9-A e2e exercises LAB timeline end-to-end; IMAGING timeline row not asserted in dedicated test (R8-E e2e predates timeline API assertions).

---

## Artifact access verification

| Scenario | Expected | Verified |
|----------|----------|----------|
| Own artifact metadata | 200 metadata only | **PASS** (r9a) |
| Own artifact payload | 200 delegated PHI | **PASS** (r9a) |
| Foreign artifact | 404 | **PASS** (r9a) |
| Wrong country | 403 on metadata if country mismatch | **PASS** (artifact has `country_id`) |
| Disabled pack | 403 on all health routes | **PASS** (r9a) |
| Unauthenticated | 401 | **Implicit** (JwtAuthGuard; not re-tested in audit session) |
| Invalid artifact UUID | 404 | **Not explicitly tested** — low risk |
| Unpublished artifact | N/A for health_artifacts | Rows created only on publish |
| Source-domain bypass | Must delegate to R7/R8 | **PASS** — `getCustomerPublishedReport` used; no duplicate storage |

**Plan deviation (non-blocking):** Book 170 §7.1 describes payload as signed URL; implementation returns JSON via R7/R8 delegate (documented in Book 171). Align in future CR if signed URLs required.

**Minor UX debt:** `payload_available: true` always in metadata response regardless of edge state.

---

## Access auditing

| Check | Result |
|-------|--------|
| Allowed payload read creates audit row | **PASS** (r9a) |
| Denied foreign read creates audit | **NO** — 404 before audit path (acceptable R9-A; R9-C may extend) |
| Metadata read creates audit | **NO** — only payload reads audited per implementation |
| Audit append-only | **PASS** (RLS) |
| Security event PHI-free | **PASS** — `{artifact_id, artifact_type, allowed, reason, audit_id}` only |
| Country/patient/actor captured | **PASS** on allowed reads |

---

## PHI safety

| Surface | Result |
|---------|--------|
| Timeline list | **PASS** — metadata only |
| Artifact metadata | **PASS** — no findings/analytes |
| Payload | **PHI** — authorized via R7/R8 delegate only |
| Error responses (foreign) | **PASS** — no Hemoglobin/finding leakage (r9a grep) |
| Outbox (R9-A) | **N/A** — no new clinical outbox events in R9-A |
| Notifications | **N/A** — no R9-A notification events implemented |

---

## Regression results

### Focused regression (audit session)

| Suite group | Result |
|-------------|--------|
| R9-A + RLS | **12/12 PASS** |
| R7-A…F + R8-A…F + R9-A + RLS + R3 + R5 + R6 | **50/50 PASS** (22 suites) |
| `health.e2e` + R9-A runtime smoke | **3/3 PASS** |

### Full API suite

| Run | Result | Failures |
|-----|--------|----------|
| Pass 1 | **171/173** | `order.e2e` timeout (5000ms); `r8c` timeout (5000ms) |
| Pass 2 | **171/173** | `order.e2e` timeout; `company-authority.e2e` VALIDATION_ERROR (policy pollution) |

| Failure | Classification | R9-related? |
|---------|----------------|-------------|
| `order.e2e` timeout | **Intermittent** — passes isolated (13s) | **No** |
| `r8c` timeout (pass 1 only) | **Intermittent** — passes isolated | **No** |
| `company-authority.e2e` | **Intermittent** — shared-DB policy pollution | **No** |

---

## Typecheck / build

| Check | Result |
|-------|--------|
| `apps/api` `tsc --noEmit` | **PASS** |
| Web/mobile builds | **Not required** — no UI changes in R9-A |

---

## Runtime verification

| Surface | Status |
|---------|--------|
| `/health/ready` | **RUNTIME_PASS** (`health.e2e.spec.ts`) |
| R9-A routes registered | **RUNTIME_PASS** (r9a supertest) |
| Browser | **BROWSER_RUNTIME_NOT_VERIFIED** |
| Mobile | **MOBILE_RUNTIME_NOT_VERIFIED** |

---

## Security boundary

| Boundary | Status |
|----------|--------|
| R9-C consent-scope enforcement | **NOT STARTED** ✓ |
| R9-D doctor access | **NOT STARTED** ✓ |
| R9-E prescription projection | **NOT STARTED** ✓ |
| R9-F admin/break-glass | **NOT STARTED** ✓ |
| R10+ | **NOT STARTED** ✓ |
| Production healthcare / live money / carriers | **OFF** ✓ |

---

## Technical debt

| Debt | Type | Blocker? |
|------|------|----------|
| Shared-DB test isolation (policyPack pollution, suite timeouts) | **INFRA** | **No** |
| No pre-R9-A artifact timeline backfill | **PRODUCT/DATA** | **No** — documented |
| `health_artifacts` INSERT-only grant | **SCHEMA/OPS** | **No** — title/country at create |
| Payload JSON vs signed URL (Book 170) | **ENGINEERING** | **No** |
| IMAGING timeline not in dedicated R9-A e2e | **TEST COVERAGE** | **No** |
| Denied reads not audited | **ENGINEERING** | **No** for R9-A |

---

## Blockers

**None (product).**

---

## R9-B readiness

R9-A acceptance gates for backend kernel are met. **Authorized next step:** `CR-R9-B-IMPL-173` — Customer Health tab (web-customer + mobile RN parity) consuming existing `/api/v1/health/*` APIs.

---

## Explicit non-starts (confirmed)

R9-B UI · R9-C consent enforcement · R9-D doctor health UI · R9-E prescription projection · R9-F admin audit/break-glass · R10+

---

## Audit matrix summary

| Area | Result | Blocker? |
|------|--------|----------|
| Implementation completeness | PASS | No |
| Migrations / schema | PASS | No |
| RLS / tenancy | PASS | No |
| Timeline (LAB) | PASS | No |
| Timeline (IMAGING hook) | PASS (source) | No |
| Artifact access | PASS | No |
| PHI safety | PASS | No |
| Access audit (allowed reads) | PASS | No |
| R7/R8 regression | PASS | No |
| R9-A e2e | PASS | No |
| Full suite ×2 | DEBT | No |
| Typecheck | PASS | No |
| Runtime (API) | PASS | No |
| Accidental R9-B+ | NONE | No |
