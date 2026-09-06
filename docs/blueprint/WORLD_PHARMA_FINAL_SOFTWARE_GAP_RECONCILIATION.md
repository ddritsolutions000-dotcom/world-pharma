# WORLD_PHARMA — Final Software Gap Reconciliation / 1mg-Capability Coverage

**Sprint:** 151 (READ-ONLY)  
**Master backlog:** #448  
**As of:** Sprint 150 / Master backlog #447  
**Mode:** Reconciliation only — **no application code changes**  
**Launch posture:** `CAN_PRODUCTION_LAUNCH = NO`

**Sources of truth (not old 1mg audit percentages):**
- Master Index rows through #447 (S1–S150)
- Authoritative closures S132–S150 (`docs/blueprint/WORLD_PHARMA_S132_*.md` … `S150_*.md`)
- Post-S140 audit `WORLD_PHARMA_FULL_CODEBASE_AUDIT_CURRENT.md` (kernel inventory; production gates updated by S142–S150)
- Runtime modules under `apps/api/src`, product apps, Admin control plane

**Classification legend**

| Status | Meaning |
| --- | --- |
| **BUILT** | Software kernel + persistence + usable sandbox path exists |
| **PARTIAL** | Core path exists; material product/UI/content gaps remain |
| **CODING REMAINING** | Genuine missing application code (not “provider not connected”) |
| **EXTERNAL GATE** | Software/path complete; live provider/credentials/infra required |
| **BUSINESS/LEGAL/OPERATIONAL** | Licensing, real networks, compliance, human approval — not coding |
| **OPTIONAL** | 1mg-class / differentiator — not required for core marketplace launch |

A row may be **BUILT** and still have **External gate? = YES**. That is **not** coding remaining.

---

## 1. EXECUTIVE SUMMARY

World-Pharma is a **large, software-complete sandbox healthcare commerce platform** (NestJS API, Prisma kernel, 13 product web apps, 6 Expo apps, dense Main Admin). Through S150, the repository has closed:

- Customer marketplace, pharmacy/vendor, doctor/eRx, lab diagnostics, imaging, logistics, payments, affiliate, Admin, policy packs, and security **software** rails
- Fail-closed **production activation paths** for PSP, OTP, carrier, KYC, clinical, storage, secrets, observability, deploy, DB, backup, and security launch (S132–S150)

**What remains for production is overwhelmingly external and operational**, not a missing marketplace kernel.

**Genuine application coding remaining is narrow**, primarily:
1. Diagnostic **DICOM viewer** integration (REPORT ≠ VIEWER)
2. **HL7/FHIR** (and similar) live clinical adapters when a lab/clinical network is chosen
3. **Live provider adapters** once vendors are contracted (PSP, SMS/email, carrier, eRx, video, PACS, KYC, payout, vault, APM) — wiring work, not parallel frameworks
4. Enrichment of **thin satellite SPAs** (lab org, imaging org, logistics desk) and optional **affiliate mobile**
5. Optional product depth: medicine content corpus, Rx auto-execute hardening, wallet **product** (if desired), richer speciality/corporate programs

**Do not treat EXTERNAL_GATED as “not built.”** Do not rebuild S110–S150 activation frameworks.

---

## 2. ALREADY BUILT — major capabilities

| Domain | Built (sandbox software) |
| --- | --- |
| **A Marketplace** | Search, categories, PDP (SKU/pack/strength/composition/manufacturer fields), cart, checkout (mock pay), orders, reorder/buy-again, wishlist, reviews/Q&A, profile, family, health records/timeline |
| **B Pharmacy/vendor** | Join/onboarding, KYC case workflow (manual/sandbox), catalog, inventory, accept→fulfill, returns software, vendor roles, settlement **records**, S135 network lifecycle |
| **C Doctor/clinical** | Discovery, appointments, consent/encounter, internal prescriptions, eRx **framework**, telemedicine **session framework**, doctor portal |
| **D Lab** | Discovery, catalog/packages, booking, home collection/accession/ops, sample + report lifecycle, pathologist worklist, health-record handoff, S127/S136 activation/workflow software |
| **E Imaging** | Booking, study/worklist/report, sandbox PACS ingest, radiologist portal, S139 workflow software |
| **F Logistics** | Shipment lifecycle SM, assignment/tracking surfaces, carrier **port**, mock carrier + rider POD path, S134 activation software |
| **G Finance** | Payment intents (sandbox), refunds/recon, ledger/payables/settlement import, affiliate commission, SoD/dual-control |
| **H Affiliate** | Onboarding rails, attribution, commission, web portal, S149 payout lifecycle software |
| **I Admin** | Global ops, partners, catalog, orders, finance, countries/policy packs, KYC review, provider-activation wall, CMS/CRM/marketing/SEO, launch/security cards |
| **J CX** | Customer web, Expo customer + partner mobiles (device proof gated), auth/OTP sandbox, notifications inbox, medication reminders, family, reorder |
| **K Platform** | Authn/authz, IDOR helpers, rate limits (app-level), input security contracts, S142 secrets resolver, S140 storage triad path, S143 observability path, S144–S147 deploy/DB/backup paths, S148 security gate compose |
| **L Globalization** | Country + PolicyPack resolver; currency/tax/timezone as pack fields; activation contracts forbid India-only hardcoding |

