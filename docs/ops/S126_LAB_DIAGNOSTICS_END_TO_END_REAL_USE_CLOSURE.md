# Sprint 126 — Lab Diagnostics End-to-End Real-Use Closure

**Status:** COMPLETE (sandbox real-use closure — no production lab)  
**Master Index:** #424  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  

| Plane | State |
|-------|--------|
| Customer lab discovery / booking | Software-ready (sandbox) |
| Lab ops (accession / processing / pathology) | Software-ready (sandbox) |
| Report lifecycle | DRAFT → … → PUBLISHED (existing) |
| Production clinical adapter | **NO_PRODUCTION_CLINICAL_ADAPTER** |
| HL7 / FHIR | **EXTERNAL_GATED** |
| KYC / PSP dependencies | **BLOCKED** / **NOT_SELECTED** |

## Goal

Close the existing lab diagnostics journey through real browser use on sandbox fixtures. No real samples, PHI, or production lab activation.

## Authoritative source

`apps/api/src/lab/lab-diagnostics-real-use-closure.ts` composes S5/S25/S36/S48/S55/S56/S57 + S110/S116/S120/S124/S125.

## Real-use results

| Flow | Result |
|------|--------|
| Customer `/lab` → detail → packages → bookings | PASS |
| Lab portal `#bookings` / `#accession` / `#processing` / `#pathology` | PASS |
| Pathologist worklist | PASS (already published or empty) |
| Customer report + `/health` | PASS |
| Foreign booking access | DENIED |
| Admin `/labs` + launch NO | PASS |

## State integrity

- Sample CoC: illegal ASSIGNED→PROCESSING blocked  
- Report: illegal DRAFT→PUBLISHED blocked; PUBLISHED terminal  
- Processing: QUEUED→IN_PROGRESS allowed  

## Remaining external blockers

- **NO_PRODUCTION_CLINICAL_ADAPTER** (HL7/FHIR EXTERNAL_GATED)
- Production KYC/partner verification BLOCKED
- Production PSP BLOCKED
- Broader launch gates unchanged

## Exact external inputs still required

Production clinical adapters (HL7/FHIR/LIS where required); lab accreditation/registry evidence; KYC/partner verification; storage/KMS/malware where required; PSP; foundation; security certification.

## Tests

| Suite | Result |
|-------|--------|
| Unit S126 | **4/4** |
| Playwright S126 | **3/3** |
| Regression S110+S116+S120+S124+S125+S126 | **29/29** |
| Screenshots | `apps/test-results/s126-lab-diagnostics-shots/` (**20**) |
| Responsive | 390 / 768 / 1024 / 1440 |
| Native | **DEVICE_NOT_AVAILABLE** |
| Security | **NO_NEW_VULNERABILITY** |

## STOP

Sprint 126 complete. Do **not** invent lab providers or real pathology results. Do **not** auto-start Sprint 127.
