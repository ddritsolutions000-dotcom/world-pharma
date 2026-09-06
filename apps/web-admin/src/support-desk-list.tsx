'use client';

import Link from 'next/link';
import { classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Select,
} from '@world-pharma/ui-kit/web';
import {
  listSupportQueues,
  listSupportTickets,
  SUPPORT_TICKET_STATUSES,
  SupportDeskApiError,
  type SupportQueue,
  type SupportTicketSummary,
} from './support-desk-api';
import { supportTicketStatusLabel } from './support-ticket-status-labels';
import { workingCountry, MARKET_COUNTRY_CODES } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

export function SupportDeskList() {
  const { getAccessToken, session } = useSession();
  const [rows, setRows] = useState<SupportTicketSummary[]>([]);
  const [queues, setQueues] = useState<SupportQueue[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [statusFilter, setStatusFilter] = useState('');
  const [queueFilter, setQueueFilter] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const [ticketBody, queueBody] = await Promise.all([
        listSupportTickets(token, {
          country_code: countryCode,
          status: statusFilter || undefined,
          queue_id: queueFilter || undefined,
        }),
        listSupportQueues(token, countryCode),
      ]);
      setRows(ticketBody.data ?? []);
      setQueues(queueBody.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof SupportDeskApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [countryCode, getAccessToken, queueFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'loading' && rows.length === 0) {
    return <LoadingState label="Loading support queue" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Support Desk</Heading>
        <p className="wp-page-intro">
          Customer tickets only — no clinical payloads. Open a ticket to reply or change status.
        </p>
      </header>

      <div className="wp-toolbar">
        <FormField label="Country">
          {({ id }) => (
            <Select id={id} value={countryCode} onChange={(e) => setCountryCode(workingCountry(e.target.value))}>
              {MARKET_COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Status filter">
          {({ id }) => (
            <Select id={id} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {SUPPORT_TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Queue filter">
          {({ id }) => (
            <Select id={id} value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)}>
              <option value="">All queues</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.code} — {q.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />

      {rows.length === 0 ? (
        <EmptyState title="No tickets" description="Adjust filters or wait for new customer tickets." />
      ) : (
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Status</th>
                <th>Queue</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.subject}</td>
                  <td>
                    <span className="wp-status">{supportTicketStatusLabel(row.status)}</span>
                  </td>
                  <td>{row.queue_code}</td>
                  <td>{new Date(row.updated_at).toLocaleString()}</td>
                  <td>
                    <Link href={`/support/${row.id}?country=${countryCode}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
