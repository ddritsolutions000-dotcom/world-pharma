# Sprint 104 — Communications Multi-Portal Reliability + Timeout Closure

**Status:** COMPLETE  
**S86 multi-portal partner hop:** **PASS**  
**Composes / does not redo:** S103 (architecture untouched)  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`  
**Real messages sent:** **NO**

---

## Original S86 failure (from S103 report)

- **Test:** `S86 real OTP login flows › customer + partners sandbox OTP login, invalid OTP, recovery`
- **Symptom:** timeout / `Send OTP remained disabled (likely OTP cooldown)`
- **Failing step:** `s61LoginPortal` during partner hops (vendor → doctor → lab → imaging → affiliate)
- **Initially labeled:** environment timeout

---

## Reproduction

Reproduced independently with API + portals running:

1. Customer sandbox OTP + invalid OTP + recovery — **PASS**
2. Partner hop failed at doctor (`:3002`) with Send OTP stuck disabled
3. Vendor (`:3004`) could hydrate; doctor HTML served but **client chunks 404**

---

## Root cause (compound)

### A. Test harness defect (`s61LoginPortal`) — classification **E**

Prior helper:

1. Pre-filled email with `pressSequentially`
2. Called `loginPortal` → `uiOtpLogin` (`.fill()` on React-controlled input)
3. On failure, retried `uiOtpLogin` on the same page → Send OTP disabled / cooldown noise

Also: blind `/login` navigation **404s** on doctor/lab/imaging/affiliate (auth is on `/`; only vendor has `/login`).

### B. Environment / stale Next.js — classification **F**

Doctor (and similarly lab/imaging/affiliate when stale):

- SSR HTML returned 200 with Email + disabled Send OTP
- `/_next/static/chunks/main-app.js` (and related CSS/JS) returned **404**
- Input had **no** `__react*` props → **no hydration** → OTP form permanently disabled
- Stale `next-dev` PID survived soft restarts until hard kill + `.next` clean restart

### C. Small application fix — classification **A** (latent)

`DoctorShell` called `usePathname()` **after** early auth returns (Rules of Hooks). Moved to unconditional top-of-component. Does not weaken security.

---

## Fix applied

| Change | Path |
|--------|------|
| Rewrite `s61LoginPortal` | `apps/web-customer/e2e/helpers/s61-ui.ts` |
| Auth surface: `/` then `/login` | same |
| `pressSequentially` (no fill-based `uiOtpLogin`) | same |
| Hydration gate (React props on Email) | same |
| Clear `rl:*` + `otp:*` rate keys | same |
| API readiness probe in S86 | `s86-communications.spec.ts` |
| `usePathname` unconditional | `apps/web-doctor/src/doctor-shell.tsx` |
| Restart stale partner portals | ops (doctor/lab/radiology/affiliate) |

**No** S103 communications architecture changes. **No** invented providers. **No** real messages.

---

## Timeout taxonomy (observed)

| Kind | Example in this sprint |
|------|-------------------------|
| Test-harness timeout | Email wait / Send OTP enabled wait |
| Readiness timeout | Hydration gate (client assets) |
| Environment | Stale Next chunk 404 |
| Auth timeout | N/A after fix |
| Server/API timeout | N/A (API 401 probe OK) |

Customer-facing errors unchanged; no stack traces exposed; OTP values not logged or screenshotted.

---

## Security verification

- Customer denied Admin (`security-16-customer-denied-admin`)
- Partner portals authenticate with their own sandbox emails; no Admin provider controls granted
- OTP never appears in page assertions / shots (`ensureNoOtpLeak`)
- Production rails remain EXTERNAL_GATED

---

## Communications regression (S103 intact)

- OTP/SMS/EMAIL/PUSH: NOT_SELECTED / EXTERNAL_GATED
- SENT ≠ DELIVERED preserved
- Playwright S103 **2/2 PASS**

---

## Verification evidence

| Check | Result |
|-------|--------|
| S86 full suite | **3/3 PASS** |
| Playwright S103+S89+S87 | **7/7 PASS** |
| Unit (S103/S89/S86/S87/S100/S101 patterns) | **27/27 PASS** |
| Screenshots | `apps/test-results/s104-reliability-shots/` (incl. partner-11…15 + responsive 390/768/1024/1440) |
| Status | `apps/test-results/s104-reliability/final-reliability-status.json` |
| Master Index | **#402** |
| Native | **DEVICE_NOT_AVAILABLE** |

---

## Explicit production state (unchanged)

```
REAL OTP/SMS/EMAIL/PUSH PROVIDER SELECTED = NO
PRODUCTION OTP/SMS/EMAIL/PUSH ENABLED = NO
REAL MESSAGES SENT = NO
CAN_PRODUCTION_LAUNCH = NO
force_launch_available = false
```

**S86 FINAL RESULT = PASS**

STOP — do **not** start Sprint 105.
