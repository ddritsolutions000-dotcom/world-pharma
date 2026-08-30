# 109 — Global ecosystem blocker closure (post-R4 hardening)

**Status:** Implemented (engineering hardening only)  
**Change ID:** **CR-POST-R4-FIX-109**  
**Date:** 27 August 2026  
**Source of truth:** [108](108_POST_R4_ECOSYSTEM_AUDIT.md) (**CR-POST-R4-AUDIT-108**)

**Authorization boundary:** Close engineering blockers from audit 108 only. **No R5, Rx, lab, radiology, CMS/CRM product, production LiveKit, recording, live PSP/DHL/payouts, or new identity kernels.**

**Migrations:** **None.**

---

## 0. Final status

**ECOSYSTEM_HARDENING_WITH_BLOCKERS**

Engineering blockers from §L of book 108 that are **code-fixable** are closed or correctly deferred with abstractions. Legal/human gates and missing product domains remain (expected). **R5 is NOT authorized.**

---

## A. Blockers from 108 — disposition

| # | Blocker (108 §L) | Disposition |
|---|------------------|-------------|
| 1 | Mobile native WebRTC | **Deferred with abstraction** — `resolveNativeVideoMedia()`; no fake WebRTC; native SDK not packaged |
| 2 | Video webhook timestamp/replay window | **Fixed** — 5m TTL + LiveKit JWT `iat` check; stale → `WEBHOOK_REPLAY`; out-of-order `room_finished` no-ops on terminal sessions |
| 3 | Notification product wiring | **Fixed (foundation)** — outbox handlers → Redis inbox via existing `NotificationService`; support create enqueues inbox; external providers still disabled |
| 4 | CMS / CRM / helpdesk product | **Deferred (human/product)** — single kernel slots remain; no duplicate; product not in scope |
| 5 | Doctor mobile parity | **Fixed** — credentials, orgs, settings, clinical access labels, richer profile, video sandbox panel |
| 6 | Maker/checker not universal | **Fixed (framework)** — `assertMakerChecker` reused by finance + policy publish; company privilege dual-control unchanged; not applied to all admin mutations (would invent rules) |
| 7 | Planned apps missing | **Deferred correctly** — no shells created |
| 8 | LiveKit sandbox credentials absent | **Held** — MockVideoProvider remains default |

---

## B–I. Post-fix ecosystem snapshot

### Applications (topology)

| App | Status |
|-----|--------|
| Customer web/mobile | **FOUNDATION** + video **SANDBOX** |
| Doctor web/mobile | **FOUNDATION** + video **SANDBOX** (mobile parity closed for listed gaps) |
| Admin | **FOUNDATION** |
| Store web/mobile | **FUNCTIONAL** |
| Delivery mobile | **FUNCTIONAL** + carrier **SANDBOX** |
| Join web | **FUNCTIONAL** |
| Vendor web | **FOUNDATION** |
| Lab / pathologist / logistics / affiliate apps | **PLANNED** (not created) |
| Affiliate mobile | **DEFERRED** |
| **PRODUCTION-READY** | **none** |

### Backend / domains

Unchanged sandbox money/carrier/payout. Video hardened. Notification fan-out foundation wired. Rx/lab/CMS/CRM still **not started**.

### Security / RLS

Client headers still non-authoritative. `worldpharma_app` NOSUPERUSER + NOBYPASSRLS unchanged. RLS suite green. Recording OFF. Tokens ephemeral / not in DOM.

### MNC governance

Company ≠ partner held. Dual-control helper for already-defined company ops. Governance admin no longer stringifies nested objects into cells.

### Video

Mock default; LiveKit boundary only; webhook signature + timestamp + dedupe; reconnect unchanged; mobile media capability abstraction.

### Notifications

One kernel. Prefs-gated in-app inbox for appointment/video/order/shipment/support events. No second service. SMS/WhatsApp/email adapters not invented.

### PHI / privacy

Governance `cell()` locale-safe. No clinical JSON dumps. Inbox bodies generic (no PHI). Support ticket bodies stay in support store only.

---

## J. Remaining engineering blockers

1. Native LiveKit RN SDK packaging (needs authorized dependency CR)  
2. Universal maker-checker across every admin mutation (needs explicit product matrix — not invented here)  
3. CMS / CRM / full helpdesk product  
4. Notification external channel adapters (sandbox-safe providers)  
5. Planned apps (lab, etc.) — correctly absent  

---

## K. Remaining legal / human decisions

Unchanged from 108 §M: L-R4-01…07, OD-VID-01…05, country packs, Phase-0 MoR/PSP, R14 live money.

---

## L. Exact tests / builds

| Suite | Result |
|-------|--------|
| Typecheck | **18/18 PASS** |
| API | **127/127 PASS** (was 124; +3 dual-control unit) |
| RLS | **8/8** (in API) |
| R3 isolation | **13/13** (in API) |
| shell-core | **12/12** (+2 native video media) |
| shell-web | **3/3** |
| web-customer | **8/8** |
| web-doctor | **2/2** |
| web-admin | **12/12** |
| mobile | **4/4** |
| mobile-doctor | **7/7** (+2 nav tabs) |
| ui-kit / config / shared | **21/21** |
| **Workspace total** | **~196 PASS** |

Builds: web-customer, web-doctor, web-admin, web-store, web-join, web-vendor, api — run in this CR.

---

## M. Recommended next phase

**Not authorized by this CR.** Humans may choose:

1. Legal close L-R4-* then a **future production telemedicine CR**, or  
2. Roadmap **R5 (Rx)** after a separate coding authorization, or  
3. Native LiveKit SDK packaging CR for mobile media.

Do **not** start R5 from this document alone. Pre-R5 gate: [110](110_PRE_R5_READINESS_AUDIT.md) (**CR-PRE-R5-GATE-110** — **PRE_R5_GREEN**; still does **not** authorize R5 coding).

---

## Files touched (summary)

| Area | Paths |
|------|-------|
| Video webhook | `video.service.ts`, `livekit-token.ts`, `livekit-video.provider.ts`, `mock-video.provider.ts`, `video-provider.port.ts`, `video.e2e.spec.ts` |
| Notifications | `notification.service.ts`, `notification-dispatch.service.ts`, `support.service.ts`, `platform.module.ts`, `envelope.ts` |
| Dual-control | `identity/dual-control.ts`, finance + policy admin services |
| Mobile video | `shell-core/native-video-media.ts`, mobile consult panels |
| Doctor mobile | `app-root.tsx`, `doctor-api.ts`, `navigation.ts` |
| Admin PHI | `governance-admin.tsx` `cell()` |
| Docs | this book + Master Index |

---

**FINAL STATUS: ECOSYSTEM_HARDENING_WITH_BLOCKERS**
