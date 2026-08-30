# 35 — Open Decisions

**Status:** Blueprint (living catalog)  
**Audience:** Founders, product, legal, architecture, finance, clinical ops, logistics  
**Related:** All blueprint books. Source IDs are preserved from domain docs. Architecture IDs added in 27–32.

**How to use:** Do not delete a row when decided — set **Status** to `DECIDED` and date. Engineering defaults in **Recommendation** may be used in code **as technical behavior**, not as law.

**Owners:** `business` · `legal` · `eng` · `finance` · `ops` · `clinical` (may be combined).

**Phases:** [33](33_DEVELOPMENT_ROADMAP.md).

**Phase 0 classification and engineering defaults:** [38_PHASE_0_DECISION_BOARD.md](38_PHASE_0_DECISION_BOARD.md). **Phase 0 work plan (no code):** [39_PHASE_0_IMPLEMENTATION_PLAN.md](39_PHASE_0_IMPLEMENTATION_PLAN.md).

**CONFIRMED (not open):**

| ID | Decision |
| --- | --- |
| **OD-ARCH-01** | **Modular monolith first** ([04](04_APPLICATION_ARCHITECTURE.md) §1). Extract later behind the same APIs. |
| Recording default | **Off.** Consult continues if recording is denied. Never ship recording-on-by-default. |
| Ledger timing | **Double-entry from Phase 2**; not postponed to ERP |
| Policy packs | **Scaffold in Phase 0**; legal values empty until review |
| PCI | **No PAN/CVV** on platform; PSP tokens only |
| Multi-vendor goods order | **Not v1** (A-BIZ-01 / A-CUS-02) |

---

## 1. Product

| ID | Question | Recommendation until decided | Needed by | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| **OD-BRAND-01** | Legal brand, app name, entity vs “World Pharma” working title | Keep repo name internally; **do not** print brand claims in store until decided | Phase 1 store listing | business + legal | [01](01_PRODUCT_VISION.md) |
| **OD-COUNTRY-01** | First launch country | Empty pack + technical defaults; **no hardcoded IN** | Phase 0 region / Phase 1 catalog | business + legal | [01](01_PRODUCT_VISION.md) |
| **OD-PROD-01** | Insurance / TPA / corporate plans in 24-month roadmap | Adapters only; not a core | Phase 9+ unless business pulls in | business | [01](01_PRODUCT_VISION.md) |
| **OD-PROD-02** | B2B hospital supply / corporate health | Out of v1 | Phase 9+ | business | [01](01_PRODUCT_VISION.md) |
| **OD-PROD-03** | Numeric success metrics | Categories only until set | Phase 2 live | business | [01](01_PRODUCT_VISION.md) |
| **OD-CUS-01** | Mixed-basket **UI** (goods + consult/lab in one sheet) | **Kernel composite from day one**; UI may stay split then pack-flag | Kernel P2; UI optional P2–P5 | product | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-02** | COD vs prepaid status vocabulary | Same fulfillment states; method = COD | Phase 2 | product + finance | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-03** | Guest checkout | **Account before payment**; browse OK | Phase 2 | product | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-04** | Caregiver / family clinical accounts | **Not v1**; “on behalf of” delivery fields only. Legal model with OD-RBAC-03 | Not P1–P5 | product + legal | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-05** | Social login providers in first pack | **None** until pack lists; Apple if social+iOS requires | Phase 1 | product + legal | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-07** | Own-pharmacy vs vendor search boost | Pack-configurable, not hardcoded | Phase 3 | product | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-08** | Consult chat auto-saved as HealthArtifact | Only if doctor pins/signs | Phase 4 | product + clinical | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-09** | Lab home-first vs center-first | Home-first where pack enables (align OD-LAB-01) | Phase 5 | product | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-10** | Package with unavailable inclusion | **Block** package; offer individuals | Phase 5 | product | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-11** | Physical report reprint fee | Pack; do not invent | Phase 5 | product + legal | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-12** | Membership paid vs earn vs hybrid | **Legal first** (inducement) | Phase 7 | product + legal | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-13** | Loyalty unit (points vs cashback) | Integer points subledger if on | Phase 7 | product + finance | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-CUS-14** | OOS after pay | **Auto-refund** unless customer accepts substitute | Phase 2 | product | [05](05_CUSTOMER_PLATFORM.md) |
| **OD-DOC-01** | Instant queue consult vs slotted only | Slots in v1 unless product pulls instant | Phase 4 | product | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-05** | Follow-up window vs new paid booking | Pack; no invented free days | Phase 4 | product + clinical | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-08** | Chat-only paid SKU | Optional later | Phase 4 | product | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-09** | Review pre vs post moderation | Post with takedown; **LEGAL** defamation | Phase 4 | product + legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-10** | Auto-route digital Rx to pharmacy cart | Patient-driven “Order medicines” v1 (aligned with [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) §8 and [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) until decided) | Phase 4 / R5-D | product | [08](08_DOCTOR_PLATFORM.md), [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md), [117](117_R5_D_ORDER_FROM_RX_COMMERCIAL_HANDOFF_PLAN.md) |
| **OD-DOC-14** | Filter doctors by gender | Product + **LEGAL** | Phase 4 | product + legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-21** | Doctor rates patient | **No** | Phase 4 | product | [08](08_DOCTOR_PLATFORM.md) |
| **OD-PHARM-01** | Warehouse ship-to-customer vs store last mile | **Stores dispatch**; warehouse replenishes | Phase 2 | product + ops | [06](06_PHARMACY_PLATFORM.md) |
| **OD-PHARM-02** | Split ship within owned org | **No** v1 | Phase 2 | product | [06](06_PHARMACY_PLATFORM.md) |
| **OD-PHARM-04** | Skip Rx desk if platform-signed Rx | Default **still verify** | Phase 2/4 | clinical + legal | [06](06_PHARMACY_PLATFORM.md) |
| **OD-PHARM-08** | Explicit Accept vs auto after allocate | Auto ACCEPTED after allocate | Phase 2 | ops | [06](06_PHARMACY_PLATFORM.md) |
| **OD-PHARM-09** | Substitution needs customer accept | **Yes** if molecule/strength change | Phase 2 | product | [06](06_PHARMACY_PLATFORM.md) |
| **OD-CRM-03** | Loyalty/membership in CRM v1 | Coupons first | Phase 7 | product | [15](15_CRM_PLATFORM.md) |
| **OD-CRM-05** | B2B lead ownership | Out of v1 product | later | business | [15](15_CRM_PLATFORM.md) |
| **OD-CRM-07** | Churn ML vs rules | Rules v1 | Phase 7 | product | [15](15_CRM_PLATFORM.md) |
| **OD-CRM-08** | Live support chat | Tickets async first | Phase 7 | product | [15](15_CRM_PLATFORM.md) |
| **OD-AFF-06** | Individual vs org affiliates | Individuals v1 | Phase 7 | product | [14](14_AFFILIATE_PLATFORM.md) |
| **OD-AFF-09** | Multi-touch attribution | Out of v1 | later | product | [14](14_AFFILIATE_PLATFORM.md) |

