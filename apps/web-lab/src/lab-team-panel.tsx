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
import { fetchLabTeam, type LabTeamMember } from './lab-api';

type Props = {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
};

export function LabTeamPanel({ organizationId, token, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<LabTeamMember[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchLabTeam(token, organizationId);
      setMembers(body.data ?? []);
    } catch (err) {
      onError(err);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [onError, organizationId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <LoadingState label="Loading team" />;
  }

  return (
    <div className="wp-stack">
      <Heading level={2}>Workforce</Heading>
      <Text size="caption" tone="secondary">
        Organization memberships and operational roles. Read-only — not a full HR system.
      </Text>
      {!members.length ? (
        <EmptyState title="No active members" description="Invite staff through partner onboarding when enabled." />
      ) : (
        <Card>
          <ul>
            {members.map((member) => (
              <li key={member.person_id} style={{ marginBottom: 12 }}>
                <Text>{member.display_name}</Text>
                <Text size="caption" tone="secondary">
                  {member.membership_role_name} · {member.operational_roles.join(', ')}
                  {member.partner_types.length ? ` · ${member.partner_types.join(', ')}` : ''}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Button size="sm" variant="secondary" onClick={() => void load()}>
        Refresh
      </Button>
    </div>
  );
}
