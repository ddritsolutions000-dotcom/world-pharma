'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from './account-api';

const PREF_KEYS: Array<{ key: keyof NotificationPreferences; label: string }> = [
  { key: 'email_enabled', label: 'Email notifications' },
  { key: 'push_enabled', label: 'Push notifications' },
  { key: 'sms_enabled', label: 'SMS notifications' },
  { key: 'order_updates', label: 'Order updates' },
  { key: 'appointment_updates', label: 'Appointment updates' },
  { key: 'delivery_updates', label: 'Delivery updates' },
  { key: 'marketing', label: 'Marketing' },
];

export function PreferencesScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void fetchNotificationPreferences({ token, onUnauthorized })
      .then((result) => {
        if (result.ok) {
          setPrefs(result.data);
          setError(null);
        } else if (result.kind === 'forbidden') {
          setError('forbidden');
        } else if (result.kind !== 'unauthorized') {
          setError('network');
        }
      })
      .finally(() => setLoading(false));
  }, [getAccessToken, onUnauthorized, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Sign in to manage notification preferences." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading preferences" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;
  }

  if (!prefs) {
    return <EmptyState title="Preferences unavailable" description="Could not load notification settings." />;
  }

  async function toggle(key: keyof NotificationPreferences) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSaving(true);
    setMessage(null);
    const next = { ...prefs!, [key]: !prefs![key] };
    const result = await updateNotificationPreferences({ token, onUnauthorized, ...next });
    setSaving(false);
    if (result.ok) {
      setPrefs(result.data);
      setMessage('Preferences saved.');
    } else {
      setMessage(result.error);
    }
  }

  return (
    <section>
      <Heading level={1}>Notification preferences</Heading>
      <Text tone="secondary">
        Choose which updates you receive. Marketing is off by default. When enabled, you may receive reorder and refill
        reminders (commerce-only). Open prescriptions for refill requests.
      </Text>
      <Link href="/account">
        <Button variant="tertiary" size="sm">
          Back to account
        </Button>
      </Link>
      <Link href="/prescriptions">
        <Button variant="tertiary" size="sm">
          Prescriptions & refill requests
        </Button>
      </Link>
      {PREF_KEYS.map(({ key, label }) => (
        <Card key={key}>
          <Text>{label}</Text>
          <Text size="caption">{prefs[key] ? 'On' : 'Off'}</Text>
          <Button disabled={saving} variant="secondary" size="sm" onClick={() => void toggle(key)}>
            Toggle
          </Button>
        </Card>
      ))}
      {message ? <Text>{message}</Text> : null}
    </section>
  );
}