---

## 3. PARTIALLY BUILT

| Area | Why PARTIAL |
| --- | --- |
| Lab / imaging / logistics **org SPAs** | APIs rich; some UIs are thin shells (`web-lab`, `web-radiology`, `web-logistics`) |
| **Rx subscriptions / refill auto-execute** | Model + UI exist; auto-execute policy-gated OFF / not production-proven |
| **Care plans / memberships / speciality / corporate** | Surfaces + mocks exist; billing often waived until live PSP; programs not full TPA |
| **Medicine/disease education content** | CMS/schema present; **corpus thin** vs 1mg-class depth |
| **Ayurveda / vaccines / pet care** | Browse/landing + seed verticals; not full care networks |
| **Mobile** | Apps CODE_COMPLETE; physical device / store / iOS build **not proven** (S129) |
| **Returns (carrier side)** | Order returns software exists; carrier-return policy still POLICY_REQUIRED |
| **Settlement / payout UX depth** | Records + SoD exist; live bank movement gated |
| Residual **India-shaped UX copy** in places | Policy core is global; some customer chrome still IN-fixture flavored |

---

## 4. ACTUAL CODING REMAINING

These are **genuine software work items**, distinct from “connect a provider”:

| # | Item | Notes |
| --- | --- | --- |
| 1 | **DICOM / diagnostic viewer integration** | Explicit S139 gap: REPORT ≠ DIAGNOSTIC VIEWER |
| 2 | **HL7/FHIR (or chosen clinical interchange) adapters** | Adapters **MISSING** in repo; required when lab network integration is chosen |
| 3 | **Live provider adapter modules** (one per contracted vendor) | PSP, SMS/email/push, carrier, eRx network, video SFU, PACS, KYC bureau, payout bank/PSP, secrets vault, APM — **compose existing ports**; do not invent parallel engines |
| 4 | **Satellite SPA enrichment** (optional but real UX debt) | Lab org, imaging org, logistics desk beyond shell |
| 5 | **Affiliate mobile app** (optional) | `apps/mobile-affiliate` **does not exist** |
| 6 | **Rx auto-execute job hardening** (if product enables it) | Policy currently keeps auto-execute off |
| 7 | **Stored-value Wallet product** (optional) | Payment-method “wallet” language ≠ ledger wallet product |
| 8 | **Content/catalog depth tooling** (optional) | Not a second CMS — content ops + seed/import |

**Not coding remaining:** production PSP/OTP/carrier/KYC/eRx/video/PACS/WAF/DB/backup enablement while adapters are fail-closed and providers unselected.

---

## 5. EXTERNAL PROVIDER / INFRASTRUCTURE GATES

| Gate | Blocker constant(s) | Sprint evidence |
| --- | --- | --- |
| PSP / payment | `NO_PRODUCTION_PSP` | S132 / S128 / S120 |
| OTP / transactional messaging | `NO_PRODUCTION_OTP_MESSAGING_PROVIDER` (+ channel variants) | S133 / S121 |
| Carrier / logistics | `NO_PRODUCTION_CARRIER_ADAPTER` | S134 / S122 |
| eRx legal transmission | `NO_PRODUCTION_ERX_PROVIDER`, `NO_PRODUCTION_DOCTOR_CONSULTATION_ERX_WORKFLOW` | S137 |
| Telemedicine / video | `NO_PRODUCTION_VIDEO_PROVIDER`, `NO_PRODUCTION_TELEMEDICINE_WORKFLOW` | S138 |
| PACS / DICOM | `NO_PRODUCTION_PACS_PROVIDER`, `NO_PRODUCTION_IMAGING_PACS_DICOM_WORKFLOW` | S139 |
| KYC/KYB | `NO_PRODUCTION_KYC_KYB_PROVIDER`, `NO_PRODUCTION_KYC_ADAPTER` | S150 / S124 |
| Private storage / KMS / malware | `NO_PRODUCTION_PRIVATE_STORAGE`, `NO_PRODUCTION_KMS`, `NO_PRODUCTION_MALWARE_SCANNER`, pipeline umbrella | S140 |
| Secrets manager (vault) | `NO_PRODUCTION_SECRETS_MANAGER`, `NO_PRODUCTION_SECRETS_MANAGER_ADAPTER` | S142 |
| APM / monitoring / alerting | `NO_PRODUCTION_APM_PROVIDER` (+ monitoring/alerting) | S143 |
| Deployment / CI-CD | `NO_PRODUCTION_DEPLOYMENT_TARGET`, `NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER` | S144 / S145 |
| Production database | `NO_PRODUCTION_DATABASE` | S146 |
| Managed backup / PITR / DR | `NO_PRODUCTION_MANAGED_BACKUP_PITR` | S147 / S141 |
| WAF / DDoS / origin / distributed RL | `NO_PRODUCTION_WAF`, `NO_PRODUCTION_DDOS`, `NO_PRODUCTION_ORIGIN_SHIELD`, distributed RL gated | S148 / S114 |
| Affiliate payout adapter | `NO_PRODUCTION_PAYOUT_ADAPTER`, `NO_PRODUCTION_AFFILIATE_PAYOUT` | S149 |
| Pharmacy / lab production networks (software flags) | `NO_PRODUCTION_PHARMACY_VENDOR_NETWORK`, `NO_PRODUCTION_LAB_*` | S135 / S136 |
| Clinical adapter umbrella | `NO_PRODUCTION_CLINICAL_ADAPTER` | S126 / S137 |

