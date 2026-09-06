/**
 * Sprint 47 — Combined production infrastructure availability (software vs EXTERNAL_GATED).
 */
import { Errors } from '../common/problem';
import { evaluateProductionConfigInventory } from './production-config';
import { evaluateProductionFileScanningAvailable } from './production-file-scanning-gate';
import { evaluateProductionStorageAvailable } from './production-storage-gate';
import { readInfrastructureEnvironment } from './infra-environment';
import { getRecoveryObjectives } from './recovery-targets';

export type InfrastructureComponentStatus = 'READY' | 'BLOCKED' | 'EXTERNAL_GATED';

export type ProductionInfrastructureAvailability = {
  status: InfrastructureComponentStatus;
  environment: 'sandbox' | 'production';
  database: InfrastructureComponentStatus;
  redis: InfrastructureComponentStatus;
  storage: InfrastructureComponentStatus;
  kms_secrets: InfrastructureComponentStatus;
  malware_scanning: InfrastructureComponentStatus;
  backups: InfrastructureComponentStatus;
  observability: InfrastructureComponentStatus;
  pitr: 'EXTERNAL_GATED';
  /** Sprint 63: targets defined; achievement remains EXTERNAL_GATED via recovery_infrastructure_status. */
  rpo: 'TARGET_DEFINED';
  rto: 'TARGET_DEFINED';
  rpo_target: string;
  rto_target: string;
  recovery_infrastructure_status: 'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED';
  blockers: string[];
  message: string;
};

export function evaluateProductionInfrastructureAvailable(): ProductionInfrastructureAvailability {
  const config = evaluateProductionConfigInventory();
  const storage = evaluateProductionStorageAvailable();
  const scanner = evaluateProductionFileScanningAvailable();
  const recovery = getRecoveryObjectives();
  const byName = Object.fromEntries(config.items.map((row) => [row.name, row.status]));
  const map = (status: string | undefined): InfrastructureComponentStatus => {
    if (status === 'CONFIGURED') {
      return 'READY';
    }
    if (status === 'EXTERNAL_GATED') {
      return 'EXTERNAL_GATED';
    }
    return 'BLOCKED';
  };
  const blockers = [
    ...config.items.filter((row) => row.status === 'MISSING' || row.status === 'INVALID').map((row) => `${row.name}:${row.status}`),
    ...storage.blockers.map((code) => `storage:${code}`),
    ...scanner.blockers.map((code) => `scanner:${code}`),
  ];
  const status: InfrastructureComponentStatus =
    blockers.some((b) => b.includes('MISSING') || b.includes('INVALID')) && readInfrastructureEnvironment() === 'production'
      ? 'BLOCKED'
      : 'EXTERNAL_GATED';
  return {
    status,
    environment: readInfrastructureEnvironment(),
    database: map(byName['database']),
    redis: map(byName['redis']),
    storage: storage.available ? 'READY' : 'EXTERNAL_GATED',
    kms_secrets: map(byName['kms_secrets']),
    malware_scanning: scanner.available ? 'READY' : 'EXTERNAL_GATED',
    backups: 'EXTERNAL_GATED',
    observability: map(byName['observability']),
    pitr: 'EXTERNAL_GATED',
    rpo: 'TARGET_DEFINED',
    rto: 'TARGET_DEFINED',
    rpo_target: recovery.rpo_target,
    rto_target: recovery.rto_target,
    recovery_infrastructure_status: recovery.infrastructure_status,
    blockers: [...new Set(blockers)],
    message:
      'Application compiled ≠ production infrastructure ready. RPO/RTO targets are defined; cloud DB/Redis HA, S3, KMS, scanner, PITR, and monitoring remain EXTERNAL_GATED.',
  };
}

export function assertProductionInfrastructureAvailable(): ProductionInfrastructureAvailability {
  const result = evaluateProductionInfrastructureAvailable();
  if (result.status === 'READY' && result.storage === 'READY' && result.malware_scanning === 'READY') {
    return result;
  }
  throw Errors.problem(
    409,
    'INFRASTRUCTURE_NOT_PRODUCTION_READY',
    'Production infrastructure unavailable',
    result.message,
  );
}
