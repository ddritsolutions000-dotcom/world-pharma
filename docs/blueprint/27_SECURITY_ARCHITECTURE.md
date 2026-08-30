# 27 — Security Architecture

**Status:** Blueprint  
**Audience:** Architecture, engineering, security, compliance, operations  
**Requirement IDs:** REQ-SEC, REQ-ID, REQ-RBAC, REQ-EHR, REQ-CMP, REQ-PAY  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Customer](05_CUSTOMER_PLATFORM.md) · [Health record](16_HEALTH_RECORD.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Compliance](19_COMPLIANCE_FRAMEWORK.md) · [Database](20_DATABASE_ARCHITECTURE.md) · [API](21_API_ARCHITECTURE.md) · [Performance](28_PERFORMANCE_ARCHITECTURE.md) · [Observability](30_OBSERVABILITY.md) · [Testing](31_TESTING_STRATEGY.md) · [DevOps](32_DEVOPS_CICD.md) · [Risk register](34_RISK_REGISTER.md) · [Open decisions](35_OPEN_DECISIONS.md)

---

## 1. Purpose and stance

Security is a **platform kernel** concern, not an app feature. Every experience app (customer, pharmacy, vendor, doctor, lab, phlebotomist, delivery, admin) authenticates to the same identity service and is authorized by the same RBAC + scope + consent engine.

**Principles:**

1. **Health data is not marketplace data.** Clinical payloads, Rx images, KYC documents, and consult media have stricter access, encryption, retention, and audit than SKUs and carts ([01](01_PRODUCT_VISION.md) §3).
2. **Never trust the client** for role, country, price, eligibility, or consent.
3. **Least privilege and deny-by-default** for clinical payload and money write.
3a. **Company vs partner authority.** Platform/company management is exclusively company-controlled. Partner org administration cannot escalate to platform admin, grant company permissions, publish Country Policy Packs, or change global payment/settlement configuration ([86](86_COMPANY_OWNED_ADMIN_AUTHORITY.md)). Never `if role == "admin" then allow everything`.
4. **Auditability by default.** Sensitive mutations and every health-payload read are attributable and immutable in the audit trail.
5. **Do not invent law.** Statutory notification windows, lawful intercept, and certification claims are **LEGAL/COMPLIANCE REVIEW REQUIRED**. This document specifies **engineering controls**, not a legal regime. The platform does **not** claim HIPAA, GDPR, DPDP, or any other certification ([01](01_PRODUCT_VISION.md) §10).
6. **Country Policy Packs** gate channels, MFA methods, recording, wallet, and residency. Empty packs contain technical defaults only.

**ASSUMPTION (A-SEC-01):** Identity, session, device, and consent stores live in the modular monolith in Phase 0–2. Extraction of identity as a separate service is allowed later without changing client contracts ([04](04_APPLICATION_ARCHITECTURE.md) §1).

---

## 2. Trust boundaries

```
  Untrusted clients (RN, Next.js, partner web)
            │  TLS
            ▼
     WAF + API Gateway     ← rate limit, bot, geo, TLS terminate
            │
            ▼
     Authn filter (JWT / session)     Audience + membership required
            │
            ▼
     Modular monolith                  Domain authz + consent re-load
            │
     ┌──────┼────────┬─────────┬──────────┐
     ▼      ▼        ▼        ▼          ▼
    PG    Redis   Objects   Vault     Providers
  (RLS)  (sess)  (KMS)    (secrets)  (PSP, SMS, video)
```

| Boundary | What may cross | What must not |
| --- | --- | --- |
| Public internet → gateway | Authenticated API, public catalog reads, PSP/IdP redirects | Direct DB, Redis, object bucket, admin ports |
| Gateway → API | Authenticated requests; signed webhooks on dedicated routes | Unsigned provider callbacks |
| API → object storage | Short-lived signed URLs after authz | Public ACLs on Rx, KYC, reports, recordings |
| API → PSP | Tokens / payment method ids via adapter | PAN, CVV, raw account numbers |
| Analytics / CRM | Metadata, ids, coarse status | Clinical payload, full KYC images, PAN |
| Support tooling | Masked PII, ticket ids | Rx images by default (**OD-RBAC-02**) |

