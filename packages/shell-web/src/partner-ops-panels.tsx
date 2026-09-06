'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiBaseUrl } from '@world-pharma/shell-core';
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

type InboxItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

type SupportTicket = {
  id: string;
  subject: string;
  body?: string;
  status: string;
  created_at?: string;
};

async function fetchInbox(token: string) {
  const res = await fetch(`${apiBaseUrl()}/api/v1/me/notifications/inbox`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body.detail as string) ?? 'request_failed');
  }
  return body as { data: InboxItem[] };
}

async function markRead(token: string, id: string) {
  const res = await fetch(`${apiBaseUrl()}/api/v1/me/notifications/inbox/${id}/read`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('mark_read_failed');
  }
}

async function fetchTickets(token: string) {
  const res = await fetch(`${apiBaseUrl()}/api/v1/support/tickets`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body.detail as string) ?? 'request_failed');
  }
  return body as { data: SupportTicket[] };
}

async function createTicket(token: string, input: { subject: string; body: string }) {
  const res = await fetch(`${apiBaseUrl()}/api/v1/support/tickets`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error('create_failed');
  }
}

export function PartnerInboxPanel({
  token,
  audienceLabel,
}: {
  token: string;
  audienceLabel: string;
}) {
  const [rows, setRows] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchInbox(token);
      setRows(body.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !rows.length) {
    return <LoadingState label={`Loading ${audienceLabel} inbox`} />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">Operational notices for {audienceLabel}. No PHI in notification bodies.</Text>
      {!rows.length ? (
        <EmptyState title="Inbox empty" description="Platform and booking notices appear here when emitted." />
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <Text>{row.title}</Text>
            <Text tone="secondary">{row.body}</Text>
            {!row.read ? (
              <Button size="sm" variant="secondary" onClick={() => void markRead(token, row.id).then(load)}>
                Mark as read
              </Button>
            ) : (
              <Text size="caption">Read</Text>
            )}
          </Card>
        ))
      )}
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh
      </Button>
    </div>
  );
}

export function PartnerSupportPanel({
  token,
  audienceLabel,
}: {
  token: string;
  audienceLabel: string;
}) {
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTickets(token);
      setRows(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !rows.length) {
    return <LoadingState label="Loading support tickets" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">Shared support kernel for {audienceLabel}. No PHI in tickets.</Text>
      <Card>
        <Heading level={3}>New ticket</Heading>
        <FormField label="Subject">
          {({ id }) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}
        </FormField>
        <FormField label="Message">
          {({ id }) => <Input id={id} value={body} onChange={(e) => setBody(e.target.value)} />}
        </FormField>
        <Button
          size="sm"
          onClick={() => {
            void createTicket(token, { subject: subject.trim(), body: body.trim() })
              .then(() => {
                setSubject('');
                setBody('');
                setMessage('Ticket created.');
                return load();
              })
              .catch(() => setMessage('Create failed.'));
          }}
        >
          Create ticket
        </Button>
        {message ? <Text size="caption">{message}</Text> : null}
      </Card>
      {!rows.length ? (
        <EmptyState title="No tickets" description="Open a ticket for logistics or platform help." />
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <Text>{row.subject}</Text>
            <Text tone="secondary">{row.status}</Text>
          </Card>
        ))
      )}
    </div>
  );
}
