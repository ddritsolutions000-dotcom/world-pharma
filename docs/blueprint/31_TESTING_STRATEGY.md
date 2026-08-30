# 31 — Testing Strategy

**Status:** Blueprint  
**Audience:** Engineering, QA, security, clinical ops (for journey sign-off)  
**Requirement IDs:** REQ-QA, REQ-SEC, REQ-PAY, REQ-LAB, REQ-VID  
**Related:** [Business](02_BUSINESS_ARCHITECTURE.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [Lab](09_LAB_PLATFORM.md) · [Health record](16_HEALTH_RECORD.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Performance](28_PERFORMANCE_ARCHITECTURE.md) · [Observability](30_OBSERVABILITY.md) · [DevOps](32_DEVOPS_CICD.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose

Testing proves the **state machines, money, consent, and custody** we specified — not that a screen rendered once on a laptop.

**Non-negotiables:**

1. **No PHI, real KYC, real PAN, or production dumps in lower environments.** Synthetic / anonymized generators only.
2. **State machines are first-class tests** (order, sample, job, payment, refund, settlement).
3. **J01–J21** have automated or scripted critical-path coverage before the phase that ships them is “done.”
4. Security and chaos tests exist for **gateway failure** and **webhook replay** before payment goes live.
5. Accessibility and localization are not leftover polish for a healthcare UI ([01](01_PRODUCT_VISION.md) §3).

---

## 2. Test pyramid (modular monolith)

| Layer | Who | What | Speed | Gate |
| --- | --- | --- | --- | --- |
| Unit | Dev | Domain functions, money math, policy evaluators, mappers | Seconds | Every PR |
| Module contract | Dev | Public application service API of a module; no table grabs from neighbors ([04](04_APPLICATION_ARCHITECTURE.md) §6) | Seconds–minutes | Every PR |
| API | Dev/QA | HTTP contracts, authn/z, idempotency, error codes | Minutes | Every PR (smoke subset); nightly full |
| State machine | Dev | Explicit transition tables | Seconds–minutes | Every PR for touched machines |
| Integration | Dev | Postgres, Redis, OpenSearch testcontainers | Minutes | PR or merge |
| E2E critical | QA+Dev | J01–J21 slices | Tens of minutes | Pre-release; smoke on main |
| Security | Sec/Dev | Authz, injection, replay, rate limit | Minutes–hours | Release of identity/pay/health |
| Load | SRE | p95 budgets ([28](28_PERFORMANCE_ARCHITECTURE.md)) | Hours | Before launch of that surface |
| Chaos | SRE | Gateway down, webhook replay, Redis queue eviction | Scheduled | Before payment/video/lab live |
| Accessibility | QA | WCAG-oriented checks on customer/admin | Per release | Customer-facing phases |
| Localization | QA | Pack strings, RTL if pack, currency/date | Per pack | Before country enable |

UI screenshot tests: optional for design system; **not** a substitute for journey tests.

---

## 3. Data policy (all non-prod)

| Rule | Detail |
| --- | --- |
| Production clone | **Forbidden** for health, KYC, and payment instrument tables |
| Synthetic | Named generators: patients, SKUs, fake Rx **images of dummy prescriptions**, fake barcodes |
| Masking | If a rare prod-debug export is legally allowed, it is a **LEGAL REVIEW** process — not a CI job |
| Identifiers | Fake phone OTPs in test harness; never real SMS to random humans |
| PSP | Sandbox / recorder; no live capture in CI |
| LiveKit | Staging rooms or mock SFU for PR; load test uses dedicated project |
| Logs | Same redaction as prod ([30](30_OBSERVABILITY.md)); tests assert no payload in log spies |

**ASSUMPTION (A-QA-01):** A `synthetic-data` package is a Phase 0 deliverable.

---

## 4. Unit tests

Focus where bugs are **expensive**:

- Money: minor units, FX snapshot use, no re-convert history ([12](12_PAYMENT_PLATFORM.md))
- Ledger: balanced entries, immutability, idempotent `source_event_id` ([13](13_LEDGER_SETTLEMENT.md))
- Policy pack evaluation (feature on/off, methods allowed)
- Consent grant matching (purpose, grantee, time)
- Barcode / sample id equality
- Attribution eligibility (affiliate) without enabling clinical categories by accident

Do not unit-test NestJS framework internals.

---

## 5. Module contract tests

Each module publishes a **narrow** application interface. Contract tests:

- Neighbor modules call **fakes** of ports (PaymentGatewayPort, NotificationPort)
- Forbidden: importing another module’s ORM entities
- CI lint/architecture test (dependency-cruiser or Nx/Ts boundaries — **OD-MONO-01**)

Example: Order module tests “on `PaymentCaptured` → confirm children” with a fake payment bus, not Stripe.

---

## 6. API tests

| Class | Must cover |
| --- | --- |
| Authn | Missing token, expired, wrong `aud`, revoked `sid` |
| Authz | Customer cannot hit finance; doctor cannot read without grant; country isolation |
| Idempotency | Replay money POST → same result; conflict payload → 409 |
| Validation | Upload MIME, size |
| Pagination | Cursor opacity (cannot mint another tenant’s cursor) |
| Webhook | Invalid signature; stale timestamp; duplicate event id |

Contract file: OpenAPI as artifact ([21](21_API_ARCHITECTURE.md)). Consumer tests for RN/Next share `shared-types`.

---

## 7. State-machine tests

Every transition table in domain docs gets a **table-driven** test: from, event, actor, guards, to, side effects (outbox event names only).

### 7.1 Order (goods)

Sources: [06](06_PHARMACY_PLATFORM.md), [07](07_VENDOR_PLATFORM.md), J01/J03.

Minimum cases: created→paid; paid→Rx wait; reject Rx; OOS after pay (**OD-CUS-14**); cancel windows; POD complete; return/refund; vendor timeout auto-cancel; **no** multi-vendor split (v1).

### 7.2 Sample / diagnostic case

[09](09_LAB_PLATFORM.md) §10. Cases: book→collect→seal→receive (same `sample_id`); mismatch **hard stop**; temperature if field present; reject→recollect (**OD-LAB-20** pricing is pack, machine still moves); report sign SoD (enter vs sign).

### 7.3 Logistics job

[11](11_LOGISTICS_PLATFORM.md). Cases: offer→accept→POD; OTP fail; reassignment; COD amount must match snapshot (**OD-LOG-13** no partial v1); sample transport scan continuity.

### 7.4 Payment

[12](12_PAYMENT_PLATFORM.md): CheckoutSession, PaymentIntent, capture remaining, void, refund, COD `AUTHORIZED_COD`→`CAPTURED_COD`, webhook duplicate, unknown capture **blocks fallback**.

### 7.5 Adjacent machines (when that phase ships)

Appointment/encounter ([08](08_DOCTOR_PLATFORM.md)), ConsentGrant ([16](16_HEALTH_RECORD.md)), settlement batch ([13](13_LEDGER_SETTLEMENT.md)), affiliate commission ([14](14_AFFILIATE_PLATFORM.md)), KYC case, **PartnerApplication** ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md)): register, verify, reject, resubmit, approve, suspend, document expiry, org invite, role permissions, pack-required vs empty pack (cannot ACTIVE regulated type).

