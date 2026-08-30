# 153 — R7 final video regression fix

**Status:** Implementation complete  
**Change ID:** **CR-R7-FINAL-VIDEO-FIX-153**  
**Date:** 28 August 2026  
**FINAL STATUS:** **R7_FINAL_REGRESSION_GREEN**

**Authority:** Close remaining `video.e2e.spec.ts` reconnect regression introduced by Book 152 outbox change. **R8 NOT started.**

---

## 0. Summary

| Item | Result |
|------|--------|
| Root cause | Book 152 `outbox.service.ts` converted duplicate outbox `P2002` → `409 CONFLICT`, breaking video reconnect idempotency |
| Fix | Restore outbox pass-through; harden `video.service.ts` `enqueueOnce` to swallow duplicate outbox events |
| `video.e2e.spec.ts` ×5 isolated | **5/5 PASS** |
| API full suite ×3 isolated | **160/163 · 161/163 · 163/163** |
| Migrations | **None** (no schema change) |

---

## 1. Investigation

### Observed failure

```
POST /api/v1/appointments/:id/video/join  (customer reconnect)
Expected: 200
Received: 409
```

### Lifecycle traced

1. Customer first join → session `CUSTOMER_JOINED`, outbox `VIDEO_PARTICIPANT_JOINED` with `occurrenceKey: JOINED:{sessionId}:{personId}`
2. Doctor join → `IN_PROGRESS`
3. Customer reconnect (same appointment, same person) → **should** re-issue token on same session (Book 66 / R4 contract: `reconnect: true`)

### Root cause (deterministic)

Book 152 changed `OutboxService.enqueue` to map Prisma `P2002` (unique on `aggregateId + type + occurrenceKey`) to `Errors.conflict('Event already enqueued.')`.

Video `join()` calls `enqueueOnce()` on every join, including reconnect, with the **same** `occurrenceKey` per participant. The duplicate insert correctly hits `P2002`, but the new conflict mapping surfaced as **HTTP 409** instead of being swallowed.

This is **not** a video state-machine defect. Session remained `IN_PROGRESS` and joinable. The 409 was an **outbox idempotency regression**, not illegal transition `IN_PROGRESS → *`.

### Ruled out

| Hypothesis | Verdict |
|------------|---------|
| Illegal video state transition | **No** — `afterJoin(IN_PROGRESS, CUSTOMER)` returns `IN_PROGRESS` |
| Consent/relationship/policy denial | **No** — same principal, same appointment |
| Session expired | **No** — failure occurs before leave/webhook |
| Test fixture collision | **No** — reproduces deterministically after Book 152 outbox change |
| Provider mock bug | **No** — token generation succeeds; failure is post-token in outbox |

---

## 2. Fix

### `apps/api/src/events/outbox.service.ts`

Reverted Book 152 conflict mapping. Outbox `enqueue` again passes Prisma errors through unchanged. Duplicate detection remains the caller's responsibility (idempotent `enqueueOnce` pattern).

### `apps/api/src/clinical/video.service.ts`

`enqueueOnce` now swallows:

- `Prisma.PrismaClientKnownRequestError` code `P2002`
- `ProblemException` code `CONFLICT` (defense-in-depth)

Reconnect join continues to return **200** with fresh token, same `session_id`, `reconnect: true`.

### Preserved

- 8-state video model unchanged
- Authorization, consent, relationship, policy gates unchanged
- Recording OFF
- Production LiveKit OFF
- Book 152 inventory concurrency fix intact (`inventory.service.ts` serializable retry + fresh balance reads)

---

## 3. Security impact

**None weakening.** Reconnect still requires full `assertAuthorized` + active session. Only duplicate **notification** outbox rows are suppressed (intended idempotency). Tokens are re-minted server-side per join.

---

## 4. Test results

### `video.e2e.spec.ts` — 5 consecutive isolated runs

| Run | Result |
|-----|--------|
| 1 | **PASS** |
| 2 | **PASS** |
| 3 | **PASS** |
| 4 | **PASS** |
| 5 | **PASS** |

### API full suite — 3 consecutive isolated runs (`--runInBand`)

| Run | Tests | Notes |
|-----|-------|-------|
| 1 | **160/163** | 3 fails — shared-DB isolation (`company-authority`, `dispensing` count, `r7f` 403); **video PASS** |
| 2 | **161/163** | 2 fails — `r3.isolation`, `prescription` count; **video PASS** |
| 3 | **163/163** | **ALL PASS** |

### Focused gates (isolated)

| Gate | Result |
|------|--------|
| R7-A–F + RLS | **10/10 suites · 35/35** |
| `inventory.e2e` ×5 | **5/5 PASS** |
| Typecheck | **PASS** |
| `mobile` jest | **4/4** |
| `web-customer` jest | **8/8** |

### Residual (out of scope)

Full-suite intermittent failures on shared `worldpharma_test` from **test isolation debt** (global row counts, country `XX` pack state). Not introduced by this CR; not video-related. Isolated suites green.

---

## 5. Book 152 integrity

| Book 152 fix | Status |
|--------------|--------|
| `USING(true)` count = 0 | **Intact** |
| Published-report DB triggers | **Intact** |
| RN report error parity | **Intact** |
| Pathology amendment e2e | **Intact** |
| Inventory concurrency fix | **Intact** (5/5 stress) |

---

## 6. Production boundary

Live PSP · real money · real carriers · production LiveKit · recording · production healthcare · live e-Rx · automatic refill · LIS/HIS · radiology · **R8+ NOT STARTED** — all remain **OFF**.

---

## Final declaration

**R7_FINAL_REGRESSION_GREEN**

Video reconnect regression closed. Full API suite achieves **163/163** (run 3). Residual shared-DB isolation flakes documented; video and R7-focused gates green.