---

## 3. Authentication by persona

Aligned with [03](03_USER_ROLES_AND_PERMISSIONS.md) §7. Country packs enable channels; they do not invent a global “OTP is legal everywhere” claim.

| Persona | Primary factor | MFA / step-up | Social | Device bind |
| --- | --- | --- | --- | --- |
| Customer | Phone OTP and/or email OTP | Step-up for wallet spend, refund request, payout-profile change, consent export | Optional, country-gated (**OD-CUS-05**) | Recommended; not blocking browse |
| Professional (doctor, pharmacist, lab, vendor admin) | Email + password (or org SSO later) | **Required** (TOTP or WebAuthn) | No | Required for production |
| Riders / phlebotomists | Phone OTP + device bind | Device PIN / biometric (client) + server session | No | **Required**; one primary device + limited extras |
| Admins (platform / country / finance / compliance) | Email + password | **Required** TOTP or WebAuthn; impersonation extra | No | Required; admin CIDR optional |

**OPEN DECISION (OD-SEC-01):** Passwordless (passkeys) as primary for professionals in Phase 1 vs TOTP-first. Recommendation: **TOTP required at professional launch**; WebAuthn/passkeys as additional factor in the same phase if schedule allows.

**OPEN DECISION (OD-SEC-02):** Customer password accounts vs OTP-only. Recommendation: **OTP-first** for customers; optional password only if a country pack needs it for account recovery diversity.

### 3.1 OTP controls

| Control | Rule |
| --- | --- |
| Rate limit | Per destination identifier, device, IP, and country. Cooldown on resend |
| Attempt lock | Lock after N failures; exponential backoff; support unlock with reason |
| TTL | Short; single use |
| Channel | SMS / email / WhatsApp only if pack enables (**OD-CRM-02**). Never assume one messenger globally |
| Content | No clinical content in OTP SMS. No provider debug in UI |
| Bombing | Shared fraud signals; silent fail on unknown high-velocity destinations |

**RISK (R-SEC-01):** OTP bombing and SIM swap. Mitigations: rate limits, device reputation, step-up on new device for wallet, optional cooling period for payout-profile changes.

### 3.2 Password policy (professionals and admins)

- Server-side hashing with a modern memory-hard algorithm.
- Breach-list check where legally permitted — **LEGAL/COMPLIANCE REVIEW REQUIRED** for processing those lists.
- No composition theater that encourages reuse; block known-breached and trivial passwords.
- Rotation **not** forced on a calendar unless a country pack or incident requires it. Rotation **is** forced on suspected compromise.

### 3.3 Step-up authentication

Step-up is required (re-verify recent factor) for:

- Wallet debit / top-up (when wallet is on — **OD-PAY-05**)
- Customer-initiated refund above a pack threshold
- Adding or changing payout accounts
- Enabling consult recording (if pack ever allows recording)
- Consent export / bulk health download (v1: no bulk download — [16](16_HEALTH_RECORD.md))
- Admin break-glass and impersonation

---

## 4. Sessions, tokens, and devices

### 4.1 Token model

**Decision: short-lived access JWT + rotating refresh tokens, device-bound.**

| Token | Lifetime (directional) | Storage | Contains |
| --- | --- | --- | --- |
| Access JWT | Minutes (recommend 10–15) | Memory on mobile; memory or httpOnly cookie on web | `sub`, `aud`, `sid`, `membership_id`, `country_id` (selected), `roles[]` (hint only), `device_id` |
| Refresh | Days, idle timeout shorter for admins | Secure storage / httpOnly cookie; **hashed** at rest in DB | Opaque id; family id; device id |

**Rules:**

