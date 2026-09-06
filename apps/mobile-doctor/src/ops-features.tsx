import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  fetchDoctorInbox,
  fetchDoctorSupportTickets,
  createDoctorSupportTicket,
  markDoctorInboxRead,
  type DoctorInboxItem,
  type DoctorSupportTicket,
} from './doctor-api';

export function DoctorInboxScreen({ token }: { token: string }) {
  const [rows, setRows] = useState<DoctorInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchDoctorInbox(token);
      setRows(body.data ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <NativeLoadingState title="Loading inbox" />;
  }
  if (error) {
    return <NativeNetworkErrorState onRetry={() => void load()} />;
  }
  if (!rows.length) {
    return <NativeEmptyState title="No notifications" description="Appointment and credential updates appear here." />;
  }

  return (
    <View>
      {rows.map((row) => (
        <NativeCard key={row.id}>
          <NativeText variant="h2">{row.title}</NativeText>
          <NativeText>{row.body}</NativeText>
          {!row.read ? (
            <NativeButton
              label="Mark read"
              variant="secondary"
              onPress={() => void markDoctorInboxRead(token, row.id).then(load)}
            />
          ) : null}
        </NativeCard>
      ))}
    </View>
  );
}

export function DoctorSupportScreen({ token }: { token: string }) {
  const [rows, setRows] = useState<DoctorSupportTicket[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchDoctorSupportTickets(token);
    setRows(res.data ?? []);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!subject.trim() || !body.trim()) {
      return;
    }
    setBusy(true);
    try {
      await createDoctorSupportTicket(token, { subject: subject.trim(), body: body.trim() });
      setSubject('');
      setBody('');
      setMessage('Ticket created.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <NativeText variant="caption">Contact operations — do not include patient identifiers.</NativeText>
      <NativeCard>
        <NativeText variant="h2">New ticket</NativeText>
        <NativeInput label="Subject" value={subject} onChangeText={setSubject} />
        <NativeInput label="Message" value={body} onChangeText={setBody} />
        <NativeButton label={busy ? 'Submitting…' : 'Create ticket'} onPress={() => void submit()} />
        {message ? <NativeText variant="caption">{message}</NativeText> : null}
      </NativeCard>
      {!rows.length ? (
        <NativeEmptyState title="No tickets" description="Create a ticket for platform help." />
      ) : (
        rows.map((row) => (
          <NativeCard key={row.id}>
            <NativeText variant="h2">{row.subject}</NativeText>
            <NativeText variant="caption">{row.status}</NativeText>
          </NativeCard>
        ))
      )}
    </View>
  );
}
