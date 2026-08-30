# 98 — R3 Partner operations clients (implementation)

**Status:** HARDENED (functional foundation)  
**Change ID:** **CR-R3-IMPLEMENT** + **CR-R3-HARDEN-99**  
**Plan:** [94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md)  
**Date:** 27 August 2026  

## Summary

R3 delivers partner-facing clients and API facades on existing Person → Partner → Application → Organization → Location kernels. No second identity system. RLS from CR-RLS-96 remains mandatory.

## Production-readiness classification

| App | Classification | Notes |
| --- | --- | --- |
| Store Web | **FUNCTIONAL** | OTP auth, server-derived org/location selector, dashboard/inventory/orders/exceptions/GRN/adjust/pick/pack/ready UI |
| Store Mobile | **FUNCTIONAL** | OTP, scoped org/location switch, all store ops screens, loading/empty/error/403/session states |
| Delivery Mobile | **FUNCTIONAL** | OTP, presence, job list/detail, accept/arrive/pickup/POD/fail/RTO, minimum PII |
| Partner Join Web | **FUNCTIONAL** | Public join gated; applicant status when dark; required-documents + upload; resubmit |
| Admin partners | **FUNCTIONAL** | OTP admin shell; review/activate/reject/KYC viewer/audit watermark/delivery assign |
| Customer (R3 delta) | **FUNCTIONAL** | Real OTP sign-in; join status entry; shipment tracking with auth states |

None of the above are **PRODUCTION-READY** (sandbox OTP/carrier, no live money, legal review open).

## Apps

| App | Path | Port |
| --- | --- | --- |
| Store Web | `apps/web-store` | 3003 |
| Store Mobile | `apps/mobile-store` | Expo |
| Delivery Mobile | `apps/mobile-delivery` | Expo |
| Partner Join Web | `apps/web-join` | 3004 |

## APIs

| Surface | Routes |
| --- | --- |
| Store facade | `GET /store/organizations`, `GET /store/locations`, dashboard, lots, grn (+ receive/post), adjust, orders pick/pack/ready, exceptions |
| Delivery facade | presence, jobs list/detail, accept, arrive, pickup, pod, fail, rto |
| Join | public, applications, submit, required-documents, kyc/open, documents upload/list |
| Admin partners | applications queue/detail, transition, activate, documents view/review, delivery assign |

## Database

- Migration `20260827181400_rider_presence` — `rider_presence` table + RLS
- No new identity tables in R3 harden

## Tests

- `apps/api/src/partner/r3.isolation.e2e.spec.ts` — T-LOC, T-ORG, T-INV, T-KYC, T-AUD, T-RID, T-SES, T-JOIN, T-CO, T-PACK, activation
- CR-RLS-96: 8/8 + full API regression required green

## Builds

```bash
pnpm prisma:generate
nx run-many -t typecheck --projects=api,web-store,web-join,web-admin,web-customer,shell-core,shell-web,mobile-store,mobile-delivery
nx run-many -t build --projects=web-store,web-join,web-admin,web-customer
```

## Known limitations (post-harden)

- Store GRN UI requires operator-supplied variant ID (no catalog picker in store app)
- Admin org/location assignment uses ID fields (no org browser UI)
- KYC viewer shows audit watermark metadata; no in-browser PDF renderer
- Delivery mobile: no offline queue / map handoff
- Maker/checker on partner activate remains human decision (**OD-R3-MC**)
- **LEGAL/COMPLIANCE REVIEW REQUIRED** for KYC lists, rider PII, store staff order PII, public join enablement

## STOP

R3 hardened. **Do not start R4** in this change train.
