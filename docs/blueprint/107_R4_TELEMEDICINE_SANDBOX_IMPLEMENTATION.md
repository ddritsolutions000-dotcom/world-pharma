# 107 — R4 telemedicine sandbox implementation

**Status:** Implemented (sandbox only)  
**Change ID:** **CR-R4-IMPL-107**  
**Date:** 27 August 2026  
**Plan basis:** [106](106_R4_TELEMEDICINE_IMPLEMENTATION_PLAN.md) (**CR-R4-AUTH-106**)  
**Engineering gate:** [105](105_PRE_R4_ENGINEERING_BLOCKERS_IMPLEMENTATION.md) — **READY_FOR_R4_ENGINEERING**

**Authorization boundary:** Phase A (mock video product UX) and Phase B (LiveKit sandbox when configured) only. **CR-R4-PROD-108 NOT implemented.** No production LiveKit, no real patient traffic, no recording, no Rx/lab/radiology/CMS/CRM/live PSP/DHL/payouts.

---

## 0. Final status (this CR)

**R4_SANDBOX_IMPLEMENTED**

| Boundary | Status |
|----------|--------|
| Phase A — mock video UX (customer/doctor web + mobile, admin read-only) | **Done** |
| Phase B — LiveKit sandbox adapter boundary | **Done** (provider selection + dynamic WebRTC UI when creds present) |
| LiveKit sandbox actually configured in this environment | **No** — `MockVideoProvider` active |
| MockVideoProvider available | **Yes** (default when LiveKit unset; forced in `NODE_ENV=test`) |
| Recording | **OFF** (DB CHECK + API + UI invariant preserved) |
| Production R4 / CR-R4-PROD-108 | **NOT started** |
| Rx, lab, pathology, radiology, care nav, CMS, CRM, live PSP, DHL, payouts | **NOT implemented** |

---

## 1. Scope delivered

### Phase A — mock video product UX

| Surface | Delivered |
|---------|-----------|
| Customer web | Waiting room, server join/leave/reconnect, ended/denied/provider states via `ConsultVideoPanel` |
| Customer mobile | Same lifecycle via `NativeConsultVideoPanel` on appointment detail |
| Doctor web | Admit/join/end video, encounter boundary preserved in encounter panel |
| Doctor mobile | Consult panel on appointment detail; encounter actions unchanged |
| Admin web | Read-only session list/detail (`video:read`); no join/recording/bypass |

### Phase B — LiveKit sandbox boundary

| Item | Status |
|------|--------|
| Reuse `VideoProviderPort` + `LiveKitVideoProvider` | Unchanged backend; no duplicate provider |
| Ephemeral join tokens (server mint) | Existing API |
| Role separation (customer/doctor) | Existing API + UI paths |
| Webhook/session sync | Existing `video-webhook.controller` + idempotent receipts |
| Client LiveKit room (web) | Dynamic `livekit-client` import when token/ws_url not mock |
| Client LiveKit (native) | Session lifecycle only; mock in-call UI (no native WebRTC SDK in this CR) |
| Credentials absent | Falls back to `MockVideoProvider`; no invented creds; no client-generated tokens |

---

## 2. Migrations

**None.** Existing `VideoSession`, `VideoJoinAudit`, `VideoWebhookReceipt` schema from `20260827120000_video_session_foundation` is sufficient.

---

## 3. Files changed

| Area | Files |
|------|-------|
| Shared types/helpers | `packages/shell-core/src/video-session.ts`, `video-session.spec.ts`, `index.ts` |
| Web consult UI | `packages/shell-web/src/consult-video-panel.tsx`, `consult-video-panel.spec.tsx`, `index.ts`, `package.json` |
| Customer web | `apps/web-customer/src/appointment-detail-page.tsx` |
| Doctor web | `apps/web-doctor/src/encounter-panel.tsx` |
| Customer mobile | `apps/mobile/src/consult-panel.tsx`, `consult-panel.spec.tsx`, `customer-features.tsx` |
| Doctor mobile | `apps/mobile-doctor/src/consult-panel.tsx`, `consult-panel.spec.tsx`, `app-root.tsx` |
| Admin web | `apps/web-admin/src/video-admin.tsx`, `video-admin.spec.tsx`, `nav.ts`, `app/video-sessions/page.tsx` |
| API provider selection | `apps/api/src/clinical/clinical.module.ts` |
| Env example | `.env.example` (`VIDEO_PROVIDER`, `LIVEKIT_*` commented) |

