# 34 — Risk Register

**Status:** Blueprint  
**Audience:** Founders, architecture, security, legal, finance, operations  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · Domain books 05–16 · [Security](27_SECURITY_ARCHITECTURE.md) · [Infrastructure](29_INFRASTRUCTURE_ARCHITECTURE.md) · [Observability](30_OBSERVABILITY.md) · [Roadmap](33_DEVELOPMENT_ROADMAP.md) · [Open decisions](35_OPEN_DECISIONS.md)

**Likelihood / impact:** Qualitative (Low / Medium / High / Critical). Not actuarial. Revisit at each phase gate.

**LEGAL/COMPLIANCE REVIEW REQUIRED** items are **not** closed by engineering.

---

## 1. How to use

| Field | Meaning |
| --- | --- |
| ID | Stable |
| Type | Technical / Product / Compliance / Operational / Financial |
| L / I | Likelihood / Impact |
| Mitigation | Engineering + process **already in the blueprint** |
| Residual | What remains after mitigation |
| Linked OD / LEGAL | Open decisions or reviews that change the risk |

---

## 2. Named headline risks (must-watch)

These are the risks the blueprint explicitly called out as program-level.

### R-SEC-PHI — Healthcare data breach

| | |
| --- | --- |
| Type | Compliance + Technical |
| L / I | Medium / **Critical** |
| Description | Rx images, reports, notes, KYC, or consult media exposed via mis-ACL, logs, support tools, warehouse, or stolen session |
| Mitigation | Classification + field-level encrypt; signed URLs; consent reload; support **no payload** (**OD-RBAC-02**); log redaction ([27](27_SECURITY_ARCHITECTURE.md), [16](16_HEALTH_RECORD.md), [30](30_OBSERVABILITY.md)); WAF; break-glass audited |
| Residual | Insider + zero-day + misconfigured CDN |
| LEGAL | Incident **notification windows are not invented here**. Pack + counsel. Controller vs processor **OD-EHR-01/02** |

### R-PAY-RECON — Payment reconciliation breaks

| | |
| --- | --- |
| Type | Financial + Technical |
| L / I | Medium / **High** |
| Description | PSP captured but order not confirmed; refund not posted; FX rounding; webhook miss; double capture |
| Mitigation | Thin payment kernel + ledger **from Phase 2** ([33](33_DEVELOPMENT_ROADMAP.md)); idempotency; fetch-before-fallback; recon file process ([12](12_PAYMENT_PLATFORM.md), [13](13_LEDGER_SETTLEMENT.md)); P1 on outbox lag ([30](30_OBSERVABILITY.md)) |
| Residual | PSP files late; COD cash |
| Linked | **OD-PAY-01**, **OD-FX-*** , **OD-LED-08** |

### R-LAB-COC — Sample chain of custody break

| | |
| --- | --- |
| Type | Clinical safety + Operational |
| L / I | Medium / **Critical** |
| Description | Wrong patient, swapped barcode, unlogged temperature, lost specimen, silent override |
| Mitigation | Same `sample_id` scans; mismatch **hard stop**; sealed photo **OD-PHE-07**; temperature field **OD-LAB-14**; SoD sign ([09](09_LAB_PLATFORM.md), [10](10_PHLEBOTOMIST_PLATFORM.md)) |
| Residual | Physical world; collusion |
| LEGAL | Lab licensing, report e-sign **OD-LAB-08** — **LEGAL REVIEW** |

### R-CARE-LIAB — Teleconsult liability

| | |
| --- | --- |
| Type | Compliance + Product |
| L / I | Medium / **Critical** |
| Description | Platform treated as the practising doctor; recording without consent; cross-border consult; CDS that “diagnoses”; dropped call + incomplete record |
| Mitigation | Doctor remains accountable ([01](01_PRODUCT_VISION.md) §5); recording **default false**; consent grants; chat SoT; no diagnostic AI as product; pack `telemedicine.enabled` false until legal |
| Residual | Malpractice is **clinician + local law**; platform process gaps still get sued |
| LEGAL | Telemedicine, e-Rx, recording, standard of care — **LEGAL REVIEW per country**. **OD-DOC-02** before financial penalties |

### R-MKT-AUTH — Marketplace medicine authenticity

