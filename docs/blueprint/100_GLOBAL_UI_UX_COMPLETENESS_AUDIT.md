# 100 — Global UI/UX completeness audit

**Status:** Read-only audit  
**Change ID:** **CR-UI-AUDIT-100**  
**Date:** 27 August 2026  
**Authority:** Inspection only. **No code, UI, API, migration, or R4 work.**

> **Post-R4 update:** For the ecosystem state after **CR-R4-IMPL-107**, see the addendum audit [108](108_POST_R4_ECOSYSTEM_AUDIT.md) (**CR-POST-R4-AUDIT-108**). Book 100 remains the pre-R4 UI baseline snapshot.

This book records **what each canonical application actually delivers from a product/UI perspective** as of post–CR-R3-HARDEN-99. It supplements [88](88_GLOBAL_APPLICATION_TOPOLOGY.md), [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md), [95](95_GLOBAL_CURRENT_STATE_AUDIT.md), and [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md).

**Evidence:** Repository source under `apps/`, `packages/ui-kit`, `packages/shell-*`, `apps/api/src/identity/app-topology.ts`, blueprint books above.

**Classification legend**

| Level | Meaning |
| --- | --- |
| **FOUNDATION** | Shell, partial screens, or API-only capability; not a complete operator/customer journey |
| **FUNCTIONAL** | End-to-end sandbox journey possible with real auth/API on primary paths; gaps remain |
| **PRODUCT-COMPLETE** | Intended screens and states for a country pack exist; still may be sandbox-only |
| **PRODUCTION-READY** | Legal gates closed, live integrations where required, mobile store builds, ops runbooks — **none qualify** |

Tests/builds passing do **not** imply production-ready.

---

## 1. Application inventory

### 1.1 Mobile (canonical)

| App | Repo path | Exists | Classification | Notes |
| --- | --- | --- | --- | --- |
| Customer | `apps/mobile` | Yes | **FOUNDATION** | Dev-token shell; welcome/workspace/expired only |
| Store | `apps/mobile-store` | Yes | **FUNCTIONAL** | OTP; org/location; dashboard/inventory/orders/exceptions/GRN/adjust/pick/pack/ready; button nav |
| Delivery | `apps/mobile-delivery` | Yes | **FUNCTIONAL** | OTP; presence; job list/detail; accept→RTO; no offline/push/maps |
| Doctor | `apps/mobile-doctor` | Yes | **FOUNDATION** | Dev-token shell; section placeholders only |
| Lab Staff | `apps/mobile-lab` | No | **PLANNED** | — |
| Phlebotomist | `apps/mobile-phlebotomist` | No | **PLANNED** | — |

### 1.2 Web (canonical)

| App | Repo path | Exists | Classification | Notes |
| --- | --- | --- | --- | --- |
| Customer | `apps/web-customer` | Yes | **FOUNDATION** | Commerce + care entry points; OTP on shell (post-R3); many pages lack full state matrix |
| Store | `apps/web-store` | Yes | **FUNCTIONAL** | OTP; org/location selectors; tabbed ops (post-R3 harden) |
| Vendor | `apps/web-vendor` | No | **PLANNED** | Vendor panels embedded in `web-admin` `/vendor/*` only |
| Doctor | `apps/web-doctor` | Yes | **FOUNDATION** | Dev-token; profile/credentials/orgs/availability/appointments panels |
| Lab | `apps/web-lab` | No | **PLANNED** | — |
| Pathologist | `apps/web-pathologist` | No | **PLANNED** | — |
| Logistics/Ops | `apps/web-logistics` | No | **PLANNED** | Admin `/logistics` panel exists |
| Affiliate | `apps/web-affiliate` | No | **PLANNED** | API fragment only |
| Admin/ERP | `apps/web-admin` | Yes | **FOUNDATION** | OTP shell (post-R3); commerce/doctor panels functional-ish; governance placeholders |
| Partner Join | `apps/web-join` | Yes | **FUNCTIONAL** | OTP; pack-gated apply; status when dark; doc upload (post-R3) |
| Radiologist | — | No | **PLANNED** | OD-RAD-01 |

### 1.3 Non-product

