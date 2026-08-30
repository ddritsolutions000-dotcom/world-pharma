'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
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
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { createSupportTicket, fetchSupportTickets, type SupportTicket } from './account-api';

export function SupportScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [correlationPrescriptionId, setCorrelationPrescriptionId] = useState('');
  const [correlationDispensingCaseId, setCorrelationDispensingCaseId] = useState('');
  const [correlationOrderId, setCorrelationOrderId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void fetchSupportTickets({ token, onUnauthorized })
      .then((result) => {
        if (result.ok) {
          setRows(result.data.data ?? []);
          setError(null);
        } else if (result.kind === 'forbidden') {
          setError('forbidden');
        } else if (result.kind !== 'unauthorized') {
          setError('network');
        }
      })
      .finally(() => setLoading(false));
  }, [getAccessToken, onUnauthorized, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Sign in to contact support." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading support tickets" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;
  }

  async function submitTicket() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const correlationLines = [
      correlationPrescriptionId.trim() ? `prescription_id: ${correlationPrescriptionId.trim()}` : null,
      correlationDispensingCaseId.trim() ? `dispensing_case_id: ${correlationDispensingCaseId.trim()}` : null,
      correlationOrderId.trim() ? `order_id: ${correlationOrderId.trim()}` : null,
    ].filter(Boolean);
    const ticketBody =
      correlationLines.length > 0
        ? `${body.trim()}\n\n---\nCorrelation IDs:\n${correlationLines.join('\n')}`
        : body;
    const result = await createSupportTicket({ token, onUnauthorized, subject, body: ticketBody });
    if (result.ok) {
      setSubject('');
      setBody('');
      setCorrelationPrescriptionId('');
      setCorrelationDispensingCaseId('');
      setCorrelationOrderId('');
      setMessage('Ticket submitted.');
      load();
    } else {
      setMessage(result.error);
    }
  }

  return (
    <section>
      <Heading level={1}>Support</Heading>
      <Text tone="secondary">Open a ticket for order or account help. Responses are sandbox-only.</Text>
      <Link href="/account">
        <Button variant="tertiary" size="sm">
          Back to account
        </Button>
      </Link>
      {!rows.length ? (
        <EmptyState title="No tickets" description="You have not opened a support ticket yet." />
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <Text>{row.subject}</Text>
            <Text size="caption">
              {row.status} · {row.created_at}
            </Text>
            <Text>{row.body}</Text>
          </Card>
        ))
      )}
      <Card>
        <Heading level={3}>New ticket</Heading>
        <FormField label="Subject">
          {({ id }) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}
        </FormField>
        <FormField label="Message">
          {({ id }) => <Input id={id} value={body} onChange={(e) => setBody(e.target.value)} />}
        </FormField>
        <Text size="caption" tone="secondary">
          Optional correlation IDs (helps support trace Rx orders — IDs only, no clinical details)
        </Text>
        <FormField label="Prescription ID (optional)">
          {({ id }) => (
            <Input id={id} value={correlationPrescriptionId} onChange={(e) => setCorrelationPrescriptionId(e.target.value)} />
          )}
        </FormField>
        <FormField label="Dispensing case ID (optional)">
          {({ id }) => (
            <Input
              id={id}
              value={correlationDispensingCaseId}
              onChange={(e) => setCorrelationDispensingCaseId(e.target.value)}
            />
          )}
        </FormField>
        <FormField label="Order ID (optional)">
          {({ id }) => (
            <Input id={id} value={correlationOrderId} onChange={(e) => setCorrelationOrderId(e.target.value)} />
          )}
        </FormField>
        <Button onClick={() => void submitTicket()}>Submit ticket</Button>
      </Card>
      {message ? <Text>{message}</Text> : null}
    </section>
  );
}
