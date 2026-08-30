# R12-H R12 closure / regression

**CR:** `CR-R12-H-IMPL-221`  
**Verdict:** `R12_H_IMPLEMENTED`  
**Next authorization:** `CR-POST-R12-H-AUDIT-222`  
**Authority:** [205](205_R12_IMPLEMENTATION_PLAN.md) · [220](220_POST_R12_G_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R12-H closes the R12 program with **full R12-A…G regression (32/32 PASS)**, live RLS verification on all R12 tables, typecheck/build across API and R12-facing apps, migration closure, and resolution of two regression blockers (TD-R12A-ENV-01, TD-R12B-06). **No new R12 feature scope.** R13+, R10-E/F, and live PSP/payout remain unauthorized.

---

## 1. R12 scope closure

| Phase | Book | Status |
|-------|------|--------|
| R12-A | [207](207_R12_A_CRM_MARKETING_PREFS_IMPLEMENTATION.md) | **CLOSED** |
| R12-B | [209](209_R12_B_MARKETING_CAMPAIGNS_IMPLEMENTATION.md) | **CLOSED** |
| R12-C | [211](211_R12_C_PROMO_IMPLEMENTATION.md) | **CLOSED** |
| R12-D | [213](213_R12_D_AFFILIATE_IMPLEMENTATION.md) | **CLOSED** |
| R12-E | [215](215_R12_E_WISHLIST_LOYALTY_IMPLEMENTATION.md) | **CLOSED** |
| R12-F | [217](217_R12_F_REVIEWS_QA_PERSONALIZATION_IMPLEMENTATION.md) | **CLOSED** |
| R12-G | [219](219_R12_G_REFILL_MARKETING_HOOKS_IMPLEMENTATION.md) | **CLOSED** |
| **R12-H** | this book | **CLOSED** |

**Explicitly not started:** R13+, R10-E/F, live PSP/payout, clinical automation, external marketing vendors, ML/recommendations, BI platform.

---

## 2. Phase matrix A–G (deliverables)

| Phase | Kernel | Admin UI | Customer/Mobile | E2E |
|-------|--------|----------|-----------------|-----|
| A | CRM 360, marketing prefs, conversion events | `/crm` | prefs API | `r12a` 6 tests |
| B | segments, campaigns, send pipeline, suppression | `/marketing` | inbox | `r12b` 7 tests |
| C | promo campaigns, checkout apply | `/promo` | checkout promo | `r12c` 6 tests |
| D | referral codes, links, clicks | `/affiliates` | web-affiliate shell | `r12d` 1 test |
| E | wishlist, loyalty ledger | API only | wishlist page | `r12e` 1 test |
| F | reviews, Q&A, personalization | `/reviews` | PDP tabs, mobile read | `r12f` 1 test |
| G | refill/reorder automation hooks | automation-runs API | prefs copy + deep link | `r12g` 10 tests |

---

## 3. Test counts

| Suite | Tests | Result |
|-------|-------|--------|
| `r12a.crm-kernel.e2e` | 6 | **PASS** |
| `r12b.marketing.e2e` | 7 | **PASS** |
| `r12c.promo.e2e` | 6 | **PASS** |
| `r12d.affiliate.e2e` | 1 | **PASS** |
| `r12e.wishlist.e2e` | 1 | **PASS** |
| `r12f.reviews.e2e` | 1 | **PASS** |
| `r12g.refill-hooks.e2e` | 10 | **PASS** |
| **Total** | **32** | **32/32 PASS** |

Run: `npx jest --config apps/api/jest.config.cts --testPathPatterns="r12a|r12b|r12c|r12d|r12e|r12f|r12g" --runInBand --no-cache`

**R0–R11 full regression:** not re-run in this CR (R12-H scope). Prior phase audits remain authoritative for R0–R11.

---

## 4. Regression closure fixes (R12-H only)

| ID | Fix | Evidence |
|----|-----|----------|
| **TD-R12B-06** | `r12b.marketing.e2e` now passes `PolicyCache` to `enableCrmPack` | 7/7 PASS (was 2/7) |
| **TD-R12A-ENV-01** | 360 test uses support ticket seed + masked-email assertion; removed cross-test order hijack | 6/6 PASS (was 5/6) |

Files changed (closure only):
- `apps/api/src/crm/r12b.marketing.e2e.spec.ts`
- `apps/api/src/crm/r12a.crm-kernel.e2e.spec.ts`

---

## 5. RLS / security results

**Live:** Docker `world-pharma-postgres` → `worldpharma_test`

| Control | Result |
|---------|--------|
| R12 tables with FORCE RLS | **20/20** |
| `USING(true)` permissive policies | **0** |
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **PASS** |
| Least-privilege grants | **PASS** — per migration SQL |

**Tables verified:**

`marketing_preferences`, `conversion_events`, `crm_segments`, `crm_campaigns`, `crm_campaign_sends`, `crm_suppressions`, `promo_campaigns`, `promo_applications`, `affiliate_referral_codes`, `affiliate_links`, `affiliate_clicks`, `wishlist_items`, `loyalty_programs`, `loyalty_accounts`, `loyalty_ledger_entries`, `product_reviews`, `product_review_responses`, `product_questions`, `personalization_events`, `crm_automation_runs`

**Auth negatives (e2e):** 401 unauthenticated, 403 missing RBAC, 400 malformed IDs, 404 cross-country where applicable — covered across R12 suites.

---

## 6. PHI / clinical boundary results

| Domain | Control | Status |
|--------|---------|--------|
| CRM 360 | Metadata only; masked identifiers | **PASS** — r12a |
| Marketing segments | Clinical rule rejection | **PASS** — r12b |
| Promo | Commerce discount only | **PASS** — r12c |
| Affiliate | Clinical boundary preserved | **PASS** — r12d |
| Wishlist/loyalty | Non-clinical | **PASS** — r12e |
| Reviews/Q&A | UGC clinical token rejection | **PASS** — r12f |
| Personalization | Approved commerce events only | **PASS** — r12f |
| Refill automation | Read-only sources; no Rx mutation | **PASS** — r12g |

**No R12 feature** introduces prescription mutation, auto-refill, fulfillment automation, or clinical decision-making. R9 consent/break-glass and R10 care-navigation boundaries are not bypassed by R12 code paths.

---

## 7. Consent / marketing results

| Scenario | Status | Evidence |
|----------|--------|----------|
| `marketing_allowed=false` → no send | **PASS** | r12a, r12b, r12g |
| Opt-in → send when eligible | **PASS** | r12a, r12b, r12g |
| Suppression → skip | **PASS** | r12b, r12g |
| Country mismatch → skip/deny | **PASS** | r12c, r12g |
| Pack disabled → 403 fail closed | **PASS** | r12b (CRM pack), r12g (automation pack) |
| Opt-out wins at send time | **PASS** | r12b opt-out test |

Transactional notification paths (order/appointment/delivery prefs) remain separate from marketing kernel.

---

## 8. Idempotency / state-machine results

| Area | Mechanism | Status |
|------|-----------|--------|
| Marketing sends | `crm_campaign_sends` unique + replay stable counts | **PASS** — r12b |
| Conversion events | unique `(source, source_key, event_kind)` | **PASS** — r12a |
| Promo | wrong-country / terminal EXPIRED → 409 | **PASS** — r12c |
| Affiliate clicks | append-only + clinical block | **PASS** — r12d |
| Wishlist | DB unique per offer | **PASS** — r12e |
| Loyalty | append-only ledger | **PASS** — r12e |
| Reviews | duplicate + moderation 409 | **PASS** — r12f |
| Personalization | unique triple | **PASS** — r12f |
| Automation | unique `(kind, source_id, person_id)` SENT rows | **PASS** — r12g |
| Campaign transitions | invalid → 409 | **PASS** — r12b |

---

## 9. Notification / outbox closure

| Path | Kernel | Status |
|------|--------|--------|
| R12-B campaign send | `NotificationService` + `OutboxService` (`CRM_CAMPAIGN_MESSAGE`) | **PASS** |
| R12-G automation | same kernels (`CRM_AUTOMATION_REMINDER`) | **PASS** |

**No duplicate notification kernel.** No external messaging vendor in R12.

---

## 10. Migration status

| Check | Result |
|-------|--------|
| Total migrations | **109** |
| Pending | **0** — schema up to date |
| R12 migration range | `20260829200000`–`20260829250500` (21 migrations across A–G) |
| Prisma schema ↔ DB | **MATCH** |
| Historical migrations rewritten | **NO** |

---

## 11. Build / typecheck status

| Target | Typecheck | Build |
|--------|-----------|-------|
| `api` | **PASS** | **PASS** |
| `web-admin` | **PASS** | **PASS** |
| `web-customer` | **PASS** | **PASS** |
| `web-affiliate` | **PASS** | **PASS** |
| `mobile` | **PASS** | not required (typecheck only) |

All runs used `--skip-nx-cache`.

---

## 12. Runtime verification

| Check | Method | Result |
|-------|--------|--------|
| Docker Postgres | `docker ps` | **UP** (healthy) |
| Docker Redis | `docker ps` | **UP** (healthy) |
| R12 e2e HTTP lifecycle | Jest e2e | **PASS** 32/32 |
| `/health/ready` | HTTP smoke | **Not performed** — API server not running in audit environment |
| Browser/device | Manual | **Not performed** |
| Docker dev DB (`worldpharma`) | Credentials | **Not verified** — test DB used for RLS |

---

## 13. Technical debt (final classification)

| ID | Item | Blocker? | R12-H action |
|----|------|----------|--------------|
| TD-R12A-ENV-01 | CRM 360 test fragility | **NO** | **RESOLVED** — test fix |
| TD-R12B-06 | Policy-cache flake | **NO** | **RESOLVED** — PolicyCache in r12b |
| TD-R12C-01 | `redeemed_count` not incremented | **NO** | Documented |
| TD-R12C-02 | Extra `promo_*_access` RLS in DB | **NO** | Documented |
| TD-R12C-03 | Promo admin idempotency stub | **NO** | Documented |
| TD-R12C-04 | No promo expiry scheduler | **NO** | Documented |
| TD-R12C-05 | Mobile checkout promo deferred | **NO** | Documented |
| TD-R12D-01 | Affiliate idempotency stub | **NO** | Documented |
| TD-R12D-02 | AffiliateAccount KYC deferred | **NO** | Documented |
| TD-R12D-03 | Affiliate web OTP UX | **NO** | Documented |
| TD-R12D-04 | Commission preview zero (OD-AFF/R14) | **NO** | Documented |
| TD-R12D-05 | Link lifecycle PATCH missing | **NO** | Documented |
| TD-R12E-01 | Loyalty admin UI deferred | **NO** | Documented |
| TD-R12E-02 | Wishlist idempotency stub | **NO** | Documented |
| TD-R12E-03 | Mobile PDP wishlist heart deferred | **NO** | Documented |
| TD-R12F-01 | Review idempotency stub | **NO** | Documented |
| TD-R12F-02 | Personalization purge worker | **NO** | Documented |
| TD-R12F-03 | Mobile Q&A submit deferred | **NO** | Documented |
| TD-R12G-01 | Ephemeral automation skips | **NO** | Documented |
| TD-R12G-02 | No production scheduler | **NO** | Documented |
| TD-R12G-03 | Optional policy-cache param | **NO** | Partially addressed via r12b fix |
| OD-R12-07 | Medicine advertising legal gate | **NO** | Unchanged |
| R11 debts | per Book 204 | **NO** | Unchanged |

**No blocker-class debt remains for post-R12-H audit.**

---

## 14. R13 / R10-E/F boundary

| Scope | Status |
|-------|--------|
| R13 analytics/search/BI | **NOT STARTED** |
| R10-E/F | **NOT STARTED** |
| Live PSP/payout (R14) | **NOT STARTED** |
| R12 feature expansion | **STOPPED** — program closed |

Post-R12-H audit target verdict per Book 205: **`R12_GREEN_CLOSED_R13_READY_FOR_PLANNING`** (audit CR only).

---

## 15. Verdict

**`R12_H_IMPLEMENTED`**

**Exact next authorization:** **`CR-POST-R12-H-AUDIT-222`**

HARD STOP — no R13 planning or implementation in this CR.