| Path | Role |
| --- | --- |
| `apps/ds-web` | Design-system playground (engineering) |
| `apps/api` | Modular monolith API (not a UI app) |

### 1.4 Shared platform

| System | Path | Status |
| --- | --- | --- |
| Design tokens + ui-kit | `packages/ui-kit` | **FOUNDATION** — web richer than native |
| Shell core | `packages/shell-core` | **FOUNDATION** — session, OTP, HTTP |
| Shell web | `packages/shell-web` | **FOUNDATION** — SessionProvider, countries |
| Authentication | API OTP + JWT | **FUNCTIONAL** (sandbox OTP) |
| Notifications product | — | **MISSING** (kernel design only) |
| Support/helpdesk | — | **MISSING** |
| CMS product | — | **MISSING** (admin CMS slot placeholder in books) |
| Analytics product | — | **MISSING** |

---

## 2. Per-app audit matrix (condensed)

Columns: **Impl** = screens implemented | **Plan** = planned only | **Auth** | **States** (L/E/403/SE/N) = loading/empty/error/403/session-expired/network

### Mobile Customer (`apps/mobile`)

| A–Y | Assessment |
| --- | --- |
| A | FOUNDATION shell only |
| B | welcome, workspace, expired |
| C | store, cart, orders, care, profile — all planned |
| D | None (single view) |
| E | **Dev token** (`shell-dev-access`) |
| F–K | expired empty-state only; no 403/network |
| L–N | basic a11y labels; no i18n; no country selector |
| O–W | all missing |
| X | none |
| Y | Expo typecheck only; **not store-ready** |

### Mobile Store (`apps/mobile-store`)

| A–Y | Assessment |
| --- | --- |
| A | **FUNCTIONAL** post-R3 |
| B | sign-in, org/location switch, dashboard, inventory, orders, exceptions, GRN, adjust, order actions |
| C | catalog picker, barcode scan, offline queue, label print |
| D | button-based screen switch (no tab bar/drawer) |
| E | **Real OTP** |
| F–K | loading/empty/error/403/session via NativeEmptyState patterns |
| L | View-only scroll; no tablet layout |
| M | partial (accessibilityLabel on customer mobile only) |
| N–P | country via org membership; no locale |
| Q–W | missing |
| X | none |
| Y | **FOUNDATION mobile readiness** — Expo shell, no native builds, no push/deep links |

### Mobile Delivery (`apps/mobile-delivery`)

| A–Y | Assessment |
| --- | --- |
| A | **FUNCTIONAL** post-R3 |
| B | sign-in, presence, job list, job detail, accept/arrive/pickup/POD/fail/RTO |
| C | maps, earnings, offline, photo POD, navigation |
| D | list ↔ detail |
| E | **Real OTP** |
| F–K | partial state coverage |
| L–W | missing |
| X | none |
| Y | **FOUNDATION mobile readiness** |

### Mobile Doctor — **FOUNDATION** (dev token, placeholders)

### Mobile Lab / Phlebotomist — **NOT IMPLEMENTED**

### Web Customer (`apps/web-customer`)

| A–Y | Assessment |
| --- | --- |
| A | **FOUNDATION** |
| B | home/store grid, category, search, PDP, cart, checkout, orders, order detail, shipments, doctors, appointments, appointment detail |
| C | wishlist, reviews, Q&A, account profile, addresses, consent UX, health record, telemedicine, lab, content |
| D | header links + in-page routes (no global nav drawer) |
| E | **OTP on shell** (post-R3); pages vary |
| F–K | shipments page strong; cart/orders use EmptyState for errors; many pages lack NetworkErrorState/SessionExpiredState/PermissionDeniedState |
| L | responsive CSS; not audited for all breakpoints |
| M | some aria on search; incomplete |
| N | English-only UI strings |
| P | country from `useCountries` hook |
| Q–W | missing |
| X | standard Next routes only |

### Web Store — **FUNCTIONAL** (see [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md))

### Web Join — **FUNCTIONAL**

### Web Doctor — **FOUNDATION** (dev token; real API when token valid)

### Web Admin — **FOUNDATION**

