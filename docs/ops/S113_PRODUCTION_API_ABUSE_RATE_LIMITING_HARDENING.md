# Sprint 113 — Production API Abuse Protection + Rate Limiting Hardening

**Status:** COMPLETE (application-layer software controls)  
**Master Index:** #411  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  
**Edge/WAF:** `EXTERNAL_GATED` — not invented

**Security statement:** Abuse controls tested. Rate limiting verified. Known risks documented. Distributed Redis enforcement software-verified but not production-certified. External edge/WAF protection pending. **Not** DDoS-proof / hack-proof.

## Goal

Harden application-layer abuse resistance by **reusing** `RateLimitService` (Redis), `SecurityEventsService`, HTTP body limits, upload caps, and webhook signature/replay — without a parallel limiter or invented WAF.

## Architecture reused

| Control | Implementation |
|---------|----------------|
| Limiter | `identity/rate-limit.service.ts` — Redis `INCR`/`EXPIRE`, fail-closed 503 if Redis down |
| Auth/OTP/MFA/refresh | `auth.service` / `mfa.service` + `RATE_LIMITED` events |
| Payments | pay/refund + `webhook:pay` budgets |
| Uploads | health/KYC `upload:*` + byte caps |
| Body size | `http-setup` `HTTP_JSON_LIMIT` (~100kb) |
| Pagination | discovery/catalog `Math.min` / zod max |

**Duplicates avoided:** no second RateLimitService, no WAF abstraction, no parallel SecurityEvents.

## Vulnerabilities found & fixed (S113)

| ID | Fix |
|----|-----|
| S113-VULN-1 | Carrier + video webhooks now `hit(webhook:carrier|video:*, 300/60s)` |
| S113-VULN-2 | Discovery search 60/min + suggest 120/min per IP |
| S113-VULN-3 | Admin PII reveal 10/900s + break-glass 5/900s per actor |

## Remaining risks

- EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED / NO_PRODUCTION_EDGE_WAF
- DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED (multi-region)
- Not every partner mutation has explicit `hit()` (authz primary)

## Distributed enforcement

**REDIS_BACKED_SOFTWARE** — shared across API instances when Redis is available.  
**Not** claimed as production DDoS / multi-region certified. Edge/WAF remains EXTERNAL_GATED.

## Control plane

- `GET /api/v1/admin/control-plane/api-abuse-hardening` (`policy:read`)
- Compose: `apps/api/src/ops/api-abuse-hardening.ts`
- Admin Provider Activation card: Sprint 113

## Tests

- Unit: `s113-api-abuse-hardening.spec.ts` — **5/5 passed** (incl. source regression)
- Playwright: `s113-abuse.spec.ts` — **2/2 passed**
- Shots: `apps/test-results/s113-abuse-shots/` (**6**)
- Status: `apps/test-results/s113-abuse/s113-status.json`

## STOP

Sprint 113 complete. Do **not** invent WAF/CDN. Do **not** claim DDoS-proof. Do **not** auto-start Sprint 114.
