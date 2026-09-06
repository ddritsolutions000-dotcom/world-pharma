/**
 * Sprint 63 — Recovery time objectives (targets only).
 * Sprint 74 — Explicit TARGET_DEFINED vs NOT_YET_PROVEN achievement.
 * Targets are engineering policy. Managed PITR / off-site restore remains EXTERNAL_GATED.
 */
export type RecoveryTargetStatus = 'TARGET_DEFINED';
export type RecoveryInfrastructureStatus = 'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED';
export type RecoveryAchievementStatus = 'NOT_YET_PROVEN' | 'PROVEN';

export type RecoveryObjectiveScope =
  | 'postgres_primary'
  | 'redis_ephemeral'
  | 'object_storage'
  | 'outbox_events'
  | 'application_runtime';

export type RecoveryObjectives = {
  status: RecoveryTargetStatus;
  infrastructure_status: RecoveryInfrastructureStatus;
  /** Max acceptable committed data loss window for primary Postgres (logical/PITR). */
  rpo_target: '15m';
  /** Max acceptable time to restore API+DB readiness after declared disaster. */
  rto_target: '4h';
  /** Achievement is independent of the target definition. */
  rpo_achievement: RecoveryAchievementStatus;
  rto_achievement: RecoveryAchievementStatus;
  backup_frequency_expectation: 'continuous_wal_plus_daily_logical';
  critical_services: string[];
  non_critical_services: string[];
  scopes: Array<{
    scope: RecoveryObjectiveScope;
    rpo_notes: string;
    rto_notes: string;
    owner: string;
  }>;
  message: string;
};

/** Authoritative internal RPO/RTO targets for launch planning. */
export function getRecoveryObjectives(): RecoveryObjectives {
  return {
    status: 'TARGET_DEFINED',
    infrastructure_status: 'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED',
    rpo_target: '15m',
    rto_target: '4h',
    rpo_achievement: 'NOT_YET_PROVEN',
    rto_achievement: 'NOT_YET_PROVEN',
    backup_frequency_expectation: 'continuous_wal_plus_daily_logical',
    critical_services: [
      'postgres',
      'api',
      'outbox_dispatcher',
      'redis_rate_limit_bullmq',
      'private_object_storage',
    ],
    non_critical_services: ['metrics_scrape', 'analytics_rollup', 'marketing_campaign_scheduler'],
    scopes: [
      {
        scope: 'postgres_primary',
        rpo_notes: 'Target ≤15 minutes via managed WAL/PITR once EXTERNAL_GATED infra is connected.',
        rto_notes: 'Target ≤4 hours to verified /health/ready with migrations applied.',
        owner: 'Platform / DBA (managed cloud)',
      },
      {
        scope: 'redis_ephemeral',
        rpo_notes: 'Ephemeral: rate limits/queues may rebuild; do not treat as system of record.',
        rto_notes: 'Replace/restore Redis within RTO window; redrive BullMQ after Postgres is healthy.',
        owner: 'Platform',
      },
      {
        scope: 'object_storage',
        rpo_notes: 'Target aligned to bucket versioning/replication once production storage is live.',
        rto_notes: 'Documents available after storage restore + ACL check; no local-disk production fallback.',
        owner: 'Platform / Security',
      },
      {
        scope: 'outbox_events',
        rpo_notes: 'Outbox rows live in Postgres — same RPO as primary DB.',
        rto_notes: 'Dispatcher restart + PENDING/DLQ review within RTO; idempotent occurrenceKey replay.',
        owner: 'Engineering',
      },
      {
        scope: 'application_runtime',
        rpo_notes: 'Stateless API; no local durable state.',
        rto_notes: 'Redeploy containers/workers; config from secret manager refs.',
        owner: 'Engineering / DevOps',
      },
    ],
    message:
      'RPO 15m / RTO 4h are TARGET_DEFINED. Achievement remains NOT_YET_PROVEN until managed PITR + production-class restore drill evidence. Sandbox logical dump/restore is SANDBOX_VERIFIED only.',
  };
}
