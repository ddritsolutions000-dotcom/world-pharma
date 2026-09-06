'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchJoinInbox, markJoinInboxRead, type JoinInboxItem } from './join-api';

export function JoinInboxPanel({
  token,
  onOpenApplication,
  onError,
}: {
  token: string;
  onOpenApplication?: (applicationId: string) => void;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<JoinInboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchJoinInbox(token);
      setRows(body.data ?? []);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    setMarkingId(id);
    try {
      await markJoinInboxRead(token, id);
      await load();
    } catch (err) {
      onError(err);
    } finally {
      setMarkingId(null);
    }
  }

  if (loading && !rows.length) {
    return <LoadingState label="Loading notifications" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Application status updates from World-Pharma operations. No document contents are shown here.
      </Text>
      {!rows.length ? (
        <EmptyState title="No notifications" description="Updates appear when your application status changes." />
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <Heading level={4}>{row.title}</Heading>
            <Text>{row.body}</Text>
            <Text size="caption" tone="secondary">
              {row.reference_type ?? 'update'}
            </Text>
            {row.reference_type === 'partner_application' && row.reference_id && onOpenApplication ? (
              <Button variant="secondary" size="sm" onClick={() => onOpenApplication(row.reference_id!)}>
                View application
              </Button>
            ) : null}
            {!row.read ? (
              <Button variant="tertiary" size="sm" disabled={markingId === row.id} onClick={() => void markRead(row.id)}>
                {markingId === row.id ? 'Updating…' : 'Mark as read'}
              </Button>
            ) : null}
          </Card>
        ))
      )}
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh
      </Button>
    </div>
  );
}
