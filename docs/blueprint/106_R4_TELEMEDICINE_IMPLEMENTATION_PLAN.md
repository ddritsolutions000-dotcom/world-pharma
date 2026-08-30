# 106 — R4 telemedicine video implementation plan

**Status:** Plan authorized — **production implementation NOT started**  
**Change ID:** **CR-R4-AUTH-106**  
**Date:** 27 August 2026  
**Engineering gate:** [105](105_PRE_R4_ENGINEERING_BLOCKERS_IMPLEMENTATION.md) (**CR-PRE-R4-FIX-105**) — **READY_FOR_R4_ENGINEERING**

**Authorization boundary:** This document authorizes **planning and scope definition only**. It does **not** authorize production coding, migrations, LiveKit room creation against production SFU, real money, Rx, lab, radiology, CMS, CRM, live PSP/DHL, or payouts.

**Coding authorization required:** **`CR-R4-IMPL-107`** (or successor CR explicitly titled for R4 implementation) must be issued **after** applicable legal/compliance gates in §3 are satisfied or explicitly deferred with human sign-off.

**Product vision reference:** [66](66_TELEMEDICINE_VIDEO.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md) §R4 · [78](78_HEALTHCARE_UI_UX_ARCHITECTURE.md)

---

## 0. Final status (this CR)

**R4_PLAN_READY**

Production R4 implementation: **NOT STARTED**.

---

## 1. Existing foundation audit (as of post-105)

### 1.1 Backend — implemented (P2-HC-3 foundation)

| Artifact | Path | Notes |
|----------|------|-------|
| Video orchestration | `apps/api/src/clinical/video.service.ts` | Join/leave/end/get; encounter linkage; outbox + security events |
| Provider port | `apps/api/src/clinical/video-provider.port.ts` | `VideoProviderPort` abstract class |
| LiveKit adapter | `apps/api/src/clinical/livekit-video.provider.ts` | Room create/delete, JWT mint, webhook verify |
| Mock adapter | `apps/api/src/clinical/mock-video.provider.ts` | Used when `NODE_ENV === 'test'` |
| Token helper | `apps/api/src/clinical/livekit-token.ts` | Short-lived participant JWT; **recording disabled in claims** |
| State machine | `apps/api/src/clinical/video-status.ts` | 8-state enum + transition guards |
| Clinical access | `apps/api/src/clinical/clinical-access.service.ts` | `evaluateVideoJoin()` — relationship + consent + policy |
| Consent | `apps/api/src/clinical/consent.service.ts` | Grant/revoke; purposes `consultation` \| `telemedicine` |
| Appointments/encounters | `apps/api/src/clinical/appointment.service.ts` | Booking, check-in, start/complete encounter |

**Customer API** (`customer-appointment.controller.ts`):

- `POST /api/v1/appointments/:id/video/join`
- `POST /api/v1/appointments/:id/video/leave`
- `GET  /api/v1/appointments/:id/video`

**Doctor API** (`doctor-appointment.controller.ts`):

- Same join/leave/get + `POST .../video/end`

**Admin API** (`admin-video.controller.ts`):

- `GET /api/v1/admin/video-sessions` (permission `video:read`)
- `GET /api/v1/admin/video-sessions/:id`

**Webhooks:** `POST /api/v1/webhooks/video/livekit` (idempotent receipts; `room_finished` → ENDED)

**Join response contract (existing):**

```json
{
  "session_id": "uuid",
  "status": "VideoSessionStatus",
  "role": "DOCTOR | CUSTOMER",
  "ws_url": "wss://…",
  "token": "short-lived",
  "token_expires_at": "ISO8601",
  "recording_enabled": false,
  "reconnect": true
}
```

**Fail-closed behaviors already tested:** consent missing, policy closed, wrong audience, appointment type/status mismatch, rate limit (20 joins/min/person), provider unconfigured → `503 VIDEO_PROVIDER_UNAVAILABLE`.

### 1.2 Database — implemented

Migration `20260827120000_video_session_foundation`:

