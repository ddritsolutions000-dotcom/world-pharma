# R12-G Subscription/refill marketing hooks

**CR:** `CR-R12-G-IMPL-219`  
**Verdict:** `R12_G_IMPLEMENTED`  
**Next authorization:** `CR-POST-R12-G-AUDIT-220`  
**Authority:** [205](205_R12_IMPLEMENTATION_PLAN.md) · [218](218_POST_R12_F_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

R12-G delivers **non-clinical refill/reorder marketing hooks**: idempotent automation runs, consent/suppression-gated in-app reminders from purchase history and read-only `RefillRequest` / `RxSubscription` status, admin automation visibility, Customer 360 refill/subscription slices, and customer/mobile reminder prefs copy. **No** auto-refill, clinical mutation, fulfillment, PSP, or R12-H/R13+ scope.

---

## 1. Files changed

### Database

- `packages/database/prisma/schema.prisma` — `CrmAutomationRun`, `CrmAutomationKind`, `CrmAutomationRunStatus`
- `packages/database/prisma/migrations/20260829250300_r12g_automation_schema/migration.sql`
- `packages/database/prisma/migrations/20260829250400_r12g_automation_rls/migration.sql`
- `packages/database/prisma/migrations/20260829250500_r12g_automation_grants/migration.sql`

### API

- `apps/api/src/crm/automation/automation-copy.ts` — PHI-safe commerce copy helpers
- `apps/api/src/crm/automation/automation-run.service.ts` — idempotent send orchestration
- `apps/api/src/crm/automation/refill-marketing.service.ts` — evaluate + list runs
- `apps/api/src/crm/automation/admin-automation.controller.ts` — admin endpoints
- `apps/api/src/crm/automation/r12g.refill-hooks.e2e.spec.ts`
- `apps/api/src/crm/customer360.service.ts` — `rx_subscriptions` metadata slice
- `apps/api/src/crm/crm.module.ts`
- `apps/api/src/policy/document.ts`, `empty-pack.ts` — `crm.automation` pack keys
- `apps/api/src/events/envelope.ts` — `CRM_AUTOMATION_REMINDER`
- `apps/api/src/identity/security-events.service.ts` — `CRM_AUTOMATION_RUN`
- `apps/api/src/test/enable-crm-pack.ts` — automation enable + policy cache invalidation fix

### Web customer + mobile

- `apps/web-customer/src/preferences-page.tsx` — reorder/refill reminder copy + `/prescriptions` deep link
- `apps/mobile/src/customer-features.tsx` — reminder prefs caption

### Documentation

- `docs/blueprint/219_R12_G_REFILL_MARKETING_HOOKS_IMPLEMENTATION.md` (this book)
- `docs/blueprint/00_MASTER_INDEX.md`
- `docs/blueprint/93_GLOBAL_IMPLEMENTATION_ROADMAP.md`

---

## 2. Automation kinds

| Kind | Source (read-only) | Copy | Deep link |
|------|-------------------|------|-----------|
| `REORDER_REMINDER` | `Order` + `OrderItem.title` (eligible status, age ≥ pack days) | Commerce SKU title only | In-app inbox `reference_type=reorder_reminder` |
| `REFILL_STATUS_NUDGE` | `RefillRequest` status `REQUESTED`/`APPROVED` | No Rx/medication names | `reference_type=refill_reminder` → prescriptions |
| `SUBSCRIPTION_REMINDER` | `RxSubscription` `ACTIVE`, `autoExecuteEnabled=false` | Settings reminder only | `reference_type=subscription_reminder` → prescriptions |

---

## 3. Consent / suppression

| Gate | Behavior |
|------|----------|
| `marketing_preferences.marketing_allowed` | Default **false**; fail closed |
| Suppression list | `SuppressionService.isSuppressed` → skip |
| Country match | `country_id` must match evaluate country |
| Pack | `crm.enabled`, `crm.marketing.enabled`, `crm.automation.enabled` |
| Skip persistence | Consent/suppression skips are **ephemeral** (no DB row) to allow retry after opt-in |
| Send persistence | **SENT** rows only — unique `(automation_kind, source_id, person_id)` |

Transactional refill/clinical notifications remain outside this pipeline.

---

## 4. API routes

| Method | Route | Auth | Permission |
|--------|-------|------|------------|
| GET | `/api/v1/admin/crm/automation-runs` | admin JWT | `crm:read` |
| POST | `/api/v1/admin/crm/automation/evaluate` | admin JWT | `crm:write` |
| GET | `/api/v1/admin/crm/customers/:personId` | admin JWT | `crm:read` — now includes `rx_subscriptions` |

Existing customer refill/clinical routes **unchanged**.

---

## 5. RLS / grants

`crm_automation_runs`: **FORCE RLS**, append-only (no update/delete policies), `SELECT` for worker/platform/person/country, `INSERT` for worker/platform + country check. Grants: `SELECT, INSERT` to `worldpharma_app`.

---

## 6. Clinical / fulfillment boundary

- **Read-only** `RefillRequest`, `RxSubscription`, `Order` metadata
- **No** prescription state changes, auto-execute, fulfillment, orders, or payments
- Outbox/security payloads: opaque IDs + `automation_kind` only
- `assertMarketingCopySafe` rejects clinical tokens in reminder copy

---

## 7. Tests

| Suite | Result |
|-------|--------|
| `r12g.refill-hooks.e2e` | **10/10 PASS** |
| `r12b.marketing.e2e` | **PASS** (regression) |
| `r12f.reviews.e2e` | **PASS** (regression) |
| `r12a.crm-kernel.e2e` | **5/6 PASS** — 360 email-regex assertion pre-existing fragility (TD-R12A-ENV-01) |

R12-G coverage: consent off/on, suppression, wrong country, idempotency, ineligible sources, clinical copy rejection, no refill/order mutation, RBAC negatives, cross-customer run isolation, outbox/inbox integration.

---

## 8. Typecheck / build

| Target | Result |
|--------|--------|
| `api:typecheck` | **PASS** |
| `web-admin:typecheck` | **PASS** (no admin UI changes) |
| `web-customer:typecheck` | **PASS** |

---

## 9. Runtime verification

| Check | Result |
|-------|--------|
| Migrations (test DB `worldpharma_test`) | **109 applied** incl. R12-G |
| E2E HTTP lifecycle | **PASS** (`r12g` + targeted R12-B/F) |
| RLS live (Docker dev DB) | **Not verified** — dev DB credentials differ; test DB migrations + RLS SQL reviewed |

---

## 10. Technical debt

| ID | Item |
|----|------|
| TD-R12G-01 | SKIPPED automation outcomes ephemeral (consent/suppression) — only SENT rows persisted for idempotency; audit trail for skips relies on evaluate response counts |
| TD-R12G-02 | No production scheduler/worker cron — evaluate is admin-triggered v1 |
| TD-R12G-03 | `enable-crm-pack` policy-cache invalidation optional param — adopted by R12-A/G tests |

Carried: TD-R12A-ENV-01, TD-R12B-06, TD-R12C…F debt unchanged.

---

## 11. R12-H boundary

R12-G ends at marketing hooks + admin visibility. **Not started:** R12-H closure/regression book, combined `r12*.e2e` gate, web-affiliate full suite, `R12_GREEN_CLOSED_R13_READY_FOR_PLANNING`.

---

## 12. Verdict

**`R12_G_IMPLEMENTED`** — exact next authorization: **`CR-POST-R12-G-AUDIT-220`**

HARD STOP — no R12-H or R13+.