| | |
| --- | --- |
| Type | Compliance + Product + Operational |
| L / I | Medium / **Critical** |
| Description | Counterfeit / diverted / expired / unlicensed seller; platform branded as the pharmacist |
| Mitigation | Vendor KYC; listing queue; default **owned pharmacy for Rx** (**OD-VEND-01**); batch/expiry; ops authenticity queue; **no** claim of full DSCSA/track-and-trace in v1 ([01](01_PRODUCT_VISION.md) §5) |
| Residual | Physical supply chain |
| LEGAL | Pharmacy marketplace operator vs facilitator **OD-PAY-01**; advertising of medicines |

### R-GLOB-REWRITE — Multi-country rewrite pressure

| | |
| --- | --- |
| Type | Product + Technical |
| L / I | High if packs skipped / **High** |
| Description | First launch hardcodes one country; second country becomes a fork |
| Mitigation | Pack scaffolding **Phase 0**; `country_id` everywhere; no hardcoded methods (UPI as pack flag); residency pin topology ([29](29_INFRASTRUCTURE_ARCHITECTURE.md) §6); Phase 9 is pack fill not rewrite |
| Residual | Truly incompatible local HIS/tax still needs adapters |
| Linked | **OD-COUNTRY-01**, **OD-EHR-08**, **OD-CLOUD-01** regions |

### R-ARCH-MS — Premature microservices

| | |
| --- | --- |
| Type | Technical |
| L / I | High (if org fashion) / High |
| Description | Distributed transactions across pay-order-ledger-notify with a small team |
| Mitigation | Modular monolith **OD-ARCH-01 confirmed**; extract only with independent scale/failure/compliance ([04](04_APPLICATION_ARCHITECTURE.md) §1); Phase 10 only |
| Residual | Eventual extract still hard if module boundaries rot — CI architecture tests ([32](32_DEVOPS_CICD.md)) |

### R-VID-LOCK — LiveKit lock-in

| | |
| --- | --- |
| Type | Technical + Operational |
| L / I | Medium / Medium |
| Description | Cloud SFU residency, pricing, or outage; clients call Cloud-only APIs |
| Mitigation | Video **adapter** from Phase 4; OSS self-host path; chat SoT off SFU; **OD-VID-01** |
| Residual | TURN/media still specialized |
| Linked | **OD-VID-01**, **OD-EHR** recording |

### R-NTF-WA — WhatsApp dependency

| | |
| --- | --- |
| Type | Operational + Compliance + Financial |
| L / I | High in some markets / High |
| Description | OTP, reports, or marketing assume WhatsApp; BSP ban, template reject, or outage; PHI in chat |
| Mitigation | Notification **adapter**; pack `notify.whatsapp`; SMS/email fallback; **no** result values in insecure chat ([09](09_LAB_PLATFORM.md), [27](27_SECURITY_ARCHITECTURE.md) R-SEC-08) |
| Residual | User expectation in WA-first markets |
| LEGAL | Health content on messengers — **LEGAL REVIEW**. **OD-NTF-01**, **OD-CRM-02** |

---

## 3. Technical risks

| ID | Risk | L / I | Mitigation |
| --- | --- | --- | --- |
| R-TECH-01 | Outbox/ledger consumer silent drop | M / **C** | P1 lag; soak tests; never “best effort” money events |
| R-TECH-02 | Redis one instance cache+queue eviction | M / H | Split instances ([29](29_INFRASTRUCTURE_ARCHITECTURE.md) R-INFRA-01) |
| R-TECH-03 | Search index stale → sell OOS | M / M | Reserve at checkout from OLTP; search is hint |
| R-TECH-04 | GPS/battery drain + privacy | M / M | **OD-LOG-05** job-scoped pings |
| R-TECH-05 | RN flavors vs many apps drift | M / M | **OD-ARCH-02**; shared packages |
| R-TECH-06 | Next.js cache leaks session HTML | M / H | Cache policy ([28](28_PERFORMANCE_ARCHITECTURE.md) §4) |
| R-TECH-07 | Webhook replay / unknown capture double charge | M / **C** | [12](12_PAYMENT_PLATFORM.md) R-PAY-01/03; chaos tests |
| R-TECH-08 | OTP bombing cost + lockout | H / M | Rate limits; provider circuit |
| R-TECH-09 | OpenSearch PHI indexed | L / **C** | Index metadata only |
| R-TECH-10 | Backup copied off residency | L / **C** | Pin backups **OD-DR-01** |
| R-TECH-11 | k8s too early | M / H | [29](29_INFRASTRUCTURE_ARCHITECTURE.md) §3 |
| R-TECH-12 | Dual cloud | L / H | Single cloud v1 |
| R-TECH-13 | Client-side price trust | M / H | Server offer version pin |
| R-TECH-14 | Video TTFF fail in target markets | M / H | TURN budget; degrade to audio/chat |
| R-TECH-15 | Mobile offline fake POD | M / H | Server-side OTP; **OD-PHE-03** no offline identity |

