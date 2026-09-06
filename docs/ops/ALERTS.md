# Alert / SLO foundation

Numeric production SLOs are **NOT_YET_DEFINED** (hosting + OD-OBS-01 tracker decisions pending).

## Recommended alert conditions (configuration only)

Map to existing `/metrics` and `/health/ready` signals. Do not page on external-gated provider absence.

| Signal | Suggested condition (draft) | Source |
|--------|-----------------------------|--------|
| API availability | Ready probe failing for N minutes | `GET /health/ready` status |
| HTTP error rate | `http_errors_total` rate high vs `http_requests_total` | `/metrics` |
| Outbox backlog | `outbox_pending` above ops threshold | `/metrics` gauge |
| Dead-letter growth | `outbox_dead_lettered` increasing | `/metrics` + reliability snapshot |
| Queue/outbox failures | `outbox_failed_total` / `outbox_dead_lettered_total` rising | `/metrics` counters |
| Payment failures | `payment_failure_total` rising | `/metrics` |
| Notification failures | `notification_failure_total` rising | `/metrics` |
| Rate-limit storms | `rate_limit_total` / `rate_limit_unavailable_total` | `/metrics` |
| Database unavailable | Ready probe postgres=down | `GET /health/ready` |
| Redis unavailable | Ready probe redis=down | `GET /health/ready` |
| Storage unavailable | Production storage gate blockers | reliability snapshot `infrastructure.storage` |
| Payment / OTP / messaging / carrier unavailable | Existing provider gates | runtime profile + production rails |
| Backup failed | Backup job non-zero / missing metadata | ops catalog + EXTERNAL_GATED pager |
| Malware scanner unavailable | File scanning gate | reliability snapshot `infrastructure.malware_scanning` |

PagerDuty/Datadog/cloud monitoring platforms: **EXTERNAL_GATED** (signals are defined in software; no fake integration).

## Explicit non-alerts

- Missing live PSP / SMS / carrier / KYC / PACS while sandbox mode is expected.
- `live_payment_enabled=false` in sandbox.

## RPO / RTO

Production contractual RPO/RTO: **NOT_YET_DEFINED**. See `docs/ops/BACKUP_RESTORE.md`.
