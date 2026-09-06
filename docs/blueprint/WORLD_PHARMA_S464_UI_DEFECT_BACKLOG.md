# WORLD_PHARMA S464 — UI Defect Backlog

**Sprint:** 464 · **Master backlog:** **#464**  
**Pass type:** First visual QA — **READ / TEST ONLY**  
**APPLICATION_CODE_CHANGED:** **NO**  
**FEATURE_WORK:** **NO**  
**Fixes in this sprint:** **NONE** (record only)

Evidence root: [`docs/blueprint/s464-artifacts/`](../s464-artifacts/)  
Machine findings (raw heuristics): [`s464-artifacts/findings.json`](../s464-artifacts/findings.json)  
Screenshots: [`s464-artifacts/screenshots/`](../s464-artifacts/screenshots/) (~273 PNGs)

Severity: **P0** blocks core use · **P1** major usability/visual · **P2** noticeable polish · **P3** minor cosmetic / DS inconsistency

---

## P0 — Blocks core use

### S464-P0-01 — Logistics OTP cannot be sent (CORS)

| Field | Value |
| --- | --- |
| APP | Logistics (`:3011`) |
| PAGE | Login |
| VIEWPORT | desktop 1440×900 |
| ELEMENT | Send OTP / auth request |
| PROBLEM | OTP request fails; UI shows “Could not send OTP…” |
| EXPECTED | Sandbox OTP request succeeds (same pattern as other portals) |
| ACTUAL | Browser console: cross-origin request to `http://127.0.0.1:4000/api/v1/auth/otp/request` from origin `http://127.0.0.1:3011` blocked; OTP field never appears |
| SEVERITY | P0 |
| SCREENSHOT/EVIDENCE | `s464-artifacts/screenshots/logistics__login_fail.png` |
| REPRODUCTION | Open http://127.0.0.1:3011/login → enter `sandbox-delivery@dev.local` → Send OTP |

### S464-P0-02 — Admin Launch Readiness blank screen

| Field | Value |
| --- | --- |
| APP | Main Admin (`:3001`) |
| PAGE | `/launch-readiness` |
| VIEWPORT | desktop |
| ELEMENT | page body |
| PROBLEM | Page renders blank dark surface; Next.js “1 Issue” badge present; no control-plane content |
| EXPECTED | Launch readiness checklist / cards usable in sandbox |
| ACTUAL | Empty body text; runtime issue indicator; first automation pass also timed out (45s) on navigation |
| SEVERITY | P0 |
| SCREENSHOT/EVIDENCE | `s464-artifacts/screenshots/supp3_admin__launch_readiness__desktop.png` |
| REPRODUCTION | Admin OTP login → open http://127.0.0.1:3001/launch-readiness |

### S464-P0-03 — Affiliate Earnings + Statement crash

| Field | Value |
| --- | --- |
| APP | Affiliate (`:3010`) |
| PAGE | `/earnings`, `/statement` |
| VIEWPORT | desktop (+ other viewports after nav) |
| ELEMENT | page / error boundary |
| PROBLEM | Pages show “Affiliate portal error — Please retry. Internal details are not shown.” |
| EXPECTED | Earnings and statement sandboxes render with scoped affiliate data |
| ACTUAL | React runtime: `ReferenceError: countryCode is not defined` on `AffiliateEarningsPage` / `AffiliateStatementPage` (console); error boundary UI |
| SEVERITY | P0 |
| SCREENSHOT/EVIDENCE | `s464-artifacts/screenshots/affiliate__earnings__desktop.png`; console-errors.json |
| REPRODUCTION | Affiliate login → Earnings or Statement |

---

## P1 — Major usability / visual defects

### S464-P1-01 — Unauthenticated market gate blocks discovery content

| Field | Value |
| --- | --- |
| APP | Customer |
| PAGE | `/`, `/search`, `/categories`, and other public routes before market selection |
| VIEWPORT | all four |
| ELEMENT | “Choose your market” card vs expected page body |
| PROBLEM | Public routes show market gate instead of medicines/search/category content; breadcrumbs still claim Search/Categories |
| EXPECTED | After clear market selection, destination content loads; gate should not permanently replace page purpose |
| ACTUAL | Without durable market selection, search shows no product links; automation could not complete public product click-through |
| SEVERITY | P1 |
| SCREENSHOT/EVIDENCE | `customer__public_search_no_products__desktop.png`, `customer__public_categories__desktop.png` |
| REPRODUCTION | Incognito → http://127.0.0.1:3000/search without selecting market |

