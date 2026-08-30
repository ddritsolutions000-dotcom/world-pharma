# 127 — Pre-R6-A implementation gate (final readiness audit)

**Status:** Gate / audit only — **no R6 coding authorized by this CR**  
**Change ID:** **CR-PRE-R6-IMPLEMENTATION-GATE-127**  
**Date:** 27 August 2026  
**Canonical plan:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) (**R6_PLAN_READY**)  
**Prerequisite engineering:** [125](125_PRE_R6_TEST_DETERMINISM_FIX.md) (**PRE_R6_DETERMINISTIC**)

**Authority:** Audit repository + database against Book 126 R6-A only. **Do not** implement R6-A/B+. **Do not** create migrations. **Do not** enable live PSP/carrier/payout/LiveKit/auto-refill.

---

## FINAL STATUS

### **R6_A_READY_FOR_IMPLEMENTATION**

R6-A can be implemented **without restructuring** identity, catalog, inventory, cart/quote, payment, order, logistics, finance, RLS, MNC, or R5 Rx kernels.

**This gate does not start coding.** A separate **CR-R6-A-IMPL-*** is still required before any production code for R6-A.

**Engineering blockers for R6-A:** **none.**  
Known gaps below are **the R6-A work itself**, not preconditions that force redesign.

---

## 0. Exact R6-A scope (from Book 126 §28 / §24)

| In R6-A | Out of R6-A (do not silently expand) |
|---------|--------------------------------------|
| Vendor **information architecture** foundation on `apps/web-vendor` (nav/structure, org context, dashboard shell quality) | Catalog **write** UX (R6-B) |
| **DTO hardening** — vendor catalog list snake_case + `{ data }` presenter | Inventory ops UX (R6-C) |
| **`OrganizationKind.VENDOR` filter** on `GET /vendor/organizations` | Order detail + fulfillment actions + Rx-safe presenters (R6-D) |
| **Customer seller display** (public name, not UUID-only) | Settlements detail / support / notifications polish (R6-E) |
| Regression stay green; no live money | Isolation/RLS attestation campaign + pack gates close-out (R6-F) |

---

## 1. Repository audit (actual state vs Book 126)

### 1.1 Surfaces

| Area | Repo truth | Classification vs full R6 |
|------|------------|---------------------------|
| `apps/web-vendor` | Single-route tab shell; real OTP; org picker; read panels for catalog/inventory/orders/shipments/settlements; support = EmptyState | **FOUNDATION / PARTIAL** |
| Vendor APIs | Catalog (read+write), inventory ops, order fulfill transitions, shipment read, settlements list, orgs list | **FUNCTIONAL** (sandbox) |
| Org membership | ACTIVE membership asserts; **no VENDOR-kind filter** on org list | **PARTIAL** |
| Catalog / offers | Kernel intact; vendor list returns **raw Prisma camelCase array** | **PARTIAL** (DTO debt) |
| Inventory | 1B vendor APIs; membership owner asserts; read isolation e2e | **EXISTS** |
| Orders | Vendor list/detail/pick/pack/ready; `present()` without clinical joins | **EXISTS** |
| Settlement / finance | Own `seller_org_id` list; admin finance separate; `live_payout: false` | **EXISTS** (sandbox) |
| Support | Shared Redis support kernel; vendor UI **not wired** | **PARTIAL** (API EXISTS; vendor UX MISSING → R6-E) |
| Notifications | Shared `/me/notifications`; vendor UI **missing** | **PARTIAL** → R6-E |
| Audit / security | Outbox + security events elsewhere; vendor activity screen missing | **PARTIAL** → later R6 |
| RLS / tenant | Server-built GUCs; client headers non-authoritative; FORCE verified on key tables | **EXISTS** |
| MNC | Region → Country → LE → BU → Org → Location in schema; vendor at Organization | **EXISTS** (BU membership still R15 gap — not R6-A) |

### 1.2 Do not treat foundation as R6-complete

Confirmed: Book 126 classification still accurate. Shell ≠ R6 accept.

---

