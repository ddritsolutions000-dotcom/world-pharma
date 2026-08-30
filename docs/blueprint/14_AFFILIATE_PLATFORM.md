# 14 — Affiliate Platform

**Status:** Blueprint  
**Audience:** Growth, product, architecture, finance, compliance, fraud  
**Requirement IDs:** REQ-AFF  
**Journeys:** **J17** (affiliate commission); conversion sources J01, J03, J05, J09, membership  
**Related:** [Vision](01_PRODUCT_VISION.md) · [Business](02_BUSINESS_ARCHITECTURE.md) · [Roles](03_USER_ROLES_AND_PERMISSIONS.md) · [Application](04_APPLICATION_ARCHITECTURE.md) · [Payment](12_PAYMENT_PLATFORM.md) · [Ledger](13_LEDGER_SETTLEMENT.md) · [CRM](15_CRM_PLATFORM.md) · [Party/KYC](19_COMPLIANCE_FRAMEWORK.md) · [Notifications](23_NOTIFICATION_ARCHITECTURE.md) · [Security](27_SECURITY_ARCHITECTURE.md) · [Open decisions](35_OPEN_DECISIONS.md) · [Partner onboarding](36_PARTNER_ONBOARDING_ECOSYSTEM.md)

Affiliate **signup/KYC** is `PartnerType=AFFILIATE` in [36](36_PARTNER_ONBOARDING_ECOSYSTEM.md). Clinical categories remain default **OFF**.

---

## 1. Purpose

The affiliate platform attributes **eligible** conversions to approved partners and accrues **configurable** commissions through pending → approved / reversed → settlement.

It is a **growth and ledger-feeding** module, not a payment executor. Payout is [13](13_LEDGER_SETTLEMENT.md). Customer checkout is [12](12_PAYMENT_PLATFORM.md).

**LEGAL/COMPLIANCE REVIEW REQUIRED (inducement):** Referral fees, kickbacks, and professional fee-splitting for **clinical** services (prescription medicines, doctor consults, lab tests) are restricted or prohibited in many jurisdictions. This blueprint **does not** assert that any category is legal. **Every earnable category is country-configurable and defaults to OFF for clinical categories until legal review enables it.**

---

## 2. Boundaries

| Owns | Does not own |
| --- | --- |
| Affiliate registration, KYC case linkage, approval | KYC vendor adapters (compliance/party) |
| Referral links, codes, campaigns | Payment capture |
| Tracking, attribution, conversion records | Order/booking mutation |
| Commission state machine and rules | Journal posting (emits events; ledger posts) |
| Affiliate fraud signals (self-referral, stuffing, stacking) | Full payment fraud (12) |
| Affiliate dashboard metrics | Customer 360 CRM campaigns (may share conversion events) |

---

## 3. Participants and identity

| Concept | Meaning |
| --- | --- |
| Affiliate person | Role `affiliate` ([03](03_USER_ROLES_AND_PERMISSIONS.md)), scope `self` |
| Affiliate org | `AFFILIATE_ORG` ([02](02_BUSINESS_ARCHITECTURE.md) §8); agency with staff |
| Customer | Referred shopper/patient; **must not** be the same party in a self-referral |

**OPEN DECISION (OD-AFF-06):** Individual-only v1 vs agencies. Recommendation: **individuals in v1**; org hierarchy as a Phase later without changing commission objects (`affiliate_id` remains the earning party).

**RISK:** Staff using personal customer accounts (02 §11). Affiliates who are also employees/doctors/pharmacists require policy: either forbidden dual role in production (**OD-RBAC-04**) or hard blocks on self-attribution.

---

## 4. Registration, KYC, approval

State machine (AffiliateAccount):

| Status | Meaning |
| --- | --- |
| `APPLIED` | Submitted profile, tax/payout profile placeholders |
| `KYC_PENDING` | KYC case open |
| `APPROVED` | Can generate links; cannot earn until payout profile valid |
| `REJECTED` | Terminal or resubmit |
| `SUSPENDED` | Fraud or compliance hold; links resolve but **no new pending commissions** |
| `CLOSED` | No new tracking; existing approved remain for settlement |

Rules:

