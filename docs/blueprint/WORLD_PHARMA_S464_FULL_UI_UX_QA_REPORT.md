# WORLD_PHARMA S464 — Full UI / UX Visual QA Report

**Sprint:** 464 · **Master backlog:** **#464**  
**Baseline:** S463 (#463) founder manual acceptance setup  
**Document type:** Browser visual + interaction QA (first pass)  
**Runtime:** DEVELOPMENT / SANDBOX  

| Flag | Value |
| --- | --- |
| **APPLICATION_CODE_CHANGED** | **NO** |
| **FEATURE_WORK** | **NO** |
| **UI_COMPLETE** | **NO** |
| **PUBLIC_OPEN_READY** | **NO** |
| **CAN_PRODUCTION_LAUNCH** | **NO** |

**Companion backlog:** [WORLD_PHARMA_S464_UI_DEFECT_BACKLOG.md](WORLD_PHARMA_S464_UI_DEFECT_BACKLOG.md)  
**Evidence:** [docs/blueprint/s464-artifacts/](s464-artifacts/) (`screenshots/`, `findings.json`, `page-results.json`, `console-errors.json`, `summary.json`, supplemental JSON)

---

## Final flags

| Flag | Value |
| --- | --- |
| **UI_BROWSER_TEST** | **PASS** (Playwright + system Google Chrome `channel: 'chrome'`) |
| **UI_VISUAL_QA** | **PARTIAL** (broad coverage; defects found; not polish-complete) |
| **RESPONSIVE_QA** | **PARTIAL** (4 viewports on Customer public; spot-checks on portals) |
| **INTERACTION_QA** | **PARTIAL** (OTP logins, nav, tabs, market select, product open, add-to-cart attempt; not full order-to-delivery UI chain) |
| **DESIGN_SYSTEM_QA** | **PARTIAL** (cross-app inconsistencies recorded; no redesign) |
| **P0_DEFECTS** | **3** |
| **P1_DEFECTS** | **8** |
| **P2_DEFECTS** | **10** |
| **P3_DEFECTS** | **3** (consolidated; heuristic had 25 button-height page hits) |
| **APPLICATION_CODE_CHANGED** | **NO** |
| **FEATURE_WORK** | **NO** |

Do **not** declare UI_COMPLETE. Do **not** declare PUBLIC_OPEN_READY or CAN_PRODUCTION_LAUNCH.

---

## 1. Applications tested

| App | URL | Browser sessions | Auth actor (sandbox) |
| --- | --- | --- | --- |
| Customer | http://127.0.0.1:3000 | Public 4 viewports + authenticated desktop/mobile | `sandbox-customer@dev.local` |
| Main Admin | http://127.0.0.1:3001 | Auth desktop + mobile spot | `sandbox-admin@dev.local` |
| Doctor | http://127.0.0.1:3002 | Auth + responsive spot | `sandbox-doctor@dev.local` |
| Store | http://127.0.0.1:3003 | Auth + responsive spot | `sandbox-vendor@dev.local` |
| Vendor | http://127.0.0.1:3004 | Auth workspace tabs + mobile orders | `sandbox-vendor@dev.local` |
| Lab | http://127.0.0.1:3005 | Auth + tab clicks + responsive | `sandbox-lab@dev.local` |
| Radiology | http://127.0.0.1:3006 | Auth + tab clicks + responsive | `sandbox-imaging@dev.local` |
| Radiologist | http://127.0.0.1:3007 | Auth + worklist tab + responsive | `sandbox-radiologist@dev.local` |
| Join | http://127.0.0.1:3008 | Public desktop + mobile | n/a (public apply) |
| Pathologist | http://127.0.0.1:3009 | Auth + responsive | `sandbox-pathologist@dev.local` |
| Affiliate | http://127.0.0.1:3010 | Auth routes + responsive | `sandbox-affiliate@dev.local` |
| Logistics | http://127.0.0.1:3011 | Login attempt only | `sandbox-delivery@dev.local` — **blocked** |

API health verified at setup: `http://127.0.0.1:4000/health` → 200.

---

## 2. Pages tested (summary)

**Customer public:** home, search, categories, deals, lab, radiology, doctors, health, faq, help, contact, about, cart, wishlist, login, legal (+ product via `/p/demo-paracetamol-500` after market).

**Customer authenticated:** home, orders, account, family, wishlist, cart, checkout, appointments, prescriptions, lab, radiology, doctors, health, track-order, buy-again, reminders; lab/imaging/doctor detail URLs; category `/c/pain-relief`; mobile home/orders/cart/account.

**Admin:** login, dashboard, identity, vendor, doctors, labs, imaging, delivery, affiliates, catalog, inventory, orders, payments, finance, countries, policy-packs, provider-activation, launch-readiness, notifications, support, cms, crm, marketing, seo, storefront, logistics, approvals, governance, security (+ mobile home).

**Vendor:** login, workspace (+ orders/catalog/inventory/settlements/returns/team/settings routes), tab interactions, mobile orders.

**Doctor:** login, home, appointments, availability, patients, prescriptions, profile, inbox, settings, support, earnings, credentials, refill-requests (+ mobile home).

**Lab / Radiology / Radiologist / Pathologist / Store:** login, home/dashboard, available tab labels, responsive home.

**Affiliate:** login (home), dashboard, links, codes, earnings, statement, inbox, support, profile (+ responsive home).

**Join:** home, login, apply, pharmacy, doctor, lab, imaging, delivery, affiliate, status (desktop + mobile).

**Logistics:** login only — OTP blocked (P0).

Machine count: **221** automated page inspections in primary harness + supplemental product/admin/vendor shots → **~273** PNGs total.

---

## 3. Viewport coverage

| Viewport | Size | Coverage |
| --- | --- | --- |
| Desktop | 1440×900 | All apps (primary) |
| Laptop | 1280×800 | Customer public full; portal dashboard spots |
| Tablet | 768×1024 | Customer public full; portal dashboard spots |
| Mobile web | 390×844 | Customer public + auth spots; portal homes; vendor orders; admin home; doctor home |

---

## 4. Browser automation status

| Item | Status |
| --- | --- |
| Cursor browser MCP | Not available |
| Playwright Chromium download (cdn.playwright.dev) | Timed out in environment |
| Playwright + **system Google Chrome** (`channel: 'chrome'`) | **USED** |
| Harness | `docs/blueprint/s464-artifacts/run-s464-browser-qa.mjs` (+ supplemental scripts) |
| Headless real browser | Yes |
| Screenshots | Yes |
| Console capture | Yes (`console-errors.json`, 218 entries) |
| Replaced by curl/HTTP 200 only? | **NO** |

**BROWSER_AUTOMATION_ENVIRONMENT_BLOCKED = NO** (automation succeeded via Chrome channel).

---

## 5. Interaction coverage

Performed:

- Email OTP login (Customer, Admin MFA path, Vendor, Doctor, Lab, Radiology, Radiologist, Pathologist, Affiliate, Store)
- Market selection (India) for authenticated Customer
- Navigation to major routes
- Vendor/Lab/Radiology tab/button clicks where visible
- Product open from category; Add to cart control click when visible
- Affiliate earnings/statement open (crashed)
- Logistics Send OTP (failed)
- Responsive resize after auth

Not fully completed in browser (blocked or out of pass scope):

- Full checkout → sandbox payment → confirmation UI chain as founder click-path
- Vendor accept → pack → READY UI with selected org
- Logistics pickup → delivered UI (login blocked)
- Diagnostic viewer zoom/pan/rotate interaction deep dive (imaging detail opened; viewer controls not exhaustively exercised this pass)
- Native Android/iOS

---

## 6. Visual findings (high level)

**Strengths observed**

- Customer public chrome (header, search pills, trust bar, dark footer) is coherent and brand-forward once market is selected.
- Product detail hierarchy is strong when loaded: manufacturer, title, price/MRP/discount, pack, multi-seller table, Rx-adjacent CTAs, details tabs.
- Lab operator dashboard communicates sandbox honesty with clear alert + snapshot KPIs.
- Affiliate dashboard (non-earnings routes) is simple and readable.
- Admin dark control plane looks intentional as a central ops shell when content renders.

**Problems observed**

- Market gate frequently replaces destination content for anonymous users.
- Missing product imagery (detail + listing placeholders).
- Partner portals retain desktop sidebars on mobile (Doctor overflow).
- Raw enum strings and sparse/uneven admin KPI layouts.
- Hard failures: Logistics OTP, Admin launch-readiness blank, Affiliate earnings/statement error boundary.

---

## 7. Responsive findings

| Finding | Severity |
| --- | --- |
| Doctor mobile page overflow + non-collapsing sidebar | P1 |
| Admin mobile footer clipped by issue overlay | P1 |
| Customer mobile after market: home usable; no page overflow measured on product mobile | Pass-ish |
| Vendor mobile orders: no overflow measured; org-empty state still dominant | P2 friction |
| Affiliate mobile home: no overflow in primary pass | Pass for shell |
| Tables: few viewport overflow hits in heuristics | Limited |

---

## 8. Design-system findings

Cross-app comparison (objective vs shared patterns, not redesign taste):

| Topic | Observation |
| --- | --- |
| Primary actions | Customer red CTAs vs partner teal/primary dark buttons — intentional multi-shell, but heights vary widely within Customer alone |
| Sidebars | Lab/Doctor/Affiliate use stacked bordered buttons; Admin uses dark module explorer; Vendor uses icon nav — three families |
| Cards | Admin dark KPI cards vs Customer white commerce cards vs Affiliate single bordered panel |
| Status badges | Mix of human copy and raw enums (`SANDBOX_NOT_SETTLED`) |
| Empty states | Generally present (vendor org select, affiliate sparse dashboard) |
| Dev overlays | Next.js issue pills appear across apps during sandbox QA |

---

## 9–12. Defect counts by severity

See backlog for full templates.

| Severity | Count | IDs |
| --- | --- | --- |
| P0 | 3 | Logistics CORS OTP; Admin launch-readiness blank; Affiliate earnings/statement `countryCode` |
| P1 | 8 | Market gate; search listing; product image; doctor mobile overflow; hydration; admin mobile footer; raw enums; affiliate `/login` 404 |
| P2 | 10 | Placeholders; admin KPI grid; footer imbalance; dense sidebars; affiliate whitespace; duplicate keys; `/medicines` 404; vendor org friction; GMV mono “Select country”; API 4xx/5xx noise |
| P3 | 3 | Button height DS debt; breadcrumb/gate mismatch; footer contrast |

---

## 13. Pages fully PASS (visual shell + content present; no P0/P1 on that screen in this pass)

Examples (not an exhaustive certification):

- Customer product detail structure (aside from missing image → overall PARTIAL)
- Customer authenticated lab/radiology/doctors list pages (content present after market)
- Lab dashboard desktop
- Affiliate dashboard / links / codes / profile / inbox / support (earnings/statement excluded)
- Join public apply family pages (loaded)
- Admin orders/catalog/payments/countries/provider-activation/cms (content present in supplemental pass)
- Vendor shell (aside from org-empty operational body)

**None marked “production polish PASS.”** Sandbox-only.

---

## 14. Pages PARTIAL

- Customer public home/search/categories (gate / discovery)
- Customer search authenticated
- Customer product (missing image)
- Doctor mobile home
- Admin dashboard (KPI layout, raw status, hydration)
- Vendor orders/catalog/inventory (org gate)
- Radiology/Radiologist/Pathologist/Store homes (loaded; dense ops UX not deeply exercised)
- Imaging/lab detail customer pages (opened; deep viewer/booking not fully interaction-certified)

---

## 15. Pages BLOCKED

| Page | Reason |
| --- | --- |
| Logistics entire authenticated UI | P0 OTP/CORS |
| Admin `/launch-readiness` | P0 blank/error |
| Affiliate `/earnings`, `/statement` | P0 runtime crash |
| Affiliate `/login` | P1 404 (use home sign-in) |
| Customer public product click-through without market | P1 gate |
| Native Android / iOS UIs | ENVIRONMENT_BLOCKED (host) |

---

## 16. Environment limitations

- Playwright browser download from Playwright CDN timed out; mitigated with system Chrome.
- OTP rate limits / cooldown caused intermittent re-login failures on supplemental Affiliate/Admin attempts.
- Dev Next.js issue overlays present (sandbox).
- No Android device/emulator; no macOS/Xcode for iOS.
- Real PSP / OTP / carrier / KYC / PACS production — EXTERNAL_BLOCKED (unchanged).
- First market still UNSELECTED (OD-COUNTRY-01) — unchanged.

---

## 17. Screenshots / evidence references

| Path | Contents |
| --- | --- |
| `docs/blueprint/s464-artifacts/screenshots/` | ~273 PNGs named `{app}__{page}__{viewport}.png` + `supp*` / `supp3*` |
| `docs/blueprint/s464-artifacts/findings.json` | Raw heuristic findings |
| `docs/blueprint/s464-artifacts/page-results.json` | Per-page metrics |
| `docs/blueprint/s464-artifacts/console-errors.json` | Console/page errors |
| `docs/blueprint/s464-artifacts/summary.json` | Primary run summary |
| `docs/blueprint/s464-artifacts/supplemental*.json` | Market/product/admin follow-ups |

Representative evidence:

- Market gate: `customer__public_search_no_products__desktop.png`
- Product: `supp3__product_demo_paracetamol__desktop.png`
- Logistics fail: `logistics__login_fail.png`
- Affiliate earnings: `affiliate__earnings__desktop.png`
- Launch readiness blank: `supp3_admin__launch_readiness__desktop.png`
- Doctor mobile: `doctor__dashboard_home__mobile.png`
- Admin desktop: `admin__dashboard_home__desktop.png`
- Lab: `lab__dashboard_home__desktop.png`

---

## Console error themes (not all unique defects)

| Theme | Approx count | Notes |
| --- | --- | --- |
| Hydration mismatch | ~79 | P1-05 |
| Duplicate React keys | ~50 | P2-06 |
| HTTP 400 | ~31 | triage |
| HTTP 404 | ~24 | includes `/medicines`, bad routes |
| HTTP 403 | ~15 | often expected authz |
| HTTP 500 | ~10 | triage |
| `countryCode is not defined` | 2 | P0-03 |
| Logistics CORS OTP | 1+ | P0-01 |

---

## No-code-change confirmation

- No application source under `apps/**` was modified for S464.
- Only documentation + **read-only** QA harness artifacts under `docs/blueprint/s464-artifacts/` and this report/backlog.
- **FEATURE_WORK = NO**
- **APPLICATION_CODE_CHANGED = NO**

---

## Recommended next engineering sprint (out of scope here)

Targeted fixes for P0→P1 from [WORLD_PHARMA_S464_UI_DEFECT_BACKLOG.md](WORLD_PHARMA_S464_UI_DEFECT_BACKLOG.md), then re-run browser QA. Do not treat this report as public-open approval.

**STOP.**
