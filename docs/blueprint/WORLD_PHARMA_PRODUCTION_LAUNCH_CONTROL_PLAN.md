# WORLD_PHARMA — Production Launch Control Plan

**Sprint:** 158  
**Master backlog:** #455  
**Document type:** Launch preparation control (not a feature sprint)  
**Status:** CONTROL PLAN COMPLETE  
**Software baseline:** S157 — SOFTWARE COMPLETE · `NO_CRITICAL_CODING_GAP_FOUND`  
**CAN_PRODUCTION_LAUNCH:** **NO**  
**Coding for this sprint:** **NO_NEW_CODING_REQUIRED_FOR_LAUNCH_CONTROL**

---

## 1. Executive summary

World-Pharma application software for core 1mg-class journeys is **complete in sandbox**. Remaining work to run **real production** is almost entirely:

- human/business/legal decisions (first market, MoR, licences)
- contracted external providers (PSP, OTP, carrier, KYC, clinical, infra)
- ops evidence (pentest, DR restore proof, SOPs)

Existing activation paths (S87–S150 / S132–S148) and Admin **Launch readiness** + **Provider activation** already express launch state. **S158 does not rebuild them, enable them, or invent credentials.**

**First market:** the repository does **not** select a country.

→ **`FIRST_MARKET_SELECTION_REQUIRED`** (OD-COUNTRY-01)

---

## 2. Current software readiness

| Dimension | State |
| --- | --- |
| Core product journeys (medicine, lab, imaging viewer, consult, vendor, affiliate) | SOFTWARE COMPLETE (S157) |
| Production activation frameworks | SOFTWARE_COMPLETE / SOFTWARE_READY; production **EXTERNAL_GATED** |
| Admin launch representation | Present (`/launch-readiness`, `/provider-activation`) — no new dashboard required |
| Force-launch / live enablement | **false** / blocked by design |
| `GET …/production-launch-control` | Aggregates rails; `can_production_launch: NO`, `overall_status: NOT_READY` while mandatory rails unresolved |

**Do not confuse:** sandbox verified ≠ production enabled ≠ launch approved.

---

## 3. First-market selection requirements

### 3.1 Selection status

| Item | Value |
| --- | --- |
| First launch country/market | **`FIRST_MARKET_SELECTION_REQUIRED`** — not chosen in repo |
| Decision ID | **OD-COUNTRY-01** (`REQUIRES_HUMAN_DECISION`) |
| Technical placeholder | Country `XX` / empty policy pack / currency `XXX` |
| Customer country | Selected storefront / cart / order `countryId` (market of sale) |
| Source / fulfillment country | Seller org + `fulfillingLocationId` / logistics origin — **may differ**; architecture sets `source_country_equals_customer_country: false` |
| Cross-border medicine | **LEGAL_GATED** / not auto-approved; pack `shipping.international` defaults **false** |

**Do not invent a country in software.**

### 3.2 Inputs required before a real market can activate

Humans / legal / finance must supply (then operators configure packs + evidence):

| Requirement | How represented |
| --- | --- |
| Launch ISO country + display names | `Country` row (real `isoAlpha2`/`isoAlpha3`, `nameI18n`) |
| Customer market locale | `defaultLocale` + pack `i18n` |
| Currency | Country `defaultCurrency` + pack `currency` (real ISO 4217 — not `XXX`) |
| Timezone | Country `defaultTimezone` + pack `timezone` (IANA) |
| Tax configuration | Pack opaque `tax_profile_id` + legal tax profile (rates not invented in empty pack) |
| MoR / legal entity | **OD-PAY-01**; `LegalEntity` + pack `ledger.legal_entity_id` / `accounting_currency` |
| Data / privacy | `dataResidencyMode`; controller vs processor (OD-EHR/CMP); consent/retention evidence |
| Pharmacy / medicine regulatory model | Published `HealthcarePolicy` + VERIFIED `RegulatoryEvidence` (pharmacy licence codes, controlled meds, Rx rules) |
| Prescription / Rx rules | Pack `healthcare.rx_*` flags (fail-closed defaults; auto-execute stays off unless legally authorized) |
| Healthcare provider requirements | Doctor / lab / imaging licence evidence + partner_types in pack |
| Delivery requirements | Pack `shipping.*` + ≥1 active serviceability zone |
| Payment requirements | Pack `payments.enabled` + methods + gateway_refs (ids only) + live PSP |
| KYC/KYB requirements | Production KYC provider + partner verification evidence |
| Licences / registrations | Pharmacy, telehealth, lab, imaging, company registrations as legally required |
| Country policy pack | Published `PolicyPack` linked as `publishedPolicyPackId` |
| Production lifecycle | `CountryProductionLifecycle`: CONFIGURED → … → ACTIVE (explicit admin activate; not default) |

