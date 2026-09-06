# WORLD_PHARMA — First Market Execution Plan

**Status:** DECISION SUPPORT — does **not** select a country  
**Decision ID:** OD-COUNTRY-01 · **FIRST_MARKET_SELECTION_REQUIRED**  
**Authoritative decision pack:** [WORLD_PHARMA_FIRST_MARKET_DECISION.md](WORLD_PHARMA_FIRST_MARKET_DECISION.md)  
**Founder decision gate (fill §8):** [WORLD_PHARMA_FIRST_MARKET_DECISION_GATE.md](WORLD_PHARMA_FIRST_MARKET_DECISION_GATE.md)  
**Related:** S158 launch control · Phase 0 decision board · empty / IN / AE / US policy packs  

Do **not** invent regulatory approvals. Unknowns are marked **UNKNOWN — EXTERNAL VERIFICATION REQUIRED**.

---

## Decision rule

Software is country-neutral (`XX` technical pack). Humans must name the first production market before licences, MoR jurisdiction, tax, and provider market enablement.

---

## Comparison matrix

| Dimension | India (IN) | UAE (AE) | USA (US) | Technical XX |
| --- | --- | --- | --- | --- |
| Software / policy pack scaffold | Demo pack present (`india-policy`) | Demo pack present (`uae-policy`) | Demo pack present (`us-policy`) | Always seeded empty fail-closed |
| Production lifecycle default | CONFIGURED (not ACTIVE) | CONFIGURED | CONFIGURED | CONFIGURED |
| Customer ≠ fulfillment | Supported | Supported | Supported | Supported |
| Currency / TZ / locale | Configurable via pack | Configurable | Configurable | Placeholder XXX |
| Tax | Opaque profile id (demo) | Opaque | Opaque | null |
| Rx / healthcare flags | Pack-driven fail-closed | Pack-driven | Pack-driven | All false |
| PSP dependency | EXTERNAL + MoR | EXTERNAL + MoR | EXTERNAL + MoR | N/A |
| OTP/SMS | EXTERNAL sender registration | EXTERNAL | EXTERNAL | Console sandbox only |
| KYC/KYB | EXTERNAL | EXTERNAL | EXTERNAL | Sandbox review |
| Carrier | EXTERNAL | EXTERNAL | EXTERNAL | Mock |
| Pharmacy network | Licences **HUMAN/LEGAL** | Licences **HUMAN/LEGAL** | Licences **HUMAN/LEGAL** | None |
| Clinical (doctor/eRx/lab/PACS) | Optional scope; providers EXTERNAL | Same | Same | Off by default |
| Cross-border medicine | LEGAL_GATED | LEGAL_GATED | LEGAL_GATED | international shipping default false |
| MoR decision | **REQUIRED** (OD-PAY-01) | **REQUIRED** | **REQUIRED** | N/A |
| Legal review | **REQUIRED** | **REQUIRED** | **REQUIRED** | N/A |
| Major launch risk | Licence + GST/UPI ops complexity | Free-zone / MoHAP unknowns | State pharmacy / DEA unknowns | Not a real market |

### Unknowns (all candidate markets)

- Exact licence document list → **UNKNOWN — EXTERNAL VERIFICATION REQUIRED**  
- Data residency / controller-processor → **UNKNOWN — EXTERNAL VERIFICATION REQUIRED** (OD-EHR/CMP)  
- Live PSP merchant account → **UNKNOWN — EXTERNAL VERIFICATION REQUIRED**  
- National eRx network (if in scope) → **UNKNOWN — EXTERNAL VERIFICATION REQUIRED**  

---

## Recommended human sequence (after country chosen)

1. Record OD-COUNTRY-01 + MoR (OD-PAY-01)  
2. Publish real PolicyPack (currency, TZ, services, payments, shipping, healthcare)  
3. Contract PSP + OTP + KYC + carrier for that market  
4. Onboard ≥1 licensed pharmacy  
5. Infra: secrets → DB → backup → storage triad → deploy → WAF → APM  
6. Staging E2E with live sandbox providers where available  
7. Controlled pilot → CountryProductionLifecycle ACTIVE  
8. Only then consider `CAN_PRODUCTION_LAUNCH`

---

## Explicit non-actions

- This document does **not** choose India, UAE, USA, or any other market.  
- Engineering must not hardcode the launch country into global core.
