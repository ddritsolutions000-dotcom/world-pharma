# WORLD_PHARMA — First Market Decision Document

**Document type:** Founder decision pack (not a feature sprint)  
**Authority:** Repository code + seeds > older narrative docs  
**Baseline:** Pass 01 / Master Index **#458**  
**CAN_PRODUCTION_LAUNCH:** **NO**  
**Country selected by this document:** **NONE**

| Flag | Value |
| --- | --- |
| **OD-COUNTRY-01** | **HUMAN DECISION REQUIRED** |
| **PLATFORM_SOFTWARE_COMPLETE** | **YES** |
| **ACTIONABLE_CODING_BACKLOG** | **ZERO** |
| **COUNTRY_POLICY_READY** | **YES** (engine + Admin; demo packs ≠ live market approval) |
| **PROVIDER_ACTIVATION_READY** | **YES** (framework; providers `NOT_SELECTED`) |
| **ANDROID_REAL_USE** | **ENVIRONMENT_BLOCKED** |
| **CAN_PRODUCTION_LAUNCH** | **NO** |

**Not legal advice.** Regulatory/licence fields are marked **LEGAL/REGULATORY REVIEW REQUIRED** or **UNKNOWN — EXTERNAL VERIFICATION REQUIRED**. This document does **not** choose India, UAE, USA, or any other market.

---

## A. What the software platform already supports

| Capability | Repository evidence | Production status |
| --- | --- | --- |
| Country-neutral core + PolicyPack engine | `empty-pack.ts`, PolicyPack Admin `/policy-packs` | READY (scaffold) |
| Technical placeholder market | Country `XX` / currency `XXX` / empty fail-closed pack | READY (not a real market) |
| Demo market scaffolds | `india-policy.ts`, `uae-policy.ts`, `us-policy.ts` via `seedMarketCountriesIfNeeded` | PARTIAL (dev fixtures; skipped when production env flags set) |
| Country production lifecycle | Prisma `CountryProductionLifecycle` default **CONFIGURED** (not ACTIVE) | READY (human activate later) |
| Customer market ≠ fulfillment/source | `source_country_equals_customer_country: false`; pharmacy/lab/carrier notes `customer_market_may_differ_* = true` | READY (architecture) |
| Medicine marketplace + cart/checkout/orders | Phase 1 / R6+ commerce | READY (sandbox) |
| Pharmacy/vendor network lifecycle | Join → KYC case → licence evidence → commercial approval → catalog/inventory → accept/pick/pack/ready | READY (software); network **EXTERNAL** |
| Rx-controlled commerce safety | `RxFulfillmentSafetyGate`; pack `rx_dispense_enabled` false in sandbox markets | READY (fail-closed); live eRx **EXTERNAL** |
| Payments orchestration | Multi-gateway kernel; production gate forbids mock PSP | READY (software); live PSP **EXTERNAL** |
| OTP / messaging | Console/sandbox adapters; production forbids mock OTP | READY (software); live sender **EXTERNAL** |
| Carrier / logistics | Mock carrier sandbox; production forbids mock | READY (software); live carrier **EXTERNAL** |
| Doctor / lab / imaging / telemedicine | Apps + activation rails (S68–S70, S152 viewer) | READY (software Scope B); live clinical providers **EXTERNAL** |
| Affiliate accrual / statements | S149/S155; payout execute gated | READY (software); bank payout **EXTERNAL** |
| Admin launch + provider activation | `/launch-readiness`, `/provider-activation`, `/countries`, `/partners`, `/marketplace` | READY |
| Production infra activation paths | S142–S148 (secrets, DB, backup, deploy, security, APM) | READY (paths); live targets **EXTERNAL** |

**Additional coded markets beyond IN / AE / US / XX:** **NONE** (ephemeral e2e ISOs only).

---

## B. Candidate countries

| Candidate | Code | Pack source | Role |
| --- | --- | --- | --- |
| India | IN / IND | `apps/api/src/dev/india-policy.ts` | Primary candidate (demo pack) |
| United Arab Emirates | AE / ARE | `apps/api/src/dev/uae-policy.ts` | Primary candidate (demo pack) |
| United States | US / USA | `apps/api/src/dev/us-policy.ts` | Primary candidate (demo pack) |
| Technical placeholder | XX / XXX | `apps/api/src/policy/empty-pack.ts` | **Not a launch candidate** |