| Module | UI reality |
| --- | --- |
| Catalog, inventory, orders, payments, logistics, finance | List/action panels; sandbox data; partial 403 |
| Doctors, appointments | List panels |
| Partners | **FUNCTIONAL** sub-module (post-R3) |
| Vendor (`/vendor/*`) | Sandbox panels inside admin — not standalone vendor app |
| Identity, orgs, countries, regions, LE, BU, audit | **GovernancePlaceholder** only |
| CMS, CRM, marketing, support, workforce, feature flags | **Not in nav / not implemented** |

### Planned web apps (Vendor, Lab, Pathologist, Logistics, Affiliate, Radiologist) — **NOT IMPLEMENTED** as dedicated apps

---

## 3. Customer super-app completeness

### Commerce

| Capability | Status |
| --- | --- |
| Home | **PARTIAL** — store grid on home |
| Categories | **FUNCTIONAL** — `/c/[slug]` |
| Search | **FUNCTIONAL** — `/search` + inline search |
| Product detail | **FUNCTIONAL** — `/p/[slug]` |
| Wishlist | **MISSING** |
| Cart | **FUNCTIONAL** (sandbox) |
| Checkout | **FUNCTIONAL** (sandbox; no live pay) |
| Payment UI | **PARTIAL** — checkout initiates sandbox intent |
| Orders | **FUNCTIONAL** |
| Tracking | **FUNCTIONAL** — shipments page (post-R3 states) |
| Reviews / Q&A | **MISSING** |
| Seller/store discovery | **MISSING** |

### Healthcare

| Capability | Status |
| --- | --- |
| Doctors | **FUNCTIONAL** — list |
| Specialty discovery | **MISSING** |
| Appointments | **FUNCTIONAL** — list + detail |
| Telemedicine | **MISSING** in UI (API/video foundation exists) |
| Prescriptions | **MISSING** |
| Pharmacy (clinical) | **MISSING** |
| Lab booking / samples / reports | **MISSING** |
| Health records | **MISSING** |
| Consent UX | **MISSING** |
| Care navigation / triage / matching | **MISSING** |
| Symptom/voice intake | **MISSING** |

### Content

| Capability | Status |
| --- | --- |
| Blog, health education, news, FAQ, Help Center | **MISSING** |

### Account

| Capability | Status |
| --- | --- |
| Profile | **MISSING** |
| Addresses | **MISSING** |
| Preferences | **MISSING** |
| Notifications | **MISSING** |
| Privacy / security settings | **MISSING** |
| Support | **MISSING** |
| Partner join entry | **PARTIAL** — CTA + status link (post-R3) |

**Customer super-app verdict:** **~20–25%** of intended super-app surface (weighted toward commerce sandbox slice).

---

## 4. Admin / ERP completeness

| Domain | Nav | Working UI | Verdict |
| --- | --- | --- | --- |
| Global company / MNC | Yes | Placeholder pages | **FOUNDATION** |
| Partners / KYC | Yes | Partners module **FUNCTIONAL**; audit page placeholder | **PARTIAL** |
| Catalog | Yes | Admin catalog panel | **FUNCTIONAL** (sandbox) |
| Inventory / stores | Yes | Admin + vendor inventory panels | **FUNCTIONAL** (sandbox) |
| Vendors | Via `/vendor` | Embedded panels | **PARTIAL** (not standalone app) |
| Doctors / appointments | Yes | List panels | **FOUNDATION** |
| Orders / payments / logistics / finance | Yes | List panels | **FUNCTIONAL** (sandbox) |
| Labs / pathology / radiology | No | — | **MISSING** |
| CMS / CRM / marketing / support | No | — | **MISSING** |
| Analytics / feature flags / DR | No | — | **MISSING** |
| Workforce | No | — | **MISSING** |

**Admin ERP verdict:** Can operate **sandbox commerce + partner review**; cannot operate full multinational healthcare/commerce company. **~30–35%** of intended ERP UI.

---

## 5. UI consistency

