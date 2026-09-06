'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@world-pharma/ui-kit/web';
import { fetchVendorNotificationInbox } from './vendor-api';
import { vendorTabPath } from './vendor-workspace-nav';

export function VendorNotificationBell({
  token,
  onNavigate,
}: {
  token: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetchVendorNotificationInbox(token);
      setUnread(res.data.filter((item) => !item.read).length);
    } catch {
      setUnread(0);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  return (
    <Button
      variant="tertiary"
      size="sm"
      className="vws-bell-btn"
      onClick={() => {
        router.push(vendorTabPath('notifications'));
        onNavigate();
      }}
      aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
    >
      🔔
      {unread > 0 ? <span className="vws-bell-badge">{unread > 9 ? '9+' : unread}</span> : null}
    </Button>
  );
}
