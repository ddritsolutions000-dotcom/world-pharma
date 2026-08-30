# 95 — Global current-state audit

**Status:** Read-only audit of repository + Blueprint  
**Date:** 27 August 2026  
**Authority:** Inspection only. **No code, UI, API, or migration changes.**  
**Canonical execution overlay:** [93](93_GLOBAL_IMPLEMENTATION_ROADMAP.md)  
**Lock:** [43](43_ECOSYSTEM_BASELINE_LOCK.md)

This book records **what exists now**. It does not authorize R3 or any implementation.

**Evidence sources:** Prisma (19 migrations, schema valid, local DB up to date), `apps/api` modules and e2e specs, client apps under `apps/`, CI workflow, docker-compose, topology registry.

**Verdict in one line:** The platform is a **working sandbox modular monolith** (R0–R1 + R2 care foundation). It is **not** production-ready. **R3 is the correct next product wave** after a **coding authorization**, provided R3 treats isolation as **application RBAC** (Postgres RLS policies are currently no-ops) and does not enable public Join or live money.

---

## 1. Blueprint reconciliation

| Book | Role vs code |
| --- | --- |
| 00 | Index current; 93 overlay, 94 plan, 92 completeness |
| 43 | Lock still valid; post-lock CRs 86–94 are additive docs |
| 49 | P0 engineering sign-off pack; human approval still open |
| 50–63 | R1 commerce **sandbox implemented** as 1A–1G |
| 64–82 | P2-HC **design**; not all built |
| 83–84 | Doctor + appointments **foundation implemented** |
| 85 | Unused number |
| 86–89 | Company authority + MNC + topology **partially in code** |
| 90–91 | Unused |
| 92 | Completeness slots — **plan** |
| 93 | Canonical waves R0–R16 |
| 94 | R3 **plan only** |

**Do not treat 33 as a second execution plan.** 33 remains historical dependency law. 80 is P2-HC slice list. **93 wins for “what to build next.”**

---

## 2. Repository inventory (actual)

**Apps present (7):**

| Path | Surface | Audience | Reality |
| --- | --- | --- | --- |
| `apps/api` | API | Kernel | Functional sandbox monolith |
| `apps/web-customer` | Web | Customer | Storefront + cart/checkout/orders/shipments + doctor/appointment **pages** |
| `apps/web-admin` | Web | Company | Catalog/inventory/orders/payments/logistics/finance/doctors **panels**; MNC pages **placeholders** |
| `apps/web-doctor` | Web | Doctor | Foundation workspace (profile, credentials, availability, appointments) |
| `apps/mobile` | Mobile | Customer | **Empty shell** (welcome/workspace placeholders; fake tokens) |
| `apps/mobile-doctor` | Mobile | Doctor | **Shell + nav**; not full clinical ops |
| `apps/ds-web` | Web | Engineering | Design-system playground — **not** a product app |

**Packages:** `database`, `shared`, `config`, `ui-kit`, `shell-core`, `shell-web`.

**API modules:** identity, policy, partner, catalog, inventory, cart, orders, payment, logistics, finance, clinical, events, security.

**Migrations:** 19, applied. **RLS:** `ENABLE ROW LEVEL SECURITY` exists; policies are `USING (true) WITH CHECK (true)` — **not tenant isolation**.

**CI:** Prisma validate/generate/migrate deploy, lint, typecheck, test+coverage, API+ds-web+customer+admin builds, mobile typecheck, Redis 7 probe, audit, gitleaks.

**Compose:** Postgres 16 + Redis 7 (host 56379) + optional API image.

---

## 3. Wave matrix (R0–R16)

Legend: **sandbox** = works in test/mock, not live rails.

