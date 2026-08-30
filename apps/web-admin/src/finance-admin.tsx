'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import { BreakQueuePanel } from './finance-break-queue';
import {
  createFinanceSchedule,
  fetchFinanceSchedules,
  fetchFinanceWorkerRuns,
  updateFinanceSchedule,
  type FinanceScheduleRow,
} from './finance-admin-api';

export function FinanceAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [workerRuns, setWorkerRuns] = useState<Array<Record<string, unknown>>>([]);
  const [schedules, setSchedules] = useState<FinanceScheduleRow[]>([]);
  const [scheduleForm, setScheduleForm] = useState({ country_id: '', provider_code: 'MOCK_SETTLEMENT', currency: 'XXX' });
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loadingWorkerRuns, setLoadingWorkerRuns] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  const canReconcile =
    session.status === 'authenticated'
    && Array.isArray(session.permissions)
    && session.permissions.includes('finance:reconcile');

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/finance/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError('Finance dashboard could not be loaded.');
      return;
    }
    setDash((await res.json()) as Record<string, unknown>);
  }

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

  return (
    <section>
      <Heading level={2}>Finance</Heading>
      <Text tone="secondary">
        Sandbox ledger, contribution, vendor settlement, and reconciliation break queue. No live payout,
        bank transfer, PSP, or DHL. Real vendor payout remains OFF. Not net profit.
      </Text>
      <Button onClick={() => void load()}>Load dashboard</Button>
      <Button onClick={() => void loadWorkerRuns()} disabled={loadingWorkerRuns}>
        {loadingWorkerRuns ? 'Loading worker runs…' : 'Load import worker runs'}
      </Button>
      <Button onClick={() => void loadSchedules()} disabled={loadingSchedules}>
        {loadingSchedules ? 'Loading schedules…' : 'Load import schedules'}
      </Button>
      {denied ? <EmptyState title="Permission denied" description="Requires finance:read." /> : null}
      {error ? <Text>{error}</Text> : null}
      {dash ? (
        <Card>
          <Text>Facts {String(dash.facts)}</Text>
          <Text>Payables {String(dash.vendor_payables)}</Text>
          <Text>Payouts {String(dash.payouts)} (mock)</Text>
          <Text>{String(dash.note)}</Text>
        </Card>
      ) : null}

      <BreakQueuePanel
        getAccessToken={getAccessToken}
        canReconcile={canReconcile}
        onForbidden={() => setDenied(true)}
      />

      {workerRuns.length ? (
        <Card>
          <Heading level={3}>Settlement import worker runs</Heading>
          {workerRuns.map((row) => (
            <div key={String(row.id)} style={{ marginBottom: '1rem' }}>
              <Text>
                {String(row.status)} · {String(row.provider_code)} · {String(row.external_batch_ref)}
              </Text>
              <Text tone="secondary">
                {String(row.failure_classification ?? 'ok')} · retries {String(row.retry_count)}
              </Text>
            </div>
          ))}
        </Card>
      ) : null}
      {scheduleError ? <Text>{scheduleError}</Text> : null}
      <Card>
        <Heading level={3}>Settlement import schedules</Heading>
        <Text tone="secondary">Poll interval is global (worker_poll_ms). Enable/disable per country+provider.</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '28rem', marginTop: '0.75rem' }}>
          <label>
            Country ID
            <input
              value={scheduleForm.country_id}
              onChange={(e) => setScheduleForm((s) => ({ ...s, country_id: e.target.value }))}
            />
          </label>
          <label>
            Provider code
            <input
              value={scheduleForm.provider_code}
              onChange={(e) => setScheduleForm((s) => ({ ...s, provider_code: e.target.value }))}
            />
          </label>
          <label>
            Currency
            <input
              value={scheduleForm.currency}
              onChange={(e) => setScheduleForm((s) => ({ ...s, currency: e.target.value }))}
            />
          </label>
          <Button onClick={() => void submitScheduleCreate()}>Create schedule</Button>
        </div>
        {schedules.length ? (
          schedules.map((row) => (
            <div key={row.id} style={{ marginTop: '1rem' }}>
              <Text>
                {row.enabled ? 'enabled' : 'disabled'} · {row.provider_code} · {row.country_iso2 ?? row.country_id}
              </Text>
              <Text tone="secondary">
                {row.currency} · poll {row.worker_poll_ms}ms
                {row.last_run ? ` · last ${row.last_run.status}` : ''}
              </Text>
              <Button onClick={() => void toggleSchedule(row.id, row.enabled)}>
                {row.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          ))
        ) : loadingSchedules ? null : (
          <EmptyState title="No schedules loaded" description="Load schedules or create one for scheduled import." />
        )}
      </Card>
    </section>
  );
}
