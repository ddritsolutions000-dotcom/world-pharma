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
  StoreApiError,
  createStoreSupportTicket,
  fetchStoreSupportTickets,
  type StoreSupportTicket,
} from './store-api';

export function StoreSupportPanel({
  organizationId,
  locationId,
  token,
  onError,
}: {
  organizationId: string;
  locationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<StoreSupportTicket[]>([]);
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
      const res = await fetchStoreSupportTickets(token);
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
      await createStoreSupportTicket(token, {
        organization_id: organizationId,
        location_id: locationId,
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
      if (err instanceof StoreApiError) {
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
    return <LoadingState label="Loading store support tickets…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Shared support kernel with store correlation (order / lot / dispensing case / account). No clinical records.
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
              <option value="order">Order</option>
              <option value="lot">Inventory lot</option>
              <option value="dispensing_case">Dispensing case</option>
              <option value="account">Store account</option>
            </select>
          )}
        </FormField>
        <FormField label="Reference ID (optional)">
          {({ id }) => <Input id={id} value={referenceId} onChange={(e) => setReferenceId(e.target.value)} />}
        </FormField>
        {formError ? <Text tone="secondary">{formError}</Text> : null}
        {message ? <Text tone="secondary">{message}</Text> : null}
        <Button disabled={busy} onClick={() => void submit()}>
          Submit ticket
        </Button>
      </Card>
      <Card>
        <Heading level={2}>My tickets</Heading>
        {!rows.length ? (
          <EmptyState title="No tickets" description="Store support tickets you file appear here." />
        ) : (
          <Table
            caption="Support tickets"
            columns={['Subject', 'Status', 'Reference']}
            rows={rows.map((row) => [
              row.subject,
              row.status,
              row.reference_type
                ? `${row.reference_type}:${(row.reference_id ?? '').slice(0, 8)}`
                : '—',
            ])}
          />
        )}
      </Card>
    </div>
  );
}
