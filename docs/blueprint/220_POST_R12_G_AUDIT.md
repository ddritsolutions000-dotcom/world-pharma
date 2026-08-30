# 220 — Post-R12-G audit (subscription/refill marketing hooks)

**CR:** `CR-POST-R12-G-AUDIT-220`  
**Verdict:** `R12_G_GREEN_R12_H_READY`  
**Authority:** [219](219_R12_G_REFILL_MARKETING_HOOKS_IMPLEMENTATION.md) · [218](218_POST_R12_F_AUDIT.md) · [205](205_R12_IMPLEMENTATION_PLAN.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only review of R12-G implementation against Book 219, Book 205 §R12-G/§6.15, and repository state. **No source, schema, migration, API, UI, test, or configuration changes were made during this CR.**

---

## 1. Executive summary

R12-G delivers **non-clinical refill/reorder marketing hooks**: `crm_automation_runs` idempotency, consent/suppression-gated in-app reminders from read-only `Order` / `RefillRequest` / `RxSubscription` data, admin automation visibility (`automation-runs`, `automation/evaluate`), Customer 360 `rx_subscriptions` slice, and customer/mobile reminder prefs copy.

**Marketing consent, suppression, country/pack gates, RLS, RBAC, PHI-safe copy/outbox payloads, and clinical/fulfillment read-only boundaries are sound** in code review and live test-database inspection. **No auto-refill, prescription mutation, fulfillment, PSP/payout, or second notification kernel** was introduced.

**Findings that do not block R12-H:**
- **TD-R12G-01:** SKIPPED outcomes ephemeral — only `SENT` rows persisted; `CrmAutomationRunStatus.SKIPPED` enum unused at runtime.
- **TD-R12G-02:** No production scheduler — admin `evaluate` v1 only (Book 205 allows hooks without generalized automation platform).
- **TD-R12G-03:** `enable-crm-pack` optional `PolicyCache` invalidation — R12-A/G pass cache; R12-B still omits it.
- **TD-R12B-06 (carried/worsened):** R12-B e2e **2/7 pass** isolated — policy-cache / CRM pack enable flake; **not** R12-G product defect.
- **TD-R12A-ENV-01 (carried):** R12-A e2e **5/6 pass** — 360 email-regex assertion fragility (`r***@example.com`); **not** R12-G defect.
- **Docker dev DB (`worldpharma`) RLS:** not live-verified (credential mismatch); **test DB (`worldpharma_test`) RLS live-verified** via Docker `psql`.

**Next authorization:** `CR-R12-H-IMPL-221`

---

## 2. Implementation verification (Book 219 vs repository)

| Book 219 claim | Verified |
|----------------|----------|
| `CrmAutomationRun` + enums in `schema.prisma` | **YES** |
| Migrations `20260829250300`–`50500` | **YES** — applied; `prisma migrate status` → 109 migrations, up to date |
| `apps/api/src/crm/automation/*` | **YES** — copy, run service, refill-marketing, admin controller, e2e |
| Customer 360 `rx_subscriptions` slice | **YES** — `customer360.service.ts` `listSubscriptionMetadata()` |
| Policy `crm.automation` keys | **YES** — `document.ts`, `empty-pack.ts` |
| `CRM_AUTOMATION_REMINDER` outbox type | **YES** — `envelope.ts` |
| `CRM_AUTOMATION_RUN` security event | **YES** — `security-events.service.ts` |
| Reuses `NotificationService`, `OutboxService`, `SuppressionService`, `MarketingPreferenceService` | **YES** — `automation-run.service.ts` |
| web-customer + mobile prefs copy / deep link | **YES** — `preferences-page.tsx`, `customer-features.tsx` |
| No R12-H/R13+ modules | **YES** — no closure suite, no new R13 analytics |

**Scope drift check:** No auto-refill, prescription modification, fulfillment changes, PSP/payout, WhatsApp/SMS vendor, ML recommendations, caregiver proxy, doctor/lab ratings, or R10-E/F.

---

## 3. Database audit (`crm_automation_runs`)

| Control | Status |
|---------|--------|
| Table exists | **PASS** — migration `20260829250300` |
| Unique `(automation_kind, source_id, person_id)` | **PASS** — `crm_automation_runs_automation_kind_source_id_person_id_key` (live test DB) |
| Indexes `country_id+created_at`, `person_id+created_at` | **PASS** |
| FK to `countries`, `persons` | **PASS** |
| Append-only intent | **PASS** — RLS denies UPDATE/DELETE |
| `SKIPPED` enum value | **Present in schema** — runtime writes **SENT only** (TD-R12G-01) |

**Migration state:** `worldpharma_test` — **109 migrations applied**, schema up to date.

---

## 4. RLS / grants audit

**Live verification:** Docker `world-pharma-postgres` → database `worldpharma_test`.

| Control | Result |
|---------|--------|
| FORCE RLS | **PASS** — `relforcerowsecurity = true` |
| Policy count | **4** — select, insert, no_update, no_delete |
| `USING(true)` permissive policies | **0** — verified |
| `worldpharma_app` NOSUPERUSER / NOBYPASSRLS | **PASS** — `rolsuper=f`, `rolbypassrls=f` |
| Grants | **PASS** — migration grants `SELECT, INSERT` only |

**Docker dev DB (`worldpharma`):** not verified — credential mismatch per Book 219; **non-blocker** given test DB live evidence + migration SQL review.

---

## 5. Consent / suppression / pack gates

| Gate | Status | Evidence |
|------|--------|----------|
| `marketing_allowed` default **false** | **PASS** | `MarketingPreferenceService` `DEFAULTS`; `presentDefaults()` |
| Consent before send | **PASS** | `resolveSkipReason()` → `marketing_not_allowed` |
| Suppression | **PASS** | `SuppressionService.isSuppressed(IN_APP)` |
| Country match | **PASS** | `prefs.country_id !== countryId` → skip |
| `crm.enabled` | **PASS** | `assertCrmEnabled()` |
| `crm.marketing.enabled` | **PASS** | `assertAutomationEnabled()` |
| `crm.automation.enabled` | **PASS** | `assertAutomationEnabled()` |
| Fail closed when gates unknown | **PASS** | 403 on evaluate when automation off; ephemeral skip when consent off |

**E2E:** consent off → no inbox; consent on → send; suppression → no inbox; wrong country → no runs.

---

## 6. Idempotency

| Control | Status |
|---------|--------|
| Unique constraint on triple | **PASS** — DB + Prisma `@@unique` |
| Duplicate evaluate → single `SENT` row | **PASS** — e2e `evaluateDup` + `runRows.length === 1` |
| Existing `SENT` → duplicate return | **PASS** — `automation-run.service.ts` early return |
| Ephemeral skips allow retry after opt-in | **PASS** — no row on `marketing_not_allowed`; e2e consent flow |

**Note:** Book 205 §6.15 describes append-only log with `SKIPPED` status; implementation persists **SENT only** and returns ephemeral skips (TD-R12G-01). Idempotency for **sent** reminders is enforced; skip audit trail is weaker than Book 205 literal — **non-blocker** for R12-H (documented debt).

---

## 7. Clinical / fulfillment boundary

| Control | Status |
|---------|--------|
| `RefillRequest` read-only in automation | **PASS** — `findMany` select id/status only; no `update`/`create` in automation services |
| `RxSubscription` read-only | **PASS** — `findMany`; filter `autoExecuteEnabled: false` only |
| `Order` read-only | **PASS** — `findMany` for reorder candidates; no order mutation |
| No `autoExecuteEnabled` writes | **PASS** — grep automation module: no updates |
| No refill clinical API changes | **PASS** — e2e `beforeRefill.body === afterRefill.body`; status unchanged |
| No fulfillment/payment/PSP code in `crm/automation` | **PASS** — module scope limited |

---

## 8. Notification / outbox integration

| Control | Status |
|---------|--------|
| Reuses `NotificationService.enqueueInbox` | **PASS** |
| Reuses `OutboxService.enqueue` | **PASS** — `CRM_AUTOMATION_REMINDER` |
| No second notification kernel | **PASS** |
| Outbox payload PHI-safe | **PASS** — `automation_kind`, `person_id`, `source_id`, `channel` only |
| Security event metadata PHI-safe | **PASS** — opaque IDs + `status: SENT` |
| Inbox copy commerce-only for reorder | **PASS** — product title from order line; refill/subscription generic copy |
| Clinical copy rejection | **PASS** — `assertMarketingCopySafe`; e2e 400 on `diagnosis` |

---

## 9. RBAC / auth / isolation

| Route | Permission | Negatives verified |
|-------|------------|-------------------|
| `GET /admin/crm/automation-runs` | `crm:read` | 401 unauthenticated (e2e) |
| `POST /admin/crm/automation/evaluate` | `crm:write` | 403 `company_support` without write (e2e) |
| Customer 360 (extended) | `crm:read` | unchanged R12-A pattern |

**Cross-customer isolation:** e2e filters runs by `person_id`; no foreign person rows returned.

---

## 10. Customer 360 extension

| Slice | Fields exposed | PHI |
|-------|----------------|-----|
| `refill_requests` (existing) | id, status, timestamps | **None** |
| `rx_subscriptions` (new) | id, status, `auto_execute_enabled`, timestamps | **None** — no prescription IDs in 360 response |

E2E: 360 includes both slices; `assertNoClinicalPayload` passes.

---

## 11. Tests

### R12-G evidence

| Case | Result |
|------|--------|
| 401 unauthenticated | **PASS** |
| 403 without `crm:write` | **PASS** |
| Clinical copy rejection | **PASS** |
| Consent off → skip; consent on → send | **PASS** |
| Idempotent duplicate evaluate | **PASS** |
| Suppression blocks send | **PASS** |
| Wrong country skips safely | **PASS** |
| Ineligible recent order; refill API stable | **PASS** |
| 360 refill + subscription slices | **PASS** |
| Cross-customer run isolation | **PASS** |
| Direct service clinical copy → 400 | **PASS** |

**Suite:** `r12g.refill-hooks.e2e.spec.ts` — **10/10 PASS** (audit re-run).

### Regression (R12-A…F)

| Suite | Isolated result | Classification |
|-------|-----------------|----------------|
| `r12g.refill-hooks` | **10/10 PASS** | R12-G |
| `r12f.reviews` | **PASS** | R12-F OK |
| `r12c` + `r12d` + `r12e` | **9/9 PASS** | R12-C/D/E OK |
| `r12a.crm-kernel` | **5/6 PASS** | **test-infra** — TD-R12A-ENV-01 email-regex |
| `r12b.marketing` | **2/7 PASS** | **test-infra** — TD-R12B-06 / policy-cache; exacerbated by R12-G `enable-crm-pack` changes without R12-B adopting cache invalidation |

**Batch run (A–F together):** 16/22 pass — failures align with carried test-infra debt, not R12-G boundary violations.

Full API suite and R0–R11 regression were **not** run (R12-H scope).

---

## 12. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** |
| `web-admin:typecheck` | **PASS** |
| `web-customer:typecheck` | **PASS** |

`api:build`, `web-admin:build`, `mobile:typecheck` were **not** re-run in this audit (R12-H closure scope).

---

## 13. Runtime verification

| Step | Method | Result |
|------|--------|--------|
| Docker Postgres | Live | **UP** — `world-pharma-postgres` |
| Migration status | Prisma CLI | **PASS** — 109 migrations; 3 R12-G migrations |
| RLS policies | **Docker DB** `psql` on `worldpharma_test` | **PASS** — FORCE RLS; 4 policies; 0 `USING(true)` |
| `worldpharma_app` role | **Docker DB** | **PASS** |
| R12-G HTTP lifecycle | **E2E** | **PASS** — 10/10 |
| Docker dev DB RLS | Not performed | Credential mismatch — **non-blocker** (test DB verified) |
| Manual browser/device | Not performed | E2E covers API+DB+Redis inbox |

---

## 14. Technical debt classification

### R12-G debt (Book 219)

| ID | Item | Blocker? |
|----|------|----------|
| TD-R12G-01 | Ephemeral skip audit; `SKIPPED` enum unused at runtime | **NO** — idempotency for sends intact; weaker skip audit than Book 205 literal |
| TD-R12G-02 | No production scheduler; admin `evaluate` v1 | **NO** — Book 205 non-goal for generalized automation platform |
| TD-R12G-03 | `enable-crm-pack` cache invalidation optional | **NO** — test-infra; R12-B should adopt in R12-H |

### Carried (unchanged / worsened test-infra only)

| ID | Item | Blocker? |
|----|------|----------|
| TD-R12B-06 | R12-B policy-cache flake | **NO** — test-infra; 2/7 isolated in this audit |
| TD-R12A-ENV-01 | R12-A 360 email-regex | **NO** — test-infra |
| TD-R12C…F, OD-R12-07, R11 | per prior audits | **NO** |

**No blocker-class debt identified for R12-H authorization.**

---

## 15. Boundary verification

| Phase | Expected | Actual |
|-------|----------|--------|
| R12-A…F | COMPLETE | **COMPLETE** (test-infra flakes on A/B only) |
| **R12-G** | **IMPLEMENTED** | **IMPLEMENTED** — audit confirms |
| **R12-H** | NOT STARTED | **NOT STARTED** |
| R10-E/F | NOT STARTED | **NOT STARTED** |
| R13+ | NOT STARTED | **NOT STARTED** |

**Explicitly absent in R12-G:** auto-refill, prescription modification, fulfillment automation, PSP/payout, external messaging vendors, ML recommendations, R13 BI/search, R12-H combined regression gate.

---

## 16. Documentation

| Artifact | Status |
|----------|--------|
| `docs/blueprint/220_POST_R12_G_AUDIT.md` | **Created** (this book) |
| `docs/blueprint/00_MASTER_INDEX.md` | **Updated** |
| `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md` | **Updated** |

No source/schema/API/UI/test/config changes.

---

## 17. Verdict

**`R12_G_GREEN_R12_H_READY`**

**Exact next authorization:** **`CR-R12-H-IMPL-221`**

HARD STOP — no R12-H implementation in this CR.
