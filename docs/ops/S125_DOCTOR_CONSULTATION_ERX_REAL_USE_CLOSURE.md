# Sprint 125 — Doctor Consultation + Clinical eRx Real-Use Closure

**Status:** COMPLETE (sandbox real-use closure — no legal eRx / no production clinical)  
**Master Index:** #423  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  

| Plane | State |
|-------|--------|
| Consultation (sandbox) | Software-ready; existing lifecycle reused |
| Consent | Enforced before start (`CONSENT_REQUIRED`) |
| Internal Rx DRAFT/ISSUED | Available |
| eRx provider | **NOT_SELECTED** / **EXTERNAL_GATED** |
| Video provider | **NOT_SELECTED** / **EXTERNAL_GATED** |
| ISSUED ≠ LEGALLY_TRANSMITTED | Preserved |

## Goal

Close software + real-use clinical journey for doctor consultation and prescription handling on existing sandbox architecture. External eRx/video remain gated.

## Authoritative source

`apps/api/src/clinical/doctor-consultation-erx-real-use-closure.ts` composes S23/S36/S48/S55/S56/S68/S69/S78/S79/S91/S92 + S110/S116/S124.

## Architecture reused

| Concern | Source |
|---------|--------|
| Appointment SM | `appointment-status.ts` |
| Consent before start | `appointment.service.ts` / clinical-access |
| Prescription | existing clinical Rx service |
| eRx readiness | `erx-first-onboarding.ts` (S68/S78/S91) |
| Video readiness | `video-first-onboarding.ts` (S69/S79) |
| Authorization | S110 |

## Real-use results

| Flow | Result |
|------|--------|
| Customer doctors → profile → consent → appointments → prescriptions | PASS |
| Doctor appointments → detail → Rx gate | PASS |
| Consent gate (missing ≠ PermissionDenied) | Observed when applicable |
| Cross-patient health URL | DENIED |
| Customer → doctor portal | DENIED |
| Admin eRx + appointments + launch NO | PASS |

## Remaining external blockers

- **NO_PRODUCTION_ERX_PROVIDER**
- **NO_PRODUCTION_VIDEO_PROVIDER**
- Partner verification / foundation / PSP / carrier / etc. still block overall launch

## Exact external inputs still required

Real eRx provider contract + credential/endpoint/callback refs; market/prescriber/pharmacy network config; real video provider refs where telemedicine required; human approval; security certification; production foundation.

## Tests

| Suite | Result |
|-------|--------|
| Unit S125 | **4/4** |
| Playwright S125 | **3/3** |
| Regression S68+S69+S78+S79+S91+S92+S110+S116+S124+S125 | **81/81** |
| Screenshots | `apps/test-results/s125-consultation-erx-shots/` (**19**) |
| Responsive | 390 / 768 / 1024 / 1440 |
| Native | **DEVICE_NOT_AVAILABLE** |
| Security | **NO_NEW_VULNERABILITY** |

## STOP

Sprint 125 complete. Do **not** invent eRx/video providers. Do **not** claim legal transmission. Do **not** auto-start Sprint 126.
