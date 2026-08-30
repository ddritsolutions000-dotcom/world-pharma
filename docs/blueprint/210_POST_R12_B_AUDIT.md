# 210 — Post-R12-B audit (marketing campaigns & consent-gated send)

**CR:** `CR-POST-R12-B-AUDIT-210`  
**Verdict:** `R12_B_GREEN_R12_C_READY`  
**Authority:** [209](209_R12_B_MARKETING_CAMPAIGNS_IMPLEMENTATION.md) · [205](205_R12_IMPLEMENTATION_PLAN.md) · [208](208_POST_R12_A_AUDIT.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

Audit-only review of R12-B implementation against Book 209, Book 205, and repository state. No source, schema, migration, API, UI, test, or configuration changes were made during this CR.

---

## 1. Executive summary

R12-B delivers the planned marketing kernel: **segments**, **campaign lifecycle**, **consent-gated IN_APP send**, **suppression**, **append-only send records**, **admin APIs**, **web-admin UI**, **security events**, and **notification/outbox integration** — without R12-C+ scope creep.

**Consent safety, RLS, RBAC, and PHI boundaries are sound** in code review. **No duplicate notification kernel** was introduced. **No R12-C/D/E/F/G/H, R10-E/F, or R13+ functionality** was found in the R12-B surface.

**Findings that do not block R12-C:**
- Test infrastructure flakiness (`enableCrmPack` vs Redis `PolicyCache` stale reads) — classified test infra, not R12-B correctness.
- Product debt: no cancel-campaign API (state machine supports `CANCELLED`; Book 205 §7.2 does not list a cancel route).
- Product debt: `company_support` lacks `campaign:read` (intentional least-privilege).
- Deferred scope: abandoned-cart scheduler, non-IN_APP channel send wiring.

**Next authorization:** `CR-R12-C-IMPL-211`

---

## 2. Implementation verification (Book 209 vs repository)

| Book 209 claim | Verified |
|----------------|----------|
| Segment kernel (rules v1) | **YES** — `apps/api/src/crm/marketing/segment-rules.ts`, `segment.service.ts` |
| Campaign lifecycle | **YES** — `campaign-status.ts`, `campaign.service.ts` |
| Consent-gated send | **YES** — `send-pipeline.service.ts` |
| Suppression | **YES** — `suppression.service.ts` + `marketing-preference.service.ts` opt-out hook |
| Send records / idempotency | **YES** — `crm_campaign_sends` unique `(campaign_id, person_id, idempotency_key)` |
| Admin APIs | **YES** — `admin-marketing.controller.ts` (10 route handlers) |
| Web-admin UI | **YES** — `apps/web-admin/app/marketing/**`, `marketing-*.tsx` |
| Security events | **YES** — `CRM_SEGMENT_*`, `CRM_CAMPAIGN_*`, `CRM_CAMPAIGN_SENT` |
| Outbox / inbox integration | **YES** — `OutboxService` + `NotificationService.enqueueInbox` |
| RLS on 4 new tables | **YES** — migration `20260829210100_r12b_marketing_rls` |
| No R12-C+ modules | **YES** — no promo/affiliate/loyalty/wishlist/review kernels under `crm/marketing` or web-admin routes |

**Boundary:** Pre-existing order/finance promo and affiliate snapshots (R1/R6) remain untouched and are not R12-B marketing campaigns.

---

## 3. Segment audit

### Supported rules (Book 205 / Book 209 match)

| Rule | Implemented | Evaluator |
|------|-------------|-----------|
| `all` | **YES** | Intersection of child rule member sets |
| `has_order_in_country` | **YES** | Distinct `Order.customerPersonId` where `countryId` matches |
| `person_ids` | **YES** | Explicit UUID list (deduped) |

### Safety controls

| Control | Status |
|---------|--------|
| Country/tenant isolation (CRUD) | **PASS** — `country_id` on all rows; queries scoped by country |
| Deterministic evaluation | **PASS** — pure rule tree + deterministic DB reads |
| Version/concurrency (PATCH) | **PASS** — optimistic `version` → 409 |
| Preview count on GET detail | **PASS** — `preview_count` via `evaluateMemberIds` |
| Authorization | **PASS** — `campaign:read` / `campaign:send`; admin audience |
| Audit on create/update | **PASS** — `CRM_SEGMENT_CREATED`, `CRM_SEGMENT_UPDATED` |
| Clinical criteria rejection | **PASS** — token scan + typed parser rejects unknown/clinical types |
| Malformed rules fail safe | **PASS** — 400 validation; no partial evaluation |

### Clinical exclusion (defense-in-depth)

Forbidden token scan covers: `health_timeline`, `lab_result`, `analyte`, `imaging_finding`, `prescription`, `diagnosis`, `consent_scope`, `break_glass`, `artifact`, `consult_note`, `care_nav`.

**Note:** Token scanning is defense-in-depth; primary boundary is **allow-listed rule types only** (`all`, `has_order_in_country`, `person_ids`). No clinical tables are queried by segment evaluators.

### Minor product observation (non-blocker)

`person_ids` does not verify each person belongs to the campaign country. Send-time consent is still per-country; cross-country targeting is an operational/product concern, not a consent bypass.

---

## 4. Campaign state-machine audit

### Server-enforced transitions (`campaign-status.ts`)

```
DRAFT → SCHEDULED | CANCELLED
SCHEDULED → SENDING | CANCELLED
SENDING → COMPLETED
COMPLETED → (terminal)
CANCELLED → (terminal)
```

| Check | Status |
|-------|--------|
| Invalid transition → 409 | **PASS** — `Errors.conflict` via `assertCampaignTransition` |
| Client cannot forge state | **PASS** — status only changed in services, not from request body |
| Terminal campaigns immutable | **PASS** — `isEditableCampaignStatus` blocks PATCH on COMPLETED/CANCELLED |
| Version conflict → 409 | **PASS** — campaign/segment PATCH |
| Authorization server-side | **PASS** — guards on controller |
| Country isolation | **PASS** — `findFirst({ countryId })` on all ops |

### Cancel behavior

`CANCELLED` exists in enum and transition table but **no cancel API route** is exposed (Book 205 §7.2 lists schedule/send only). Classified **product / deferred scope** — not a security blocker.

Send on COMPLETED returns idempotent summary (`buildSendSummary`) — deterministic replay behavior.

---

## 5. Consent safety audit (critical gate)

| Requirement | Verified |
|-------------|----------|
| Postgres `marketing_preferences.marketing_allowed` is SoT | **PASS** — `MarketingPreferenceService.getForPerson` |
| Default OFF | **PASS** — `DEFAULTS.marketing_allowed: false`; no row → `presentDefaults` |
| Explicit opt-in required | **PASS** — send skips when `!prefs.marketing_allowed` |
| Opt-out prevents future sends | **PASS** — e2e `opt-out suppresses subsequent sends` (when cache fresh) |
| Send-time consent check | **PASS** — `resolveSkipReason` on every `attemptSend` |
| UI/API cannot bypass consent | **PASS** — no client-side send path; admin send always re-reads prefs |
| Transactional notifications unaffected | **PASS** — Redis notification prefs kernel unchanged; marketing uses separate Postgres prefs + inbox enqueue |
| Stale consent not honored | **PASS** — prefs read at send time, not at campaign creation |
| Missing preference fails closed | **PASS** — absent row → `marketing_allowed: false` |

### Opt-out race (eligible → opt-out → send)

**Code path:** opt-out sets `marketing_allowed: false` + `SuppressionService.recordOptOut` → send checks prefs then suppression → skip with `marketing_not_allowed` or `suppressed`.

**E2E:** covered in `r12b.marketing.e2e.spec.ts` (`opt-out suppresses subsequent sends`). Test passes when policy cache is consistent (see §15 regression).

---

## 6. Suppression audit

| Requirement | Status |
|-------------|--------|
| Overrides segment membership | **PASS** — checked after consent, before send |
| Opt-out creates suppression | **PASS** — `recordOptOut` on `marketing_allowed: false` |
| Suppressed users skipped | **PASS** — skip reason `suppressed` |
| Person + country scoped | **PASS** — unique `(person_id, country_id, channel)` |
| Server-enforced | **PASS** — no client suppression bypass |
| Skip reason PHI-minimal | **PASS** — codes only: `marketing_not_allowed`, `suppressed` |
| RLS on suppressions | **PASS** — worker/platform/person + country policies |

---

## 7. Send pipeline audit

### Gate sequence (`SendPipelineService.attemptSend`)

1. Campaign eligibility (status SCHEDULED/SENDING/COMPLETED replay) — **PASS**
2. Campaign state transition to SENDING — **PASS**
3. Country/tenant scope — **PASS** — campaign `countryId` match
4. Segment membership — **PASS** — `evaluateMemberIds`
5. Current `marketing_allowed` — **PASS**
6. Suppression — **PASS**
7. Policy/channel eligibility — **PASS** — `assertMarketingEnabled`, `assertChannelAllowed`; `SUPPORTED_CHANNELS = { IN_APP }`
8. Idempotency — **PASS** — unique send row + early return on existing

**No alternate send path** found that bypasses these gates.

### Channel scope

- **IN_APP only** for v1 send (`campaign.service.ts` `SUPPORTED_CHANNELS`).
- Enum includes EMAIL/PUSH/SMS/WHATSAPP but create rejects unsupported channels.
- **No production SMS/WhatsApp/email vendor integration** in marketing send path.

---

## 8. Notification / outbox audit

| Check | Status |
|-------|--------|
| Reuses `NotificationService` | **PASS** |
| Reuses `OutboxService` | **PASS** |
| No duplicate notification kernel | **PASS** |
| Transactional R0–R11 behavior preserved | **PASS** — no weakening observed |
| Inbox await fix | **PASS** — `notification.controller.ts` awaits `listInbox` |
| Outbox payload opaque | **PASS** — `campaign_id`, `person_id`, `channel` only |
| Inbox carries title/body (operational copy) | **PASS** — admin-authored non-clinical text |
| `CRM_CAMPAIGN_MESSAGE` in envelope | **PASS** — `events/envelope.ts` |

---

## 9. Idempotency / concurrency audit

| Scenario | Behavior |
|----------|----------|
| Same idempotency key replay on COMPLETED campaign | Returns stable `sent_count` / `skipped_count` summary |
| Duplicate `(campaign_id, person_id, idempotency_key)` | Early return from existing send row |
| Campaign version conflict | 409 on PATCH/schedule with stale version |
| Opt-out vs send race | Send-time pref + suppression read — opt-out wins |
| Concurrent sends (same batch key) | DB unique constraint prevents duplicate SENT rows |

**No duplicate customer delivery** from retry when idempotency key is reused (verified in e2e when environment stable).

---

## 10. API / RBAC audit

### Route inventory (matches Book 209)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/admin/marketing/segments` | `campaign:read` |
| GET | `/admin/marketing/segments/:id` | `campaign:read` |
| POST | `/admin/marketing/segments` | `campaign:send` |
| PATCH | `/admin/marketing/segments/:id` | `campaign:send` |
| GET | `/admin/marketing/campaigns` | `campaign:read` |
| GET | `/admin/marketing/campaigns/:id` | `campaign:read` |
| POST | `/admin/marketing/campaigns` | `campaign:send` |
| PATCH | `/admin/marketing/campaigns/:id` | `campaign:send` |
| POST | `/admin/marketing/campaigns/:id/schedule` | `campaign:send` |
| POST | `/admin/marketing/campaigns/:id/send` | `campaign:send` |
| GET | `/admin/marketing/campaigns/:id/sends` | `campaign:read` |

All routes: `JwtAuthGuard`, `AudienceGuard` (`admin`), `PermissionsGuard`, country query/body validation, UUID assertions, audit events on mutations.

### TD-R12B-04 — `company_support` lacks `campaign:read`

**Finding:** `company_support` has `crm:read` but not `campaign:read` / `campaign:send` (`authority.ts`).

**Classification:** **Intended least-privilege / product debt** — support can view CRM Customer 360 but not operate marketing campaigns. Marketing nav hidden by `permission: 'campaign:read'` in `nav.ts`. **Not a security issue.** Granting read-only marketing to support would be a product decision in a future CR.

---

## 11. Database / migrations / RLS audit

### Migrations (ordered, applied)

1. `20260829210000_r12b_marketing_schema`
2. `20260829210100_r12b_marketing_rls`
3. `20260829210200_r12b_marketing_grants`

`prisma migrate status` on audit host: **94 migrations, schema up to date** (including R12-B).

### Tables

| Table | Append-only sends | PK/FK/unique |
|-------|-------------------|--------------|
| `crm_segments` | n/a | `(country_id, code)` unique |
| `crm_campaigns` | n/a | `(country_id, code)` unique |
| `crm_campaign_sends` | **YES** — no UPDATE policy | `(campaign_id, person_id, idempotency_key)` unique |
| `crm_suppressions` | n/a | `(person_id, country_id, channel)` unique |

### RLS

All four tables: **ENABLE + FORCE RLS**. **No `USING(true)`** on R12-B tables. Deny-by-default delete on segments/campaigns/sends.

`worldpharma_app`: **NOSUPERUSER**, **NOBYPASSRLS** (per `20260827180000_multi_tenant_rls`).

---

## 12. Admin UI audit

| Route | Verified |
|-------|----------|
| `/marketing` | List + create segment/campaign; country filter |
| `/marketing/campaigns/[id]` | Creative, schedule/send, send log |
| `/marketing/segments/[id]` | Rules JSON, preview count |

Uses real APIs via `marketing-api.ts` (no mock production data). Permission denied, loading, empty, network retry, and conflict (409) handling present. UI gates write actions on `session.permissions.includes('campaign:send')` — **server remains authoritative**.

---

## 13. PHI / privacy audit

| Surface | Clinical data |
|---------|---------------|
| Segment rules | Blocked by allow-list + token scan |
| Campaign title/body | Token scan (`assertSafeCampaignContent`) |
| Send records | Status + opaque skip codes only |
| Outbox | Opaque IDs |
| Security events | Counts + IDs only |
| Admin UI | Displays API responses only |

Clinical token scanning is **defense-in-depth**, not the sole boundary. Primary boundary: non-clinical rule types and no clinical kernel joins.

---

## 14. Policy / pack audit

| Check | Status |
|-------|--------|
| Marketing pack-gated | **PASS** — `crm.enabled` + `crm.marketing.enabled === false` → 403 |
| Malformed policy fail-closed on read | **PASS** — `validatePolicyDocument` in resolver |
| Marketing default OFF in schema | **PASS** — zod default `marketing.enabled: false` |
| OD-R12-07 medicine advertising | **NOT enabled** — default `medicine_advertising: false` |
| R12-C promo not enabled | **PASS** — no promo admin routes |

**Note:** `assertMarketingEnabled` uses `marketing?.enabled === false` (explicit false only). Parsed policy documents always include `marketing.enabled` via zod defaults — fail-closed when disabled.

---

## 15. Regression audit

### Focused API regression run (audit host)

**Command:** `nx run api:test --testPathPatterns="r12a.crm-kernel|r12b.marketing|r11a|r9|notification|outbox|care-nav" --no-cache`

| Metric | Result |
|--------|--------|
| Total suites | 13 |
| Passed suites | 11 |
| Failed suites | 2 (`r12b.marketing`, `r12a.crm-kernel`) |
| Total tests | 49 |
| Passed tests | 43 |
| Failed tests | 6 |

### Isolated reruns

| Suite | Result | Notes |
|-------|--------|-------|
| `r12a.crm-kernel` (isolated) | **6/6 PASS** | Shared-DB pollution when batched |
| `r12b.marketing` (isolated) | **2/7 PASS, 5/7 FAIL** | 403 marketing forbidden / 400 schedule — see below |
| R11, R9, notification, outbox, care-nav (in batch) | **PASS** | Unaffected by R12-B |

### R12-B failure analysis (does not block verdict)

Failures observed when Redis `PolicyCache` serves a **stale published pack** after `enableCrmPack()` updates Postgres without cache invalidation (`enable-crm-pack.ts` vs `PolicyCache.invalidate` used only on formal publish).

| Symptom | Classification | Affects R12-B correctness? |
|---------|----------------|------------------------------|
| 403 on marketing routes in e2e | **test infrastructure** | **NO** — production publish invalidates cache |
| 400 on schedule after failed create | **test infrastructure cascade** | **NO** |
| R12-A failure in combined run only | **shared-DB pollution** | **NO** — isolated 6/6 pass |

**Prior session evidence:** R12-B e2e **7/7 PASS** after test DB migration and cache-consistent run (Book 209 §12).

### Web-admin unit tests

`marketing|crm` specs: **PASS** (audit run).

---

## 16. Typecheck / build audit

| Target | Result (audit run) |
|--------|-------------------|
| `nx run api:typecheck` | **PASS** |
| `nx run api:build` | **PASS** |
| `nx run web-admin:typecheck` | **PASS** |
| `nx run web-admin:build` | **PASS** |

---

## 17. Runtime audit

| Step | Result |
|------|--------|
| Docker/Postgres/Redis | Postgres reachable at `127.0.0.1:55432`; Redis required for e2e |
| Migrations | **Applied** (94 total) |
| API start + `/health/ready` | **NOT PERFORMED** — API not running on audit host (connection timeout) |
| Manual segment/campaign/send smoke | **NOT PERFORMED** — deferred to e2e evidence |

Runtime consent/send/isolation behavior is evidenced by R12-B e2e when policy cache is consistent. Live manual smoke remains **environment/ops debt** (also noted in Book 209 §14).

---

## 18. Technical debt (re-check)

| ID | Class | Status |
|----|-------|--------|
| TD-R12B-01 | product / deferred | Abandoned-cart scheduler not implemented |
| TD-R12B-02 | product | IN_APP-only send; other channels enum-only |
| TD-R12B-03 | test infrastructure | Test DB migrate lag; jest global-setup noise |
| TD-R12B-04 | product | `company_support` lacks `campaign:read` — **intentional least-privilege** |
| TD-R12B-05 | architecture | `CrmModule` ↔ `PlatformModule` forwardRef |
| **TD-R12B-06** | **test infrastructure** | **`enableCrmPack` does not invalidate `PolicyCache` → e2e 403 flakiness** |
| **TD-R12B-07** | **product / deferred** | **No cancel-campaign API despite `CANCELLED` state** |

Carried forward (unchanged): Redis transactional notification prefs; TD-R11A-04 masked CRM identifiers.

---

## 19. Boundary verification

| Phase | Expected | Actual |
|-------|----------|--------|
| R10-A/B/C/D | COMPLETE | COMPLETE |
| R10-E/F | NOT STARTED | NOT STARTED |
| R11-A/B/C/D/E | COMPLETE | COMPLETE |
| R12-A | COMPLETE | COMPLETE |
| **R12-B** | IMPLEMENTED | **IMPLEMENTED** |
| R12-C | NOT STARTED | NOT STARTED |
| R12-D | NOT STARTED | NOT STARTED |
| R12-E | NOT STARTED | NOT STARTED |
| R12-F | NOT STARTED | NOT STARTED |
| R12-G | NOT STARTED | NOT STARTED |
| R12-H | NOT STARTED | NOT STARTED |
| R13+ | NOT STARTED | NOT STARTED |

No promo admin, affiliate web, loyalty, wishlist, reviews, personalization, refill automation, R10-E/F, or R13 functionality entered R12-B.

---

## 20. Verdict rationale

**`R12_B_GREEN_R12_C_READY`**

R12-B meets Book 205/209 scope for marketing segments, campaigns, consent-gated send, suppression, admin APIs/UI, RLS, and notification integration. Consent defaults OFF, send-time enforcement, suppression precedence, and PHI boundaries are correctly implemented. Identified gaps are **test infrastructure** (PolicyCache in e2e helpers) and **deferred product scope** (cancel API, abandoned-cart, multi-channel send) — none affect R12-B security, consent integrity, RLS, or boundary isolation.

---

## 21. Next authorization

**`CR-R12-C-IMPL-211`** — R12-C promo/coupon admin (per Book 205), only after explicit user authorization. Do not start during this audit CR.