| Wave | Intent | Status | Production-ready |
| --- | --- | --- | --- |
| R0 Foundation | Identity, packs, CI, obs, shells | **Implemented (foundation)** | **No** |
| R1 Commerce | 1A–1G | **Implemented sandbox** | **No** (mock pay/carrier/payout) |
| R2 Care foundation | Doctor + appointments | **Partial/foundation** | **No** |
| R3 Partner ops clients | Store, Delivery, Join | **Plan only** ([94](94_R3_PARTNER_OPERATIONS_CLIENTS_PLAN.md)) | **Unauthorized** |
| R4 Video | LiveKit port | **Foundation/sandbox** (mock in test; LiveKit if creds else 503) | **No / unauthorized prod** |
| R5 Rx / dispensing | — | **Plan / missing** | Unauthorized |
| R6 Vendor web | APIs exist; **no web-vendor app** | **Partial API / missing UI** | No |
| R7 Lab/CoC/pathology | Books 68–70 | **Plan only** | Unauthorized |
| R8 Radiology | CR-ECO-92 slot | **Missing** | Unauthorized |
| R9 Health record UX | Consent grants exist; no PHR UX | **Partial kernel / missing UX** | No |
| R10 Care nav/triage/match | CR-ECO-92 | **Plan only** | Unauthorized |
| R11 CMS + helpdesk | Thin CMS in admin book | **Plan / missing product** | Unauthorized |
| R12 CRM/marketing/loyalty/affiliate UI | Promo + affiliate **tables/API fragments** | **Partial sandbox / missing UX** | No |
| R13 Search/recs/analytics warehouse | Catalog search documents | **Partial / missing** | No |
| R14 Live PSP/DHL/payout/tax | Explicitly mock | **Sandbox only** | **Blocked** on legal + contracts |
| R15 Workforce/BC-DR | Placeholders | **Foundation/docs** | No |
| R16 Second country / extract | — | **Unauthorized** | No |

---

## 4. Domain audit (implemented kernels)

| Domain | DB | API | Web UI | Mobile | Security | Tests | Events | Production |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Identity | Yes | Yes | Admin placeholder; customer sign-in shell | Shell fake token | JWT+OTP+RBAC; TOTP table unused | e2e | Security events | **No** |
| Security/obs | Headers, rate limits OTP, redact | Yes | — | — | Partial (no global API throttle) | e2e | SecurityEvent | No |
| MNC governance | Region, LE, BU tables; membership country/region/LE/org/location | Scope helpers + finance/catalog filters | **Placeholder pages** | — | App-layer; RLS open | mnc e2e | — | No |
| Country policy | PolicyPack | Fail-closed resolver | — | — | Fail-closed | policy e2e | — | Packs **empty of law** |
| Partner kernel | Partner, KYC, org, location | Admin+services | No Join app | — | Company review | partner e2e | Yes | Dark; no public Join |
| Catalog/pricing | Items, variants, offers, i18n | Customer+admin+vendor | Customer PLP/PDP; admin catalog | Missing | Country query required | catalog e2e | Yes | No |
| Inventory/warehouse | Lots, GRN, reservations | Admin+vendor | Admin inventory; vendor panels | Missing | Org scoped in service | inventory e2e | Yes | No |
| Cart/checkout | Cart unique person+country | `/me` | Cart+checkout pages | Missing | Customer audience | cart e2e | Yes | Tax **UNKNOWN** stub |
| Payment | Intents, sandbox gateways | Yes | Admin payments | Missing | Admin+customer | payment e2e | Yes | **Mock only** |
| Order/fulfillment | Orders, snapshots | Customer/vendor/admin | Customer+admin orders | Missing | Audience+org | order e2e | Yes | No |
| Logistics/carrier | Shipment, jobs, POD | Admin+vendor+customer | Admin logistics; customer shipments | Missing | Org | logistics e2e | Yes | **Mock carrier only** |
| Finance/ledger/settlement | Journals, payables, payouts | Admin+vendor/affiliate fragments | Admin finance | — | Permissions+country filter | finance e2e | Yes | **Mock payout; UNKNOWN freeze** |
| Doctor | DoctorProfile, credentials | `/doctor`, admin | Doctor web | Shell | Audience+membership | doctor e2e | Yes | Foundation |
| Consent | ConsentGrant | Yes | Not a patient UX | — | Fail-closed next join | e2e | Yes | Foundation |
| Appointments | Appointment, encounter | Customer+doctor+admin | Both webs | Missing | Relationship+consent | appointment e2e | Yes | Foundation |
| Video | VideoSession | Doctor/customer join | Not production tele | Missing | Consent; tokens not stored | video e2e | Yes | **Unauthorized production** |

---

## 5. Healthcare scorecard

| Topic | Status |
| --- | --- |
| Doctor | **FOUNDATION** (API+web; mobile shell) |
| Appointments / encounters | **FOUNDATION** |
| Telemedicine | **FOUNDATION** adapter; **UNAUTHORIZED** production |
| Prescription | **PLAN ONLY** |
| Pharmacy dispensing (clinical Rx desk) | **MISSING / R5** (inventory pick is commerce, not Rx verify) |
| Lab / booking / sample / CoC / pathology / reports | **PLAN ONLY** |
| Radiology | **MISSING** |
| Health record | Consent/relationship **foundation**; PHR **MISSING** |
| Consent UX | API **FOUNDATION**; customer UX **MISSING** |
| Care nav / triage / specialist matching | **PLAN ONLY** (92); **NOT diagnosis** |

