# WORLD_PHARMA S157 — Final Core Product Completeness & Real-Use Hardening

**Sprint:** 157  
**Master backlog:** #454  
**Status:** SOFTWARE COMPLETE (validation / no critical coding gap)  
**Verdict:** **NO_CRITICAL_CODING_GAP_FOUND**  
**CAN_PRODUCTION_LAUNCH:** NO

## 1. Core journeys reviewed

| Journey | Surfaces checked |
| --- | --- |
| Medicine | Catalog browse, cart, checkout SPA, Rx safety gate (S156), orders API |
| Lab | `/lab`, bookings list API, S154 list hammer |
| Imaging | `/radiology` (+ bookings/viewer), S152 frame runtime, S154 hammer |
| Doctor / consult | `/doctors`, `/appointments` SPA; appointments API at `/api/v1/appointments` |
| Pharmacy / vendor | Prior S156 Rx gate + existing fulfillment (no rebuild) |
| Affiliate | Web `:3010` up; S149/S150 regression; mobile not rebuilt |
| Admin | `:3001` control plane shell up |

## 2. Already-working capabilities (B)

- S154 nest mutex + sequential lab/imaging present — **stable** (50× sequential + 8 concurrent lists: **0** `3B001`)
- S156 forged Rx case blocked at quote/checkout
- S152 sandbox viewer: auth required, PNG frames, **no** public storage URLs
- Catalog / cart / orders / lab / imaging APIs ownership fail-closed when unauthenticated (401)
- Customer nav uses `/radiology` (not legacy `/imaging`)
- Concurrent nested `runWithTenant` in catalog eligibility / family summary **mitigated** by S154 `withTenantNestLock` (not a remaining race)

## 3. Genuine defects found (A)

**None** meeting FIX-NOW / high-impact core-journey criteria.

Candidates inspected and classified **B** (already mitigated) or **E** (optional):

| Candidate | Class | Notes |
| --- | --- | --- |
| Catalog `Promise.all(isCustomerPurchasableSeller)` | **B** | Nested SAVEPOINTs serialized by `withTenantNestLock` |
| Family health `Promise.all` member hydration | **B** | Same nest lock |
| `/imaging` SPA 404 | **E** | Canonical route is `/radiology`; nav already correct |
| Residual IN phone / ₹ copy | **E** | Not journey-breaking; country-gated where present |

## 4. Fixes made

**No application code changes.** Decision rule: do not manufacture work when no category-A defect exists.

Runtime probe scripts only (evidence, not product):

- `scripts/s157-core-product-runtime-probe.ts`
- `scripts/s157-authenticated-core-probe.ts`

## 5. Tests

| Suite | Result |
| --- | --- |
| S154 RLS savepoint | PASS |
| S156 Rx fulfillment safety | PASS |
| S152 imaging diagnostic viewer | PASS |
| S149 affiliate payout | PASS |
| S150 KYC/KYB activation path | PASS |

No new S157 defect-regression tests (none required without a code fix).

## 6. Real-use / browser / device evidence

| Check | Result |
| --- | --- |
| API `/health` | 200 |
| Customer / Admin / Affiliate webs | 200 |
| SPA: radiology, lab, doctors, cart, orders, checkout, appointments | 200 |
| Auth OTP sandbox login | OK (`dev_code` reveal) |
| Lab/imaging lists (auth) 30 seq + 8 concurrent | 200, **0** fail |
| S154 hammer (sandbox customer) | **TOTAL_FAIL 0** |
| S152 viewer frame | 200 PNG; unauth 401; no public URL |
| Unauth me/* | 401 |
| Full browser click-through (OTP UI / payment UI / vendor UI) | **NOT_COMPLETED** |
| Device / mobile affiliate tap-through | **NOT_COMPLETED** (not required; no rebuild) |

Do **not** treat SPA 200 alone as journey PASS for payment/fulfillment click-through.

## 7. External gates (C)

Unchanged:

- Live PSP / payout / carrier / eRx / PACS / HL7-FHIR / OTP vendor / secrets vault / managed backup / production deploy target  
- Production eRx / auto-execute worker  
- `CAN_PRODUCTION_LAUNCH = NO`

## 8. Business / legal / ops (D)

Country selection, licenses, MoR, live provider contracts, OD-RX-REFILL legal, pentest evidence — outside coding.

## 9. Optional backlog (E)

- Soft redirect `/imaging` → `/radiology` for legacy bookmarks  
- Deeper IN-locale copy cleanup outside country packs  
- Optional wallet / content corpus / richer corporate programs (S151)  
- HL7/FHIR adapters **when** a lab network is contracted (still **C** until then)

## 10. Final software-readiness assessment

Core 1mg-class **application** journeys are software-complete for sandbox/real-use of existing engines. Remaining blockers to production launch are **external / legal / ops**, not a missing core coding gap.

**STOP.** Do not open S158 merely to increment sprint numbers unless a new category-A defect is demonstrated.