---

## 4. Session lifecycle

Reuses existing **8-state** machine (`CREATED → READY → DOCTOR_JOINED | CUSTOMER_JOINED → IN_PROGRESS → ENDED | FAILED | EXPIRED`).

Client panels:

- Poll session while in waiting room
- Join via server `POST .../video/join`
- Leave / doctor end via existing APIs
- Reconnect via re-join
- Provider failure → 503 UI
- Ended/expired → dedicated ended state; encounter completion remains separate doctor action

No second state machine introduced.

---

## 5. Security / clinical access

Unchanged server enforcement via `evaluateVideoJoin()`:

- Relationship check
- Consent check (`consultation` / `telemedicine`)
- Country policy check
- Appointment/encounter authorization
- Tenant / RLS context

Frontend never self-grants access. No client-supplied org/legal-entity/country/doctor/patient identity overrides.

**PHI hygiene:** No tokens in DOM/URLs/logs; no `JSON.stringify` of clinical payloads in new UI; recording disabled messaging only.

---

## 6. Notifications

**Not wired.** Plan §1.3 noted outbox handlers are log-only; no new notification service created (per authorization).

---

## 7. Provider configuration

```
NODE_ENV=test              → MockVideoProvider
VIDEO_PROVIDER=mock        → MockVideoProvider
LIVEKIT_* configured       → LiveKitVideoProvider (sandbox-capable)
otherwise                  → MockVideoProvider (local dev default)
```

To enable LiveKit sandbox: set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (optional `VIDEO_PROVIDER=livekit`).

---

## 8. Tests (post-implementation)

| Suite | Result |
|-------|--------|
| API regression (incl. video e2e, RLS, R3) | **124/124 PASS** |
| RLS tenancy (`rls.tenancy.e2e.spec.ts`) | **8/8 PASS** |
| R3 isolation (`r3.isolation.e2e.spec.ts`) | **13/13 PASS** |
| Typecheck | **18/18 PASS** |
| shell-core | **10/10 PASS** (+5 video-session helpers) |
| shell-web | **3/3 PASS** (+2 consult panel) |
| web-customer | **8/8 PASS** |
| web-doctor | **2/2 PASS** |
| web-admin | **12/12 PASS** (+2 video admin) |
| mobile customer | **4/4 PASS** (+1 consult eligibility) |
| mobile doctor | **5/5 PASS** (+1 consult eligibility; navigation suite now wired) |
| ui-kit + config + shared | **21/21 PASS** |
| **Workspace total** | **189/189 PASS** |

Web builds verified: **web-customer**, **web-doctor**, **web-admin** (includes `/video-sessions`).

---

## 9. Remaining R4 gaps (deferred)

| Gap | Gate |
|-----|------|
| Production LiveKit + TURN/STUN | CR-R4-PROD-108 |
| Legal/compliance L-R4-01–07 | Human sign-off per [106](106_R4_TELEMEDICINE_IMPLEMENTATION_PLAN.md) §3 |
| Consult reminder notifications | Future CR + notification kernel |
| Native LiveKit SDK (doctor/customer mobile WebRTC) | Post-sandbox product CR |
| Pre-join countdown / policy-closed UX polish | Optional UX CR |
| Quality/degradation (audio-only) | OD-VID-04 / production CR |
| Recording | Explicit CR + consent scope `RECORDING` |

---

## 10. Explicit production boundary

**R4 production is NOT enabled.** This CR delivers sandbox/mock-first telemedicine UX and preserves all production gates for **CR-R4-PROD-108**.