---

## 6. Commerce scorecard

| Topic | Status |
| --- | --- |
| Storefront catalog/SKU/offer/price | **SANDBOX implemented** (web customer) |
| Inventory/warehouse | **SANDBOX API + admin UI** |
| Cart/checkout/order/fulfillment | **SANDBOX implemented** |
| Payment | **SANDBOX mock** |
| Carrier / DHL | **MOCK only**; DHL not integrated |
| Promos | **Partial** (PromoCampaign tables + checkout apply) |
| Affiliate | **Fragment** (`me/affiliate`, liabilities); **no affiliate web** |
| Settlement / economics | **SANDBOX ledger + mock payout** |
| Wishlist, reviews, Q&A, subscriptions, refills, loyalty, membership, referral product | **MISSING / plan** (reviews mentioned in 05; no models) |

---

## 7. Application vs topology

**Missing apps:** web-store, mobile-store, mobile-delivery, web-vendor, web-lab, web-pathologist, web-logistics, web-affiliate, web-join, mobile-lab, mobile-phlebotomist, radiologist (OD).

**Unnecessary:** none as extra products. `ds-web` is internal.

**Web-only (locked):** Vendor, Affiliate, Join. Radiologist if approved.

**Shells:** `apps/mobile` (explicit empty shell); much of admin MNC; mobile-doctor thin.

**Duplicates:** none extra product apps. Vendor **APIs** without vendor **app**. Duplicate `partner` row historically in [04](04_APPLICATION_ARCHITECTURE.md) module table (docs). JWT `partner_applicant` vs docs `partner_applicant` naming drift in older books.

---

## 8. MNC / company governance (enforced vs docs)

| Layer | Tables | Enforced in API | UI |
| --- | --- | --- | --- |
| Region / country / LE | Yes | Membership + `scope.ts` country/org/LE asserts; finance/catalog country filters | Placeholder nav |
| Business unit | Table only | **No membership.businessUnitId** | Placeholder |
| Location | Field on membership | Used in some inventory/order paths | Store app **missing** |
| Company vs partner | Company roles/permissions split (86) | **Yes** (e2e) | Admin audience |
| Maker-checker | Finance payout dualControl; company grant dual control | **Partial** (not all sensitive actions) | Limited |
| Cross-org | Vendor org checks | **Yes** in vendor services | — |
| Postgres RLS | Enabled | **Policies allow all** | — |

**Finding (HIGH):** Isolation is **application-layer**. DB RLS does not constrain rows. Prisma uses a superuser-style connection. Fine for sandbox; **unsafe as production tenancy**.

---

## 9. Security findings

**Present:** JWT audiences customer/partner_applicant/admin/doctor; PermissionsGuard; AudienceGuard; OTP rate limits; refresh rotation; problem+redact; webhook HMAC for payments; idempotency on cart/pay/payout; company-only permissions; clinical consent fail-closed.

**Gaps:** RLS no-op; TOTP modeled **not wired** in auth service; no global HTTP rate limit beyond OTP/refresh; LiveKit selected whenever `NODE_ENV !== test` (503 without secrets — not a live consult product); customer mobile authenticates with **placeholder tokens** (`shell-dev-access`).

**Frontend hiding:** Admin nav permission filters are **not** authz; APIs use guards. Mobile shell has **no** real API auth.

---

## 10. Financial rails

| Rail | Code | Live? |
| --- | --- | --- |
| Payment | `MockPaymentGatewayAdapter` | **No** |
| Carrier | Mock booking | **No** |
| Payout | `MockPayoutAdapter`; UNKNOWN cannot retry | **No** |
| Tax | TaxPort **UNKNOWN** | Not statutory |

No Stripe/Razorpay/DHL production clients found in `apps/api/src`. **Do not treat sandbox execute as real money.**

---

## 11. Production-readiness ratings (separate)

| Track | Rating | Note |
| --- | --- | --- |
| A Architecture | **Medium-high** | Modular monolith + outbox+BullMQ is coherent |
| B Code | **Medium** | Sandbox domains tested; clients incomplete |
| C Security | **Medium-low for prod** | RBAC good; RLS open; MFA unused |
| D Infrastructure | **Foundation** | Compose+CI; not multi-region/prod HA |
| E Legal/compliance | **Not ready** | Empty packs; ODs open |
| F Operational | **Low** | No store/delivery/join ops, no on-call runbooks |
| G Go-live | **No** | R14 + legal + RLS + ops clients |

---

## 12. Gap list (classified)