## 2. R6-A feature classification

| Proposed R6-A feature | Status | Evidence / note |
|-----------------------|--------|-----------------|
| Vendor IA — tab/nav shell | **PARTIAL** | `vendor-shell.tsx` tabs; not deep-linkable routes; no profile/security/notifications tabs |
| Vendor IA — org context picker | **PARTIAL** | Works but lists **any** ACTIVE membership org |
| Vendor IA — dashboard counts | **PARTIAL** | Parallel GETs; fragile if catalog DTO shape wrong |
| Vendor IA — loading / empty / 401 / 403 / session expired | **EXISTS** (core paths) | ui-kit states wired in shell |
| Vendor IA — profile / KYC / locations screens | **MISSING** | Deferred beyond minimal R6-A unless IMPL CR explicitly folds thin profile stub |
| DTO hardening — vendor offers presenter snake_case + `{ data }` | **MISSING** | `CatalogService.vendorOffers` returns raw `findMany` |
| DTO hardening — other vendor lists | **EXISTS** / **PARTIAL** | Inventory/settlements snake_case; order nested raw Prisma (R6-D) |
| VENDOR org filter on `GET /vendor/organizations` | **MISSING** | `vendor-profile.controller.ts` — no `kind: VENDOR` |
| Customer seller display name | **MISSING** | `product-detail.tsx` shows `seller_org_id` UUID; public DTO has no display name |
| Catalog write UX | **NOT NEEDED** for R6-A | R6-B |
| Inventory mutate UX | **NOT NEEDED** for R6-A | R6-C |
| Order fulfill UI + Rx presenter | **NOT NEEDED** for R6-A | R6-D |
| Settlement detail / support / notifications UX | **NOT NEEDED** for R6-A | R6-E |
| Live payout / MoR enablement | **NOT NEEDED** / **BLOCKED by policy** | Stay OFF; legal OD separate |
| New identity / Partner App / vendor mobile | **NOT NEEDED** | Forbidden |

**R6-A IMPL must implement the MISSING / PARTIAL rows in-scope above only.**

---

## 3. Vendor security

### 3.1 Isolation (tests + code)

| Check | Result |
|-------|--------|
| Vendor A ↛ Vendor B offers / settlements | **Covered** — `app-isolation.e2e`, catalog/finance e2e |
| Vendor A ↛ Vendor B order read | **Covered** — order e2e 403 |
| Vendor A ↛ Vendor B lots read | **Covered** — inventory e2e 403 |
| Cross-org inventory **mutate** deny | **PARTIAL gap** — expand in R6-C/F (not R6-A blocker) |
| Cross-org fulfill mutate deny | **PARTIAL gap** — expand in R6-D/F |
| Vendor ↛ doctor clinical admin | **Covered** at app isolation level |
| Vendor cannot grant company roles | **EXISTS** — no vendor company-role grant API in vendor controllers |
| Company-global finance via vendor path | **Denied** — settlements membership-gated to `seller_org_id` |

### 3.2 RLS / tenant (live DB attestation on `worldpharma_test`)

| Check | Result |
|-------|--------|
| `worldpharma_app` `rolsuper` | **false** |
| `worldpharma_app` `rolbypassrls` | **false** |
| ENABLE + FORCE on `catalog_offers`, `orders`, `vendor_payables`, `settlement_lines`, `inventory_lots`, `organizations`, `prescriptions`, `memberships` | **true / true** |
| Tenant context | Server-built `buildUserTenantContext` + GUCs (`apply-tenant-gucs.ts`) |
| Client tenant headers | Non-authoritative — `rls.tenancy.e2e` asserts no `x-organization-id` authority |

### 3.3 Negative suite run

Included in full API suite (**§9**): **136/136** passed.

---

## 4. Rx / PHI