- KYC submit vs approve cannot be the same user (03 SoD).
- Payout requires KYC approved + payout instrument (PayoutPort).
- Country pack defines required documents. **Do not invent identity-document types as global defaults.**

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Whether healthcare affiliates need extra disclosures (advertising of medicines, “influencer” health claims). Default: **no medicine advertising copy** in platform-generated creatives unless pack allows.

---

## 5. Referral link, code, campaign

| Object | Meaning |
| --- | --- |
| `ReferralCode` | Short human code; unique per program × country (not globally reused across countries if collision risk) |
| `ReferralLink` | Signed URL / deep link (`app` + web) carrying `affiliate_id`, `campaign_id`, `country_id`, `click_id` |
| `Campaign` | Ruleset: eligible categories, rates, window, geo, start/end, creatives |
| `Creative` | Banner/text **templates** from CMS; affiliates do not upload unreviewed medical claims in v1 **ASSUMPTION (A-AFF-01)** |

Deep links: [04](04_APPLICATION_ARCHITECTURE.md) §7. Landing may be catalog, doctor, lab, or membership — only if that category is **enabled for the campaign’s country**.

Inactive campaign or suspended affiliate: link still opens the storefront **without** attaching attribution (or with `attribution_blocked` reason). Do not 404 a medicine page solely because a code is invalid; drop attribution and continue.

---

## 6. Tracking and attribution

### 6.1 Capture points

1. Click / app install / first session with link or code.
2. Account bind: if the customer is logged in (or later signs up), store `AttributionTouch` on the customer.
3. Checkout: CheckoutSession stores `attribution_id` if still in window and eligible.
4. Conversion: when `CheckoutSessionPaid` (or COD confirmed per pack) fires for an **eligible** child document.

### 6.2 AttributionTouch (logical)

| Field | Meaning |
| --- | --- |
| `touch_id` / `click_id` | Unique |
| `affiliate_id` / `campaign_id` | |
| `customer_id?` | When known |
| `device_fingerprint` / `ip_hash` | Fraud, retention-limited |
| `country_id` | Policy |
| `occurred_at` | |
| `channel` | Link, code typed, QR |

**Do not** store raw PAN. Minimize IP retention ([27](27_SECURITY_ARCHITECTURE.md)).

### 6.3 Attribution model

**OPEN DECISION (OD-AFF-01):** Last-click vs first-click vs multi-touch. Recommendation for v1: **last eligible click within window**, excluding self-referral and blocked campaigns.

**OPEN DECISION (OD-AFF-02):** Attribution window per category (e.g. goods vs consult). Config per campaign/country; no global hardcoded days in application code.

**OPEN DECISION (OD-AFF-04):** Cookie/local storage vs first-party logged-in only. Recommendation: **first-party click_id + server-side bind on login**; cookies as a convenience not the source of truth. Cookie stuffing is a fraud control (§10).

If multiple affiliates touch: v1 last-click (if OD-AFF-01 so decided). Do not pay two affiliates for one conversion in v1.

Cross-border: a click in Country A cannot attribute a Country B checkout unless a pack explicitly allows **and** both category rules allow. Default **deny**.

---

## 7. Eligible earnings (country-configurable)

Possible **conversion types** (all gated):

| Category | Commercial object | Default until legal review |
| --- | --- | --- |
| Medicines (Rx) | Order lines that are Rx | **OFF** |
| Medicines (OTC) / products | Order lines | Country pack |
| Lab tests / packages | Lab booking | **OFF** (clinical) |
| Doctor consults | Appointment | **OFF** (clinical) |
| Membership | Membership purchase | Country pack |
| Other eligible | Explicit allowlist (devices, etc.) | Pack allowlist |

**ALL** of the above are country-configurable because **clinical referral fees may be illegal**.

Engineering: `AffiliateEligibilityPolicy.allows(country, category, catalog_item, campaign)`. If false: conversion may still complete commercially; **no commission object is created**.

**LEGAL/COMPLIANCE REVIEW REQUIRED:** Inducement, kickbacks, advertising of prescription-only medicines, and whether pharmacists/doctors may be affiliates at all.

**OPEN DECISION (OD-AFF-03):** Which clinical categories, if any, may ever pay commission in a given country. Engineering must not enable them in a launch pack without an explicit legal sign-off recorded on the pack.