**Invariant tests:** journal balance; no payload in CRM ticket; consent revoke stops **new** reads.

---

## 8. E2E critical journeys J01–J21

Map from [02](02_BUSINESS_ARCHITECTURE.md) §6. Automate **happy path + one primary failure** per journey when that phase exits. UI e2e where a user is in-app; API-level e2e acceptable for finance (J17–J21) with UI smoke.

| ID | Journey | E2E focus | Failure must-cover | Phase |
| --- | --- | --- | --- | --- |
| J01 | OTC medicine buy | Search→cart→pay→pack→OTP deliver | OOS after pay; duplicate checkout | 2 |
| J02 | Rx upload | Upload→verify→confirm→pay | Unreadable; identity mismatch | 2 |
| J03 | Vendor order | Offer→accept→deliver | Vendor timeout cancel | 3 |
| J04 | Track delivery | Status + OTP | Reassignment; OTP fail | 2 |
| J05 | Book doctor | Slot lock→pay/hold | Slot stolen | 4 |
| J06 | Video consult | Waiting room→join→complete | Reconnect; recording denied (consult continues) | 4 |
| J07 | Digital Rx | Sign→artifact | Unsigned draft cannot dispense | 4 |
| J08 | Order from Rx | Artifact→SKU map→J01 | Unmapped SKU | 4 |
| J09 | Book lab | Prep ack→slot→pay | Fasting conflict (**OD-LAB-10**) | 5 |
| J10 | Collection | Assign→verify→barcode→seal | Wrong patient hard stop | 5 |
| J11 | Sample to lab | Scan continuity | Barcode mismatch | 5 |
| J12 | Pathologist | Enter vs sign SoD | Panic flag path (no values in SMS if pack forbids) | 5 |
| J13 | Digital report | Notify→health record→consent share | Family access without grant | 5 |
| J14 | Hard copy | Fee if any→job | Lost pack policy (**OD-LAB-07**) | 5–6 |
| J15 | Hard copy POD | Terminal + POD stored | — | 5–6 |
| J16 | Refund | Policy engine→PSP/wallet→ledger reverse | Gateway refund fail queue; COD cash | 2 |
| J17 | Affiliate commission | Attribute→hold→approve | Self-referral; clinical category off | 7 |
| J18 | Vendor settlement | POD + window→payout | Chargeback reserve | 3 |
| J19 | Doctor settlement | Complete consult→AP | Refunded consult no payout | 4 |
| J20 | Lab settlement | Per **OD-LAB-02 / OD-LED-01** | Failed collection refund | 5 |
| J21 | Rider earnings | Job complete→AP | Fake POD dispute | 2 / 6 |
| J22 | Partner join | Type→docs→approve→dashboard | Reject/resubmit; SoD; invite expiry | 1–5 |

