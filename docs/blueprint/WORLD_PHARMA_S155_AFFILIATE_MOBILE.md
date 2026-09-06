# WORLD_PHARMA S155 — Affiliate Mobile Experience

**Sprint:** 155  
**Master backlog:** #452  
**Status:** SOFTWARE COMPLETE (affiliate mobile companion)  
**CAN_PRODUCTION_LAUNCH:** NO

## Existing affiliate capabilities reused

- `GET/POST/PATCH /api/v1/me/affiliate/*` (stats, codes, links, earnings, statement)
- Inbox + support tickets (`/me/notifications/inbox`, `/support/tickets`)
- JWT audience **`customer`** + affiliate org membership (same as web-affiliate)
- S149 liability states: PENDING / APPROVED / PAYABLE / PAID / REVERSED (+ display labels for held/submitted/processing when present)
- S150 KYC/KYB: **status messaging only** via payout gates — no document/evidence APIs on me/affiliate
- Web portal journeys in `apps/web-affiliate` (not rebuilt)

## Mobile functionality added

New Expo satellite **`apps/mobile-affiliate`** (doctor/delivery pattern):

| Tab | Behavior |
| --- | --- |
| Home | Stats: clicks, conversions, commission buckets, payout status |
| Links | List/create codes & links; activate/deactivate; Share |
| Earn | Commission list + summary lifecycle |
| Stmt | Settlement statement rows |
| Inbox | Notifications + mark read |
| Help | Support tickets |
| Profile | Session, KYC/verification summary (no raw docs), payout gate, sign out |

Topology: **APP-AFF-M** registered; “Affiliate mobile app” removed from `FORBIDDEN_APPLICATIONS` (Generic Partner App remains forbidden).

## APIs reused

No new backend endpoints. Client mirrors `web-affiliate` `affiliate-api.ts` via `apiFetch`.

## Authorization / security

- OTP sign-in audience `customer`
- Own-org data only (API 403 without affiliate membership)
- No payout execute UI/action
- No KYC document exposure
- Invalid resource → user-visible message / 404 handling
- Cross-affiliate leakage prevented by existing server ownership checks

## Tests

- `apps/mobile-affiliate/src/s155-affiliate-mobile.spec.ts` — nav, labels, security contract
- `apps/api/src/identity/app-topology.spec.ts` — APP-AFF-M allowed
- Regression: S149 affiliate payout + S150 KYC patterns (focused)

## Real device / runtime evidence

| Probe | Result |
| --- | --- |
| Expo web `http://localhost:8092` | **200** |
| Unauth me/affiliate/* | **401** |
| Non-affiliate customer token | **403** (membership gate preserved) |
| Unit/typecheck | mobile-affiliate tests + tsc pass |
| Authenticated affiliate OTP tap-through on device | **`NOT_COMPLETED`** unless exercised in-session |

Do not claim device PASS without tap-through.

## Remaining external gates

- Live payout adapter / PSP (S149)
- Production KYC/KYB bureau (S150)
- **`CAN_PRODUCTION_LAUNCH = NO`**

## Limitations

- No dedicated me/affiliate KYC detail endpoint — profile uses stats payout flags + honest Join/admin messaging
- CSV statement export is web-primary (not duplicated on mobile)
- Customer mobile attribution (`apps/mobile` affiliate-attribution) unchanged — not an operator surface

## Intentionally not rebuilt

Affiliate attribution, commission, settlement, payout, KYC/KYB, PSP, Admin engines; HL7/FHIR; new activation framework.