---

## 8. Commission rules

A `CommissionRule` is versioned. A conversion **snapshots** `rule_version_id` so later rate changes do not rewrite history.

| Dimension | Example |
| --- | --- |
| Category / catalog class | OTC vs device vs membership |
| Percent of platform take-rate vs percent of GMV vs flat | **ASSUMPTION (A-AFF-02):** default **percent of platform take-rate**, not of clinical professional fee, to reduce fee-split risk — still **LEGAL REVIEW** |
| Min/max commission | |
| New customer only | Optional |
| Coupon interaction | **OD-AFF-07** |

Stacking with coupons: if the customer used a coupon **and** affiliate code, policy may deny, reduce, or allow. Fraud pattern: high-value coupon + affiliate on same device.

**OPEN DECISION (OD-AFF-07):** Coupon + affiliate stacking. Recommendation: **deny double dip** when coupon is platform-funded above a threshold; allow when coupon is a public sitewide code.

Rates never applied to **tax** as commission base unless pack says so. Snapshot the **base amount currency** (order or payment) and convert for payout using ledger FX rules — do not drop original currency (12/13).

---

## 9. Conversion and commission state machine

Object: `AffiliateCommission` (one per eligible conversion document, or per eligible line group — **ASSUMPTION (A-AFF-03):** v1 **one commission per paid child document** (order or booking), not per SKU, unless campaign is line-level).

| Status | Meaning |
| --- | --- |
| `PENDING` | Attributed; hold period; **not** a ledger payable (13 §8.6) |
| `APPROVED` | Hold elapsed, conversion still valid → emit `AffiliateCommissionApproved` |
| `REVERSED` | Cancel, refund, fraud, ineligibility discovered |
| `VOID` | Never eligible after review (no approval ever) |
| `LOCKED_FOR_SETTLEMENT` | Reserved in a batch |
| `PAID` | Payout succeeded (informational; ledger is truth) |

**OPEN DECISION (OD-AFF-05):** Hold period before approved. Config per country/category (e.g. align with return window for goods). Consult/lab: hold until refund window in pack, **only if** that category is legally enabled.

J17 happy path: attributed conversion after window → pending → hold → approved → settlement.

Failures: self-referral, coupon stacking fraud, cancellation reverse, clinical inducement block (no object or immediate `VOID`).

Refund (J16) of the attributed document: commission `REVERSED` if still pending or approved unpaid; if already paid, `clawback` via ledger `AR_AFFILIATE` (13). **Do not** leave approved commission on a fully refunded order.

Partial refund: **OD-AFF-08** — pro-rate vs full reverse. Recommendation: **pro-rate on remaining GMV/take-rate** for goods; full reverse if conversion type is a single booking that is cancelled.

**OPEN DECISION (OD-AFF-08):** Partial refund commission math.

---

## 10. Fraud controls

| Pattern | Detection (directional) | Action |
| --- | --- | --- |
| **Self-referral** | Same `user_id`, same device bind, same payout instrument as customer, same KYC identity | Block attribution; suspend on repeat |
| **Cookie stuffing** | Hidden pixels, implausible click rates, click with no engagement, mismatched country | Drop touch; rate-limit; suspend |
| **Cancelled / never fulfilled order** | Order cancel, payment fail, refund | Reverse commission |
| **Multi-account** | Device/payment reuse across “new customers” | Review queue |
| **Fake install** | Attribution without session quality | |
| **Professional circumvention** | Doctor/pharmacist as affiliate referring own patients | Pack may **forbid** those roles as affiliates |

Affiliate fraud shares **device and velocity** signals with payment risk (12) without sharing instrument secrets.

Manual `fraud_hold` by `operations` / `compliance_officer`: freeze pending approvals.

**RISK:** Paying clinical inducement via “marketing” labels. Category gates + legal sign-off on packs.

---

## 11. Payout

- Only `APPROVED` commissions enter `AP_AFFILIATE` (13).
- Settlement cycle: per country × affiliate type (13 §9).
- Affiliate dashboard shows pending vs approved vs paid; **pending is not cash**.
- Failed payout: remain payable; affiliate notified ([23](23_NOTIFICATION_ARCHITECTURE.md)).
- Minimum payout and KYC gates as ledger config.