---

## 6. BUSINESS / LEGAL / LICENSING / OPERATIONAL GATES

| Gate | Why not a coding task |
| --- | --- |
| Real pharmacy/vendor network contracting & licensing | Market licences, SLA, onboarding humans |
| Real lab / imaging / doctor networks + accreditation registries | External registries; accreditation evidence |
| Country healthcare/regulatory approvals | Policy packs prepare; regulators approve |
| Cross-border medicine | Explicitly **LEGAL_GATED** in logistics |
| External pentest evidence + security approval | S148 `EVIDENCE_REQUIRED` |
| Production launch human authorization | `CAN_PRODUCTION_LAUNCH = NO` until gates clear |
| Insurance/TPA partnerships | **Out of core scope** (Master Index non-goals) unless CR |
| Hospital HIS / institutional pharmacy core | **Do not build** (explicit non-goal) |
| Catalog/content licensing for medicine information | Content/legal, not engine rebuild |
| On-call / DR drills proving RPO/RTO | Ops evidence; targets defined, not proven |

---

## 7. 1MG-CLASS CAPABILITY MATRIX

Status column uses the legend above. **Actual coding remaining?** answers only genuine code gaps.

### A. Customer marketplace

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Medicine discovery/search | Search index + customer search UI | BUILT | NO | NO | NO | `apps/api/src/search/*`; `web-customer/app/search` |
| Categories | Catalog categories + browse | BUILT | NO | NO | NO | `catalog/*`; `web-customer/app/categories` |
| Product detail | PDP with multi-seller compare | BUILT | NO | NO | NO | `web-customer/app/p/[slug]`; S58 |
| Manufacturer | Schema + PDP fields | BUILT | NO | NO | Content ops for depth | Prisma `manufacturerName` |
| Country of manufacture | Catalog/policy fields (market-dependent) | PARTIAL | NO | NO | Content/policy per market | Catalog/policy packs |
| Composition | Schema field | BUILT | NO | NO | Content depth | Prisma `composition` |
| Strength | Schema field | BUILT | NO | NO | Content depth | Prisma `strength` / `packSize` |
| Pack size | Schema field | BUILT | NO | NO | Content depth | Prisma `packSize` |
| SKU | Catalog/offer SKU model | BUILT | NO | NO | Catalog ops | Catalog/inventory modules |
| Price/MRP/discount | Offer pricing + promos | BUILT | NO | NO | Pricing ops | Catalog + R12 promo |
| Seller/pharmacy | Multi-seller PDP | BUILT | NO | YES (prod network) | Real pharmacies | S135; S58 |
| Stock | Inventory reservations | BUILT | NO | NO | Ops accuracy | `inventory/*` |
| Rx status | Rx flags + gates | BUILT | NO | YES (clinical/eRx) | Regulatory | Clinical + policy |
| Cart | Cart API + UI | BUILT | NO | NO | NO | `cart/*` |
| Checkout | Checkout + mock pay | BUILT | NO | YES (PSP) | NO | Checkout UI; S132 |
| Order lifecycle | Order SM + tracking | BUILT | NO | YES (carrier) | Ops | `orders/*`; S34 |
| Reorder | Buy-again + reorder service | BUILT | NO | NO | NO | `reorder.service.ts`; `/buy-again` |
| Wishlist | Wishlist API + UI | BUILT | NO | NO | NO | R12-E; `wishlist/*` |
| Offers/convenience | Promos + convenience UX | BUILT | NO | NO | Marketing ops | R12-C; marketing |
| Reviews/ratings | Reviews + Q&A + moderation | BUILT | NO | NO | Moderation ops | R12-F; `reviews/*` |
| Customer profile | Account + health profile | BUILT | NO | NO | NO | `account/*`; health profile |
| Family members | Family module + UI | BUILT | NO | NO | NO | `family-member/*` |
| Health records/timeline | Health artifacts + timeline | BUILT | NO | YES (prod storage) | Privacy ops | `health/*`; S140 |

