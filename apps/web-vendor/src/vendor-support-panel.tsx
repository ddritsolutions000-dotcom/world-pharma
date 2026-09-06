'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Text,
  TextArea,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  closeSupportTicket,
  createVendorSupportTicket,
  fetchSupportTicket,
  fetchVendorSupportTickets,
  replySupportTicket,
  type SupportTicketDetail,
  type VendorSupportTicket,
} from './vendor-api';
import { statusBadgeClass } from './vendor-format';

export function VendorSupportPanel({
  organizationId,
  token,
  onError,
  initialTicketId,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
  initialTicketId?: string;
}) {
  const [rows, setRows] = useState<VendorSupportTicket[]>([]);
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [referenceType, setReferenceType] = useState('order');
  const [referenceId, setReferenceId] = useState('');

  const orgRows = rows.filter((row) => !row.seller_org_id || row.seller_org_id === organizationId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchVendorSupportTickets(token);
      setRows(res.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (ticketId: string) => {
    setSelectedId(ticketId);
    setDetailLoading(true);
    setFormError(null);
    try {
      const body = await fetchSupportTicket(token, ticketId);
      setDetail(body);
    } catch (err) {
      if (err instanceof VendorApiError && (err.status === 401 || err.status === 403)) {
        onError(err);
        return;
      }
      setFormError((err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (initialTicketId) {
      void openDetail(initialTicketId);
    }
  }, [initialTicketId]);

  const submit = async () => {
    setFormError(null);
    setMessage(null);
    if (!subject.trim() || !body.trim()) {
      setFormError('Subject and body are required.');
      return;
    }
    if (/diagnosis|clinical|prescription instruction|dosage/i.test(`${subject} ${body}`)) {
      setFormError('Do not paste clinical content into support tickets.');
      return;
    }
    setBusy(true);
    try {
      await createVendorSupportTicket(token, {
        seller_org_id: organizationId,
        subject: subject.trim(),
        body: body.trim(),
        reference_type: referenceId.trim() ? referenceType : undefined,
        reference_id: referenceId.trim() || undefined,
      });
      setMessage('Ticket created.');
      setSubject('');
      setBody('');
      setReferenceId('');
      await load();
    } catch (err) {
      if (err instanceof VendorApiError && (err.status === 401 || err.status === 403)) {
        onError(err);
        return;
      }
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!detail || !reply.trim()) {
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const next = await replySupportTicket(token, detail.id, reply.trim());
      setDetail(next);
      setReply('');
      setMessage('Reply sent.');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const closeTicket = async () => {
    if (!detail) {
      return;
    }
    setBusy(true);
    try {
      const next = await closeSupportTicket(token, detail.id);
      setDetail(next);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading seller support tickets…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary" size="caption">
        Shared support kernel — vendor sees only own tickets. No clinical records.
      </Text>

      <div className="wp-order-layout">
        <Card>
          <Heading level={3}>Tickets ({orgRows.length})</Heading>
          {!orgRows.length ? (
            <EmptyState title="No tickets" description="Create a ticket for order, settlement, or shipment help." />
          ) : (
            <ul className="wp-mini-list">
              {orgRows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`wp-order-row${selectedId === row.id ? ' wp-order-row--active' : ''}`}
                    onClick={() => void openDetail(row.id)}
                  >
                    <div className="wp-mini-main">
                      <p className="wp-mini-title">
                        {row.subject}
                        <span className={statusBadgeClass(row.status)}>{row.status}</span>
                      </p>
                      <p className="wp-mini-meta">{String(row.created_at).slice(0, 19)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="wp-order-detail">
          {detailLoading ? <LoadingState label="Loading ticket…" /> : null}
          {detail && !detailLoading ? (
            <Card>
              <Heading level={2}>{detail.subject}</Heading>
              <Text size="caption">
                <span className={statusBadgeClass(detail.status)}>{detail.status}</span> ·{' '}
                {String(detail.created_at).slice(0, 19)}
              </Text>
              <ul className="vd-activity-list">
                {detail.messages.map((msg) => (
                  <li key={msg.id}>
                    <Card>
                      <Text size="caption" tone="secondary">
                        {new Date(msg.created_at).toLocaleString()}
                      </Text>
                      <Text>{msg.body}</Text>
                    </Card>
                  </li>
                ))}
              </ul>
              {!['CLOSED', 'RESOLVED'].includes(detail.status.toUpperCase()) ? (
                <>
                  <FormField label="Reply">
                    {({ id }) => (
                      <TextArea id={id} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
                    )}
                  </FormField>
                  <div className="wp-toolbar">
                    <Button disabled={busy} onClick={() => void sendReply()}>
                      Send reply
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => void closeTicket()}>
                      Close ticket
                    </Button>
                  </div>
                </>
              ) : null}
            </Card>
          ) : (
            <Card>
              <Heading level={3}>New ticket</Heading>
              <FormField label="Subject">
                {({ id }) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}
              </FormField>
              <FormField label="Details">
                {({ id }) => (
                  <TextArea id={id} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
                )}
              </FormField>
              <FormField label="Reference type">
                {({ id }) => (
                  <select id={id} className="wp-input" value={referenceType} onChange={(e) => setReferenceType(e.target.value)}>
                    <option value="order">order</option>
                    <option value="settlement_line">settlement_line</option>
                    <option value="shipment">shipment</option>
                    <option value="account">account</option>
                  </select>
                )}
              </FormField>
              <FormField label="Reference id">
                {({ id }) => (
                  <Input id={id} value={referenceId} onChange={(e) => setReferenceId(e.target.value)} />
                )}
              </FormField>
              <Button disabled={busy} onClick={() => void submit()}>
                Create ticket
              </Button>
            </Card>
          )}
          {formError ? <Text tone="secondary">{formError}</Text> : null}
          {message ? <Text>{message}</Text> : null}
        </div>
      </div>
    </div>
  );
}
