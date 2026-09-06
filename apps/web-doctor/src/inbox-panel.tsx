'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchNotificationInbox, markNotificationRead, type InboxItem } from './doctor-api';
import { DoctorLoadFailure, mapDoctorApiFailure, type DoctorLoadError } from './doctor-load-state';
import { doctorInboxHref, formatInboxWhen, groupInbox, inboxCategoryLabel } from './notification-inbox';

function InboxCard({
  item,
  busy,
  onMarkRead,
}: {
  item: InboxItem;
  busy: boolean;
  onMarkRead: (id: string) => void;
}) {
  const href = doctorInboxHref(item);
  const category = inboxCategoryLabel(item.reference_type);
  return (
    <Card>
      <div className="wp-stack">
        <Badge kind={item.read ? 'info' : 'pending'}>{item.read ? 'Read' : 'Unread'}</Badge>
        <Heading level={3}>{item.title}</Heading>
        <Text>{item.body}</Text>
        <Text size="caption" tone="secondary">
          {formatInboxWhen(item.created_at)}
          {category ? ` · ${category}` : ''}
        </Text>
        <div className="wp-stack">
          {href ? (
            <Link href={href}>
              <Button variant="secondary" size="sm">
                Open
              </Button>
            </Link>
          ) : null}
          {!item.read ? (
            <Button variant="tertiary" size="sm" disabled={busy} onClick={() => onMarkRead(item.id)}>
              {busy ? 'Updating…' : 'Mark as read'}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function DoctorInboxPanel() {
  const { getAccessToken, session, expire } = useSession();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DoctorLoadError | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.audience !== 'doctor') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchNotificationInbox({ token, onUnauthorized: () => expire() });
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      setItems([]);
    } else {
      setItems(result.data.data ?? []);
    }
    setLoading(false);
  }, [expire, getAccessToken, session.audience]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  async function markRead(id: string) {
    const token = getAccessToken();
    if (!token || session.audience !== 'doctor') {
      return;
    }
    setMarkingId(id);
    const result = await markNotificationRead({ token, onUnauthorized: () => expire(), id });
    setMarkingId(null);
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      return;
    }
    setItems(result.data.data ?? []);
  }

  if (session.audience !== 'doctor') {
    return (
      <DoctorLoadFailure
        error="forbidden"
        onRetry={() => void load()}
        forbiddenDescription="Sign in with a doctor partner account to open inbox."
      />
    );
  }

  if (loading) {
    return <LoadingState label="Loading inbox" />;
  }
  if (error) {
    return <DoctorLoadFailure error={error} onRetry={() => void load()} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No notifications"
        description="Appointment and consult updates for your doctor account will appear here."
      />
    );
  }

  const grouped = groupInbox(items);
  return (
    <>
      <Text size="caption" tone="secondary">
        Showing the latest {items.length} notification{items.length === 1 ? '' : 's'}.
      </Text>
      {grouped.unread.length ? (
        <>
          <Heading level={2}>Unread</Heading>
          {grouped.unread.map((item) => (
            <InboxCard key={item.id} item={item} busy={markingId === item.id} onMarkRead={(id) => void markRead(id)} />
          ))}
        </>
      ) : null}
      {grouped.read.length ? (
        <>
          <Heading level={2}>Earlier</Heading>
          {grouped.read.map((item) => (
            <InboxCard key={item.id} item={item} busy={markingId === item.id} onMarkRead={(id) => void markRead(id)} />
          ))}
        </>
      ) : null}
    </>
  );
}
