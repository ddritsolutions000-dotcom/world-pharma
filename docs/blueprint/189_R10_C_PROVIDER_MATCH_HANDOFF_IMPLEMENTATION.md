# Book 189 — R10-C Provider Match + Appointment/Tele Handoff

**CR:** CR-R10-C-IMPL-189  
**Verdict:** **R10_C_IMPLEMENTED**  
**Depends:** R10-A [185](185_R10_A_CARE_NAVIGATION_KERNEL_IMPLEMENTATION.md), R10-B [187](187_R10_B_CUSTOMER_CARE_NAVIGATION_UI_IMPLEMENTATION.md), R2 appointments, R4 video (optional)  
**Next:** **CR-POST-R10-C-AUDIT-190**

---

## 1. Scope delivered

R10-C extends care navigation:

`INTAKE → TRIAGED → MATCHED → COMPLETED (handoff)`

| Capability | Status |
|------------|--------|
| Deterministic provider matching | Implemented |
| Explainable match reasons | Implemented |
| Red-flag safety gate | Implemented |
| Appointment handoff via `AppointmentService` | Implemented |
| Optional tele path (sandbox video metadata) | Implemented |
| Customer web + mobile UI | Implemented |
| Audit / outbox / security events | Implemented |

**Not started:** R10-D/E/F, R11+, duplicate appointment/video kernels, ML matching, auto-Rx.

---

## 2. State machine

| From | To | Trigger |
|------|-----|---------|
| TRIAGED | MATCHED | `GET .../recommendations` (non-red-flag) |
| MATCHED | COMPLETED | `POST .../handoff/appointment` success |
| * | TERMINATED | existing R10-A terminate |
| COMPLETED / TERMINATED | — | terminal (no mutation) |

Red-flag sessions: `booking_handoff_allowed: false`; match/handoff return **403**.

---

## 3. APIs

Base: `/api/v1` — customer JWT required.

| Method | Route | Notes |
|--------|-------|-------|
| GET | `/care-nav/sessions/:id/recommendations?country_code=` | Runs match; transitions TRIAGED→MATCHED |
| POST | `/care-nav/sessions/:id/handoff/appointment?country_code=` | Body: `doctor_profile_id`, `starts_at`, `type?`, `authorized: true`; idempotency key |
| GET | `/care-nav/sessions/:id/handoff/status?country_code=` | Operational handoff + tele metadata |

Existing routes reused for slots: `GET /care/doctors/:profileId/slots`.

---

## 4. Matching rules

- Source: `AppointmentService.directory` (no duplicate catalog)
- Inputs: triage `specialty_codes`, country, active doctor partners
- Scoring: specialty overlap → `care_nav.match.specialty_match`; GP fallback → `care_nav.match.general_practice_fallback`
- Tele hint: `care_nav.match.tele_capable` appended when provider `online_capable` and pack allows tele
- Sort: score DESC, display name ASC, profile id ASC (deterministic)
- Persisted in `care_match_recommendations` (insert-only per RLS; no delete)

---

## 5. Handoff

- Validates session `MATCHED`, provider in recommendation set, `authorized === true`
- Books via `AppointmentService.book` (`reason_category: care_navigation`)
- Links `care_navigation_sessions.appointment_id` (unique FK)
- Outbox: `CARE_NAV_HANDOFF_BOOKED` (opaque IDs only)
- Tele: `ONLINE` when pack + provider capable; join route `/api/v1/appointments/:id/video/join`; `recording_enabled: false`

---

## 6. Database

Migration `20260829180600_r10c_care_nav_match_handoff`:

- Enum `CareNavSessionStatus` + `MATCHED`
- Columns `matched_at`, `appointment_id` (unique FK → `appointments`)

---

## 7. Security / PHI

- Pack gates: `care_navigation_enabled`, `appointments_enabled`, `consultation_capability`
- Red-flag fail-closed on match/handoff
- Cross-patient → 404; disabled pack → 403
- Notifications/outbox: session_id, appointment_id, doctor_profile_id only — no symptoms/triage narrative

---

## 8. UI (web + mobile)

Flow after triage (non-red-flag):

1. Find matched providers  
2. Select provider + slot (`/care/doctors/:id/slots`)  
3. In-person or online (when tele pack on)  
4. Confirm handoff → success  

Red-flag: emergency guidance only; no match/book CTAs.

---

## 9. Tests

| Suite | Result |
|-------|--------|
| `r10c.care-nav-handoff.e2e.spec.ts` | 4/4 PASS (isolated) |
| `r10a.care-nav-kernel.e2e.spec.ts` | PASS (regression) |
| web-customer | 32/32 PASS |
| mobile | 14/14 PASS |
| API typecheck | PASS |

Full API suite: **83 suites / 197 tests** — R10-C uses slot-retry helper for appointment overlap isolation; occasional suite-order overlap with `appointment.e2e` documented as known debt.

---

## 10. Runtime verification

| Check | Status |
|-------|--------|
| API `/health/ready` | Available when API running |
| Care-nav match/handoff routes | Covered by e2e |
| Web production build | PASS |
| Browser OTP full flow | Not re-verified (pack default off on dev XX) |
| Android | **ANDROID_RUNTIME_NOT_VERIFIED** |
| iOS | **IOS_BUILD_NOT_AVAILABLE_ON_WINDOWS** / **IOS_RUNTIME_NOT_VERIFIED** |

---

## 11. Known debt

- `care_match_recommendations` RLS: no worker DELETE — rematch replaces only on empty MATCHED; full rematch policy deferred to R10-D
- Full-suite slot contention with shared test doctor — mitigated via retry helper; dedicated test doctor per suite optional
- Prisma `generate` EPERM on Windows when engine DLL locked — retry if client stale

---

## 12. Boundary verification

| Phase | Status |
|-------|--------|
| R10-A | COMPLETE |
| R10-B | COMPLETE |
| R10-C | **IMPLEMENTED** |
| R10-D/E/F | NOT STARTED |
| R11+ | NOT STARTED |

No autonomous diagnosis, ML matching, live money, production healthcare/video, or recording.
