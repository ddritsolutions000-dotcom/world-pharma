# 137 — Post-R6-E ecosystem audit & R6-F readiness

**Status:** Audit only — **no R6-F coding**  
**Change ID:** **CR-POST-R6-E-AUDIT-137**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_E_GREEN_R6_F_READY**

**Canonical inputs:** [136](136_R6_E_VENDOR_SETTLEMENT_SUPPORT_IMPLEMENTATION.md) · [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [135](135_POST_R6_D_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authority:** Verify repository after R6-E. Classify R6-F readiness. **Do not** implement R6-F/R7+. **Do not** add features, migrations, or delete files.

---

## 0. Verdict

R6-E deliverables verified against Books 126 §28 / §6 and Book 136. Full API regression green. Seller-scoped settlement list/detail, shared support correlation, shared notification prefs/inbox, and admin settlement-line oversight match the claimed implementation. Additive settlement RLS migration is scoped (no `USING(true)`). Live money/clinical execution remain OFF. R6-F (isolation/RLS attestation + pack gates + acceptance) can be authorized via a separate **CR-R6-F-*** — **not started by this audit**.

**Engineering blockers for R6-F:** **none.**

---

## 1. R6-E verification (Book 136 ↔ repo)

| Requirement | Result |
|-------------|--------|
| Vendor settlement list | **PASS** — `GET /vendor/settlements?seller_org_id=` + `assertVendorSellerAccess` + enriched presenter |
| Vendor settlement detail | **PASS** — `GET /vendor/settlements/:id`; period, fees, order/payable correlation, sandbox flags |
| Seller-scoped access | **PASS** — app assert + RLS `can_org(seller_org_id)` on lines |
| Support ticket integration | **PASS** — `VendorSupportController` → shared `SupportService` |
| Correlation refs | **PASS** — `order` \| `settlement_line` \| `shipment` \| `account` with ownership checks |
| Notification preferences | **PASS** — `settlement_updates` / `support_updates` on shared prefs |
| Notification inbox | **PASS** — shared `/me/notifications/inbox`; support ack enqueues generic body |
| Admin settlement-line oversight | **PASS** — `GET /admin/finance/settlement-lines` (`finance:read`) + web-admin panel |
| Sandbox finance boundary | **PASS** — `sandbox: true`, `live_payout: false`; payout rows not loaded on vendor detail |
| web-vendor UX | **PASS** — settlements detail + support + notifications live; audit still R6-F placeholder |

---

## 2. R6-E additive RLS migration audit

**Migration:** `packages/database/prisma/migrations/20260827210000_r6e_settlement_vendor_rls/`  
**Nature:** Policy DROP/CREATE only — **no** table/column changes. **Not modified by this audit.**

| Check | Result |
|-------|--------|
| `worldpharma_app` NOSUPERUSER | **PASS** (`rolsuper=false`) |
| `worldpharma_app` NOBYPASSRLS | **PASS** (`rolbypassrls=false`) |
| ENABLE + FORCE on settlement_lines / batches / periods / policies / vendor_payables / payouts / orders / orgs / memberships | **PASS** |
| Seller line visibility | **PASS** — `app.can_org(seller_org_id)` (+ company country via payable) |
| Vendor A ↛ Vendor B lines | **PASS** — R6-E e2e + `can_org` |
| `USING(true)` / `WITH CHECK(true)` on settlement* | **PASS** — **0** such policies |
| Writes platform/worker only | **PASS** — all settlement `WITH CHECK (is_worker OR is_platform)` |
| Cross-tenant via support/detail | **PASS** — ownership asserts + RLS hide |

**Observation (non-blocking; R6-F attestation):** `settlement_batches_access` allows company-scope read without an explicit `can_country` predicate (broader than periods/policies). Does **not** grant Vendor A→B. Formal attestation package should record/tighten if desired under **CR-R6-F-***.

---

## 3. Regression (exact; no retry-to-pass)

| Check | Result |
|-------|--------|
| `nx test api` | **57** suites / **57**; **141** tests / **141**; exit **0** |
| Coverage includes | RLS tenancy · R3 isolation · R5-A…E · R6-A…**E** · finance · payments · logistics · identity |
| Typecheck | **18 / 18** |
| Web builds | **web-vendor**, **web-customer**, **web-admin**, **web-store**, **web-doctor**, **web-join** — **6 / 6** |
| Mobile typecheck | Included in 18 — green |
| Migrations pending (`worldpharma_test`) | **0** (schema up to date; **44** applied) |

R0–R5 and R6-A…D remain covered by the same API suite (no suite removals / weakened assertions observed).

---

## 4. Security / PHI

| Check | Result |
|-------|--------|
| Settlement/support/notification DTOs exclude diagnosis / clinical notes / Rx instructions / raw clinical JSON / `customer_person_id` | **PASS** (presenter + R6-E PHI regex) |
| Payment secrets on vendor settlement DTO | **PASS** — absent; payouts not included for vendor detail |
| Rx-origin | Prior R6-D `presentVendor` still opaque/`rx_origin` only — unchanged by R6-E |
| Vendor cannot gain `company_*` / admin finance authority | **PASS** — vendor routes use seller membership; admin settlement-lines require `finance:read` + admin audience |
| Vendor A ↛ B settlements / support correlation | **PASS** |
| Store / Delivery-only permissions | **PASS** — vendor paths require `OrganizationKind.VENDOR` + membership |
| Tenant headers non-authoritative | **PASS** — server `buildUserTenantContext` |
| Dev-access bypass in web-vendor | **None** |

---

## 5. File hygiene (R6-E; no deletion)

| PATH | Classification | Rec |
|------|----------------|-----|
| `finance/finance.service.ts` | Extended presenter/list/detail/admin list | **KEEP** |
| `finance/vendor.controller.ts` | Detail route | **KEEP** |
| `finance/admin.controller.ts` | settlement-lines oversight | **KEEP** |
| `platform/vendor-support.controller.ts` | Thin vendor entry on shared support | **KEEP** |
| `platform/notification.service.ts` / `support.service.ts` / `redis.service.ts` | Pref keys + ensureConnected | **KEEP** |
| `finance/r6e.vendor.e2e.spec.ts` | Focused e2e | **KEEP** |
| `web-vendor` settlements/support/notifications panels + shell | Live R6-E UX | **KEEP** |
| `web-admin/vendor-settlements.tsx` | Now admin oversight (was prior orphan debt) | **KEEP** |
| Duplicate Finance/Support/Notification kernels | **None** | — |
| Temp / fix / copy / r6e-fix sources | **None** found | — |

**Future cleanup only (not executed):** prior Book 133 orphaned `web-admin` vendor catalog/inventory (+ specs) — optional separate hygiene CR. **Not** R6-E regressions.

---

## 6. Database / migration status

| Item | Result |
|------|--------|
| R6-E schema change | **None** (tables unchanged) |
| R6-E migrations | **Exactly 1** additive: `20260827210000_r6e_settlement_vendor_rls` |
| Duplicate settlement/order/payment tables | **None** |
| Pending migrations | **0** |

---

## 7. UI audit (`web-vendor`)

| Area | Result |
|------|--------|
| Settlements list + detail | Live |
| Support create/list + refs | Live (clinical paste client guard) |
| Notifications prefs + inbox | Live |
| Catalog / pricing / inventory / orders / fulfill / shipments | Intact (R6-B/C/D) |
| Profile | Live membership context (R6-A) |
| Audit / activity tab | Placeholder → **R6-F** |
| Loading / empty / form error / not-found | Panel-local |
| 401 / 403 / session / network | Shell `handleApiError` + SessionExpired / PermissionDenied / NetworkError |
| Responsive / a11y foundations | ui-kit |
| i18n | Architecture only (English) — same as prior R6 |

---

## 8. Production boundaries (still OFF)

| Capability | Status |
|------------|--------|
| Live PSP | **OFF** (sandbox payment kernel) |
| Real vendor payouts | **OFF** (`live_payout: false`; mock execute) |
| Affiliate payouts | **OFF** |
| Live DHL / carriers | **OFF** (mock carrier) |
| Production LiveKit | **OFF** (topology + mock default) |
| Recording | **OFF** |
| Automatic refill execution | **OFF** |
| Live e-Rx | **OFF** |

Sandbox finance copy remains explicit in vendor/admin settlement UI and API messages.

---

## 9. R6-F readiness (Book 126 §28 / §21 / §27)

**Exact R6-F scope:** Isolation/RLS attestation + pack gates + acceptance.

| Prerequisite | Classification | Notes |
|--------------|----------------|-------|
| R6-A…E foundation | **READY** | Books 128–136 |
| Seller A↛B isolation coverage (offers/inventory/orders/settlements/support) | **READY** | e2e suite exists; R6-F may expand negatives |
| Formal RLS attestation package (role flags, FORCE, policy inventory) | **PARTIAL** | Facts verified here; packaged acceptance doc = R6-F |
| Settlement RLS residual review | **PARTIAL** | Seller read fixed; company batch-scope observation above |
| Country pack marketplace enablement gates | **PARTIAL** | Pack services exist; formal gate matrix/acceptance = R6-F |
| Measurable R6 acceptance §27 (end-to-end seller journey attestation) | **PARTIAL** | Capabilities present; formal accept checklist = R6-F |
| Audit / activity vendor surface | **PARTIAL** | Shell placeholder |
| Admin marketplace moderation depth | **PARTIAL** | Settlement oversight done; broader moderation polish optional |
| Live payout / real money | **BLOCKED** (correctly) | Remain gated behind **R14** / legal — **do not enable in R6-F** |
| Vendor mobile / Partner App / R7+ | Out of scope | Forbidden |

**Overall R6-F:** **READY** to authorize **CR-R6-F-*** as an **attestation / pack-gate / acceptance** phase — not a live-money phase. No blocked engineering prerequisites.

---

## 10. Legal / human

| Bucket | Items |
|--------|-------|
| Engineering | **None** for R6-E green or R6-F start |
| Product | PD-R6F-01 acceptance evidence depth; PD-R6F-02 audit activity surface |
| Human governance | Authorize **CR-R6-F-*** before coding |
| Legal / compliance | MoR · payout KYC · seller contracts — OPEN where previously OPEN; R14 for live settlement |

---

## 11. Explicit non-starts

- R6-F / R7+ production code  
- Migrations / deletions / cleanup CR execution  
- Live PSP / carriers / payouts / LiveKit / recording / auto-refill / live e-Rx  

---

## Final declaration

**FINAL STATUS: R6_E_GREEN_R6_F_READY**

**R6-F NOT STARTED.**  
**R7+ NOT STARTED.**

**STOP.**