### 3.3 Market readiness dimensions (existing)

SOFTWARE · LEGAL · COMMERCIAL · INTEGRATION · PRODUCTION — see Sprint 39 / country production / final launch readiness APIs. Sandbox `CountryStatus` ≠ production lifecycle.

---

## 4. Production gate matrix

Classification legend used in column “Class”:

- **A** = ALREADY IMPLEMENTED SOFTWARE  
- **B** = CONFIGURATION ONLY  
- **C** = EXTERNAL PROVIDER REQUIRED  
- **D** = BUSINESS/LEGAL/LICENSING REQUIRED  
- **E** = ACTUAL CODING REQUIRED  

| # | Gate | Existing software support | Required external/business input | Current state | Owner/input needed | Can Cursor complete it? | Activation dependency | Class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | First launch market | Country + PolicyPack + production lifecycle APIs | Named ISO market + legal go-ahead | **FIRST_MARKET_SELECTION_REQUIRED** | Founders + legal | **No** | None (root) | D |
| 2 | MoR / legal entity | `LegalEntity`, ledger pack fields, PSP MoR slots | MoR model, incorporation, operating currency | OD-PAY-01 open | Finance + legal | **No** | (1) | D |
| 3 | Healthcare / pharmacy licensing | RegulatoryRequirement + Evidence + HealthcarePolicy | Licences, filings, renewals | Evidence incomplete / EXTERNAL | Legal + pharmacy ops | **No** | (1)(2) | D |
| 4 | Real pharmacy / vendor network | S135 pharmacy-vendor network closure | Contracted licensed pharmacies | `NO_PRODUCTION_PHARMACY_VENDOR_NETWORK` | Commercial + legal | **No** | (1)(3)(8) | C+D |
| 5 | PSP | S132 PSP activation path | Contracted PSP + vault secret refs | `NO_PRODUCTION_PSP` | Finance + eng ops | **No** (adapter after contract) | (1)(2)(16) | C+D |
| 6 | Production OTP / SMS | S133 OTP/messaging path | OTP/SMS/email vendors + sender IDs | `NO_PRODUCTION_OTP_MESSAGING_PROVIDER` | Ops + legal (sender) | **No** | (1)(16) | C |
| 7 | Carrier / logistics | S134 carrier path | Live carrier + webhooks | `NO_PRODUCTION_CARRIER_ADAPTER` | Ops + commercial | **No** | (1)(4)(16) | C |
| 8 | KYC / KYB | S150 / S94 KYC path | Live KYC vendor | `NO_PRODUCTION_KYC_KYB_PROVIDER` | Compliance + ops | **No** | (1)(16) | C+D |
| 9 | eRx | S91/S137 eRx path | National/network eRx provider | `NO_PRODUCTION_ERX_PROVIDER` | Clinical + legal | **No** | (1)(3)(16) | C+D |
| 10 | Telemedicine / video | S92/S138 video + telemed closure | Live video provider | `NO_PRODUCTION_VIDEO_PROVIDER` | Clinical + ops | **No** | (1)(16) | C |
| 11 | PACS / DICOM | S93/S139 PACS path; S152 sandbox viewer | Live PACS | `NO_PRODUCTION_PACS_PROVIDER` | Imaging ops | **No** | (1)(12)(13)(14) | C |
| 12 | Private storage | S140/S95 storage path | Cloud object storage | `NO_PRODUCTION_PRIVATE_STORAGE` | Infra | **No** | (16)(15) | C |
| 13 | KMS | Same triad | Cloud KMS / CMK | `NO_PRODUCTION_KMS` | Infra + security | **No** | (16) | C |
| 14 | Malware scanning | Same triad | Production AV scanner | `NO_PRODUCTION_MALWARE_SCANNER` | Infra + security | **No** | (12)(16) | C |
| 15 | Production DB | S146 DB activation path | Hosted Postgres + credentials via vault | `NO_PRODUCTION_DATABASE` | Infra | **No** | (16)(21) | C |
| 16 | Secrets manager | S142 secrets resolver | Vault / cloud secrets | `NO_PRODUCTION_SECRETS_MANAGER` | Infra + security | **No** | (21) early | C |
| 17 | Backup / PITR | S147 backup path | Managed backup + PITR | `NO_PRODUCTION_MANAGED_BACKUP_PITR` | Infra | **No** | (15) | C |
| 18 | DR restore | S147 / S96 DR contracts | Proven restore in DR env | RPO/RTO **NOT_YET_PROVEN** | Infra + ops | **No** | (17) | C+B |
| 19 | APM / monitoring | S143 observability path | APM + pager destinations | `NO_PRODUCTION_APM_PROVIDER` | Infra + ops | **No** | (21) | C |
| 20 | WAF / DDoS | S148 / edge activation | WAF, DDoS, origin shield | `NO_PRODUCTION_WAF` / DDOS | Infra + security | **No** | (21)(33) | C |
| 21 | Production deployment target | S145 / S144 deploy paths | Real non-localhost target | `NO_PRODUCTION_DEPLOYMENT_TARGET` | Infra | **No** | (16)(15) | C |
| 22 | CI/CD | S144 / S99 release engineering | Production deploy provider (not validate-only) | `NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER` | Eng ops | **No** | (21) | C |
| 23 | Security / pentest | S148 security launch gate | Pentest evidence + approvals | `EXTERNAL_PENTEST_EVIDENCE_REQUIRED` | Security + leadership | **No** | (21)(20) + app freeze | D+C |
| 24 | Lab network | S136 lab workflow closure | Contracted labs (+ optional HL7 later) | `NO_PRODUCTION_LAB_DIAGNOSTIC_WORKFLOW` | Commercial + clinical | **No** for contracts; HL7 only if chosen | (1)(8)(3) | C+D |
| 25 | Doctors / clinical providers | S137 doctor/eRx workflow | Licensed doctors + onboarding | Workflow EXTERNAL_GATED | Clinical ops | **No** | (1)(3)(8)(10?) | C+D |
| 26 | Imaging providers | S139 imaging workflow | Imaging centres + PACS | EXTERNAL_GATED | Imaging ops | **No** | (1)(8)(11) | C+D |
| 27 | Affiliate payout | S149 payout closure | Live payout rail + KYC eligibility | `NO_PRODUCTION_PAYOUT_ADAPTER` | Finance | **No** | (5)(8) | C+D |
| 28 | Payment reconciliation | Finance / PSP recon software | PSP reports + ops process | Depends on live PSP | Finance ops | Partial config only | (5) | A+B+C |
| 29 | Customer support / operations | Support tickets software | Staffing, SLAs, playbooks | Ops incomplete | Ops | **No** | (1) | D |
| 30 | Privacy / legal / compliance | Consent, retention codes, packs | Policies, DPA, DPIA as required | Legal open | Legal | **No** | (1)(2) | D |
| 31 | Terms / consent / legal documents | Legal content surfaces | Final ToS, privacy, consent copy | Placeholders / review_required | Legal + product | **No** (content) | (1) | D |
| 32 | Data retention / deletion | Retention codes + admin tools | Retention schedules approved | Policy incomplete | Legal + eng config | Config only after legal | (1)(30) | B+D |
| 33 | Production domains / DNS / TLS | Deploy/edge contracts | Domains, certs, DNS | Not production-bound | Infra | **No** | (21)(20) | C |
| 34 | Incident response | Alerting destinations + runbooks | On-call, IR plan, contacts | EXTERNAL / ops | Security + ops | **No** | (19) | D+C |
| 35 | Refund / chargeback operations | Order/payment state machines | PSP chargeback process + finance SOP | Needs live PSP + SOP | Finance ops | **No** | (5)(28) | D+C |
| 36 | Real-world fulfilment SOPs | Vendor pick/pack/ship software | Warehouse SOPs, SLA, exception handling | SOP incomplete | Ops + pharmacies | **No** | (4)(7) | D |

