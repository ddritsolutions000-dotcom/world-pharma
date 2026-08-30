# 108 — Post-R4 sandbox + ecosystem audit

**Status:** Read-only audit complete  
**Change ID:** **CR-POST-R4-AUDIT-108**  
**Date:** 27 August 2026  
**Authority:** Inspection + regression only. **No production code, migrations, R5, production LiveKit, recording, Rx/lab/radiology/CMS/CRM, live PSP/DHL/payouts.**

**Supplements:** [100](100_GLOBAL_UI_UX_COMPLETENESS_AUDIT.md) · [95](95_GLOBAL_CURRENT_STATE_AUDIT.md) · [107](107_R4_TELEMEDICINE_SANDBOX_IMPLEMENTATION.md) · [106](106_R4_TELEMEDICINE_IMPLEMENTATION_PLAN.md) · [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md) · [97](97_MULTI_TENANT_RLS_RETROFIT_IMPLEMENTATION.md) · [88](88_GLOBAL_APPLICATION_TOPOLOGY.md) · [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)

**Bases:** CR-R4-IMPL-107, CR-R4-AUTH-106, CR-PRE-R4-FIX-105, CR-PRE-R4-FINAL-104, CR-RLS-96, CR-R3-HARDEN-99, CR-R3-IMPLEMENT.

---

## 0. Final status

**ECOSYSTEM_AUDIT_WITH_BLOCKERS**

| Gate | Result |
|------|--------|
| R4 sandbox did not regress API / RLS / R3 / clients | **PASS** |
| Sandbox money / carrier / video / recording boundaries | **HOLD** (correctly off / mock) |
| Production-ready claim | **FAIL** (none qualify — expected) |
| Remaining engineering + legal blockers before next production wave | **YES** (documented §L–M) |

**This audit does NOT authorize R5, CR-R4-PROD, live money, or any next implementation wave.**

> **Follow-up:** Engineering blockers from §L were addressed under [109](109_POST_R4_ECOSYSTEM_HARDENING.md) (**CR-POST-R4-FIX-109**). Legal/human gates in §M remain open. Pre-R5 engineering gate: [110](110_PRE_R5_READINESS_AUDIT.md) (**CR-PRE-R5-GATE-110** — **PRE_R5_GREEN**; does not authorize R5).

---

## A. Current application inventory

| App | Path | Registry | Audit maturity | Notes |
|-----|------|----------|----------------|-------|
| API | `apps/api` | — | **FUNCTIONAL** + **SANDBOX** money/carrier/video | Modular monolith |
| Customer web | `apps/web-customer` | FOUNDATION | **FOUNDATION** + video **SANDBOX** | Commerce + care + account |
| Customer mobile | `apps/mobile` | FOUNDATION | **FOUNDATION** + video **SANDBOX** | Near web parity; native WebRTC gap |
| Doctor web | `apps/web-doctor` | FOUNDATION | **FOUNDATION** + video **SANDBOX** | Profile/credentials/availability/encounter/video |
| Doctor mobile | `apps/mobile-doctor` | FOUNDATION | **FOUNDATION** + video **SANDBOX** | Core loop; thinner than web |
| Admin web | `apps/web-admin` | FOUNDATION | **FOUNDATION** | Company control plane + video read-only |
| Store web | `apps/web-store` | FUNCTIONAL | **FUNCTIONAL** | Pick/pack/GRN/adjust |
| Store mobile | `apps/mobile-store` | FUNCTIONAL | **FUNCTIONAL** | Parity with store web |
| Delivery mobile | `apps/mobile-delivery` | FUNCTIONAL | **FUNCTIONAL** + carrier **SANDBOX** | Jobs + presence |
| Join web | `apps/web-join` | FUNCTIONAL | **FUNCTIONAL** | Pack-gated partner onboarding |
| Vendor web | `apps/web-vendor` | FOUNDATION | **FOUNDATION** | Seller shell |
| Design system | `apps/ds-web` | — | **FOUNDATION** | Non-product playground |

**PLANNED (registry, no app folder):** `mobile-lab`, `mobile-phlebotomist`, `web-lab`, `web-pathologist`, `web-logistics`, `web-affiliate`. Affiliate mobile **DEFERRED**.

**PRODUCTION-READY:** **none**.

---

## B. Current UI completion by app

| App | Classification | Completion note |
|-----|----------------|-----------------|
| web-customer / mobile | FOUNDATION | Full account + commerce + care journeys; sandbox pay/ship/video |
| web-doctor / mobile-doctor | FOUNDATION | Clinical loop + video; mobile lacks credentials/orgs/settings |
| web-admin | FOUNDATION | Broad panels; governance/ops not product-complete |
| web-store / mobile-store | FUNCTIONAL | Location-scoped ops complete for sandbox orders |
| mobile-delivery | FUNCTIONAL | Assigned jobs; mock carrier; no maps/offline/push product |
| web-join | FUNCTIONAL | Apply/track/docs when pack allows |
| web-vendor | FOUNDATION | Tabs wired to vendor APIs; empty-state heavy |
| ds-web | FOUNDATION | ui-kit gallery only |