---

## 4. Product risks

| ID | Risk | L / I | Mitigation |
| --- | --- | --- | --- |
| R-PRD-01 | Super-app too wide; no liquid marketplace | H / H | Roadmap: **own pharmacy commerce first** (P1–P2) before vendors/doctors/labs |
| R-PRD-02 | Mixed checkout UX confusion | M / M | Kernel composite; UI later **OD-CUS-01** |
| R-PRD-03 | Caregiver/family sharing passwords | H / H | No household switch v1; **OD-RBAC-03** legal later |
| R-PRD-04 | Guest checkout + health | M / H | Account before pay **OD-CUS-03** |
| R-PRD-05 | Instant consult quality | M / H | Slots first **OD-DOC-01** |
| R-PRD-06 | Loyalty/membership as illegal inducement | M / **C** | Pack off; **LEGAL REVIEW** **OD-CUS-12** |
| R-PRD-07 | Brand/name still “World Pharma” in stores | M / M | **OD-BRAND-01** before store listing |
| R-PRD-08 | Insurance/TPA assumed in v1 | L / H | Out of scope unless **OD-PROD-02** |
| R-PRD-09 | OCR treated as signed Rx | M / **C** | Non-authoritative flag; pharmacist/doctor sign |
| R-PTR-01 | Fake partner accounts / credential fraud | H / **C** | Pack KYC, dual control, liveness if pack, duplicate payout/device graphs |
| R-PTR-02 | Fraudulent / stolen KYC documents | H / **C** | Versioned review, malware scan, reviewer SoD, expiry jobs |
| R-PTR-03 | Partner account takeover | M / **C** | Step-up on join-from-customer; device bind field roles |
| R-PTR-04 | Insider KYC dump | M / **C** | Download permission + watermark + access log |
| R-PTR-05 | Country pack mismatch (wrong docs) | M / H | Empty pack cannot ACTIVE regulated types |
| R-PTR-06 | Expired licenses still practising | M / **C** | Expiry events → SUSPEND per pack |
| R-PTR-07 | Partner abuse / rider fraud / vendor counterfeit | H / **C** | Risk flags, capability gating, listing QA ([07](07_VENDOR_PLATFORM.md)) |
| R-PRD-10 | Doctor discovery ranking as paid steering | M / H | Pack + **LEGAL** referral fees |

---

## 5. Compliance risks

**Do not treat this table as a legal opinion.**

| ID | Risk | L / I | Mitigation / review |
| --- | --- | --- | --- |
| R-CMP-01 | Launch without pharmacy/tele/lab license map | H / **C** | Pack flags default **false**; **LEGAL REVIEW** per country |
| R-CMP-02 | e-Rx / e-sign invalid | M / **C** | **OD-LAB-08**, doctor sign pack; paper fallback |
| R-CMP-03 | Stored-value wallet = unlicensed e-money | M / **C** | Wallet **off** **OD-PAY-05** |
| R-CMP-04 | Marketplace facilitator vs MoR mismatch | H / **C** | **OD-PAY-01** before P2/P3 live money |
| R-CMP-05 | Fee-split / kickback (doctor, affiliate, lab steer) | M / **C** | Clinical affiliate **default off** **OD-AFF-03**; pack |
| R-CMP-06 | Medicine advertising | M / H | CMS ads gated; **LEGAL** |
| R-CMP-07 | Children’s accounts / age of consent | M / H | Block under-age until pack; **LEGAL** |
| R-CMP-08 | Social login + health IdP sharing | M / H | **OD-CUS-05** empty until pack |
| R-CMP-09 | Retention years invented in code | M / H | Empty retention until [19](19_COMPLIANCE_FRAMEWORK.md) pack |
| R-CMP-10 | Claiming HIPAA/GDPR certification | L / H | Explicit non-claim ([01](01_PRODUCT_VISION.md) §10) |
| R-CMP-11 | Cross-border consult / report pull | M / **C** | Default deny **OD-EHR-08** |
| R-CMP-12 | Pathologist e-report not “official” | M / H | Pack; customer copy vs partner SoT **OD-EHR-02** |
| R-CMP-13 | COD of Rx | M / H | Pack; **LEGAL** |
| R-CMP-14 | Profiling / automated pay deny | M / H | Risk scores as gate; **LEGAL** automated decisioning |

