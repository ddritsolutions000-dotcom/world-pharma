'use client';

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
  Text,
} from '@world-pharma/ui-kit/web';
import { createDoctorSupportTicket, fetchDoctorSupportTickets, type DoctorSupportTicket } from './doctor-api';
import { DoctorLoadFailure, mapDoctorApiFailure, type DoctorLoadError } from './doctor-load-state';

export function DoctorSupportPanel() {
  const { getAccessToken, session, expire } = useSession();
  const [rows, setRows] = useState<DoctorSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DoctorLoadError | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.audience !== 'doctor') {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchDoctorSupportTickets({ token, onUnauthorized: () => expire() });
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      setRows([]);
    } else {
      setRows(result.data.data ?? []);
      setError(null);
    }
    setLoading(false);
  }, [expire, getAccessToken, session.audience]);

  useEffect(() => {
    void load();
  }, [load]);

  if (session.audience !== 'doctor') {
    return (
      <DoctorLoadFailure
        error="forbidden"
        onRetry={() => void load()}
        forbiddenDescription="Sign in with a doctor partner account to open support."
      />
    );
  }
  if (loading) {
    return <LoadingState label="Loading support tickets" />;
  }
  if (error) {
    return <DoctorLoadFailure error={error} onRetry={() => void load()} />;
  }

  async function submit() {
    const token = getAccessToken();
    if (!token || !subject.trim() || !body.trim()) {
      return;
    }
    const result = await createDoctorSupportTicket({
      token,
      onUnauthorized: () => expire(),
      subject: subject.trim(),
      body: body.trim(),
    });
    if (result.ok) {
      setSubject('');
      setBody('');
      setMessage('Ticket created.');
      await load();
    } else {
      setMessage(result.error);
    }
  }

  return (
    <section className="wp-stack">
      <Heading level={1}>Support</Heading>
      <Text tone="secondary">Contact World-Pharma operations. Do not include patient identifiers in free-text fields.</Text>
      <Card>
        <FormField label="Subject">
          {({ id }) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}
        </FormField>
        <FormField label="Message">
          {({ id }) => <Input id={id} value={body} onChange={(e) => setBody(e.target.value)} />}
        </FormField>
        <Button onClick={() => void submit()}>Create ticket</Button>
        {message ? <Text tone="secondary">{message}</Text> : null}
      </Card>
      {!rows.length ? (
        <EmptyState title="No tickets yet" description="Create a ticket for credential, scheduling, or platform help." />
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <Heading level={3}>{row.subject}</Heading>
            <Text tone="secondary">
              {row.status} · {row.updated_at.slice(0, 19)}
            </Text>
          </Card>
        ))
      )}
    </section>
  );
}
