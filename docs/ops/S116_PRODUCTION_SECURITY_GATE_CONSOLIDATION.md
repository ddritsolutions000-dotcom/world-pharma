# Sprint 116 — Production Security Gate Consolidation + Real Launch Blocker Cleanup

**Status:** COMPLETE (consolidation / control-plane clarity)  
**Master Index:** #414  
**Production launch:** `CAN_PRODUCTION_LAUNCH = NO`  
**External pentest:** lifecycle **SCOPE_READY** — evidence **MISSING** — passed **NO**  
**Production security certified:** **NO**

**Security statement:** Security gate consolidated. Application controls software-verified. External pentest required. Production certification pending. Residual risks documented. Sandbox cannot satisfy production.

## Goal

Consolidate S110–S115 security evidence into **one authoritative production security gate** without another hardening audit, parallel framework, or invented pentest result.

## Authoritative source of truth

| Concern | Source |
|---------|--------|
| Security certification / pentest lifecycle | **`production-security-gate-consolidation.ts` (S116)** |
| Application authz (IDOR/BOLA) | S110 composed |
| External pentest prep / certification fields | S111 composed |
| API abuse / Redis rate limit | S113 composed |
| Edge/WAF/DDoS / trusted proxy | S114 composed |
| Input / SSRF / path | S115 composed |
| Provider rails (PSP/OTP/…) | **S87 Production Launch Control** (unchanged; no new LaunchRailId) |
| Foundation env/secrets/deploy/DB | S101 / S112 composed |

**No** new `SECURITY_CERTIFICATION` LaunchRailId — meta certification evidence, not a provider rail (same pattern as S100).

## External pentest lifecycle

```
NOT_STARTED → SCOPE_READY → EVIDENCE_PENDING → EXTERNAL_TEST_COMPLETED
  → FINDINGS_REMEDIATED → SECURITY_APPROVED
```

**Current:** `SCOPE_READY` (S111 scope inventory exists; no external report attached).

Required evidence (all **MISSING**):

1. Pentest report / reference  
2. Scope  
3. Test date(s)  
4. Production-equivalent environment  
5. Findings + severity  
6. Remediation evidence  
7. Retest evidence  
8. Approval / sign-off  

Do **not** fabricate any of the above.

## Residual risks (explicit)

- `SSRF_DNS_REBINDING_RESIDUAL_RISK`
- Provider URL allowlists **EXTERNAL_GATED**
- `EXTERNAL_WAF_EDGE_PROTECTION_REQUIRED` / origin / DDoS
- `DISTRIBUTED_RATE_LIMIT_NOT_PRODUCTION_CERTIFIED`
- Foundation `NO_PRODUCTION_*` rails

## Blocker alias cleanup (documented, not deleted)

| Alias | Maps to |
|-------|---------|
| `INPUT_SECURITY_CONTROLS_SOFTWARE_VERIFIED` | `APPLICATION_SECURITY_CONTROLS_SOFTWARE_VERIFIED` |
| `INPUT_SECURITY_NOT_PRODUCTION_CERTIFIED` | `APPLICATION_SECURITY_NOT_PRODUCTION_CERTIFIED` |
| `SECURITY_CERTIFICATION_PENDING` | `PRODUCTION_SECURITY_CERTIFICATION_PENDING` |
| `EDGE_PROVIDER_NOT_SELECTED` | `NO_PRODUCTION_EDGE_WAF` |

Canonical primary remaining blocker: **`EXTERNAL_PENTEST_REQUIRED`**.

## Sandbox vs production fail-closed

Verified **PASS**: sandbox/mock/local adapters **cannot** satisfy production for PSP, carrier, storage, backup/PITR, monitoring, OTP, clinical rails. Semantic guards from S87 + S112 fallback forbidden remain in force.

## Admin surfaces

1. **Launch readiness** (`/launch-readiness`) — Sprint 87 rails + Sprint 116 security certification summary  
2. **Provider activation** — Sprint 116 consolidation card (why blocked, evidence MISSING, residual risks)  
3. API: `GET /api/v1/admin/control-plane/production-security-gate` (`policy:read`)

S110–S115 cards remain as drill-down evidence (not removed).

## Vulnerabilities

No new application vulnerabilities discovered in this consolidation sprint. Prior S115 fixes remain in place.

## Tests

- Unit: `s116-production-security-gate.spec.ts` — **5/5 passed**
- Playwright: `s116-security-gate.spec.ts` — **2/2 passed**
- Regression (S110–S115 + S116 unit): **35/35 passed**
- Shots: `apps/test-results/s116-security-gate-shots/` (**7**)
- Status: `apps/test-results/s116-security-gate/s116-status.json`
- Native: `DEVICE_NOT_AVAILABLE`

## STOP

Sprint 116 complete. Do **not** invent pentest evidence. Do **not** mark security CERTIFIED. Do **not** auto-start Sprint 117.