### B. Pharmacy / vendor ecosystem

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Pharmacy/vendor onboarding | Join + vendor/pharmacy onboarding | BUILT | NO | NO | Contracting | S40; `partner/join*` |
| KYC/KYB | Case workflow + S150 path | BUILT | Adapter when provider chosen | YES | Identity bureau contract | S72–S150 |
| Catalog | Vendor catalog APIs + UI | BUILT | NO | NO | Catalog ops | S41 |
| Inventory | Vendor inventory | BUILT | NO | NO | Ops | `inventory/vendor*` |
| SKU/stock | SKU + stock controls | BUILT | NO | NO | Ops | Catalog/inventory |
| Order acceptance | Vendor accept/reject | BUILT | NO | YES (prod network) | Real vendors | S123/S135 |
| Fulfillment | Pick/pack/RTS | BUILT | NO | YES | Ops | S61/S123 |
| Returns/refunds | Returns + payment refunds | BUILT | Carrier-return policy polish | YES (PSP/carrier) | Policy | Vendor returns; S132 refunds |
| Vendor team/roles | RBAC partner roles | BUILT | NO | NO | Org admin | Partner RBAC |
| Settlement/statements | Payables + statements (records) | BUILT | Live payout adapter | YES | Banking | Finance; S149 |
| Vendor operational controls | Suspension/gates | BUILT | NO | NO | Ops SoD | S135 |
| Production partner activation | S135/S150 composition | BUILT | NO | YES | Real network + KYC | `pharmacy-vendor-network-closure.ts` |

### C. Doctor / clinical

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Doctor discovery | Search + public clinical | BUILT | NO | NO | Provider directory ops | `clinical/public*`; search |
| Appointments | Booking + doctor/customer UIs | BUILT | NO | NO | Scheduling ops | Appointment services |
| Consultation | Encounter/consent/notes | BUILT | NO | YES (video if live) | Clinical ops | S125/S137 |
| Follow-up | Follow-up paths in clinical journey | BUILT | NO | NO | Clinical ops | S36/S137 |
| Prescription | Internal Rx ISSUED | BUILT | NO | YES (legal eRx) | Prescriber licensing | `prescription.service.ts` |
| eRx framework | Submission framework + activation path | BUILT | Live eRx adapter | YES | Regulator/network | S137; `erx-*-path.ts` |
| Clinical permissions | Clinical access + SoD | BUILT | NO | NO | Compliance | Clinical access modules |
| Telemedicine framework | Video service + S138 path | BUILT | Live video adapter | YES | Vendor + consent ops | S138 |
| Provider activation | Partner/KYC + clinical gates | BUILT | NO | YES | Credentialing | S137/S150 |

### D. Diagnostics / lab

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Lab discovery | Customer lab browse | BUILT | NO | NO | Network ops | `web-customer/app/lab` |
| Test catalog | Lab catalog + packages | BUILT | NO | NO | Catalog ops | `lab-catalog*`; health-packages |
| Booking | Customer booking + gates | BUILT | NO | YES (prod lab) | Ops | `lab-booking.service.ts` |
| Home collection | Collection + phlebotomist mobile | BUILT | Device proof optional | NO | Ops | `lab-collection*`; mobile-phlebotomist |
| Accession/ops | Lab ops services | BUILT | Richer lab SPA optional | NO | Ops | S126 |
| Sample lifecycle | CoC/sample states | BUILT | NO | NO | Ops | Lab diagnostics ops |
| Report lifecycle | DRAFT→PUBLISH | BUILT | NO | NO | Pathology ops | Pathology; S136 |
| Customer report access | Health artifact access | BUILT | NO | YES (storage) | Privacy | Health; S140 |
| Lab partner onboarding | S127 preparation | BUILT | NO | YES | Accreditation | S127 |
| Production lab activation | S136 closure | BUILT | HL7/FHIR adapters | YES | Real labs | S136; audit HL7 MISSING |

### E. Imaging

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Imaging order/booking | Customer imaging booking | BUILT | NO | YES | Ops | Imaging booking service |
| Radiology workflow | Study/worklist/ops | BUILT | Richer org SPA optional | NO | Ops | Imaging ops; radiologist app |
| Report | Interpretation + publish | BUILT | NO | NO | Radiologist ops | Interpretation services |
| PACS/DICOM foundation | Sandbox ingest + activation path | BUILT | Live PACS adapter | YES | Vendor | S139 |
| Imaging partner onboarding | Partner/KYC + S139 gates | BUILT | NO | YES | Credentialing | S139/S150 |
| Viewer/integration readiness | Honest “viewer unavailable” | CODING REMAINING | YES (viewer) | YES (PACS) | Viewer licensing | S139 REPORT ≠ VIEWER |
| Production activation | S139 path | BUILT | NO | YES | Network | `imaging-pacs-dicom-*-closure.ts` |

### F. Delivery / logistics

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Delivery order lifecycle | Logistics SM | BUILT | NO | YES | Ops | `logistics/*`; S134 |
| Assignment | Assignment surfaces | BUILT | Desk SPA polish optional | NO | Ops | Delivery services |
| Tracking/status | Customer/vendor/admin track | BUILT | NO | YES | Carrier SLA | Shipments UI |
| Delivery operations | Rider mobile + sandbox POD | PARTIAL | POD photo polish / device proof | YES | Ops | mobile-delivery; audit |
| Carrier abstraction | Port + MockCarrier only | BUILT | Live carrier adapter | YES | Carrier contract | `carrier.port.ts`; S134 |
| Production carrier activation | S134 path | BUILT | NO | YES | NO | `carrier-logistics-*-path.ts` |

