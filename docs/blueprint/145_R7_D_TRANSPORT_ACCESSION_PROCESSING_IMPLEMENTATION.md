# 145 — R7-D Sample transport + accession + lab processing

**Status:** Implementation  
**Change ID:** **CR-R7-D-IMPL-145**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R7_D_IMPLEMENTED**

**Authority:** R7-D only per [140](140_R7_IMPLEMENTATION_PLAN.md). **R7-E/F NOT STARTED. R8+ NOT STARTED.**  
Live money NOT enabled. No LIS/HIS. No pathology. No production healthcare enablement.

**Sources:** [140](140_R7_IMPLEMENTATION_PLAN.md) · [144](144_R7_C_SAMPLE_COLLECTION_COC_IMPLEMENTATION.md) · [69](69_SAMPLE_COLLECTION_CHAIN_OF_CUSTODY.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

---

## 0. Scope delivered

| In | Out (explicit) |
|----|----------------|
| `SAMPLE_TRANSPORT` logistics jobs (mock carrier) linked to `LabSample` | Pathology interpretation / digital report |
| CoC extension: `HANDED_OVER` → `IN_TRANSIT` → `LAB_RECEIVED` → `ACCEPTED_BY_LAB` → `PROCESSING` | LIS/HIS / EHR |
| `LabAccession` (one per sample, server-generated number) | Clinical diagnosis / result values |
| `LabProcessing` bench lifecycle (`QUEUED` … `COMPLETED` / `FAILED` / `ON_HOLD`) | Physical report delivery |
| web-lab transport / accession / processing operational tabs | `mobile-lab` (deferred; web-lab covers R7-D accept) |
| Customer web + RN customer progress visibility | Internal lab notes on customer surfaces |
| `mobile-delivery` sample transport accept / pickup / deliver | Live carrier / GPS |
| Delivery rider CoC handoffs via worker tenant context | Admin CoC rewrite |

---

## 1. Kernels reused (no duplicates)

Identity · Partner/org/location · `LabSample` / `LabSampleCocEvent` (R7-C) · `LogisticsJob` · LabBooking · Policy packs · Outbox / notifications · Security events · RLS / `workerTenantContext` · ui-kit / shell-core.

---

## 2. Schema / migrations

| Migration | Purpose |
|-----------|---------|
| `20260828160000_r7d_transport_accession_processing` | CoC enum values; `LabAccession`, `LabProcessing`; `logistics_jobs` unique `(lab_sample_id, job_type)`; RLS for accession/processing; `SAMPLE_TRANSPORT` logistics RLS |

**CoC path (R7-D terminal at `PROCESSING`):**  
`HANDED_OVER` → `IN_TRANSIT` → `LAB_RECEIVED` → `ACCEPTED_BY_LAB` → `PROCESSING`

**Processing status machine:** `QUEUED` → `IN_PROGRESS` → `COMPLETED` | `FAILED` | `ON_HOLD` (illegal transitions rejected server-side).

On `HANDED_OVER`, `enqueueSampleTransport()` creates `SAMPLE_TRANSPORT` job idempotently. Transport job payload carries `lab_org_id` + `country_id` for rider worker-tenant CoC transitions.

---

## 3. API surface

### Lab operations (`LabOperationsController`)

| Method | Path | Role |
|--------|------|------|
| GET | `/lab/transport` | Lab staff transport queue |
| POST | `/lab/samples/:id/receive` | On-site lab receive (bypass rider) |
| GET | `/lab/accessions` · `/accessions/:id` | Accession list + detail |
| POST | `/lab/accessions` | Create accession (idempotent) |
| GET | `/lab/processing` · `/processing/:id` | Processing queue + detail |
| POST | `/lab/processing/:id/start` | Bench start → CoC `PROCESSING` |
| POST | `/lab/processing/:id/complete` | Complete bench (no results) |
| POST | `/lab/processing/:id/hold` | On hold |
| POST | `/lab/processing/:id/fail` | Processing failed |

### Delivery (extended)

| Method | Path | Role |
|--------|------|------|
| GET | `/delivery/jobs` | Includes `SAMPLE_TRANSPORT` |
| POST | `/delivery/jobs/:id/accept` | Rider accept (no shipment event for sample transport) |
| POST | `/delivery/jobs/:id/pickup` | CoC → `IN_TRANSIT` |
| POST | `/delivery/jobs/:id/deliver` | CoC → `LAB_RECEIVED` |

### Customer

| Method | Path | Role |
|--------|------|------|
| GET | `/me/lab/bookings/:id/collection` | Operational progress: transport, accession number, processing status, custody timeline (no clinical data) |

---

## 4. PHI minimization

Customer APIs expose operational status only (`transport_in_progress`, `lab_received`, `accession_number`, `processing_status`, custody timeline). No diagnosis, pathology findings, result values, or internal lab notes. Outbox / notification payloads reference booking/sample ids only. `boundary.results_available: false` on customer progress.

---

## 5. Apps & screens (UI completeness gate)

### web-lab (`apps/web-lab`) — route `/`

| Screen | Nav tab | API | loading | empty | error | 401/403 | session | network | success | validation | a11y/responsive |
|--------|---------|-----|---------|-------|-------|---------|---------|---------|---------|------------|-----------------|
| Transport queue | Transport | `GET /lab/transport` | ✓ | ✓ | shell | ✓ | ✓ | ✓ | list + receive | org required | shell sidebar |
| On-site receive | Transport (row action) | `POST /lab/samples/:id/receive` | button | — | onError | ✓ | ✓ | ✓ | refresh | idempotent key | button labels |
| Accession queue | Accession | `GET /lab/collections` + pending filter | ✓ | ✓ | onError | ✓ | ✓ | ✓ | accession CTA | sample required | cards |
| Accession list | Accession | `GET /lab/accessions` | ✓ | ✓ | onError | ✓ | ✓ | ✓ | list | duplicate → same id | cards |
| Accession detail | Accession (inline) | `GET /lab/accessions/:id` | — | — | onError | ✓ | ✓ | ✓ | timeline | — | list semantics |
| Processing queue | Processing | `GET /lab/processing` | ✓ | ✓ | onError | ✓ | ✓ | ✓ | list | — | cards |
| Processing detail | Processing (inline) | actions on row | — | — | onError | ✓ | ✓ | ✓ | start/complete/hold/fail | illegal → API 409 | buttons |
| Collections (R7-C) | Collections | `GET /lab/collections` | ✓ | ✓ | shell | ✓ | ✓ | ✓ | custody timeline | — | unchanged |

### Customer web (`apps/web-customer`)

| Screen | Route | API | States |
|--------|-------|-----|--------|
| Lab bookings list | `/lab/bookings` | `GET /me/lab/bookings` | loading, empty, error, 401, 403, session, network |
| Lab booking detail + R7-D progress | `/lab/bookings/[id]` | booking + `GET .../collection` | + `transport_in_progress`, `lab_received`, `accession_number`, `processing_status`, custody timeline |

### Customer mobile (`apps/mobile` — shared RN, iOS + Android)

| Screen | API | States |
|--------|-----|--------|
| `LabBookingsScreen` | `GET /me/lab/bookings` | via `FeatureStates` |
| `LabBookingDetailScreen` | booking + collection | loading, error, 401, 403, session, network + R7-D progress fields |

### mobile-delivery (`apps/mobile-delivery`)

| Screen | API | States |
|--------|-----|--------|
| Jobs list | `GET /delivery/jobs` | loading, empty, forbidden, network, session |
| Sample transport detail | accept / pickup / deliver | `SAMPLE_TRANSPORT` branch — no POD; sealed sample copy only |

### Admin

No new R7-D admin screens. Governance remains via existing lab partner acceptance; no CoC history mutation.

---

## 6. Security / RLS

- Lab A ↛ Lab B on transport, accession, processing APIs (e2e verified).
- Customer ↛ internal processing endpoints (403 on `/lab/processing` for non-lab actor).
- Phlebotomist/customer cannot start bench processing.
- Rider CoC transitions use `workerTenantContext` from job payload (no direct `LabSample` read outside tenant).
- `lab_sample_coc_events` remain append-only (no UPDATE/DELETE policies).
- `FORCE RLS` on `lab_accessions`, `lab_processing`.

---

## 7. Tests & regression (28 Aug 2026)

| Suite | Result |
|-------|--------|
| API | **64/64** suites · **153/153** tests PASS |
| R7-D e2e | `r7d.transport-accession-processing.e2e.spec.ts` PASS |
| R7-C e2e | `r7c.sample-collection.e2e.spec.ts` PASS |
| R7-B / R7-A / R3 / R5 / R6 / RLS | included in API suite PASS |
| Workspace tests | **11/11** projects PASS |
| Typecheck | **20/20** projects PASS |
| web-customer build | PASS |
| web-lab build | PASS |
| mobile-delivery typecheck | PASS |
| mobile-phlebotomist typecheck | PASS |
| mobile (customer) typecheck | PASS |

**R7-D focused coverage:** transport lifecycle · CoC handoff · immutable custody · accession idempotency · duplicate prevention · processing lifecycle · illegal transitions · tenant isolation · unauthorized processing · customer PHI exclusion · pack fail-closed (inherited).

---

## 8. Production boundary

Sandbox transport only (mock carrier). No live money. No LIS/HIS. No pathology or report publish. CoC and accession facts are append-only/immutable where applicable. **STOP** at R7-D — next authorized step is **CR-R7-E-IMPL** (pathology + digital report) only after explicit authorization.
