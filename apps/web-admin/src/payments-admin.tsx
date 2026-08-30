'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import {
  getPaymentObservability,
  getPaymentRoutingMatrix,
  listPayments,
  listUnknownPayments,
  PaymentsAdminApiError,
  type PaymentObservabilityDetail,
  type PaymentAttemptHistory,
  type PaymentRoutingMatrix,
  type PaymentSummary,
} from './payments-admin-api';

type ViewState = 'loading' | 'idle' | 'forbidden' | 'network';
type MatrixViewState = 'loading' | 'idle' | 'forbidden' | 'network' | 'empty';

export function PaymentsAdminPanel() {
  const searchParams = useSearchParams();
  const { session, getAccessToken } = useSession();
  const countryCode = searchParams.get('country') ?? 'XX';
  const selectedId = searchParams.get('id');
  const [rows, setRows] = useState<PaymentSummary[]>([]);
  const [unknown, setUnknown] = useState<PaymentSummary[]>([]);
  const [detail, setDetail] = useState<PaymentObservabilityDetail | null>(null);
  const [matrix, setMatrix] = useState<PaymentRoutingMatrix | null>(null);
  const [matrixViewState, setMatrixViewState] = useState<MatrixViewState>('loading');
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [statusFilter, setStatusFilter] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState('');

  const canRead = session.permissions.includes('payment:read');
  const canReconcile = session.permissions.includes('payment:reconcile');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setViewState('forbidden');
      return;
    }
    setViewState('loading');
    setMatrixViewState('loading');
    try {
      const [listBody, unknownBody, matrixBody] = await Promise.all([
        listPayments(token, countryCode),
        canReconcile ? listUnknownPayments(token, countryCode) : Promise.resolve({ data: [] }),
        getPaymentRoutingMatrix(token, countryCode),
      ]);
      let data = listBody.data ?? [];
      if (statusFilter) {
        data = data.filter((row) => row.status === statusFilter);
      }
      if (gatewayFilter.trim()) {
        data = data.filter((row) => row.gateway_code === gatewayFilter.trim());
      }
      setRows(data);
      setUnknown(unknownBody.data ?? []);
      setMatrix(matrixBody);
      setMatrixViewState(matrixBody.rows.length || matrixBody.effective_fail_closed_reason ? 'idle' : 'empty');
      if (selectedId) {
        const obs = await getPaymentObservability(token, selectedId, countryCode);
        setDetail(obs);
      } else {
        setDetail(null);
      }
      setViewState('idle');
    } catch (err) {
      if (err instanceof PaymentsAdminApiError && err.status === 403) {
        setViewState('forbidden');
        setMatrixViewState('forbidden');
        return;
      }
      setViewState('network');
      setMatrixViewState('network');
    }
  }, [canRead, canReconcile, countryCode, gatewayFilter, getAccessToken, selectedId, statusFilter]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (viewState === 'forbidden' || !canRead) {
    return <PermissionDeniedState />;
  }

  if (viewState === 'loading' && rows.length === 0 && !detail) {
    return <LoadingState label="Loading payments" />;
  }

  if (viewState === 'network' && rows.length === 0 && !detail) {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <section className="wp-stack">
      <Heading level={2}>Payments (sandbox)</Heading>
      <Text tone="secondary">
        Inspect payment intents, webhook health, reconciliation breaks, and audit timelines. Credential values and raw
        provider payloads are never shown.
      </Text>
      <Card>
        <div className="wp-stack">
          <FormField label="Country code">
            {({ id }) => <Input id={id} value={countryCode} readOnly aria-label="Country code" />}
          </FormField>
          <FormField label="Status filter">
            {({ id }) => (
              <Select id={id} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All</option>
                <option value="CAPTURED">CAPTURED</option>
                <option value="FAILED">FAILED</option>
                <option value="UNKNOWN">UNKNOWN</option>
                <option value="AUTHORIZED">AUTHORIZED</option>
              </Select>
            )}
          </FormField>
          <FormField label="Gateway">
            {({ id }) => (
              <Input
                id={id}
                value={gatewayFilter}
                onChange={(event) => setGatewayFilter(event.target.value)}
                placeholder="MOCK_PRIMARY"
              />
            )}
          </FormField>
          <Button onClick={() => void load()}>Refresh</Button>
        </div>
      </Card>

      {detail ? (
        <PaymentObservabilityDetailView detail={detail} countryCode={countryCode} onReload={() => void load()} />
      ) : null}

      <PaymentRoutingMatrixSection matrix={matrix} viewState={matrixViewState} onReload={() => void load()} />

      <Card>
        <Heading level={3}>Payment intents</Heading>
        {!rows.length ? (
          <EmptyState title="No payments" description="No sandbox payment intents match the current filters." />
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/payments?country=${countryCode}&id=${row.id}`}>
                  {row.order_number ?? row.id} — {row.status} {row.currency} {row.amount_minor}{' '}
                  {row.gateway_code ? `(${row.gateway_code}/${row.gateway_environment})` : ''}
                  {row.failure_classification ? ` — ${row.failure_classification}` : ''}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canReconcile ? (
        <Card>
          <Heading level={3}>UNKNOWN queue ({unknown.length})</Heading>
          {!unknown.length ? (
            <EmptyState title="Queue empty" description="No payments in UNKNOWN status for this country." />
          ) : (
            <ul>
              {unknown.map((row) => (
                <li key={row.id}>
                  <Link href={`/payments?country=${countryCode}&id=${row.id}`}>
                    {row.id} — {row.failure_classification ?? 'unknown_state'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </section>
  );
}

function PaymentRoutingMatrixSection({
  matrix,
  viewState,
  onReload,
}: {
  matrix: PaymentRoutingMatrix | null;
  viewState: MatrixViewState;
  onReload: () => void;
}) {
  if (viewState === 'forbidden') {
    return null;
  }
  if (viewState === 'loading' && !matrix) {
    return (
      <Card>
        <Heading level={3}>Routing matrix</Heading>
        <LoadingState label="Loading routing matrix" />
      </Card>
    );
  }
  if (viewState === 'network' && !matrix) {
    return (
      <Card>
        <Heading level={3}>Routing matrix</Heading>
        <NetworkErrorState action={{ label: 'Retry', onClick: onReload }} />
      </Card>
    );
  }
  if (!matrix) {
    return null;
  }

  return (
    <Card>
      <Heading level={3}>Routing matrix (read-only)</Heading>
      <Text tone="secondary">
        Sandbox effective routes only. Production preview remains inactive while live payments are disabled.
      </Text>
      <Text>
        Active environment: {matrix.active_environment} · Live enabled: {String(matrix.live_payments_enabled)} · Policy:{' '}
        {matrix.policy_source}
      </Text>
      {matrix.effective_route ? (
        <Text>
          Effective route: {matrix.effective_route.gateway_code}/{matrix.effective_route.gateway_environment} (priority{' '}
          {matrix.effective_route.priority})
        </Text>
      ) : (
        <Text tone="secondary">
          No active route{matrix.effective_fail_closed_reason ? ` — ${matrix.effective_fail_closed_reason}` : ''}
        </Text>
      )}
      {!matrix.rows?.length ? (
        <EmptyState title="No routing rows" description="No sandbox routing rows match the current policy context." />
      ) : (
        <ul>
          {matrix.rows.map((row) => (
            <li key={`${row.gateway_code}:${row.gateway_environment}`}>
              {row.gateway_code}/{row.gateway_environment} — priority {row.priority} — {row.status}
              {row.fail_closed_reason ? ` — ${row.fail_closed_reason}` : ''}
              {row.capabilities.length ? ` — capabilities: ${row.capabilities.join(', ')}` : ''}
            </li>
          ))}
        </ul>
      )}
      <Heading level={4}>Production preview (inactive)</Heading>
      <Text tone="secondary">{matrix.production_preview.fail_closed_reason}</Text>
      {!matrix.production_preview.rows?.length ? (
        <Text tone="secondary">No production preview rows.</Text>
      ) : (
        <ul>
          {matrix.production_preview.rows.map((row) => (
            <li key={`prod-${row.gateway_code}:${row.gateway_environment}`}>
              {row.gateway_code}/{row.gateway_environment} — {row.status}
              {row.fail_closed_reason ? ` — ${row.fail_closed_reason}` : ''}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PaymentAttemptHistorySection({
  history,
  payment,
}: {
  history: PaymentAttemptHistory | undefined;
  payment: PaymentSummary;
}) {
  if (!history) {
    return (
      <>
        <Heading level={4}>Gateway attempts</Heading>
        <NetworkErrorState action={{ label: 'Reload', onClick: () => window.location.reload() }} />
      </>
    );
  }
  if (!history.attempts.length) {
    return (
      <>
        <Heading level={4}>Gateway attempts</Heading>
        <EmptyState title="No attempts" description="No gateway submit attempts recorded for this payment." />
      </>
    );
  }
  return (
    <>
      <Heading level={4}>Gateway attempts</Heading>
      <Text tone="secondary">
        Final gateway: {history.final_selected_gateway ?? payment.gateway_code ?? 'none'}
        {history.fallback_occurred ? ' · Fallback used' : ' · Primary only'}
      </Text>
      <ul>
        {history.attempts.map((attempt) => (
          <li key={attempt.id}>
            #{attempt.attempt_number} {attempt.gateway_code}/{attempt.gateway_environment} — {attempt.outcome}
            {attempt.failure_classification ? ` — ${attempt.failure_classification}` : ''}
            {attempt.failure_outcome ? ` — ${attempt.failure_outcome}` : ''}
            {attempt.selected ? ' (selected)' : ''}
            {attempt.created_at ? ` — ${attempt.created_at}` : ''}
          </li>
        ))}
      </ul>
    </>
  );
}

function PaymentObservabilityDetailView({
  detail,
  countryCode,
  onReload,
}: {
  detail: PaymentObservabilityDetail;
  countryCode: string;
  onReload: () => void;
}) {
  const payment = detail.payment;
  return (
    <Card>
      <Heading level={3}>Payment detail</Heading>
      <Text>
        {payment.order_number ?? payment.id} — {payment.status} — {payment.gateway_code}/{payment.gateway_environment}
      </Text>
      {payment.failure_classification ? <Text tone="secondary">Failure: {payment.failure_classification}</Text> : null}
      {payment.failure_outcome ? <Text tone="secondary">Outcome: {payment.failure_outcome}</Text> : null}
      {payment.last_reconciliation_break ? (
        <Text tone="secondary">Reconciliation break: {payment.last_reconciliation_break}</Text>
      ) : null}
      <Text tone="secondary">
        Order: {payment.order_number ?? 'none'} · Country: {payment.country_code} · Sandbox: {String(payment.sandbox)}
      </Text>
      <Button onClick={onReload}>Reload detail</Button>
      <PaymentAttemptHistorySection history={detail.attempt_history} payment={detail.payment} />
      <Heading level={4}>Webhook health</Heading>
      {!detail.webhooks.length ? (
        <EmptyState title="No webhook events" description="No webhook events recorded for this gateway window." />
      ) : (
        <ul>
          {detail.webhooks.map((hook) => (
            <li key={hook.id}>
              {hook.provider_event_id} — {hook.processing_status}
              {hook.rejection_reason ? ` (${hook.rejection_reason})` : ''} — {hook.event_type}
            </li>
          ))}
        </ul>
      )}
      <Heading level={4}>Reconciliation</Heading>
      {!detail.reconciliations.length ? (
        <Text tone="secondary">No reconciliation records yet.</Text>
      ) : (
        <ul>
          {detail.reconciliations.map((row) => (
            <li key={row.id}>
              {row.status} {row.break_type ? `— ${row.break_type}` : ''} — {row.detail}
            </li>
          ))}
        </ul>
      )}
      <Heading level={4}>Audit timeline</Heading>
      {!detail.audit_timeline.length ? (
        <EmptyState title="No audit events" description="Lifecycle events will appear here." />
      ) : (
        <ul>
          {detail.audit_timeline.map((entry) => (
            <li key={`${entry.source}-${entry.id}`}>
              {entry.occurred_at} — {entry.source}/{entry.type}
            </li>
          ))}
        </ul>
      )}
      <Link href={`/payments?country=${countryCode}`}>Back to list</Link>
    </Card>
  );
}
