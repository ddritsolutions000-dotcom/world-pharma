# 304 — Deep unblocked engineering gap audit + implement (CR-304)

**CR:** `CR-304-DEEP-UNBLOCKED-ENGINEERING-GAP-AUDIT-IMPLEMENT`  
**Date:** 30 August 2026  
**Verdict:** **`R13_G_CLINICAL_PUBLISH_INDEX_COMPLETE`**

---

## Summary

Deep code-first scan of R1–R14-B found one real unblocked gap: **clinical search documents were never auto-indexed on lab/imaging report publish** — `scheduleClinicalReindex()` had zero callers. Implemented outbox-driven indexing via existing `SearchIndexDispatchService` kernel. No schema/migration changes.

**Human-blocked tracks unchanged:** R14-A live 0/7, R5-F live L-RX-01, R4 production, R15/R16.

---

## Selected gap

| Field | Detail |
|-------|--------|
| Track | R13-G clinical search (publish → index wiring) |
| Classification | **REAL_MISSING_FEATURE** |
| Evidence | `scheduleClinicalReindex` only defined in `search-index-job.service.ts`; `LAB_REPORT_PUBLISHED` / `IMAGING_REPORT_PUBLISHED` reached notification dispatch only; Book 253 §R13-G listed auto-index as **PARTIAL** |
| Slice | Outbox handlers + `artifact_id` in publish payloads + admin `clinical` reindex + e2e |

---

## Implementation

| File | Change |
|------|--------|
| `apps/api/src/search/search-index-dispatch.service.ts` | Handlers for `LAB_REPORT_PUBLISHED`, `IMAGING_REPORT_PUBLISHED` → `scheduleClinicalReindex` |
| `apps/api/src/lab/pathology.service.ts` | Add `artifact_id` to publish outbox payload |
| `apps/api/src/radiology/interpretation.service.ts` | Add `artifact_id` to publish outbox payload |
| `apps/api/src/search/admin-search.controller.ts` | `index_kind: clinical` + `artifact_id` admin reindex |
| `apps/api/src/search/r13g.clinical-search.e2e.spec.ts` | Auto-index e2e via outbox worker; replace manual reindex in search paths |

---

## Verification

| Check | Result |
|-------|--------|
| `r13g.clinical-search` | **8/8 PASS** |
| `r13a` + `r13h` + `r7e` + `r8e` | **13/13 PASS** |
| `npm run typecheck` | **PASS** (24 projects) |
| Migration head | **148** (0 pending) |
| `GET /health/ready` | **HTTP 200** |

---

## Post-audit

Independent re-audit confirms: gap closed; no duplicate kernel; idempotency via event-scoped keys; RLS unchanged; `clinical_search_enabled` fail-closed policy gate unchanged.

**Remaining unblocked (low priority / deferred):** TD-R13E-01 analytics rollup scheduler; R2 stale `GET /doctor/me/availability` copy (clients use `/windows`).

**Next:** **`ROADMAP_ENGINEERING_PAUSE`** unless explicit authorization for TD-R13E-01 or another deferred item.
