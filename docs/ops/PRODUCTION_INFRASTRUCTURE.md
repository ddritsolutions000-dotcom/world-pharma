# Production infrastructure, security & disaster recovery

This is the **software/infrastructure boundary**. It does **not** mean World-Pharma has a live cloud production environment.

Software-ready means production configuration, private storage, scanning, backup/restore procedures, health, and fail-closed gates exist so operators can deploy onto **approved** infrastructure without silent local/sandbox fallback.

## Software-ready vs EXTERNAL_GATED

| Area | Software | External |
|------|----------|----------|
| Production config inventory | Presence/INVALID/MISSING without printing values | Cloud account, contracts |
| Secrets | Env references, redaction, no API/audit secret values | Cloud KMS / secret manager |
| Object storage | Local private store + production gate | S3-compatible bucket, IAM, encryption |
| Malware scanning | Sandbox noop/deterministic + production gate | Real AV engine |
| Database backup | `pnpm db:backup` / `db:restore` / `db:recovery-drill` | Managed PITR, off-site encrypted retention |
| Redis HA | Connectivity probe | Cluster/sentinel |
| Observability | Structured logs, request/correlation IDs, `/health/ready`, `/metrics` | APM, paging |
| TLS / domain | Checklist only | Certificates, DNS, WAF |
| Production deployment | Checklist only | Actual cluster, workers, cron |

RPO/RTO contractual values: **TARGET_DEFINED** (RPO ≤15m, RTO ≤4h — see `S63_DISASTER_RECOVERY_RUNBOOK.md`). Achievement of those targets on managed PITR/off-site infra: **RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED**.

Healthcare/partner record retention: **policy-dependent**. Do not auto-delete orders, financial records, regulatory evidence, clinical records, or audit logs.

## Deployment checklist (not a completed deployment)

- [ ] Managed Postgres + migrations applied
- [ ] Redis (auth + namespace) reachable
- [ ] Private object storage (non-local) + IAM
- [ ] Secret manager / KMS refs (no secrets in git)
- [ ] Malware scanner endpoint available
- [ ] Domain + TLS
- [ ] Environment variables set (references only in tickets)
- [ ] Backup job + restore drill recorded on isolated DB
- [ ] Monitoring/alerts mapped from `docs/ops/ALERTS.md`
- [ ] Provider credentials (PSP, OTP, messaging, carrier) as approved
- [ ] API workers + outbox dispatcher running
- [ ] Scheduled jobs as required
- [ ] `INFRASTRUCTURE_ENVIRONMENT=production` only after the above — application will **not** use local disk or noop AV

## Restore drill record (template)

| Field | Value |
|-------|--------|
| Backup timestamp | |
| Restore timestamp | |
| Target environment | isolated / staging — never production |
| Result | PASS / FAIL |
| Verification summary | schema, marker row, checksum |

## 20-step local/staging drill

See Sprint 47 engineering report. Do not run destructive restore against production data.