**Gate count:** **36** (as specified).  
**Category E for launch-control itself:** **none**.  
Optional future coding (not a launch-control gap): HL7/FHIR adapters **if and only if** the chosen lab network requires them — still **EXTERNAL_GATED / contracted** until then.

Authoritative software modules (reuse, do not rebuild):  
`psp-payment-production-activation-path.ts`, `otp-messaging-production-activation-path.ts`, `carrier-logistics-production-activation-path.ts`, `production-kyc-kyb-healthcare-partner-verification-activation-path.ts`, `erx-production-activation-path.ts`, `doctor-consultation-erx-production-workflow-closure.ts`, `video-production-activation-path.ts`, `telemedicine-live-consultation-production-workflow-closure.ts`, `pacs-production-activation-path.ts`, `imaging-pacs-dicom-production-workflow-closure.ts`, `private-storage-kms-malware-production-activation-path.ts` (+ workflow closure), `production-managed-backup-pitr-activation-path.ts`, `observability-apm-monitoring-alerting-production-activation-path.ts`, `secrets-manager-runtime-resolver.ts`, `production-database-activation-path.ts`, `production-deployment-target-activation-path.ts`, `deployment-release-engineering-production-activation-path.ts`, `production-security-launch-gate-path.ts`, `affiliate-payout-settlement-production-workflow-closure.ts`, `pharmacy-vendor-network-closure.ts`, `lab-partner-production-workflow-closure.ts`, `production-launch-control.ts`.