| Claim | Result |
|-------|--------|
| Second Rx/dispensing kernel needed for R6-A? | **No** |
| Vendor order `present()` joins Prescription / Encounter / clinical notes? | **No** |
| Opaque ids exposed | `prescription_id`, `dispensing_case_id`, `dispense_event_id` |
| Diagnosis / clinical notes / dosage lines / doctor private profile | **Not loaded** in vendor order include |
| Dedicated `rx_origin` minimum-necessary vendor presenter | **MISSING** → **R6-D**, not R6-A |
| Auto-refill execution | **OFF** (`auto_execute_disabled_ed_r5e_01`; present forces `auto_execute_enabled: false`) |

R6-A must **not** expand PHI surface. Seller display name must remain commercial org display only.

---

## 5. MNC

| Level | Present? |
|-------|----------|
| Global Company | Platform / company membership scope (not a Prisma row) |
| OperatingRegion | Yes |
| Country | Yes |
| LegalEntity | Yes |
| BusinessUnit | Config table yes; **membership wiring deferred R15** |
| Organization (`VENDOR` kind) | Yes — vendor scope |
| Location | Yes |

No India-only / INR/GST hardcoding found as R6-A prerequisite. Country packs remain policy documents. Vendor remains beneath company governance.

**BU membership gap:** product/MNC completeness — **not** an R6-A engineering blocker.

---

## 6. Existing commerce reuse

| Kernel | Reuse for R6 | Duplicate risk |
|--------|--------------|----------------|
| CatalogItem / Offer / CommercialRule | Yes | Must not fork |
| InventoryLot / movements | Yes | Must not fork Store inventory into Vendor |
| Cart / Quote | Customer | Vendor must not reprice |
| PaymentIntent | Sandbox 1D | No vendor PSP kernel |
| Order / Shipment | 1E / 1F | Vendor filter by `sellerOrgId` |
| VendorPayable / Settlement | 1G | Own org only |
| Historical freeze | `takeBpsFrozen` / order snapshots / quote fingerprint | Verified by finance e2e |

R6-A DTO/IA work **must not** introduce parallel pricing or payment modules.

---

## 7. UI readiness (`apps/web-vendor`) — what R6-A must actually implement

| Area | Today | R6-A action |
|------|-------|-------------|
| Authentication | Real OTP audience `customer` | Preserve; no fake auth |
| Organization context | Picker without VENDOR filter | Filter + empty states for non-vendor |
| Dashboard | Count cards | Keep; fix after catalog DTO harden |
| Profile / security / account | Missing | Optional thin stub **only if** IMPL CR includes; else defer |
| Catalog / offers | Read list; snake_case expected | Fix API presenter; list remains read-only in R6-A |
| Inventory / orders / settlement | Read panels | **Do not** build write UX in R6-A |
| Support / notifications | Placeholder / absent | **Out of R6-A** (R6-E) |
| Loading / empty / error / 401 / 403 / expired | Present on shell | Preserve |
| Responsive / a11y | ui-kit foundations | Preserve; no redesign system |
| i18n architecture | `shell-core` i18n available; vendor copy largely hardcoded | Architecture EXISTS; full catalogs not R6-A blocker |
| Customer seller display | UUID | Add public display field + customer PDP |

---

## 8. Database / API — R6-A necessity (do **not** create here)

| Change | Necessary for R6-A? | Notes |
|--------|---------------------|-------|
| New tables | **No** | Org `displayName` already exists |
| New columns | **Likely no** | Prefer present `Organization.displayName` (or pack-safe public label) on public offer DTO |
| New indexes | **No** | |
| API: filter `GET /vendor/organizations` by `OrganizationKind.VENDOR` (+ ACTIVE org) | **Yes** | Additive where-clause |
| API: `vendorOffers` snake_case `{ data }` presenter | **Yes** | Presenter only |
| API: public offer `seller_display_name` (or equivalent) | **Yes** | Additive field on existing public presenter |
| Historical rewrite | **Forbidden** | |

Any additive column beyond display presenters requires an IMPL ADR — not assumed required.

---

## 9. Regression evidence (exact numbers)

Executed for this gate (27 Aug 2026), no production code changes:

