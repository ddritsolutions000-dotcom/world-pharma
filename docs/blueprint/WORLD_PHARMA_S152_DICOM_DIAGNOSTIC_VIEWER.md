# WORLD_PHARMA S152 — Production-Quality DICOM / Diagnostic Viewer

**Sprint:** 152  
**Master backlog:** #449  
**Status:** COMPLETE (application viewer software) — production PACS / certified workstation remain **EXTERNAL_GATED**  
**CAN_PRODUCTION_LAUNCH:** NO

## What existed before S152

- Imaging booking → study → series → instance model (Prisma)
- `SandboxPacsAdapter` storing **JSON sandbox payloads** (not DICOM Part 10) in `PrivateObjectStore`
- Customer study metadata API with `viewer.available: false`
- Radiologist / radiology portals with honest “viewer unavailable” messaging
- S70/S80/S93/S139 PACS activation / workflow closures (**not rebuilt**)
- **No** Cornerstone/OHIF/dicom-parser dependency; diagnostic viewer was the S151 coding gap

## What was implemented

Application **diagnostic viewer experience** on top of existing study contracts:

1. **Sandbox diagnostic frames** — deterministic grayscale PNG phantoms (`sandbox-diagnostic-frame.ts`) for series/slice navigation (not claimed as clinical DICOM Part 10)
2. **`ImagingDiagnosticViewerService`** — authorized viewer session + private frame streaming
3. **Customer** `GET /me/imaging/bookings/:id/viewer` + frame endpoint; route `/radiology/bookings/[id]/viewer`; “View study” CTA
4. **Radiologist** `GET /radiologist/studies/:id/viewer` + frames; “View study” in case review
5. Canvas UX: zoom, pan, rotate, reset, fit, series/slice navigation, fullscreen, loading/empty/error
6. Explicit UI/docs boundary: **not a certified diagnostic workstation**; **report ≠ images**

## Supported viewer capabilities

| Capability | Support |
| --- | --- |
| Study metadata | Yes (safe fields only) |
| Series list / navigation | Yes |
| Slice/frame navigation | Yes (8 sandbox frames/series default) |
| Zoom / pan / rotate / reset / fit / fullscreen | Yes |
| Sandbox/test rendering | Yes (PNG phantoms) |
| Production DICOM Part 10 / DICOMweb | **EXTERNAL_GATED** |
| Certified diagnostic workstation | **No** (explicit) |

## Authorization model reused

- Customer: booking `customerPersonId` must match JWT person (IDOR denied)
- Radiologist: existing `assertRadiologist` + case access when report exists
- Frames: same authorization before streaming bytes
- No public image URLs; `Cache-Control: private, no-store`; `X-WP-Public-URL: false`
- No storage credentials / object keys / `payload_base64` in viewer session JSON
- Production infrastructure env → `NO_PRODUCTION_PACS_VIEWER` fail-closed

## Sandbox / test behavior

Viewer operates on **sandbox studies with stored instances**. Frames are **synthetic** for application UX validation — not production studies and not pretended to be live PACS output.

## Production PACS dependency

Still required for real DICOM connectivity:

- `NO_PRODUCTION_PACS_PROVIDER` / S139 workflow blockers
- Live adapter / DICOMweb / Part 10 ingest
- Certified workstation product decision (out of scope for S152)

## Limitations

- Not DICOM Part 10 parsing (no fake PACS server)
- Not a certified diagnostic workstation
- Thin radiology org SPA not fully enriched beyond radiologist View study
- Production pixel path intentionally blocked

## Exact remaining external blockers

- `NO_PRODUCTION_PACS_PROVIDER` / `NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW`
- `NO_PRODUCTION_PACS_VIEWER` (production infra)
- Real imaging network + private storage/KMS production (S140)
- Security launch gates (S148) for overall launch

## Real-use validation (2026-09-05)

API rebuilt/restarted. Customer web `:3000` loaded viewer route.

| Check | Result |
| --- | --- |
| Customer OTP login → study metadata | **200**, `viewer.available=true` |
| `GET .../viewer` session | **200**, series present, no `payload_base64` / object keys |
| `GET .../frames/0` | **200** `image/png`, PNG signature valid, `X-WP-Public-URL: false` |
| Unauthenticated viewer | **401** |
| Cross-patient | No second customer fixture in DB (`NO_ALT_CUSTOMER`); IDOR covered in e2e foundation suite |
| Customer `/radiology/bookings/:id/viewer` | **200** page load |
| Authenticated full browser zoom/pan click-through | `AUTHENTICATED_BROWSER_EVIDENCE_NOT_COMPLETED` (OTP UI not automated in this sprint; API frame path exercised) |

Script: `npx tsx scripts/s152-viewer-runtime-check.ts`

## Tests

```bash
npx nx test api --testPathPatterns="s152-imaging-diagnostic-viewer" --skip-nx-cache
# Test Suites: 1 passed, 1 total | Tests: 6 passed, 6 total

npx nx test api --testPathPatterns="s152-imaging-diagnostic-viewer|imaging-study-pacs-foundation|s139-imaging" --skip-nx-cache
# Test Suites: 3 passed, 3 total | Tests: 18 passed, 18 total
```

## What was NOT rebuilt

S70/S80/S93/S139 activation paths, SandboxPacsAdapter contract, PrivateObjectStore, imaging order/report engines, Admin provider-activation frameworks.
