# 136 — R6-E Vendor settlements + support/notification wiring

**Status:** Implemented (R6-E only)  
**Change ID:** **CR-R6-E-IMPL-136**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_E_IMPLEMENTED**

**Canonical inputs:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [135](135_POST_R6_D_AUDIT.md) (**R6_D_GREEN_R6_E_READY**) · [134](134_R6_D_VENDOR_ORDER_FULFILLMENT_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authority:** Vendor **settlement list/detail**, shared **support** correlation, shared **notification** prefs/inbox wiring, light **admin settlement-line oversight**. **R6-F NOT STARTED. R7+ NOT STARTED.** No live money/carriers/payouts/LiveKit/auto-refill/live e-Rx. No vendor mobile / Partner App / second finance/support/notification kernel / new event bus.

---

## 1. Scope delivered

| Item | Result |
|------|--------|
| Vendor settlement list | Seller-scoped via `assertVendorSellerAccess` + enriched DTO |
| Vendor settlement detail | Period, fees/gross/net, order/payable correlation, sandbox flags |
| Admin oversight polish | `GET /admin/finance/settlement-lines` + web-admin panel |
| Support wiring | `VendorSupportController` on shared `SupportService` |
| Notification wiring | Prefs `settlement_updates` / `support_updates` + inbox (shared kernel) |
| web-vendor UX | Settlements detail + Support + Notifications live tabs |
| Isolation | Vendor A ↛ B settlements/support correlation |
| PHI exclusion | Settlement/support/notification DTOs — no clinical fields |
| Sandbox finance | `sandbox: true`, `live_payout: false` — real bank payout OFF |

---

## 2. Current-state (pre-impl) → gap closed

| Surface | Finding |
|---------|---------|
| `GET /vendor/settlements` | List existed; detail missing → **added** |
| Settlement RLS | Lines/batches/periods were **platform/worker-only** after leftover-auto repair → vendors saw empty lists |
| Support | Shared kernel existed; vendor seller correlation missing → **added** |
| Notifications | Me prefs/inbox existed; settlement/support preference keys missing → **extended** |
| web-vendor | Settlements list-only; support/notifications placeholders → **live** |

---

## 3. Files changed

### API
| File | Change |
|------|--------|
| `apps/api/src/finance/finance.service.ts` | `presentVendorSettlementLine`, detail getter, admin `listSettlementLines` |
| `apps/api/src/finance/vendor.controller.ts` | `GET /vendor/settlements/:id` |
| `apps/api/src/finance/admin.controller.ts` | `GET /admin/finance/settlement-lines` |
| `apps/api/src/platform/vendor-support.controller.ts` | **New** vendor support entry (shared kernel) |
| `apps/api/src/platform/platform.module.ts` | Register vendor support controller |
| `apps/api/src/platform/notification.service.ts` | Pref keys + Redis ensureConnected |
| `apps/api/src/platform/notification.controller.ts` | Patch prefs for new keys |
| `apps/api/src/platform/support.service.ts` | Redis ensureConnected |
| `apps/api/src/app/redis.service.ts` | `ensureConnected()` for lazy clients |
| `apps/api/src/finance/r6e.vendor.e2e.spec.ts` | **New** R6-E e2e |

### Database
| File | Change |
|------|--------|
| `packages/database/prisma/migrations/20260827210000_r6e_settlement_vendor_rls/` | **Additive RLS only** — seller `can_org` SELECT on lines; linked batch/period reads; writes remain platform/worker |

### Web
| File | Change |
|------|--------|
| `apps/web-vendor/src/vendor-api.ts` | Settlement detail + support + notification clients |
| `apps/web-vendor/src/vendor-settlements-panel.tsx` | List + detail UX |
| `apps/web-vendor/src/vendor-support-panel.tsx` | **New** shared-kernel ticket UI |
| `apps/web-vendor/src/vendor-notifications-panel.tsx` | **New** prefs + inbox UI |
| `apps/web-vendor/src/vendor-shell.tsx` | Wire support/notifications into LIVE_TABS |
| `apps/web-admin/src/vendor-settlements.tsx` | Admin settlement-lines oversight (finance:read) |
| `apps/web-admin/src/finance-admin.tsx` | Sandbox settlement oversight copy |

### Docs
| File | Change |
|------|--------|
| `docs/blueprint/136_R6_E_VENDOR_SETTLEMENT_SUPPORT_IMPLEMENTATION.md` | This document |
| `docs/blueprint/00_MASTER_INDEX.md` | Book 136 |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | R6-E implemented |
| `docs/blueprint/126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md` | Sequencing note |

---

## 4. API / presenter

| Endpoint | Behavior |
|----------|----------|
| `GET /vendor/settlements?seller_org_id=` | Seller access + enriched lines (`sandbox`, `live_payout: false`) |
| `GET /vendor/settlements/:id` | Detail + fees/period/order_id; payout rows not loaded (company-scoped) |
| `GET /admin/finance/settlement-lines?seller_org_id=` | `finance:read` oversight |
| `GET/POST /vendor/support/tickets` | Shared support; refs: `order` \| `settlement_line` \| `shipment` \| `account` |
| `GET/PATCH /me/notifications/preferences` | Includes settlement/support toggles |
| `GET /me/notifications/inbox` | Shared inbox (no PHI) |

### Excludes
Diagnosis · clinical notes · Rx instructions · raw clinical JSON · `customer_person_id` · live payout credentials.

---

## 5. Database

| Item | Result |
|------|--------|
| Schema / tables | **Unchanged** — no duplicate settlement/order/payment tables |
| Additive migration | **1** — RLS policies for seller-readable settlement lines + linked batch/period |
| Real payout | Still OFF at application layer |

---

## 6. Security / RLS / PHI

| Check | Status |
|-------|--------|
| `assertVendorSellerAccess` on list/detail/support | Yes |
| Vendor A ↛ B settlement list/detail | Denied (403) |
| Cross-seller support correlation | Denied (403) |
| Client tenant headers non-authoritative | Preserved |
| No `company_*` for vendors | Preserved |
| PHI leak tests | R6-E e2e |
| `worldpharma_app` NOBYPASSRLS / FORCE RLS | Preserved |

---

## 7. UI (`web-vendor`)

| Area | Result |
|------|--------|
| Settlements list + detail | Live |
| Support ticket create/list with refs | Live |
| Notifications prefs + inbox | Live |
| Loading / empty / error / 401 / 403 / session / network / not-found | Shell + ui-kit |
| Audit tab | Still R6-F placeholder |
| Dev bypass | **None** |

---

## 8. Tests & builds (exact)

| Check | Result |
|-------|--------|
| `nx test api` | **57** suites / **57**; **141** tests / **141**; exit **0** |
| Includes RLS, R3, R5-A…E, R6-A…**E** | Green |
| Typecheck | **18 / 18** |
| Web builds | **6 / 6** (vendor, customer, admin, store, doctor, join) — see gate run |
| Mobile typecheck | Included in 18 |

---

## 9. Production boundaries (still OFF)

Live PSP · live DHL/carriers · **real vendor payouts** · affiliate payouts · production LiveKit · recording · automatic refill · live e-Rx — **OFF**.

---

## 10. Remaining R6 (NOT STARTED)

| Phase | Focus |
|-------|-------|
| **R6-F** | Isolation/RLS attestation + pack gates + acceptance |
| **R7+** | Lab / radiology / CMS / CRM / etc. |

---

## 11. Explicit non-starts

**R6-F NOT STARTED.**  
**R7+ NOT STARTED.**  
No vendor mobile · no generic Partner App · no second settlement/support/notification kernel · no new event bus · no live payouts.

---

## Final declaration

**FINAL STATUS: R6_E_IMPLEMENTED**

**R6-F NOT STARTED.**  
**R7+ NOT STARTED.**
