# Sprint 115 — Production Input Security Hardening (Injection / SSRF / Path / Unsafe Input)

**Status:** COMPLETE (application input-security software controls)  
**Master Index:** #413  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  
**External pentest:** **REQUIRED** — not executed; certification **pending**

**Security statement:** Input security controls tested. Vulnerabilities identified/fixed. Known risks documented. External pentest required. Production certification pending. **Not** injection-proof / SSRF-proof / hack-proof.

## Goal

Eliminate practical server-side injection and unsafe-input vulnerabilities before external pentesting — by **reusing** Zod, Prisma, object-store, ProblemFilter, SecurityEventsService, and S110–S114 evidence planes. No parallel validation/sanitization/security framework.

## Findings by class

| Class | Result | Notes |
|-------|--------|-------|
| SQL / ORM | **TESTED** | Tagged Prisma raw; no user-concatenated SQL |
| NoSQL | **NOT_APPLICABLE** | Postgres only |
| Command injection | **NOT_APPLICABLE** | No production shell/exec with user input |
| SSRF | **TESTED** | `assertSafeExternalHttpUrl`; no user URL→fetch today |
| SSRF private / metadata | **TESTED** | Blocks RFC1918, link-local, `169.254.169.254`, metadata hostnames |
| SSRF redirect | **TESTED** | Protocol/credential/host checks; DNS rebinding residual |
| Path traversal | **TESTED** | `assertSafeObjectKey` + `resolveObjectPathUnderRoot` |
| Archive traversal | **NOT_APPLICABLE** | No extractors |
| Unsafe redirect | **HARDENED** | Admin `next=` → `safeInternalPath` |
| Prototype pollution | **HARDENED** | Strip `__proto__`/`constructor`/`prototype` on admin attributes |
| Unsafe deserialization | **NOT_APPLICABLE** | No eval/vm/yaml.load |
| Template/expression | **PASS_WITH_EXISTING_CONTROLS** | JSX escape; no server templates |
| HTTP/CRLF/malformed | **PASS_WITH_EXISTING_CONTROLS** | Body/URI limits (S113), helmet, ProblemFilter |
| Sensitive errors | **PROTECTED** | Generic ProblemFilter; no SQL/path leakage |

## Vulnerabilities found & fixed

| ID | Fix |
|----|-----|
| S115-VULN-1 | Admin open redirect → `safeInternalPath` |
| S115-VULN-2 | Catalog asset URLs filtered via `isSafeExternalHttpUrl` |
| S115-VULN-3 | Object-store resolve-under-root + stronger key checks |
| S115-VULN-4 | `stripPrototypePollutionKeys` on admin catalog attributes |

## Remaining risks

- `EXTERNAL_PENTEST_REQUIRED`
- DNS rebinding residual for future outbound fetchers (`SSRF_DNS_REBINDING_RESIDUAL_RISK`)
- Uneven Zod coverage on some `@Body` controllers (authz primary)
- Live provider URL allowlists EXTERNAL_GATED

## Architecture reused (duplicates avoided)

- Zod `safeParse` (not a second ValidationPipe framework)
- Prisma ORM / tagged `$queryRaw`
- `PrivateObjectStore` / CMS key checks
- Customer `safeInternalPath` pattern (admin parity)
- ProblemFilter + redactText
- SecurityEventsService (existing)
- S110/S111/S113/S114 evidence compose pattern

## Control plane

- `GET /api/v1/admin/control-plane/input-security-hardening` (`policy:read`)
- Compose: `apps/api/src/ops/input-security-hardening.ts`
- Helpers: `apps/api/src/common/url-safety.ts`
- Admin Provider Activation card: Sprint 115

## Tests

- Unit: `url-safety.spec.ts` + `s115-input-security-hardening.spec.ts` — **10/10 passed**
- Playwright: `s115-input.spec.ts` — **3/3 passed**
- Regression (S107–S114 unit): **40/40 passed**
- Shots: `apps/test-results/s115-input-shots/` (**6**)
- Status: `apps/test-results/s115-input/s115-status.json`
- Native: `DEVICE_NOT_AVAILABLE`

## STOP

Sprint 115 complete. Do **not** invent security vendors. Do **not** claim injection/SSRF-proof. Do **not** auto-start Sprint 116.