---

## 5. Dependency graph

Derived from existing activation contracts (foundation → commercial → healthcare → verify → pilot):

```text
[1] FIRST_MARKET_SELECTION (OD-COUNTRY-01)
        │
        ▼
[2] MoR / legal entity (OD-PAY-01)  +  [30][31][32] privacy/terms/retention
        │
        ▼
[3] Licences / healthcare regulatory evidence
        │
        ├──────────────────────────────┐
        ▼                              ▼
[16] Secrets manager            [33] Domains / DNS / TLS
        │                              │
        ▼                              ▼
[15] Production DB  ←────────── [21] Deployment target ← [22] CI/CD
        │
        ▼
[17] Backup/PITR → [18] DR restore proof
[12][13][14] Private storage + KMS + malware
[19] APM/monitoring → [34] Incident response
[20] WAF/DDoS
        │
        ▼
[5] PSP  +  [6] OTP/SMS  +  [8] KYC/KYB
        │
        ▼
[4] Pharmacy/vendor network (licensed + KYC + commercial approval)
        │
        ▼
[7] Carrier / fulfilment  +  [36] Fulfilment SOPs  +  [35] Refund/chargeback ops
        │
        ├── optional scope ──► [25] Doctors + [10] Video + [9] eRx
        ├── optional scope ──► [24] Labs (+ HL7 only if contracted)
        └── optional scope ──► [26] Imaging + [11] PACS
        │
        ▼
[27] Affiliate payout (if affiliate in scope)  +  [28] Payment reconciliation
        │
        ▼
[29] Support / operations staffing
        │
        ▼
End-to-end production validation (sandbox≠prod; real providers in staging/prod)
        │
        ▼
[23] Security approval / pentest evidence
        │
        ▼
Controlled pilot (limited SKUs / geos / partners)
        │
        ▼
CountryProductionLifecycle → ACTIVE + launch authorization
        │
        ▼
CAN_PRODUCTION_LAUNCH = YES  (only when mandatory rails clear)
```

**Medicine-first minimal path** can defer lab/imaging/telemed/eRx if pack services stay off — still requires market, MoR, licences, infra, PSP, OTP, KYC, pharmacy, carrier, security.

---

## 6. External providers required

| Provider class | Blocker constant (examples) |
| --- | --- |
| PSP | `NO_PRODUCTION_PSP` |
| OTP / SMS / email | `NO_PRODUCTION_OTP_MESSAGING_PROVIDER` |
| Carrier | `NO_PRODUCTION_CARRIER_ADAPTER` |
| KYC/KYB | `NO_PRODUCTION_KYC_KYB_PROVIDER` |
| eRx network | `NO_PRODUCTION_ERX_PROVIDER` |
| Video | `NO_PRODUCTION_VIDEO_PROVIDER` |
| PACS | `NO_PRODUCTION_PACS_PROVIDER` |
| Object storage / KMS / AV | `NO_PRODUCTION_PRIVATE_STORAGE` / `KMS` / `MALWARE_SCANNER` |
| Managed backup / PITR / DR | `NO_PRODUCTION_MANAGED_BACKUP_PITR` |
| APM / monitoring / alerting | `NO_PRODUCTION_APM_PROVIDER` (+ related) |
| Secrets manager | `NO_PRODUCTION_SECRETS_MANAGER` |
| Hosted DB | `NO_PRODUCTION_DATABASE` |
| Deploy / CI-CD | `NO_PRODUCTION_DEPLOYMENT_TARGET` / `NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER` |
| WAF / DDoS | `NO_PRODUCTION_WAF` / DDOS |
| Payout | `NO_PRODUCTION_PAYOUT_ADAPTER` |
| Pharmacy / lab / imaging networks | `NO_PRODUCTION_PHARMACY_VENDOR_NETWORK` / lab / imaging workflow blockers |

---

## 7. Business / legal / licensing requirements

- **OD-COUNTRY-01** first market  
- **OD-PAY-01** Merchant of Record  
- Brand / legal entity naming  
- Pharmacy, telehealth, lab, imaging licences as in-scope  
- Controller vs processor / privacy program  
- Terms, privacy policy, consent texts  
- Tax registration and opaque tax profile binding  
- Cross-border medicine legal approval if ever claimed  
- Pentest / security sign-off  
- Partner commercial contracts  

