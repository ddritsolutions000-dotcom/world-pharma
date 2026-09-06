'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';

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
  const [rows, setRows] = useState<VideoSessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VideoSessionRow | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setDenied(false);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/video-sessions`, {
      headers: adminAuthHeaders(token),
    });
    if (res.status === 403) {
      setDenied(true);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const body = (await res.json()) as { sessions?: VideoSessionRow[] };
    setRows(body.sessions ?? []);
    setLoading(false);
  }, [getAccessToken]);

  const loadDetail = useCallback(
    async (id: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setSelectedId(id);
      setDetail(null);
      setDetailLoading(true);
      const res = await fetch(`${adminApiRoot()}/api/v1/admin/video-sessions/${id}`, {
        headers: adminAuthHeaders(token),
      });
      if (res.status === 403) {
        setDenied(true);
        setDetailLoading(false);
        return;
      }
      if (res.ok) {
        setDetail((await res.json()) as VideoSessionRow);
      }
      setDetailLoading(false);
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void loadList();
    }
  }, [loadList, session.audience, session.status]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (denied) {
    return <PermissionDeniedState />;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Video sessions</Heading>
        <p className="wp-page-intro">
          Read-only operational view. No join, admit, or recording controls.
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void loadList()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh sessions'}
        </Button>
        {selectedId ? (
          <Button variant="ghost" onClick={() => { setSelectedId(null); setDetail(null); }}>
            Close detail
          </Button>
        ) : null}
      </div>
      {loading && !rows.length ? <LoadingState label="Loading video sessions" /> : null}
      {!loading && !rows.length ? (
        <EmptyState title="No video sessions" description="Telehealth sessions appear after appointments start video." />
      ) : null}

      <div className="wp-order-layout">
        {rows.length ? (
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={selectedId === row.id ? 'wp-admin-row-active' : undefined}>
                    <td>{truncateId(row.id)}</td>
                    <td>
                      <span className="wp-status">{row.status.replaceAll('_', ' ').toLowerCase()}</span>
                    </td>
                    <td>{row.provider}</td>
                    <td>
                      <Button
                        size="sm"
                        variant={selectedId === row.id ? 'primary' : 'secondary'}
                        onClick={() => void loadDetail(row.id)}
                      >
                        View detail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {selectedId ? (
          <Card className="wp-order-detail">
            {detailLoading ? <LoadingState label="Loading session" /> : null}
            {detail && !detailLoading ? (
              <div className="wp-stack">
                <h2 className="wp-section-title">Session detail</h2>
                <span className="wp-status">{detail.status.replaceAll('_', ' ').toLowerCase()}</span>
                <p className="wp-list-meta">Provider: {detail.provider}</p>
                <Text size="caption">Started: {detail.started_at ?? '—'}</Text>
                <Text size="caption">Ended: {detail.ended_at ?? '—'}</Text>
                <Text size="caption">Expires: {detail.expires_at}</Text>
                {detail.failure_category ? (
                  <Text size="caption">Failure: {detail.failure_category}</Text>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}
      </div>
    </section>
  );
}
