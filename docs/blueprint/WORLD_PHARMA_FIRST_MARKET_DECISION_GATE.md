# WORLD_PHARMA — First Market Decision Gate (OD-COUNTRY-01)

**Document type:** Founder decision gate — **no feature development**  
**Master backlog:** **#461**  
**Baseline:** Public Open Readiness **#460**  
**Related:** [WORLD_PHARMA_FIRST_MARKET_DECISION.md](WORLD_PHARMA_FIRST_MARKET_DECISION.md) · [WORLD_PHARMA_FIRST_MARKET_EXECUTION_PLAN.md](WORLD_PHARMA_FIRST_MARKET_EXECUTION_PLAN.md) · S158 launch control  

| Status flag | Value |
| --- | --- |
| **SOFTWARE_COMPLETE** | **YES** |
| **ACTIONABLE_CODING_BACKLOG** | **ZERO** |
| **FIRST_MARKET_DECISION** | **REQUIRED** |
| **PUBLIC_OPEN_READY** | **NO** |
| **CAN_PRODUCTION_LAUNCH** | **NO** |

**Not legal advice.** This document does **not** select a country, invent a MoR entity, invent licences, or enable providers.

**Hard rule:** The repository must **NOT** choose a production market automatically.

---

## 1. FIRST CUSTOMER MARKET

| Field | Value |
| --- | --- |
| **Selected market** | **NOT_SELECTED** |
| **Decision ID** | **OD-COUNTRY-01** |
| **Existing candidate markets** | **IN** · **AE** · **US** |
| **Technical placeholder (not a candidate)** | **XX** |

Engineering configures a published `PolicyPack` + `CountryProductionLifecycle` **only after** humans fill the Founder Decision Block (§8). Until then, production launch remains blocked.

---

## 2. FULFILLMENT / SOURCE MARKET

World-Pharma is global. Software preserves:

**Customer country ≠ fulfillment / source country**

| Evidence | Value |
| --- | --- |
| Carrier onboarding | `source_country_equals_customer_country: false` |
| Logistics / pharmacy activation notes | `customer_market_may_differ_from_source` / `…_vendor_source` = **true** |

**Do not assume India is the source country.** Fulfillment/source market is an independent founder/ops choice (may equal or differ from the first customer market). Claiming cross-border medicine operations requires separate legal approval (§5).

| Field | Value |
| --- | --- |
| **FULFILLMENT_SOURCE_MARKET** | **TBD** (founder) |

---

## 3. DAY-1 SCOPE

| Scope | Contents |
| --- | --- |
| **A** | Medicine marketplace + pharmacy fulfillment + customer account + orders + payment + delivery |
| **B** | Scope A + doctor + lab + imaging + telemedicine |

**Recommendation (not a decision):** start production pilot with **Scope A**, unless a human explicitly selects **Scope B**.

Software for both scopes exists in sandbox; Scope B adds clinical provider dependencies (§7).

| Field | Value |
| --- | --- |
| **DAY_1_SCOPE** | **UNSELECTED** (A / B) |

---

## 4. MoR REQUIREMENT

| Item | Status |
| --- | --- |
| Decision | **OD-PAY-01** — founder / legal / finance |
| Software support | Opaque `ledger.legal_entity_id` / accounting currency on PolicyPack; LegalEntity Admin |
| This document | Does **not** invent a legal entity or MoR model |

| Field | Value |
| --- | --- |
| **MOR_ENTITY** | **TBD** |

---

## 5. CROSS-BORDER MEDICINE

| Dimension | Status |
| --- | --- |
| Software capability (customer ≠ source) | **PRESERVED** |
| Pack `shipping.international` on XX empty + IN/AE/US demos | **false** (as implemented) |
| Production claim / Day-1 ops approval | **EXTERNAL** — LEGAL/REGULATORY REVIEW REQUIRED |
| Production-ready cross-border medicine | **NO** |

| Field | Value |
| --- | --- |
| **CROSS_BORDER_DAY_1** | **UNSELECTED** (YES / NO) |

---

## 6. REQUIRED REAL PROVIDERS AFTER MARKET SELECTION (Scope A minimum)

After OD-COUNTRY-01 is filled, these must be contracted/configured (software rails exist; live = EXTERNAL):

1. Infrastructure / cloud account  
2. Secrets manager  
3. Production database  
4. Backup / PITR / DR  
5. Private storage / KMS / malware scanning  
6. Deployment / CI-CD  
7. Domain / TLS + WAF + APM / monitoring  
8. PSP (live; mock forbidden in production)  
9. OTP / SMS (live; console forbidden in production)  
10. KYC / KYB  
11. Pharmacy / vendor network (≥1 licensed, commercially approved)  
12. Carrier (live; mock forbidden in production)  
13. Affiliate bank payout — **only if** Day-1 affiliate payout = YES  

---

## 7. SCOPE B ADDITIONAL PROVIDERS

Only if **DAY_1_SCOPE = B**:

- eRx network / clinical transmission  
- Telemedicine / live video  
- Lab network (HL7/FHIR if contracted)  
- PACS / DICOM  