---

## C. Country comparison (software readiness)

Legend: **READY** = platform supports the dimension · **PARTIAL** = demo/fixture values only · **EXTERNAL** = live provider/account · **UNKNOWN** = not evidenced in repo (needs external verification).

### C.1 Dimension matrix (IN / AE / US / XX)

| Dimension | IN | AE | US | XX |
| --- | --- | --- | --- | --- |
| Country row + ISO | READY (demo seed) | READY (demo seed) | READY (demo seed) | READY (always) |
| Currency | PARTIAL `INR` | PARTIAL `AED` | PARTIAL `USD` | PARTIAL `XXX` |
| Timezone | PARTIAL `Asia/Kolkata` | PARTIAL `Asia/Dubai` | PARTIAL `America/New_York` (+ Chicago/LA allowed) | PARTIAL `UTC` |
| Locale | PARTIAL `en-IN`,`hi` | PARTIAL `en-AE`,`ar` | PARTIAL `en-US` | PARTIAL `en` |
| Tax | PARTIAL opaque `IN_GST_DEMO` | PARTIAL `AE_VAT_DEMO` | PARTIAL `US_SALES_TAX_DEMO` | READY null (fail-closed) |
| Medicine / marketplace services | PARTIAL (sandbox services on) | PARTIAL | PARTIAL | READY off |
| Rx rules | PARTIAL (`rx_dispense_enabled` false; sandbox eRx code) | PARTIAL | PARTIAL | READY all healthcare off |
| Pharmacy rules / partner types | PARTIAL (join_public pharmacy/vendor) | PARTIAL | PARTIAL | READY partners off |
| Customer rules (identity) | PARTIAL (phone E.164; `+91`) | PARTIAL (`+971`) | PARTIAL (`+1`) | PARTIAL (prefix null) |
| KYC/KYB | EXTERNAL (not in pack; partner + S150 rail) | EXTERNAL | EXTERNAL | EXTERNAL |
| Payment configuration | PARTIAL methods UPI/CARD/COD + **MOCK_PRIMARY** | PARTIAL CARD/COD + MOCK | PARTIAL CARD/WALLET + MOCK | READY payments disabled |
| Logistics / shipping | PARTIAL domestic+rx; international **false** | PARTIAL same | PARTIAL same | READY all shipping false |
| Notification | PARTIAL CRM channels in pack; live messaging EXTERNAL | PARTIAL | PARTIAL (in_app/email) | EXTERNAL / off |
| Doctor / clinical | PARTIAL sandbox healthcare flags | PARTIAL | PARTIAL | READY off |
| Lab | PARTIAL lab_home + lab_center | PARTIAL | PARTIAL | READY off |
| Imaging | PARTIAL imaging_center; PACS EXTERNAL | PARTIAL | PARTIAL | READY off |
| Telemedicine | PARTIAL teleconsult flags; video EXTERNAL | PARTIAL | PARTIAL | READY off |
| Data / privacy | PARTIAL `data_residency_mode: shared`; recording false | PARTIAL | PARTIAL | PARTIAL shared |
| Fulfillment ≠ customer country | READY (architecture) | READY | READY | READY |
| Cross-border medicine claim | EXTERNAL + LEGAL | EXTERNAL + LEGAL | EXTERNAL + LEGAL | READY international false |
| Admin activation support | READY | READY | READY | READY |
| Production lifecycle default | CONFIGURED | CONFIGURED | CONFIGURED | CONFIGURED |
| Live market approval | EXTERNAL + HUMAN | EXTERNAL + HUMAN | EXTERNAL + HUMAN | N/A |

### C.2 First-market dependency matrix