| Concern | Status |
| --- | --- |
| Single ui-kit | **Yes** — `@world-pharma/ui-kit` web + native |
| Tokens / typography / spacing | **Yes** — `packages/ui-kit/src/tokens` |
| Form patterns | **Mostly consistent** on web; native thinner |
| Loading/empty/error states | **Web:** `LoadingState`, `EmptyState`, `NetworkErrorState`, `PermissionDeniedState`, `SessionExpiredState` in ui-kit — **adoption uneven** |
| Tables / modals | **Partial** — admin uses cards/lists; limited data tables |
| Second design system | **None** — but **admin/vendor/customer CSS** (`shell.css`, `admin-main`) add layout variance |
| Doctor/Customer mobile | **Dev-token pattern inconsistent** with R3 OTP apps |

**Inconsistencies (audit only):** dev-auth vs OTP across apps; admin 403 uses EmptyState text vs `PermissionDeniedState`; native lacks several web state components; governance pages are placeholders while commerce pages are interactive.

---

## 6. Missing global cross-cutting systems

| System | Backend | UI | Verdict |
| --- | --- | --- | --- |
| Notifications | Design/events partial | None | **MISSING** |
| Support/helpdesk | CRM ticket design | None | **MISSING** |
| CMS | Narrow admin slot in books | None | **MISSING** |
| Blog/education | Planned | None | **MISSING** |
| Search (platform) | Catalog search docs | Customer catalog search only | **PARTIAL** |
| Recommendations | Planned | None | **MISSING** |
| Analytics warehouse | Observability only | None | **MISSING** |
| Localization | i18n on entities | English UI only | **MISSING** |
| Consent UX | API foundation | None | **MISSING** |
| Privacy/legal surfaces | Policy packs empty | None | **MISSING** |
| Audit viewer | Security events API | Admin audit **placeholder** | **MISSING UI** |
| Feature flags | Not productized | None | **MISSING** |
| Onboarding / CSAT | None | None | **MISSING** |

---

## 7. Mobile readiness summary

| App | Screens | API | Auth | Offline | Push | Deep links | Secure storage | Camera/docs | Location | Store build |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Customer | Shell | No | Dev | No | No | No | No | No | No | **No** |
| Store | Functional | Yes | OTP | No | No | No | No | No | No | **No** |
| Delivery | Functional | Yes | OTP | No | No | No | No | No | No | **No** |
| Doctor | Shell | No | Dev | No | No | No | No | No | No | **No** |
| Lab / Phlebo | — | — | — | — | — | — | — | — | — | **No** |

Expo typecheck ≠ production mobile. No evidence of iOS/Android release pipelines in product apps.

---

## 8. UX journey matrix

| Journey | Status | Blockers |
| --- | --- | --- |
| Customer: discover → cart → checkout → pay → order → track | **PARTIAL** | Sandbox payment; shipments need auth; no account profile |
| Store: login → location → inventory → GRN → pick → pack → ready | **COMPLETE** (sandbox) | Manual variant ID; no catalog picker |
| Delivery: login → presence → job → pickup → POD / fail / RTO | **PARTIAL** | POD needs shipment+OTP setup; unassigned jobs RLS-limited |
| Doctor: login → profile → availability → appointment → encounter | **PARTIAL** | Dev auth on web; no video; mobile shell only |
| Partner: join → apply → KYC → review → activate | **PARTIAL** | Public join dark by default; admin activate uses UUID fields |
| Admin: login → scope → partners → catalog → inventory → orders → logistics → finance | **PARTIAL** | Governance placeholders; sandbox data; uneven OTP |

---

## 9. Security UX

| Topic | Status |
| --- | --- |
| Tenant selector authority | Store apps: server membership validates org/location query params — **acceptable with audit note** |
| Client-controlled IDs | Org/location still client-selected but server-enforced |
| Session handling | OTP on R3 apps + customer shell; **dev token on doctor + mobile customer/doctor** |
| Logout / session expiry | ui-kit states on hardened apps; dev apps simulate expire |
| Permission denial | ui-kit on store/join; admin often EmptyState text |
| PII masking | Delivery dropoff masked in API presentation |
| KYC access | Join upload + admin viewer with watermark metadata; no PDF renderer |
| Clinical exposure | Doctor panels minimal; no PHR |
| Payment exposure | Sandbox only; no PAN/CVV UI |
| Audit visibility | **No operator UI** for security events |

