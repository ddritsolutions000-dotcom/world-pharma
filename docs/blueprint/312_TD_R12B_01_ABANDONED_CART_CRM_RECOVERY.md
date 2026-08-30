# CR-312 — TD-R12B-01 Abandoned-Cart CRM Recovery Wiring

**Status:** `CART_ABANDON_RECOVERY_COMPLETE`  
**Verdict:** Abandoned-cart analytics signal now bridges to canonical CRM automation kernel via outbox.

## Pre-audit summary

| Question | Answer |
|----------|--------|
| A. `CART_ABANDONED` fires? | Yes — `AnalyticsIngestService.recordAbandonedCarts()` during daily ingest |
| B. CRM handler consumed it? | **No (before CR-312)** — analytics-only |
| C. Gap real? | **Yes** — conversion event recorded, no recovery automation |
| D. Canonical kernel | `AutomationRunService.attemptRun()` |
| E. Automation kind | New `CrmAutomationKind.CART_ABANDON_RECOVERY` (migration 149) |
| F. Scheduler vs immediate? | Timing via analytics ingest (Book 223 stale-cart scan); recovery dispatched after ingest via outbox |
| G. Required data | `checkoutSessionId`, `customerPersonId`, `cartId`, `countryId` |
| H. Consent/suppression | Existing `resolveSkipReason()` in `AutomationRunService` |
| I. Idempotency | Outbox `occurrenceKey` + `crmAutomationRun` unique `(kind, sourceId, personId)` |
| J. Country/tenant | `countryId` on outbox + tenant context in ingest/recovery |
| K. Migration | **Yes** — enum value only (149) |
| L. Authorized | Book 205 §3.1 + TD-R12B-01 deferred scope |

## Architecture

```
Analytics ingest (stale checkout scan)
  → CART_ABANDONED conversion event (preserved)
  → CRM_CART_ABANDON_RECOVERY outbox (occurrenceKey per session)
  → CartAbandonRecoveryDispatchService handler
  → AbandonedCartRecoveryService.attemptRecovery()
  → AutomationRunService.attemptRun(CART_ABANDON_RECOVERY)
  → in-app inbox + CRM_AUTOMATION_REMINDER outbox
```

Policy gates: `crm.enabled`, `marketing.enabled`, `automation.enabled` (fail-closed default OFF in empty pack).

## Files changed

- `packages/database/prisma/schema.prisma` — `CART_ABANDON_RECOVERY` enum
- `packages/database/prisma/migrations/20260830250000_r12b_cart_abandon_recovery/`
- `apps/api/src/crm/automation/abandoned-cart-recovery.service.ts`
- `apps/api/src/crm/automation/cart-abandon-recovery-dispatch.service.ts`
- `apps/api/src/crm/automation/cart-abandon-recovery.config.ts`
- `apps/api/src/crm/automation/automation-copy.ts`
- `apps/api/src/analytics/analytics-ingest.service.ts`
- `apps/api/src/crm/crm.module.ts`
- `apps/api/src/crm/automation/cart-abandon-recovery.e2e.spec.ts`

## Tests

- Focused: `cart-abandon-recovery.e2e.spec.ts` **8/8 PASS**
- Regression: r13e analytics, r12g refill-hooks, crm-automation-scheduler, r12b marketing **PASS**
- Campaign scheduler: **TEST-INFRA** — 2097 scan occurrence keys pre-published in shared DB (pre-existing pollution, not CR-312 regression)

## Next genuine gap

Rank by fresh audit: `LAB_REPORT_PUBLISHED` notification payload parity (minor), logistics async queue producers (low).

**Next action:** Audit `LAB_REPORT_PUBLISHED` notification payload for `customer_person_id` parity with imaging amend path.
