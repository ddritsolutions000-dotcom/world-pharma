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
  createJoinSupportTicket,
  fetchJoinSupportTickets,
  type JoinSupportTicket,
} from './vendor-join-api';

export function VendorJoinSupportPanel({
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
      setMessage('Support ticket recorded.');
      setSubject('');
      setBody('');
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading support tickets…" />;
  }

  return (
    <div className="wp-stack">
      <FormField label="Subject">
        {({ id }) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}
      </FormField>
      <FormField label="Details">
        {({ id }) => (
          <TextArea id={id} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        )}
      </FormField>
      <Button disabled={busy} onClick={() => void submit()}>
        {busy ? 'Submitting…' : 'Create ticket'}
      </Button>
      {formError ? <Text tone="secondary">{formError}</Text> : null}
      {message ? <Text>{message}</Text> : null}
      {!rows.length ? (
        <Text tone="secondary" size="caption">
          No tickets yet for this application.
        </Text>
      ) : (
        <ul className="wp-mini-list">
          {rows.map((row) => (
            <li key={row.id} className="wp-mini-row">
              <div className="wp-mini-main">
                <p className="wp-mini-title">{row.subject}</p>
                <p className="wp-mini-meta">
                  {row.status} · {String(row.created_at).slice(0, 19)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
