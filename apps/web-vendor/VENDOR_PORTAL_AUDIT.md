# Vendor Portal Audit — World-Pharma

**Date:** 2026-09-02  
**Scope:** `apps/web-vendor` + `/api/v1/vendor/*` + related join/notification/support APIs  
**Classification:** `WORKING` | `PARTIAL` | `MISSING` | `DEFECT` | `HUMAN-BLOCKED`

## Summary

| Status | Count |
|--------|-------|
| WORKING | 3 |
| PARTIAL | 12 |
| MISSING | 4 |
| DEFECT | 5 |
| HUMAN-BLOCKED | 2 |

**Verdict:** Not yet `M-VENDOR-PORTAL_COMPLETE`. Operational sandbox seller flows work; dashboard metrics API, statements export, team management, and dedicated reports API remain gaps.

---

## Feature Matrix

| Area | Status | Backend | Frontend | Notes |
|------|--------|---------|----------|-------|
| Login / org scope | WORKING | `GET /vendor/organizations` | `vendor-shell.tsx` | OTP session, `customer` audience, org picker, RLS via `assertVendorSellerAccess` |
| Dashboard | PARTIAL | No dedicated metrics API | `vendor-dashboard-panel.tsx` | KPIs computed client-side from list APIs (last 50 rows). No server aggregates. |
| Orders list | WORKING | `GET /vendor/orders` | `vendor-orders-panel.tsx` | Filters, search (client), queue + detail |
| Order detail | PARTIAL | `GET /vendor/orders/:id` | `vendor-orders-panel.tsx` | Timeline, fulfilment tasks, shipments wired in UI |
| Order actions | WORKING | pick/pack/ready POST | `vendor-orders-panel.tsx` | No cancel/reject vendor endpoints |
| Catalog | PARTIAL | create/publish/price | `vendor-catalog-panel.tsx` | No edit/unpublish/list-items |
| Inventory | WORKING | full vendor inventory API | `vendor-inventory-panel.tsx` | GRN, adjust, transfer, movements |
| Pricing rules | PARTIAL | `GET commercial-rules` | `vendor-pricing-panel.tsx` | Read-only by design; offer pricing on catalog |
| Fulfilment | PARTIAL | order state machine | embedded in orders | No dedicated pick-station view |
| Shipments | PARTIAL | list + detail | `vendor-shipments-panel.tsx` | Read-only; costs + timeline shown |
| Settlements | PARTIAL | lines list/detail | `vendor-settlements-panel.tsx` | Sandbox; no PDF export |
| Statements | PARTIAL | settlement lines proxy | settlements panel | No `/vendor/statements` resource |
| KYC / compliance | PARTIAL | `/join/*` + marketplace | `vendor-compliance-panel.tsx` | Post-activation doc refresh limited |
| Notifications | PARTIAL | `/me/notifications/*` | `vendor-notifications-panel.tsx` | Mark-read, deep links |
| Support | PARTIAL | vendor create + `/support/tickets/:id` | `vendor-support-panel.tsx` | Thread + reply via shared kernel |
| Reports | PARTIAL | — | `vendor-reports-panel.tsx` | Client-side from fetched lists only |
| Settings | PARTIAL | prefs + org read | `vendor-settings-panel.tsx` | Hub; company fields read-only |
| Team / staff | HUMAN-BLOCKED | Admin invitations only | `vendor-team-panel.tsx` | No vendor team API |
| Security / RLS | WORKING | guards + access.ts | session + 403 states | e2e: r6a, r6e, app-isolation |
| Public acquisition | WORKING | `/join/*` | `/join` routes | Separate from workspace |

---

## Security Boundaries (enforced)

Vendor **cannot** (by design):

- Change company settings, country policy, global fees, platform commission
- Activate live payments or execute company payout
- Approve own KYC or settlements
- Access another vendor's orders/inventory/finance
- Access customer PHI (vendor order presenter strips clinical content)
- Access Main Admin routes

---

## Remaining for `M-VENDOR-PORTAL_COMPLETE`

1. Backend vendor dashboard/metrics API (optional; client aggregation documented as limitation)
2. Vendor statements export endpoint
3. Vendor team/membership management API
4. Catalog edit/unpublish lifecycle
5. Full E2E browser verification with sandbox vendor login
6. Vendor A vs Vendor B isolation test run in CI
