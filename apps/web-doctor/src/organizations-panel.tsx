'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Card,
  EmptyState,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchDoctorOrganizations, type DoctorOrgMembership } from './doctor-api';
import { DoctorLoadFailure, mapDoctorApiFailure, type DoctorLoadError } from './doctor-load-state';

export function DoctorOrganizationsPanel() {
  const { getAccessToken, expire } = useSession();
  const [rows, setRows] = useState<DoctorOrgMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DoctorLoadError | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchDoctorOrganizations({ token, onUnauthorized: () => expire() });
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      setRows([]);
    } else {
      setRows(result.data.organizations ?? []);
    }
    setLoading(false);
  }, [expire, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <LoadingState label="Loading organization memberships" />;
  }
  if (error) {
    return <DoctorLoadFailure error={error} onRetry={() => void load()} />;
  }
  if (!rows.length) {
    return (
      <EmptyState
        title="No organization memberships"
        description="Clinic, hospital, or group memberships assigned by your administrator appear here."
      />
    );
  }

  return (
    <ul className="wp-stack">
      {rows.map((row) => (
        <li key={row.membership_id}>
          <Card>
            <Text>{row.organization_name ?? 'Organization'}</Text>
            <Text size="caption" tone="secondary">
              {[
                row.organization_kind?.replace(/_/g, ' '),
                row.role?.replace(/_/g, ' '),
                row.status,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {row.starts_at ? (
              <Text size="caption">
                Active from {new Date(row.starts_at).toLocaleDateString()}
                {row.ends_at ? ` until ${new Date(row.ends_at).toLocaleDateString()}` : ''}
              </Text>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}
