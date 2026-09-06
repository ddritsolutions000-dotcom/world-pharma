# Sprint 109 — Production APM + Monitoring + Alerting Activation Readiness

**Status:** COMPLETE (software readiness)  
**Real APM provider selected:** **NO**  
**Production APM enabled:** **NO**  
**Real monitoring provider selected:** **NO**  
**Production monitoring enabled:** **NO**  
**Real alerting destination configured:** **NO**  
**Production alerting enabled:** **NO**  
**Health/readiness checks:** **PASS** (software/sandbox)  
**Sensitive log redaction:** **PASS**  
**Lifecycle:** `NOT_SELECTED` / `EXTERNAL_GATED`  
**Primary blocker:** `NO_PRODUCTION_APM_PROVIDER`  
**Composes:** S75/S84/S97 + S87/S100/S101 (+ S108 dependency awareness)  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Anti-duplication

**Reused (not recreated):**

- `observability-first-onboarding.ts` (S75/S84/S97)
- `production-observability-requirements.ts`
- Existing `/health`, `/metrics`, correlation headers, P0–P3 alert taxonomy
- Existing Production Launch Control rails (`MONITORING_APM` / alerting)
- Existing Admin Sprint 97 triad cards

**S109 adds only:** compose layer + Admin Sprint 109 card + API route + tests/docs.

---

## Critical boundaries

**In-process `/metrics` ≠ production APM**  
**Sandbox structured logs ≠ production monitoring**  
**Software alert definitions ≠ production pager**  
**NOT_SELECTED ≠ provider down**  
**Liveness ≠ production readiness**  
**No invented Datadog/New Relic/Sentry/Grafana/CloudWatch**

---

## Architecture reused

| Plane | Role |
|-------|------|
| S75 / S84 | Observability foundation |
| S97 | APM/monitoring/alerting first-onboarding |
| S87 | Production Launch Control |
| S100 / S101 | Provider Activation + foundation |
| S109 | Real-activation compose (`observability-real-activation-first-onboarding.ts`) |

Admin: Sprint **109** card on `/provider-activation` (above Sprint 97 triad).  
API: `GET /api/v1/admin/control-plane/production-observability-real-activation-onboarding` (`policy:read`).

---

## Provider lifecycle

`NOT_SELECTED` → `CONFIGURATION_REQUIRED` → `CREDENTIALS_REQUIRED` → `VERIFICATION_REQUIRED` → `APPROVAL_REQUIRED` → `READY_FOR_ACTIVATION` → `ENABLED` / `DISABLED` / `EXTERNAL_GATED`

Rails: APM · MONITORING · ALERTING — all initially **NOT_SELECTED** / **EXTERNAL_GATED**.

---

## Alert lifecycle (software)

`TRIGGERED` → `ACKNOWLEDGED` → `RESOLVED` (+ `SUPPRESSED`)  
Severities: **P0 / P1 / P2 / P3**  
Deduplication: yes · Production pager: **EXTERNAL_GATED**

---

## Exact unresolved blockers

Umbrella (existing):

- `NO_PRODUCTION_APM_PROVIDER`
- `NO_PRODUCTION_MONITORING_PROVIDER` (= `NO_PRODUCTION_MONITORING`)
- `NO_PRODUCTION_ALERTING_PROVIDER` (= `NO_PRODUCTION_ALERTING`)

Granular (existing + S109 wording aliases):

- `APM_PROVIDER_CONFIGURATION_REQUIRED` (= `APM_PROVIDER_NOT_SELECTED`)
- `APM_CREDENTIALS_REQUIRED` (= `APM_CREDENTIAL_REFERENCE_MISSING`)
- `APM_ENDPOINT_REFERENCE_MISSING`
- `APM_ENVIRONMENT_CONFIGURATION_REQUIRED`
- `MONITORING_PROVIDER_CONFIGURATION_REQUIRED` (= `MONITORING_CONFIGURATION_MISSING`)
- `MONITORING_CREDENTIALS_REQUIRED`
- `MONITORING_ENVIRONMENT_CONFIGURATION_REQUIRED`
- `ALERTING_PROVIDER_CONFIGURATION_REQUIRED` (= `ALERTING_CONFIGURATION_MISSING`)
- `ALERTING_CREDENTIALS_REQUIRED`
- `ALERT_DESTINATION_CONFIGURATION_REQUIRED` (= `ALERT_DESTINATION_REFERENCE_MISSING`)
- `ALERT_ESCALATION_POLICY_REQUIRED`
- `ALERT_THRESHOLD_BASELINE_REQUIRED`
- `MONITORING_DEPENDENCY_GATED`

Plus S101 foundation gates where applicable.

---

## What is sandbox / software-ready

- In-process `/metrics`
- Structured logs + correlation IDs
- Liveness/readiness software checks
- Sensitive log redaction contracts
- Software alert definitions (no real pager)

## What remains externally gated

- Real APM vendor + credentials + endpoint
- Production monitoring backend
- Alert destinations + escalation + production baselines
- On-call / pager integration

---

## Evidence

- Unit: `apps/api/src/ops/s109-observability-real-activation.spec.ts` — **4/4**; related S75/S84/S97/S87/S100/S101/S108 compose **53/53**
- Playwright: `apps/web-customer/src/__tests__/s109-observability.spec.ts` — **3/3**
- Regression Playwright: S97 + S108 + S87 — **8/8**
- Screenshots: `apps/test-results/s109-observability-shots/` (**9**)
- Status JSON: `apps/test-results/s109-observability/final-observability-status.json`
- Master Index: **#407**

**STOP** — do not invent an external monitoring provider or claim production monitoring from sandbox telemetry.