1. Server **never** trusts `roles[]` alone for health data or money write. It reloads membership, grants, and consent ([03](03_USER_ROLES_AND_PERMISSIONS.md) §8).
2. **Audience (`aud`)** is per client family: `customer`, `partner`, `admin`. Customer tokens cannot call finance refund or impersonation APIs (**R-PAY-08**).
3. Refresh rotation: each use issues a new refresh and **revokes** the previous. Reuse of a retired refresh **revokes the entire family** (theft signal).
4. Access tokens are not stored in localStorage on web.
5. JWT signing keys live in KMS/vault; rotation with dual-key accept window.

**OPEN DECISION (OD-SEC-03):** Absolute refresh lifetime vs sliding. Recommendation: **sliding idle** (e.g. 7–14 days customer / partner; 8–12 hours admin) with a hard cap; force re-auth after privilege change.

### 4.2 Session object

| Field (logical) | Meaning |
| --- | --- |
| `session_id` | Bound into JWT `sid` |
| `user_id` / `device_id` | |
| `client_family` | customer / partner / admin |
| `membership_id` | Active role context |
| `country_id` | Selected operating country |
| `created_at` / `last_seen_at` / `expires_at` | |
| `ip_hash` / `ua_hash` | Anomaly signals; not displayed as location claims |
| `mfa_level` | `otp` / `pwd` / `totp` / `webauthn` / `step_up` |
| `status` | `ACTIVE` / `REVOKED` / `EXPIRED` / `STOLEN` |

Logout, password change, MFA reset, and “sign out all devices” revoke sessions. Privilege-reducing role changes invalidate access tokens immediately (short TTL + denylist of `sid` in Redis until expiry).

### 4.3 Device management

| Capability | Who |
| --- | --- |
| List devices / sessions | Self; admin with `user:read` (masked) |
| Revoke one / all | Self; support with reason (no payload) |
| Bind | Hash of device public key or platform attestation where available |
| Rider / phlebotomist | Bind required before job offer (**OD-PHE-04** attestation vs bind-only) |

**OPEN DECISION (OD-PHE-04):** Hardware attestation vs bind-only for field apps. Recommendation: **bind-only in Phase 2**; attestation when store/OS APIs and ops burden allow.

Lost-device flow: OTP to registered identifier + session revoke. For professionals, MFA recovery is dual-control or time-boxed backup codes stored hashed.

**RISK (R-SEC-02):** Privilege confusion if admin APIs accept customer tokens. Mitigation: `aud` + separate gateway routes + membership selection required.

---

## 5. Authorization (RBAC + scope + consent)

See [03](03_USER_ROLES_AND_PERMISSIONS.md) for the permission catalog. Security architecture adds **enforcement points**.

| Layer | Checks |
| --- | --- |
| Gateway | Authn, `aud`, rate limit, WAF. **Not** fine-grained health authz |
| API / IAM module | Membership exists, not suspended, country matches resource |
| Domain service | `{resource}:{action}` + scope (`platform` / `country` / `organization` / `location` / `self` / `consented`) |
| Health module | Active `ConsentGrant` purpose match; **reload**, do not cache grants longer than seconds |
| Money module | SoD, dual control thresholds, idempotency |

**Rules:**

- Fine-grained checks live in **domain services**, not only the gateway.
- High-risk admin actions require `X-Reason` (or equivalent) and ticket id.
- Impersonation: `user:impersonate` — `super_admin` only, time-boxed, audited, watermarked UI, no health payload unless break-glass.
- Custom org roles (Phase 8+) cannot exceed parent system role.

SoD pairs from 03 §10 remain security-invariant: KYC submit vs approve; result enter vs report sign; refund vs payout approve; settlement execute vs period close.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Local SoD for pharmacies and labs.

---

## 6. Healthcare data special protection

### 6.1 Classification