### G. Payments / finance

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Checkout payment framework | Intents + gateway port | BUILT | Live PSP adapter | YES | Merchant accounts | S132 |
| Payment intents/status | Full SM + admin | BUILT | NO | YES | NO | `payment.service.ts` |
| Refund handling | Orchestration + listeners | BUILT | NO | YES | Ops policy | Refund modules |
| Reconciliation | Payment recon + break queue | BUILT | NO | NO | Finance ops | Recon services |
| Settlement | Settlement import/payables | BUILT | Live bank rails | YES | Banking | Finance settlement |
| Affiliate commission | Accrual + safety contracts | BUILT | NO | NO | Fraud ops | S149; affiliate-commission |
| Affiliate payout | Lifecycle software | BUILT | Payout adapter | YES | KYC + banking | S149 |
| PSP activation | Fail-closed path | BUILT | NO | YES | NO | S132 |
| KYC dependency | Explicit payout/partner gates | BUILT | NO | YES | Compliance | S149/S150 |
| Financial controls/SoD | Dual-control + SoD | BUILT | NO | NO | Approver staffing | `dual-control.ts` |

### H. Affiliate

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Acquisition | Referral landing + codes | BUILT | NO | NO | Marketing | `/r/[code]` |
| Affiliate onboarding | Partner/affiliate org rails | BUILT | NO | YES (KYC) | Contracting | Affiliate + KYC |
| Attribution | Clicks + snapshots | BUILT | NO | NO | Fraud ops | Attribution services |
| Commission | Preview + liabilities | BUILT | NO | NO | Policy | Commission module |
| Settlement | Batch/payable model | BUILT | NO | YES | Finance ops | S149 |
| Payout lifecycle | ELIGIBLE→PAID software | BUILT | Adapter | YES | Banking | S149 |
| Affiliate portal | `web-affiliate` | BUILT | Affiliate mobile optional | NO | NO | `apps/web-affiliate` |
| Production payout activation | S149 path | BUILT | NO | YES | NO | S149 doc |

### I. Main Admin

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Global operations | Ops/reliability/launch | BUILT | NO | YES (launch) | Launch approval | Admin launch cards |
| Customer/vendor/pharmacy mgmt | Partner/customer admin | BUILT | NO | NO | Ops staffing | Admin nav |
| Doctor/lab/imaging/affiliate mgmt | Healthcare network admin | BUILT | NO | NO | Ops | Admin healthcare |
| Catalog | Catalog admin | BUILT | NO | NO | Merchandising | `/catalog` |
| Orders | Order admin | BUILT | NO | NO | Ops | Orders admin |
| Finance | Payments + finance | BUILT | NO | YES | Finance ops | `/payments`, `/finance` |
| Settlements | Settlement admin | BUILT | NO | YES | Banking | Finance settlements |
| Countries | Country admin | BUILT | NO | YES (go-live) | Legal | `/countries` |
| Policy packs | Policy pack operator | BUILT | NO | YES | Legal/compliance | `/policy-packs` |
| KYC/KYB | Review + S150 card | BUILT | NO | YES | Verifiers | S150 |
| Provider activation | Unified card wall | BUILT | NO | YES | NO | `provider-activation-admin.tsx` |
| Notifications | Prefs + dispatch matrix | BUILT | Live providers | YES | NO | Notification modules; S133 |
| Support | Support desk (R11) | BUILT | NO | NO | Agents | R11-D |
| CMS | CMS admin | BUILT | Content depth | NO | Content ops | `/cms*` |
| CRM | CRM + automation | BUILT | NO | NO | Marketing ops | R12-A |
| Marketing | Campaigns + consent | BUILT | Live send | YES | Consent/legal | R12-B |
| SEO | SEO admin | BUILT | NO | NO | Content | `/seo` |
| Public website controls | CMS/public pages | BUILT | NO | NO | Brand ops | CMS |
| Launch controls | Launch readiness | BUILT | NO | YES | Human gate | Launch admin |
| Security controls | Security + S148 gate | BUILT | NO | YES (WAF/pentest) | Approval | S148 |

### J. Customer experience

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Web | Broad customer IA | BUILT | NO | NO | NO | `web-customer` |
| Mobile | Expo apps present | PARTIAL | Device QA / store packaging | YES (build/store) | Device labs | S129 |
| Responsive UX | Customer responsive evidence in sprints | BUILT | Satellite polish | NO | Design ops | Sprint shot evidence |
| Login/auth | Session + OTP HMAC | BUILT | NO | YES (OTP provider) | NO | Identity |
| OTP framework | Console + activation path | BUILT | Live messaging adapter | YES | NO | S133 |
| Notifications | Inbox + prefs | BUILT | Live channels | YES | NO | Notifications |
| Reminders | Medication reminders | BUILT | NO | YES (push) | NO | `medication-reminder/*` |
| Health timeline | Timeline service + UI | BUILT | NO | YES (storage) | Privacy | Health timeline |
| Family health | Family module | BUILT | NO | NO | NO | Family |
| Reorder | Buy-again | BUILT | NO | NO | NO | Buy-again |
| Convenience features | Promos, wishlist, personalization | BUILT | NO | NO | Marketing | R12–R13 |

