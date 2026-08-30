# 125 — Pre-R6 test determinism fix (P1-2)

**Status:** Implemented (test isolation only)  
**Change ID:** **CR-PRE-R6-DETERMINISM-FIX-125**  
**Date:** 27 August 2026  
**FINAL STATUS:** **PRE_R6_DETERMINISTIC**

**Source:** [124](124_PRE_R6_FINAL_VERIFICATION.md) (P1-2 OPEN — consecutive Run 3 `appointments_no_overlap`)

**Authority:** Fix **P1-2 test determinism only**. **R6 NOT STARTED.** No production appointment overlap semantics change. No retry-to-pass. No test skip. Constraint `appointments_no_overlap` unchanged.

---

## 1. Exact root cause

1. `prescription.e2e.spec.ts` used `suffix = uuidv7().slice(0, 8)`.
2. UUID v7’s leading hex encodes a timestamp; the first **8** hex characters change only about every **~65 seconds**.
3. Consecutive full-suite runs ~1 minute apart could therefore generate the **same** OTP emails (`rx-a{suffix}-doc@…`), reuse the same `Person` → `Partner` → `DoctorProfile`.
4. Seeds used `startsAt = new Date()` with a **30-minute** window, so the next run’s appointment overlapped the previous under Postgres exclusion constraint `appointments_no_overlap`.

This was a **test data lifecycle** defect, not a product rule bug.

---

## 2. Exact test-isolation fix

File: `apps/api/src/clinical/prescription.e2e.spec.ts`

| Change | Detail |
|--------|--------|
| Unique suite suffix | `${Date.now().toString(36)}-${uuidv7().replace(/-/g, '').slice(0, 12)}` (same pattern family as dispensing / rx-handoff) |
| Non-overlapping slots | `startsAt = new Date(Date.now() + 3_600_000 + appointmentSeq * 31 * 60_000)` — 1h base + 31m per seed (pairA/pairB) |
| Production code | **Unchanged** — no service, migration, or constraint edits |

**Why production behavior was not changed:** The exclusion constraint correctly blocks overlapping doctor appointments. Tests must not collide on shared fixture identities or wall-clock “now” windows.

---

## 3. Three consecutive `api:test` results (no retry)

| Run | Suites | Tests | Open-handle warning | Nx flaky | Exit |
|-----|--------|-------|---------------------|----------|------|
| **1** | 52 passed / 52 | **136 passed / 136** | No | No | 0 |
| **2** | 52 passed / 52 | **136 passed / 136** | No | No | 0 |
| **3** | 52 passed / 52 | **136 passed / 136** | No | No | 0 |

**Open handles / leaks:** No Jest “did not exit” warning across all three runs (Prisma teardown from CR-123 remains intact).

---

## 4. Regression

| Check | Result |
|-------|--------|
| API full suite (×3 consecutive) | **136/136** each (no open-handle warning) |
| RLS tenancy / R3 isolation / R5-A…E | Included in API suite — green |
| Typecheck (api + 6 web + 4 mobile) | **Successfully ran for 11 projects** |
| Web builds (6) | **Successfully ran for 6 projects** (all compiled) |
| Mobile store/EAS builds | Not claimed — typecheck only |

---

## 5. Security invariants (unchanged)

| Invariant | Status |
|-----------|--------|
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | Unchanged |
| FORCE + ENABLE RLS on CR-123 tables | Unchanged |
| Fail-closed tenant context | Unchanged |
| Client headers non-authoritative | Unchanged |
| `appointments_no_overlap` | **Still enforced** |

---

## 6. Production boundaries (remain OFF)

PSP live · DHL/carriers · vendor/affiliate/bank payout · production LiveKit · recording · automatic refill · live e-Rx — **all OFF** (no product changes in this CR).

---

## 7. Remaining blockers

| Item | Status |
|------|--------|
| Book 124 P1-2 determinism | **CLOSED** by this CR |
| Book 124 P1-1 / P1-4 | Already closed |
| R6 plan / IMPL | Plan later: [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) (**R6_PLAN_READY**); IMPL still unauthorized |
| BU membership (R15) | Open / deferred — unrelated |

---

## 8. R6

**R6 coding was NOT started by this CR.**

Canonical architecture plan (separate CR): [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) (**R6_PLAN_READY**). Implementation still requires **CR-R6-IMPL-***.

---

## Final declaration

**FINAL STATUS: PRE_R6_DETERMINISTIC**

**R6 coding: NOT STARTED**

**STOP.**