| Class | Examples | Controls |
| --- | --- | --- |
| Public | Published catalog names, public doctor directory fields allowed by pack | CDN cache OK |
| Customer PII | Name, phone, address | TLS, at-rest encryption, masked support views |
| KYC / identity documents | ID images, liveness | Field-level encryption; separate key; access logged |
| Health artifact payload | Rx images, reports, consult notes | Field-level / application-level encryption; consent; payload vs metadata split ([16](16_HEALTH_RECORD.md) §8) |
| Highly sensitive health | Pack-defined; do not invent special legal categories | Same as health + tighter grant scope |
| Payment instrument | PSP tokens only | No PAN/CVV on platform (**R-PAY-06**) |
| Video recording | Only if pack + consent | Default **off**; separate bucket and key |

**NEVER** put full clinical payload in CRM, tickets, affiliate dashboards, rider apps, search documents, or analytics warehouses by default.

### 6.2 Consent

Consent is an authorization input, not a banner click. Model: `ConsentGrant` in [16](16_HEALTH_RECORD.md).

| Rule | Detail |
| --- | --- |
| Booking a doctor | Does **not** open historic labs or other doctors’ notes (**A-EHR-02**) |
| Pharmacy Rx verify | Purpose `pharmacy_dispense`, those images, location-scoped |
| Share-with-doctor | Explicit grant, artifact-scoped |
| Revoke | Immediate for **new** reads; v1 server-side fetch only, no bulk download |
| Support | **No** clinical grant. Tickets use ids |
| Recording | Requires pack `video.recording.allowed` **and** grant. Default **false**. Consult continues if recording denied |

**OPEN DECISION (OD-EHR-03):** Default grant TTL. Recommendation: encounter + short tail for treatment; explicit longer grant for GP share.

### 6.3 Break-glass

Aligned with 03 §6 and 16 §6.4.

| Control | Requirement |
| --- | --- |
| Who | `super_admin` only in v1 unless pack lists others (**OD-EHR-06**) |
| Inputs | Reason code, ticket id, time box, patient / artifact scope |
| Effect | Creates audited `ConsentGrant` purpose `break_glass` |
| After | Mandatory post-review; SIEM alert |
| Patient notify | When the country pack requires it — **LEGAL/COMPLIANCE REVIEW REQUIRED**; do not assume a global duty |

Clinical payload access by non-clinicians remains **deny by default**.

### 6.4 Object access

- Private buckets; block public ACLs.
- Application issues **short-lived signed URLs** after authz + consent.
- Rx images: no public CDN cache; no long-lived client cache of clinical bytes ([28](28_PERFORMANCE_ARCHITECTURE.md)).
- Malware scan on upload (Rx, KYC, reports) before processing.
- MIME allow-list; strip active content from PDFs where feasible.

### 6.5 Partner KYC documents

- Separate CMK from catalog images ([36](36_PARTNER_ONBOARDING_ECOSYSTEM.md) §19).
- `partner_document:download` + reason; every GET in `kyc_payload_read`.
- Org isolation: org A cannot read org B KYC.
- Support **no** KYC download by default.
- Reviewer scope: assigned country + allowed PartnerTypes.
- Applicant sees own files; not reviewer internal notes if pack hides them.

---

## 7. Encryption and key management

| Layer | Control |
| --- | --- |
| In transit | TLS 1.2+ (prefer 1.3) on all public and private service links. HSTS on web. No mixed content |
| At rest (disks / buckets / backups) | Cloud KMS-backed volume and object encryption |
| Field-level / application | Health payloads, KYC blobs, national-id fields if collected, consult chat bodies |
| Envelope | Per-object or per-artifact DEK wrapped by KMS CMK; rotate CMK with re-wrap, not necessarily re-encrypt immediately |
| DB | Postgres encryption at rest; optional pgcrypto/app encrypt for classified columns |
| Backups | Encrypted; same residency class as source |
| Secrets in motion | Never in logs, traces, or crash reports |

**OPEN DECISION (OD-SEC-04):** Customer-managed keys (CMK hold-your-own) vs cloud-managed CMK. Recommendation: **cloud-managed CMK per environment and data class** in v1; dedicated health CMK separate from catalog CMK.

Key access: domain health service decrypts for authorized reads only. CRM/support roles have **no** decrypt grant.

---

## 8. Secrets management