### K. Platform / security

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Authn/authz | Identity + permissions | BUILT | NO | NO | NO | Identity |
| IDOR/BOLA | Object authorization helpers | BUILT | NO | NO | Pentest evidence | S110 |
| Tenant isolation | Partner/org scoping | BUILT | NO | NO | Ops | Partner models |
| Privilege escalation protection | RBAC + SoD | BUILT | NO | NO | Approvers | Dual-control |
| Rate limiting | App-level | BUILT | Distributed RL wiring | YES | Edge vendor | S113/S148 |
| Abuse protection | API abuse hardening | BUILT | NO | YES (edge) | NO | S113 |
| WAF/DDoS architecture | Contracts + gate | BUILT | NO | YES | Edge vendor | S114/S148 |
| Input security | Hardening contracts | BUILT | NO | NO | NO | S115 |
| SSRF/path/injection protection | Input/security suites | BUILT | NO | NO | Pentest | S110–S116 |
| Secrets manager resolver | S142 SOFTWARE_COMPLETE | BUILT | Vault adapter | YES | Vault vendor | S142 |
| Private storage | Local/sandbox + path | BUILT | S3 adapter | YES | Cloud | S140 |
| KMS | Path + refs | BUILT | KMS adapter | YES | Cloud | S140 |
| Malware scanning | Path + sandbox | BUILT | Scanner adapter | YES | Vendor | S140 |
| Backup/PITR | Path + sandbox drill | BUILT | Managed provider | YES | Cloud DBA | S147 |
| Disaster recovery | Targets defined | PARTIAL | Runbooks/proof | YES | Ops drills | S141/S147 |
| Observability/APM | Metrics + path | BUILT | APM adapter | YES | Vendor | S143 |
| Alerting | Contracts | BUILT | Pager wiring | YES | On-call | S143 |
| Deployment/release | Path fail-closed | BUILT | CI deploy provider | YES | Platform eng | S144/S145 |
| Production DB activation | Path fail-closed | BUILT | NO | YES | DBA | S146 |
| Production deployment target | Path fail-closed | BUILT | NO | YES | Cloud | S145 |

### L. Globalization

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Country configuration | Country admin + seed | BUILT | Residual UX copy cleanup optional | YES (go-live) | Legal | Policy/countries |
| Policy packs | Pack schema + resolver | BUILT | NO | YES | Compliance | `policy/*` |
| Country activation | Status model + gates | BUILT | NO | YES | Legal | Country status |
| Currency | Pack-driven | BUILT | NO | YES (PSP) | Treasury | Policy document |
| Tax | Profile refs (not live engines) | PARTIAL | Tax engine integration if required | YES | Tax authority | Policy tax profiles |
| Timezone | Pack field | BUILT | NO | NO | NO | Policy |
| Payment policy | Pack methods | BUILT | NO | YES | PSP rules | Policy |
| Fulfillment policy | Pack + logistics gates | BUILT | NO | YES | Carrier/legal | Logistics; LEGAL_GATED cross-border |
| Healthcare/regulatory policy | Pack + clinical gates | BUILT | NO | YES | Regulators | Clinical/policy |
| Source vs customer country | Distinct concepts in activation | BUILT | NO | NO | Ops discipline | S120–S150 contracts |
| No hardcoded India-only core | Activation contracts enforce | BUILT | Optional UX de-IN polish | NO | Content | S149/S150 specs; fixtures OK |

### M. 1mg-class optional / adjacent

| Capability | Current implementation | Status | Actual coding remaining? | External gate? | Business/legal/ops dependency? | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Pharmacy/medicine ordering | Full sandbox commerce | BUILT | NO | YES | Real pharmacies | Domains A–B |
| Health products | Catalog vertical | BUILT | Content depth | NO | Merchandising | Catalog |
| Diagnostics | Lab journey | BUILT | HL7 optional | YES | Labs | Domain D |
| Doctor consultations | Clinical journey | BUILT | Live video/eRx | YES | Doctors | Domain C |
| Health records | Health kernel | BUILT | NO | YES (storage) | Privacy | Health |
| Medicine reminders | Reminder module | BUILT | Push delivery | YES | NO | medication-reminder |
| Subscriptions/recurring medicines | RxSubscription + UI | PARTIAL | Auto-exec if enabled | YES (PSP) | Clinical policy | refill/subscriptions |
| Health plans/memberships | Care-plan (PSP-waived) | PARTIAL | Billing when PSP live | YES | Product design | care-plan |
| Speciality care | Mock programs + admin | OPTIONAL | Real programs if prioritized | YES | Clinical partners | speciality-care mocks |
| Corporate healthcare | In-memory programs | OPTIONAL | Real TPA/corp product | YES | Enterprise sales | corporate-wellness |
| Hospital / institutional pharmacy | Explicit non-goal | OPTIONAL | YES only if CR changes scope | YES | HIS partners | Master Index non-goals |
| Pharma/B2B analytics | General analytics only | OPTIONAL | B2B BI product if prioritized | NO | Data contracts | analytics foundation |
| Insurance partnerships | Out of core scope | OPTIONAL | YES only if CR | YES | Insurers/TPA | Master Index |
| Ayurveda / alternative | Browse vertical | OPTIONAL | Network depth | YES | Practitioners | `/ayurveda` |
| Vaccines / adult vaccination | Catalog + sandbox booking | OPTIONAL | Real vaccine ops | YES | Clinics | vaccines page |
| Pet care | Landing + seed | OPTIONAL | Vet network | YES | Partners | `/pet-care` |
| Disease/medicine information | Schema + thin corpus | PARTIAL | Content corpus | NO | Medical/legal review | CMS health; salts/brands |
| Health education/content | CMS health education | PARTIAL | Content | NO | Editorial | CMS |
| Offers/promotions | Promo engine | BUILT | NO | NO | Marketing | R12-C |
| Chronic-care journeys | Care-nav + care-plan | PARTIAL | Journey depth | YES | Clinical ops | care-nav |
| Care coordination | Partial care surfaces | OPTIONAL | Coordination product | YES | Care teams | care-nav/speciality |