---

## 2. Commercial

| ID | Question | Recommendation until decided | Needed by | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| **OD-DOC-04** | Doctor take-rate vs SaaS vs hybrid | Country-gated; **LEGAL** fee-split | Phase 4 | business + legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-07** | Clinic admin override employed doctor fees | Later with clinic org | Phase 4+ | business | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-11** | Employed vs independent payout split | Clinic org | Phase 4+ | finance + legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-16** | Book before payout profile complete | Book allowed; payout blocked | Phase 4 | finance | [08](08_DOCTOR_PLATFORM.md) |
| **OD-VEND-02** | Who funds delivery fee | Pack; default customer fee | Phase 3 | business | [07](07_VENDOR_PLATFORM.md) |
| **OD-VEND-05** | Vendor accept SLA seconds | Pack; 15m **demo only** | Phase 3 | ops | [07](07_VENDOR_PLATFORM.md) |
| **OD-VEND-08** | Dispatch SLA auto-cancel | Pack; cancel + refund if not dispatched | Phase 3 | ops | [07](07_VENDOR_PLATFORM.md) |
| **OD-LED-06** | Promo funded by platform vs vendor | Explicit `funded_by` | Phase 2 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-07** | Net vs gross participant payout | **Net v1**; gross on statements | Phase 3 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-09** | Owned pharmacy same entity vs intercompany | Same entity v1 | Phase 2 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-12** | Exact settlement calendars | Config per country; not hardcoded | Phase 2–3 | finance + ops | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-13** | Membership revenue recognition | Defer if term > one period | Phase 7 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-AFF-01** | Last vs first vs multi-touch | **Last eligible click** in window | Phase 7 | product | [14](14_AFFILIATE_PLATFORM.md) |
| **OD-AFF-02** | Attribution window per category | Config; no hardcoded days | Phase 7 | product | [14](14_AFFILIATE_PLATFORM.md) |
| **OD-AFF-05** | Commission hold period | Align goods with return window | Phase 7 | finance | [14](14_AFFILIATE_PLATFORM.md) |
| **OD-AFF-07** | Coupon + affiliate stacking | Deny platform-funded double dip | Phase 7 | finance | [14](14_AFFILIATE_PLATFORM.md) |
| **OD-AFF-08** | Partial refund commission math | Pro-rate goods; full reverse cancelled booking | Phase 7 | finance | [14](14_AFFILIATE_PLATFORM.md) |
| **OD-PHE-05** | Phlebo earnings model | Hybrid allowed in data model | Phase 5 | ops + finance | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-10** | Jobs before payout profile | Same pattern as doctors | Phase 5 | finance | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-14** | Show-up fee failed visit | Pack; no invented penalty | Phase 5 | ops + legal | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-LOG-08** | Surge pricing | Later; pack | Phase 6 | business | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-SLA-01** | Contractual customer SLAs / credits | Engineering targets only ([04](04_APPLICATION_ARCHITECTURE.md) §11) | When selling SLA | business + legal | [04](04_APPLICATION_ARCHITECTURE.md) |

---

## 3. Legal

