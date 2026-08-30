'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
  TextArea,
} from '@world-pharma/ui-kit/web';
import {
  addSupportTicketMessage,
  assignSupportTicket,
  allowedNextStatuses,
  escalateSupportTicket,
  getSupportTicket,
  isTerminalTicketStatus,
  listSupportQueues,
  setSupportTicketStatus,
  SupportDeskApiError,
  type SupportQueue,
  type SupportTicketDetail,
} from './support-desk-api';

type ViewState = 'loading' | 'idle' | 'forbidden' | 'not_found' | 'network';

export function SupportDeskTicket({ ticketId }: { ticketId: string }) {
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = searchParams.get('country') ?? 'XX';
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [queues, setQueues] = useState<SupportQueue[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [assigneeId, setAssigneeId] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [escalateQueueId, setEscalateQueueId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageVisibility, setMessageVisibility] = useState<'CUSTOMER' | 'INTERNAL'>('CUSTOMER');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const canManage = session.permissions.includes('support:manage');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    setActionError('');
    try {
      const [detail, queueBody] = await Promise.all([
        getSupportTicket(token, ticketId, countryCode),
        listSupportQueues(token, countryCode),
      ]);
      setTicket(detail);
      setQueues(queueBody.data ?? []);
      setAssigneeId(detail.assignee_person_id ?? '');
      const next = allowedNextStatuses(detail.status);
      setNextStatus(next[0] ?? '');
      setViewState('idle');
    } catch (err) {
      if (err instanceof SupportDeskApiError) {
        if (err.status === 403) {
          setViewState('forbidden');
          return;
        }
        if (err.status === 404) {
          setViewState('not_found');
          return;
        }
      }
      setViewState('network');
    }
  }, [countryCode, getAccessToken, ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (action: () => Promise<SupportTicketDetail>) => {
    setBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      const updated = await action();
      setTicket(updated);
      setAssigneeId(updated.assignee_person_id ?? '');
      const next = allowedNextStatuses(updated.status);
      setNextStatus(next[0] ?? '');
      setMessageBody('');
      setActionMessage('Saved.');
    } catch (err) {
      if (err instanceof SupportDeskApiError) {
        if (err.status === 403) {
          setActionError('You do not have permission for this action.');
        } else if (err.status === 409) {
          setActionError(err.message || 'Conflict — ticket may be closed or transition invalid.');
        } else if (err.status === 404) {
          setActionError('Ticket not found for this country.');
        } else if (err.status === 0) {
          setActionError('Network error — try again.');
        } else {
          setActionError(err.message || 'Request failed.');
        }
      } else {
        setActionError('Request failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (viewState === 'loading') {
    return <LoadingState label="Loading ticket" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'not_found') {
    return (
      <div className="wp-stack">
        <EmptyState
          title="Ticket not found"
          description="The ticket may not exist or is outside your country scope."
        />
        <Link href={`/support?country=${countryCode}`}>
          <Button variant="secondary">Back to queue</Button>
        </Link>
      </div>
    );
  }
  if (viewState === 'network' && !ticket) {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }
  if (!ticket) {
    return null;
  }

  const closed = isTerminalTicketStatus(ticket.status);
  const transitions = allowedNextStatuses(ticket.status);

  return (
    <div className="wp-stack">
      <Heading level={1}>{ticket.subject}</Heading>
      <Link href={`/support?country=${countryCode}`}>
        <Button variant="secondary">Back to queue</Button>
      </Link>

      <Card>
        <div className="wp-stack">
          <Text tone="secondary">
            Status: <strong>{ticket.status}</strong> · Queue: {ticket.queue_name} ({ticket.queue_code})
          </Text>
          <Text tone="secondary">Customer person: {ticket.person_id.slice(0, 8)}…</Text>
          {ticket.reference_type ? (
            <Text tone="secondary">
              Reference: {ticket.reference_type} {ticket.reference_id}
            </Text>
          ) : (
            <Text tone="secondary">No structured reference</Text>
          )}
          {ticket.assignee_person_id ? (
            <Text tone="secondary">Assignee: {ticket.assignee_person_id}</Text>
          ) : (
            <Text tone="secondary">Unassigned</Text>
          )}
          <Text tone="secondary">
            Created {new Date(ticket.created_at).toLocaleString()} · Updated{' '}
            {new Date(ticket.updated_at).toLocaleString()}
          </Text>
          {closed ? (
            <Text tone="secondary">This ticket is closed and cannot be modified.</Text>
          ) : null}
        </div>
      </Card>

      <Card>
        <Heading level={2}>Messages</Heading>
        {ticket.messages.length === 0 ? (
          <EmptyState title="No messages" description="Customer or agent messages will appear here." />
        ) : (
          <div className="wp-stack">
            {ticket.messages.map((msg) => (
              <Card key={msg.id}>
                <Text tone="secondary">
                  {msg.visibility === 'INTERNAL' ? 'Internal note' : 'Customer-visible'} ·{' '}
                  {msg.author_person_id.slice(0, 8)}… · {new Date(msg.created_at).toLocaleString()}
                </Text>
                <Text>{msg.body}</Text>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {!canManage ? (
        <Text tone="secondary">Read-only — requires support:manage for assignment, status, and replies.</Text>
      ) : closed ? (
        <Text tone="secondary">Closed tickets cannot receive assignment, status, or message changes.</Text>
      ) : (
        <>
          <Card>
            <Heading level={2}>Assign</Heading>
            <div className="wp-stack">
              <FormField label="Assignee person ID">
                {({ id }) => (
                  <Input id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />
                )}
              </FormField>
              <Button
                disabled={busy || !assigneeId.trim()}
                onClick={() => {
                  const token = getAccessToken();
                  if (!token) {
                    return;
                  }
                  void runAction(() =>
                    assignSupportTicket(token, ticketId, {
                      assignee_person_id: assigneeId.trim(),
                      country_code: countryCode,
                    }),
                  );
                }}
              >
                Assign ticket
              </Button>
            </div>
          </Card>

          <Card>
            <Heading level={2}>Status</Heading>
            <div className="wp-stack">
              <FormField label="Next status">
                {({ id }) => (
                  <Select id={id} value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                    {transitions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <Button
                disabled={busy || !nextStatus}
                onClick={() => {
                  const token = getAccessToken();
                  if (!token) {
                    return;
                  }
                  void runAction(() =>
                    setSupportTicketStatus(token, ticketId, {
                      status: nextStatus,
                      country_code: countryCode,
                    }),
                  );
                }}
              >
                Update status
              </Button>
            </div>
          </Card>

          <Card>
            <Heading level={2}>Escalate queue</Heading>
            <div className="wp-stack">
              <FormField label="Target queue">
                {({ id }) => (
                  <Select id={id} value={escalateQueueId} onChange={(e) => setEscalateQueueId(e.target.value)}>
                    <option value="">Select queue</option>
                    {queues.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.code} — {q.name}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <Button
                disabled={busy || !escalateQueueId}
                onClick={() => {
                  const token = getAccessToken();
                  if (!token) {
                    return;
                  }
                  void runAction(() =>
                    escalateSupportTicket(token, ticketId, {
                      queue_id: escalateQueueId,
                      country_code: countryCode,
                    }),
                  );
                }}
              >
                Escalate
              </Button>
            </div>
          </Card>

          <Card>
            <Heading level={2}>Reply / note</Heading>
            <div className="wp-stack">
              <FormField label="Visibility">
                {({ id }) => (
                  <Select
                    id={id}
                    value={messageVisibility}
                    onChange={(e) => setMessageVisibility(e.target.value as 'CUSTOMER' | 'INTERNAL')}
                  >
                    <option value="CUSTOMER">Customer-visible reply</option>
                    <option value="INTERNAL">Internal note (agents only)</option>
                  </Select>
                )}
              </FormField>
              <FormField label="Message">
                {({ id }) => (
                  <TextArea
                    id={id}
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    rows={4}
                  />
                )}
              </FormField>
              <Button
                disabled={busy || !messageBody.trim()}
                onClick={() => {
                  const token = getAccessToken();
                  if (!token) {
                    return;
                  }
                  void runAction(() =>
                    addSupportTicketMessage(token, ticketId, {
                      body: messageBody.trim(),
                      visibility: messageVisibility,
                      country_code: countryCode,
                    }),
                  );
                }}
              >
                {messageVisibility === 'INTERNAL' ? 'Add internal note' : 'Send customer reply'}
              </Button>
            </div>
          </Card>
        </>
      )}

      {actionError ? <Text tone="secondary">{actionError}</Text> : null}
      {actionMessage ? <Text tone="secondary">{actionMessage}</Text> : null}
    </div>
  );
}