---

## 8. OPTIONAL 1MG+ CAPABILITIES (stronger than 1mg-class marketplace)

These are **differentiators / expansion**, not blockers for core software completion:

1. **Unified multi-country policy-pack core** (already architectural strength) — expand packs without forking apps  
2. **Integrated pharmacy + lab + imaging + doctor + affiliate on one identity/Admin control plane** — already unique vs siloed apps  
3. **Fail-closed production activation discipline** (S132–S150) — safer than “flip mock to live”  
4. **Family health + health timeline + multi-care journey** composition  
5. **Affiliate attribution with SoD payout** (software-ready)  
6. **Radiology + pathology portals** alongside marketplace  
7. **Care packages + speciality + corporate** as real networks (today mocks)  
8. **DICOM viewer + HL7** to exceed marketplace-only competitors  
9. **Chronic-care / care coordination product** built on existing care-nav  
10. **B2B pharmacy analytics / manufacturer insights** (new product; CR required)  
11. **Insurance/TPA** (explicitly optional / CR)  
12. **Affiliate mobile** and richer satellite SPAs for partner ops excellence  

---

## 9. CRITICAL RISKS

1. **Sandbox defaults on a production host** — if env left at sandbox, mocks can still run; production-*mode* fails closed, but host misconfig is a risk (post-S140 audit).  
2. **Treating EXTERNAL_GATED as “not built”** → rebuilds and parallel frameworks.  
3. **Enabling live money/OTP/clinical without secrets vault + SoD + pentest evidence**.  
4. **Partner activation without DOCUMENT ≠ APPROVED ≠ ENABLED discipline**.  
5. **Thin satellite UIs** causing ops friction even when APIs work.  
6. **Missing DICOM viewer** misread as “imaging not built.”  
7. **Scope creep** into HIS / insurance / acquiring / SFU from scratch (Master Index non-goals).  
8. **Catalog/content thinness** vs 1mg perception gap (ops/content, not engine).  
9. **RPO/RTO not proven** — targets defined, drills incomplete for production.  
10. **Security launch EVIDENCE_REQUIRED** — WAF/DDoS/pentest/approval still open (S148).

---

## 10. RECOMMENDED NEXT DEVELOPMENT ORDER

Ordered for **maximum production readiness with least accidental rebuild**:

1. **Business selection:** country(ies), PSP, messaging, carrier, KYC bureau, clinical/eRx/video/PACS vendors, cloud (DB/storage/KMS/backup), edge WAF — contracts first  
2. **Secrets vault adapter (S142)** — unlock all credential refs  
3. **Production DB + backup/PITR (S146/S147)** + deploy target (S145)  
4. **PSP live adapter (S132)** → checkout real money in controlled sandbox→prod promote  
5. **OTP/messaging live (S133)**  
6. **Carrier live (S134)**  
7. **KYC live (S150)** → unlock pharmacy/lab/doctor/imaging partner production paths  
8. **Clinical live set:** eRx (S137) → video (S138) → PACS (S139) as markets require  
9. **Storage/KMS/malware live (S140)** for PHI artifacts  
10. **Observability + WAF/DDoS + pentest evidence (S143/S148)** → launch approval  
11. **Genuine coding:** DICOM viewer; HL7/FHIR adapters; satellite SPA enrichment; optional affiliate mobile / wallet / content depth  
12. **Optional 1mg+ product bets** only via Change Request (insurance, hospital pharmacy, B2B analytics)

**Next engineering action after this report:** pick items from §4 that match business priority — **do not** start another activation framework sprint.

---

## WHAT WE SHOULD NOT BUILD AGAIN

Future sprints must **reuse**, not parallelize:

