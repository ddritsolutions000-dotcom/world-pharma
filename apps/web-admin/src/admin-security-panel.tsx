'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminViewLoadError } from './admin-request-error';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminJson, AdminHttpError, adminAuthHeaders, classifyAdminViewState } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';

type BootstrapProfile = {
  person_id?: string;
  preferred_locale?: string;
  primary_country_id?: string | null;
  roles?: string[];
  permissions?: string[];
  last_login_at?: string | null;
  mfa?: {
    enrolled?: boolean;
    required?: boolean;
    policy_required?: boolean;
    recovery_codes_remaining?: number;
  };
};

type SessionRow = {
  id?: string;
  status?: string;
  created_at?: string;
  last_seen_at?: string;
  is_current?: boolean;
  ip_hint?: string | null;
  device_hint?: string | null;
};

type SecurityEvent = {
  type?: string;
  outcome?: string;
  created_at?: string;
  request_id?: string;
};

export function AdminSecurityPanel() {
  const router = useRouter();
  const { session, getAccessToken, signOut } = useSession();
  const [profile, setProfile] = useState<BootstrapProfile | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<'forbidden' | 'network' | 'error' | null>(null);

  const token = getAccessToken();

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bootstrap = await adminJson<BootstrapProfile>(token, '/api/v1/auth/bootstrap');
      setProfile(bootstrap);
      try {
        const sessionRes = await adminJson<{ data?: SessionRow[] }>(token, '/api/v1/auth/sessions');
        setSessions(sessionRes.data ?? []);
      } catch {
        setSessions([]);
      }
      try {
        const personId = bootstrap.person_id;
        const qs = personId ? `?person_id=${encodeURIComponent(personId)}&limit=25` : '?limit=25';
        const audit = await adminJson<{ data?: SecurityEvent[] }>(token, `/api/v1/admin/security-events${qs}`);
        setEvents(audit.data ?? []);
      } catch (err) {
        if (err instanceof AdminHttpError && err.status === 403) {
          setEvents([]);
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (err instanceof AdminHttpError && err.status === 403) {
        setError('forbidden');
      } else {
        setError(classifyAdminViewState(err));
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  const logoutAll = async () => {
    if (!token) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await fetch(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/auth/logout-all`, {
        method: 'POST',
        credentials: 'include',
        headers: adminAuthHeaders(token),
      });
      setMessage('All sessions revoked. Signing out on this device.');
      signOut();
      router.replace('/login');
    } catch {
      setMessage('Could not revoke all sessions. Try again or contact security ops.');
    } finally {
      setBusy(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    if (!token) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await adminJson(token, `/api/v1/auth/sessions/${sessionId}/revoke`, { method: 'POST' });
      setMessage('Session revoked.');
      await load();
    } catch {
      setMessage('Could not revoke session.');
    } finally {
      setBusy(false);
    }
  };

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (loading) {
    return <LoadingState label="Loading account security…" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network' || error === 'error') {
    return <AdminViewLoadError viewState={error} onRetry={() => void load()} />;
  }

  const roles = profile?.roles ?? [];
  const permissions = profile?.permissions ?? session.permissions ?? [];
  const mfa = profile?.mfa;

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Security center</Heading>
        <Text tone="secondary" className="wp-page-intro">
          Sessions, MFA posture, administrator management, and authentication activity for Main Admin.
        </Text>
        <div className="wp-toolbar">
          <Link href="/security/admins">Administrator roster →</Link>
          <Link href="/audit">Audit explorer →</Link>
        </div>
      </header>

      <div className="wp-admin-grid-2">
        <Card>
          <Heading level={3}>My account</Heading>
          <dl className="admin-kv-list">
            <div>
              <dt>Person ID</dt>
              <dd>{profile?.person_id ?? '—'}</dd>
            </div>
            <div>
              <dt>Locale</dt>
              <dd>{profile?.preferred_locale ?? '—'}</dd>
            </div>
            <div>
              <dt>Last login</dt>
              <dd>{profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString() : '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <Heading level={3}>Authentication (MFA)</Heading>
          <dl className="admin-kv-list">
            <div>
              <dt>Status</dt>
              <dd>
                {mfa?.enrolled ? (
                  <Badge kind="success">Enrolled</Badge>
                ) : mfa?.policy_required ? (
                  <Badge kind="warning">Enrollment required</Badge>
                ) : (
                  'Not enrolled'
                )}
              </dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{mfa?.policy_required || mfa?.required ? 'Required for this account' : 'Optional'}</dd>
            </div>
            <div>
              <dt>Recovery codes</dt>
              <dd>{mfa?.recovery_codes_remaining ?? 0} remaining</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card>
        <Heading level={3}>Roles &amp; permissions</Heading>
        <Text size="caption" tone="secondary">
          {roles.length} role(s) · {permissions.length} permission(s) effective
        </Text>
        <ul className="admin-tag-list">
          {roles.slice(0, 8).map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <Heading level={3}>Active sessions</Heading>
        <Text tone="secondary">HttpOnly cookie sessions validated server-side on every protected request.</Text>
        {sessions.length === 0 ? (
          <EmptyState title="No sessions" description="Active sessions for your account appear here." />
        ) : (
          <>
            <Table
              caption="Active sessions"
              columns={['Created', 'Last seen', 'Status', 'Hints']}
              rows={sessions.map((row) => [
                row.created_at ? new Date(row.created_at).toLocaleString() : '—',
                row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : '—',
                row.is_current ? `${row.status ?? '—'} (current)` : (row.status ?? '—'),
                [row.ip_hint ? `IP ${row.ip_hint}` : null, row.device_hint ? `UA ${row.device_hint}` : null]
                  .filter(Boolean)
                  .join(' · ') || '—',
              ])}
            />
            <ul className="admin-tag-list">
              {sessions
                .filter((row) => row.id && !row.is_current)
                .map((row) => (
                  <li key={row.id}>
                    Session {row.id?.slice(0, 8)}…{' '}
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void revokeSession(row.id!)}>
                      Revoke
                    </Button>
                  </li>
                ))}
            </ul>
          </>
        )}
        <div className="wp-toolbar">
          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void logoutAll()}>
            {busy ? 'Revoking…' : 'Sign out all devices'}
          </Button>
        </div>
        {message ? <Text size="caption">{message}</Text> : null}
      </Card>

      <Card>
        <header className="wp-toolbar">
          <Heading level={3}>Recent login &amp; security events</Heading>
          <Button variant="tertiary" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
        </header>
        {events.length === 0 ? (
          <EmptyState title="No events" description="Authentication events for your account appear here." />
        ) : (
          <Table
            caption="Recent security events"
            columns={['Time', 'Type', 'Outcome', 'Request ID']}
            rows={events.map((row) => [
              row.created_at ? new Date(row.created_at).toLocaleString() : '—',
              row.type ?? '—',
              row.outcome ?? '—',
              row.request_id ?? '—',
            ])}
          />
        )}
      </Card>
    </div>
  );
}
