# 124 — Final pre-R6 blocker verification

**Status:** Verification complete (no R6 coding)  
**Change ID:** **CR-PRE-R6-VERIFY-124**  
**Date:** 27 August 2026  
**Authority:** FINAL VERIFICATION ONLY after [123](123_PRE_R6_BLOCKER_REPAIR_IMPLEMENTATION.md). **No R6, CMS/CRM/Lab/Radiology, live money/carriers, automatic refill, production LiveKit, or unrelated product changes.**

**Inputs:** [122](122_PRE_R6_GLOBAL_READINESS_AUDIT.md) · [123](123_PRE_R6_BLOCKER_REPAIR_IMPLEMENTATION.md) · live `worldpharma_test` DB · consecutive `api:test` · workspace regression.

---

## 0. FINAL STATUS

### **PRE_R6_WITH_BLOCKERS**

| Blocker | Verdict |
|---------|---------|
| **P1-1** FORCE RLS | **CLOSED** |
| **P1-2** API test determinism | **OPEN** |
| **P1-4** Topology R4 status | **CLOSED** |

**Why not PRE_R6_GREEN:** Book 122 / CR-123 require **three consecutive** `api:test` runs to pass without retry. This verification recorded:

| Run | Result |
|-----|--------|
| Run 1 | **136/136** (52 suites) — PASS |
| Run 2 | **136/136** (52 suites) — PASS |
| Run 3 | **134/136** (1 suite failed) — **FAIL** |

Per CR gate rule: **any failed run ⇒ P1-2 remains OPEN.**

> **Follow-up:** Test isolation fixed under [125](125_PRE_R6_TEST_DETERMINISM_FIX.md) (**CR-PRE-R6-DETERMINISM-FIX-125**, **PRE_R6_DETERMINISTIC** — three consecutive 136/136).

**R6: NOT STARTED.**

---

## 1. P1-1 — FORCE RLS (CLOSED)

### Migrations applied (live test DB)

| Migration | Applied |
|-----------|---------|
| `20260827195000_pre_r6_force_rls` | **Yes** |
| `20260827195100_pre_r6_rider_presence_grant` | **Yes** |
| Total finished migrations | **43** |

### Role

| Attribute | Value |
|-----------|-------|
| `worldpharma_app.rolsuper` | **false** (NOSUPERUSER) |
| `worldpharma_app.rolbypassrls` | **false** (NOBYPASSRLS) |

### Per-table matrix (queried from `pg_class` / `pg_policies` / grants)

| Table | ENABLE RLS | FORCE RLS | Policy | GRANT to worldpharma_app | Tenant / exception notes |
|-------|------------|-----------|--------|--------------------------|---------------------------|
| `rider_presence` | Yes | Yes | `rider_presence_access` ALL | DELETE,INSERT,SELECT,UPDATE | person / org; worker+platform |
| `prescriptions` | Yes | Yes | `prescriptions_access` ALL | DELETE,INSERT,SELECT,UPDATE | patient/doctor/org; worker+platform |
| `prescription_versions` | Yes | Yes | `prescription_versions_access` ALL | DELETE,INSERT,SELECT,UPDATE | via prescription join |
| `prescription_lines` | Yes | Yes | `prescription_lines_access` ALL | DELETE,INSERT,SELECT,UPDATE | via prescription join |
| `prescription_status_history` | Yes | Yes | `prescription_status_history_access` ALL | DELETE,INSERT,SELECT,UPDATE | via prescription join |
| `dispensing_cases` | Yes | Yes | `dispensing_cases_access` ALL | DELETE,INSERT,SELECT,UPDATE | org / patient / doctor; worker+platform |
| `dispense_events` | Yes | Yes | `dispense_events_access` ALL | DELETE,INSERT,SELECT,UPDATE | case join / actor |
| `dispense_line_mappings` | Yes | Yes | `dispense_line_mappings_access` ALL | DELETE,INSERT,SELECT,UPDATE | case join |
| `rx_commerce_handoffs` | Yes | Yes | `rx_commerce_handoffs_access` ALL | DELETE,INSERT,SELECT,UPDATE | customer / worker+platform |
| `refill_requests` | Yes | Yes | `refill_requests_access` ALL | DELETE,INSERT,SELECT,UPDATE | customer / doctor / pack |
| `refill_request_history` | Yes | Yes | `refill_request_history_access` ALL | DELETE,INSERT,SELECT,UPDATE | via request |
| `rx_subscriptions` | Yes | Yes | `rx_subscriptions_access` ALL | DELETE,INSERT,SELECT,UPDATE | customer; auto-execute inert in app |