| ID | Question | Recommendation until decided | Needed by | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| **OD-PAY-01** | Merchant of record vs facilitator vs vendor-as-seller | **Do not hardcode**; pack after **LEGAL**. Blocks honest chargeback/tax | **Phase 2** | legal + finance | [12](12_PAYMENT_PLATFORM.md) |
| **OD-PAY-05** | Wallet off / promo-only / top-up | **Off** until stored-value review | Phase 2 | legal | [12](12_PAYMENT_PLATFORM.md) |
| **OD-PAY-07** | SCA / step-up thresholds | Follow PSP `next_action`; legal encodes mandates | Phase 2 | legal + eng | [12](12_PAYMENT_PLATFORM.md) |
| **OD-PAY-12** | Marketplace chargeback ownership | Follow OD-PAY-01 | Phase 3 | legal + finance | [12](12_PAYMENT_PLATFORM.md) |
| **OD-PAY-13** | BNPL | Out of v1 | later | legal + product | [12](12_PAYMENT_PLATFORM.md) |
| **OD-RBAC-01** | Dual control doctor (and lab) KYC | **Yes in prod**; single reviewer only in non-prod | Phase 4 (doc) / 5 (lab) | legal + ops | [03](03_USER_ROLES_AND_PERMISSIONS.md) |
| **OD-RBAC-02** | Support may see Rx images | **Default no** | Phase 1 | legal + product | [03](03_USER_ROLES_AND_PERMISSIONS.md) |
| **OD-RBAC-03** | Caregiver / proxy legal model | Off in v1; **LEGAL per country** | before family product | legal | [03](03_USER_ROLES_AND_PERMISSIONS.md) |
| **OD-RBAC-04** | Same person doctor + vendor in prod | Data model allows; prod policy TBD | Phase 3–4 | legal + ops | [03](03_USER_ROLES_AND_PERMISSIONS.md) |
| **OD-RBAC-05** | Clinic custom receptionist roles | Subset of system role; Phase 4+ | Phase 4 | product | [03](03_USER_ROLES_AND_PERMISSIONS.md) |
| **OD-EHR-01** | Platform controller vs processor (or local equivalent) | Architecture supports both; **LEGAL per country** | Phase 0–1 | legal | [16](16_HEALTH_RECORD.md) |
| **OD-EHR-02** | Partners independent vs joint controllers | Pointers + residency flags regardless | Phase 4–5 | legal | [16](16_HEALTH_RECORD.md) |
| **OD-EHR-05** | Caregiver proxy (see OD-RBAC-03) | Off v1 | later | legal | [16](16_HEALTH_RECORD.md) |
| **OD-EHR-06** | Break-glass who + patient notify | super_admin + reason + time box; notify **if pack** | Phase 4 | legal + security | [16](16_HEALTH_RECORD.md) |
| **OD-EHR-08** | Cross-border artifact access | **Deny replicate** by default | Phase 9 | legal | [16](16_HEALTH_RECORD.md) |
| **OD-AFF-03** | Clinical categories ever payable to affiliates | **Default OFF**; legal sign-off on pack | Phase 7 | legal | [14](14_AFFILIATE_PLATFORM.md) |
| **OD-CRM-06** | Marketing opt-in model | Explicit allow; per country | Phase 7 | legal | [15](15_CRM_PLATFORM.md) |
| **OD-VID-02** | Recording storage duration **if** ever allowed | Pack after legal; default feature **off** | Phase 4 | legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-VID-03** | Extra participants (caregiver, interpreter) | Doctor + patient only until policy | Phase 4 | legal + product | [08](08_DOCTOR_PLATFORM.md) |
| **OD-VID-06** | Quality telemetry clinical audit vs ops-only | **Ops-only** until legal | Phase 4 | legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-LAB-08** | Pathologist e-signature mechanism | Pack after legal | Phase 5 | legal + clinical | [09](09_LAB_PLATFORM.md) |
| **OD-VEND-01** | Vendor may verify Rx | Default **owned pharmacy only** | Phase 3 | legal | [07](07_VENDOR_PLATFORM.md) |
| **OD-PHE-08** | Gender-preference matching home collection | Filter only if pack; **LEGAL** employment/discrimination | Phase 5 | legal | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-LED-05** | Rider employee vs contractor **accounting** | Pack; not employment-law advice | Phase 2 | finance + legal | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-14** | Accounting standard + G/L export | Per legal entity | Phase 8 | finance + legal | [13](13_LEDGER_SETTLEMENT.md) |

Incident **notification clocks**, pharmacy licensing, telemedicine eligibility, advertising of medicines, and children’s age of consent: **LEGAL REVIEW** — no OD number replaces counsel.

---

## 4. Architecture

