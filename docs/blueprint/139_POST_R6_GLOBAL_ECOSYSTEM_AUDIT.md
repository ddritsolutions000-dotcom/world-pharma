# 139 — Post-R6 global ecosystem current-state audit

**Status:** Audit only — **no R7+ coding**  
**Change ID:** **CR-POST-R6-GLOBAL-AUDIT-139**  
**Date:** 27 August 2026  
**FINAL STATUS:** **ECOSYSTEM_R6_COMPLETE_R7_READY_FOR_PLANNING**

**Authority:** Read-only inspection + documentation. **Do not** implement R7+, create migrations, delete files, enable live money/carriers/LiveKit/auto-refill/live e-Rx, or invent CMS/CRM/Lab/Radiology products.

**Canonical inputs:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) · [138](138_R6_F_VENDOR_MARKETPLACE_ACCEPTANCE_IMPLEMENTATION.md) · [137](137_POST_R6_E_AUDIT.md) · [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md) · `apps/api/src/identity/app-topology.ts` · `apps/*` · `packages/database/prisma`

---

## 0. Verdict

R0–R6 engineering waves are present and regression-green. Vendor marketplace sub-phases **R6-A…F are complete**. No app is **PRODUCTION-READY**. Live money, carriers, production telemedicine, automatic refill, and live e-Rx remain **OFF**. Lab / radiology / CMS product / CRM product / care navigation remain **PLANNED**.

**R7 (Laboratory diagnostics) is READY FOR PLANNING only** — not implementation authorization. Legal/human ODs remain open and must be separated from engineering planning.

| Gate | Result |
|------|--------|
| R0–R6 slices in repo | **PASS** |
| API regression (exact) | **58/58** suites · **142/142** tests |
| Typecheck | **18/18** |
| Web builds (product surfaces) | **6/6** |
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **PASS** |
| Settlement/USING(true) residual | **0** `USING(true)` policies |
| Production-ready claim | **FAIL** (none — expected) |
| R7 coding | **NOT STARTED** |

---

## Classification legend

| Label | Meaning |
|-------|---------|
| **PRODUCTION-READY** | Live money/carriers/legal — **none** |
| **FUNCTIONAL** | Usable end-to-end in sandbox with real API |
| **FOUNDATION** | Core paths work; product incomplete |
| **SANDBOX** | External live systems mocked / gated |
| **IMPLEMENTED** | Domain code present and wired |
| **PARTIAL** | Kernel or UI incomplete vs roadmap |
| **PLANNED** | Topology/docs only; no app folder or domain module |
| **DEFERRED** | Explicitly postponed |
| **NOT STARTED** | No meaningful code |

---

## 1. Application inventory (`apps/*`)

| Surface | Path | Classification | Notes |
|---------|------|----------------|-------|
| Customer web | `apps/web-customer` | **FOUNDATION** + **SANDBOX** commerce | OTP; catalog/cart/pay/order; Rx/refill UX; not production money |
| Customer mobile | `apps/mobile` | **FOUNDATION** | Expo RN; typecheck green; not store-ready |
| Doctor web | `apps/web-doctor` | **FOUNDATION** + **SANDBOX** tele | Prescribe under packs; LiveKit mock default |
| Doctor mobile | `apps/mobile-doctor` | **FOUNDATION** | Typecheck only ≠ production |
| Admin | `apps/web-admin` | **FOUNDATION** | Company control plane; finance/partners/clinical admin |
| Store web | `apps/web-store` | **FUNCTIONAL** | Location-scoped ops facade |
| Store mobile | `apps/mobile-store` | **FUNCTIONAL** | Typecheck green; not store-ready |
| Delivery mobile | `apps/mobile-delivery` | **FUNCTIONAL** + **SANDBOX** carrier | Assigned jobs; mock carrier |
| Partner Join | `apps/web-join` | **FUNCTIONAL** | Applicant onboarding; pack-gated |
| Vendor web | `apps/web-vendor` | **FUNCTIONAL** + **SANDBOX** finance | R6-A…F complete (topology string still says FOUNDATION — drift) |
| DS playground | `apps/ds-web` | **FOUNDATION** (internal) | Design-system playground; not a product surface |
| API monolith | `apps/api` | **IMPLEMENTED** / **SANDBOX** edges | Single Nest modular monolith |