---

## C. Backend / domain completion

| Domain | Status |
|--------|--------|
| Identity / OTP / audiences / RBAC | **FUNCTIONAL** (sandbox OTP) |
| Partner join / KYC / org membership | **FUNCTIONAL** |
| Catalog / pricing / search | **FUNCTIONAL** |
| Inventory / warehouse | **FUNCTIONAL** |
| Cart / checkout | **FUNCTIONAL** |
| Payment | **SANDBOX** only |
| Orders / fulfillment | **FUNCTIONAL** + sandbox payment |
| Logistics | **SANDBOX** mock carrier (`live_dhl: false`) |
| Finance / ledger / payouts | **SANDBOX** mock payout |
| Doctor / appointments / encounters | **FUNCTIONAL** foundation |
| Consent / clinical access | **FUNCTIONAL** |
| Video | **SANDBOX** (mock default; LiveKit boundary) |
| Platform notification / support | **FOUNDATION** (prefs/tickets/inbox stubs; no product CMS/CRM) |
| Rx / lab / pathology / radiology / CRM / CMS product | **NOT STARTED** |

---

## D. R4 status

| Item | Status |
|------|--------|
| CR-R4-IMPL-107 Phase A (mock UX) | **Done** |
| CR-R4-IMPL-107 Phase B (LiveKit boundary) | **Done** (creds absent → mock) |
| MockVideoProvider | **Available** (test + default) |
| LiveKit sandbox configured here | **No** |
| Recording | **OFF** (DB CHECK + API + UI) |
| Consent / relationship / policy / appointment auth | **Enforced server-side** |
| Tenant/RLS on video tables | **Enabled** |
| Webhook duplicate idempotency | **Pass** |
| Webhook timestamp stale window | **Gap** (vs payment/carrier) |
| Reconnect via re-join | **Pass** |
| Mobile native WebRTC | **Gap** (lifecycle + mock UI; web has LiveKit client) |
| Production telemedicine / CR-R4-PROD | **NOT enabled** |

---

## E. R3 status

| Item | Status |
|------|--------|
| Store web/mobile ops | **FUNCTIONAL** (unchanged; no R4 regression) |
| Delivery mobile | **FUNCTIONAL** + mock carrier |
| Join web | **FUNCTIONAL**; dark until pack |
| Isolation suite | **13/13 PASS** |
| Partner ≠ company admin | **Held** |

---

## F. Commerce status

| Item | Status |
|------|--------|
| Catalog → cart → checkout | **FUNCTIONAL** |
| Payment | **SANDBOX** (`sandbox: true`; no live PSP) |
| Orders | **FUNCTIONAL** |
| Shipments / tracking | **Mock logistics** |
| Real COD / live money | **Not enabled** |

---

## G. Healthcare status

| Item | Status |
|------|--------|
| Doctor onboarding / profile / availability | **FOUNDATION–FUNCTIONAL** |
| Appointments / encounters | **FUNCTIONAL** |
| Video consult (sandbox) | **SANDBOX** post-107 |
| Prescription / dispensing | **NOT STARTED** (R5) |
| Lab / pathology / radiology / care nav | **NOT STARTED** |
| Health-record product UX | **NOT STARTED** |

---

## H. Finance status

| Item | Status |
|------|--------|
| Ledger / settlement batches | **SANDBOX** |
| Mock payout rail | **SANDBOX** |
| Dual-control on payout approve | **Partial** (policy-driven; not universal maker/checker product) |
| Live payout / MoR | **Not enabled** |

---

## I. MNC / governance status

| Item | Status |
|------|--------|
| Company vs partner authority | **Held** (admin audience + company perms) |
| Region / country / LE / BU / org / location | **Modeled** + admin governance UI |
| Org/location isolation (store/delivery) | **App RBAC + R3 tests** |
| Admin video cannot join/bypass clinical access | **Held** |
| Maker/checker | **Partial** (finance dualControl; not ecosystem-wide) |
| RLS | **Sandbox FORCE RLS** (CR-RLS-96/97) — **8/8 PASS** |
| Client headers as tenant authority | **Rejected** (RLS test) |

---

## J. Security / RLS status

| Suite | Result |
|-------|--------|
| API full regression | **124/124 PASS** (fresh `--skip-nx-cache`) |
| RLS tenancy | **8/8 PASS** |
| R3 isolation | **13/13 PASS** |
| Video e2e (consent/policy/relationship/recording/webhook/reconnect) | **Included in API suite** |
| No live PSP / DHL / payout / recording / production video | **Confirmed in code paths** |

---

## K. PHI / privacy findings

