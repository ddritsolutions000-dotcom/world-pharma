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
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  createVendorSupportTicket,
  fetchVendorSupportTickets,
  type VendorSupportTicket,
} from './vendor-api';

export function VendorSupportPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<VendorSupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [referenceType, setReferenceType] = useState('order');
  const [referenceId, setReferenceId] = useState('');

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
      setMessage('Ticket recorded via shared support kernel.');
      setSubject('');
      setBody('');
      setReferenceId('');
      await load();
    } catch (err) {
      if (err instanceof VendorApiError) {
        if (err.status === 401 || err.status === 403) {
          onError(err);
          return;
        }
        setFormError(err.message);
        return;
      }
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading seller support tickets…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Shared support kernel with seller correlation (order / settlement / shipment / account). No clinical records.
      </Text>
      <Card>
        <Heading level={2}>New ticket</Heading>
        <FormField label="Subject">
          {({ id }) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}
        </FormField>
        <FormField label="Details">
          {({ id }) => <Input id={id} value={body} onChange={(e) => setBody(e.target.value)} />}
        </FormField>
        <FormField label="Reference type">
          {({ id }) => (
            <select
              id={id}
              className="wp-input"
              value={referenceType}
              onChange={(e) => setReferenceType(e.target.value)}
            >
              <option value="order">order</option>
              <option value="settlement_line">settlement_line</option>
              <option value="shipment">shipment</option>
              <option value="account">account</option>
            </select>
          )}
        </FormField>
        <FormField label="Reference id (optional)">
          {({ id }) => (
            <Input
              id={id}
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder={referenceType === 'account' ? organizationId : 'uuid'}
            />
          )}
        </FormField>
        <Button disabled={busy} onClick={() => void submit()}>
          {busy ? 'Submitting…' : 'Create ticket'}
        </Button>
        {formError ? <Text tone="secondary">{formError}</Text> : null}
        {message ? <Text>{message}</Text> : null}
      </Card>

      {!rows.length ? (
        <EmptyState title="No tickets yet" description="Create a ticket correlated to your seller operations." />
      ) : (
        <Table
          caption="Support tickets"
          columns={['When', 'Subject', 'Status', 'Ref']}
          rows={rows.map((row) => [
            String(row.created_at).slice(0, 19),
            row.subject,
            row.status,
            row.reference_type
              ? `${row.reference_type}:${(row.reference_id ?? '').slice(0, 8)}`
              : '—',
          ])}
        />
      )}
    </div>
  );
}