Plus doctor / lab / imaging partner onboarding and LEGAL/REGULATORY REVIEW REQUIRED for clinical claims.

---

## 8. FOUNDER DECISION BLOCK

Fill in writing (outside the repo or via recorded decision). **Do not invent values.**

```
OD-COUNTRY-01:                    UNSELECTED
FIRST_CUSTOMER_MARKET:            UNSELECTED   # IN | AE | US | other*
FULFILLMENT_SOURCE_MARKET:        TBD          # may equal or differ from customer market
DAY_1_SCOPE:                      UNSELECTED   # A | B
CROSS_BORDER_DAY_1:               UNSELECTED   # YES | NO
MOR_ENTITY:                       TBD
AFFILIATE_PAYOUT_DAY_1:           UNSELECTED   # YES | NO
```

\* “other” requires creating a new Country + PolicyPack — not auto-invented by software.

---

## 9. NEXT EXECUTION ORDER (after founder fills §8)

1. Market (OD-COUNTRY-01)  
2. MoR / legal  
3. Licences  
4. Production infrastructure / cloud  
5. Secrets manager  
6. Production DB  
7. Backup / PITR / DR  
8. Private storage / KMS / malware  
9. Deployment / CI-CD  
10. Domain / TLS / WAF / APM  
11. PSP  
12. OTP / SMS  
13. KYC / KYB  
14. Pharmacy network  
15. Carrier  
16. Optional clinical providers (if Scope B)  
17. Affiliate payout (if enabled)  
18. Controlled pilot  
19. Pentest / security evidence  
20. Final launch approval → only then reconsider `CAN_PRODUCTION_LAUNCH`

---

## 10. STATUS

| Flag | Value |
| --- | --- |
| SOFTWARE_COMPLETE | **YES** |
| ACTIONABLE_CODING_BACKLOG | **ZERO** |
| FIRST_MARKET_DECISION | **REQUIRED** |
| PUBLIC_OPEN_READY | **NO** |
| CAN_PRODUCTION_LAUNCH | **NO** |

---

## Appendix — Policy packs as currently implemented

Authority: `apps/api/src/policy/empty-pack.ts`, `apps/api/src/dev/sandbox-policy.ts`, `india-policy.ts`, `uae-policy.ts`, `us-policy.ts`.  
IN / AE / US are **demo fixtures** (dev seed; not production market approval). They extend the sandbox document. XX empty pack is the fail-closed technical scaffold.

### XX — technical placeholder (not a launch candidate)

| Field | Implemented value |
| --- | --- |
| ISO | `XX` / `XXX` |
| Currency | `XXX` |
| Timezone | `UTC` |
| Locale | `en` |
| Tax | `tax_profile_id: null` |
| Payments | disabled; empty methods/gateways |
| Shipping | domestic/international/rx/controlled/cold_chain = **false** |
| Services / healthcare | all off (fail-closed) |
| Role | Always-seeded technical country; **not** a first-market candidate |

### IN — India demo (`india-policy.ts`)

| Field | Implemented value |
| --- | --- |
| ISO | `IN` / `IND` |
| Name | en: India; hi: भारत |
| Currency | `INR` |
| Timezone | `Asia/Kolkata` |
| Locale | default `en-IN`; locales `en-IN`, `hi` |
| Phone | `+91` |
| Tax | opaque `IN_GST_DEMO` |
| Payments | methods `UPI`, `CARD`, `COD`; gateway `MOCK_PRIMARY`; currencies `INR` |
| Shipping (via sandbox) | domestic + rx **true**; international / controlled / cold_chain **false** |
| Kind | **Demo fixture only** |

### AE — UAE demo (`uae-policy.ts`)

| Field | Implemented value |
| --- | --- |
| ISO | `AE` / `ARE` |
| Name | en: United Arab Emirates; ar: الإمارات |
| Currency | `AED` |
| Timezone | `Asia/Dubai` |
| Locale | default `en-AE`; locales `en-AE`, `ar` |
| Phone | `+971` |
| Tax | opaque `AE_VAT_DEMO` |
| Payments | methods `CARD`, `COD`; gateway `MOCK_PRIMARY`; currencies `AED` |
| Shipping (via sandbox) | same as IN demo (international **false**) |
| Kind | **Demo fixture only** |

### US — United States demo (`us-policy.ts`)

| Field | Implemented value |
| --- | --- |
| ISO | `US` / `USA` |
| Name | en: United States |
| Currency | `USD` |
| Timezone | default `America/New_York`; allowed also Chicago, Los Angeles |
| Locale | `en-US` |
| Phone | `+1` |
| Tax | opaque `US_SALES_TAX_DEMO` |
| Payments | methods `CARD`, `WALLET`; gateway `MOCK_PRIMARY`; currencies `USD` |
| Shipping (via sandbox) | same pattern (international **false**) |
| Kind | **Demo fixture only** |

**Shared demo inheritance (sandbox):** marketplace/pharmacy/teleconsult/lab/imaging services on; `rx_dispense_enabled` remains **false**; production lifecycle defaults **CONFIGURED** (not ACTIVE).

---

**OD-COUNTRY-01 = HUMAN DECISION REQUIRED — no country chosen by this gate.**
