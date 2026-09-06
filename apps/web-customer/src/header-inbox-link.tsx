'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { fetchNotificationInbox } from './account-api';
import { unreadInboxCount } from './notification-inbox';

export function HeaderInboxLink() {
  const { session, getAccessToken, expire } = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (session.status !== 'authenticated') {
      setUnread(0);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    void fetchNotificationInbox({ token, onUnauthorized: expire }).then((result) => {
      if (result.ok) setUnread(unreadInboxCount(result.data.data ?? []));
    });
  }, [expire, getAccessToken, session.status]);

  if (session.status !== 'authenticated') return null;

  return (
    <Link href="/account/notifications" className="mg-header-link mg-header-inbox" aria-label="Inbox">
      Inbox
      {unread > 0 ? <span className="mg-inbox-count">{unread > 9 ? '9+' : unread}</span> : null}
    </Link>
  );
}