| COUNTRY | SOFTWARE READINESS | REAL PSP REQUIRED | REAL OTP REQUIRED | REAL KYC REQUIRED | REAL PHARMACY NETWORK REQUIRED | REAL CARRIER REQUIRED | CLINICAL PROVIDERS REQUIRED? | LICENCE/REGULATORY REVIEW | MoR DECISION | DATA/PRIVACY REVIEW | TAX/FINANCE REVIEW | CROSS-BORDER REVIEW | BIGGEST OPERATIONAL RISK | BIGGEST BUSINESS RISK | BIGGEST TECHNICAL RISK |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **IN** | Demo pack PARTIAL; engines READY | YES | YES | YES | YES | YES | Scope B only | LEGAL/REGULATORY REVIEW REQUIRED | OD-PAY-01 REQUIRED | LEGAL/REGULATORY REVIEW REQUIRED | LEGAL/REGULATORY REVIEW REQUIRED (GST profile binding) | LEGAL/REGULATORY REVIEW REQUIRED if customer≠source | Partner + UPI/COD ops load | Licence / MoR / tax | Live PSP + OTP sender registration |
| **AE** | Demo pack PARTIAL; engines READY | YES | YES | YES | YES | YES | Scope B only | LEGAL/REGULATORY REVIEW REQUIRED | OD-PAY-01 REQUIRED | LEGAL/REGULATORY REVIEW REQUIRED | LEGAL/REGULATORY REVIEW REQUIRED (VAT profile) | LEGAL/REGULATORY REVIEW REQUIRED | Free-zone / partner density UNKNOWN | Licence / MoR | Live PSP market enablement |
| **US** | Demo pack PARTIAL; engines READY | YES | YES | YES | YES | YES | Scope B only | LEGAL/REGULATORY REVIEW REQUIRED | OD-PAY-01 REQUIRED | LEGAL/REGULATORY REVIEW REQUIRED | LEGAL/REGULATORY REVIEW REQUIRED (sales tax profile) | LEGAL/REGULATORY REVIEW REQUIRED | Multi-timezone + state complexity UNKNOWN | Licence / MoR / controlled substances UNKNOWN | Wallet method vs wallet service flag alignment at go-live |
| **XX** | Fail-closed READY | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | Accidental use as live market | Not a market | None if left technical |

Unknowns for **all** real candidates (do not invent): exact licence document lists, controller/processor residency, national eRx (if Scope B), live merchant accounts → **UNKNOWN — EXTERNAL VERIFICATION REQUIRED**.

---

## D. Day-1 scope comparison

### SCOPE A — Medicine marketplace + pharmacy fulfillment + account/orders + payments + delivery

| Country | Software-ready for Scope A journeys? | Still EXTERNAL / HUMAN |
| --- | --- | --- |
| IN / AE / US | **YES** (sandbox journeys complete; same engines) | Live PSP, OTP, KYC, ≥1 licensed pharmacy, carrier, MoR, licences, tax profile binding, infra, country ACTIVE |
| XX | Not a market | N/A |

### SCOPE B — Scope A + doctor + lab + imaging + telemedicine

| Country | Software-ready for Scope B journeys? | Still EXTERNAL / HUMAN |
| --- | --- | --- |
| IN / AE / US | **YES** for application rails (consult, lab booking, imaging viewer, telemed flags) | All Scope A externals **plus** doctor/lab/imaging partners, eRx (if transmission claimed), video SFU, PACS (if live DICOM), clinical licences — LEGAL/REGULATORY REVIEW REQUIRED |
| XX | Healthcare services off | N/A |

**Founder choice (not made here):** Scope A vs Scope B after OD-COUNTRY-01. Medicine-first (Scope A) can keep clinical pack services off until contracted.

---

## E. External dependencies (shared)

| Class | Blocker examples (repo) | Required for Scope A | Required for Scope B |
| --- | --- | --- | --- |
| Secrets manager | `NO_PRODUCTION_SECRETS_MANAGER` | YES | YES |
| Production DB / backup / PITR / DR | `NO_PRODUCTION_DATABASE` / managed backup | YES | YES |
| Private storage / KMS / malware | storage/KMS/scanner blockers | YES (KYC docs) | YES |
| Deploy / domain / TLS / WAF | deploy / WAF blockers | YES | YES |
| APM / monitoring | APM blockers | YES | YES |
| PSP | `NO_PRODUCTION_PSP` / mock forbidden | YES | YES |
| OTP / messaging | OTP/messaging blockers | YES | YES |
| KYC/KYB | `NO_PRODUCTION_KYC_KYB_PROVIDER` | YES | YES |
| Pharmacy/vendor network | `NO_PRODUCTION_PHARMACY_VENDOR_NETWORK` | YES | YES |
| Carrier | `NO_PRODUCTION_CARRIER_ADAPTER` | YES | YES |
| eRx / video / PACS | clinical blockers | NO (if services off) | YES if claiming those rails |
| Affiliate payout | `NO_PRODUCTION_PAYOUT_ADAPTER` | Optional | Optional |