**No `USING (true)` workaround** observed on these policies. Isolation predicates preserved.

### Negative isolation evidence (this verification window)

Executed as part of API suite (included in Runs 1–2 full green; Run 3 failed elsewhere, not RLS):

| Check | Suite / evidence |
|-------|------------------|
| Missing tenant context fail-closed | `rls.tenancy.e2e` |
| Cross-org / cross-person (rider) | `rls.tenancy.e2e` rider_presence cases |
| Cross-location / unauthorized store | `r3.isolation.e2e` (T-LOC, T-ORG, T-INV) |
| Cross-customer / unauthorized doctor | R5 prescription / dispensing / refill e2e |
| Company scope / worker scope | `rls.tenancy.e2e` + company-authority e2e |
| Client headers non-authoritative | `rls.tenancy.e2e` source assert; interceptor has no `x-organization-id` / `x-country-id` |

---

## 2. P1-2 — Test determinism (OPEN)

### Consecutive `api:test` (no retry-to-pass)

| Run | Suites | Tests | Open-handle warning | Nx flaky flag | Exit |
|-----|--------|-------|---------------------|---------------|------|
| **1** | 52 passed / 52 | **136 passed / 136** | No | No | 0 |
| **2** | 52 passed / 52 | **136 passed / 136** | No | No | 0 |
| **3** | 1 failed, 51 passed / 52 | **2 failed, 134 passed / 136** | No | Yes | 1 |

### Open-handle / leak check

Across all three runs: **no** Jest “did not exit one second” warning; **no** force-exit. CR-123 Prisma lifecycle fix (skip per-suite disconnect + `jest-after-env` teardown) remains effective for handle hygiene.

### Run 3 failure — exact root cause

**Suite:** `src/clinical/prescription.e2e.spec.ts` (R5-A/B)  
**Tests:**  
1. `covers create/issue/amend/isolation/consent/pack/restriction/idempotency/commerce/admin/erx`  
2. `R5-B: context endpoint, customer hides DRAFT, store contract prep, no commerce`

**Error:** Postgres `23P01` — exclusion constraint `appointments_no_overlap`  
**Site:** `seedDoctorPatient` → `prisma.appointment.create` at `prescription.e2e.spec.ts:135` with `startsAt = new Date()` and +30 minutes.

**Mechanism:** Consecutive suite runs reuse a persistent doctor profile in the shared test DB. Appointments seeded ~1 minute apart still **overlap** the 30-minute window, so the third run collides with rows from the second run. This is **test fixture non-isolation**, not a FORCE RLS or Nest lifecycle regression.

**`20260827195100` GRANT:** Confirmed applied; `rider_presence` has SELECT/INSERT/UPDATE/DELETE for `worldpharma_app`. Run 3 did **not** fail on rider_presence.

### Gate ruling

P1-2 **cannot** be declared closed under CR-124 rules until **3/3** consecutive full API suites pass without retry. Remaining work (out of this CR): make prescription e2e appointment seeding non-overlapping (unique offset / cleanup) — **not implemented here**.

---

## 3. P1-4 — Topology status (CLOSED)

Inspected `apps/api/src/identity/app-topology.ts`:

| App | Metadata |
|-----|----------|
| Doctor mobile (`APP-DOC-M`) | R4 telemedicine sandbox implemented (mock default); production LiveKit NOT enabled; production telemedicine NOT ready |
| Doctor web (`APP-DOC-W`) | Same (plus R5 prescribing/refill under pack gates) |

**Absent:** any “R4 not started” string on doctor clients.  
**Regression test present:** `app-topology.spec.ts` → `records R4 sandbox as implemented without claiming production telemedicine` (no new test added in this CR).

---

## 4. Full regression (exact)

### Workspace `nx run-many -t test` (after consecutive runs; single aggregate)

