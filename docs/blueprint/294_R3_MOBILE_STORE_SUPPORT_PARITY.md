# 294 — R3 mobile-store support parity (CR-294)

**CR:** `CR-R3-MOBILE-STORE-SUPPORT-PARITY-294`  
**Verdict:** **`R3_MOBILE_STORE_SUPPORT_PARITY_COMPLETE`**  
**Date:** 30 August 2026  
**Track:** R3 partner operations clients (continuation of CR-293 support entry)  
**Method:** Wire existing `store/support/tickets` API into `apps/mobile-store` — no new backend kernel, no migration

**Boundaries respected:**

- Does **not** build a new store mobile shell (`apps/mobile-store` already FUNCTIONAL per [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md) / [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md))
- Reuses CR-293 `StoreSupportController` + shared support kernel
- R5-F **not** authorized — not touched
- R4 production **not** authorized — not touched
- R14-A human gates **0/7** unchanged (not re-audited)
- Migration head **142** unchanged

---

## A. ROADMAP PRIORITY DECISION

| Question | Answer | Evidence |
|----------|--------|----------|
| **A. R3 Store Mobile explicitly authorized now?** | **Partially — shell already exists; support parity was the real gap** | `apps/mobile-store` present and FUNCTIONAL; CR-293 added support to web-store / web-join / mobile-delivery but **not** mobile-store. No human gate required for wiring an existing API into an existing app. |
| **B. R5-F authorized?** | **NO — BLOCKED** | [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §3: "Sub-phase R5-F **not** authorized"; [121](121_POST_R5_GLOBAL_ECOSYSTEM_AUDIT.md) §0 |
| **C. R4 authorized?** | **Sandbox DONE; production BLOCKED** | [107](107_R4_TELEMEDICINE_SANDBOX_IMPLEMENTATION.md) **R4_SANDBOX_IMPLEMENTED**; roadmap §3 marks production R4 **LATER** + legal gates L-R4-* |
| **D. Highest unblocked priority?** | **R3** — complete partner support entry across all R3 clients | Wave order [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §3: R3 still **IN PROGRESS**; R5-F/R4-prod blocked |
| **E. Concrete gap vs planning?** | **REAL_MISSING_FEATURE** — mobile-store support UI/API wrappers absent after CR-293 | Code grep: no `support` in `apps/mobile-store/src` pre-CR-294 |

**Decision:** Implement **R3 mobile-store support parity**, **not** a greenfield store mobile shell (CR-293 §I suggestion was stale — shell already shipped in CR-R3-IMPLEMENT).

---

## B. PRE-AUDIT (code-first)

| Surface | Classification | Finding |
|---------|----------------|---------|
| `apps/mobile-store` shell | **ALREADY_COMPLETE** | Dashboard, inventory, orders, Rx desk, GRN, adjust, exceptions |
| `store/support/tickets` API | **ALREADY_COMPLETE** (CR-293) | Scoped org/location + reference validation |
| `web-store` support tab | **ALREADY_COMPLETE** (CR-293) | `StoreSupportPanel` |
| `mobile-delivery` support tab | **ALREADY_COMPLETE** (CR-293) | Support tab in navigation |
| `web-join` support | **ALREADY_COMPLETE** (CR-293) | `JoinSupportPanel` |
| **`mobile-store` support** | **REAL_MISSING_FEATURE** | No API wrappers, no More → Get help screen |
| R5-F live e-Rx | **BLOCKED** | Explicitly unauthorized |
| R4 production video | **BLOCKED** | Legal/human gates |

---

## C. IMPLEMENTATION

| File | Change |
|------|--------|
| `apps/mobile-store/src/store-api.ts` | `StoreSupportTicket` type; `fetchStoreSupportTickets`; `createStoreSupportTicket` |
| `apps/mobile-store/src/app-root.tsx` | More → **Get help** screen; ticket create/list; clinical keyword guard; org/location scoped POST |

**Behavior:**

- Lists tickets via `GET api/v1/store/support/tickets`
- Creates tickets via `POST api/v1/store/support/tickets` with `organization_id` + `location_id` from active scope
- Optional reference type/id (order, lot, dispensing_case, account)
- Clinical content keyword block on submit (matches web-store panel)
- 401/403 → existing session/forbidden handlers

**No backend changes** — API contract unchanged from CR-293.

---

## D. POST-IMPLEMENTATION AUDIT

| Check | Result |
|-------|--------|
| Runtime path | Mobile → `store-api` → `api/v1/store/support/tickets` → `StoreSupportController` → `SupportService` |
| Success path | Ticket created with `category: store_ops`; list refreshes |
| Failure path | Missing subject/body → inline message; clinical keywords → blocked; wrong scope → 403 via existing handler |
| Authorization | JWT customer audience; org/location enforced server-side |
| Tenant isolation | Tickets tied to requester `personId`; references validated against org/location |
| Idempotency | Inherited from support kernel if client sends key (not required in v1 mobile UI) |
| Sensitive data | No clinical paste; generic ticket bodies only |
| Backward compatibility | No API/schema changes; mobile-store ops tabs unchanged |

**Defects introduced:** None found in audit.

---

## E. REGRESSION RESULTS

| Suite | Result |
|-------|--------|
| `mobile-store:typecheck` | **PASS** |
| `api:typecheck` | **PASS** |
| `r3.partner-support.e2e.spec.ts` | **4/4 PASS** |
| `r3.isolation.e2e.spec.ts` | **13/13 PASS** |

**Migration:** head **142**, 0 pending (unchanged)  
**Runtime:** not re-started this CR; API contract unchanged from CR-293

---

## F. R3 PARTNER SUPPORT ENTRY — CLIENT MATRIX (post-CR-294)

| Client | Support entry | Status |
|--------|---------------|--------|
| web-store | Support tab | CR-293 |
| web-join | Onboarding support | CR-293 |
| mobile-delivery | Support tab | CR-293 |
| **mobile-store** | More → Get help | **CR-294** |

**R3 partner support entry:** **COMPLETE** across all shipped R3 client apps.

---

## G. REMAINING REAL GAPS

| Gap | Track | Notes |
|-----|-------|-------|
| Deep-link support from order/job/case detail | R3 polish | Manual reference ID in v1 |
| Delivery push token registration | R3 / notifications | Documented future |
| Admin support queue category filters | R11 desk | Product UX |
| R5-F live e-Rx adapters | R5-F | **BLOCKED** — human + legal |
| R4 production telemedicine | R4 | **BLOCKED** — L-R4 legal gates |
| Store mobile native polish (barcode scan, etc.) | R3 | Enhancement, not blocking support |

---

## H. R14-A BOUNDARY (recorded, not re-audited)

Human gates **0/7** · live PSP **NOT AUTHORIZED** · `PAYMENT_LIVE_ENABLED` **OFF** · CR-244 stale

---

## I. ONE NEXT CR

**CR-R3-PARTNER-SUPPORT-CLOSURE-295** — verification-only CR: confirm R3 partner support matrix complete across all four clients + run full R3 regression closure set; if no further reproducible R3 engineering gap, formally mark R3 partner ops **FUNCTIONAL COMPLETE** and recommend next **human-authorized** wave (R4-prod legal close vs R6+ already-done tracks vs new domain).

Alternatively, if humans authorize a **non-R3** track: **CR-R4-PROD-* gate review** (documentation/legal only until L-R4 closed) — **not** engineering until authorized.

---

## J. VERDICT

**`R3_MOBILE_STORE_SUPPORT_PARITY_COMPLETE`**

All R3 partner client apps now expose scoped support entry to the shared support kernel.