| Finding | Severity | Notes |
|---------|----------|-------|
| Doctor web/mobile raw clinical JSON dumps | **Cleared** (CR-PRE-R4-FIX-105) | No `JSON.stringify` render in doctor UI src |
| Video join tokens in DOM | **Cleared** | Client tests assert token not rendered |
| API request-body `JSON.stringify` | **OK** | Transport only |
| `governance-admin` `cell()` stringifies objects | **Low** | Governance metadata tables (not clinical notes); watch for nested PII |
| Console PHI logging in app src | **None found** | App/package source clean (deps excluded) |
| PHI in URLs | **None found** in audited routes | Appointment IDs only |
| Outbox/event redaction | **Held** | Video/doctor e2e assert secrets/clinical tokens absent |
| Secrets in clients | **None** | No LiveKit API secret on clients |

**No critical PHI regression introduced by R4.**

---

## L. Remaining engineering blockers

1. **Mobile native WebRTC** — consult lifecycle only; media on web when LiveKit configured  
2. **Video webhook timestamp/staleness window** — duplicates OK; no replay-age window like payment/carrier  
3. **Notification product** — prefs/inbox foundation; consult reminders not wired to outbox  
4. **CMS / CRM / helpdesk product** — missing (single-kernel rule still holds; no duplicates invented)  
5. **Doctor mobile** — credentials / organizations / settings vs web  
6. **Maker/checker** — not universal across admin mutations  
7. **Planned apps** — lab / pathologist / logistics / affiliate web not created (correct — do not invent shells)  
8. **LiveKit sandbox credentials** — not present in this environment (mock remains correct)  

---

## M. Remaining legal / human decisions

| ID | Topic |
|----|--------|
| L-R4-01 … L-R4-07 | Telehealth licensing, cross-border, recording, disclaimers, app-store claims, retention, incidents |
| OD-VID-01 … OD-VID-05 | SFU hosting, admit model, duration, audio-only, chat fallback |
| OD-COUNTRY-* | Launch countries / packs |
| Phase 0 / brand / MoR / PSP / OTP vendor | Still open where marked in [38](38_PHASE_0_DECISION_BOARD.md) |
| R14 gate | Live PSP / DHL / payouts require separate authorization |

---

## N. Recommended next implementation wave

**Recommendation only — NOT authorized by this CR.**

Per [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md), after R4 sandbox the roadmap’s next product wave is **R5 (prescription + pharmacy dispensing)** *or* a production telemedicine gate (**CR-R4-PROD**) *only after* L-R4 legal sign-off and OD-VID decisions.

**Do not start R5, production LiveKit, Rx, lab, CMS, CRM, or live money without a new coding authorization CR.**

Practical prep (still needs CR): close L-R4-01 for named sandbox country *or* keep internal-only; resolve OD-VID-01; optional mobile LiveKit SDK CR; optional notification wiring CR.

---

## O. Exact regression / build results

### Typecheck — **18/18 PASS**

### Tests — **189/189 PASS** (workspace)

| Project | Tests |
|---------|-------|
| api | **124/124** (includes RLS **8/8**, R3 **13/13**, video e2e) |
| shell-core | 10/10 |
| shell-web | 3/3 |
| web-customer | 8/8 |
| web-doctor | 2/2 |
| web-admin | 12/12 |
| mobile | 4/4 |
| mobile-doctor | 5/5 |
| ui-kit | 10/10 |
| config | 5/5 |
| shared | 6/6 |

API re-run with `--skip-nx-cache`: **124/124 PASS**.

### Builds — **PASS** (`--skip-nx-cache`)

| Project | Result |
|---------|--------|
| web-customer | PASS |
| web-doctor | PASS |
| web-admin | PASS (includes `/video-sessions`) |
| web-store | PASS |
| web-join | PASS |
| web-vendor | PASS |
| api | PASS (webpack) |
| ds-web | PASS |

Mobile apps: typecheck only (Expo; no Next production build target) — **PASS**.

---

## Shared architecture (duplicate-kernel check)

| Kernel | Status |
|--------|--------|
| Identity | Single Person model — **no duplicate** |
| ui-kit | Single `@world-pharma/ui-kit` — **no duplicate** |
| shell-core / shell-web | Shared session/HTTP — **no duplicate** |
| Notification | One `platform/notification.service` — **no second service from R4** |
| Support | One `platform/support.service` |  
| Search | Catalog search kernel — **no clinical PHI search product** |
| CMS / CRM / analytics | **Missing products** — not duplicated |
| Finance / logistics | Single kernels + mock adapters — **held** |
| Video | Single `VideoService` + `VideoProviderPort` — **held** |

---

## Explicit non-goals confirmed

- R5 **not** implemented  
- Production LiveKit / TURN/STUN **not** connected  
- Recording **OFF**  
- No Rx, lab, radiology, CMS, CRM, live PSP, DHL, payouts, or real money  
- No new app shells for planned apps  
- No production code or migrations in this CR  

---

**FINAL STATUS: ECOSYSTEM_AUDIT_WITH_BLOCKERS**