### Planned (no `apps/` folder)

| Surface | Topology id | Status |
|---------|-------------|--------|
| Lab web | APP-LAB-W | **PLANNED** |
| Lab staff mobile | APP-LAB-M | **PLANNED** |
| Phlebotomist mobile | APP-PHE-M | **PLANNED** |
| Pathologist web | APP-PATH-W | **PLANNED** |
| Radiologist web / imaging mode | (OD-RAD) | **PLANNED** |
| Logistics/Ops dedicated web | APP-OPS-W | **PLANNED** (admin logistics shell exists) |
| Affiliate web | APP-AFF-W | **PLANNED** (`me/affiliate` foundation only) |
| Affiliate mobile | Forbidden / **DEFERRED** | Explicitly forbidden |

**None** of the planned Lab/Radiology/Ops/Affiliate apps are implemented.

---

## 2. Domain / kernel inventory

| Domain | Classification | Evidence |
|--------|----------------|----------|
| Identity | **IMPLEMENTED** | OTP/JWT/audiences/memberships |
| Partner / Join / KYC | **IMPLEMENTED** | Partner module + web-join |
| MNC / policy packs | **IMPLEMENTED** | PolicyResolver; fail-closed empty pack |
| Catalog / pricing | **IMPLEMENTED** | Admin + vendor + customer |
| Inventory | **IMPLEMENTED** | Lots/GRN/transfers + store/vendor |
| Cart / Checkout | **IMPLEMENTED** | Sandbox quotes |
| Payment | **SANDBOX** | Mock PSP; `sandbox: true` |
| Orders / fulfillment | **IMPLEMENTED** | State machine + vendor fulfill |
| Logistics | **SANDBOX** | Mock carrier; no live DHL |
| Finance / ledger / settlements | **SANDBOX** | Mock payout; `live_payout: false` |
| Doctor / appointments / consent | **IMPLEMENTED** (pack-gated) | Clinical module |
| Video | **SANDBOX** | Mock default; production LiveKit not claimed |
| Prescription (R5-A/B) | **IMPLEMENTED** (pack-gated) | |
| Dispensing (R5-C) | **IMPLEMENTED** (pack-gated) | |
| Rx commerce (R5-D) | **IMPLEMENTED** | Order-from-Rx |
| Refill (R5-E) | **PARTIAL** / **SANDBOX** | UX + gates; **auto-execute OFF** |
| Vendor marketplace (R6) | **IMPLEMENTED** + **SANDBOX** | R6-A…F |
| Support | **FOUNDATION** | Redis ticket kernel + vendor wiring — **not** full helpdesk |
| Notifications | **FOUNDATION** | Prefs + inbox + outbox path — **not** multi-channel product |
| CRM | **NOT STARTED** | No CRM product UI/module |
| CMS | **NOT STARTED** | No CMS authoring product |
| Marketing | **NOT STARTED** | Pref flag only |
| Search | **PARTIAL** | Catalog search service |
| Analytics warehouse | **NOT STARTED** | |
| Radiology | **NOT STARTED** | |
| Lab / CoC / Pathology | **NOT STARTED** | |
| Health record UX | **PARTIAL** | Consent + artifacts foundations; no full timeline product |
| Care navigation | **NOT STARTED** | |

**Duplicate kernels:** **None** observed for identity, payment, notification, support, finance, or catalog. Single Nest API + shared packages.

---

## 3. R0–R6 regression (exact; no retry-to-pass)