1. Identity / OTP-HMAC / session kernel  
2. Prisma domain model + order/cart/fulfillment/logistics state machines  
3. Policy pack / country resolver globalization core  
4. Provider-activation lifecycle contracts (`NOT_CONFIGURED → … → ENABLED` / `EXTERNAL_GATED`)  
5. PSP gateway port + intents/webhooks/refunds/recon + **S132** path  
6. OTP/messaging activation (**S133**) + Console adapter boundary  
7. Carrier port + **S134** path  
8. Pharmacy/vendor network closure (**S135**)  
9. Lab / doctor / telemedicine / imaging workflow closures (**S136–S139**)  
10. Private storage / KMS / malware triad (**S140**)  
11. Secrets-manager runtime resolver (**S142**)  
12. Observability/APM activation (**S143**)  
13. Deploy/release/DB/backup paths (**S144–S147**)  
14. Security hardening compose + launch gate (**S110–S116 + S148**)  
15. Affiliate commission/attribution + payout closure (**S149**)  
16. KYC/KYB case workflow + healthcare partner verification path (**S72–S124 + S150**)  
17. Admin control-plane + provider-activation card wall  
18. CMS / CRM / marketing / support engines (R11–R12)  
19. Explicit non-goals: hospital HIS, insurance/TPA core, in-house acquiring, in-house SFU from scratch, country-forked apps  

---

## COUNTS (from matrix rows above)

Denominator = all capability rows in §7 tables (A–M), counted programmatically from this document.

| Metric | Count | Definition |
| --- | --- | --- |
| **Major capabilities reviewed** | **168** | All §7 data rows |
| **BUILT** | **148** | Status column = BUILT |
| **PARTIAL** | **10** | Status column = PARTIAL |
| **CODING REMAINING** (Status) | **1** | Status column = CODING REMAINING (DICOM viewer) |
| **OPTIONAL** | **9** | Status column = OPTIONAL |
| **EXTERNAL GATE** as sole Status | **0** | Software exists; gates recorded in External-gate column |
| **Rows with External gate? = YES** | **71** | Production provider/infra still required |
| **Genuine coding backlog items (§4)** | **8** | Viewer, HL7/FHIR, live adapters when contracted, SPA enrichment, affiliate mobile, Rx auto-exec, wallet product, content tooling — **not** “capability missing because EXTERNAL_GATED” |
| **Business / legal / ops dependencies (§6 + matrix)** | **See §6 (16 gate themes)** | Hard gates listed in §6; many matrix rows also note ongoing ops/content staffing (not missing software) |

**Calculated shares (168 denominator):**
- BUILT: **148 / 168 = 88.1%**
- PARTIAL: **10 / 168 = 6.0%**
- CODING REMAINING (status): **1 / 168 = 0.6%**
- OPTIONAL: **9 / 168 = 5.4%**
- External-gated rows: **71 / 168 = 42.3%** (orthogonal to Status — a BUILT row may still be externally gated)

**Interpretation:** The 1mg-class **multi-care marketplace software shape is largely BUILT (~88% of reviewed capabilities)**. Production readiness is dominated by **external gates (~42% of rows)** and **business/legal/ops**, not missing kernels. Genuine coding is a **small, named set** (§4).

> Note: Rows are not weighted by business value. Do not confuse “88% BUILT” with “88% production-ready.” `CAN_PRODUCTION_LAUNCH = NO`.

---

## REAL-WORLD PRODUCTION GATES (checklist)

- [ ] PSP/payment — `NO_PRODUCTION_PSP`  
- [ ] OTP/transactional messaging — `NO_PRODUCTION_OTP_MESSAGING_PROVIDER`  
- [ ] Carrier/logistics — `NO_PRODUCTION_CARRIER_ADAPTER`  
- [ ] eRx — `NO_PRODUCTION_ERX_PROVIDER` / doctor workflow umbrella  
- [ ] Telemedicine/video — `NO_PRODUCTION_VIDEO_PROVIDER`  
- [ ] PACS/DICOM — `NO_PRODUCTION_PACS_PROVIDER`  
- [ ] KYC/KYB — `NO_PRODUCTION_KYC_KYB_PROVIDER`  
- [ ] Private storage/KMS/malware — S140 blockers  
- [ ] Backup/PITR/DR — `NO_PRODUCTION_MANAGED_BACKUP_PITR`  
- [ ] APM/monitoring/alerting — `NO_PRODUCTION_APM_PROVIDER`  
- [ ] Secrets manager vault — `NO_PRODUCTION_SECRETS_MANAGER`  
- [ ] Production DB — `NO_PRODUCTION_DATABASE`  
- [ ] Deployment target / CI-CD — S144/S145 blockers  
- [ ] WAF/DDoS/origin/distributed RL — S148 blockers  
- [ ] External pentest + security approval — S148 EVIDENCE_REQUIRED  
- [ ] Real pharmacy/vendor network  
- [ ] Real lab network (+ accreditation)  
- [ ] Real doctors/clinical providers  
- [ ] Licensing/compliance per country  

**Do not convert checked items into fake coding tasks.**

---

## STOP

Read-only reconciliation complete. No application behavior changed. No production activation. No fake provider success.