---

## 8. Infrastructure requirements

Secrets → DB → backup/PITR → DR proof → private storage/KMS/malware → deploy target → CI/CD production path → domains/TLS → WAF/DDoS → APM/alerting.  
RPO **15m** / RTO **4h** remain **TARGET_DEFINED / NOT_YET_PROVEN** until DR evidence exists.

---

## 9. Security requirements

- Application security software verified (S110–S116 / S148 soft controls)  
- Edge WAF/DDoS/origin EXTERNAL_GATED  
- Distributed rate-limit EXTERNAL_GATED where applicable  
- Pentest: **EVIDENCE_REQUIRED**  
- Two-person / SoD patterns for sensitive enables — do not bypass  
- No client-forged production enablement  

---

## 10. Operational readiness

- Customer support staffing + SLAs  
- Pharmacy fulfilment SOPs  
- Refund / chargeback desks  
- Incident response / on-call  
- Reconciliation runbooks  
- Partner onboarding runbooks (vendor, doctor, lab, imaging, affiliate)  

---

## 11. End-to-end production validation plan

After providers are contracted and configured in a **non-fake** staging/production environment:

1. Auth OTP delivery (real SMS) + login  
2. Catalog browse → cart → quote → PSP payment (small amount) → order  
3. Vendor accept → pick/pack → carrier book → track → deliver  
4. Refund / cancel path on test order  
5. If in scope: Rx path with legal eRx; consult video; lab report; imaging+PACS  
6. Affiliate attribution + payout dry-run against live payout rail  
7. Confirm Admin launch-control flips rails only when evidence present  
8. Confirm `CAN_PRODUCTION_LAUNCH` remains **NO** until mandatory set is green  

**Never** claim production PASS from sandbox mock adapters.

---

## 12. Controlled pilot plan

1. Single selected market pack published; production lifecycle READY_FOR_ACTIVATION  
2. Limited SKU set + limited postal zones  
3. 1–N licensed pharmacies only  
4. Caps on order volume / GMV  
5. Enhanced monitoring + manual review for exceptions  
6. Explicit rollback: SUSPEND country production lifecycle; disable providers  
7. Exit criteria: zero critical Sev-1 for N days; finance recon clean; support SLA met  

---

## 13. Final launch gates

All mandatory rails for chosen scope = READY/ENABLED with evidence; security approval recorded; MoR+licences current; DR restore proven; leadership written authorization.  
Then and only then: `can_production_launch: YES`.

**Today:** **NO**.

---

## 14. Items Cursor must NOT rebuild

- S110–S157 security / activation / workflow frameworks  
- New provider-activation framework or parallel launch dashboard  
- Fake providers, credentials, licences, KYC results, eRx, payments, carriers  
- Feature product work disguised as launch prep  
- HL7/FHIR unless a contracted lab network makes it a demonstrated coding need  

---

## 15. Exact next human / business decision required

### Immediate next decision (blocks everything else)

**Decide and record OD-COUNTRY-01: the first production launch country/market.**

Until that exists, mark all market-specific licensing, tax, MoR jurisdiction, and provider market enablement as blocked by:

**`FIRST_MARKET_SELECTION_REQUIRED`**

### Immediately after country selection

1. Confirm **OD-PAY-01** Merchant of Record model and legal entity  
2. Commission licence/regulatory checklist for that market  
3. Select PSP + OTP + KYC + carrier shortlist for that market  
4. Decide day-1 scope: medicine-only vs +consult / +lab / +imaging  

Admin already shows launch state under **Launch readiness** and **Provider activation** — use those surfaces; do not request a new dashboard.

---

## Admin alignment (Phase 6)

| Surface | Path | Sufficient for S158? |
| --- | --- | --- |
| Production launch control | Admin `/launch-readiness` + `GET …/production-launch-control` | **Yes** |
| Provider activation wall | Admin `/provider-activation` + control-plane GETs | **Yes** |
| Country / policy / legal entities | Admin countries, policy packs, legal entities | **Yes** |
| Final launch readiness (per country) | Regulatory final-launch-readiness API | **Yes** |

**No new Admin dashboard added in S158.**

---

## Safe validation (Phase 7)

Focused tests only; **no production enablement**; no credential or flag changes:

- Existing production-launch-control / activation-path unit suites remain PASS  
- `CAN_PRODUCTION_LAUNCH` stays **NO**

---

## STOP

Do **not** open S159 merely to continue sprint numbering.  
Next work is **human/business/provider onboarding**, not another coding sprint, unless a new category-E defect is proven after market selection.
