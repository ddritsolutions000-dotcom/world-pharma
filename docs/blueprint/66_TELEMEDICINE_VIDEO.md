# 66 — Telemedicine and video

**Status:** Blueprint — product plan in [106](106_R4_TELEMEDICINE_IMPLEMENTATION_PLAN.md); backend foundation implemented (P2-HC-3); client room UI not started  
**Related:** [64](64_PHASE_2_MASTER_PLAN.md) · [08](08_DOCTOR_PLATFORM.md) · [29](29_INFRASTRUCTURE_ARCHITECTURE.md) · [43](43_ECOSYSTEM_BASELINE_LOCK.md)

Platform **does not build an SFU**. Locked media direction: **LiveKit (or equivalent WebRTC SFU)** + TURN. In-house SFU is out of scope.

**LEGAL/COMPLIANCE REVIEW REQUIRED** for telehealth eligibility, recording, and cross-border media routing.

---

## 1. Layers

| Layer | Owner |
| --- | --- |
| Product orchestration | `care` / `video` module: session, tokens, states, consent |
| Media plane | SFU vendor (LiveKit), TURN/STUN |
| Identity | Short-lived room tokens; kernel JWT never sent to SFU as long-lived secret |
| Recording | Off by default; object store if ever enabled |

---

## 2. Production-grade requirements

| Topic | Design |
| --- | --- |
| Transport | WebRTC via SFU; simulcast / adaptive bitrate |
| Network | Quality scores (packet loss, RTT, bitrate); degrade to audio; low-bandwidth mode |
| NAT | TURN required; regional TURN **OD-VID-01** |
| Reconnect | Client ICE restart + rejoin same `VideoSession`; server holds room until timeout |
| Devices | Camera/mic permission UX; fail closed if policy requires video and device denied |
| Waiting room | Patient waits; doctor admits; both tokens scoped to `appointment_id` |
| Timeout | Pack `consult.max_minutes` + grace; auto-complete or no-show per policy |
| Fallback | Audio-only; chat-only if pack allows |

---

## 3. Call states (server)

```
CREATED → WAITING_PATIENT / WAITING_DOCTOR → LIVE → RECONNECTING → COMPLETED
                                              ↓
                                           FAILED / EXPIRED / CANCELLED
```

**Completion:** only `Encounter.complete` (doctor or system after policy timeout). **Browser close or payment redirect is not completion.**

---

## 4. Recording

**Default: OFF.** Consult continues if recording is denied.

If a pack ever sets `recording.allowed=true`:

- Explicit ConsentGrant `scope=RECORDING`
- Encryption at rest
- Retention class from pack
- Access = encounter parties + break-glass
- Audit every play/download
- Never in OpenSearch or CRM

---

## 5. Quality / observability

Metrics (no PHI): join time, reconnect count, bitrate, freeze, MOS proxy, error codes. Correlate `appointment_id` / `session_id` only.

---

## 6. Security

Room tokens TTL minutes. Room names are opaque IDs. No patient name in SFU metadata if avoidable. Rate-limit token mint. MFA for doctor app.

---

## 7. Open

SFU vendor contract; TURN regions; chat-only SKU; recording legal basis per country.
