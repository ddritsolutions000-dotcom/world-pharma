'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  fetchVendorTeamMembers,
  inviteVendorTeamMember,
  removeVendorTeamMember,
  type VendorTeamMember,
} from './vendor-api';

const INVITABLE_ROLES = [
  { code: 'org_operations', label: 'Operations' },
  { code: 'org_finance', label: 'Finance viewer' },
  { code: 'org_staff', label: 'Staff' },
  { code: 'org_manager', label: 'Manager' },
] as const;

export function VendorTeamPanel({
  organizationId,
  countryCode,
  token,
  onError,
}: {
  organizationId: string;
  countryCode: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [members, setMembers] = useState<VendorTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleCode, setRoleCode] = useState('org_operations');
  const [email, setEmail] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchVendorTeamMembers(token, organizationId);
      setMembers(body.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    setBusy(true);
    setInviteToken(null);
    try {
      const created = await inviteVendorTeamMember(token, {
        seller_org_id: organizationId,
        role_code: roleCode,
        country_code: countryCode,
        email: email.trim() || undefined,
      });
      setInviteToken(created.invite_token);
      setEmail('');
      await load();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (membershipId: string) => {
    setBusy(true);
    try {
      await removeVendorTeamMember(token, organizationId, membershipId);
      await load();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading team members…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">
        Manage seller organization access using existing org roles. Platform admin roles cannot be assigned here.
      </Text>

      <Card>
        <Heading level={2}>Members ({members.length})</Heading>
        {!members.length ? (
          <EmptyState title="No members" description="Organization admins appear here after activation." />
        ) : (
          <ul className="wp-mini-list">
            {members.map((member) => (
              <li key={member.id} className="wp-mini-row">
                <div className="wp-mini-main">
                  <p className="wp-mini-title">
                    {member.display_name}
                    {member.is_self ? ' (you)' : ''}
                  </p>
                  <p className="wp-mini-meta">
                    {member.role_name} · {member.permissions.slice(0, 4).join(', ')}
                    {member.permissions.length > 4 ? '…' : ''}
                  </p>
                </div>
                <div className="wp-mini-right">
                  {!member.is_self && (member.role_code === 'org_admin' || member.role_code === 'org_owner') ? null : (
                    !member.is_self ? (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void remove(member.id)}>
                        Remove
                      </Button>
                    ) : null
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <Heading level={2}>Invite team member</Heading>
        <div className="wp-form-row">
          <label>
            Role
            <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
              {INVITABLE_ROLES.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Email (optional)
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" />
          </label>
        </div>
        <Button disabled={busy} onClick={() => void invite()}>
          Create sandbox invitation
        </Button>
        {inviteToken ? (
          <Text size="caption">Sandbox invite token (dev): {inviteToken.slice(0, 24)}…</Text>
        ) : null}
      </Card>
    </div>
  );
}
