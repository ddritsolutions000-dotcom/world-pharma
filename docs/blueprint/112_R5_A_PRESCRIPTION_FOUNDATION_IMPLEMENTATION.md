# 112 — R5-A prescription foundation implementation

**Status:** Implemented (R5-A only)  
**Change ID:** **CR-R5-IMPL-112**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R5_A_IMPLEMENTED**

**Sources:** [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) · [110](110_PRE_R5_READINESS_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authorization boundary:** **R5-A only.** No R5-B/C/D/E/F. No refill, no e-Rx provider, no pharmacy dispensing, no pharmacist app, no second identity, no live money/carriers.

---

## 0. Confirmations (explicit)

| Item | Status |
|------|--------|
| Pharmacy dispensing | **NO** (noop `DispensingBoundaryPort` only) |
| Order creation from prescription | **NO** |
| Inventory consumption | **NO** |
| Payment | **NO** |
| Shipment | **NO** |
| Live e-Rx | **NO** (`NullERxAdapter` fail-closed) |
| Refill | **NO** |
| Live PSP / DHL / payout | **NO** |

---

## 1. Database

**Migration:** `packages/database/prisma/migrations/20260827181500_r5a_prescription_foundation/` (additive only; DB not reset).

| Table | Role |
|-------|------|
| `prescriptions` | Header: patient, doctor profile/partner, encounter, country, status, current version |
| `prescription_versions` | Immutable when `sealed_at` set; version chain via `supersedes_version_id` |
| `prescription_lines` | Clinical concept + instructions; optional `suggested_catalog_item_id` hint (no catalog duplication) |
| `prescription_status_history` | Append-only status trail |

RLS enabled for all four tables (`worldpharma_app`, person/doctor/org/platform predicates).

Enums: `PrescriptionStatus` (`DRAFT` → `ISSUED` → `CANCELLED` / …), `PrescriptionOrigin`.

---

## 2. State machine (server-enforced)

```
DRAFT → ISSUED | CANCELLED
ISSUED → CANCELLED | EXPIRED | FULLY_DISPENSED  (EXPIRED/FULLY_DISPENSED not written by R5-A APIs)
Amend while ISSUED → new sealed version (header stays ISSUED)
```

Illegal transitions → `409 ILLEGAL_PRESCRIPTION_TRANSITION`.

---

## 3. API surface (`/api/v1`)

| Method | Path | Audience |
|--------|------|----------|
| GET | `/doctor/prescriptions` | doctor |
| GET | `/doctor/prescriptions/:id` | doctor |
| POST | `/doctor/prescriptions` | doctor (+ Idempotency-Key) |
| POST | `/doctor/prescriptions/:id/issue` | doctor (+ Idempotency-Key) |
| POST | `/doctor/prescriptions/:id/amend` | doctor (+ Idempotency-Key) |
| POST | `/doctor/prescriptions/:id/cancel` | doctor (+ Idempotency-Key) |
| GET | `/customer/prescriptions` | customer |
| GET | `/customer/prescriptions/:id` | customer |
| GET | `/admin/prescriptions` | admin + `prescription:read` |
| GET | `/admin/prescriptions/:id` | admin + `prescription:read` (metadata only) |

### Access gates

- Authenticated doctor principal → `DoctorProfile` (never trust client doctor id)
- Patient from encounter (never trust client patient id for create)
- Encounter ownership required
- `ClinicalAccessService.evaluate` (relationship + consultation consent)
- Pack fail-closed: `rx_prescribe_enabled`, `rx_amend_enabled`, `rx_erx_enabled`, `rx_dispense_enabled`, `rx_allowed_restriction_codes`

### Ports

- `ERxPort` + `NullERxAdapter`
- `DispensingBoundaryPort` + `NoopDispensingBoundary` (R5-C hook)

### Events (ids only in payloads)

`PRESCRIPTION_CREATED` / `ISSUED` / `AMENDED` / `CANCELLED` → outbox + notification dispatch registration.

---

## 4. Policy / RBAC

Healthcare pack fields added (default **false** / empty allow-list).  
Permission `prescription:read` (company-only; operations + compliance roles).

---

## 5. UI

| App | R5-A |
|-----|------|
| web-doctor | List, create draft, issue, amend, cancel, versions |
| web-customer | List + detail (read-only) |
| web-admin | Metadata oversight (`prescription:read`) |
| mobile-doctor | Tab + foundation flows |
| mobile customer | List + detail |
| Store / pharmacy | **No dispensing UI** |

---

## 6. Tests / builds

| Suite | Result |
|-------|--------|
| Typecheck | **18/18 PASS** |
| API | **128/128 PASS** (was 127; +R5-A e2e) |
| Builds | api, web-doctor, web-customer, web-admin — PASS |

---

## 7. Remains for later phases

| Phase | Scope |
|-------|--------|
| **R5-B** | Advanced prescribing UX |
| **R5-C** | Pharmacy validation / dispensing |
| **R5-D** | Commercial handoff (cart/order) |
| **R5-E** | Refill (**OD-RX-REFILL**) |
| **R5-F** | Country e-Rx adapters |

**STOP after R5-A.** Do not continue automatically.

> **Follow-up:** R5-B prescribing UX is planned in [113](113_R5_B_PRESCRIBING_UX_PLAN.md) (**CR-R5-B-AUTH-113** — **R5_B_PLAN_READY**). Implementation requires a separate **CR-R5-B-IMPL-***. R5-C…F remain unauthorized.

---

## 8. Key files

- `packages/database/prisma/schema.prisma` + migration `20260827181500_r5a_prescription_foundation`
- `apps/api/src/clinical/prescription.service.ts` (+ controllers, e-Rx/dispensing ports, e2e)
- `apps/api/src/policy/*` (rx flags)
- `apps/api/src/identity/rbac.service.ts`, `authority.ts`
- Doctor/customer/admin/mobile UI as listed in §5
- This book + Master Index + [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

**FINAL STATUS: R5_A_IMPLEMENTED**