**Exit criterion:** the phase that introduces a journey cannot close without that row green in staging on synthetic data.

---

## 9. Security tests

| Type | Examples |
| --- | --- |
| Authz matrix | Sample of [03](03_USER_ROLES_AND_PERMISSIONS.md) — support no Rx payload; country isolation |
| Token | Wrong `aud`; refresh reuse → family revoke |
| Break-glass | Missing ticket/reason rejected |
| Injection | Upload, search query, barcode string |
| Webhook | Replay, unsigned, amount increase without fetch |
| Rate limit | OTP bombing does not send unbounded SMS |
| Secrets | CI scan; no secrets in client bundles |
| Dependency | CVE gate on release |

DAST: staging only, synthetic accounts. **LEGAL REVIEW** if using a scanner that stores URLs with tokens.

---

## 10. Load tests

Before go-live of each surface, against **staging-sized** (or prod-like) infra with synthetic:

| Scenario | Budget |
| --- | --- |
| Catalog browse + search | Search p95 < 300 ms ([28](28_PERFORMANCE_ARCHITECTURE.md)) |
| Checkout + webhook flood | Webhook p95 < 10 s; no double capture |
| GPS ingest | Job room fan-out |
| Video rooms | Concurrent rooms + TURN; TTFF p95 < 5 s (good network profile) |

Do not load-test a live PSP; use sandbox or recorded adapters.

---

## 11. Chaos / resilience

Minimum **before** the related production launch:

| Experiment | Expect |
| --- | --- |
| API instance kill | LB failover; no duplicate money (idempotency) |
| **Gateway / PSP timeout after unknown capture** | **No second intent** until fetch ([12](12_PAYMENT_PLATFORM.md) §7) |
| **Webhook replay** | Same event id → no second ledger post |
| Redis cache flush | Correctness; possible p95 dip |
| Queue Redis persistence fail | Alert P1; no silent ledger drop — pause vs dual-write policy in runbook |
| OpenSearch down | Degraded search; ops id lookup works |
| LiveKit down | Chat + reschedule path; no fake “in call” |

Chaos in **staging** first. Prod chaos is an explicit SRE program in Phase 10, not a Phase 2 game.

---

## 12. Accessibility

Healthcare users include low vision, motor, and low-literacy ([01](01_PRODUCT_VISION.md)).

| Bar | Detail |
| --- | --- |
| Target | WCAG **2.2 Level AA** as **engineering target** for customer web + admin. Not a certification claim |
| Automation | Axe (or equivalent) on critical screens in e2e |
| Manual | Screen reader pass on login, checkout, Rx upload, report view, waiting room |
| Mobile | Dynamic type, contrast, tap targets |

**LEGAL/COMPLIANCE REVIEW REQUIRED** for any market that mandates a specific standard — encode in pack, do not invent.

---

## 13. Localization / globalization tests

| Check | Detail |
| --- | --- |
| Pack off | Feature hidden; no hardcoded country = IN ([04](04_APPLICATION_ARCHITECTURE.md) §12) |
| Formats | Currency minor units, timezone display, name order |
| Strings | Missing key fails CI for enabled locales |
| RTL | If a pack enables an RTL locale |
| Mixed catalog | Country A catalog not visible to country B user |

---

## 14. Clinical safety tests (not “we practiced medicine”)

- OCR never auto-signs Rx
- Recording default **false**; deny recording still completes consult
- Sample mismatch cannot be overridden by the same actor without audited exception (if pack even allows)
- Panic workflow sends **flag**, not result values, unless pack allows a secure channel

These are **product safety** tests, not a claim of clinical certification.

---

## 15. CI mapping

See [32](32_DEVOPS_CICD.md). PR: unit + contract + lint/boundaries + secret scan + unit security (authz samples). Nightly: full API + state machines. Release: e2e smoke J-set for that version.

---

## 16. Open decisions

| ID | Question | Recommendation |
| --- | --- | --- |
| OD-MONO-01 | Nx vs Turborepo (affects boundary tests) | See [32](32_DEVOPS_CICD.md) |
| OD-QA-01 | How much e2e on RN vs Maestro/Detox vs API | API e2e + one RN smoke per persona per release |
| OD-SLA-01 | Whether load numbers become contractual | No until legal/commercial |
