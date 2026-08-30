'use client';

import { useState } from 'react';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';

type VideoSessionRow = {
  id: string;
  appointment_id: string;
  encounter_id: string | null;
  provider: string;
  status: string;
  recording_enabled: false;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string;
  failure_category: string | null;
};

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function VideoAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<VideoSessionRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VideoSessionRow | null>(null);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function loadList() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoadError(false);
    setDenied(false);
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/video-sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setLoadError(true);
      return;
    }
    const body = (await res.json()) as { sessions?: VideoSessionRow[] };
    setRows(body.sessions ?? []);
  }

  async function loadDetail(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSelectedId(id);
    setDetail(null);
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/video-sessions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setLoadError(true);
      return;
    }
    setDetail((await res.json()) as VideoSessionRow);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section>
      <Heading level={2}>Video sessions</Heading>
      <Text tone="secondary">
        Read-only operational view. No join, admit, or recording controls. Clinical access is not bypassed.
      </Text>
      <Button onClick={() => void loadList()}>Load sessions</Button>
      {denied ? (
        <EmptyState title="Permission denied" description="Requires video:read." />
      ) : null}
      {loadError ? (
        <EmptyState title="Unable to load" description="Check network and try again." />
      ) : null}
      {rows ? (
        <Card>
          <Text>{rows.length} session(s)</Text>
          {rows.map((row) => (
            <div key={row.id} style={{ marginTop: 8 }}>
              <Text>{`${truncateId(row.id)} · ${row.status} · ${row.provider}`}</Text>
              <Text size="caption" tone="secondary">
                {`Appointment ${truncateId(row.appointment_id)} · recording off`}
              </Text>
              <Button variant="secondary" size="sm" onClick={() => void loadDetail(row.id)}>
                View detail
              </Button>
            </div>
          ))}
        </Card>
      ) : null}
      {selectedId && detail ? (
        <Card>
          <Heading level={3}>Session detail</Heading>
          <Text>{`Status: ${detail.status}`}</Text>
          <Text size="caption">{`Provider: ${detail.provider}`}</Text>
          <Text size="caption">{`Recording: ${detail.recording_enabled === false ? 'off' : 'blocked'}`}</Text>
          <Text size="caption">{`Started: ${detail.started_at ?? '—'}`}</Text>
          <Text size="caption">{`Ended: ${detail.ended_at ?? '—'}`}</Text>
          <Text size="caption">{`Expires: ${detail.expires_at}`}</Text>
          {detail.failure_category ? (
            <Text size="caption">{`Failure: ${detail.failure_category}`}</Text>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