| Wave | Evidence | Result |
|------|----------|--------|
| R0 | Identity/partner/policy suites in API | Covered by full API |
| R1 | Cart/payment/order/logistics/finance e2e | Covered by full API |
| R2 | Doctor/appointment/video | Covered by full API |
| R3 | `r3.isolation.e2e` | **1/1** suite · **13/13** tests |
| R4 sandbox | Video + topology assertions | Covered by full API |
| R5-A…E | prescription/dispensing/rx-handoff/refill | **4/4** suites · **6/6** tests (focused) |
| R6-A…F | `r6a`…`r6f` vendor e2e | **6/6** suites · **6/6** tests |
| Full API | `nx test api` | **58/58** suites · **142/142** tests · exit **0** |

---

## 4. Security / tenancy

| Check | Result |
|-------|--------|
| `worldpharma_app.rolsuper` | **false** (NOSUPERUSER) |
| `worldpharma_app.rolbypassrls` | **false** (NOBYPASSRLS) |
| Public tables with ENABLE RLS | **156** / FORCE RLS **156** |
| Policies with `USING(true)` / `WITH CHECK(true)` | **0** / **244** total |
| Tenant headers authoritative | **No** — server `buildUserTenantContext` |
| Vendor A ↛ B | **PASS** (R6 + isolation e2e) |
| Store / customer / doctor isolation | **PASS** (R3 + RLS suites) |
| Company vs partner | **PASS** — vendors lack `company_*`; admin audience required for finance ops |

Focused RLS suite: **1/1** · **10/10**.

---

## 5. Healthcare / PHI

| Check | Result |
|-------|--------|
| Vendor DTOs exclude diagnosis/notes/Rx instructions/`customer_person_id` | **PASS** (R6-D/E presenters + tests) |
| Support tickets — clinical paste discouraged; no clinical record copy | **PASS** (foundation) |
| Notification bodies generic | **PASS** |
| Outbox envelope redacts clinical/token patterns | **PASS** (`events/envelope.ts`) |
| Autonomous diagnosis / auto-Rx / silent substitution | **OFF** |
| Automatic refill execution | **OFF** (`auto_execute_disabled`) |
| Admin clinical access | Permission-gated; not unrestricted |

Residual risk (non-blocking): humans can still paste clinical text into free-text support fields — product copy warns; not a second clinical store.

---

## 6. Commerce / money boundary

Flow present: **catalog → cart → quote → payment → order → fulfillment → shipment → finance**.

| Capability | Status |
|------------|--------|
| Live PSP | **OFF** |
| Real vendor/affiliate payouts | **OFF** (`live_payout: false`) |
| Live DHL / carriers | **OFF** (mock) |
| Real COD bank settlement | **OFF** |
| Production tax/FX engines | **OFF** / pack snapshots only |

Sandbox/mock is explicit in API messages and vendor/admin finance copy.

---

## 7. Healthcare boundary

| Capability | Status |
|------------|--------|
| Telemedicine | **SANDBOX** (mock default; production LiveKit not enabled) |
| Recording | **OFF** (`recording_allowed` fail-closed) |
| Live e-Rx | **OFF** (pack `rx_erx_enabled` default false) |
| Lab | **NOT STARTED** |
| Radiology | **NOT STARTED** |
| Care navigation | **NOT STARTED** |

---

## 8. UI / frontend completeness (summary)

| App | Auth | Nav | States (load/empty/err/401/403/session/net) | Real API | RN / store readiness |
|-----|------|-----|-----------------------------------------------|----------|----------------------|
| web-customer | OTP | Yes | Shell + page states | Yes | N/A web |
| web-doctor | OTP doctor | Yes | Yes | Yes | N/A |
| web-admin | OTP admin | Yes | Yes | Yes | N/A |
| web-store | OTP | Yes | Yes | Yes | N/A |
| web-vendor | OTP | Full R6 IA | Yes | Yes | N/A |
| web-join | Applicant | Yes | Yes | Yes | N/A |
| mobile* | Expo shells | Partial vs web | ui-kit native states | Partial | **Typecheck ≠ App Store/Play readiness** |
| ds-web | Local DS | Playground | N/A product | N/A | Internal |