| Secret class | Store | Rotation |
| --- | --- | --- |
| JWT signing | KMS / vault | Dual-key window |
| PSP webhook secrets | Vault; dual-secret during rotation ([12](12_PAYMENT_PLATFORM.md) §12) | Scheduled + on incident |
| SMS / WhatsApp / email | Vault | Dual credentials |
| Object signing | Short-lived STS / instance role; no long-lived AKIA in apps | Cloud role |
| DB credentials | Vault + IAM auth if offered | Automated |
| Mobile store keys | Separate secrets; limited CI access | Per release train |

**Forbidden:** secrets in git, client bundles, or unencrypted CI logs.

**OPEN DECISION (OD-SEC-05):** HashiCorp Vault vs cloud-native secrets manager (AWS Secrets Manager / GCP Secret Manager). Recommendation: **cloud-native secrets manager in Phase 0**; introduce Vault if multi-cloud or advanced policy is required. See [35](35_OPEN_DECISIONS.md).

---

## 9. API security

Details of resource shape live in [21_API_ARCHITECTURE.md](21_API_ARCHITECTURE.md). Security requirements:

| Control | Rule |
| --- | --- |
| TLS only | Redirect HTTP; no API on cleartext |
| Authn | Bearer access token or cookie session; webhook routes use signature, not user JWT |
| Input | Schema validation; hard size limits especially on Rx/KYC uploads |
| Output | Filter by permission; never leak other-country ids |
| CORS | Explicit origins per app; no `*` with credentials |
| CSRF | Cookie sessions: SameSite + anti-CSRF; mobile bearer not cookie-CSRF-vulnerable |
| Idempotency | All money POSTs ([12](12_PAYMENT_PLATFORM.md) §10) |
| Pagination | Cursor tokens signed/HMAC so clients cannot scan other tenants |
| Versioning | No “debug” endpoints in prod |
| File upload | Authz first; scan; virus quarantine; signed download |

Admin and finance APIs are **not** on the customer hostname if ops can avoid it (separate host or gateway policy).

---

## 10. Rate limiting, bot, and WAF

| Layer | Use |
| --- | --- |
| WAF | OWASP-class injection/L7 flood, geo/IP reputation, known-bad UA. Challenge only on anonymous catalog if needed — do not break native apps |
| Gateway rate limit | Per IP, device, user, and route class |
| Identity routes | Strictest: OTP request, login, password reset |
| Search | Per user/IP to protect OpenSearch |
| Webhooks | Signature fail → drop; volume cap per provider |
| Graph/list APIs | Cost budget on filter cardinality |

OTP, login, and checkout have **independent** budgets so a catalog scrape cannot starve checkout.

**OPEN DECISION (OD-SEC-06):** CDN/WAF vendor (Cloudflare vs cloud WAF). Coupled with CDN choice in [29](29_INFRASTRUCTURE_ARCHITECTURE.md).

---

## 11. Fraud and abuse (platform)

Payment-specific fraud is in [12](12_PAYMENT_PLATFORM.md) §13. Platform fraud adds:

| Signal class | Examples | Action |
| --- | --- | --- |
| Identity | OTP velocity, device reuse, SIM-change heuristics (if available) | Deny / step-up / review |
| Commerce | Multi-account COD abuse, refund velocity, address farms | Hold fulfillment; **OD-PAY-04** |
| Marketplace | Counterfeit listing, stolen catalog images | KYC + listing queue (**OD-VEND-03**) |
| Affiliate | Self-referral, cookie stuffing ([14](14_AFFILIATE_PLATFORM.md)) | Block commission |
| Clinical | Appointment spam, no-show rings | Rate limit book; pack policy — do not invent penalties |
| Logistics | Fake POD, GPS spoof | Photo/OTP; recon COD cash |
| Lab | Chain-of-custody skip attempts | Hard stop on barcode mismatch |

Automated denial and profiling: **LEGAL/COMPLIANCE REVIEW REQUIRED** in the operating country.

Never store raw PAN. Share **device reputation scores**, not health payloads, across fraud consumers.