- `VideoSession`, `VideoJoinAudit`, `VideoWebhookReceipt`
- Status enum: `CREATED → READY → DOCTOR_JOINED | CUSTOMER_JOINED → IN_PROGRESS → ENDED | FAILED | EXPIRED`
- `recordingEnabled` column with **DB CHECK = false**
- RLS enabled on video tables (tenant policies from CR-RLS-96)

No new migrations planned for R4 Phase A unless waiting-room admit semantics require additive columns (plan only; implement under **CR-R4-IMPL-107**).

### 1.3 Events — implemented (emit); handlers stub

Outbox types in `apps/api/src/events/envelope.ts`:

`VIDEO_SESSION_CREATED`, `VIDEO_SESSION_READY`, `VIDEO_PARTICIPANT_JOINED`, `VIDEO_PARTICIPANT_LEFT`, `VIDEO_SESSION_STARTED`, `VIDEO_SESSION_ENDED`, `VIDEO_SESSION_FAILED`

Handlers in `apps/api/src/events/handlers.ts` are **log-only**. Notification kernel integration for consult reminders is **not implemented**.

### 1.4 Client surfaces — partial / stub

| App | Video UX today | Path |
|-----|----------------|------|
| web-doctor | Sandbox join button; shows session ref only; **no room UI** | `apps/web-doctor/src/encounter-panel.tsx` |
| mobile-doctor | Same stub | `apps/mobile-doctor/src/app-root.tsx` |
| web-customer | Appointment detail; **no video join** | `apps/web-customer/src/appointment-detail-page.tsx` |
| mobile customer | Appointment detail; **no video join** | `apps/mobile/src/customer-features.tsx` |
| web-admin | **No video session UI** (API exists) | — |

**Consent UX (prerequisite):** web + mobile customer consent for `telemedicine` / `consultation` — **done** (103/105).

**No client LiveKit SDK** in any app `package.json`.

### 1.5 Tests — backend green; no client video tests

| Suite | Path | Coverage |
|-------|------|----------|
| Video e2e | `apps/api/src/clinical/video.e2e.spec.ts` | Join auth, tokens, recording off, reconnect, webhooks, consent/policy denials, outbox |
| Token unit | `apps/api/src/clinical/livekit-token.spec.ts` | TTL, recording disabled |
| Status unit | `apps/api/src/clinical/video-status.spec.ts` | Transitions |