**Missing vs roadmap products:** Lab/Pathologist/Radiologist/Ops/Affiliate dedicated UIs; full CMS/Help Center; full health timeline; care navigation intake.

**Android/iOS:** Expo projects exist; **no** production store release evidence in this audit. Mobile automated tests: **NOT RUN** (no mobile Jest target exercised here).

---

## 9. File hygiene (report only — no deletion)

| PATH | Status | Refs | Rec | Risk |
|------|--------|------|-----|------|
| `web-admin/src/vendor-catalog.tsx` (+ spec) | Orphan UI (Book 133) | Specs only | **DELETE** (future CR) | Low |
| `web-admin/src/vendor-inventory.tsx` (+ spec) | Orphan UI | Specs only | **DELETE** (future CR) | Low |
| `web-admin/src/vendor-orders.tsx` / `vendor-shipments.tsx` | Orphan / superseded | Limited | **DELETE** (future CR) | Low |
| `web-admin/src/vendor-settlements.tsx` | **KEEP** — R6-E admin oversight | Admin finance | **KEEP** | — |
| `web-admin/src/vendor-superseded-notice.tsx` | Notice helper | Orphans | **KEEP** until orphans removed | Low |
| Topology `APP-VEND-W` status FOUNDATION | Doc/code drift vs R6-F | Topology | **UPDATE** string in future CR | Low |
| Duplicate kernels / temp `r6*-fix` sources | **None** found | — | — | — |

---

## 10. Database

| Item | Result |
|------|--------|
| Migration directories | **46** |
| Pending (`worldpharma_test`) | **0** (up to date) |
| Recent | R5-D/E · pre-R6 FORCE RLS · R6-E settlement seller RLS · R6-F batch country scope + norecurse |
| Schema validity | Migrate status OK |
| New domain tables for Lab/Radiology/CMS | **None** |
| Duplicate settlement/order/payment tables | **None** |

---

## 11. Test / build matrix (exact)

| Check | Result | Class |
|-------|--------|-------|
| `nx test api` | **58** suites / **58**; **142** tests / **142** | **PASS** |
| RLS `rls.tenancy` | **1/1** · **10/10** | **PASS** |
| R3 isolation | **1/1** · **13/13** | **PASS** |
| R5 focused | **4/4** · **6/6** | **PASS** |
| R6 focused | **6/6** · **6/6** | **PASS** |
| `ui-kit` | **4/4** · **10/10** | **PASS** |
| `shell-web` | **2/2** · **3/3** | **PASS** |
| `shell-core` | **4/4** · **12/12** | **PASS** |
| `web-admin` | **9/9** · **12/12** | **PASS** |
| `web-customer` | **5/5** · **8/8** | **PASS** |
| Typecheck | **18/18** | **PASS** |
| Web builds (6 product webs) | **6/6** | **PASS** |
| Mobile Jest e2e/device | — | **NOT RUN** |
| Historical API flake under load | Observed intermittently in prior CR runs; this audit’s full `api:test` **PASS** | Note only |

---

## 12. Support / CMS / CRM / Marketing

| Product | Exists | Missing |
|---------|--------|---------|
| Support | Redis ticket kernel; customer + vendor entry; correlation ids | Full helpdesk queues, SLA, agent console, chat product (R11) |
| Notifications | Prefs + inbox + dispatch hooks | Multi-channel production delivery, templates CMS |
| CMS | **Absent** | Authoring, FAQ, KB, banners (R11) |
| CRM | **Absent** | Pipelines, lead store — must not copy clinical payloads |
| Marketing | Pref boolean only | Campaigns, journeys |

---

## 13. Buffer / loading UX

| Finding | Severity |
|---------|----------|
| Shared `LoadingState` is a **generic Spinner** (`packages/ui-kit/src/web/states.tsx`) | **PARTIAL** vs locked “healthcare-contextual loading” rule |
| Vendor panels often use medicine/pharmacy-contextual **labels** on that spinner | Mitigates copy; visual treatment still generic |
| Error/session/network states are distinct (not faked as loading) | **PASS** |

