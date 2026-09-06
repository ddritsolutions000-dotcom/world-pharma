'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { formatCount } from './analytics-format';
import { BreakQueuePanel } from './finance-break-queue';
import { presentCountryPicks, type CountryPickRow } from './eligibility-admin-present';
import { MARKET_COUNTRY_CODES } from './working-country';
import {
  createFinanceSchedule,
  fetchAffiliateLiabilities,
  fetchDoctorEarningsAdmin,
  fetchFinanceReconciliation,
  fetchFinanceSchedules,
  fetchFinanceWorkerRuns,
  fetchLabEarningsAdmin,
  fetchSettlementBatches,
  updateFinanceSchedule,
  fetchPartnerWithdraws,
  type FinanceScheduleRow,
  type PartnerWithdrawAdminRow,
} from './finance-admin-api';
import { AdminDataTable } from './admin-data-table';

export function FinanceAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [payables, setPayables] = useState<Array<Record<string, unknown>>>([]);
  const [affiliates, setAffiliates] = useState<Array<Record<string, unknown>>>([]);
  const [doctorEarnings, setDoctorEarnings] = useState<Array<Record<string, unknown>>>([]);
  const [labEarnings, setLabEarnings] = useState<Array<Record<string, unknown>>>([]);
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);
  const [partnerWithdraws, setPartnerWithdraws] = useState<PartnerWithdrawAdminRow[]>([]);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [loadingOps, setLoadingOps] = useState(false);
  const [workerRuns, setWorkerRuns] = useState<Array<Record<string, unknown>>>([]);
  const [schedules, setSchedules] = useState<FinanceScheduleRow[]>([]);
  const [scheduleForm, setScheduleForm] = useState({
    country_id: '',
    provider_code: 'MOCK_SETTLEMENT',
    currency: 'XXX',
  });
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dashboardDenied, setDashboardDenied] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loadingWorkerRuns, setLoadingWorkerRuns] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [countries, setCountries] = useState<CountryPickRow[]>([]);

  const canReconcile =
    session.status === 'authenticated' &&
    Array.isArray(session.permissions) &&
    session.permissions.includes('finance:reconcile');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoadingOps(true);
    const [res, countryRes, payablesRes, affRes, docRes, labRes, batchRes, reconRes, withdrawRes] =
      await Promise.all([
        fetch(`${adminApiRoot()}/api/v1/admin/finance/dashboard`, {
          headers: adminAuthHeaders(token),
        }),
        fetch(`${adminApiRoot()}/api/v1/admin/governance/countries`, {
          headers: adminAuthHeaders(token),
        }),
        fetch(`${adminApiRoot()}/api/v1/admin/finance/payables`, {
          headers: adminAuthHeaders(token),
        }),
        fetchAffiliateLiabilities(token),
        fetchDoctorEarningsAdmin(token),
        fetchLabEarningsAdmin(token),
        fetchSettlementBatches(token),
        fetchFinanceReconciliation(token),
        fetchPartnerWithdraws(token),
      ]);
    setLoadingOps(false);
    if (countryRes.ok) {
      const market = new Set<string>(MARKET_COUNTRY_CODES);
      const rows = presentCountryPicks(await countryRes.json()).filter((row) => market.has(row.iso2));
      setCountries(rows);
      setScheduleForm((s) => ({
        ...s,
        country_id: s.country_id || rows[0]?.id || '',
      }));
    }
    if (payablesRes.ok) {
      const body = (await payablesRes.json()) as { data?: Array<Record<string, unknown>> };
      setPayables(body.data ?? []);
    }
    if (affRes.ok) {
      const body = (await affRes.json()) as { data?: Array<Record<string, unknown>> };
      setAffiliates(body.data ?? []);
    }
    if (docRes.ok) {
      const body = (await docRes.json()) as { data?: Array<Record<string, unknown>> };
      setDoctorEarnings(body.data ?? []);
    }
    if (labRes.ok) {
      const body = (await labRes.json()) as { data?: Array<Record<string, unknown>> };
      setLabEarnings(body.data ?? []);
    }
    if (batchRes.ok) {
      const body = (await batchRes.json()) as { data?: Array<Record<string, unknown>> };
      setBatches(body.data ?? []);
    }
    if (withdrawRes.ok) {
      const body = (await withdrawRes.json()) as { data?: PartnerWithdrawAdminRow[] };
      setPartnerWithdraws(body.data ?? []);
    }
    if (reconRes.ok) {
      setRecon((await reconRes.json()) as Record<string, unknown>);
    }
    if (res.status === 403) {
      setDashboardDenied(true);
      return;
    }
    setDashboardDenied(false);
    if (!res.ok) {
      setError('Finance dashboard could not be loaded.');
      return;
    }
    setError(null);
    setDash((await res.json()) as Record<string, unknown>);
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  async function loadWorkerRuns() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoadingWorkerRuns(true);
    setError(null);
    const res = await fetchFinanceWorkerRuns(token);
    setLoadingWorkerRuns(false);
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError('Settlement import worker runs could not be loaded.');
      return;
    }
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    setWorkerRuns(body.data);
  }

  async function loadSchedules() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoadingSchedules(true);
    setScheduleError(null);
    const res = await fetchFinanceSchedules(token);
    setLoadingSchedules(false);
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setScheduleError('Settlement import schedules could not be loaded.');
      return;
    }
    const body = (await res.json()) as { data: FinanceScheduleRow[] };
    setSchedules(body.data);
  }

  async function submitScheduleCreate() {
    const token = getAccessToken();
    if (!token || !scheduleForm.country_id.trim()) {
      setScheduleError('country_id is required');
      return;
    }
    setScheduleError(null);
    const res = await createFinanceSchedule(token, {
      country_id: scheduleForm.country_id.trim(),
      provider_code: scheduleForm.provider_code.trim(),
      currency: scheduleForm.currency.trim(),
      enabled: true,
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      const body = (await res.json()) as { detail?: string };
      setScheduleError(body.detail ?? 'Schedule create failed.');
      return;
    }
    await loadSchedules();
  }

  async function toggleSchedule(scheduleId: string, enabled: boolean) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await updateFinanceSchedule(token, scheduleId, { enabled: !enabled });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      const body = (await res.json()) as { detail?: string };
      setScheduleError(body.detail ?? 'Schedule update failed.');
      return;
    }
    await loadSchedules();
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  const revenue = (recon?.revenue ?? null) as Record<string, unknown> | null;
  const reconPayables = (recon?.payables ?? null) as Record<string, unknown> | null;
  const reconSettlement = (recon?.settlement ?? null) as Record<string, unknown> | null;
  const reconExceptions = (recon?.exceptions ?? null) as Record<string, unknown> | null;

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Finance</Heading>
        <p className="wp-page-intro">
          Super Admin finance hub: partner self-withdraw audit, vendor payables, settlements, and reconciliation.
          Partners withdraw their own wallets (no approval). Platform fee covers company costs; affiliate marketing is
          the separate commission line.
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()}>
          Refresh finance
        </Button>
        <Button variant="secondary" onClick={() => void loadWorkerRuns()} disabled={loadingWorkerRuns}>
          {loadingWorkerRuns ? 'Loading worker runs…' : 'Load import worker runs'}
        </Button>
        <Button variant="secondary" onClick={() => void loadSchedules()} disabled={loadingSchedules}>
          {loadingSchedules ? 'Loading schedules…' : 'Load import schedules'}
        </Button>
      </div>
      {dashboardDenied || denied ? (
        <EmptyState title="Permission denied" description="Requires finance:read." />
      ) : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {loadingOps && !dash ? <LoadingState label="Loading finance" /> : null}
      {dash ? (
        <Card>
          <h2 className="wp-section-title">Financial overview</h2>
          <Badge kind={dash.sandbox ? 'pending' : 'warning'}>{dash.sandbox ? 'SANDBOX' : 'LIVE_GATED'}</Badge>
          <dl className="wp-kpi-grid">
            <div>
              <dt>
                <Text tone="secondary">Environment</Text>
              </dt>
              <dd>{String(dash.environment ?? (dash.sandbox ? 'sandbox' : 'unknown'))}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Live PSP</Text>
              </dt>
              <dd>{dash.live_psp ? 'Configured & gated' : 'Not live'}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Payout capability</Text>
              </dt>
              <dd>
                {String(dash.payout_capability ?? (dash.live_payout ? 'enabled' : 'EXTERNAL_PAYOUT_GATED'))}
              </dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Financial facts</Text>
              </dt>
              <dd>{formatCount(Number(dash.facts ?? 0))}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Vendor payables</Text>
              </dt>
              <dd>{formatCount(Number(dash.vendor_payables ?? 0))}</dd>
            </div>
          </dl>
          <Text tone="secondary" size="caption">
            Settlement status: {String(dash.settlement_capability ?? (dash.sandbox ? 'SANDBOX_NOT_SETTLED' : 'GATED'))}
          </Text>
        </Card>
      ) : null}

      {recon ? (
        <Card>
          <h2 className="wp-section-title">Reconciliation</h2>
          <Text tone="secondary" size="caption">
            Scope {String(recon.scope ?? 'GLOBAL')}
            {recon.currency ? ` · ${String(recon.currency)}` : ''} · EXTERNAL_PAYOUT_GATED
          </Text>
          <dl className="wp-kpi-grid">
            <div>
              <dt>
                <Text tone="secondary">Captured</Text>
              </dt>
              <dd>{String(revenue?.captured_minor ?? '0')}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Refunds</Text>
              </dt>
              <dd>{String(revenue?.refund_minor ?? '0')}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Net customer payment</Text>
              </dt>
              <dd>{String(revenue?.net_customer_payment_minor ?? '0')}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Vendor approved</Text>
              </dt>
              <dd>
                {String((reconPayables?.vendor as Record<string, unknown> | undefined)?.approved_minor ?? '0')}
              </dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Affiliate payable</Text>
              </dt>
              <dd>
                {String((reconPayables?.affiliate as Record<string, unknown> | undefined)?.payable_minor ?? '0')}
              </dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Lab payable facts</Text>
              </dt>
              <dd>
                {String((reconPayables?.lab as Record<string, unknown> | undefined)?.lab_payable_minor ?? '0')}
              </dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Batched net</Text>
              </dt>
              <dd>{String(reconSettlement?.eligible_or_batched_net_minor ?? '0')}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Sandbox settled</Text>
              </dt>
              <dd>{String(reconSettlement?.sandbox_settled_net_minor ?? '0')}</dd>
            </div>
            <div>
              <dt>
                <Text tone="secondary">Orphan facts</Text>
              </dt>
              <dd>
                {formatCount(
                  Array.isArray(reconExceptions?.orphan_vendor_payable_facts)
                    ? (reconExceptions?.orphan_vendor_payable_facts as unknown[]).length
                    : 0,
                )}
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <Card>
        <h2 className="wp-section-title">Partner withdraw audit</h2>
        <Text size="caption" tone="secondary">
          Paytm-style self-withdraw: partners withdraw their own wallet (doctor/lab/affiliate/delivery). Super Admin
          does not approve — this list is audit only. Platform fee covers company costs; only affiliate marketing is a
          separate payout line.
        </Text>
        {partnerWithdraws.length === 0 ? (
          <EmptyState
            title="No partner withdraws yet"
            description="When partners self-withdraw from their wallet, history appears here."
          />
        ) : (
          <AdminDataTable
            caption="Partner withdraws"
            rows={partnerWithdraws}
            rowKey={(row) => row.id}
            columns={[
              {
                id: 'partner',
                header: 'Partner',
                cell: (row) => `${row.partner_type} · ${row.partner_id.slice(0, 8)}…`,
              },
              {
                id: 'amount',
                header: 'Amount',
                cell: (row) => `${(Number(row.amount_minor) / 100).toFixed(2)} ${row.currency}`,
              },
              { id: 'status', header: 'Status', cell: (row) => row.status },
              {
                id: 'dest',
                header: 'Destination',
                cell: (row) => row.destination_hint ?? '—',
              },
              {
                id: 'when',
                header: 'When',
                cell: (row) => new Date(row.created_at).toLocaleString(),
              },
            ]}
          />
        )}
      </Card>

      <Card>
        <h2 className="wp-section-title">Vendor payables</h2>
        {payables.length === 0 ? (
          <EmptyState title="No vendor payables" description="Payables appear after captured orders sync to finance." />
        ) : (
          <AdminDataTable
            caption="Vendor payables"
            rows={payables}
            rowKey={(row) => String(row.id)}
            columns={[
              {
                id: 'order',
                header: 'Order',
                cell: (row) => String(row.order_number ?? row.order_id ?? '—').slice(0, 14),
              },
              { id: 'status', header: 'Status', cell: (row) => String(row.status ?? '—') },
              { id: 'eligibility', header: 'Eligibility', cell: (row) => String(row.eligibility ?? '—') },
              {
                id: 'amount',
                header: 'Amount',
                cell: (row) =>
                  `${String(row.payable_minor ?? row.amount_minor ?? '—')} ${String(row.currency ?? '')}`,
              },
              {
                id: 'settlement',
                header: 'Settlement',
                cell: (row) => String(row.settlement_status ?? row.settlement_batch_id ?? '—'),
                hideOnMobile: true,
              },
              { id: 'country', header: 'Country', cell: (row) => String(row.country_code ?? '—') },
            ]}
          />
        )}
      </Card>

      <Card>
        <h2 className="wp-section-title">Affiliate liabilities</h2>
        {affiliates.length === 0 ? (
          <EmptyState
            title="No affiliate liabilities"
            description="Liabilities appear from attributed captured orders."
          />
        ) : (
          <AdminDataTable
            caption="Affiliate liabilities"
            rows={affiliates}
            rowKey={(row) => String(row.id)}
            columns={[
              { id: 'code', header: 'Code', cell: (row) => String(row.affiliate_code ?? '—') },
              { id: 'status', header: 'Status', cell: (row) => String(row.status ?? '—') },
              {
                id: 'amount',
                header: 'Amount',
                cell: (row) => `${String(row.amount_minor ?? '—')} ${String(row.currency ?? '')}`,
              },
              { id: 'settlement', header: 'Settlement', cell: (row) => String(row.settlement_status ?? '—') },
              {
                id: 'order',
                header: 'Order',
                cell: (row) => String(row.order_number ?? row.order_id ?? '—').slice(0, 12),
              },
            ]}
          />
        )}
      </Card>

      <Card>
        <h2 className="wp-section-title">Doctor earnings</h2>
        <Text tone="secondary" size="caption">
          Read-only computed earnings. Settlement batches are not enabled for doctors.
        </Text>
        {doctorEarnings.length === 0 ? (
          <EmptyState title="No doctor earnings" description="Completed consults with fee config appear here." />
        ) : (
          <AdminDataTable
            caption="Doctor earnings"
            rows={doctorEarnings}
            rowKey={(row) => String(row.doctor_profile_id)}
            columns={[
              { id: 'profile', header: 'Profile', cell: (row) => String(row.doctor_profile_id).slice(0, 8) },
              { id: 'count', header: 'Consults', cell: (row) => String(row.completed_consult_count ?? 0) },
              {
                id: 'payable',
                header: 'Payable',
                cell: (row) => `${String(row.doctor_payable_minor ?? '0')} ${String(row.currency ?? '')}`,
              },
              { id: 'status', header: 'Settlement', cell: (row) => String(row.settlement_status ?? '—') },
              { id: 'country', header: 'Country', cell: (row) => String(row.country_code ?? '—') },
            ]}
          />
        )}
      </Card>

      <Card>
        <h2 className="wp-section-title">Lab earnings</h2>
        <Text tone="secondary" size="caption">
          Source-of-truth LAB_PAYABLE financial facts. Live lab payout remains EXTERNAL_PAYOUT_GATED.
        </Text>
        {labEarnings.length === 0 ? (
          <EmptyState title="No lab payable facts" description="Published lab reports create LAB_PAYABLE facts." />
        ) : (
          <AdminDataTable
            caption="Lab earnings"
            rows={labEarnings}
            rowKey={(row) => String(row.source_key)}
            columns={[
              { id: 'source', header: 'Source', cell: (row) => String(row.source_key ?? '—') },
              {
                id: 'amount',
                header: 'Amount',
                cell: (row) => `${String(row.amount_minor ?? '0')} ${String(row.currency ?? '')}`,
              },
              { id: 'status', header: 'Settlement', cell: (row) => String(row.settlement_status ?? '—') },
              { id: 'country', header: 'Country', cell: (row) => String(row.country_code ?? '—') },
            ]}
          />
        )}
      </Card>

      <Card>
        <h2 className="wp-section-title">Settlement batches</h2>
        {batches.length === 0 ? (
          <EmptyState
            title="No settlement batches"
            description="Batches appear when finance opens a sandbox settlement for approved vendor payables."
          />
        ) : (
          <AdminDataTable
            caption="Settlement batches"
            rows={batches}
            rowKey={(row) => String(row.id)}
            columns={[
              { id: 'id', header: 'Batch', cell: (row) => String(row.id).slice(0, 8) },
              {
                id: 'status',
                header: 'Status',
                cell: (row) => String(row.settlement_status ?? row.status ?? '—'),
              },
              { id: 'lines', header: 'Lines', cell: (row) => String(row.line_count ?? 0) },
              {
                id: 'net',
                header: 'Net',
                cell: (row) => `${String(row.net_minor ?? '0')} ${String(row.currency ?? '')}`,
              },
              { id: 'country', header: 'Country', cell: (row) => String(row.country_code ?? '—') },
              {
                id: 'gate',
                header: 'Payout',
                cell: (row) => String(row.external_payout ?? 'EXTERNAL_PAYOUT_GATED'),
                hideOnMobile: true,
              },
            ]}
          />
        )}
      </Card>

      <BreakQueuePanel
        getAccessToken={getAccessToken}
        canReconcile={canReconcile}
        countries={countries}
        onForbidden={() => setDenied(true)}
      />

      {workerRuns.length ? (
        <Card>
          <Heading level={3}>Settlement import worker runs</Heading>
          <AdminDataTable
            caption="Settlement import worker runs"
            rows={workerRuns}
            rowKey={(row) => String(row.id)}
            columns={[
              { id: 'provider', header: 'Provider', cell: (row) => String(row.provider_code) },
              {
                id: 'status',
                header: 'Status',
                cell: (row) => <span className="wp-status">{String(row.status)}</span>,
              },
              {
                id: 'batch',
                header: 'Batch',
                cell: (row) => String(row.external_batch_ref),
                hideOnMobile: true,
              },
              {
                id: 'retries',
                header: 'Retries',
                cell: (row) => `${String(row.failure_classification ?? 'ok')} · ${String(row.retry_count)}`,
              },
            ]}
          />
        </Card>
      ) : null}
      {scheduleError ? <p className="wp-text-muted">{scheduleError}</p> : null}
      <Card>
        <Heading level={3}>Settlement import schedules</Heading>
        <Text tone="secondary">Poll interval is global (worker_poll_ms). Enable/disable per country+provider.</Text>
        <div className="wp-form-grid">
          <FormField label="Country">
            {({ id }) => (
              <Select
                id={id}
                value={scheduleForm.country_id}
                onChange={(e) => setScheduleForm((s) => ({ ...s, country_id: e.target.value }))}
              >
                {countries.length === 0 ? <option value="">No countries loaded</option> : null}
                {countries.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.iso2} · {row.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Provider code">
            {({ id }) => (
              <Input
                id={id}
                value={scheduleForm.provider_code}
                onChange={(e) => setScheduleForm((s) => ({ ...s, provider_code: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label="Currency">
            {({ id }) => (
              <Input
                id={id}
                value={scheduleForm.currency}
                onChange={(e) => setScheduleForm((s) => ({ ...s, currency: e.target.value }))}
              />
            )}
          </FormField>
          <div className="wp-form-actions">
            <Button onClick={() => void submitScheduleCreate()}>Create schedule</Button>
          </div>
        </div>
        {schedules.length ? (
          <AdminDataTable
            caption="Settlement import schedules"
            rows={schedules}
            rowKey={(row) => row.id}
            columns={[
              { id: 'provider', header: 'Provider', cell: (row) => row.provider_code },
              {
                id: 'country',
                header: 'Country',
                cell: (row) => `${row.currency} · ${row.country_iso2 ?? row.country_id}`,
                hideOnMobile: true,
              },
              {
                id: 'status',
                header: 'Status',
                cell: (row) => <span className="wp-status">{row.enabled ? 'Enabled' : 'Disabled'}</span>,
              },
              {
                id: 'last_run',
                header: 'Last run',
                cell: (row) =>
                  row.last_run
                    ? `${row.last_run.status} · ${row.worker_poll_ms}ms`
                    : `Poll ${row.worker_poll_ms}ms`,
                hideOnMobile: true,
              },
              {
                id: 'actions',
                header: '',
                cell: (row) => (
                  <Button size="sm" onClick={() => void toggleSchedule(row.id, row.enabled)}>
                    {row.enabled ? 'Disable' : 'Enable'}
                  </Button>
                ),
              },
            ]}
          />
        ) : loadingSchedules ? null : (
          <EmptyState title="No schedules loaded" description="Load schedules or create one for scheduled import." />
        )}
      </Card>
    </section>
  );
}