---

## 12. Audit logs (security)

Audit logs are **not** application debug logs. See [30](30_OBSERVABILITY.md) for the split.

| Attribute | Requirement |
| --- | --- |
| Who | `user_id`, `membership_id`, `session_id`, `device_id`, `impersonator_id?` |
| What | Permission, resource type/id, action, result (allow/deny) |
| Why | Reason / ticket for high-risk |
| Where | `country_id`, `organization_id?` |
| When | Trusted server time |
| Integrity | Append-only store; no update/delete by app roles; separate retention from app logs |
| Health payload reads | Mandatory, including denials ([16](16_HEALTH_RECORD.md) §8) |

Finance journal is a **different** immutable log ([13](13_LEDGER_SETTLEMENT.md)). Do not overload it as a security SIEM.

---

## 13. Backup, residency, and disaster recovery

| Topic | Security rule |
| --- | --- |
| Backups | Encrypted; access logged; tested restores on a schedule |
| Residency | Backup region must satisfy the same country-pin class as production ([18](18_GLOBALIZATION.md) when written). Default one regional cluster; **do not** copy health blobs to a second geography “just in case” |
| RPO / RTO | Directional engineering targets in [29](29_INFRASTRUCTURE_ARCHITECTURE.md); contractual SLAs are **OD-SLA-01** |
| DR fail-over | Runbooks; break-glass for infra remains audited |
| Deletion | Soft-delete ≠ erase. Erase jobs honor legal hold ([16](16_HEALTH_RECORD.md) §9) |

**OPEN DECISION (OD-DR-01):** Numeric RPO/RTO for prod. Recommendation until decided: **RPO ≤ 5 min** (PITR) for OLTP; **RTO hours not minutes** in Phase 1–2 (single region). Multi-region active-active is **out** until a country pack requires it.

---

## 14. Incident response (engineering)

This is a **capability**, not a legal notification statute.

| Severity (ops) | Examples | Immediate engineering action |
| --- | --- | --- |
| SEV-1 | Confirmed health-data exposure; payment double-capture at scale; total auth outage | Contain (revoke keys/sessions, isolate bucket), preserve evidence, incident commander, legal **notify path** |
| SEV-2 | Targeted account takeover; webhook forgery attempt blocked; video platform down | Contain, customer comms as product policy, post-incident |
| SEV-3 | Isolated fraud, elevated error rates | Ticket + patch |

**Playbook families (must exist before launch of that surface):**

1. Credential / JWT signing leak  
2. Health object bucket mis-ACL  
3. Payment webhook replay or double capture  
4. Insider break-glass abuse  
5. Provider outage (PSP, SMS, LiveKit)

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Who must be notified, in what window, in each launch country. Engineering must **record** incident start, contain time, and data-class involved so legal can apply the pack. Do not encode invented hour-counts as if they were law.

---

## 15. PCI and payment security

- Orchestrate licensed PSPs; **no in-house acquiring** (**A-PAY-01**).
- Hosted fields / redirect; PAN never on World Pharma servers if the adapter uses hosted fields.
- SAQ scope minimization is the goal; **do not claim PCI certification** in this blueprint.
- Webhook: signature, timestamp window, event-id uniqueness, fetch-to-confirm on amount increases ([12](12_PAYMENT_PLATFORM.md) §12).

---

## 16. Threat model (STRIDE lite)

Not exhaustive. Living list; revisit when extracting services or adding a country.

| STRIDE | Example threat | Mitigation |
| --- | --- | --- |
| Spoofing | Stolen refresh token; SIM swap; fake rider app | Rotation + reuse detection; device bind; step-up; `aud` |
| Tampering | Client-sent price; barcode swap; webhook body | Server-side price; scan match hard-stop; webhook signature |
| Repudiation | “I did not approve Rx / payout” | Immutable audit + ledger; signed reports per pack (**OD-LAB-08**) |
| Information disclosure | Support reads Rx; analytics warehouse dumps reports; signed URL leak | OD-RBAC-02; metadata-only warehouse; short-lived URLs; field-level encrypt |
| Denial of service | OTP flood; search flood; video room spam | Rate limits; WAF; consult participant cap (**OD-VID-03**) |
| Elevation of privilege | Customer JWT on admin API; doctor reads all EHRs; vendor sees other vendor stock | `aud`; consent reload; org isolation; RLS |

