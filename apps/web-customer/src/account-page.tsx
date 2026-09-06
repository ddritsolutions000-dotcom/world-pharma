'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  FormField,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchProfile, updateProfile, type CustomerProfile } from './account-api';
import { AccountHubNav } from './ui/account-hub-nav';
import { MgBtn, MgCard, Page } from './ui/mg-ui';

const PROFILE_MENU = [
  { href: '/orders', label: 'My orders', icon: '📦' },
  { href: '/appointments', label: 'My appointments', icon: '🩺' },
  { href: '/health', label: 'Medical records', icon: '📁' },
  { href: '/lab/bookings', label: 'My lab tests', icon: '🧪' },
  { href: '/radiology/bookings', label: 'Imaging reports', icon: '🩻' },
  { href: '/account/addresses', label: 'Saved addresses', icon: '📍' },
  { href: '/account/loyalty', label: 'Rewards', icon: '⭐' },
  { href: '/care-plan', label: 'Care plans', icon: '💚' },
  { href: '/account/preferences', label: 'Settings', icon: '⚙️' },
  { href: '/account/support', label: 'Help & support', icon: '💬' },
] as const;

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
    return (
      <Page>
        <section className="mg-service-hero mg-service-hero--compact" aria-label="Account">
          <p className="mg-service-kicker">World-Pharma™ account</p>
          <h1 className="mg-service-title">My Account</h1>
          <p className="mg-service-sub">Sign in to manage profile, orders, and health records.</p>
        </section>
        <MgCard className="mg-signin-card">
          <EmptyState
            title="Sign in required"
            description="Use our secure OTP login or create a new account."
            action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
          />
          <p className="mg-auth-alt">
            New here? <Link href="/signup">Create an account</Link>
          </p>
        </MgCard>
      </Page>
    );
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
  const displayName = email.includes('@') ? email.split('@')[0] : email;
  const initials = displayName
    .slice(0, 2)
    .toUpperCase();

  return (
    <Page>
      <AccountHubNav />
      <section className="wp-profile-hero" aria-label="Profile">
        <div className="wp-profile-avatar" aria-hidden>
          {initials || 'WP'}
        </div>
        <div>
          <h1 className="wp-profile-name">{displayName}</h1>
          <p className="wp-profile-email">{email}</p>
          <p className="wp-profile-meta">{profile.status === 'ACTIVE' ? 'Active account' : profile.status}</p>
        </div>
      </section>

      <ul className="wp-profile-menu">
        {PROFILE_MENU.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="wp-profile-menu-row">
              <span className="wp-profile-menu-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="wp-profile-menu-label">{item.label}</span>
              <span className="wp-profile-menu-chevron" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <MgCard>
        <FormField label="Preferred locale">
          {({ id }) => <Input id={id} value={locale} onChange={(e) => setLocale(e.target.value)} />}
        </FormField>
        <MgBtn onClick={() => void saveProfile()}>{saving ? 'Saving…' : 'Save profile'}</MgBtn>
        {message ? <Text>{message}</Text> : null}
      </MgCard>
      <MgBtn variant="secondary" onClick={() => signOut()}>
        Logout
      </MgBtn>
    </Page>
  );
}
