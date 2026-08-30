# 293 — R3 partner support entry points (CR-293)

**CR:** `CR-R3-PARTNER-SUPPORT-ENTRY-293`  
**Verdict:** **`R3_PARTNER_SUPPORT_ENTRY_COMPLETE`**  
**Date:** 30 August 2026  
**Track:** R3 completion sub-gap (post CR-R3-HARDEN-99 functional foundation)  
**Method:** Scoped support controllers + partner client UI wiring into existing R11 support kernel — no new helpdesk engine, no migration

**Boundaries respected:**

- Reuses `SupportService` / `supportTicket` kernel (same as vendor + customer support)
- No duplicate support product or queue engine
- R14-A human gates **0/7** unchanged (not re-audited)
- R14-B sandbox finance **CLOSED** (CR-292) — not touched
- Migration head **142** unchanged
- No live PSP / production payment routing

---

## A. ROADMAP AUDIT (pre-implementation)

| Candidate | Result |
|-----------|--------|
| R14-B | **CLOSED** — CR-292; no new CR unless reproducible defect |
| R14-A live | **BLOCKED** — 0/7 human gates; `PAYMENT_LIVE_ENABLED` OFF |
| R8-C+ | **STALE index line** — R8-C…R8-F already GREEN in roadmap |
| R15 / R16 | **LATER** — mostly greenfield governance / human pack decisions |
| **R3 support entry** | **AUTHORIZED gap** — [94](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md) §10 requires categories `store_ops`, `delivery`, `onboarding`; vendor pattern exists; store/join/delivery had **zero** support endpoints or UI |

**Selected track:** R3 partner support entry (one concrete engineering gap).

---

## B. CODE-FIRST GAP AUDIT (pre-implementation)

| Surface | Existing | Missing |
|---------|----------|---------|
| API kernel | `SupportController`, `VendorSupportController`, `SupportService` | Scoped controllers for store / delivery / join |
| Store web | Full ops tabs (dashboard…adjust) | No support tab or API wrapper |
| Join web | Application wizard + documents | No onboarding support section |
| Delivery mobile | Jobs + presence tabs | No support tab |
| Tests | R3 isolation, R11-A CMS/support kernel, vendor support in R6-E | No partner-scoped support e2e |

**Security boundaries required:**

- Store: org + location membership via `assertInventoryOwner`; reference ownership for order/lot/dispensing_case/account
- Delivery: rider access via `DeliveryService.assertRiderAccess`; job assignee isolation
- Join: application ownership via `PartnerService.getApplicationForPerson`

---

## C. IMPLEMENTATION

### Backend

| File | Change |
|------|--------|
| `store/store-support.controller.ts` | `GET/POST store/support/tickets` — category `store_ops`; refs: order, lot, dispensing_case, account |
| `delivery/delivery-support.controller.ts` | `GET/POST delivery/support/tickets` — category `delivery`; ref: logistics_job |
| `partner/join-support.controller.ts` | `GET/POST join/support/tickets` — category `onboarding`; ref: partner_application |
| `delivery/delivery.service.ts` | Public `assertRiderAccess()` wrapper |
| `store/store.module.ts` | Import `PlatformModule`; register `StoreSupportController` |
| `delivery/delivery.module.ts` | Import `PlatformModule`; register `DeliverySupportController` |
| `partner/partner.module.ts` | Import `PlatformModule`; register `JoinSupportController` |

### Frontend

| File | Change |
|------|--------|
| `web-store/store-support-panel.tsx` | Support tab UI (mirrors vendor pattern) |
| `web-store/store-api.ts` | `fetchStoreSupportTickets`, `createStoreSupportTicket` |
| `web-store/store-home.tsx` | `support` tab |
| `web-join/join-support-panel.tsx` | Onboarding support section |
| `web-join/join-api.ts` | Join support API wrappers |
| `web-join/join-home.tsx` | Embed support panel |
| `mobile-delivery/navigation.ts` | `support` tab |
| `mobile-delivery/delivery-api.ts` | Delivery support API wrappers |
| `mobile-delivery/app-root.tsx` | Support tab UI |

### Tests

| File | Coverage |
|------|----------|
| `partner/r3.partner-support.e2e.spec.ts` | 401 unauth; store org/location isolation; delivery job assignee isolation; join application ownership |

---

## D. POST-IMPLEMENTATION AUDIT

| Check | Result |
|-------|--------|
| Code path | All three controllers delegate ticket creation to `SupportService.createTicket` with tenant context from country XX default |
| Failure paths | Missing scope → 403; foreign reference → 403/404; non-rider delivery → 403; foreign application → 404 |
| Idempotency | Inherited from support kernel when `idempotency_key` supplied (not required for v1 partner entry) |
| Authorization | JWT + audience guards on all routes; reference validation before ticket create |
| Tenant isolation | Support tickets created under requester's `personId`; store refs scoped to org/location |
| RLS | Cross-rider job reference may return 404 (RLS hide) or 403 (assignee mismatch) — both fail closed |
| Sensitive data | UI blocks clinical keyword paste (store); response notes warn against PHI/KYC content |
| Migration | None — head **142** |

---

## E. REGRESSION RESULTS

| Suite | Result |
|-------|--------|
| `r3.partner-support.e2e.spec.ts` | **4/4 PASS** |
| `r3.isolation.e2e.spec.ts` | **PASS** (regression) |
| `r11a.cms-support-kernel.e2e.spec.ts` | **PASS** (regression) |
| `api:typecheck` | **PASS** |
| `web-store:typecheck` | **PASS** |
| `web-join:typecheck` | **PASS** |
| `mobile-delivery:typecheck` | **PASS** |

---

## F. DEFECTS FIXED

| Defect | Fix |
|--------|-----|
| R3 plan §10 support categories had no API or client entry points | Scoped controllers + UI for store_ops / delivery / onboarding |

---

## G. REMAINING GENUINE GAPS (R3)

| Gap | Notes |
|-----|-------|
| Store mobile app | Plan mentions M+W; web-store done; native store shell not in repo |
| Push token registration (delivery) | Documented future in `navigation.ts`; not blocking support entry |
| Admin partner-support queue routing | R11 desk can consume tickets; category routing/filter UX not built |
| Deep-link support from order/job detail | Manual reference ID entry only in v1 |

---

## H. R14-A BOUNDARY (recorded, not re-audited)

| Gate | Status |
|------|--------|
| Human gates | **0/7** |
| Live PSP | **NOT AUTHORIZED** |
| `PAYMENT_LIVE_ENABLED` | **OFF** |
| CR-244 | Stale / not executable unchanged |

---

## I. NEXT RECOMMENDED CR

**CR-R3-STORE-MOBILE-SHELL-294** (or next authorized wave if humans prioritize R4/R5): native store mobile shell with parity to web-store ops tabs including support — only if product confirms store mobile is next R3 priority; otherwise **R5-F** or **R4** per human authorization.

---

## J. VERDICT

**`R3_PARTNER_SUPPORT_ENTRY_COMPLETE`**

Partner operations clients now have scoped support entry points wired to the shared support kernel with org/job/application isolation enforced at the API boundary.
