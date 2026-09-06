'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, FormField, Heading, Input, Select, TextArea } from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { listCrmCustomers } from './crm-api';
import { presentPartnerPeople, type PersonPickRow } from './eligibility-admin-present';
import { workingCountry } from './working-country';
import { AdminDataTable } from './admin-data-table';
import { AdminConfirmAction } from './admin-confirm-action';

type GrantRow = {
  id: string;
  role_code: string;
  status: string;
  target_person_id: string;
  reason: string;
  created_at?: string;
  requester_person_id?: string;
};

type BreakGlassRow = {
  id: string;
  person_id: string;
  granted_by_id: string;
  reason: string;
  permissions: string[];
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

const COMPANY_GRANT_ROLES = [
  'company_operations',
  'company_support',
  'company_finance',
  'company_compliance',
  'company_security',
  'company_admin',
  'global_admin',
  'super_admin',
] as const;

export function CompanyAuthorityAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [people, setPeople] = useState<PersonPickRow[]>([]);
  const [targetPersonId, setTargetPersonId] = useState('');
  const [roleCode, setRoleCode] = useState('company_operations');
  const [reason, setReason] = useState('sandbox grant');
  const [message, setMessage] = useState<string | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [breakGlass, setBreakGlass] = useState<BreakGlassRow[]>([]);
  const [eligiblePerms, setEligiblePerms] = useState<string[]>([]);
  const [bgTarget, setBgTarget] = useState('');
  const [bgReason, setBgReason] = useState('');
  const [bgTtl, setBgTtl] = useState('30');
  const [bgPermissions, setBgPermissions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'break-glass' | 'revoke' | null>(null);
  const [revokeGrantId, setRevokeGrantId] = useState<string | null>(null);

  const canBreakGlass = session.permissions?.includes('security:break_glass');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/company-authority/grants`, {
      headers: adminAuthHeaders(token),
    });
    if (!res.ok) {
      return;
    }
    const body = (await res.json()) as { data?: GrantRow[] };
    setGrants(body.data ?? []);
    const nextPeople: PersonPickRow[] = [];
    try {
      const crm = await listCrmCustomers(token, { country_code: workingCountry(session.countryCode) });
      for (const row of crm.data ?? []) {
        nextPeople.push({
          id: row.person_id,
          label: row.identifiers[0]?.masked_value ?? `${row.person_id.slice(0, 8)}…`,
        });
      }
    } catch {
      /* CRM list is optional for grant picker */
    }
    const partnerRes = await fetch(`${adminApiRoot()}/api/v1/admin/partners/applications`, {
      headers: adminAuthHeaders(token),
    });
    if (partnerRes.ok) {
      nextPeople.push(...presentPartnerPeople(await partnerRes.json()));
    }
    const unique: PersonPickRow[] = [];
    for (const row of nextPeople) {
      if (row.id && !unique.some((item) => item.id === row.id)) {
        unique.push(row);
      }
    }
    setPeople(unique);
    setTargetPersonId((current) => current || unique[0]?.id || '');
    setBgTarget((current) => current || unique[0]?.id || '');
    if (canBreakGlass) {
      const [bgRes, permRes] = await Promise.all([
        fetch(`${adminApiRoot()}/api/v1/admin/company-authority/break-glass?active_only=false`, {
          headers: adminAuthHeaders(token),
        }),
        fetch(`${adminApiRoot()}/api/v1/admin/company-authority/break-glass/eligible-permissions`, {
          headers: adminAuthHeaders(token),
        }),
      ]);
      if (bgRes.ok) {
        const bgBody = (await bgRes.json()) as { data?: BreakGlassRow[] };
        setBreakGlass(bgBody.data ?? []);
      }
      if (permRes.ok) {
        const permBody = (await permRes.json()) as { data?: string[] };
        setEligiblePerms(permBody.data ?? []);
      }
    }
  }, [canBreakGlass, getAccessToken, session.countryCode]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  async function grant() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/company-authority/memberships`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        target_person_id: targetPersonId.trim(),
        role_code: roleCode.trim(),
        reason: reason.trim(),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: string; request_id?: string; detail?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(body.detail ?? 'Grant failed.');
      return;
    }
    setMessage(
      body.status === 'PENDING'
        ? `Dual-control pending (${body.request_id ?? 'request'}). Another operator must approve.`
        : `Granted (${body.status ?? 'ok'}).`,
    );
    await load();
  }

  async function review(id: string, approve: boolean) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/company-authority/grants/${id}/review`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ approve }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      setMessage(body.detail ?? 'Review failed. Dual control: requester cannot approve their own grant.');
      return;
    }
    setMessage(approve ? 'Grant approved.' : 'Grant rejected.');
    await load();
  }

  async function openBreakGlass() {
    const token = getAccessToken();
    if (!token || !canBreakGlass) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/company-authority/break-glass`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        target_person_id: bgTarget.trim(),
        reason: bgReason.trim(),
        permissions: bgPermissions,
        ttl_minutes: Number(bgTtl),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { detail?: string; grant_id?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(body.detail ?? 'Break-glass request failed.');
      return;
    }
    setMessage(`Break-glass grant opened (${body.grant_id ?? 'grant'}).`);
    setBgReason('');
    setBgPermissions([]);
    await load();
  }

  async function revokeBreakGlass(grantId: string) {
    const token = getAccessToken();
    if (!token || !canBreakGlass) {
      return;
    }
    setBusy(true);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/company-authority/break-glass/${grantId}/revoke`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: '{}',
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      setMessage(body.detail ?? 'Revoke failed.');
      return;
    }
    setMessage('Break-glass grant revoked.');
    await load();
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Company authority</Heading>
        <p className="wp-page-intro">
          Grant company roles via `/admin/company-authority`. Requires `rbac:grant_company`. Dual-control roles need a
          second operator.
        </p>
      </header>
      <Card>
        <FormField label="Target person">
          {({ id }) =>
            people.length ? (
              <Select
                id={id}
                aria-label="Target person id"
                value={targetPersonId}
                onChange={(e) => setTargetPersonId(e.target.value)}
              >
                {people.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                aria-label="Target person id"
                value={targetPersonId}
                onChange={(e) => setTargetPersonId(e.target.value)}
              />
            )
          }
        </FormField>
        <FormField label="Role">
          {({ id }) => (
            <Select id={id} aria-label="Role code" value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
              {COMPANY_GRANT_ROLES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Reason">
          {({ id }) => (
            <TextArea id={id} aria-label="Grant reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </FormField>
        <Button onClick={() => void grant()} disabled={busy || !targetPersonId.trim() || !reason.trim()}>
          Request membership
        </Button>
        {message ? <p className="wp-text-muted">{message}</p> : null}
      </Card>
      {grants.length ? (
        <Card>
          <h2 className="wp-section-title">Grant requests</h2>
          <AdminDataTable
            caption="Grant requests"
            rows={grants}
            rowKey={(row) => row.id}
            columns={[
              { id: 'role', header: 'Role', cell: (row) => row.role_code },
              {
                id: 'status',
                header: 'Status',
                cell: (row) => <span className="wp-status">{row.status}</span>,
              },
              {
                id: 'target',
                header: 'Target',
                cell: (row) => <code>{row.target_person_id.slice(0, 8)}…</code>,
                hideOnMobile: true,
              },
              { id: 'reason', header: 'Reason', cell: (row) => row.reason, hideOnMobile: true },
              {
                id: 'requested',
                header: 'Requested',
                cell: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : '—'),
                hideOnMobile: true,
              },
              {
                id: 'actions',
                header: '',
                cell: (row) =>
                  row.status === 'PENDING' ? (
                    <div className="wp-toolbar wp-toolbar-wrap">
                      <Button variant="secondary" disabled={busy} onClick={() => void review(row.id, true)}>
                        Approve
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => void review(row.id, false)}>
                        Reject
                      </Button>
                    </div>
                  ) : null,
              },
            ]}
          />
        </Card>
      ) : (
        <EmptyState
          title="No dual-control requests"
          description="company_operations grants immediately. super_admin / global_admin create a pending request."
        />
      )}
      {canBreakGlass ? (
        <Card>
          <h2 className="wp-section-title">Break-glass access</h2>
          <p className="wp-text-muted">
            Temporary elevated permissions from the server whitelist only. All grants are audited.
          </p>
          <FormField label="Target person">
            {({ id }) => (
              <Input id={id} value={bgTarget} onChange={(e) => setBgTarget(e.target.value)} />
            )}
          </FormField>
          <FormField label="Justification">
            {({ id }) => (
              <TextArea id={id} value={bgReason} onChange={(e) => setBgReason(e.target.value)} />
            )}
          </FormField>
          <FormField label="Duration (minutes)">
            {({ id }) => (
              <Input id={id} type="number" value={bgTtl} onChange={(e) => setBgTtl(e.target.value)} />
            )}
          </FormField>
          <FormField label="Eligible permissions">
            {({ id }) => (
              <Select
                id={id}
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (value && !bgPermissions.includes(value)) {
                    setBgPermissions((current) => [...current, value]);
                  }
                }}
              >
                <option value="">Add permission…</option>
                {eligiblePerms.map((perm) => (
                  <option key={perm} value={perm}>
                    {perm}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {bgPermissions.length ? (
            <ul className="admin-tag-list">
              {bgPermissions.map((perm) => (
                <li key={perm}>
                  {perm}{' '}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setBgPermissions((current) => current.filter((p) => p !== perm))}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            disabled={busy || !bgTarget.trim() || !bgReason.trim() || bgPermissions.length === 0}
            onClick={() => setConfirmAction('break-glass')}
          >
            Open break-glass grant
          </Button>
        </Card>
      ) : null}
      {canBreakGlass && breakGlass.length ? (
        <Card>
          <h2 className="wp-section-title">Break-glass history</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Permissions</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {breakGlass.map((row) => {
                  const active = !row.revoked_at && new Date(row.expires_at) > new Date();
                  return (
                    <tr key={row.id}>
                      <td>
                        <code>{row.person_id.slice(0, 8)}…</code>
                      </td>
                      <td>{row.permissions.join(', ')}</td>
                      <td>{new Date(row.expires_at).toLocaleString()}</td>
                      <td>
                        <span className="wp-status">{row.revoked_at ? 'REVOKED' : active ? 'ACTIVE' : 'EXPIRED'}</span>
                      </td>
                      <td>
                        {active ? (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              setRevokeGrantId(row.id);
                              setConfirmAction('revoke');
                            }}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      <AdminConfirmAction
        open={confirmAction === 'break-glass'}
        title="Open break-glass grant?"
        description="Grants temporary elevated permissions from the server whitelist. This action is audited."
        confirmLabel="Open grant"
        busy={busy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null);
          void openBreakGlass();
        }}
      />
      <AdminConfirmAction
        open={confirmAction === 'revoke' && Boolean(revokeGrantId)}
        title="Revoke break-glass grant?"
        description="Immediately removes temporary elevated access for the subject."
        confirmLabel="Revoke"
        requireReason
        busy={busy}
        onCancel={() => {
          setConfirmAction(null);
          setRevokeGrantId(null);
        }}
        onConfirm={() => {
          if (revokeGrantId) {
            void revokeBreakGlass(revokeGrantId);
          }
          setConfirmAction(null);
          setRevokeGrantId(null);
        }}
      />
    </section>
  );
}
