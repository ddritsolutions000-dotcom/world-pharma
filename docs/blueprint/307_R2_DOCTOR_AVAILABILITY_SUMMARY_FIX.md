# 307 — R2 doctor availability summary correctness fix

**CR:** `CR-307-R2-DOCTOR-AVAILABILITY-SUMMARY-FIX`  
**Date:** 30 August 2026  
**Verdict:** **`R2_AVAILABILITY_SUMMARY_FIX_COMPLETE`**

---

## REAL_DEFECT

`GET /api/v1/doctor/me/availability` (and nested `GET /doctor/me` → `availability`) returned a hardcoded placeholder `{ configured: false, note: 'Availability scheduling is not implemented in this slice.' }` even after doctors configured windows via the canonical `ScheduleService` + `PUT/GET /doctor/me/availability/windows` path.

---

## Fix

- Added `ScheduleService.summary(personId)` — derives summary from `list()` (same source as `/windows`).
- `DoctorController` `GET me/availability` → `schedule.summary()`.
- `DoctorService.getMe()` → `schedule.summary()` via `forwardRef` (both services use mutual `forwardRef` for circular DI).
- Removed stale placeholder from `getMe()`.

**Response contract:**

```json
{
  "configured": true,
  "timezone": "Europe/Berlin",
  "window_count": 5,
  "exception_count": 0
}
```

---

## Files changed

| File | Change |
|------|--------|
| `apps/api/src/clinical/schedule.service.ts` | `summary()` + `forwardRef` for `DoctorService` |
| `apps/api/src/clinical/doctor.service.ts` | `getMe()` uses `schedule.summary()` |
| `apps/api/src/clinical/doctor.controller.ts` | Summary endpoint uses `ScheduleService` |
| `apps/api/src/clinical/doctor-availability-summary.e2e.spec.ts` | **NEW** — 6 regression tests |

---

## Verification

| Check | Result |
|-------|--------|
| `doctor-availability-summary.e2e` | **6/6 PASS** |
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| Migration head | **148** (0 pending) |
| `GET /health/ready` | **HTTP 200** |
| `appointment.e2e` / `doctor.e2e` | Pre-existing unrelated failures in test env (complete/patient_summary, XX country policy) |

**Clients:** web-doctor and mobile-doctor use `/windows` only; summary fix restores API contract integrity.

**Next:** **`ROADMAP_ENGINEERING_PAUSE`** — no further unblocked R2 defects; remaining gaps DEFERRED/FUTURE/HUMAN_BLOCKED.