### 1.6 Infrastructure gaps

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` used in code; **not documented in `.env.example`**
- No LiveKit service in `docker-compose.yml` (local dev SFU optional under sandbox boundary)
- Blueprint [21](21_API_ARCHITECTURE.md) §15 paths (`/me/appointments/.../video/token`) **differ** from implemented `/appointments/:id/video/join` — **canonical contract is implemented API**, not blueprint §15

### 1.7 Explicitly out of existing repo

- Waiting room / doctor admit flow (product)
- Client WebRTC room UI
- Heartbeat / quality telemetry APIs
- Recording consent or storage
- TURN/STUN client configuration surface
- Consult reminder notifications
- Autonomous diagnosis, AI triage, auto-Rx

---

## 2. Engineering scope (authorized under CR-R4-IMPL-107)

R4 delivers **telemedicine video product** on top of existing kernels only. **No second identity, clinical access model, or video microservice.**

### 2.1 Shared / packages (minimal)

| Deliverable | Reuse | New work (plan) |
|-------------|-------|-----------------|
| Video session types | shell-core API types where possible | Thin shared join-response types for web + mobile clients |
| Video UI primitives | ui-kit states (loading, network, permission denied) | Consult room shell components (web); native consult shell (mobile) — **no new design system** |
| LiveKit client wrapper | — | App-local adapter using official LiveKit SDK (web + RN), consuming **existing join API only** |

### 2.2 Backend extensions (only if required for product; prefer existing APIs)

| Area | Default | Optional extension |
|------|---------|-------------------|
| Session lifecycle | Use existing join/leave/end/get | Add heartbeat **only** if reconnect UX requires server-side stale detection |
| Waiting room | Map to existing states (`READY`, `DOCTOR_JOINED`, `CUSTOMER_JOINED`) | Explicit admit endpoint **only if** state machine cannot express doctor-admits-patient |
| Provider | Keep `VideoProviderPort` + mock/LiveKit | No new provider unless OD-VID-01 selects non-LiveKit |
| Migrations | **None for Phase A** | Additive only if admit/waiting-room metadata needed |

**Hard rules:**

- Server-side `ClinicalAccessService.evaluateVideoJoin()` remains authoritative; clients may pre-check for UX but **must not bypass**
- Tenant scope from server context only; no client-supplied org/location for clinical access
- Tokens never logged, never in URLs, never in analytics payloads (extend redaction lists if new fields appear)
- Recording remains **OFF** at DB, token claims, and API response level

### 2.3 In scope by phase (implementation order under CR-R4-IMPL-107)

**Phase A — Sandbox product (mock provider default in dev)**

1. Customer web + mobile: appointment → waiting room → join (mock/media-less or simulated A/V) → leave
2. Doctor web + mobile: queue/detail → admit/waiting-room UX → join → end consultation (API `video/end`)
3. Reconnect: re-call join when token expired; surface session status from `GET .../video`
4. Fail-closed UX: 401/403/consent/policy/network/provider-unavailable states
5. Wire existing outbox events to notification kernel for **non-PHI** consult reminders (optional Phase A.5)

**Phase B — LiveKit sandbox (non-production SFU)**

1. Local/dev LiveKit (docker or cloud sandbox project) behind existing LiveKit provider
2. Real WebRTC A/V in clients using join response `ws_url` + `token`
3. Webhook-driven session end remains canonical
4. TURN config exposure **read-only from env/pack** when OD-VID-01 resolved

**Phase C — Production provider boundary (separate gate)**

See §5. Not part of CR-R4-IMPL-107 unless explicitly expanded.

### 2.4 Explicitly excluded from R4

- Rx, lab, radiology, CMS, CRM
- Live PSP, DHL, payouts, real money
- Recording enablement, storage, playback
- AI diagnosis, care navigation, autonomous triage
- New identity tables or duplicate customer/doctor users
- Blueprint §15 alternate route tree (unless deprecating old paths in a later CR)

---

## 3. Legal / compliance gates (must pass or be explicitly deferred)

| Gate | Requirement | Owner |
|------|-------------|-------|
| L-R4-01 | Telehealth / telemedicine **licensing per launch country** | Legal + clinical ops |
| L-R4-02 | Cross-border consult and media routing policy | Legal + DPO |
| L-R4-03 | Recording policy — **default OFF**; any future enablement requires separate CR + consent scope `RECORDING` | Legal |
| L-R4-04 | Patient information and consult disclaimers (approved copy, not placeholders) | Legal + product |
| L-R4-05 | App store / clinical-app claims review | Legal + product |
| L-R4-06 | Data retention for join audit logs and session metadata | DPO |
| L-R4-07 | Incident notification clocks if video processes PHI-adjacent metadata | Legal + security |

**Engineering may proceed with sandbox/mock under CR-R4-IMPL-107 only when:**

- L-R4-01 is **signed off for named sandbox country/pack**, **or**
- Humans explicitly defer L-R4-01 for **internal/sandbox-only** environments with no real patients (documented in CR-R4-IMPL-107)

**Production LiveKit / patient-facing launch requires L-R4-01 through L-R4-05 without deferral.**

---

## 4. Human decisions (open decisions — do not invent)

| ID | Decision | Blocks |
|----|----------|--------|
| **OD-VID-01** | LiveKit Cloud vs self-host vs hybrid | Production SFU, TURN regions, infra cost |
| **OD-VID-02** | Waiting room: doctor manual admit vs auto-join when both present | UX + optional API |
| **OD-VID-03** | Consult max duration / no-show handling (pack-driven) | Timeout jobs |
| **OD-VID-04** | Audio-only fallback when camera denied | Client UX |
| **OD-VID-05** | Chat fallback during video degradation (platform chat SoT vs in-call chat) | Scope of R4 vs later |
| **OD-COUNTRY-*** | Launch countries for telemedicine SKU | Policy packs `telemedicine_eligibility` |

Existing [35](35_OPEN_DECISIONS.md) country, brand, MoR, PSP decisions remain open and unchanged.

---

## 5. Mock / sandbox boundary

| Environment | Provider | SFU | Real WebRTC | Real patients |
|-------------|----------|-----|-------------|---------------|
| **CI / unit** | `MockVideoProvider` | No | No | No |
| **Local dev (default)** | Mock **or** LiveKit docker sandbox | Optional | Optional | No |
| **Staging sandbox** | LiveKit sandbox project | Yes | Yes | Synthetic / internal only |
| **Production** | LiveKit per OD-VID-01 | Yes | Yes | Yes — **separate production gate** |

**Sandbox rules:**

- `recording_enabled` always `false`; mock and LiveKit token claims must enforce
- No production API keys in repo; secrets via env only
- Mock provider must remain available for CI (124/124 regression)
- Client apps must support **mock mode** (no SFU) for deterministic tests

---

## 6. Production LiveKit / provider boundary

Production connection is **not authorized** by CR-R4-AUTH-106 or by CR-R4-IMPL-107 alone.

**Production checklist (future CR, e.g. CR-R4-PROD-108):**

1. L-R4-01 … L-R4-05 signed off for target country
2. OD-VID-01 resolved and infra runbook approved
3. LiveKit production project + key rotation documented
4. TURN/STUN provisioned per region
5. Webhook endpoint hardened (signature verify — already implemented; ops monitoring added)
6. Rate limits and WAF rules reviewed
7. RLS 8/8 + R3 13/13 + API regression green on release candidate
8. No recording enabled without **CR-RECORDING-*** authorization

---

## 7. Data / privacy / recording boundary

| Data | Storage | Client exposure | Logging |
|------|---------|-----------------|---------|
| Participant JWT | Ephemeral; server mint only | Memory only; refresh via re-join | **Never** |
| `ws_url`, room id | DB + join response | Join handshake only | Redacted |
| Join audit | `VideoJoinAudit` | None (admin read API) | Aggregates only |
| A/V media | SFU vendor plane | WebRTC only | **Never** in app logs |
| Clinical notes / Rx | Not R4 | — | — |
| Recording | **Disabled** | N/A | N/A |

**Recording:** OFF unless a future CR authorizes AND L-R4-03 satisfied AND ConsentGrant scope `RECORDING` exists AND pack allows. DB CHECK currently prevents `recordingEnabled = true`.

**PHI hygiene (carry forward from 105):** No raw clinical JSON in DOM; no tokens in URLs; extend `redact.ts` if new video fields added.

---

## 8. Customer UX (web + mobile)

### 8.1 Entry points

- Appointment list → appointment detail (existing)
- Online / telemedicine appointment types only (server enforces; client mirrors)

### 8.2 Flow (target)

1. **Pre-join checks (read-only):** consent status hint; policy closed → explain; too early → countdown to window
2. **Waiting room:** camera/mic permission in context; session status polling or lightweight subscribe; calm holding state ([78](78_HEALTHCARE_UI_UX_ARCHITECTURE.md))
3. **In consult:** timer; mute/camera; leave; reconnect banner; network degradation → audio-only per OD-VID-04
4. **Post-consult:** return to appointment detail; encounter status from existing API (no auto-complete on browser close)

### 8.3 States (mandatory)

Loading, empty, network error, 401 session expired, 403 consent/policy/relationship denied, provider unavailable (503), in-call reconnecting.

### 8.4 Files (planned touch under CR-R4-IMPL-107)

- `apps/web-customer/src/appointment-detail-page.tsx` — add join entry
- `apps/web-customer/src/care-api.ts` — video join/leave/get helpers
- New: `apps/web-customer/src/consult/` room + waiting room components
- `apps/mobile/src/customer-features.tsx` — appointment detail video entry
- `apps/mobile/src/care-api.ts` — video API parity

---

## 9. Doctor UX (web + mobile)

### 9.1 Entry points

- Appointments panel → encounter panel (existing)

### 9.2 Flow (target)

1. Clinical access banner (existing evaluate API — read-only display)
2. Encounter lifecycle: check-in → start consultation (existing) → **waiting room / admit** (OD-VID-02)
3. Join video → in-call controls → **end video** (`POST .../video/end`) → complete encounter (existing, separate action)
4. Reconnect + leave consistent with customer

### 9.3 Replace stub copy

Remove “LiveKit room UI is not included” placeholders from:

- `apps/web-doctor/src/encounter-panel.tsx`
- `apps/mobile-doctor/src/app-root.tsx`

### 9.4 Files (planned touch)

- `apps/web-doctor/src/encounter-panel.tsx`, `doctor-api.ts`
- `apps/mobile-doctor/src/app-root.tsx`, `doctor-api.ts`
- New consult room components (web + native)

---

## 10. Admin / ops visibility

**Phase A (minimal):**

- Read-only list/detail using existing admin API (`video:read`)
- No PHI in list columns: session id, status, timestamps, provider, appointment id (truncated/hashed display if needed)
- Link to existing audit trail surfaces where present

**Out of R4 scope:** live session monitoring, recording playback, quality dashboards (plan in [66](66_TELEMEDICINE_VIDEO.md) §5 for later).

---

## 11. Tests and acceptance criteria

### 11.1 Regression bars (must stay green)

| Suite | Target |
|-------|--------|
| API regression | ≥ 124/124 |
| RLS tenancy | 8/8 |
| R3 isolation | 13/13 |
| Typecheck | 18/18 |
| Customer web tests | Pass |
| Doctor web tests | Pass |
| Mobile customer tests | Pass |
| Doctor mobile typecheck | Pass |
| Web builds (customer, doctor, admin, store, join, vendor) | Pass |

### 11.2 New acceptance tests (under CR-R4-IMPL-107)

**API (extend existing):**

- Waiting room / admit transitions if new endpoints added
- Heartbeat stale session (if implemented)
- Customer end-to-end join denied without consent (already covered; keep)

**Client (new):**

- Web: waiting room renders; join calls API; 403 shows permission state; token not in DOM snapshot
- Mobile: same parity as web for join/leave/reconnect paths
- Mock mode: consult flow completes without LiveKit credentials

**Manual / staging:**

- Two-browser sandbox consult (doctor + customer) against LiveKit sandbox
- Webhook `room_finished` ends session server-side
- Reconnect after token expiry

### 11.3 Definition of done (R4 product — sandbox)

- [ ] Customer can join a sandbox consult from web and mobile for an online appointment with active consent
- [ ] Doctor can admit/join/end from web and mobile
- [ ] Server enforces consent, relationship, policy on every join
- [ ] Recording remains off everywhere
- [ ] No PHI/tokens in logs, URLs, or raw DOM dumps
- [ ] Mock provider CI path unchanged
- [ ] Legal gates documented as satisfied or deferred in CR-R4-IMPL-107

---

## 12. Reuse matrix (canonical kernels)

| Concern | Reuse | Do not duplicate |
|---------|-------|------------------|
| Identity / OTP | shell-core + shell-web | New auth tables |
| Appointments / encounters | `appointment.service.ts` | Parallel booking API |
| Consent | `consent.service.ts` + customer consent UX | New consent store |
| Clinical access | `clinical-access.service.ts` | Client-side bypass |
| Video sessions | `video.service.ts` + port | Second video module |
| Tenancy / RLS | existing Prisma + RLS tests | Client tenant scope |
| UI | ui-kit web/native | Parallel design system |
| Events | outbox + BullMQ | Ad-hoc video bus |
| Notifications | notification kernel (when wired) | New notification service |

---

## 13. Authorization chain

| CR | Purpose | Status |
|----|---------|--------|
| CR-PRE-R4-FIX-105 | Engineering gate | **Done** |
| **CR-R4-AUTH-106** | R4 plan + boundary (this document) | **Done — plan only** |
| **CR-R4-IMPL-107** | Begin R4 production **code** (sandbox-first) | **Not issued — required to code** |
| CR-R4-PROD-108 (proposed) | Production LiveKit + patient launch | Not issued |
| CR-RECORDING-* (proposed) | Any recording feature | Not issued; **forbidden** until legal |

---

## 14. STOP statement

**R4 production implementation is NOT started.**

No application code, migrations, LiveKit production rooms, or client SDK integration shall be merged under CR-R4-AUTH-106.

To begin coding: issue **`CR-R4-IMPL-107`** with explicit phase (A/B), environment (mock vs LiveKit sandbox), and legal gate disposition.

**FINAL STATUS: R4_PLAN_READY**