### S464-P1-02 — Authenticated `/search` does not surface medicine results UI

| Field | Value |
| --- | --- |
| APP | Customer |
| PAGE | `/search` (authenticated + market IN) |
| VIEWPORT | desktop / mobile |
| ELEMENT | search results listing |
| PROBLEM | Navigating to `/search` after market selection lands on home-style content rather than a results listing with `/p/` product anchors in the main search context |
| EXPECTED | Search page shows query UI + medicine results when catalog exists |
| ACTUAL | Supplemental metrics show home href mix; product detail reachable via `/c/pain-relief` → `/p/demo-paracetamol-500` but not via search listing |
| SEVERITY | P1 |
| SCREENSHOT/EVIDENCE | `supp__customer_auth__search__desktop.png`; `customer-links-after-market.json` |
| REPRODUCTION | Login customer → select India → open `/search` |

### S464-P1-03 — Product detail missing primary image

| Field | Value |
| --- | --- |
| APP | Customer |
| PAGE | `/p/demo-paracetamol-500` |
| VIEWPORT | desktop + mobile |
| ELEMENT | product image plane |
| PROBLEM | Large empty gray rectangle where product imagery should be |
| EXPECTED | Product image or intentional branded placeholder with alt text |
| ACTUAL | Blank media slot; other commerce metadata (price, pack, Rx/sellers, CTAs) present |
| SEVERITY | P1 |
| SCREENSHOT/EVIDENCE | `supp3__product_demo_paracetamol__desktop.png` |
| REPRODUCTION | Open product detail after market selection |

### S464-P1-04 — Doctor portal horizontal overflow on mobile web

| Field | Value |
| --- | --- |
| APP | Doctor |
| PAGE | Dashboard home |
| VIEWPORT | mobile 390×844 |
| ELEMENT | sidebar + main |
| PROBLEM | Persistent left nav + content causes horizontal overflow (+19px); sidebar not collapsed to drawer |
| EXPECTED | Mobile: collapsible nav; no page-level horizontal scroll |
| ACTUAL | Full sidebar still visible; content squeezed; `scrollWidth > clientWidth` |
| SEVERITY | P1 |
| SCREENSHOT/EVIDENCE | `doctor__dashboard_home__mobile.png` |
| REPRODUCTION | Doctor login → resize to 390×844 |

### S464-P1-05 — Widespread React hydration mismatches

| Field | Value |
| --- | --- |
| APP | Multiple (heavy on Admin + Customer) |
| PAGE | many |
| VIEWPORT | all |
| ELEMENT | SSR/CSR tree |
| PROBLEM | Console: “Hydration failed because the server rendered HTML didn't match the client” (~79 occurrences in run) |
| EXPECTED | No hydration errors in happy-path pages |
| ACTUAL | Dev overlay “N Issue(s)” appears on many screens; potential flicker / layout shift |
| SEVERITY | P1 |
| SCREENSHOT/EVIDENCE | console-errors.json; overlays visible on product/admin/vendor shots |
| REPRODUCTION | Open Admin dashboard or Customer home in Chrome; inspect console |

### S464-P1-06 — Admin mobile footer obscured by Next issue pill

| Field | Value |
| --- | --- |
| APP | Admin |
| PAGE | Dashboard (mobile) |
| VIEWPORT | 390×844 |
| ELEMENT | footer links + Next.js issue badge |
| PROBLEM | Red “1 Issue” pill overlaps footer module links |
| EXPECTED | Footer usable; overlays must not clip primary chrome (even in dev, note severity for QA clarity) |
| ACTUAL | Footer links partially unreadable under badge |
| SEVERITY | P1 (usability under current runtime) |
| SCREENSHOT/EVIDENCE | `supp3_admin_home__mobile.png` |
| REPRODUCTION | Admin login → 390×844 home |

### S464-P1-07 — Raw sandbox enum strings in operator UI

| Field | Value |
| --- | --- |
| APP | Doctor; Admin |
| PAGE | Doctor home quick actions; Admin command center |
| VIEWPORT | desktop / mobile |
| ELEMENT | status copy |
| PROBLEM | User-visible `SANDBOX_NOT_SETTLED` (and similar) looks like internal enum, not human status |
| EXPECTED | Human-readable sandbox status labels |
| ACTUAL | Raw token in Doctor “Earnings (…)” chip; Admin command-center subcopy |
| SEVERITY | P1 |
| SCREENSHOT/EVIDENCE | `doctor__dashboard_home__mobile.png`; `admin__dashboard_home__desktop.png` |
| REPRODUCTION | Open Doctor dashboard; Admin executive control plane |

