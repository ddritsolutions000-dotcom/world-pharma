'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
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
import {
  listSupportQueues,
  listSupportTickets,
  SUPPORT_TICKET_STATUSES,
  SupportDeskApiError,
  type SupportQueue,
  type SupportTicketSummary,
} from './support-desk-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

export function SupportDeskList() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<SupportTicketSummary[]>([]);
  const [queues, setQueues] = useState<SupportQueue[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState('XX');
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
      setViewState('network');
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
  if (viewState === 'network' && rows.length === 0) {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>Support Desk</Heading>
      <Text tone="secondary">
        Operational ticket queue for support agents. Shows metadata and structured references only — no clinical
        payloads, health timelines, or lab/imaging values. Internal notes are agent-only (server-enforced).
        <code> reveal-pii</code> is not implemented (deferred — no R11-A API).
      </Text>

      <Card>
        <div className="wp-stack">
          <FormField label="Country code">
            {({ id }) => (
              <Input
                id={id}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                placeholder="XX"
              />
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
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No tickets" description="Adjust filters or wait for new customer tickets." />
      ) : (
        <div className="wp-stack">
          {rows.map((row) => (
            <Card key={row.id}>
              <Heading level={3}>{row.subject}</Heading>
              <Text tone="secondary">
                {row.status} · {row.queue_code} · ticket {row.id.slice(0, 8)}…
              </Text>
              {row.reference_type ? (
                <Text tone="secondary">
                  Ref: {row.reference_type} {row.reference_id?.slice(0, 8)}…
                </Text>
              ) : null}
              {row.assignee_person_id ? (
                <Text tone="secondary">Assignee: {row.assignee_person_id.slice(0, 8)}…</Text>
              ) : (
                <Text tone="secondary">Unassigned</Text>
              )}
              <Text tone="secondary">Updated {new Date(row.updated_at).toLocaleString()}</Text>
              <Link href={`/support/${row.id}?country=${countryCode}`}>
                <Button variant="secondary">Open ticket</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
