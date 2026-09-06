# Sprint 97 — Production APM + Monitoring + Alerting Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production APM enabled:** **NO**  
**Production monitoring enabled:** **NO**  
**Production alerting enabled:** **NO**  
**Providers:** all `NOT_SELECTED`  
**Lifecycle:** `NOT_SELECTED`  
**Production:** `EXTERNAL_GATED` for all three rails  
**Primary blockers:** `NO_PRODUCTION_APM_PROVIDER` / `NO_PRODUCTION_MONITORING_PROVIDER` / `NO_PRODUCTION_ALERTING_PROVIDER`  
**Foundation:** Sprint 84 + Sprint 75  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundaries

**In-process `/metrics` ≠ production APM**  
**Sandbox structured logs ≠ production monitoring**  
**Software alert definitions ≠ production pager**  
**NOT_SELECTED ≠ provider down**  
**Thresholds require production baseline** (`THRESHOLD_REQUIRES_PRODUCTION_BASELINE`)

---

## Current status

| Rail | Provider | Sandbox | Production | Enabled |
|------|----------|---------|------------|---------|
| APM | `NOT_SELECTED` | `SANDBOX_VERIFIED` (metrics/logs) | `EXTERNAL_GATED` | false |
| Monitoring | `NOT_SELECTED` | `SANDBOX_ONLY` | `EXTERNAL_GATED` | false |
| Alerting | `NOT_SELECTED` | `SANDBOX_ONLY` | `EXTERNAL_GATED` | false |

Force-launch: **false**  
Native Android/iOS: `DEVICE_NOT_AVAILABLE`

---

## Activation lifecycle

`NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED` (+ `DISABLED`, `EXTERNAL_GATED`).

Credential refs alone never return `ENABLED`.

---

## Required external configuration (references)

| Rail | Example keys |
|------|----------------|
| APM | `APM_SECRET_REF`, `APM_ENDPOINT_REF` |
| Monitoring | `MONITORING_SECRET_REF` |
| Alerting | `ALERTING_SECRET_REF`, `ALERT_DESTINATION_REF`, `ALERT_ESCALATION_POLICY_REF` |

---

## Exact production blockers

Umbrella: **`NO_PRODUCTION_APM_PROVIDER`**, **`NO_PRODUCTION_MONITORING_PROVIDER`**, **`NO_PRODUCTION_ALERTING_PROVIDER`**

Granular: `APM_PROVIDER_CONFIGURATION_REQUIRED`, `APM_CREDENTIALS_REQUIRED`, `APM_ENVIRONMENT_CONFIGURATION_REQUIRED`, `MONITORING_PROVIDER_CONFIGURATION_REQUIRED`, `MONITORING_CREDENTIALS_REQUIRED`, `MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED`, `ALERTING_PROVIDER_CONFIGURATION_REQUIRED`, `ALERTING_CREDENTIALS_REQUIRED`, `ALERT_DESTINATION_CONFIGURATION_REQUIRED`, `ALERT_ESCALATION_POLICY_REQUIRED`, `ALERT_THRESHOLD_BASELINE_REQUIRED`

---

## Monitoring coverage (contracts only)

Domains: CUSTOMER · VENDOR_PHARMACY · DOCTOR_CLINICAL · LAB · IMAGING · LOGISTICS · PLATFORM  

No fake live metrics are emitted to an external vendor.

---

## Alerting

P0–P3 taxonomy preserved. Destinations (email / incident / ops channel / pager) remain **EXTERNAL_GATED**. No real alerts sent. No fabricated on-call team.

---

## Security / privacy

Never log: passwords, OTP, tokens, API keys, payment credentials, PHI, clinical payloads, signed URLs, KMS secrets.  
Unauthorized observability APIs → rejected. Customers cannot access Admin Reliability.

---

## Required external approvals

1. APM/monitoring/pager vendor + DPA  
2. Alert destinations + escalation policy  
3. PHI scrubbing attestation for production traces/logs  
4. Retention/residency policy packs  
5. Production traffic baselines for thresholds  
6. Human `PROVIDER_APPROVED_MONITORING_APM` + `APM_LIVE_ENABLED` **after** enablement guard  

---

**PRODUCTION APM ENABLED = NO**  
**PRODUCTION MONITORING ENABLED = NO**  
**PRODUCTION ALERTING ENABLED = NO**  
**CAN_PRODUCTION_LAUNCH = NO**