**No redesign in this audit.** Future UX CR may replace spinner treatment without changing operation clarity.

---

## 14. Global completion score (transparent)

Method: each pillar scored **0–10** from evidence above (implemented depth × production boundary). Pillar weight sums to 100%. Score = Σ(weight × pillar/10).

| Pillar | Weight | Score /10 | Rationale |
|--------|--------|-----------|-----------|
| Backend/domain | 20% | **7.5** | R0–R6 domains present; Lab/Rad/CMS/CRM absent |
| Web UI | 15% | **6.5** | Six product webs functional/foundation; planned apps missing |
| Mobile UI | 10% | **4.0** | Expo foundations; not store-ready; tests not run |
| Security/tenancy | 15% | **8.5** | RLS FORCE + isolation green; 0 USING(true) |
| Healthcare | 10% | **6.0** | R4–R5 sandbox; no Lab/Rad/care-nav; auto-refill OFF |
| Commerce | 10% | **7.0** | Full sandbox flow; live PSP OFF |
| Finance | 5% | **6.5** | Ledger + settlements sandbox; live payout OFF |
| MNC/governance | 5% | **8.0** | Packs fail-closed; marketplace gates |
| Support/CMS/CRM | 5% | **2.5** | Support foundation only |
| Production readiness | 5% | **1.0** | Explicitly not production |

**Weighted total ≈ 62%** ecosystem engineering completeness toward the *full* roadmap (including R7–R14).  
**R0–R6 scoped completeness ≈ 90%+** of authorized vendor/commerce/clinical-sandbox slices (subjective within R6 accept criteria; live money excluded by design).

---

## 15. R7 readiness (Laboratory diagnostics)

**Exact R7 scope (Book 93):** Lab catalog, booking, sample collection, CoC, pathology, reports; apps Lab web/mobile, Phlebotomist, Pathologist; depends on R1 job/pay patterns + R0 consent; **not** radiology.

| Prerequisite | Classification | Notes |
|--------------|----------------|-------|
| R0–R6 engineering complete | **READY** | This audit |
| Consent / identity / org patterns | **READY** | Reuse |
| Logistics job pattern (sandbox) | **READY** | Extend types later — not live DHL |
| Payment sandbox pattern | **READY** | Lab booking pay stays sandbox |
| Lab domain schema/module | **BLOCKED** (absent) | Requires R7 IMPL after AUTH |
| Lab/Pathologist/Phlebotomist apps | **BLOCKED** (absent) | |
| Legal: diagnostic marketplace / home collection / e-reports | **PARTIAL** (human) | Separate from eng |
| Radiology | Out of R7 | R8 |

**Overall:** **READY FOR PLANNING** via **CR-R7-AUTH-*** only. **Do not** start R7 coding from this audit.

### Human / legal (separate)

- Diagnostic marketplace / home collection / official reports law  
- MoR / PSP / payout KYC (R14 — still open)  
- OD-RAD-* (R8, not R7)  
- OD-CMS / OD-SUP (R11)  
- OD-CARE-* (R10)  

---

## 16. Recommendation (ONE)

**B. R7 planning** — authorize a **CR-R7-AUTH** laboratory diagnostics implementation plan only (no coding).  

Optional parallel (not auto-started): small hygiene CR for admin orphan vendor panels + topology status string drift.

---

## 17. Explicit non-starts

- **R7 NOT STARTED.**  
- **R8+ NOT STARTED.**  
- **Live money NOT enabled.**  
- **Production telemedicine NOT enabled.**  
- **No automatic refill.**  
- **No live e-Rx.**

---

## Final declaration

**FINAL STATUS: ECOSYSTEM_R6_COMPLETE_R7_READY_FOR_PLANNING**

**R7 NOT STARTED.**  
**R8+ NOT STARTED.**  
**Live money NOT enabled.**  
**Production telemedicine NOT enabled.**  
**No automatic refill.**  
**No live e-Rx.**

**STOP.**
