# Sprint 110 — Application Security Hardening (Authorization / IDOR / BOLA / Tenant)

**Status:** COMPLETE (software verification)  
**Master Index:** #408  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  
**Security statement:** Security controls tested. Vulnerabilities fixed. Known risks remaining. External penetration testing required. **Not** hack-proof / 100% secure.

## Goal

Find and fix real application-level authorization weaknesses (IDOR/BOLA, cross-tenant, privilege escalation, healthcare/document exposure) by **reusing** existing authz architecture — not inventing a parallel security framework.

## Architecture reused (no parallel framework)

| Layer | Implementation |
|-------|----------------|
| Authentication | `JwtAuthGuard` |
| Audience / portal SoD | `AudienceGuard` + `@RequireAudiences` |
| RBAC | `PermissionsGuard` + `RbacService` + `@RequirePermissions` |
| Tenant context | `TenantContextInterceptor` + `buildUserTenantContext` + RLS GUCs |
| Vendor/lab/imaging org | `catalog/access` (`assertVendorSellerAccess`, lab/imaging org access) |
| Object ownership | Domain services (order/cart/health/clinical/affiliate/logistics/kyc) |
| Audit | `SecurityEventsService` |
| Shared helpers (S110) | `identity/object-authorization.ts` — thin same-person / cross-object / tenant-spoof helpers only |

**Duplicates avoided:** No new middleware stack, permission enum system, tenant resolver, audit subsystem, or Admin “security approve” launch flag.

## Vulnerabilities found

| ID | Severity | Summary |
|----|----------|---------|
| S110-VULN-1 | HIGH | Delivery `acceptJob` / mutate paths did not call `assertRider` — any customer JWT with a `jobId` could claim/act on logistics jobs |
| S110-VULN-2 | HIGH | `assertRider` treated **any** active org membership as rider access; client `organization_id` not validated |
| S110-VULN-3 | MEDIUM | Lab/imaging physical-report idempotency short-circuit returned another customer’s request when `Idempotency-Key` was reused |

## Vulnerabilities fixed

| ID | Fix |
|----|-----|
| S110-FIX-1 | `delivery.service`: `assertRider` on `getJob` / `acceptJob` / `assertAssigned`; require `DELIVERY_PARTNER` **or** `LOGISTICS_FLEET` membership; `rejectClientTenantSpoof` on `organization_id` |
| S110-FIX-2 | Lab + imaging physical-report: `assertSamePerson` (+ booking bind) on idempotency-key replay |
| S110-FIX-3 / HARDEN-1 | Health subject/artifact + shared `object-authorization` helpers for consistent denials |

## Vulnerabilities / risks remaining

| ID | Why not fixed in S110 |
|----|------------------------|
| S110-REM-1 EXTERNAL_PENTEST_REQUIRED | Independent pentest / red-team out of sprint scope |
| S110-REM-2 | Production private document ACL still EXTERNAL_GATED (S107 storage/KMS) |
| S110-REM-3 | Per-service ownership — new `:id` routes can still omit checks if authors skip patterns |

## Surfaces tested (evidence)

| Surface | Result |
|---------|--------|
| Customer cross-object | PASS_WITH_EXISTING_CONTROLS |
| Vendor cross-tenant | PASS_WITH_EXISTING_CONTROLS |
| Doctor / healthcare | PASS_WITH_EXISTING_CONTROLS |
| Lab | PASS_WITH_EXISTING_CONTROLS (+ idempotency HARDENED) |
| Imaging | PASS_WITH_EXISTING_CONTROLS (+ idempotency HARDENED) |
| Affiliate | PASS_WITH_EXISTING_CONTROLS |
| Logistics | HARDENED (S110 rider gate) |
| Admin privilege isolation | PASS_WITH_EXISTING_CONTROLS |
| IDOR/BOLA | HARDENED |
| Tenant manipulation | HARDENED |
| Private documents | PASS_WITH_EXISTING_CONTROLS (prod ACL EXTERNAL_GATED) |
| Sensitive leakage | PASS_WITH_EXISTING_CONTROLS |
| Audit logging | PASS_WITH_EXISTING_CONTROLS |

## Control-plane evidence

- `GET /api/v1/admin/control-plane/application-security-hardening` (`policy:read`)
- Compose: `apps/api/src/ops/application-security-hardening.ts`
- Admin Provider Activation card: Sprint 110
- Remaining blocker: **EXTERNAL_PENTEST_REQUIRED**
- Force launch: **false**
- No fake “security approved” production enablement

## Tests

### Playwright

- `apps/web-customer/src/__tests__/s110-security.spec.ts` — **2/2 passed**
- Helpers: `e2e/helpers/s110-ui.ts`
- Shots: `apps/test-results/s110-security-shots/` (no PHI/credentials)
- Status artifact: `apps/test-results/s110-security/s110-status.json`

### Unit

- `apps/api/src/ops/s110-application-security.spec.ts` — **7/7 passed**
- Focused regression with S109: **11/11** (S110 7 + S109 4)

### Regression (focused)

Reuse existing suites as applicable: S53/S54 commerce, S60/S61 Admin/partner SoD, S72/S81/S94 KYC, S100/S101, S109 observability — do not invent parallel authz e2e frameworks.

Prior existing isolation evidence: `app-isolation.e2e`, `phase-4b1-authorization.e2e`, R6–R9 healthcare, S46 logistics (positive paths).

## Real-use / responsive / native

| Check | Result |
|-------|--------|
| Admin security card | Verified via Playwright |
| Customer → Admin denied | Verified (SoD) |
| Responsive 390 / 768 / 1024 / 1440 | RESPONSIVE_WEB_VERIFIED |
| Native Android / iOS | DEVICE_NOT_AVAILABLE |

## Production Launch Control

Compose only verified results. **Do not** set a fake security-approved launch rail.  
`CAN_PRODUCTION_LAUNCH` remains **NO** until external infrastructure, providers, and **external pentest** gates are satisfied.

## External requirements before production certification

1. Independent application penetration test (IDOR/BOLA/tenant/privilege matrix)
2. Clear S107 production private storage/KMS/malware ACL
3. Clear S101 foundation gates
4. Ownership-check review process for new `:id` endpoints

## STOP

Sprint 110 complete. Do **not** auto-start Sprint 111.
