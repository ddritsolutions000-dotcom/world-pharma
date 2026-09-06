# Sprint 127 — Real Lab Partner Onboarding + Production Activation Control

**Status:** COMPLETE (activation preparation)  
**Master Index:** #425  
**CAN_PRODUCTION_LAUNCH:** NO  

## Purpose

Operational readiness to onboard a real lab partner and move that partner through controlled verification/activation states **once** real external evidence and credentials exist.

This sprint does **not** invent live lab integrations, accreditations, registries, licenses, technicians, or production enablement.

## Authoritative source

`apps/api/src/lab/lab-partner-onboarding-activation-preparation.ts`

Composes: S15/S25/S36/S42/S48/S55/S57/S72/S81/S94/S106/S110/S116–S120/S124/S126.

**No parallel frameworks** for onboarding, KYC, sample, report, catalog, or authorization.

## Onboarding lifecycle (mapped onto existing PartnerStatus)

Conceptual Admin phases (not a new Prisma enum):

`PROSPECT → APPLICATION_SUBMITTED → DOCUMENTS_PENDING → UNDER_REVIEW → VERIFICATION_PENDING → VERIFIED → ACTIVATION_PENDING → ENABLED → SUSPENDED → EXPIRED/DEACTIVATED`

Mapped via `mapPartnerStatusToLabOnboardingPhase()` onto existing `PartnerStatus` transitions.

Important: `PartnerStatus.ACTIVE` maps to **ACTIVATION_PENDING** unless production gates are satisfied — ACTIVE ≠ production ENABLED.

## Verification separation (hard)

**DOCUMENT VERIFIED ≠ PARTNER VERIFIED ≠ PRODUCTION ENABLED**

A partner must not become production-enabled merely because:
- a document exists/uploaded
- KYC is submitted
- sandbox tests pass
- an admin clicks an unsafe shortcut

## Activation gates (Admin summary)

| Gate | Status | Scope |
|------|--------|-------|
| Business / KYB | EXTERNAL_GATED | EXTERNAL |
| Healthcare / accreditation | EXTERNAL_GATED | EXTERNAL |
| Required documents | SANDBOX_ONLY | EXTERNAL |
| Organization / tenant | READY | INTERNAL |
| Service locations | SANDBOX_ONLY | INTERNAL |
| Lab catalogue | SANDBOX_ONLY | INTERNAL |
| Collection capability | SANDBOX_ONLY | INTERNAL |
| Report / pathology workflow | SANDBOX_ONLY | EXTERNAL (clinical adapters) |
| Storage / security | EXTERNAL_GATED | EXTERNAL |
| Payment / PSP | EXTERNAL_GATED | EXTERNAL |
| Country / market policy | READY | INTERNAL (policy-pack) |
| Production infrastructure | EXTERNAL_GATED | EXTERNAL |
| External-provider dependencies | EXTERNAL_GATED | EXTERNAL |
| **Production lab partner activation** | **BLOCKED** | — |

## Fail-closed rules

- Unverified lab cannot become ENABLED
- Expired verification cannot satisfy activation
- Suspended lab cannot accept new production bookings
- Missing mandatory evidence blocks activation
- Sandbox attestation (`LAB_PARTNER_SANDBOX_V1`) ≠ legal accreditation
- Mock/sandbox credentials cannot satisfy production
- Clinical adapters absent (`NO_PRODUCTION_CLINICAL_ADAPTER`)
- Cross-tenant activation DENIED
- Illegal PartnerStatus / KYC transitions rejected

## Customer safety

- Unverified / suspended / expired labs must not appear as **production-available** providers
- Existing **sandbox/demo** lab discovery/booking flows preserved (S126)

## Catalog ownership

Reuses existing catalog model (tests, packages, sample requirements, preparation, collection method, turnaround, report availability). No second catalogue.

## Global policy

Policy-pack driven. No hardcoded India / INR / ₹ / +91 / IST / GST / PAN / UPI in lab activation logic.

## Security / tenant isolation

- Lab A cannot access Lab B onboarding cases (existing tenancy)
- Lab operator cannot approve self unless SoD explicitly allows (S110)
- Customer cannot access Admin onboarding/activation APIs
- Evidence uses secure object-store references (no public raw private objects)
- PHI not required in activation-prep surfaces

## Sandbox vs production

| | Sandbox | Production |
|--|---------|------------|
| Manual/attest verification | Allowed | Forbidden as production proof |
| Mock KYC / fake accreditation | N/A / demo only | Forbidden |
| Lab ops / diagnostics loop | SANDBOX_VERIFIED (S126) | BLOCKED until external inputs |
| Activation enablement | Not production ENABLED | EXTERNAL_GATED |

## Admin surfaces

- Launch Control: “Lab partner onboarding + activation (Sprint 127 — why can’t we activate labs?)”
- Provider Activation: “Real lab partner onboarding + production activation control (Sprint 127)”
- Labs queue: `/labs` (existing Admin lab cases)
- API: `GET /api/v1/admin/control-plane/lab-partner-onboarding-activation-preparation`

## Real-use browser evidence

Screenshots: `apps/test-results/s127-lab-partner-onboarding-shots/` (**11**)

- Admin launch blocker
- Provider activation card + responsive 390/768/1024/1440
- Labs queue + case detail
- Lab portal sandbox
- Customer lab discovery (sandbox)
- Customer denied Admin

Status artifact: `apps/test-results/s127-lab-partner-onboarding/s127-status.json`

## Tests

| Suite | Result |
|-------|--------|
| Unit S127 | **4/4** |
| Playwright S127 | **3/3** |
| Regression S72/S81/S94/S106/S110/S116–S120/S124/S126/S127 | **77/77** |
| Native | **DEVICE_NOT_AVAILABLE** |
| Responsive | **390 / 768 / 1024 / 1440** |

## Remaining external inputs (production)

1. Real KYC/KYB provider + credential/callback refs (S124)
2. Market-policy lab accreditation / healthcare registry evidence
3. Production clinical adapters (HL7/FHIR/LIS) — `NO_PRODUCTION_CLINICAL_ADAPTER`
4. Production private storage + KMS + malware scan
5. Production PSP where lab booking payment required (S120)
6. Human SoD verification + approval (S110)
7. Security certification (`EXTERNAL_PENTEST_REQUIRED`)
8. Production foundation / release / deployment target (S117–S119)

## Primary blocker

`NO_PRODUCTION_LAB_PARTNER_ACTIVATION`

## Explicit claims NOT made

- Real lab production-enabled
- Real accreditation/registry verified
- Real clinical test performed
- Production launch possible

## Files

**Created**

- `apps/api/src/lab/lab-partner-onboarding-activation-preparation.ts`
- `apps/api/src/lab/s127-lab-partner-onboarding-activation-preparation.spec.ts`
- `apps/web-customer/e2e/helpers/s127-ui.ts`
- `apps/web-customer/src/__tests__/s127-lab-partner-onboarding.spec.ts`
- `docs/ops/S127_REAL_LAB_PARTNER_ONBOARDING_AND_ACTIVATION_CONTROL.md`

**Modified**

- `apps/api/src/platform/admin-control-plane.controller.ts`
- `apps/api/src/platform/admin-control-plane.service.ts`
- `apps/web-admin/src/provider-activation-api.ts`
- `apps/web-admin/src/production-launch-control-admin.tsx`
- `apps/web-admin/src/provider-activation-admin.tsx`
- `apps/web-customer/playwright.config.ts`
- `docs/blueprint/00_MASTER_INDEX.md` (#424 → #425)

## STOP

Do **not** auto-start Sprint 128.
