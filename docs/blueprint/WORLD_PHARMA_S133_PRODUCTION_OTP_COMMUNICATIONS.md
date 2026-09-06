# WORLD_PHARMA_S133 — Production OTP + Transactional Communications

**Status:** COMPLETE (software activation path)  
**Master Index:** #429  
**CAN_PRODUCTION_LAUNCH:** NO  
**Production OTP/SMS/Email/Push:** EXTERNAL_GATED / BLOCKED (`NO_PRODUCTION_OTP_MESSAGING_PROVIDER`)  
**Real OTP/messages sent:** NO  

## Implementation completed

Sprint 133 completes the **software-side production OTP + transactional communications activation path**, following the S132 PSP pattern. Production remains **fail-closed** until real providers, secrets-manager resolution, non-mock adapters, and human verification/approval exist.

### Reused (not duplicated)

| Component | Source |
| --- | --- |
| OTP request/verify | `auth.service.ts` |
| Console sandbox OTP | `console-otp.adapter.ts` |
| Production OTP country gate | `production-otp-gate.ts` (S45) |
| Communication env | `communication.config.ts` |
| Channel lifecycle / SENT≠DELIVERED | `messaging-first-onboarding.ts` (S89) |
| Real activation checklist | `messaging-real-activation-first-onboarding.ts` (S103) |
| Activation preparation | `otp-messaging-activation-preparation.ts` (S121) |
| Notification outbox / catalog | existing platform notification + outbox |
| Admin control plane | existing Launch + Provider cards |

**S131 secrets-manager runtime resolver:** still **MISSING** — not invented.

### New / extended

1. **`otp-messaging-production-activation-path.ts` (S133)**  
   - Per-channel (OTP/SMS/Email/Push) live configuration reference inventory  
   - Lifecycle: `NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED`  
   - CONFIGURED only when provider + required refs present  
   - VERIFIED/APPROVED only via explicit human status env markers  
   - ENABLED remains **false** (no non-mock adapter registered)  
   - `assertProductionOtpMessagingInitiationAllowed` / `assertProductionCommsCallbackAllowed`  
   - SENT ≠ DELIVERED invariant  
   - OTP security + callback negative case catalogs  

2. **`auth.service.ts`** — production `requestOtp` calls S133 fail-closed assert before S45 country gate.  

3. **Admin** — `GET …/otp-messaging-production-activation-path`; S121 cards show S133 badges.  

4. **S121 report** embeds `s133_activation_path`.

## Files changed

- `apps/api/src/identity/otp-messaging-production-activation-path.ts` (new)
- `apps/api/src/identity/s133-otp-messaging-production-activation-path.spec.ts` (new)
- `apps/api/src/identity/auth.service.ts`
- `apps/api/src/identity/otp-messaging-activation-preparation.ts`
- `apps/api/src/platform/admin-control-plane.controller.ts`
- `apps/api/src/platform/admin-control-plane.service.ts`
- `apps/web-admin/src/provider-activation-api.ts`
- `apps/web-admin/src/provider-activation-admin.tsx`
- `apps/web-admin/src/production-launch-control-admin.tsx`
- `apps/web-customer/src/__tests__/s133-otp-comms-activation-path.spec.ts` (new)
- `docs/blueprint/WORLD_PHARMA_S133_PRODUCTION_OTP_COMMUNICATIONS.md` (this file)
- `docs/blueprint/00_MASTER_INDEX.md`

## Tests

```text
# S133 + S121 (primary)
npx jest --testPathPatterns=s133-otp-messaging-production-activation-path --testPathPatterns=s121-otp-messaging-activation-preparation
# → Test Suites: 2 passed; Tests: 14 passed, 14 total

# Related regression (S76/S86 + communication.config)
npx jest --testPathPatterns=communication.config.spec --testPathPatterns=s86-otp-messaging --testPathPatterns=s76-otp-messaging
# → Test Suites: 3 passed; Tests: 21 passed, 21 total
```

**Actual results:** S133+S121 **14/14 PASS**; related OTP/comms regression **21/21 PASS**; web-customer S133 surface **1/1 PASS**.

## Provider status

| Channel | Status |
| --- | --- |
| OTP | NOT_SELECTED / EXTERNAL_GATED (sandbox CONSOLE OK) |
| SMS | EXTERNAL_GATED |
| Email | EXTERNAL_GATED |
| Push | EXTERNAL_GATED |
| Software path | COMPLETE |
| Production enabled | false |

## External blockers

1. **NO_PRODUCTION_OTP_MESSAGING_PROVIDER** (umbrella)  
2. Per-channel provider selection + credential/sender/domain **references**  
3. Secrets-manager runtime resolver **MISSING**  
4. Non-mock OTP/messaging adapters not registered  
5. Human verification + approval + live flags + security/deploy gates  

STOP — do not auto-start the next sprint.
