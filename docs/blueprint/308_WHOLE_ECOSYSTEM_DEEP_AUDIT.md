# 308 — Whole ecosystem audit + appointment complete 500 fix

**CR:** `CR-308-WHOLE-ECOSYSTEM-DEEP-AUDIT`  
**Date:** 30 August 2026  
**Verdict:** **`APPOINTMENT_COMPLETE_OPTIONAL_BODY_FIX_COMPLETE`**

---

## Selected gap

**REAL_DEFECT:** `POST /api/v1/doctor/appointments/:id/complete` returned HTTP 500 when request body omitted, despite `patient_summary` being optional in service layer.

**Root cause:** Controller accessed `body.patient_summary` when NestJS `@Body()` was `undefined` for bodyless POST.

**Fix:** Default `@Body()` to `{}` in `doctor-appointment.controller.ts`.

---

## Audit matrix (top candidates)

| Candidate | Classification | Selected? |
|-----------|----------------|-----------|
| Appointment complete 500 (no body) | **REAL_DEFECT** | **YES — fixed** |
| doctor.e2e XX country 200 | **PRE-EXISTING TEST-INFRA ISSUE** | No — shared test DB has XX country with doctor onboarding from other suites |
| Lab amend missing `LAB_REPORT_AMENDED` outbox/notification | **REAL_DEFECT** | No — next highest; deferred to future CR |
| CRM automation scheduler (TD-R12G-02) | **DEFERRED** | No |
| Campaign auto-send worker | **DEFERRED** | No |
| Abandoned-cart CRM wiring (TD-R12B-01) | **DEFERRED** | No |
| Logistics worker zero producers | **REAL_MISSING_FEATURE** (low urgency) | No |

---

## Verification

| Check | Result |
|-------|--------|
| `appointment.e2e` | **1/1 PASS** (was failing 500 on complete) |
| `doctor-availability-summary.e2e` + `appointment-status.spec` | **7/7 PASS** |
| `doctor.e2e` | **FAIL** — pre-existing test-infra (XX pollution), not app defect |
| `api:typecheck` | **PASS** |
| `api:build` | **PASS** |
| Migration head | **148** (0 pending) |
| `GET /health/ready` | **HTTP 200** |

**Next:** Lab report amend notification parity (`LAB_REPORT_AMENDED` outbox + customer notification) — highest remaining unblocked REAL_DEFECT.
