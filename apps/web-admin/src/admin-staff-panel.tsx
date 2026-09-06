'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminViewLoadError } from './admin-request-error';
import Link from 'next/link';
import { adminJson, AdminHttpError, classifyAdminViewState } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';

type StaffRow = {
  person_id?: string;
  email?: string | null;
  person_status?: string;
  account_status?: string | null;
  roles?: string[];
  mfa_required?: boolean;
  mfa_enrolled?: boolean;
  last_login_at?: string | null;
};

const ROLE_OPTIONS = [
  'company_support',
  'company_operations',
  'company_finance',
  'company_compliance',
  'company_security',
  'company_admin',
  'global_admin',
];

export function AdminStaffPanel() {
  const { session, getAccessToken } = useSession();
  const token = getAccessToken();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'forbidden' | 'network' | 'error' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('company_support');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StaffRow & { permissions?: string[] } | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; created_at?: string; user_agent?: string }>>([]);
  const [roleCode, setRoleCode] = useState('company_support');
  const [roleReason, setRoleReason] = useState('role adjustment');

  const canRevokeSessions = useMemo(
    () => session.permissions.includes('session:revoke'),
    [session.permissions],
  );

  const loadDetail = useCallback(
    async (personId: string) => {
      if (!token) {
        return;
      }
      setSelectedId(personId);
      try {
        const res = await adminJson<StaffRow & { permissions?: string[] }>(token, `/api/v1/admin/staff/${personId}`);
        setDetail(res);
        if (canRevokeSessions) {
          const sess = await adminJson<{ data?: Array<{ id: string; created_at?: string; user_agent?: string }> }>(
            token,
            `/api/v1/admin/staff/${personId}/sessions`,
          );
          setSessions(sess.data ?? []);
        } else {
          setSessions([]);
        }
      } catch {
        setDetail(null);
        setSessions([]);
      }
    },
    [canRevokeSessions, token],
  );

  const canManage = useMemo(
    () => session.permissions.includes('rbac:grant_company'),
    [session.permissions],
  );

  const assignRole = async () => {
    if (!token || !canManage || !selectedId) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await adminJson(token, `/api/v1/admin/staff/${selectedId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ role_code: roleCode, reason: roleReason }),
      });
      setMessage('Role assignment submitted (dual-control may apply).');
      await loadDetail(selectedId);
      await load();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Role assignment failed.');
    } finally {
      setBusy(false);
    }
  };

  const removeRole = async (code: string) => {
    if (!token || !canManage || !selectedId) {
      return;
    }
    setBusy(true);
    try {
      await adminJson(token, `/api/v1/admin/staff/${selectedId}/roles/remove`, {
        method: 'POST',
        body: JSON.stringify({ role_code: code }),
      });
      setMessage(`Removed role ${code}.`);
      await loadDetail(selectedId);
      await load();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Role removal failed.');
    } finally {
      setBusy(false);
    }
  };

  const revokeAllSessions = async () => {
    if (!token || !canRevokeSessions || !selectedId) {
      return;
    }
    setBusy(true);
    try {
      await adminJson(token, `/api/v1/admin/staff/${selectedId}/sessions/revoke-all`, { method: 'POST', body: '{}' });
      setMessage('All sessions revoked.');
      await loadDetail(selectedId);
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Session revoke failed.');
    } finally {
      setBusy(false);
    }
  };

  const setMfaRequired = async (required: boolean) => {
    if (!token || !canManage || !selectedId) {
      return;
    }
    setBusy(true);
    try {
      await adminJson(token, `/api/v1/admin/staff/${selectedId}/mfa-policy`, {
        method: 'PATCH',
        body: JSON.stringify({ required }),
      });
      setMessage(required ? 'MFA marked required.' : 'MFA marked optional.');
      await loadDetail(selectedId);
      await load();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'MFA policy update failed.');
    } finally {
      setBusy(false);
    }
  };
  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const res = await adminJson<{ data?: StaffRow[] }>(token, `/api/v1/admin/staff${qs}`);
      setRows(res.data ?? []);
    } catch (err) {
      setError(classifyAdminViewState(err));
    } finally {
      setLoading(false);
    }
  }, [search, token]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  const invite = async () => {
    if (!token || !canManage) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await adminJson<{ dev_invite_token?: string; invitation_id?: string }>(
        token,
        '/api/v1/admin/staff/invitations',
        {
          method: 'POST',
          body: JSON.stringify({ email: inviteEmail.trim(), role_code: inviteRole }),
        },
      );
      setMessage(
        res.dev_invite_token
          ? `Invitation created. Dev token: ${res.dev_invite_token}`
          : 'Invitation sent. The administrator must accept via the issued secure link.',
      );
      setInviteEmail('');
      await load();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Could not create invitation.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (personId: string, active: boolean) => {
    if (!token || !canManage) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await adminJson(token, `/api/v1/admin/staff/${personId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: active ? 'ACTIVE' : 'DISABLED' }),
      });
      setMessage(active ? 'Administrator activated.' : 'Administrator deactivated and sessions revoked.');
      await load();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Status change failed.');
    } finally {
      setBusy(false);
    }
  };

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (loading) {
    return <LoadingState label="Loading administrator roster…" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network' || error === 'error') {
    return <AdminViewLoadError viewState={error} onRetry={() => void load()} />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Administrator roster</Heading>
        <Text tone="secondary" className="wp-page-intro">
          Company operators with platform roles — invite, review MFA posture, and manage lifecycle.
        </Text>
        <div className="wp-toolbar">
          <Link href="/security">← Account &amp; security</Link>
        </div>
      </header>

      {canManage ? (
        <Card>
          <Heading level={3}>Invite administrator</Heading>
          <div className="wp-admin-grid-2">
            <FormField label="Work email">
              {({ id }) => (
                <Input id={id} type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              )}
            </FormField>
            <FormField label="Role">
              {({ id }) => (
                <Select id={id} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>
          <Button disabled={busy || !inviteEmail.trim()} onClick={() => void invite()}>
            {busy ? 'Issuing…' : 'Issue invitation'}
          </Button>
        </Card>
      ) : null}

      <Card>
        <header className="wp-toolbar">
          <FormField label="Search">
            {({ id }) => (
              <Input
                id={id}
                placeholder="Email or role"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void load();
                  }
                }}
              />
            )}
          </FormField>
          <Button variant="secondary" onClick={() => void load()}>
            Search
          </Button>
        </header>

        {rows.length === 0 ? (
          <EmptyState title="No administrators" description="Matching company role memberships will appear here." />
        ) : (
          <>
            <Table
              caption="Administrator roster"
              columns={['Email', 'Roles', 'Status', 'MFA', 'Last login']}
              rows={rows.map((row) => [
                row.email ?? row.person_id ?? '—',
                (row.roles ?? []).join(', ') || '—',
                row.account_status ?? row.person_status ?? '—',
                row.mfa_enrolled ? 'Enrolled' : row.mfa_required ? 'Required' : 'Optional',
                row.last_login_at ? new Date(row.last_login_at).toLocaleString() : '—',
              ])}
            />
            <ul className="admin-tag-list">
              {rows
                .filter((row) => row.person_id)
                .map((row) => (
                  <li key={row.person_id}>
                    {row.email ?? row.person_id}{' '}
                    <Button size="sm" variant="secondary" onClick={() => void loadDetail(row.person_id!)}>
                      Manage
                    </Button>
                  </li>
                ))}
            </ul>
            {canManage ? (
              <ul className="admin-tag-list">
                {rows
                  .filter((row) => row.person_id)
                  .map((row) => (
                    <li key={row.person_id}>
                      {row.email ?? row.person_id}{' '}
                      {row.account_status === 'DISABLED' ? (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void toggleStatus(row.person_id!, true)}>
                          Activate
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void toggleStatus(row.person_id!, false)}>
                          Deactivate
                        </Button>
                      )}
                    </li>
                  ))}
              </ul>
            ) : null}
          </>
        )}
      </Card>

      {detail ? (
        <Card>
          <Heading level={3}>{detail.email ?? detail.person_id}</Heading>
          <p className="wp-list-meta">
            Roles: {(detail.roles ?? []).join(', ') || '—'} · MFA:{' '}
            {detail.mfa_enrolled ? 'Enrolled' : detail.mfa_required ? 'Required' : 'Optional'}
          </p>
          {detail.permissions?.length ? (
            <p className="wp-text-muted">Effective permissions: {detail.permissions.slice(0, 12).join(', ')}</p>
          ) : null}
          {canManage ? (
            <div className="wp-admin-grid-2">
              <FormField label="Assign role">
                {({ id }) => (
                  <Select id={id} value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Reason">
                {({ id }) => (
                  <Input id={id} value={roleReason} onChange={(e) => setRoleReason(e.target.value)} />
                )}
              </FormField>
            </div>
          ) : null}
          <div className="wp-toolbar">
            {canManage ? (
              <>
                <Button disabled={busy} onClick={() => void assignRole()}>
                  Assign role
                </Button>
                {(detail.roles ?? []).map((role) => (
                  <Button key={role} size="sm" variant="secondary" disabled={busy} onClick={() => void removeRole(role)}>
                    Remove {role}
                  </Button>
                ))}
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setMfaRequired(true)}>
                  Require MFA
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setMfaRequired(false)}>
                  Optional MFA
                </Button>
              </>
            ) : null}
            {canRevokeSessions ? (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void revokeAllSessions()}>
                Revoke all sessions
              </Button>
            ) : null}
          </div>
          {sessions.length ? (
            <ul className="admin-tag-list">
              {sessions.map((sess) => (
                <li key={sess.id}>
                  <code>{sess.id.slice(0, 8)}…</code> {sess.created_at ? new Date(sess.created_at).toLocaleString() : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {message ? <Text size="caption">{message}</Text> : null}
    </div>
  );
}