| Check | Result |
|-------|--------|
| `nx test api` (full suite) | **52** suites passed / **52**; **136** tests passed / **136**; exit **0** |
| RLS tenancy / R3 isolation / R5-A…E / vendor isolation | Included in API suite — green |
| `nx run-many -t typecheck` | **18** projects successfully ran |
| Web builds | **web-vendor**, **web-customer**, **web-admin**, **web-store**, **web-doctor**, **web-join** — all **Successfully ran** (Next.js compiled) |
| Migrations pending on test DB | **None** (43 migrations applied) |

Note: Nx may still print historical “flaky task” metadata for `api:test` even on clean green runs; this gate records **136/136 pass**, consistent with [125](125_PRE_R6_TEST_DETERMINISM_FIX.md).

---

## 10. Production boundaries (still OFF)

| Boundary | Status | Evidence |
|----------|--------|----------|
| Live PSP | **OFF** | Sandbox payment intents / pack gates |
| Live carrier / DHL | **OFF** | Mock carrier messaging |
| Vendor / affiliate live payouts | **OFF** | `live_payout: false`; sandbox payout stamps |
| Production LiveKit | **OFF** | Topology + env-gated provider; mock default |
| Recording | **OFF** / not enabled as product path | |
| Automatic refill execution | **OFF** | Scheduler inert; pack default false |
| Live e-Rx | **OFF** / pack-gated clinical | Not expanded by R6-A |

---

## 11. Legal / human gates (separated)

### ENGINEERING BLOCKERS (R6-A)

**None.**

### PRODUCT DECISIONS (non-blocking for R6-A start)

| ID | Topic | Guidance |
|----|-------|----------|
| PD-R6A-01 | Thin vendor profile stub in R6-A vs defer | Prefer defer unless IMPL CR expands |
| PD-R6A-02 | Seller public label = org `displayName` vs moderated storefront name | Prefer existing `displayName` until legal/moderation OD |
| PD-R6A-03 | Deep-link routes vs tab shell in R6-A | Either OK; do not expand to R6-B write UX |

### LEGAL / COMPLIANCE (OPEN — do not invent)

| Topic | Status |
|-------|--------|
| Marketplace operator / MoR | Human / legal OD |
| Seller contracts / KYC depth | Human |
| Pharmacy-as-vendor restrictions | Country pack + legal — default: clinical dispense stays Store |
| Tax / consumer protection / refunds | Country pack + legal — not R6-A |
| Data residency / payout KYC | Deferred with live payout (R14) |

### HUMAN GOVERNANCE

| Topic | Status |
|-------|--------|
| Authorize **CR-R6-A-IMPL-*** | Required before coding |
| Phase 0 human sign-off / brand / PSP | Unrelated; remain OPEN where already OPEN |
| Maker/checker for company finance | Preserve; vendor cannot approve company payout |

---

## 12. Decision rationale

R6-A is additive presenter/filter/IA work on existing kernels. Pre-R6 determinism holds. Isolation and RLS foundations are intact. Production money/clinical execution remain OFF. Legal MoR remains a **human** gate for marketplace go-live, **not** an engineering restructure blocker for R6-A sandbox IA/DTO.

Therefore:

### **FINAL STATUS = R6_A_READY_FOR_IMPLEMENTATION**

**Blocker list:** *(empty)*

---

## 13. Explicit non-authorization

| Action | Status |
|--------|--------|
| R6-A coding | **NOT STARTED** — requires **CR-R6-A-IMPL-*** |
| R6-B+ | **NOT STARTED** |
| Migrations / live enablement | **FORBIDDEN** from this CR |

---

## Document control

| Action | Status |
|--------|--------|
| Create `docs/blueprint/127_PRE_R6_A_IMPLEMENTATION_GATE.md` | **This document** |
| Update master index / roadmap | Companion only |
| Production code / migrations | **NONE** |

---

## Final declaration

**FINAL STATUS: R6_A_READY_FOR_IMPLEMENTATION**

**R6-A coding: NOT STARTED by this audit.**  
**R6-B+: NOT STARTED.**  
**Live money / carriers / payouts / production telemedicine / automatic refill: remain OFF.**

**STOP.**
