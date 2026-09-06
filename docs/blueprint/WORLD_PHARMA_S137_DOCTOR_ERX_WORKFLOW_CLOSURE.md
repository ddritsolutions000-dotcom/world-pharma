# WORLD_PHARMA_S137 — Doctor Consultation + eRx Production Workflow Closure

**Status:** COMPLETE (software workflow + eRx activation path)  
**Master Index:** #433  
**CAN_PRODUCTION_LAUNCH:** NO  
**Production clinical/eRx workflow:** EXTERNAL_GATED / BLOCKED (`NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW`)  
**Real legal eRx transmission:** NO  
**ISSUED = LEGALLY_TRANSMITTED:** false  

## Implementation completed

Sprint 137 closes the **software-side doctor consultation + prescription workflow** and adds a **provider-neutral eRx production activation path** (S133/S134 pattern). Production legal transmission remains **fail-closed**.

### Workflow (software)

DOCTOR DISCOVERY → PROFILE → APPOINTMENT → CONSENT → CONSULTATION → CLINICAL DECISION → PRESCRIPTION DRAFT → PRESCRIPTION ISSUED → eRx TRANSMISSION GATE → HEALTH RECORD → MEDICINE ORDER

**Separations:** DOCUMENT ≠ DOCTOR VERIFIED ≠ APPROVED ≠ CLINICAL ENABLED; **ISSUED ≠ LEGALLY_TRANSMITTED**.

### Reused (not duplicated)

| Component | Source |
| --- | --- |
| Consultation real-use | S125 `doctor-consultation-erx-real-use-closure.ts` |
| eRx onboarding | S68/S78/S91 `erx-first-onboarding.ts` |
| Appointment / consent | Existing clinical services |
| Prescription DRAFT→ISSUED | `prescription.service.ts` |
| eRx submission / idempotency | `erx-submission.service.ts` |
| Medicine Rx gate | Cart `RX_REQUIRED` |
| Health-record handoff | Existing projection on issue |
| Video | Remains EXTERNAL_GATED (not faked) |

### New / extended

1. **`erx-production-activation-path.ts`** — lifecycle CONFIGURED≠VERIFIED≠APPROVED≠ENABLED; `assertProductionErxTransmissionAllowed`.  
2. **`doctor-consultation-erx-production-workflow-closure.ts`** — workflow report + `evaluateDoctorClinicalActionEligibility`.  
3. **Runtime wiring** — production eRx submit fail-closed; startConsultation + issue Rx partner/KYC gate.  
4. **Admin** — `GET …/erx-production-activation-path`, `GET …/doctor-consultation-erx-production-workflow-closure`; Provider + Launch cards.

## Files changed

- `apps/api/src/clinical/erx-production-activation-path.ts` (new)
- `apps/api/src/clinical/doctor-consultation-erx-production-workflow-closure.ts` (new)
- `apps/api/src/clinical/s137-doctor-consultation-erx-production-workflow-closure.spec.ts` (new)
- `apps/api/src/clinical/erx-submission.service.ts`
- `apps/api/src/clinical/appointment.service.ts`
- `apps/api/src/clinical/prescription.service.ts`
- `apps/api/src/platform/admin-control-plane.controller.ts`
- `apps/api/src/platform/admin-control-plane.service.ts`
- `apps/web-admin/src/provider-activation-api.ts`
- `apps/web-admin/src/provider-activation-admin.tsx`
- `apps/web-admin/src/production-launch-control-admin.tsx`
- `apps/web-customer/src/__tests__/s137-doctor-erx-workflow.spec.ts` (new)
- `docs/blueprint/WORLD_PHARMA_S137_DOCTOR_ERX_WORKFLOW_CLOSURE.md` (this file)
- `docs/blueprint/00_MASTER_INDEX.md`

## Tests

```text
npx jest --testPathPatterns=s137-doctor-consultation-erx --testPathPatterns=s125-doctor-consultation --testPathPatterns=s91-erx-activation
# → Test Suites: 3 passed; Tests: 18 passed, 18 total

npx jest --testPathPatterns=s137-doctor
# → Tests: 1 passed, 1 total
```

**Actual results:** S137+S125+S91 **18/18 PASS**; web-customer S137 **1/1 PASS**.

## eRx / production status

| Area | Status |
| --- | --- |
| Software clinical workflow | COMPLETE |
| Sandbox consultation + internal ISSUED | SANDBOX_VERIFIED |
| eRx software activation path | COMPLETE |
| Production eRx transmission | BLOCKED |
| Telemedicine | EXTERNAL_GATED |
| Fake legal transmission | Forbidden |

## External blockers

1. **NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW** (umbrella)  
2. **NO_PRODUCTION_ERX_PROVIDER**  
3. **NO_PRODUCTION_VIDEO_PROVIDER**  
4. **NO_PRODUCTION_KYC_KYB_PROVIDER** (doctor verification)  
5. Human SoD + security/deploy gates  

STOP — do not auto-start the next sprint.