| Project band | Suites | Tests |
|--------------|--------|-------|
| shell-core | 4 passed | 12 passed |
| ui-kit | 4 passed | 10 passed |
| shell-web | 2 passed | 3 passed |
| config | 1 passed | 5 passed |
| shared | 2 passed | 6 passed |
| web-customer | 5 passed | 8 passed |
| web-admin | 9 passed | 12 passed |
| web-doctor | 1 passed | 2 passed |
| mobile-doctor | 2 passed | 8 passed |
| mobile | 2 passed | 4 passed |
| api | **52 passed** | **136 passed** |
| **Aggregate** | **Successfully ran for 11 projects** | |

### Targeted clinical / isolation suites

Covered inside the API suite totals above when green:

| Area | Spec | Notes |
|------|------|-------|
| RLS tenancy | `tenancy/rls.tenancy.e2e.spec.ts` | PASS in Runs 1–2 and workspace run |
| R3 isolation | `partner/r3.isolation.e2e.spec.ts` | PASS when suite green |
| R5-A / R5-B | `clinical/prescription.e2e.spec.ts` | **FAIL in consecutive Run 3** (overlap); PASS in workspace single run |
| R5-C | `clinical/dispensing.e2e.spec.ts` | PASS when suite green |
| R5-D | `clinical/rx-handoff.e2e.spec.ts` | PASS when suite green |
| R5-E | `clinical/refill.e2e.spec.ts` | PASS when suite green |

### Typecheck / builds

| Check | Result |
|-------|--------|
| Typecheck 11 projects (api + 6 web + 4 mobile) | **Successfully ran** |
| Web builds 6 projects | **Successfully ran** (all compiled) |
| Mobile store / EAS release builds | **Not run** — typecheck only; no production store claim |

---

## 5. Security / MNC (unchanged)

| Invariant | Evidence |
|-----------|----------|
| Company → Region → Country → LE → BU → Org → Location | Governance models + admin surfaces unchanged |
| Partners cannot become company admins | `partner.service` forbid company roles |
| Client tenant headers non-authoritative | No `x-organization-id` / `x-country-id` in tenant interceptor |
| Clinical access = relationship + consent + policy + RLS | Prescription/dispensing/refill paths + policies |
| BU membership gap | Still open (R15) — **not** a CR-123 three-blocker item |

---

## 6. Production boundaries (verified OFF)

| Boundary | State | Evidence |
|----------|-------|----------|
| PSP live | **OFF** | `MockPaymentGatewayAdapter` |
| DHL / live carrier | **OFF** | `MockCarrierAdapter`; worker log `live_dhl: false` |
| Vendor / affiliate / bank payout | **OFF** | `MockPayoutAdapter` |
| Production LiveKit | **OFF** | Creds optional; mock default; topology text |
| Recording | **OFF** | `recordingEnabled: false` in providers |
| Automatic refill execution | **OFF** | `tryExecuteDueSubscriptions` → `auto_execute_disabled_ed_r5e_01` |
| Live e-Rx | **OFF** | `NullERxAdapter`; pack default `rx_erx_enabled: false` |

---

## 7. Decision

**FINAL STATUS = PRE_R6_WITH_BLOCKERS**

| Remaining blocker | Exact reason |
|-------------------|--------------|
| **P1-2** API suite determinism | Consecutive Run 3 failed: `appointments_no_overlap` when `prescription.e2e` seeds `startsAt = new Date()` against a reused doctor profile after prior runs left overlapping appointments. Must achieve **3/3** green consecutive full-suite runs (fixture isolation fix) before PRE_R6_GREEN. |

P1-1 and P1-4 are closed. Do **not** authorize R6 implementation from this verification.

**Recommended next engineering CR (not started):** repair prescription e2e appointment seeding / cleanup for non-overlap across consecutive suite invocations; re-run CR-124 consecutive gate.

---

## 8. Document control

| Action | Status |
|--------|--------|
| Create `docs/blueprint/124_PRE_R6_FINAL_VERIFICATION.md` | **This document** |
| Update master index / roadmap references | **Companion edits only** |
| R6 / product code / migrations | **NONE** in this CR |

---

## Final declaration

**FINAL STATUS: PRE_R6_WITH_BLOCKERS**

**R6: NOT STARTED**

**STOP.**
