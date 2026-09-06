import { adminApiRoot, adminAuthHeaders } from './admin-http';

export type ReliabilitySnapshot = {
  runtime: Record<string, unknown>;
  outbox: {
    pending: number;
    processing: number;
    published: number;
    dead_lettered: number;
    failed: number;
    stuck_processing?: number;
  };
  idempotency: {
    records_last_24h: number;
    ttl?: string;
    storage?: string;
  };
  live_payment_enabled: boolean;
  production_config?: {
    overall: string;
    environment: string;
    items: Array<{ name: string; status: string; secret_present: string; detail: string }>;
    never_expose_secrets: boolean;
  };
  infrastructure?: {
    status: string;
    database: string;
    redis: string;
    storage: string;
    kms_secrets: string;
    malware_scanning: string;
    backups: string;
    observability: string;
    pitr: string;
    rpo: string;
    rto: string;
    rpo_target?: string;
    rto_target?: string;
    recovery_infrastructure_status?: string;
  };
  backup_catalog?: {
    data: Array<{ created_at: string | null; artifact_name: string | null; verified: boolean }>;
    pitr: string;
    rpo?: string;
    rto?: string;
    rpo_target?: string;
    rto_target?: string;
    rpo_achievement?: string;
    rto_achievement?: string;
    recovery_infrastructure_status?: string;
    last_verified_restore: string | null;
    sandbox_restore?: string;
  };
  recovery_objectives?: {
    status: string;
    infrastructure_status: string;
    rpo_target: string;
    rto_target: string;
    rpo_achievement?: string;
    rto_achievement?: string;
    message: string;
  };
  production_config_validation?: {
    overall: string;
    blocked_features: string[];
    message: string;
  };
  final_internal_release_gate?: {
    overall_launch_ready: boolean;
    internal_software_ready: boolean;
    decision: string;
    categories: Array<{ id: string; status: string; blocker: string | null; next_action: string }>;
    message: string;
  };
  operational_signals?: Array<{ code: string; monitoring_integration: string }>;
  never_expose_secrets?: boolean;
  dependency_readiness?: {
    note: string;
    health_ready_path: string;
    runtime_dependencies: Array<{ name: string; mode: string }>;
  };
  links?: {
    notification_ops: string;
    health_ready: string;
    metrics: string;
  };
  replay_available?: boolean;
};

export type OutboxEventRow = {
  id: string;
  type: string;
  aggregate_type: string;
  aggregate_id: string;
  status: string;
  attempts: number;
  correlation_id: string | null;
  occurrence_key: string | null;
  last_error: string | null;
  created_at: string;
  failed_at: string | null;
  processed_at: string | null;
};

export type IdempotencyRow = {
  id: string;
  person_id: string;
  key: string;
  method: string;
  path: string;
  status_code: number;
  created_at: string;
};

async function fetchJson<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${adminApiRoot()}${path}`, { headers: adminAuthHeaders(token) });
  if (res.status === 403) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }
  if (!res.ok) {
    throw Object.assign(new Error('request_failed'), { status: res.status });
  }
  return (await res.json()) as T;
}

export function fetchReleaseGate(token: string) {
  return fetchJson<{
    overall_launch_ready: boolean;
    internal_software_ready: boolean;
    decision: string;
    categories: Array<{ id: string; status: string; blocker: string | null; next_action: string; evidence?: string }>;
    message: string;
  }>(token, '/api/v1/admin/control-plane/release-gate');
}

export function fetchReliabilitySnapshot(token: string) {
  return fetchJson<ReliabilitySnapshot>(token, '/api/v1/admin/control-plane/reliability/snapshot');
}

export function fetchOutboxEvents(token: string, status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson<{ data: OutboxEventRow[]; sandbox: boolean }>(
    token,
    `/api/v1/admin/control-plane/reliability/outbox${qs}`,
  );
}

export function fetchIdempotencyLookup(token: string, key?: string) {
  const qs = key ? `?key=${encodeURIComponent(key)}` : '';
  return fetchJson<{ data: IdempotencyRow[] }>(
    token,
    `/api/v1/admin/control-plane/reliability/idempotency${qs}`,
  );
}