---

## 6. Operational risks

| ID | Risk | L / I | Mitigation |
| --- | --- | --- | --- |
| R-OPS-01 | Rx TAT / report TAT ops understaffed | H / H | Queues + SLAs as **ops KPIs** not invented law |
| R-OPS-02 | Rider/phlebo liquidity | H / H | Assignment **OD-LOG-02**; surge **OD-LOG-08** later |
| R-OPS-03 | Fake POD / COD theft | M / H | OTP; cash remittance hold **OD-LOG-04** |
| R-OPS-04 | Panic value missed | M / **C** | Flag + ack metric; **OD-LAB-05**; not SMS values |
| R-OPS-05 | KYC backlog blocks supply | M / H | Queues in P1; dual control may slow **OD-RBAC-01** |
| R-OPS-06 | 24/7 on-call before P2 | M / M | Roster required before **paid** traffic ([32](32_DEVOPS_CICD.md)) |
| R-OPS-07 | WhatsApp/SMS provider outage | H / H | Dual channel; email fallback |
| R-OPS-08 | Maps vendor outage | M / M | Adapter; list/ETA degrade |
| R-OPS-09 | Staff using prod as test shop | M / M | Policy + env separation ([02](02_BUSINESS_ARCHITECTURE.md) §8) |
| R-OPS-10 | Lost hard-copy report | M / M | **OD-LAB-07** reprint vs refund |

---

## 7. Financial risks

| ID | Risk | L / I | Mitigation |
| --- | --- | --- | --- |
| R-FIN-01 | Chargeback / marketplace ownership unclear | M / H | **OD-PAY-12** follows MoR |
| R-FIN-02 | Vendor payable too early (pre-POD) | M / H | **OD-LED-08** POD default |
| R-FIN-03 | Lab billed on booking then test fails | M / H | Unearned cash; refund J16; **OD-LED-01** |
| R-FIN-04 | Promo funded ambiguously | M / M | `funded_by` **OD-LED-06** |
| R-FIN-05 | Period never closes; finance in sheets | H / H | Ledger P2; close in P8 |
| R-FIN-06 | PSP fee / FX P&L surprise | M / M | Snapshots; **OD-FX-01** refund original ccy |
| R-FIN-07 | Wallet liability untracked | M / **C** | Wallet off or nightly match |
| R-FIN-08 | SMS/OTP cost blow-up | H / M | Rate limits; anomaly alert |
| R-FIN-09 | LiveKit+TURN cost | M / M | No recording default; room caps |
| R-FIN-10 | Observability ingest > API bill | M / M | Sample; no payload ([30](30_OBSERVABILITY.md)) |

---

## 8. LEGAL REVIEW index (engineering reminder)

These require counsel **before** the related flag is true in a named country. Not exhaustive.

| Topic | Typical phase | Related OD |
| --- | --- | --- |
| Entity, brand, pharmacy license | 0–2 | OD-BRAND-01, OD-COUNTRY-01 |
| Merchant of record / marketplace | 2–3 | OD-PAY-01 |
| Stored value | 2+ | OD-PAY-05 |
| Telemedicine + e-Rx + recording | 4 | OD-VID-02, packs |
| Lab accreditation + e-report | 5 | OD-LAB-08 |
| Affiliate / membership inducement | 7 | OD-AFF-03, OD-CUS-12 |
| Data protection role (controller/processor) | 0–1 | OD-EHR-01/02 |
| Incident notify clocks | 0 | Do not invent |
| Children’s / caregiver | 1 / later | OD-RBAC-03 |
| Employment vs contractor riders | 2 / 6 | OD-LED-05 (accounting only) |

---

## 9. Residual risk statement

World Pharma can **reduce** likelihood of money loss, mixed-up samples, and bulk PHI leak through the controls in 12, 13, 16, 27–32. It cannot eliminate clinician malpractice, physical counterfeit, or a country regulator’s interpretation. **Do not ship regulated flags on empty packs.**
