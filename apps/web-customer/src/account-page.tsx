'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchProfile, updateProfile, type CustomerProfile } from './account-api';

export function AccountScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [locale, setLocale] = useState('');
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
    void fetchProfile({ token, onUnauthorized })
      .then((result) => {
        if (result.ok) {
          setProfile(result.data);
          setLocale(result.data.preferred_locale ?? '');
          setError(null);
        } else if (result.kind === 'forbidden') {
          setError('forbidden');
        } else if (result.kind === 'unauthorized') {
          return;
        } else {
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
    return <EmptyState title="Sign in required" description="Sign in with OTP to manage your account." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading account" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;
  }

  if (!profile) {
    return <EmptyState title="Profile unavailable" description="Could not load your profile." />;
  }

  async function saveProfile() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await updateProfile({
      token,
      onUnauthorized,
      preferred_locale: locale.trim() || undefined,
    });
    setSaving(false);
    if (result.ok) {
      setProfile(result.data);
      setMessage('Profile updated.');
    } else if (result.kind === 'forbidden') {
      setError('forbidden');
    } else {
      setMessage(result.error);
    }
  }

  const email = profile.identifiers.find((row) => row.type === 'EMAIL')?.value ?? '—';

  return (
    <section>
      <Heading level={1}>Account</Heading>
      <Text tone="secondary">Manage profile and linked account settings.</Text>
      <Card>
        <Text>Person ID {profile.person_id}</Text>
        <Text>Email {email}</Text>
        <Text>Status {profile.status}</Text>
        <Text size="caption">Last login {profile.last_login_at ?? '—'}</Text>
      </Card>
      <FormField label="Preferred locale">
        {({ id }) => <Input id={id} value={locale} onChange={(e) => setLocale(e.target.value)} />}
      </FormField>
      <Button disabled={saving} onClick={() => void saveProfile()}>
        {saving ? 'Saving…' : 'Save profile'}
      </Button>
      {message ? <Text>{message}</Text> : null}
      <nav className="wp-stack" aria-label="Account sections">
        <Link href="/account/privacy">
          <Button variant="tertiary">Privacy &amp; security</Button>
        </Link>
        <Link href="/account/consent">
          <Button variant="tertiary">Consent management</Button>
        </Link>
        <Link href="/account/addresses">
          <Button variant="tertiary">Addresses</Button>
        </Link>
        <Link href="/account/wishlist">
          <Button variant="tertiary">Wishlist</Button>
        </Link>
        <Link href="/account/preferences">
          <Button variant="tertiary">Notification preferences</Button>
        </Link>
        <Link href="/account/support">
          <Button variant="tertiary">Support</Button>
        </Link>
      </nav>
    </section>
  );
}
