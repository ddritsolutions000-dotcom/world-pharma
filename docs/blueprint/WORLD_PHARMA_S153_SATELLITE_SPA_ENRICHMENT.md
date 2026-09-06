# WORLD_PHARMA S153 — Satellite SPA Enrichment / Real-Use Customer Journeys

**Sprint:** 153  
**Master backlog:** #450  
**Status:** SOFTWARE COMPLETE (customer satellite SPA enrichment)  
**CAN_PRODUCTION_LAUNCH:** NO

## What existed before S153

- **LAB:** Discovery, book, bookings list/detail, collection status, report view, physical report request (sandbox). Pay API existed; detail UI only exposed Cancel for `BOOKED` / `PAYMENT_FAILED`. Package book returned a message without booking CTA. Status helpers existed without a visual progress track. Report lines omitted `reference_range`.
- **IMAGING:** Booking → status → report → **S152 View study / viewer** already wired. Missing: progress track, explicit “viewer unavailable” messaging, doctor/report next-actions after report load.
- **LOGISTICS:** Order detail with shipment cards when present; shipment detail timeline; guest `/track-order` with unused `history`. Empty delivery/shipments states were weak. Operator `web-logistics` shell already usable (not rebuilt).
- Engines for lab, imaging, PACS, carrier, storage, security, provider activation: **already built** (S126–S152). Not rebuilt here.

## Exact gaps found (genuine UI/application only)

| Priority | Gap | Change |
| --- | --- | --- |
| P0 | Lab detail: no Pay/retry like imaging | Complete booking card + `payLabBooking` |
| P0 | Guest track: `history` unused; weak status UX | Stepper + timeline + shipment labels |
| P1 | Order detail silent when no shipments | Delivery empty state + next actions |
| P1 | Imaging: no progress stepper; omit unavailable viewer | Track + unavailable card; preserve S152 viewer |
| P1 | Health package book: message only | Link to booking status |
| P2 | Lab custody visual + report ref range | `mg-track` + `reference_range` display |
| P2 | Shipments empty | CTA to `/orders` |

## Exact changes made

### LAB
- `lab-bookings-page.tsx` — sandbox Pay / simulate failure / cancel; progress track; reference ranges
- `lab-status-labels.ts` — `LAB_TRACK_STEPS`, `labTrackStepIndex`
- `lab-package-detail-page.tsx` — post-book CTAs to booking status

### IMAGING
- `imaging-bookings-page.tsx` — progress track; unavailable study images card; doctor + View study CTAs after report; **S152 viewer unchanged / not duplicated**
- `imaging-status-labels.ts` — `IMAGING_TRACK_STEPS`, `imagingTrackStepIndex`

### LOGISTICS
- `track-order-page.tsx` — progress track, lifecycle copy, history timeline, honest sandbox/live-carrier labels
- `order-detail-page.tsx` — delivery empty state
- `shipments-page.tsx` — empty CTA to orders
- `order-status-labels.ts` — `guestTrackStepIndex`

### Tests / runtime
- `apps/web-customer/src/__tests__/s153-satellite-spa-enrichment.spec.ts`
- `scripts/s153-satellite-spa-runtime-check.ts`

## LAB journey (customer)

Discovery → test/package detail → booking → (sandbox) payment → confirmation/status → collection status → report when boundary allows → authorized report view (no public report URL).

## IMAGING journey (customer)

Booking → status → report availability → View study → **existing S152 viewer** → return to report/order. Report and study images remain separate. No public DICOM/storage URLs.

## LOGISTICS journey (customer)

Order → fulfillment status → shipment when created → tracking via existing sandbox contract → delivered/failed/returned when present. Live carrier capabilities labeled unavailable / EXTERNAL_GATED. No fake real-time GPS.

## Authorization / security

- Reused existing JWT + ownership on `/me/lab/*`, `/me/imaging/*`, `/me/orders`, `/me/shipments`
- No new public signed URLs; no sensitive client logging added
- Clinical report/viewer remain auth-gated
- Admin permissions not expanded
- Operator logistics/lab/radiology shells not permission-widened

## Tests

Focused unit coverage for track/step helpers + security contract assertions. Related regression: prior lab/imaging/carrier contract specs still applicable.

## Real browser / runtime evidence

Executed `npx tsx scripts/s153-satellite-spa-runtime-check.ts` (+ lab fixture probe):

| Probe | Result |
| --- | --- |
| `/lab`, `/lab/packages`, `/radiology`, `/track-order`, `/shipments`, `/orders` | HTTP **200** |
| Unauth `/me/lab|imaging/bookings`, `/me/orders`, `/me/shipments` | **401** |
| Lab booking by fixture id + collection + report/status | **200** |
| Lab booking detail page | **200** |
| Imaging detail + progress + study + viewer session | **200**; `viewer.available=true`; `public_urls` false |
| Imaging booking + viewer pages | **200** |
| Orders list/detail + shipments list/detail + pages | **200** |
| Guest track `DEMO-SBX-001` | **404** (no matching fixture) |
| Lab/imaging **list** intermittent | Pre-existing RLS savepoint `3B001` flake (not introduced by S153 UI) |
| Invalid UUID ids | Backend **500** UUID parse (pre-existing; not rebuilt) |
| Authenticated OTP UI click-through | **`AUTHENTICATED_BROWSER_CLICKTHROUGH = NOT_COMPLETED`** |

Do **not** claim authenticated browser PASS without that click-through.

## Remaining external gates

- Live lab network / HL7-FHIR (no provider selected) — **not implemented in S153**
- Production PACS / certified workstation
- Live carrier tracking / GPS / POD production
- PSP/KYC and other production activation paths remain as previously EXTERNAL_GATED
- **`CAN_PRODUCTION_LAUNCH = NO`**

## Intentionally not implemented

- HL7/FHIR
- Fake live carrier / PACS / lab integrations
- New activation framework
- Rebuild of lab/imaging/logistics/PACS/order/delivery engines
- Duplicate DICOM viewer
- Placeholder-only pages
- Admin permission expansion

## Next genuine coding gap

From S151 reconciliation after this enrichment: **HL7/FHIR lab interchange** remains coding-adjacent but **EXTERNAL_GATED until a real lab network/provider is selected**. Optional: affiliate mobile. Do not auto-start the next sprint.
