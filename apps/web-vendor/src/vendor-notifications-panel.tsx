'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  fetchVendorNotificationInbox,
  fetchVendorNotificationPreferences,
  updateVendorNotificationPreferences,
  type VendorInboxItem,
  type VendorNotificationPreferences,
} from './vendor-api';

export function VendorNotificationsPanel({
  token,
  onError,
}: {
  token: string;
  onError: (err: unknown) => void;
}) {
  const [prefs, setPrefs] = useState<VendorNotificationPreferences | null>(null);
  const [inbox, setInbox] = useState<VendorInboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, box] = await Promise.all([
        fetchVendorNotificationPreferences(token),
        fetchVendorNotificationInbox(token),
      ]);
      setPrefs(p);
      setInbox(box.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (key: keyof VendorNotificationPreferences) => {
    if (!prefs) {
      return;
    }
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      const next = await updateVendorNotificationPreferences(token, { [key]: !prefs[key] });
      setPrefs(next);
      setMessage('Preferences saved (shared notification kernel).');
    } catch (err) {
      if (err instanceof VendorApiError) {
        if (err.status === 401 || err.status === 403) {
          onError(err);
          return;
        }
        setFormError(err.message);
        return;
      }
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !prefs) {
    return <LoadingState label="Loading notification preferences and inbox…" />;
  }

  const toggles: Array<{ key: keyof VendorNotificationPreferences; label: string }> = [
    { key: 'email_enabled', label: 'Email' },
    { key: 'order_updates', label: 'Order updates' },
    { key: 'settlement_updates', label: 'Settlement updates' },
    { key: 'support_updates', label: 'Support updates' },
    { key: 'delivery_updates', label: 'Delivery updates' },
    { key: 'marketing', label: 'Marketing' },
  ];

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Shared notification prefs + in-app inbox. No PHI in notification payloads. External channels remain sandbox-gated.
      </Text>
      <Card>
        <Heading level={2}>Preferences</Heading>
        {toggles.map((item) => (
          <FormField key={item.key} label={item.label}>
            {({ id }) => (
              <label htmlFor={id} className="wp-stack" style={{ flexDirection: 'row', gap: 8 }}>
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(prefs[item.key])}
                  disabled={busy}
                  onChange={() => void toggle(item.key)}
                />
                <Text size="caption">{prefs[item.key] ? 'on' : 'off'}</Text>
              </label>
            )}
          </FormField>
        ))}
        {formError ? <Text tone="secondary">{formError}</Text> : null}
        {message ? <Text>{message}</Text> : null}
      </Card>

      <Card>
        <Heading level={2}>Inbox</Heading>
        {!inbox.length ? (
          <EmptyState title="Inbox empty" description="Support acknowledgements and gated seller notices appear here." />
        ) : (
          <Table
            caption="Notification inbox"
            columns={['When', 'Title', 'Body', 'Ref']}
            rows={inbox.map((row) => [
              String(row.created_at).slice(0, 19),
              row.title,
              row.body,
              row.reference_type ?? '—',
            ])}
          />
        )}
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
          Refresh
        </Button>
      </Card>
    </div>
  );
}