| Gap | Class |
| --- | --- |
| RLS policies `USING (true)` | **CRITICAL** before real partner data / production |
| Public Join + KYC UX missing | **HIGH** for R3 (planned) |
| Store/Delivery apps missing | **HIGH** (R3) |
| Customer mobile is fake-token shell | **HIGH** vs topology “customer mobile” |
| Business unit not on membership | **MEDIUM** (MNC completeness) |
| TOTP unused | **MEDIUM** |
| Admin MNC pages placeholders | **MEDIUM** |
| Vendor web missing (APIs exist) | **FUTURE** R6 |
| Lab/Rx/radiology/care-nav/CMS/helpdesk/CRM UX | **FUTURE / UNAUTHORIZED** |
| Live PSP/DHL/payout | **LEGAL + R14** |
| Launch country, brand, MoR, PSP, licenses | **HUMAN + LEGAL** |
| Wishlist/reviews/loyalty | **DEFERRED** R12 |
| 33 vs 80 “Phase 2” naming | **Docs contradiction** (93 resolves) |
| 04 vendor RN vs 88 web-only | **Contradiction** (CR-ECO-92 decided web-only) |

---

## 13. Duplication / contradiction (do not silently fix)

1. **Phase 2** means money in 33 and care in 80 — overlay 93.  
2. **Vendor mobile** in 04/43 inventory vs **web-only** in 88/92/93/94.  
3. **RLS** named in clinical e2e titles vs DB policies allow all.  
4. **CMS** word used for banners vs future CMS platform — one kernel intended.  
5. **Support** tickets in CRM book vs future helpdesk — one kernel intended.  
6. Books **85, 90, 91** unused.  
7. Affiliate earnings historically person-order keyed (limitation, not a second identity).

---

## 14. Multinational scan (source, excluding node_modules)

| Pattern | In `apps/api` + `packages` src/prisma | Class |
| --- | --- | --- |
| INR, GST, UPI, +91, Asia/Kolkata | **No matches** | SAFE |
| India hardcoded | **No matches** in API/packages ts | SAFE |
| DHL | Comments/docs + topology “until live DHL authorized” | DOCUMENTATION / CONFIGURATION intent |
| Currency `XXX` / UNKNOWN tax | Schema defaults | CONFIGURATION / SANDBOX |
| Lucide `IndianRupee` icons | ui-kit transitive | TEST/VENDOR asset — not product law |
| `.next` / node_modules | Ignore | N/A |

---

## 15. Customer experience map

| Capability | Now |
| --- | --- |
| Catalog, cart, checkout, orders, shipment tracking | **Partial web** (sandbox) |
| Doctors, appointments | **Partial web** |
| Payments | Sandbox |
| Care nav, tele prod, Rx, labs, reports, PHR, support, blog, wishlist, reviews, Q&A, membership, loyalty, refill | **Missing / plan** |
| Notifications | Kernel events; no full inbox product |
| Mobile customer | **Shell only** |

Still **one** intended customer product — not split SKUs.

---

## 16. Support / CMS

No Helpdesk, SLA, CSAT, blog, education CMS, or SEO product in apps. Admin “CMS” in 17 is banners/help/legal **plan**. **One** future CMS and **one** support kernel (92/93). Do not add WordPress-per-app.

---

## 17. Search / AI

`CatalogSearchDocument` exists for catalog. No doctor/lab/article/help indexes as products. **No care-nav engine.** No evidence of PHI in public search. Care-nav must remain intake → triage → urgency → specialty → match → book/tele — **not** diagnosis.

---

## 18. Data / schema

- **Present:** identity through finance + clinical foundation + MNC tables.  
- **Missing vs 92:** radiology, care-nav, tickets, CMS articles, wishlist, reviews.  
- **BU:** table without membership FK.  
- **RLS:** enabled, **not selective**.  
- **TOTP/recovery:** tables, unused flow.  
- **locationId** on membership: no FK to Location in snippet (field exists).  
- Migrations ordered; 19 applied.

---

## 19. Verify (read-only this audit)

| Check | Result |
| --- | --- |
| `prisma validate` | Valid |
| `prisma migrate status` | 19 migrations; DB up to date |
| Tests | Last full API run in this lineage: **45 suites / 103 tests** (not re-executed this task to avoid extra processes) |
| Lint/typecheck/build | CI job defined; last authorized lineage reported pass for API+web-admin/customer/ds-web |

This task did **not** start extra app servers or reset DBs.

---

## 20. Scorecard

