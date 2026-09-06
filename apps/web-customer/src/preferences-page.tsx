'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from './account-api';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard } from './ui/mg-ui';

const PREF_KEYS: Array<{ key: keyof NotificationPreferences; label: string; hint: string }> = [
  { key: 'email_enabled', label: 'Email', hint: 'Order and appointment updates by email' },
  { key: 'push_enabled', label: 'Push notifications', hint: 'Alerts on your phone' },
  { key: 'sms_enabled', label: 'SMS', hint: 'Delivery and OTP-related texts' },
  { key: 'order_updates', label: 'Order updates', hint: 'Status changes for medicine orders' },
  { key: 'appointment_updates', label: 'Appointment updates', hint: 'Doctor visit reminders' },
  { key: 'delivery_updates', label: 'Delivery updates', hint: 'Shipment and courier alerts' },
  { key: 'marketing', label: 'Offers & reminders', hint: 'Refill reminders and promotions' },
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
    return (
      <AccountPage title="Alerts" subtitle="Choose how we notify you.">
        <EmptyState
          title="Sign in required"
          description="Sign in to manage notification preferences."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </AccountPage>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return (
      <AccountPage title="Alerts" subtitle="Choose how we notify you.">
        <LoadingState label="Loading preferences" />
      </AccountPage>
    );
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return (
      <AccountPage title="Alerts" subtitle="Choose how we notify you.">
        <NetworkErrorState action={{ label: 'Retry', onClick: load }} />
      </AccountPage>
    );
  }

  if (!prefs) {
    return (
      <AccountPage title="Alerts" subtitle="Choose how we notify you.">
        <EmptyState title="Preferences unavailable" description="Could not load notification settings." />
      </AccountPage>
    );
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
    <AccountPage title="Alerts" subtitle="Control order, appointment, and delivery notifications.">
      <p className="mg-toolbar">
        <Link href="/prescriptions" className="mg-btn mg-btn--ghost mg-btn--sm">
          Prescriptions & refill requests
        </Link>
      </p>
      <ul className="mg-order-list">
        {PREF_KEYS.map(({ key, label, hint }) => (
          <li key={key}>
            <MgCard>
              <div className="mg-pref-row">
                <div>
                  <h3 className="mg-list-title">{label}</h3>
                  <p className="mg-list-meta">{hint}</p>
                </div>
                <div className="mg-pref-actions">
                  <span className={`mg-pill ${prefs[key] ? 'mg-pill--on' : ''}`}>
                    {prefs[key] ? 'On' : 'Off'}
                  </span>
                  <MgBtn disabled={saving} variant="secondary" size="sm" onClick={() => void toggle(key)}>
                    Toggle
                  </MgBtn>
                </div>
              </div>
            </MgCard>
          </li>
        ))}
      </ul>
      {message ? <p className="mg-page-subtitle">{message}</p> : null}
    </AccountPage>
  );
}
