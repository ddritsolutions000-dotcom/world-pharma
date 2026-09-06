# Sprint 96 — Production Managed Backup + PITR + Disaster Recovery Activation Readiness

**Status:** COMPLETE (software readiness)  
**Production managed backup enabled:** **NO**  
**Production PITR enabled:** **NO**  
**Production DR environment enabled:** **NO**  
**Providers:** all `NOT_SELECTED`  
**Lifecycle:** `NOT_SELECTED`  
**Production:** `EXTERNAL_GATED` for all three rails  
**Primary blocker:** `NO_PRODUCTION_MANAGED_BACKUP_PITR`  
**Granular:** `NO_PRODUCTION_MANAGED_BACKUP` / `NO_PRODUCTION_PITR` / `NO_PRODUCTION_DR_ENVIRONMENT`  
**Foundation:** Sprint 83 + Sprint 74 (+ Sprint 63 runbook)  
**Storage dependency:** Sprint 95 (still EXTERNAL_GATED)  
**Launch control:** `CAN_PRODUCTION_LAUNCH = NO`

---

## Critical boundaries

**pg_dump ≠ managed backup**  
**DATABASE BACKUP ≠ PITR**  
**Sandbox recovery-drill ≠ production RTO proof**  
**DATABASE RECOVERY ≠ OBJECT STORAGE RECOVERY**  
**Migration history ≠ backup**

---

## Current status

| Rail | Provider | Sandbox | Production | Enabled |
|------|----------|---------|------------|---------|
| Managed backup | `NOT_SELECTED` | `SANDBOX_VERIFIED` | `EXTERNAL_GATED` | false |
| PITR | `NOT_SELECTED` | `SANDBOX_ONLY` | `EXTERNAL_GATED` | false |
| DR environment | `NOT_SELECTED` | `SANDBOX_ONLY` | `EXTERNAL_GATED` | false |

Force-launch: **false**  
Native Android/iOS: `DEVICE_NOT_AVAILABLE`

---

## RPO / RTO

| Metric | Target | Status | Achievement / evidence |
|--------|--------|--------|-------------------------|
| RPO | **15 minutes** | `TARGET_DEFINED` | **`NOT_YET_PROVEN`** |
| RTO | **4 hours** | `TARGET_DEFINED` | **`NOT_YET_PROVEN`** |

Sandbox restore elapsed (existing drill evidence): **~5374 ms** restore / **~6434 ms** total — labeled **SANDBOX_ONLY**. This is **not** production RTO proof.

---

## Activation lifecycle

`NOT_SELECTED` → `CONFIGURED` → `VERIFIED` → `APPROVED` → `ENABLED` (+ `DISABLED`, `EXTERNAL_GATED`).

Credentials / schedule refs alone never return `ENABLED`.

---

## Required external configuration (references)

| Rail | Example keys |
|------|----------------|
| Managed backup | `MANAGED_BACKUP_SECRET_REF`, `MANAGED_BACKUP_DESTINATION_REF`, `MANAGED_BACKUP_SCHEDULE_REF` |
| PITR | `PITR_WAL_RETENTION_REF`, `PITR_RESTORE_ENVIRONMENT_REF` |
| DR | `DR_ENVIRONMENT_REGION_REF` |

Plus S95 deps: private storage, KMS, malware scanner clearance.

---

## Exact production blockers

Umbrella: **`NO_PRODUCTION_MANAGED_BACKUP_PITR`**

Granular: `NO_PRODUCTION_MANAGED_BACKUP`, `NO_PRODUCTION_PITR`, `NO_PRODUCTION_DR_ENVIRONMENT`, `BACKUP_PROVIDER_NOT_SELECTED`, `BACKUP_CREDENTIAL_REFERENCE_MISSING`, `BACKUP_DESTINATION_REFERENCE_MISSING`, `BACKUP_SCHEDULE_CONFIGURATION_REQUIRED`, `BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED`, `PITR_PROVIDER_NOT_SELECTED`, `PITR_WAL_RETENTION_CONFIGURATION_REQUIRED`, `PITR_RESTORE_ENVIRONMENT_REFERENCE_MISSING`, `DR_ENVIRONMENT_NOT_SELECTED`, `DR_REGION_REFERENCE_MISSING`, `DR_OBJECT_STORAGE_DEPENDENCY_GATED`, `DR_KMS_DEPENDENCY_GATED`, `DR_MONITORING_DEPENDENCY_GATED`, `RPO_RTO_NOT_YET_PROVEN`, plus `NO_PRODUCTION_PRIVATE_STORAGE` / `NO_PRODUCTION_KMS` / `NO_PRODUCTION_MALWARE_SCANNER`

---

## Isolated restore (sandbox)

```bash
pnpm db:recovery-drill
```

Creates an isolated DB, restores, verifies schema/marker/outbox/migrations, drops drill DB. Never targets the active application database.

Evidence: `apps/test-results/s74-backup/sandbox-restore-drill.json` (reused) and S96 shots/artifacts.

---

## Object storage / KMS dependency (S95)

DR readiness correctly remains gated while private storage / KMS / malware remain EXTERNAL_GATED.

---

## Required external approvals

1. Managed Postgres with WAL/PITR + off-site encrypted retention  
2. Isolated DR environment (region/network/secrets/deploy)  
3. Production-class timed restore drill evidence  
4. S95 storage/KMS/malware clearance for object recovery  
5. Monitoring/alerting for backup age / PITR lag  
6. Human `PROVIDER_APPROVED_MANAGED_DB_PITR` + live flags **after** enablement guard  

---

**PRODUCTION MANAGED BACKUP ENABLED = NO**  
**PRODUCTION PITR ENABLED = NO**  
**PRODUCTION DR ENVIRONMENT ENABLED = NO**  
**RPO 15 MINUTES = NOT_YET_PROVEN**  
**RTO 4 HOURS = NOT_YET_PROVEN**  
**CAN_PRODUCTION_LAUNCH = NO**