---

## F. Legal / business review items

Do **not** treat the following as software-complete:

1. **OD-COUNTRY-01** — first launch market name  
2. **OD-PAY-01** — Merchant of Record / legal entity / operating currency  
3. Pharmacy (and clinical if Scope B) **licences** — LEGAL/REGULATORY REVIEW REQUIRED  
4. Tax registration + binding real tax profile (replace `*_DEMO` refs)  
5. Data controller vs processor / residency — LEGAL/REGULATORY REVIEW REQUIRED  
6. Cross-border medicine if customer country ≠ fulfillment country — LEGAL/REGULATORY REVIEW REQUIRED  
7. Terms, privacy, consent copy for the chosen market  
8. Partner commercial contracts  
9. Pentest / security launch evidence  

---

## G. Pharmacy network requirements

| Capability | Classification |
| --- | --- |
| Vendor account | SOFTWARE READY (+ HUMAN activate) |
| Pharmacy profile | SOFTWARE READY |
| KYC/KYB case workflow | SOFTWARE READY (sandbox) / EXTERNAL (production provider) |
| Licence / evidence references | SOFTWARE READY (upload/review SM) / HUMAN (real licence) |
| Catalogue / SKU / price | SOFTWARE READY |
| Inventory / stock | SOFTWARE READY |
| Order acceptance | SOFTWARE READY |
| Rx-controlled fulfillment gates | SOFTWARE READY (fail-closed) / EXTERNAL+HUMAN if live eRx claimed |
| Packing / Ready | SOFTWARE READY |
| Dispatch | SOFTWARE READY (sandbox mock) / EXTERNAL (live carrier) |
| Returns | SOFTWARE READY (workflow) / EXTERNAL (live refund rail) |
| Settlement statements | SOFTWARE READY (vendor R/O) / EXTERNAL (payout) |
| Team permissions | SOFTWARE READY |
| Admin approval / SoD | SOFTWARE READY (+ HUMAN SoD) |

**Minimum before real orders in a first market:** contracted KYC path + ≥1 commercially approved, licence-evidenced pharmacy/vendor + live PSP + OTP + carrier + country policy published for that market.

---

## H. Provider activation sequence (corrected for first market)

Repository S64 phases are infra-first; **S158** correctly places **human market/MoR/licence before** enabling live rails. Combined **execution order** for the selected first market:

1. **Market selection** — OD-COUNTRY-01 (HUMAN)  
2. **MoR / legal entity** — OD-PAY-01 (HUMAN)  
3. **Licences / regulatory evidence** — LEGAL/REGULATORY REVIEW REQUIRED (HUMAN)  
4. **Publish real PolicyPack** for chosen ISO (currency, TZ, locale, services, payments methods, shipping, healthcare flags) — CONFIG (replace demo where needed)  
5. **Cloud / infrastructure account** — EXTERNAL  
6. **Secrets manager** (S142) — EXTERNAL + CONFIG  
7. **Production DB** (S146) — EXTERNAL  
8. **Backup / PITR / DR** (S147) — EXTERNAL + evidence  
9. **Private storage / KMS / malware** (S73/S140) — EXTERNAL  
10. **Deployment target + CI/CD** (S144/S145) — EXTERNAL  
11. **Domain / TLS** — EXTERNAL  
12. **WAF / DDoS** — EXTERNAL  
13. **APM / monitoring / alerting** (S143) — EXTERNAL  
14. **PSP** (S65 / R14-A human gates) — EXTERNAL  
15. **OTP / messaging** (S66) — EXTERNAL  
16. **KYC/KYB** (S72/S150) — EXTERNAL  
17. **Pharmacy / vendor partners** (network closure) — HUMAN + EXTERNAL  
18. **Carrier** (S67) — EXTERNAL  
19. **Clinical providers** (eRx / video / PACS / doctor-lab-imaging) — **only if Scope B** — EXTERNAL + LEGAL  
20. **Affiliate payout** — only if affiliate bank payout in Day-1 scope — EXTERNAL  
21. **Controlled pilot** + SOPs — HUMAN  
22. **Pentest / security evidence** — HUMAN / EXTERNAL  
23. **CountryProductionLifecycle → ACTIVE** + launch authorization — HUMAN  
24. Only then consider **`CAN_PRODUCTION_LAUNCH = YES`**

