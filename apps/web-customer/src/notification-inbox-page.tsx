'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import { fetchNotificationInbox, markAllNotificationsRead, markNotificationRead, type InboxItem } from './account-api';
import { customerInboxHref, formatInboxWhen, groupInbox, inboxCategoryLabel } from './notification-inbox';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard } from './ui/mg-ui';

function InboxCard({ item, busy, onMarkRead }: { item: InboxItem; busy: boolean; onMarkRead: (id: string) => void }) {
  const href = customerInboxHref(item);
  return (
    <MgCard className="mg-order-card">
      <div className="mg-order-card-top">
        <div>
          <p className="mg-list-title">{item.title}</p>
          <p className="mg-list-meta">{item.body}</p>
          <p className="mg-order-track-hint">
            {formatInboxWhen(item.created_at)}
            {inboxCategoryLabel(item.reference_type) ? ` · ${inboxCategoryLabel(item.reference_type)}` : ''}
          </p>
        </div>
        <span className={`mg-status${item.read ? '' : ' is-new'}`}>{item.read ? 'Read' : 'New'}</span>
      </div>
      <div className="mg-list-actions">
        {href ? (
          <MgBtn size="sm" href={href}>
            Open
          </MgBtn>
        ) : null}
        {!item.read ? (
          <MgBtn size="sm" variant="ghost" disabled={busy} onClick={() => onMarkRead(item.id)}>
            {busy ? 'Updating…' : 'Mark read'}
          </MgBtn>
        ) : null}
      </div>
    </MgCard>
  );
}

export function NotificationInboxScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated' || session.audience !== 'customer') return;
    setLoading(true);
    void fetchNotificationInbox({ token, onUnauthorized })
      .then((result) => {
        if (result.ok) {
          setItems(result.data.data ?? []);
          setError(null);
        } else if (result.kind === 'forbidden') setError('forbidden');
        else if (result.kind !== 'unauthorized') setError('network');
      })
      .finally(() => setLoading(false));
  }, [getAccessToken, onUnauthorized, session.audience, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    const token = getAccessToken();
    if (!token || session.audience !== 'customer') return;
    setMarkingId(id);
    const result = await markNotificationRead({ token, onUnauthorized, id });
    setMarkingId(null);
    if (result.ok) {
      setItems(result.data.data ?? []);
      setError(null);
    } else if (result.kind === 'forbidden') setError('forbidden');
    else if (result.kind !== 'unauthorized') setError('network');
  }

  async function markAllRead() {
    const token = getAccessToken();
    if (!token || session.audience !== 'customer') return;
    setMarkingId('__all__');
    const result = await markAllNotificationsRead({ token, onUnauthorized });
    setMarkingId(null);
    if (result.ok) {
      setItems(result.data.data ?? []);
      setError(null);
    } else if (result.kind === 'forbidden') setError('forbidden');
    else if (result.kind !== 'unauthorized') setError('network');
  }

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }
  if (session.status !== 'authenticated') {
    return (
      <AccountPage title="Inbox" subtitle="Login to see notifications.">
        <EmptyState title="Sign in required" description="Login to view your notifications." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </AccountPage>
    );
  }
  if (session.audience !== 'customer') return <PermissionDeniedState />;
  if (loading) return <AccountPage title="Inbox"><LoadingState label="Loading inbox" /></AccountPage>;
  if (error === 'forbidden') return <PermissionDeniedState />;
  if (error === 'network') return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;

  const grouped = groupInbox(items);

  return (
    <AccountPage title="Inbox" subtitle="Updates about orders, appointments, and deliveries.">
      {items.length === 0 ? (
        <EmptyState title="No notifications yet" description="We'll notify you when something important happens." />
      ) : (
        <>
          {grouped.unread.length ? (
            <div className="mg-toolbar">
              <MgBtn
                size="sm"
                variant="ghost"
                disabled={markingId === '__all__'}
                onClick={() => void markAllRead()}
              >
                {markingId === '__all__' ? 'Updating…' : 'Mark all read'}
              </MgBtn>
            </div>
          ) : null}
          {grouped.unread.length ? (
            <section className="mg-inbox-group">
              <h2 className="mg-section-title">Unread</h2>
              <ul className="mg-order-list">
                {grouped.unread.map((item) => (
                  <li key={item.id}>
                    <InboxCard item={item} busy={markingId === item.id} onMarkRead={(id) => void markRead(id)} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {grouped.read.length ? (
            <section className="mg-inbox-group">
              <h2 className="mg-section-title">Earlier</h2>
              <ul className="mg-order-list">
                {grouped.read.map((item) => (
                  <li key={item.id}>
                    <InboxCard item={item} busy={markingId === item.id} onMarkRead={(id) => void markRead(id)} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </AccountPage>
  );
}