---

## 10. Production-readiness matrix

| App | Classification | Production-ready? |
| --- | --- | --- |
| web-customer | FOUNDATION | **No** |
| web-store | FUNCTIONAL | **No** |
| web-join | FUNCTIONAL | **No** |
| web-admin | FOUNDATION | **No** |
| web-doctor | FOUNDATION | **No** |
| mobile | FOUNDATION | **No** |
| mobile-store | FUNCTIONAL | **No** |
| mobile-delivery | FUNCTIONAL | **No** |
| mobile-doctor | FOUNDATION | **No** |
| All planned apps | PLANNED | **No** |

---

## 11. Recommended implementation order (UI/UX lens, pre-R4)

1. **Unify authentication UX** — remove dev-token shells from customer mobile, doctor web/mobile, admin non-partner paths (already OTP on admin shell post-R3).
2. **Customer account slice** — profile, addresses, session states on all commerce pages.
3. **Admin governance UI** — replace placeholders for audit, countries, orgs (read-only first).
4. **Standalone web-vendor** — extract `/vendor` from admin when authorized.
5. **Doctor UX hardening** — OTP, appointment states, video join shell (not production tele).
6. **Customer mobile parity** — mirror web-customer commerce/care entry.
7. **Delivery/store mobile** — navigation architecture, offline, maps handoff (OD-UX-05).
8. **Notifications + support** — cross-app prerequisites before marketing/CMS.
9. **R4 telemedicine UI** — only after explicit R4 authorization + legal gates.

---

## 12. R4 prerequisite checklist (from audit; not authorization)

Before authorizing R4 (video/LiveKit) production UI:

- [ ] Customer + doctor **real OTP** on all clinical paths
- [ ] Consent UX for teleconsult (API exists; UI missing)
- [ ] Session/expiry/403 consistent on doctor web + mobile
- [ ] Video join UI wired to sandbox adapter (API exists)
- [ ] No PHI in client logs; recording policy per country pack — **LEGAL REVIEW REQUIRED**
- [ ] Telemedicine licensing per country — **LEGAL REVIEW REQUIRED**
- [ ] R3 partner ops stable (post-harden **FUNCTIONAL** — done at foundation level)
- [ ] CR-RLS-96 remains green
- [ ] Explicit **R4 coding authorization** (separate from this audit)

---

## 13. Approximate weighted completion (judgment, not a repo metric)

**Method:** Compare implemented UI/API/shared capabilities against the **canonical** inventory in [88](88_GLOBAL_APPLICATION_TOPOLOGY.md) + reserved slots in [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md). Weight by product importance: commerce+care customer (30%), partner ops (20%), admin ERP (20%), healthcare clinical (15%), cross-cutting platform (15%).

| Dimension | Approx. complete | Rationale |
| --- | --- | --- |
| **Backend / domain** | **~38–42%** | R0–R1 sandbox kernels strong; R2 care + R3 partner APIs; Rx/lab/radiology/CMS/support/CRM/live money absent |
| **Frontend / UI** | **~22–28%** | 7 web apps exist; 2 functional (store/join); customer commerce slice only; most ERP/governance missing |
| **Mobile** | **~15–20%** | 4 apps; 2 functional shells; customer/doctor are dev shells; no store builds |
| **Shared platform** | **~32–38%** | ui-kit + shell + OTP strong; notifications/CMS/support/i18n/analytics missing |
| **Overall ecosystem** | **~28–32%** | Weighted blend; **not** a measured line-count or story-point metric |

**Do not cite these percentages as precise engineering metrics.** They express audit judgment for roadmap planning.

---

## 14. Registry lag note

`apps/api/src/identity/app-topology.ts` still marks several R3 apps as `FOUNDATION`. Post–CR-R3-HARDEN-99 product classification for Store/Delivery/Join mobile/web is **FUNCTIONAL** per [98](98_R3_PARTNER_OPERATIONS_IMPLEMENTATION.md). Topology registry should be updated in a future **docs-only** CR — not in this audit task.

---

**STOP. Audit only. R4 not started.**