**Dependency note:** KYC documents need storage/KMS before production KYC enablement. PSP enablement must not precede MoR decision. Carrier after payments stability is preferred (S64) but pharmacy network may be onboarded in parallel after KYC.

---

## I. Cross-border considerations

| Check | Result |
| --- | --- |
| Architecture assumes India is source? | **NO** — India is one demo pack only |
| Customer country ≠ fulfillment/source supported? | **YES** — explicit `source_country_equals_customer_country: false`; vendor/lab/carrier activation notes allow market ≠ source |
| How modeled? | Customer cart/order `countryId` (market of sale); partner/org `countryId` + location/fulfillment origin independent |
| Pack `shipping.international` | Defaults **false** on empty/sandbox/market demos |
| Claiming cross-border medicine fulfillment | **LEGAL/REGULATORY REVIEW REQUIRED** — software does not auto-approve |
| Software defect found? | **NONE** — no architecture change in this review |

Example (software-supported pattern, not a legal approval):

- Customer browses/buys in market **A** (order `countryId` = A)  
- Pharmacy/vendor fulfills from market **B** (partner location in B)  
→ Allowed by platform model; **legal/tax/customs/medicine import-export** = LEGAL/REGULATORY REVIEW REQUIRED before operations claim it.

---

## J. Risks

| Class | Risk |
| --- | --- |
| Operational | Onboarding density of licensed pharmacies; COD/returns ops; support staffing |
| Business | Wrong first market / MoR mismatch; licence delays; Scope B expansion before partners exist |
| Technical | Enabling mock PSP/OTP/carrier in production (blocked by gates — keep fail-closed); treating demo packs as live evidence |
| Legal | Cross-border medicine; clinical transmission; data residency — LEGAL/REGULATORY REVIEW REQUIRED |
| Device | Android/iOS store validation still ENVIRONMENT_BLOCKED on current Windows host |

---

## K. HUMAN DECISION REQUIRED

Founders / legal / finance must decide (outside this repository):

1. **Which first market?** (IN / AE / US / other — other requires new Country + PolicyPack, not auto-invented)  
2. **Day-1 scope?** Scope A vs Scope B  
3. **MoR model?** OD-PAY-01  
4. **Allow cross-border fulfillment in Day-1?** If yes → LEGAL/REGULATORY REVIEW REQUIRED  
5. **Affiliate live payout in Day-1?** Optional  

---

## Admin activation verification

| Control | Admin surface | Status |
| --- | --- | --- |
| Country / policy pack | `/countries`, `/policy-packs` | PRESENT — no missing control defect |
| Provider activation | `/provider-activation` | PRESENT |
| Pharmacy / vendor | `/partners`, `/marketplace` | PRESENT |
| KYC/KYB | Partners + provider KYC card | PRESENT |
| PSP / OTP / Carrier / eRx / Video / PACS / Storage | Provider activation cards | PRESENT |
| Deployment / monitoring / backup visibility | Launch readiness / reliability / control-plane | PRESENT |
| Launch readiness | `/launch-readiness` | PRESENT |

**Genuine blocking Admin software defect found:** **NONE** (no code change).

---

## Android check (this review)

| Probe | Result |
| --- | --- |
| `adb devices` | Empty |
| Emulator binary | Missing |
| **ANDROID_REAL_USE** | **ENVIRONMENT_BLOCKED** |

APKs already exist; this pass did not install or change product code.

---

## Code changes

**ZERO** — no defect found that blocks country configuration, launch-readiness visibility, provider activation, or first-market execution frameworks.

---

## Tests

**Not required** (documentation-only review; no code changes). Prior Pass 01 production gate suites remain the last executed evidence.

---

# OD-COUNTRY-01 = HUMAN DECISION REQUIRED

This document ends without selecting a country.
