'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { fetchStoreNotificationInbox, markStoreNotificationRead, StoreApiError, type StoreInboxItem } from './store-api';

export function StoreNotificationsPanel({
  token,
  onError,
}: {
  token: string;
  onError: (err: unknown) => void;
}) {
  const [inbox, setInbox] = useState<StoreInboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchStoreNotificationInbox(token);
      setInbox(body.data ?? []);
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
      await markStoreNotificationRead(token, id);
      await load();
    } catch (err) {
      if (err instanceof StoreApiError) {
        onError(err);
      }
    } finally {
      setMarkingId(null);
    }
  }

  if (loading && !inbox.length) {
    return <LoadingState label="Loading store inbox" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Shared notification kernel for store operators. No PHI in notification bodies. External channels remain sandbox-gated.
      </Text>
      {!inbox.length ? (
        <EmptyState title="Inbox empty" description="Order, support, and operational notices appear here when emitted." />
      ) : (
        inbox.map((row) => (
          <Card key={row.id}>
            <Text>{row.title}</Text>
            <Text tone="secondary">{row.body}</Text>
            <Text size="caption" tone="secondary">
              {String(row.created_at).slice(0, 19)} · {row.reference_type ?? 'notice'}
            </Text>
            {!row.read ? (
              <Button size="sm" variant="secondary" disabled={markingId === row.id} onClick={() => void markRead(row.id)}>
                {markingId === row.id ? 'Updating…' : 'Mark as read'}
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