| DOMAIN | STATUS | ACTUAL | PROD | GAP | NEXT |
| --- | --- | --- | --- | --- | --- |
| Identity | Foundation | OTP JWT RBAC | No | MFA, Join UX | R3/R0 harden |
| MNC | Partial | Tables+API scope | No | BU bind, RLS, admin UX | Parallel |
| Policy | Foundation | Empty packs | No | Legal fill | Human |
| Catalog–ledger | Sandbox | API+partial UI | No | Live rails | R14 |
| Logistics | Sandbox mock | API+admin | No | Delivery app, live carrier | R3 then R14 |
| Doctor/appt | Foundation | API+web | No | Mobile, video prod | R4 |
| Video | Foundation | Port+mock/LiveKit | No | Legal+prod SFU | R4 |
| Store/Delivery/Join clients | Plan | No apps | No | R3 | R3 |
| Lab/Rx/radiology/care-nav | Plan/missing | — | No | Unauthorized | R5–R10 |
| CMS/support/CRM UX | Plan | — | No | Unauthorized | R11–R12 |
| Live money | Blocked | Mock only | No | Contracts+legal | R14 |

**A Complete (sandbox):** R0 kernel, R1 commerce APIs, mock pay/carrier/payout, doctor/appointment APIs, company vs partner permission split.  
**B Partial:** Customer web, admin ops, doctor web, MNC, video adapter, promo/affiliate fragments.  
**C Plan only:** 64–82 remainder, 92 slots, 94 R3.  
**D Missing:** listed apps + healthcare products + CMS/helpdesk.  
**E Blocked:** live PSP/DHL/payout, legal packs.  
**F Human:** country, brand, MoR, PSP, OD-R3-*, OD-CARE, OD-RAD.  
**G Legal:** telehealth, e-Rx, lab, radiology, CDS, marketing.  
**H Retrofit before production (not all before R3 sandbox coding):** real RLS/GUC; TOTP or explicit defer; customer mobile real auth; do not enable `join.public`.

---

## 21. Is R3 safe to start?

**Product sequence:** Yes — R3 is the correct **next authorized coding candidate** per 93.  
**This audit does not authorize coding.**

**Conditions if a later task authorizes R3:**

1. Stay on **sandbox** money/carrier.  
2. Treat **RLS as non-isolating**; enforce org/location in services + expand e2e (T-ORG/T-LOC in 94).  
3. Do not ship public Join until pack + legal.  
4. Do not grant company roles from Join.  
5. Rider/store **minimum necessary** PII.  
6. Do not pull R4–R14 into R3.

**Dedicated pre-R3 retrofit (recommended but can be a parallel hardening story):** replace `USING (true)` RLS with session-scoped policies **or** formally document “RLS placeholder until GUC” in 27/95 so nobody believes DB tenancy exists.

**Do not** start lab, Rx, care-nav, or live PSP “because they are important.”

---

## 22. Executive summary

- **Completion:** Sandbox platform ~R0+R1+R2 foundation. Not a live marketplace or hospital.  
- **Works:** API commerce loop (catalog→cart→mock pay→order→mock ship→sandbox ledger); doctor+appointment APIs; admin commerce panels; policy fail-closed; company/partner permission split.  
- **Foundation/shell:** Mobile customer, mobile doctor, admin MNC pages, video adapter, consent without PHR UX.  
- **Sandbox/mock:** Payment, carrier, payout, tax UNKNOWN.  
- **Missing:** R3 apps; vendor/lab/affiliate/join UIs; most healthcare products; CMS/helpdesk.  
- **Unsafe for production:** Live traffic, real money, real PHI at scale, public Join, believing Postgres RLS isolates tenants.  
- **Before R3 coding:** Human **coding authorization**; isolation tests as first-class; optional RLS retrofit.  
- **Recommended next authorized task:** Human **R3 coding authorization** (or an explicit **RLS tenancy retrofit** if production-like partner data will be loaded). **Not** R4–R14.

**STOP. No implementation in this audit.**

---

## Addendum — post CR-R3-HARDEN-99 (27 August 2026)

This addendum does **not** replace the read-only audit above; it records state after R3 hardening per [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md).

| R3 client | Classification |
| --- | --- |
| Store Web / Mobile | **FUNCTIONAL** |
| Delivery Mobile | **FUNCTIONAL** |
| Partner Join Web | **FUNCTIONAL** |
| Admin partner ops | **FUNCTIONAL** |
| Customer join/tracking delta | **FUNCTIONAL** |

**Still not production-ready:** sandbox OTP/carrier/payout; legal/compliance gates open; CR-RLS-96 is real but apps must keep enforcing RBAC. **R4 not started.**

**Tests added:** T-ORG, T-INV, T-KYC, T-AUD, T-RID (extended), T-SES in `r3.isolation.e2e.spec.ts`.