### S464-P1-08 — Affiliate `/login` route 404

| Field | Value |
| --- | --- |
| APP | Affiliate |
| PAGE | `/login` |
| VIEWPORT | desktop |
| ELEMENT | routing |
| PROBLEM | `/login` returns portal 404 (“This route does not exist”) while auth lives on home |
| EXPECTED | `/login` aliases to sign-in or redirects to authenticated shell login |
| ACTUAL | 404 page with “Back to affiliate home” |
| SEVERITY | P1 |
| SCREENSHOT/EVIDENCE | `supp3_aff_fail.png` |
| REPRODUCTION | Open http://127.0.0.1:3010/login |

---

## P2 — Noticeable polish defects

### S464-P2-01 — Catalog / home product cards use empty image placeholders

Widespread gray image tiles on authenticated home grids and category cards. Evidence: home/search supplemental shots; product P1 is the detail case.

### S464-P2-02 — Admin Global Overview KPI grid orphan card

Five KPI chips with fourth row incomplete (“Recent security events” alone). Evidence: `admin__dashboard_home__desktop.png`.

### S464-P2-03 — Customer footer column imbalance

“OUR SERVICES” column much taller than siblings → uneven footer rhythm across public pages.

### S464-P2-04 — Lab / partner sidebars densely packed vs spacious content

Lab dashboard: 16 stacked sidebar buttons with tight spacing vs large content padding. Evidence: `lab__dashboard_home__desktop.png`. Similar pattern on Doctor mobile.

### S464-P2-05 — Affiliate dashboard sparse / excessive whitespace

Single short card on large canvas after login. Evidence: `affiliate__dashboard_home__desktop.png`.

### S464-P2-06 — Duplicate React keys

~50 console warnings: “Encountered two children with the same key”. Risk of unstable list rendering.

### S464-P2-07 — `/medicines` route 404 on customer web

http://127.0.0.1:3000/medicines → 404 while medicines discovery exists via categories/home. Evidence: supplemental explore status 404.

### S464-P2-08 — Vendor operational pages require explicit org selection

Orders/Catalog/Inventory open to “Select an organization” empty state even when Demo Care Pharmacy exists in selector — friction for ops QA. Evidence: `supp3_vendor_orders__desktop.png`.

### S464-P2-09 — Admin GMV card uses monospaced “Select country” as KPI value

Typography inconsistency vs other KPI numerals. Evidence: admin dashboard desktop.

### S464-P2-10 — HTTP 500/400 noise on several navigations

Console: 10× HTTP 500, 31× 400 during run (not all user-visible). Worth triage when fixing P0/P1.

---

## P3 — Minor cosmetic / design-system inconsistency

### S464-P3-01 — Inconsistent control heights (customer + admin notifications)

Icon/link controls (~15–22px) mixed with primary CTAs (~42–54px) on many Customer pages and Admin notifications. Heuristic flagged 25 page instances; **treat as one design-system debt item**, not 25 separate bugs. Evidence: findings.json S464-001…025, S464-027.

### S464-P3-02 — Breadcrumb vs gate mismatch

Breadcrumb “Home > Search/Categories” while body is market gate.

### S464-P3-03 — Low-contrast footer disclaimer / legal microcopy

Light gray on dark footer — accessibility contrast concern (visual).

---

## Explicitly not claimed as defects

- Unauthenticated 401/redirect on protected routes (expected).
- Sandbox banners (“not a live diagnostic network”) — correct honesty.
- Next.js “N” badge itself (dev tooling); only counted where it **occludes** UI (P1-06) or accompanies blank pages (P0-02).
- Mobile native Android/iOS (ENVIRONMENT_BLOCKED — out of web scope).

---

## Suggested fix order (for a later sprint — do not implement here)

1. P0-01 Logistics OTP proxy/CORS  
2. P0-02 Launch readiness render crash  
3. P0-03 Affiliate `countryCode` on earnings/statement  
4. P1 market/search/product image + doctor mobile nav  
5. Hydration / duplicate keys  
6. P2/P3 polish backlog  

**STOP — no code fixes in S464.**