Affiliate module **does not** call PayoutPort directly. It requests inclusion in the next settlement via events.

---

## 12. Dashboard (affiliate app)

Role `affiliate` ([03](03_USER_ROLES_AND_PERMISSIONS.md)):

| Surface | Content |
| --- | --- |
| Links and codes | Create within campaign limits |
| Campaign list | Eligible categories **for their country** |
| Funnel | Clicks, bound customers, conversions, pending, approved, reversed |
| Earnings | Money in commission currency + payout currency if different; both shown |
| Policy | What they **must not** promote (from pack copy, not invented law in UI as if it were universal) |

No access to referred patients’ clinical artifacts ([16](16_HEALTH_RECORD.md)). Conversion tables show order/booking **ids and commercial totals**, not Rx images or lab results.

---

## 13. Admin

Country admin / growth (permission `campaign` style + affiliate-specific):

- Approve/reject affiliates (KYC still SoD).
- Pause campaigns instantly.
- Recalculate **future** rules only; historical commissions require reversing + new entries, not silent edits.
- Export for finance.

CRM ([15](15_CRM_PLATFORM.md)) may show `referred_by_affiliate_id` on Customer 360 **without** letting support change attribution without an audited tool.

---

## 14. Events

| Event | Consumers |
| --- | --- |
| `AffiliateApproved` | Notifications, CRM |
| `AttributionBound` | Analytics |
| `AffiliateCommissionPending` | Dashboard, analytics; **not** ledger payable |
| `AffiliateCommissionApproved` | Ledger |
| `AffiliateCommissionReversed` | Ledger clawback/reverse |
| `AffiliateSuspended` | Link resolver |

---

## 15. Country Policy Pack keys

| Key | Purpose |
| --- | --- |
| `affiliate.enabled` | Master switch |
| `affiliate.categories[]` | Allowlist (medicines Rx/OTC, products, lab, consult, membership, other) |
| `affiliate.attribution.model` | last/first/multi |
| `affiliate.attribution.window` | Per category |
| `affiliate.hold_days` | Pending → approved |
| `affiliate.roles_forbidden[]` | e.g. doctor, pharmacist |
| `affiliate.advertising.medicines` | Creative policy |

---

## 16. Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-AFF-01 | Illegal clinical inducement | Default OFF clinical categories; legal sign-off on pack |
| R-AFF-02 | Self-referral | Identity/device/payout instrument checks |
| R-AFF-03 | Cookie stuffing | Server-side click_id, engagement heuristics, last-click quality |
| R-AFF-04 | Paying on cancelled orders | Reverse on cancel/refund |
| R-AFF-05 | Silent rate edits on history | Versioned rules + snapshots |
| R-AFF-06 | Affiliate sees health data | Commercial ids only |

---

## 17. Assumptions

| ID | Statement |
| --- | --- |
| A-AFF-01 | v1 creatives are platform templates, not free-form medical claims |
| A-AFF-02 | Prefer commission on platform take-rate, not professional clinical fee |
| A-AFF-03 | v1 one commission per paid child document unless campaign is line-level |
| A-AFF-04 | Affiliate cannot execute payout |

---

## 18. Open decisions

| ID | Question | Recommendation until decided |
| --- | --- | --- |
| OD-AFF-01 | Attribution model | Last eligible click in window |
| OD-AFF-02 | Window per category | Config; no hardcoded global days |
| OD-AFF-03 | Clinical categories ever payable | Default OFF; legal per country |
| OD-AFF-04 | Cookie vs login attribution | Server click_id + login bind; cookie secondary |
| OD-AFF-05 | Hold period | Align goods with return window; bookings with refund window |
| OD-AFF-06 | Individual vs org | Individuals v1 |
| OD-AFF-07 | Coupon stacking | Deny platform-funded high coupon + affiliate double dip |
| OD-AFF-08 | Partial refund math | Pro-rate goods; full reverse cancelled booking |
| OD-AFF-09 | Multi-touch in later phases | Out of v1 |

**LEGAL/COMPLIANCE REVIEW REQUIRED** on inducement, medicine advertising, and affiliate eligibility of licensed clinicians. Do not copy another country’s affiliate program into a new country pack.