| ID | Question | Recommendation until decided | Needed by | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| **OD-ARCH-01** | Modular monolith vs microservices | **CONFIRMED: modular monolith** | Phase 0 | eng | [04](04_APPLICATION_ARCHITECTURE.md) |
| **OD-ARCH-02** | One RN workspace + flavors vs many apps | **One workspace**; **separate store listings** | Phase 1 | eng + product | [04](04_APPLICATION_ARCHITECTURE.md) |
| **OD-CLOUD-01** | AWS vs GCP (Azure out of default) | **AWS default**; GCP acceptable; **single cloud** | Phase 0 | eng | [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| **OD-ORCH-01** | ECS vs Cloud Run vs k8s | **Managed containers**; **no k8s day one**; k8s when extract/residency needs | Phase 0 | eng | [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| **OD-MONO-01** | Nx vs Turborepo | Nx if boundary tags; Turbo if thin | Phase 0 | eng | [32](32_DEVOPS_CICD.md) |
| **OD-CI-01** | GitHub Actions vs GitLab | Match VCS; Actions if GitHub | Phase 0 | eng | [32](32_DEVOPS_CICD.md) |
| **OD-IAC-01** | Terraform vs CDK | Terraform | Phase 0 | eng | [32](32_DEVOPS_CICD.md) |
| **OD-CDN-01** | Cloudflare vs CloudFront | One vendor for CDN+WAF | Phase 0 | eng | [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| **OD-SEARCH-01** | OpenSearch hosting | Managed, same cloud | Phase 1 | eng | [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| **OD-OBS-01** | APM/log vendor | OTel + Sentry + cloud metrics | Phase 0 | eng | [30](30_OBSERVABILITY.md) |
| **OD-SEC-01** | Passkeys vs TOTP-first professionals | TOTP required; passkeys additive | Phase 1 | eng + security | [27](27_SECURITY_ARCHITECTURE.md) |
| **OD-SEC-02** | Customer password vs OTP-only | OTP-first | Phase 1 | product + eng | [27](27_SECURITY_ARCHITECTURE.md) |
| **OD-SEC-03** | Refresh sliding vs absolute | Sliding idle + hard cap; short admin | Phase 0 | eng | [27](27_SECURITY_ARCHITECTURE.md) |
| **OD-SEC-04** | CMK hold-your-own vs cloud-managed | Cloud-managed CMK per class | Phase 0 | eng | [27](27_SECURITY_ARCHITECTURE.md) |
| **OD-SEC-05** | Vault vs cloud secrets manager | Cloud-native Phase 0 | Phase 0 | eng | [27](27_SECURITY_ARCHITECTURE.md) |
| **OD-DR-01** | Numeric RPO/RTO | PITR ≤ 5 min OLTP; RTO **hours** single region early | Phase 0 | eng | [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| **OD-FLAG-01** | Feature-flag product | OSS/cloud-native; pack ≠ experiment flag | Phase 0 | eng | [32](32_DEVOPS_CICD.md) |
| **OD-MOB-01** | OTA JS updates | JS-only; not policy/crypto | Phase 1 | eng | [32](32_DEVOPS_CICD.md) |
| **OD-DEV-01** | Preview environments | Web yes; synthetic data only | Phase 0 | eng | [32](32_DEVOPS_CICD.md) |
| **OD-ANL-01** | Product analytics vendor | Scrubbed events; **no PHI warehouse** | Phase 1–2 | eng + product | [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| **OD-VID-01** | LiveKit Cloud vs self-host vs hybrid | **Cloud until residency**; adapter mandatory | Phase 4 | eng | [08](08_DOCTOR_PLATFORM.md) |
| **OD-NTF-01** | SMS / WhatsApp BSP vendors | Per country pack; adapter; fallback | Phase 1 | eng + ops | [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| **OD-QA-01** | RN e2e depth | API e2e + one RN smoke per persona | Phase 2 | eng | [31](31_TESTING_STRATEGY.md) |
| **OD-ROAD-01** | Calendar/staffing model | Directional weeks in 33 only | planning | business + eng | [33](33_DEVELOPMENT_ROADMAP.md) |

---

## 5. Payments

Includes FX. Align with [12](12_PAYMENT_PLATFORM.md) §23.

| ID | Question | Recommendation until decided | Needed by | Owner |
| --- | --- | --- | --- | --- |
| **OD-PAY-01** | MoR / facilitator / vendor-as-seller | See Legal | **Phase 2** | legal + finance |
| **OD-PAY-02** | AUTHORIZE vs CAPTURE per category | **Goods/lab: capture on success**; **consult: auth then capture** (consumer-cancel **LEGAL**) | Phase 2 / 4 | finance + product |
| **OD-PAY-03** | Super checkout mix of domains | **One session, multiple children; all-or-nothing capture** | Phase 2 kernel | product + eng |
| **OD-PAY-04** | COD remittance SLA / cash over-short | Ops policy per country | Phase 2 | ops + finance |
| **OD-PAY-05** | Wallet model | Off until legal | Phase 2 | legal |
| **OD-PAY-06** | Acquiring vs payout same vendor | **Separate ports**; config may use one vendor | Phase 2 | eng + finance |
| **OD-PAY-08** | Partial capture | **Yes for goods**; remaining auth voided | Phase 2 | finance |
| **OD-PAY-09** | Routing objective | Success rate, then cost; pack mandates override | Phase 2 | eng |
| **OD-PAY-10** | Retry vs customer-visible fail | Non-retryable = fail immediately | Phase 2 | product |
| **OD-PAY-11** | Split tender wallet+instrument | Allow **if** wallet on | Phase 2 | product |
| **OD-PAY-14** | Idempotency TTL | 24–72 h | Phase 2 | eng |
| **OD-FX-01** | Who bears refund FX | Refund **original payment currency**; delta to platform FX P&L | Phase 2 | finance |
| **OD-FX-02** | FX lock timing | Capture lock; quote as estimate if different | Phase 2 | finance |
| **OD-FX-03** | Customer chooses payment currency | Off unless pack + PSP | Phase 2 | product |
| **OD-FX-04** | Accounting currency grain | **One per legal entity** | Phase 2 | finance |
| **OD-FX-05** | Rounding mode | Half-up to exponent unless PSP mandates | Phase 2 | finance |
| **OD-FX-06** | Cross-currency wallet | **No**; one wallet currency per customer×country | Phase 2 | finance |
| **OD-PHARM-03** | Refunded as status vs flag | Status + `refund_ids[]` | Phase 2 | eng |
| **OD-PHARM-10** | Invoice timing | Pack; default at ACCEPTED for prepaid | Phase 2 | finance |

---

## 6. Clinical

| ID | Question | Recommendation until decided | Needed by | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| **OD-DOC-02** | No-show grace, fees, refunds | **No automatic financial penalty** until pack; states + ops queue | **Before paid consults** | clinical + legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-03** | Dual control doctor KYC | Align **OD-RBAC-01** | Phase 4 | ops | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-06** | Multi-country active licenses one profile | Country-scoped profiles safer | Phase 9 | clinical + legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-12** | Identity check at consult start | Pack | Phase 4 | clinical + legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-13** | Clinic admin cancel without doctor | Clinic org | Phase 4 | product | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-15** | Parallel vs sequential onboarding reviews | Parallel OK; all must pass | Phase 4 | ops | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-17** | Overtime billing / hard stop | Pack | Phase 4 | clinical | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-18** | Slot generation horizon | 14–28 days | Phase 4 | ops | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-19** | Same-doctor history without new grant | Still require grant or “continue care” grant | Phase 4 | legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-DOC-20** | Clinic-level vs named-doctor consent | Named doctor v1 | Phase 4 | legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-VID-04** | Screenshare | Off; chat upload for images | Phase 4 | product | [08](08_DOCTOR_PLATFORM.md) |
| **OD-VID-05** | Chat retention | Pack; clinical vs convenience may differ | Phase 4 | legal | [08](08_DOCTOR_PLATFORM.md) |
| **OD-VID-07** | PSTN bridge | **No v1** | later | eng | [08](08_DOCTOR_PLATFORM.md) |
| **OD-VID-08** | Timer pauses during reconnect | Product | Phase 4 | product | [08](08_DOCTOR_PLATFORM.md) |
| **OD-VID-09** | Reconnect give-up minutes | Pack | Phase 4 | product | [08](08_DOCTOR_PLATFORM.md) |
| **OD-EHR-03** | Default ConsentGrant TTL | Encounter + short tail; explicit share for more | Phase 4 | legal + product | [16](16_HEALTH_RECORD.md) |
| **OD-EHR-04** | FHIR export timing | Structured JSON v1; FHIR when pack needs | Phase 8–9 | eng + legal | [16](16_HEALTH_RECORD.md) |
| **OD-EHR-07** | Amendment model | New artifact supersedes; no in-place edit | Phase 4 | clinical | [16](16_HEALTH_RECORD.md) |
| **OD-EHR-09** | Patient-visible consult summary vs clinician-only note | Optional patient summary | Phase 4 | clinical | [16](16_HEALTH_RECORD.md) |
| **OD-EHR-10** | Offline copies after revoke | No bulk download v1; revoke stops fetches | Phase 4 | eng | [16](16_HEALTH_RECORD.md) |
| **OD-LAB-01** | Center visit in v1 vs home-only | Home-first; center **optional** pack | Phase 5 | product | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-02** | **Bill-on-booking vs accession vs report** | **Cash at booking (unearned); lab AP on report release**; fail → J16. Align **OD-LED-01** | **Phase 5** | finance + clinical | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-03** | Customer picks lab vs platform assign | Rank/assign with visibility; pack | Phase 5 | product | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-04** | Multi-sample status rollup / partial reports | Least-progressed + per-sample banners | Phase 5 | product | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-05** | Panic-value notification channels | Flag + ops playbook; **no values in SMS** if pack forbids | Phase 5 | clinical + legal | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-06** | Amendment visibility to customer | Versioned; pack | Phase 5 | clinical | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-07** | Lost hard copy reprint vs refund vs pickup | Pack | Phase 5 | ops | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-09** | Lab reject confirmed booking for capacity | Pack; honor vs reject | Phase 5 | ops | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-10** | Prep conflict hard block vs warning | **Hard block** | Phase 5 | clinical | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-11** | Age/gender restriction hard block vs warning | Pack; default acknowledge vs block TBD in pack | Phase 5 | clinical + legal | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-12** | Overbooking % | Default **0** | Phase 5 | ops | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-13** | Platform vs lab-local barcode primary | **Platform barcode at collection**; lab accession additional | Phase 5 | ops | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-14** | Temperature logger by specimen | Optional until pack; out of range → reject | Phase 5 | clinical | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-15** | Split package across labs | **v1 no** | Phase 5 | product | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-16** | COD for diagnostics | **No** until decided | Phase 5 | finance | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-17** | Same user result-enter and sign | **Separate users** until pack | Phase 5 | legal | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-18** | Automated delta checks | Off until pack | Phase 5 | clinical | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-19** | Customer cancel after phlebo en route | Pack | Phase 5 | product | [09](09_LAB_PLATFORM.md) |
| **OD-LAB-20** | Recollection pricing | Pack; do not invent | Phase 5 | finance | [09](09_LAB_PLATFORM.md) |
| **OD-PHARM-05** | Central country Rx desk vs location pharmacist | Location first | Phase 2 | ops | [06](06_PHARMACY_PLATFORM.md) |
| **OD-CRM-04** | Support see Rx images | **No** (= OD-RBAC-02) | Phase 1 | legal | [15](15_CRM_PLATFORM.md) |

---

## 7. Logistics

| ID | Question | Recommendation until decided | Needed by | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| **OD-CUS-06** / **OD-LOG-01** | Maps / ETA vendor | Adapter; per-country; Google/Mapbox/local | Phase 2 | eng + ops | [05](05_CUSTOMER_PLATFORM.md), [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-02** | Sequential vs broadcast assignment | Sequential first; hybrid later | Phase 2 | ops | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-03** | Multi-pickup batching | Later; specimens careful | Phase 6 | ops | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-04** | COD deposit SLA / cash-in | Hold earnings if undeposited over threshold | Phase 2 | finance + ops | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-05** | Location ping interval | Tight only `EN_ROUTE_*` | Phase 2 | eng | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-06** | Customer map precision | Reduced precision | Phase 2 | legal + product | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-07** | In-house vs 3PL mix | Fleet orgs in model | Phase 6 | ops | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-09** | Contactless / no-OTP POD | **OTP required** for medicine and reports until pack | Phase 2 | legal + ops | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-10** | Multi-stop routes in v1 | **Single stop pair v1** for specimens | Phase 2/6 | ops | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-11** | SAMPLE_COLLECTION always a logistics job | Prefer yes for one engine | Phase 5 | eng | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-12** | Same person phlebo + delivery | Allowed if capabilities gate jobs | Phase 5 | ops | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-LOG-13** | Partial COD collection | **No** v1 | Phase 2 | ops | [11](11_LOGISTICS_PLATFORM.md) |
| **OD-PHE-01** | Lab employee vs platform network vs mixed | Data model supports all | Phase 5 | ops | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-02** | Liveness cadence | Onboarding + random; not every job | Phase 5 | security | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-03** | Offline identity OTP | **No** | Phase 5 | security | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-04** | Device attestation vs bind-only | Bind-only Phase 2–5 | Phase 2 | eng | [27](27_SECURITY_ARCHITECTURE.md) |
| **OD-PHE-06** | Same person transports vs handover | Model both; pack | Phase 5 | ops | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-07** | Sealed-bag photo required | Recommend **yes** | Phase 5 | ops | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-09** | In-flight jobs when cert expires | Finish in-flight; no new offers | Phase 5 | ops | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-11** | Concurrent collection cap | **1** active visit | Phase 5 | ops | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-12** | Masked calling vs raw number | **Masked / proxy** | Phase 5 | legal | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-PHE-13** | Mandatory identity methods | ≥ two factors where phone exists | Phase 5 | legal | [10](10_PHLEBOTOMIST_PLATFORM.md) |
| **OD-VEND-07** | Vendor self-delivery v1 | **No**; platform logistics | Phase 3 | ops | [07](07_VENDOR_PLATFORM.md) |

---

## 8. Data

| ID | Question | Recommendation until decided | Needed by | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| **OD-LED-01** | Lab bill-on-booking vs accession vs report | **Unearned at book; AP on report** (= OD-LAB-02) | Phase 5 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-02** | Tax engine internal vs third party | Internal tables v1; port later | Phase 2 | finance + eng | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-03** | Period close cadence | Monthly per entity; daily ops recon | Phase 8 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-04** | Ledger grain vs legal entity | **One store, mandatory entity_id + country_id** | Phase 2 | finance + eng | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-08** | Vendor payable recognition | **At POD**; return window before settlement | Phase 3 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-10** | Refund contra-revenue vs expense | Contra for returns; expense goodwill | Phase 2 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-LED-11** | Draft journal in v1 | **No**; POSTED only | Phase 2 | finance | [13](13_LEDGER_SETTLEMENT.md) |
| **OD-EHR-01/02** | Controller/processor | See Legal | Phase 0–1 | legal | [16](16_HEALTH_RECORD.md) |
| **OD-PHARM-06** | Transfer auto-approve threshold | All transfers approved | Phase 2 | ops | [06](06_PHARMACY_PLATFORM.md) |
| **OD-PHARM-07** | Bin-level WMS v1 | **Flat batch qty** | Phase 2 | ops | [06](06_PHARMACY_PLATFORM.md) |
| **OD-VEND-03** | Auto-publish OTC listings | Queue first N | Phase 3 | ops | [07](07_VENDOR_PLATFORM.md) |
| **OD-VEND-04** | Lot-less inventory non-Rx | Yes if pack `lot_required=false` | Phase 3 | ops | [07](07_VENDOR_PLATFORM.md) |
| **OD-VEND-06** | SLA pause on Rx NEEDS_INFO | Pause if waiting on customer | Phase 3 | ops | [07](07_VENDOR_PLATFORM.md) |
| **OD-AFF-04** | Cookie vs login attribution | Server `click_id` + login bind | Phase 7 | eng | [14](14_AFFILIATE_PLATFORM.md) |
| **OD-CRM-01** | Household in CRM | No household v1 | later | legal | [15](15_CRM_PLATFORM.md) |
| **OD-CRM-02** | WhatsApp/SMS as CRM channel | Country-gated adapters; not OTP path | Phase 7 | legal + eng | [15](15_CRM_PLATFORM.md) |

---

## 9. Cross-cutting from books 17–26

These IDs were added in later blueprint books. Same ID is not forked.

### 9.1 Admin / ERP ([17](17_ADMIN_ERP.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-ADM-01 | Same person finance + operations | Separate memberships; SoD still enforced | Phase 2 | ops |
| OD-ADM-02 | PO/GRN in admin vs pharmacy portal | Pharmacy portal owns buying | Phase 2 | ops |
| OD-ADM-03 | Distinct compliance officer per country | **Yes in production** | Phase 2 | legal |
| OD-ADM-04 | CMS editor vs publisher split | Split when dual control needed | Phase 1 | ops |
| OD-ADM-05 | Audit export dual control | Yes for bulk PII/health metadata | Phase 1 | legal |
| OD-ADM-06 | Pack storage DB vs git | Versioned PG rows + optional git export | Phase 0 | eng |
| OD-ADM-07 | How platform roles bypass RLS | Audited session var; never disable RLS globally | Phase 0 | eng |
| OD-ADM-08 | Admin live chat vs tickets | Tickets first (OD-CRM-08) | Phase 7 | product |
| OD-ADM-09 | global_admin may publish packs | **No**; super_admin + legal checklist | Phase 0 | legal |
| OD-ADM-10 | Multi-country analyst rollup | Aggregates only; no cross-country patient lists | Phase 8 | legal |

### 9.2 Globalization ([18](18_GLOBALIZATION.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-I18N-01 | Simultaneous multi-country customer sessions | Yes, explicit switcher | Phase 9 | product |
| OD-I18N-02 | Region vs polygon catchment | Both | Phase 2 | ops |
| OD-I18N-03 | English technical fallback | Technical `en` for UI keys; never another country’s catalog | Phase 1 | product |
| OD-I18N-04 | Multi-currency catalog in one country | **No v1** | Phase 2 | finance |
| OD-I18N-05 | Org-level pack overlay | Not v1 | later | eng |
| OD-I18N-06 | Merchant of record per country | Legal; pack maps `legal_entity_id` (= OD-PAY-01 per country) | Phase 2 | legal |
| OD-I18N-07 | Global ops metadata plane | Aggregates only | Phase 8 | legal |
| OD-I18N-08 | Address autocomplete provider | Per-country maps adapter | Phase 2 | eng |
| OD-I18N-09 | Clinical PDF locale vs UI | Independent; pack `report.locales[]` | Phase 5 | clinical |
| OD-I18N-10 | OTP sender ID / local registration | Pack + SMS adapter | Phase 1 | ops + legal |

### 9.3 Compliance ([19](19_COMPLIANCE_FRAMEWORK.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-CMP-01 | Controller vs processor per country | After legal (OD-EHR-01) | Phase 0–1 | legal |
| OD-CMP-02 | Sanctions vendor | Adapter later; manual holds v1 | Phase 3 | legal |
| OD-CMP-03 | Dual control doctor KYC | Yes in production (= OD-RBAC-01) | Phase 4 | legal |
| OD-CMP-04 | Re-KYC: new case vs reopen | New case id; link supersedes | Phase 3 | ops |
| OD-CMP-05 | Explicit PENDING_SECOND state | Two signatures on IN_REVIEW | Phase 4 | ops |
| OD-CMP-06 | Dual control to **release** legal hold | Yes | Phase 1 | legal |
| OD-CMP-07 | Anonymize vs delete identity | Anonymize when pack allows | Phase 8 | legal |
| OD-CMP-08 | Dual control audit export | Yes for bulk PII/health metadata | Phase 1 | legal |
| OD-CMP-09 | Customer KYC at wallet threshold | Pack after stored-value legal | Phase 2 | legal |
| OD-CMP-10 | Evidence TTL auto EXPIRED | Only if legal fills clock | Phase 1 | legal |

### 9.4 Database ([20](20_DATABASE_ARCHITECTURE.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-DB-01 | ENUM vs TEXT+CHECK | TEXT+CHECK for extensible statuses | Phase 0 | eng |
| OD-DB-02 | Phone uniqueness global vs country | Global account identifiers | Phase 1 | eng |
| OD-DB-03 | Membership unique tuple | Include org+location+country+role | Phase 0 | eng |
| OD-DB-04 | Offer uniqueness | One published offer per item+seller+location | Phase 1 | eng |
| OD-DB-05 | Lot qty vs movement-sourced | Movements SoT + cached qty | Phase 1 | eng |
| OD-DB-06 | Booking vs sample state owner | Split commercial vs specimen | Phase 5 | eng |
| OD-DB-07 | GPS ping persistence | Redis + sampled JobEvent | Phase 2 | eng |
| OD-DB-08 | FX rate storage | Rational integers / ppm, not float | Phase 2 | eng |
| OD-DB-09 | Partition journal v1 | No; later by booked_at | Phase 2 | eng |
| OD-DB-10 | Schema-per-module vs public | **PG schemas per bounded context** | Phase 0 | eng |
| OD-DB-11 | Invoice table vs snapshot JSON | Separate invoices when pack requires | Phase 2 | finance |
| OD-DB-12 | Chat messages in OLTP vs object | OLTP SoT; attachments in object store | Phase 4 | eng |

### 9.5 API ([21](21_API_ARCHITECTURE.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-API-01 | Idempotency TTL | 72h money / 24h booking | Phase 2 | eng |
| OD-API-02 | Partner outbound webhooks | Not v1 | later | eng |
| OD-API-03 | `/me` vs nested customer id | `/me` | Phase 1 | eng |
| OD-API-04 | How much pack JSON is public | Safe subset only | Phase 1 | eng |
| OD-API-05 | HTTP 402 vs 200+status for pay | 200 + intent | Phase 2 | eng |
| OD-API-06 | GraphQL | No v1 | Phase 1 | eng |
| OD-API-07 | BFF per app | No v1; single API | Phase 0 | eng |
| OD-API-08 | ETag vs body version | `version` + If-Match on slots/stock | Phase 1 | eng |
| OD-API-09 | Public catalog without country header | Require country | Phase 1 | eng |
| OD-API-10 | File upload presign vs API proxy | Presign PUT + complete callback | Phase 1 | eng |

### 9.6 Events ([22](22_EVENT_ARCHITECTURE.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-EVT-01 | Dual event names vs single catalog | SCREAMING_SNAKE only; alias map | Phase 0 | eng |
| OD-EVT-02 | When to extract Kafka | BullMQ until scale/region/isolation | Phase 10 | eng |
| OD-EVT-03 | ORDER_CREATED timing | First persist of Order, not cart | Phase 2 | eng |
| OD-EVT-04 | Outbox payload retention / PII | Minimize; pack + legal | Phase 2 | legal + eng |
| OD-EVT-05 | Broker exactly-once | At-least-once + inbox | Phase 0 | eng |
| OD-EVT-06 | Cross-country event replication | Default none | Phase 9 | eng |
| OD-EVT-07 | Search via events vs CDC | Events + fetch-by-id | Phase 1 | eng |
| OD-EVT-08 | Max attempts / backoff | 25 / exponential; tune in ops | Phase 2 | eng |
| OD-EVT-09 | REPORT_GENERATED vs RELEASED | Keep both | Phase 5 | eng |
| OD-EVT-10 | Panic event vs notification-only | Dedicated PANIC_VALUE_DETECTED | Phase 5 | clinical |
| OD-EVT-11 | JOB_FAILED vs worker DLQ | Two types | Phase 2 | eng |

### 9.7 Notifications ([23](23_NOTIFICATION_ARCHITECTURE.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-NOT-01 | WhatsApp BSP vendor | Adapter now; vendor after legal | Phase 1 | business + legal |
| OD-NOT-02 | Default quiet hours | Pack-defined; 22:00–08:00 is **not law** | Phase 1 | ops |
| OD-NOT-03 | Marketing opt-in | Explicit allow (= OD-CRM-06) | Phase 7 | legal |
| OD-NOT-04 | In-app inbox retention | Align with related object; no clinical body | Phase 1 | eng |
| OD-NOT-05 | OTP channel priority | Pack; never WhatsApp-only globally | Phase 1 | ops |
| OD-NOT-06 | Panic notification channels | In-app + clinician push; SMS **without values** | Phase 5 | clinical |
| OD-NOT-07 | Email attach report PDF | Default **no**; authenticated link | Phase 5 | legal |
| OD-NOT-08 | Provider failover | Ranked adapters + idempotency | Phase 1 | eng |
| OD-NOT-09 | Web push | In-app + email first | later | eng |
| OD-NOT-10 | Calendar invites (.ics) | Optional after privacy review | Phase 4 | legal |
| OD-NOT-11 | Staff new-order sound | Location topic; mute after hours | Phase 2 | ops |
| OD-NOT-12 | Fallback locale | Pack default, then `en` if shipped | Phase 1 | product |
| OD-NOT-13 | Doctor calendar invites | With OD-NOT-10 | Phase 4 | product |
| OD-NOT-14 | Job-offer SMS to riders | Pack; PII-minimized | Phase 2 | ops |

### 9.8 Search ([24](24_SEARCH_ARCHITECTURE.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-SRCH-01 | Own-pharmacy vs vendor boost | Pack-configurable modest boost (= OD-CUS-07) | Phase 3 | product |
| OD-SRCH-02 | Engine | **OpenSearch** (04) | Phase 1 | eng |
| OD-SRCH-03 | Geo precision in index | Store/lab points + catchment ids; no customer addresses | Phase 1 | eng |
| OD-SRCH-04 | Doctor ranking signals | Next slot + fill-rate; not clinical quality | Phase 4 | product |
| OD-SRCH-05 | Multi-language analyzers | Pack languages | Phase 1 | eng |
| OD-SRCH-06 | Personalization | v1 none beyond country + serviceability | Phase 1 | product |
| OD-SRCH-07 | Qty vs boolean availability | Boolean + LOW_STOCK | Phase 1 | eng |
| OD-SRCH-08 | One vs five indexes | Five + msearch | Phase 1 | eng |
| OD-SRCH-09 | Events vs CDC | Events + fetch-by-id | Phase 1 | eng |
| OD-SRCH-10 | Indexing lag SLO | Minutes max for availability | Phase 1 | eng |

### 9.9 UX ([25](25_UI_UX_ARCHITECTURE.md)) and design system ([26](26_DESIGN_SYSTEM_SPEC.md))

| ID | Question | Recommendation | Needed by | Owner |
| --- | --- | --- | --- | --- |
| OD-UX-01 | Mixed basket UI | Kernel yes; v1 UI split + pack flag (= OD-CUS-01) | Phase 2 | product |
| OD-UX-02 | RN flavors vs many apps | Flavors + separate listings (= OD-ARCH-02) | Phase 1 | eng |
| OD-UX-03 | Customer bottom nav | Home / Orders / Health / Account | Phase 1 | product |
| OD-UX-04 | Caregiver UX | Not v1 (= OD-RBAC-03) | later | legal |
| OD-UX-05 | Maps in-app vs deep link | Adapter; status without map | Phase 2 | product |
| OD-UX-06 | Dark mode | Later; AA contrast first | later | product |
| OD-UX-07 | Web vs mobile parity | Same journeys; native extras optional | Phase 1 | product |
| OD-UX-08 | Clinic_admin nav | Web roster/fees; RN doctor queue | Phase 4 | product |
| OD-UX-09 | Admin IA grouping | Five shells in one Next app | Phase 0 | product |
| OD-UX-10 | Offline write queue | Field apps yes; lab staff on-prem no | Phase 5 | eng |
| OD-DS-01 | Brand identity | Placeholder tokens until brand (= OD-BRAND-01) | Phase 1 | business |
| OD-DS-02 | Dark mode tokens | After AA audit | later | product |
| OD-DS-03 | Chart library | Accessible series + table alt | Phase 8 | eng |
| OD-DS-04 | Icon set | One licensed set | Phase 0 | product |
| OD-DS-05 | Motion | Subtle; reduced-motion first | Phase 0 | product |
| OD-DS-06 | Typeface licensing | System UI until licensed | Phase 1 | product |
| OD-DS-07 | Density modes | comfortable vs compact | Phase 0 | product |
| OD-DS-08 | Admin max width | 1280–1440 | Phase 0 | product |
| OD-DS-09 | Exact breakpoints | Placeholder in 26 | Phase 0 | product |

---

### Partner onboarding ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md))

| ID | Question | Recommendation until decided | Needed by | Owner |
| --- | --- | --- | --- | --- |
| **OD-PTR-01** | Separate Join mobile listing vs web-first | **Web-first Join** | Can defer listing; Join **web** before first public partner | product |
| **OD-PTR-02** | Multiple ACTIVE Partners same type+country | **One ACTIVE per type+country**; extra orgs via Membership | Before vendor/doctor go-live | product |
| **OD-PTR-03** | Auto ACTIVE after APPROVED | Auto when go-live gates pass | Before first partner go-live | product |
| **OD-PTR-04** | HOSPITAL vs CLINIC subtype | Separate type codes, shared org template | Can defer until clinic/hospital launch | product |
| **OD-PTR-05** | Reactivation = full re-KYC | Pack; default re-KYC if docs expired | When suspend ships | compliance |
| **OD-PTR-06** | Independent pharmacist as PartnerType | Staff of PHARMACY unless pack requires | Pharmacy partner launch | legal + product |

**Not Phase 0:** none of OD-PTR-* block empty-pack scaffolding. **Before payments:** N/A (onboarding). **Before doctor go-live:** OD-PTR-02/03 + pack doctor documents filled by legal. **Before lab go-live:** pathologist/lab pack + OD-PTR-03.

---

## 10. Phase 0 decision board (must close or explicitly defer)

| ID | Why it blocks |
| --- | --- |
| OD-ARCH-01 | Already confirmed — implement boundaries |
| OD-CLOUD-01 | Accounts, regions, IAM |
| OD-ORCH-01 | Compute product |
| OD-MONO-01 | Repo tooling |
| OD-CI-01 | Pipelines |
| OD-SEC-05 | Secrets |
| OD-CDN-01 | WAF |
| OD-OBS-01 | Telemetry |
| OD-COUNTRY-01 | Direction for region (legal may still be TBD) |
| OD-BRAND-01 | Not blocking code; blocks store/legal entity naming |

**Phase 2 cannot go live without:** OD-PAY-01 (at least for the launching entity), PSP adapter choice (vendor, not law), OD-PAY-02 for goods.

**Phase 4 paid consults:** OD-DOC-02 (penalty), OD-VID-01, recording remains **off**.

**Phase 5:** OD-LAB-02 / OD-LED-01 bill-on-lab.

---

## 11. Index of LEGAL/COMPLIANCE REVIEW (non-OD)

Not decisions to “pick in Jira as engineering taste”: pharmacy/telehealth/lab licensing; e-Rx validity; medicine advertising; stored-value; marketplace operator; inducement/fee-split; children’s accounts; incident notify time; employment vs contractor; discrimination (gender matching); official lab report e-sign.

See [34](34_RISK_REGISTER.md) §8.

---

## 12. Completeness audit (CR-ECO-92) — still OPEN

Added by [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md). **Do not implement** until a later authorized phase. **Do not treat recommendations as law.**

| ID | Question | Recommendation until decided | Needed by | Owner | Source |
| --- | --- | --- | --- | --- | --- |
| **OD-CARE-01** | Care navigation: rules engine vs NLP/ML vendor | Pack-off; never ship as diagnosis; vendor is a port | After doctor search exists | clinical + legal | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| **OD-CARE-02** | Emergency/red-flag copy and CTA per country | Country pack CMS only; no hardcoded numbers | Care-nav enablement | legal + ops | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| **OD-RAD-01** | Radiologist web vs lab-web radiology mode | Separate BC either way; no Partner App | Diagnostics phase | product + ops | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| **OD-RAD-02** | DICOM/PACS viewer strategy | Vendor port; PHI not in commerce CDN by default | Radiology enablement | clinical + security | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| **OD-CMS-01** | Medical-claim workflow for education content | Dual control publish; claims legal review | CMS expansion | legal | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| **OD-SUP-01** | Chat vs ticket-first for clinical-adjacent queues | Ticket-first until privacy review | Support expansion | product + privacy | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |
| **OD-RX-REFILL** | Auto-refill vs re-authorization | Pharmacist/doctor re-authorize default; **unresolved as law** — R5-E shipped request/re-auth only ([120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md)); auto-execute remains OFF | After pharmacy orders / future legal CR | clinical + legal | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md), [111](111_R5_RX_PHARMACY_IMPLEMENTATION_PLAN.md) §7, [119](119_R5_E_REFILL_SUBSCRIPTION_PLAN.md), [120](120_R5_E_REFILL_SUBSCRIPTION_IMPLEMENTATION.md) |
| **OD-RATE-01** | Public doctor/lab ratings | Pack-off; related OD-DOC-09 | Growth | legal | [92](92_FINAL_ECOSYSTEM_COMPLETENESS_AUDIT.md) |

---

## 13. Maintenance

When a domain book adds `OD-*`, add a row here in the same group. Do not silently fork IDs (`OD-PAY-01` remains merchant of record everywhere).
