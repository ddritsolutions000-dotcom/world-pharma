# 138 — R6-F Vendor marketplace attestation + pack gates + acceptance

**Status:** Implemented (R6-F final vendor-marketplace sub-phase)  
**Change ID:** **CR-R6-F-IMPL-138**  
**Date:** 27 August 2026  
**FINAL STATUS:** **R6_F_IMPLEMENTED**

**Canonical inputs:** [126](126_R6_VENDOR_MARKETPLACE_IMPLEMENTATION_PLAN.md) · [137](137_POST_R6_E_AUDIT.md) (**R6_E_GREEN_R6_F_READY**) · [136](136_R6_E_VENDOR_SETTLEMENT_SUPPORT_IMPLEMENTATION.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Authority:** Isolation/RLS attestation + pack gates + seller marketplace acceptance only. **R7+ NOT STARTED.** No live money/carriers/payouts/LiveKit/auto-refill/live e-Rx. No vendor mobile / Partner App / second kernels.

---

## 1. Scope delivered

| Item | Result |
|------|--------|
| Seller attestation | Explicit `MARKETPLACE_SELLER_SANDBOX_V1` product code (not a legal certification) |
| Pack gates | Fail-closed on missing pack / marketplace off / VENDOR partner type off |
| Acceptance states | `ELIGIBLE` · `PENDING` · `BLOCKED` · `REQUIRES_ATTESTATION` · `DISABLED` |
| Company governance | Admin accept/block/reset (`partner:manage`) |
| Catalog write gate | Vendor create/publish/price require `ELIGIBLE` |
| Seller activity UI | Shared `SecurityEvent` feed (vendor Activity tab) |
| Admin oversight | Partners admin marketplace eligibility controls |
| RLS attestation | Settlement batch company-scope + `can_country` via SECURITY DEFINER (no recursion) |
| Pack pointer | Resolver prefers `country.publishedPolicyPackId` |

---

## 2. States

| State | Meaning |
|-------|---------|
| `DISABLED` | No published pack, marketplace off, or VENDOR partner type off |
| `BLOCKED` | Org inactive or company blocked participation |
| `REQUIRES_ATTESTATION` | Pack OK; seller has not attested |
| `PENDING` | Attested; awaiting company acceptance |
| `ELIGIBLE` | Attested + accepted; catalog writes unlocked (sandbox) |

Vendor cannot self-accept. Acceptance is not live payout authorization.

---

## 3. Files changed

### API
| File | Change |
|------|--------|
| `catalog/marketplace-eligibility.service.ts` | **New** evaluate/attest/accept + activity |
| `catalog/vendor-marketplace.controller.ts` | **New** vendor eligibility/attest/activity |
| `catalog/admin-marketplace.controller.ts` | **New** admin eligibility/acceptance |
| `catalog/catalog.module.ts` | Register service + controllers |
| `catalog/vendor.controller.ts` | Gate VENDOR catalog writes; RLS-safe publish/price |
| `policy/resolver.ts` | Prefer published pack pointer |
| `identity/security-events.service.ts` | Marketplace event types |
| `test/marketplace-seller.ts` | Test helper for pack + activate |
| `catalog/r6f.vendor.e2e.spec.ts` | **New** focused R6-F e2e |
| Prior R6/catalog/order/cart/payment e2es | Activate seller where vendor writes |

### Database
| Migration | Purpose |
|-----------|---------|
| `20260827220000_r6f_settlement_batches_country_scope` | Company-scope + can_country (initial) |
| `20260827220100_r6f_settlement_batches_rls_norecurse` | SECURITY DEFINER country lookup — fix batches↔periods recursion |

No new attestation tables (Redis seller record + SecurityEvent audit).

### Web
| File | Change |
|------|--------|
| `web-vendor/.../vendor-marketplace-panel.tsx` | Eligibility + attest UX |
| `web-vendor/.../vendor-activity-panel.tsx` | Activity tab |
| `web-vendor/.../vendor-shell.tsx` | Marketplace + Activity live |
| `web-vendor/.../vendor-api.ts` | Clients |
| `web-admin/.../partners-admin.tsx` | Accept/block/load eligibility |

### Docs
Book 138 · index · roadmap · 126 sequencing.

---

## 4. Book 137 observation (settlement_batches)

**Required for R6-F:** Yes — company-scope batch reads now require `can_country` via `app.settlement_period_country(period_id)` (SECURITY DEFINER) so Vendor A↛B and country A↛B hold without RLS recursion.

---

## 5. Security / PHI

| Check | Status |
|-------|--------|
| Attestation/accept audited via SecurityEvent | Yes — no PHI/secrets |
| Vendor activity metadata sanitized | Yes |
| Vendor A ↛ B eligibility/attest | Yes |
| Vendor cannot admin-accept | Yes |
| Empty pack fail-closed | Yes |
| `live_payout: false` on eligibility DTO | Yes |

---

## 6. Tests & builds (exact)

| Check | Result |
|-------|--------|
| `nx test api` | **58** suites / **58**; **142** tests / **142**; exit **0** |
| Includes RLS, R3, R5-A…E, R6-A…**F** | Green |
| Typecheck | **18 / 18** |
| Web builds | **6 / 6** |
| Mobile typecheck | Included in 18 |

---

## 7. Production boundaries (still OFF)

Live PSP · real vendor/affiliate payouts · live DHL/carriers · production LiveKit · recording · automatic refill · live e-Rx — **OFF**.

**R6-F acceptance ≠ production financial authorization.**

---

## 8. Explicit non-starts

**R7+ NOT STARTED.**  
R6-F is the **final R6 vendor-marketplace sub-phase**.

---

## Final declaration

**FINAL STATUS: R6_F_IMPLEMENTED**

**R6-F is the final R6 vendor-marketplace sub-phase.**  
**R7+ NOT STARTED.**  
**Live money/payouts remain OFF.**
