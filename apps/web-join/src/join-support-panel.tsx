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
  createJoinSupportTicket,
  fetchJoinSupportTickets,
  type JoinSupportTicket,
} from './join-api';

export function JoinSupportPanel({
  token,
  applicationId,
  onError,
}: {
  token: string;
  applicationId?: string | null;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<JoinSupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchJoinSupportTickets(token);
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
    setBusy(true);
    try {
      await createJoinSupportTicket(token, {
        subject: subject.trim(),
        body: body.trim(),
        reference_type: applicationId ? 'partner_application' : undefined,
        reference_id: applicationId ?? undefined,
      });
      setMessage('Ticket recorded via shared support kernel.');
      setSubject('');
      setBody('');
      await load();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        onError(err);
        return;
      }
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading onboarding support tickets…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Shared support kernel for partner onboarding. Do not paste KYC document contents into tickets.
      </Text>
      <Card>
        <Heading level={2}>Get help</Heading>
        {applicationId ? (
          <Text tone="secondary">Linked application: {applicationId.slice(0, 8)}…</Text>
        ) : (
          <Text tone="secondary">Select an application above to link a ticket, or file a general question.</Text>
        )}
        <FormField label="Subject">
          {({ id }) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}
        </FormField>
        <FormField label="Details">
          {({ id }) => <Input id={id} value={body} onChange={(e) => setBody(e.target.value)} />}
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
          <EmptyState title="No tickets" description="Onboarding support tickets appear here." />
        ) : (
          <Table
            caption="Support tickets"
            columns={['Subject', 'Status']}
            rows={rows.map((row) => [row.subject, row.status])}
          />
        )}
      </Card>
    </div>
  );
}
