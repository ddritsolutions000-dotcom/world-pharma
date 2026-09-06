'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { classifyAdminViewState } from './admin-http';
import { AdminDataTable } from './admin-data-table';
import { AdminViewLoadError } from './admin-request-error';
import {
  fetchIdempotencyLookup,
  fetchOutboxEvents,
  fetchReliabilitySnapshot,
  type IdempotencyRow,
  type OutboxEventRow,
  type ReliabilitySnapshot,
} from './reliability-admin-api';

type ViewState = 'loading' | 'idle' | 'forbidden' | 'network' | 'error';

export function ReliabilityAdminPanel() {
  const searchParams = useSearchParams();
  const { session, getAccessToken } = useSession();
  const canRead = session.permissions.includes('policy:read');
  const initialStatus = searchParams.get('status') ?? '';
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [idemKey, setIdemKey] = useState('');
  const [snapshot, setSnapshot] = useState<ReliabilitySnapshot | null>(null);
  const [outbox, setOutbox] = useState<OutboxEventRow[]>([]);
  const [idempotency, setIdempotency] = useState<IdempotencyRow[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setViewState('forbidden');
      return;
    }
    setViewState('loading');
    try {
      const [snap, events, idem] = await Promise.all([
        fetchReliabilitySnapshot(token),
        fetchOutboxEvents(token, statusFilter || undefined),
        fetchIdempotencyLookup(token, idemKey.trim() || undefined),
      ]);
      setSnapshot(snap);
      setOutbox(events.data ?? []);
      setIdempotency(idem.data ?? []);
      setViewState('idle');
    } catch (err) {
      setViewState(classifyAdminViewState(err));
    }
  }, [canRead, getAccessToken, idemKey, statusFilter]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'network' || viewState === 'error') {
    return <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />;
  }
  if (viewState === 'loading' && !snapshot) {
    return <LoadingState label="Loading reliability" />;
  }

  return (
    <div className="wp-stack" style={{ gap: 16 }}>
      <div className="wp-stack" style={{ gap: 4 }}>
        <Heading level={2}>Reliability</Heading>
        <Text tone="secondary">
          Outbox backlog, dead letters, and idempotency visibility. Replay is not available from this console —
          investigate and remediate through authorized ops runbooks.
        </Text>
      </div>

      {snapshot ? (
        <div className="wp-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
          <Card>
            <Text size="caption">Pending</Text>
            <Heading level={3}>{snapshot.outbox.pending}</Heading>
          </Card>
          <Card>
            <Text size="caption">Processing</Text>
            <Heading level={3}>{snapshot.outbox.processing}</Heading>
          </Card>
          <Card>
            <Text size="caption">Dead lettered</Text>
            <Heading level={3}>{snapshot.outbox.dead_lettered}</Heading>
          </Card>
          <Card>
            <Text size="caption">Failed</Text>
            <Heading level={3}>{snapshot.outbox.failed}</Heading>
          </Card>
          <Card>
            <Text size="caption">Stuck processing</Text>
            <Heading level={3}>{snapshot.outbox.stuck_processing ?? 0}</Heading>
          </Card>
          <Card>
            <Text size="caption">Idempotency (24h)</Text>
            <Heading level={3}>{snapshot.idempotency.records_last_24h}</Heading>
          </Card>
          <Card>
            <Text size="caption">Payments</Text>
            <Badge kind={snapshot.live_payment_enabled ? 'warning' : 'pending'}>
              {snapshot.live_payment_enabled ? 'LIVE_GATED' : 'SANDBOX'}
            </Badge>
          </Card>
          <Card>
            <Text size="caption">Replay</Text>
            <Badge kind="pending">{snapshot.replay_available ? 'AVAILABLE' : 'DISABLED'}</Badge>
          </Card>
        </div>
      ) : null}

      {snapshot?.final_internal_release_gate ? (
        <Card>
          <Heading level={3}>Final internal release gate</Heading>
          <Text tone="secondary">{snapshot.final_internal_release_gate.message}</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Badge kind={snapshot.final_internal_release_gate.overall_launch_ready ? 'info' : 'warning'}>
              Launch ready: {String(snapshot.final_internal_release_gate.overall_launch_ready)}
            </Badge>
            <Badge kind={snapshot.final_internal_release_gate.internal_software_ready ? 'info' : 'warning'}>
              Internal software: {snapshot.final_internal_release_gate.internal_software_ready ? 'READY' : 'NOT READY'}
            </Badge>
            <Badge kind="pending">{snapshot.final_internal_release_gate.decision}</Badge>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {snapshot.final_internal_release_gate.categories.map((row) => (
              <Badge key={row.id} kind={row.status === 'PASS' ? 'info' : row.status === 'BLOCKED' ? 'warning' : 'pending'}>
                {row.id}: {row.status}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}

      {snapshot?.production_config_validation ? (
        <Card>
          <Heading level={3}>Production config validation</Heading>
          <Text tone="secondary">{snapshot.production_config_validation.message}</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Badge
              kind={
                snapshot.production_config_validation.overall === 'PASS'
                  ? 'info'
                  : snapshot.production_config_validation.overall === 'BLOCKED'
                    ? 'warning'
                    : 'pending'
              }
            >
              Overall: {snapshot.production_config_validation.overall}
            </Badge>
            {(snapshot.production_config_validation.blocked_features ?? []).map((f) => (
              <Badge key={f} kind="pending">
                Feature blocked: {f}
              </Badge>
            ))}
          </div>
          <Text size="caption" tone="secondary">
            Secret values are never shown. Sandbox may remain functional while production features stay EXTERNAL_GATED.
          </Text>
        </Card>
      ) : null}

      {snapshot?.infrastructure ? (
        <Card>
          <Heading level={3}>Infrastructure</Heading>
          <Text tone="secondary">
            Software probes only. Cloud HA, S3, KMS, scanner, and PITR stay EXTERNAL_GATED until operators connect
            them. Secret values are never shown.
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Badge kind="pending">Status: {snapshot.infrastructure.status}</Badge>
            <Badge kind="pending">Database: {snapshot.infrastructure.database}</Badge>
            <Badge kind="pending">Redis: {snapshot.infrastructure.redis}</Badge>
            <Badge kind="pending">Storage: {snapshot.infrastructure.storage}</Badge>
            <Badge kind="pending">Scanner: {snapshot.infrastructure.malware_scanning}</Badge>
            <Badge kind="pending">KMS: {snapshot.infrastructure.kms_secrets}</Badge>
            <Badge kind="pending">Backups: {snapshot.infrastructure.backups}</Badge>
            <Badge kind="pending">Observability: {snapshot.infrastructure.observability}</Badge>
            <div style={{ display: 'block', marginTop: 8 }}>
              <Text tone="secondary">
                Application health ≠ production APM. External APM/pager remains EXTERNAL_GATED (
                NO_PRODUCTION_APM_PROVIDER) until a real vendor is approved. NOT_SELECTED providers must not
                raise false “provider down” alerts.
              </Text>
            </div>
            <Badge kind="pending">
              RPO: {snapshot.infrastructure.rpo}
              {snapshot.infrastructure.rpo_target ? ` (${snapshot.infrastructure.rpo_target})` : ''}
            </Badge>
            <Badge kind="pending">
              RTO: {snapshot.infrastructure.rto}
              {snapshot.infrastructure.rto_target ? ` (${snapshot.infrastructure.rto_target})` : ''}
            </Badge>
          </div>
        </Card>
      ) : null}

      {snapshot?.production_config ? (
        <Card>
          <Heading level={3}>Production configuration</Heading>
          <Badge kind={snapshot.production_config.overall === 'BLOCKED' ? 'warning' : 'pending'}>
            {snapshot.production_config.overall}
          </Badge>
          <Text size="caption">Environment: {snapshot.production_config.environment}</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {snapshot.production_config.items.map((item) => {
              // Never echo secret env key names into the DOM (e2e + operators).
              const label =
                item.name === 'jwt_access_secret'
                  ? 'access_token_signing'
                  : item.name === 'otp_pepper'
                    ? 'otp_hashing_material'
                    : item.name;
              return (
                <Badge
                  key={item.name}
                  kind={item.status === 'INVALID' || item.status === 'MISSING' ? 'warning' : 'pending'}
                >
                  {label}: {item.status} ({item.secret_present})
                </Badge>
              );
            })}
          </div>
        </Card>
      ) : null}

      {snapshot?.backup_catalog ? (
        <Card>
          <Heading level={3}>Recovery</Heading>
          <Text tone="secondary">
            Backup/PITR production: EXTERNAL_GATED (NOT_SELECTED). Sandbox restore:{' '}
            {snapshot.backup_catalog.sandbox_restore ?? 'NOT_RUN'}. PITR {snapshot.backup_catalog.pitr}.
            RPO/RTO targets:{' '}
            {snapshot.recovery_objectives?.rpo_target ?? snapshot.backup_catalog.rpo_target ?? '15m'} /{' '}
            {snapshot.recovery_objectives?.rto_target ?? snapshot.backup_catalog.rto_target ?? '4h'} (
            {snapshot.backup_catalog.rpo ?? 'TARGET_DEFINED'} / {snapshot.backup_catalog.rto ?? 'TARGET_DEFINED'}
            ). Achievement:{' '}
            {snapshot.backup_catalog.rpo_achievement ??
              snapshot.recovery_objectives?.rpo_achievement ??
              'NOT_YET_PROVEN'}{' '}
            /{' '}
            {snapshot.backup_catalog.rto_achievement ??
              snapshot.recovery_objectives?.rto_achievement ??
              'NOT_YET_PROVEN'}
            . Infrastructure:{' '}
            {snapshot.backup_catalog.recovery_infrastructure_status ??
              snapshot.recovery_objectives?.infrastructure_status ??
              'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED'}
            . Last verified restore:{' '}
            {snapshot.backup_catalog.last_verified_restore ?? 'none (run pnpm db:recovery-drill)'}.
          </Text>
          <Text tone="secondary">
            Application health is separate from production recovery readiness. Local logical dumps are not managed
            PITR. Database restore does not prove object/file recovery.
          </Text>
          {snapshot.backup_catalog.data.length === 0 ? (
            <EmptyState title="No local backup metadata" description="Run pnpm db:backup in an approved environment." />
          ) : (
            <Text size="caption">
              Latest: {snapshot.backup_catalog.data[0]?.artifact_name ?? '—'}{' '}
              {snapshot.backup_catalog.data[0]?.verified ? '(checksum present)' : '(unverified)'}
            </Text>
          )}
        </Card>
      ) : null}

      {snapshot?.operational_signals ? (
        <Card>
          <Heading level={3}>Security / incident signals</Heading>
          <Text tone="secondary">
            Failed auth, webhook, and DLQ signals are software-ready. Pager/APM integration is EXTERNAL_GATED.
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {snapshot.operational_signals.map((sig) => (
              <Badge key={sig.code} kind="pending">
                {sig.code}: {sig.monitoring_integration}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}

      {snapshot?.dependency_readiness ? (
        <Card>
          <Heading level={3}>Dependency readiness</Heading>
          <Text tone="secondary">{snapshot.dependency_readiness.note}</Text>
          <Text size="caption">Probe: {snapshot.dependency_readiness.health_ready_path}</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {snapshot.dependency_readiness.runtime_dependencies.map((dep) => (
              <Badge key={dep.name} kind={dep.mode === 'sandbox' || dep.mode === 'degraded' ? 'warning' : 'pending'}>
                {dep.name}: {dep.mode}
              </Badge>
            ))}
          </div>
          {snapshot.links ? (
            <Text size="caption" tone="secondary">
              Related: {snapshot.links.notification_ops} · {snapshot.links.health_ready} · {snapshot.links.metrics}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <div className="wp-stack" style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <FormField label="Outbox status">
            {({ id }) => (
              <Select id={id} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="PENDING">PENDING</option>
                <option value="PROCESSING">PROCESSING</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="FAILED">FAILED</option>
                <option value="DEAD_LETTERED">DEAD_LETTERED</option>
              </Select>
            )}
          </FormField>
          <FormField label="Idempotency key">
            {({ id }) => (
              <Input id={id} value={idemKey} onChange={(e) => setIdemKey(e.target.value)} placeholder="Optional lookup" />
            )}
          </FormField>
          <Button onClick={() => void load()}>Refresh</Button>
        </div>
      </Card>

      <Card>
        <Heading level={3}>Outbox events</Heading>
        {outbox.length === 0 ? (
          <EmptyState title="No outbox rows" description="No events match the current filter." />
        ) : (
          <AdminDataTable
            caption="Outbox events"
            columns={[
              { id: 'type', header: 'Type', cell: (row: OutboxEventRow) => row.type },
              {
                id: 'status',
                header: 'Status',
                cell: (row: OutboxEventRow) => (
                  <Badge kind={row.status === 'DEAD_LETTERED' || row.status === 'FAILED' ? 'warning' : 'pending'}>
                    {row.status}
                  </Badge>
                ),
              },
              { id: 'attempts', header: 'Attempts', cell: (row: OutboxEventRow) => String(row.attempts) },
              {
                id: 'correlation',
                header: 'Correlation',
                cell: (row: OutboxEventRow) => row.correlation_id?.slice(0, 12) ?? '—',
              },
              {
                id: 'error',
                header: 'Last error',
                cell: (row: OutboxEventRow) => (
                  <Text size="caption">{row.last_error ? row.last_error.slice(0, 120) : '—'}</Text>
                ),
              },
              {
                id: 'created',
                header: 'Created',
                cell: (row: OutboxEventRow) => new Date(row.created_at).toLocaleString(),
              },
            ]}
            rows={outbox}
            rowKey={(row) => row.id}
          />
        )}
      </Card>

      <Card>
        <Heading level={3}>Idempotency records</Heading>
        <Text tone="secondary" size="caption">
          Lookup is read-only. Enter a key prefix to inspect matching records (bodies are not shown).
        </Text>
        {idempotency.length === 0 ? (
          <EmptyState title="No idempotency hits" description="Provide a key prefix to look up records." />
        ) : (
          <AdminDataTable
            caption="Idempotency records"
            columns={[
              { id: 'key', header: 'Key', cell: (row: IdempotencyRow) => row.key },
              { id: 'method', header: 'Method', cell: (row: IdempotencyRow) => row.method },
              { id: 'path', header: 'Path', cell: (row: IdempotencyRow) => row.path },
              { id: 'status', header: 'Status', cell: (row: IdempotencyRow) => String(row.status_code) },
              {
                id: 'created',
                header: 'Created',
                cell: (row: IdempotencyRow) => new Date(row.created_at).toLocaleString(),
              },
            ]}
            rows={idempotency}
            rowKey={(row) => row.id}
          />
        )}
      </Card>
    </div>
  );
}
