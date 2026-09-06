# Sprint 114 — Production Edge / WAF / DDoS Activation Readiness

**Status:** COMPLETE (application + control-plane readiness; external edge not selected)  
**Master Index:** #412  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  
**Edge/WAF/DDoS:** provider **NOT_SELECTED** — not invented; production protection **pending**

**Security statement:** Edge security architecture prepared. Application controls verified. External WAF required. External DDoS protection required. Trusted proxy handling verified. Production edge protection pending. **Not** DDoS-proof / hack-proof / WAF-protected in production.

## Goal

Prepare World-Pharma for a **real** external edge (WAF + filtering + DDoS + trusted proxy + distributed rate-limit boundary) without inventing CDN/WAF/DDoS vendors, credentials, DNS, or certificates. Reuse Redis `RateLimitService` from S113 — no second limiter, no custom WAF engine.

## Edge architecture

```
INTERNET
  → EXTERNAL EDGE/WAF
  → LOAD BALANCER / REVERSE PROXY
  → APPLICATION
  → INTERNAL SERVICES
```

| Plane | Controls |
|-------|----------|
| EDGE | Volumetric/protocol filtering, WAF categories, edge rate limits, bot mitigation, origin shielding |
| APPLICATION | AuthN/AuthZ, webhook signatures, Redis RateLimitService, trusted-proxy client IP, optional Host allowlist, helmet/CORS |
| DATABASE | Access control; encryption/backup remain EXTERNAL_GATED |
| INTERNAL | Service auth; network isolation EXTERNAL_GATED; no public break-glass bypass |

Authentication and authorization remain **server-side** — not moved to the edge.

## WAF activation model

Lifecycle states supported by the provider activation model (no vendor selected):

`NOT_SELECTED` → `CONFIGURATION_REQUIRED` → `CREDENTIALS_REQUIRED` → `VERIFICATION_REQUIRED` → `APPROVAL_REQUIRED` → `READY_FOR_ACTIVATION` → `ENABLED` / `DISABLED` / `EXTERNAL_GATED`

**Current:** `NOT_SELECTED` / evidence plane `EXTERNAL_GATED` for all vendor WAF policy categories.

## Trusted proxy / client IP

| Setting | Behavior |
|---------|----------|
| `TRUSTED_PROXIES` empty (default) | Express `trust proxy` **not** enabled — XFF/Forwarded **ignored** |
| `TRUSTED_PROXIES=1` / CIDR list / `loopback` | Explicit hops/allowlist only |
| Client IP for abuse controls | `resolveClientIp(req)` → `req.ip` / socket — **never** raw XFF |
| `PUBLIC_API_HOSTS` | Optional Host allowlist; empty = not enforced at app (origin Host binding EXTERNAL_GATED) |

**Software:** trusted-proxy model **VERIFIED**. Production must set `TRUSTED_PROXIES` to the real edge only when an edge is commissioned (`TRUSTED_PROXY_CONFIGURATION_REQUIRED` remains a launch alias until then).

## DDoS protection dependency

All of volumetric, L3/L4, L7 absorption, origin shielding, attack detection, emergency blocking: **EXTERNAL_GATED**.

Distinguish:

1. **APPLICATION RATE LIMITING** — Redis `RateLimitService` (S113), fail-closed 503 if Redis down  
2. **EDGE/WAF PROTECTION** — vendor policies (not selected)  
3. **NETWORK/L3-L4 DDoS** — scrubbing/CDN capacity (not selected)

## Rate-limit relationship

| Scenario | Behavior |
|----------|----------|
| Edge only | Edge throttles; app still applies when request reaches origin |
| App only | Redis budgets; 503 if Redis unavailable |
| Both | Defense in depth; prefer looser edge + tighter identity budgets |
| Edge unavailable | Must not production-launch (`EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED`) |
| Trusted proxy empty | Do not trust headers — no silent weaken |
| Redis unavailable | Fail-closed `RATE_LIMIT_UNAVAILABLE` |

## Origin protection

Origin exposure, edge source validation, firewall/SG, private origin, health-check exceptions: **EXTERNAL_GATED**.  
Webhook authenticity and Admin/break-glass remain **application** responsibilities (signatures, authz, audited, rate-limited).

## Webhooks / Admin / HTTP / Host

- Webhooks: edge may filter; **signatures/replay stay in app** — PASS (existing)  
- Admin/break-glass: authenticated, authorized, audited, rate-limited — no undocumented bypass — PASS  
- HTTP: helmet (frame deny, referrer no-referrer, CORP cross-origin for API), Permissions-Policy, URI length, body limits, CORS allowlist — PASS  
- Host/forwarded-host: app does not use client `X-Forwarded-Host` for security decisions; optional `PUBLIC_API_HOSTS` — PASS (software)

## Exact blockers / aliases

| Code | Role |
|------|------|
| `EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED` | Canonical remaining blocker (S113) |
| `NO_PRODUCTION_EDGE_WAF` | Canonical (S113) |
| `EDGE_PROVIDER_NOT_SELECTED` | Alias |
| `EDGE_CREDENTIAL_REFERENCE_MISSING` | Alias |
| `EDGE_CONFIGURATION_REQUIRED` | Alias |
| `TRUSTED_PROXY_CONFIGURATION_REQUIRED` | Alias (prod edge path) |
| `ORIGIN_PROTECTION_NOT_VERIFIED` | Alias |
| `DDOS_PROTECTION_NOT_PROVEN` | Alias |
| `DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED` | S113 |
| `API_ABUSE_CONTROLS_SOFTWARE_VERIFIED` | S113 evidence marker |

**No force-launch bypass.** Launch Control overall remains **NOT_READY**.

## Vulnerabilities

| ID | Status | Summary |
|----|--------|---------|
| S114-VULN-1 | FIXED | Discovery IP from raw XFF → spoofable budgets |
| S114-VULN-2 | FIXED | No explicit TRUSTED_PROXIES / Host allowlist wiring |
| S114-REM-1..3 | OPEN | Real WAF/DDoS/origin shielding EXTERNAL_GATED |

## What is software-verified vs externally gated

**Software-verified:** trusted-proxy default, client IP spoof resistance, Host helper, Redis limiter reuse, webhook/Admin app controls, helmet/CORS, Launch Control composition.  
**Externally gated:** real edge/WAF selection, production WAF enablement, DDoS provider, origin firewall/private origin, vendor WAF rule packs.

## Control plane

- `GET /api/v1/admin/control-plane/edge-waf-ddos-activation-onboarding` (`policy:read`)
- Compose: `apps/api/src/ops/edge-waf-ddos-real-activation-first-onboarding.ts`
- Helpers: `apps/api/src/common/client-ip.ts`
- Admin Provider Activation card: Sprint 114

## Tests

- Unit: `client-ip.spec.ts` + `s114-edge-waf-ddos-activation.spec.ts` — **11/11 passed**
- Regression (S109–S113 unit): **26/26 passed**
- Playwright: `s114-edge.spec.ts` — **3/3 passed**
- Shots: `apps/test-results/s114-edge-shots/` (**6**)
- Status: `apps/test-results/s114-edge/s114-status.json`
- Native: `DEVICE_NOT_AVAILABLE`

## STOP

Sprint 114 complete. Do **not** invent edge infrastructure. Do **not** claim production WAF/DDoS enabled. Do **not** auto-start Sprint 115.