Abuse cases to keep in the model: OTP bombing, fake POD, sample chain skip, marketplace counterfeit medicine, affiliate self-referral, break-glass without ticket.

---

## 17. Secure SDLC (summary)

Full process: [32_DEVOPS_CICD.md](32_DEVOPS_CICD.md) and [31_TESTING_STRATEGY.md](31_TESTING_STRATEGY.md).

- Dependency scanning, secret scanning, SAST on PR  
- Container image scan before prod  
- Threat-model delta on modules that touch health, money, or identity  
- No PHI in lower environments ([31](31_TESTING_STRATEGY.md))

---

## 18. Country Policy Pack keys (security-related)

Illustrative — values after legal review, not invented here:

| Key | Purpose |
| --- | --- |
| `auth.social.enabled` / `providers[]` | OD-CUS-05 |
| `auth.mfa.professional_required` | Default true |
| `auth.step_up.wallet` | |
| `health.break_glass.notify_patient` | After legal |
| `health.residency` | Pin / forbid cross-border fetch |
| `video.recording.allowed` | **false** until legal + product |
| `payments.wallet.enabled` | OD-PAY-05 |
| `privacy.deletion_process` | Capability hook only |

---

## 19. Risks (this document)

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-SEC-01 | OTP bombing / SIM swap | Rate limits, device bind, step-up on new device for money |
| R-SEC-02 | Privilege confusion across `aud` | Separate audiences and routes |
| R-SEC-03 | Refresh token theft | Rotate, reuse → family revoke, device bind |
| R-SEC-04 | Health data in logs/traces | Scrubbers; payload never in default logs ([30](30_OBSERVABILITY.md)) |
| R-SEC-05 | Break-glass without audit | Forced grant + ticket + time box + SIEM |
| R-SEC-06 | PCI scope creep | Hosted fields; adapter isolation |
| R-SEC-07 | Backup copied off-residency | Backup region = production class |
| R-SEC-08 | WhatsApp/SMS as shadow clinical channel | No results body in unsecured SMS if pack forbids ([09](09_LAB_PLATFORM.md)) |

Register duplicates and program-level risks: [34_RISK_REGISTER.md](34_RISK_REGISTER.md).

---

## 20. Assumptions

| ID | Statement |
| --- | --- |
| A-SEC-01 | Identity lives in the modular monolith first |
| A-SEC-02 | PSP holds PAN; platform stores tokens only |
| A-SEC-03 | Recording default off; consult proceeds without recording |
| A-SEC-04 | Lower environments use synthetic data only |
| A-SEC-05 | This document is not a certification or legal opinion |

---

## 21. Open decisions (this document)

| ID | Question | Recommendation until decided |
| --- | --- | --- |
| OD-SEC-01 | Passkeys vs TOTP-first for professionals | TOTP required; passkeys additive |
| OD-SEC-02 | Customer password vs OTP-only | OTP-first |
| OD-SEC-03 | Refresh sliding vs absolute | Sliding idle + hard cap; short admin idle |
| OD-SEC-04 | CMK ownership model | Cloud-managed CMK per class |
| OD-SEC-05 | Vault vs cloud secrets manager | Cloud-native in Phase 0 |
| OD-SEC-06 | WAF/CDN vendor | See OD-CDN-01 / [29](29_INFRASTRUCTURE_ARCHITECTURE.md) |
| OD-DR-01 | Numeric RPO/RTO | PITR ≤ 5 min; single-region RTO in hours for early phases |

Also: OD-RBAC-*, OD-EHR-03/05/06, OD-PHE-04, OD-CUS-05, OD-SLA-01 — catalogued in [35](35_OPEN_DECISIONS.md).
