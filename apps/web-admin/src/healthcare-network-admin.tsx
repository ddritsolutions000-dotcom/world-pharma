'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { adminFetch } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';

type ReadinessStatus = 'READY' | 'BLOCKED' | 'EXTERNAL_GATED' | 'SUSPENDED';

type Snapshot = {
  environment: string;
  live_healthcare_enabled: boolean;
  never_fake_green: boolean;
  note: string;
  production_probe: { available: boolean; blockers: string[]; message: string } | null;
  doctors: Array<{
    partner_id: string;
    display_name: string;
    status: string;
    country_code: string;
    readiness: { final_status: ReadinessStatus; blockers: string[]; message: string };
  }>;
  labs: Array<{
    organization_id: string;
    name: string;
    country_code: string;
    readiness: { final_status: ReadinessStatus; blockers: string[]; message: string };
  }>;
  imaging: Array<{
    organization_id: string;
    name: string;
    country_code: string;
    readiness: { final_status: ReadinessStatus; blockers: string[]; message: string };
  }>;
  integrations: {
    catalog: Array<{ dependency_type: string; status: string; note: string }>;
  };
};

function statusKind(status: ReadinessStatus): 'pending' | 'warning' {
  if (status === 'READY' || status === 'EXTERNAL_GATED') return 'pending';
  return 'warning';
}

export function HealthcareNetworkAdminPanel() {
  const { session, getAccessToken } = useSession();
  const canRead = session.permissions.includes('policy:read');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState<'loading' | 'idle' | 'forbidden' | 'network' | 'error'>('loading');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setView('forbidden');
      return;
    }
    setView('loading');
    try {
      const res = await adminFetch(token, '/api/v1/admin/healthcare-network/snapshot');
      if (res.status === 403) {
        setView('forbidden');
        return;
      }
      if (!res.ok) {
        setView('error');
        return;
      }
      setSnapshot((await res.json()) as Snapshot);
      setView('idle');
    } catch {
      setView('network');
    }
  }, [canRead, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  if (view === 'forbidden') return <PermissionDeniedState />;
  if (view === 'network' || view === 'error') {
    return <AdminViewLoadError viewState={view} onRetry={() => void load()} />;
  }
  if (view === 'loading' && !snapshot) {
    return <LoadingState label="Loading healthcare network" />;
  }

  return (
    <div className="wp-stack" style={{ gap: 16 }}>
      <div className="wp-stack" style={{ gap: 4 }}>
        <Heading level={2}>Healthcare network</Heading>
        <Text tone="secondary">
          Doctor, lab, and imaging operational readiness. Operator credential verification is not government
          registry verification. Live eRx, video, PACS, DICOM, HL7, and FHIR stay EXTERNAL_GATED.
        </Text>
      </div>

      {snapshot ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Badge kind="pending">Environment: {snapshot.environment}</Badge>
            <Badge kind={snapshot.live_healthcare_enabled ? 'warning' : 'pending'}>
              Live: {snapshot.live_healthcare_enabled ? 'ENABLED_GATED' : 'OFF'}
            </Badge>
            <Button onClick={() => void load()}>Refresh</Button>
          </div>
          <Text size="caption" tone="secondary">
            {snapshot.note}
          </Text>

          {snapshot.production_probe ? (
            <Card>
              <Heading level={3}>Production availability probe</Heading>
              <Badge kind={snapshot.production_probe.available ? 'pending' : 'warning'}>
                {snapshot.production_probe.available ? 'AVAILABLE' : 'BLOCKED'}
              </Badge>
              <Text size="caption">{snapshot.production_probe.message}</Text>
              <Text size="caption">Blockers: {snapshot.production_probe.blockers.join(', ') || 'none'}</Text>
            </Card>
          ) : null}

          <Card>
            <Heading level={3}>Integration gates</Heading>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {snapshot.integrations.catalog.map((row) => (
                <Badge key={row.dependency_type} kind="pending">
                  {row.dependency_type}: {row.status}
                </Badge>
              ))}
            </div>
          </Card>

          <Card>
            <Heading level={3}>Doctors</Heading>
            {snapshot.doctors.length === 0 ? (
              <EmptyState title="No doctor partners" description="Doctor applications appear after onboarding." />
            ) : (
              snapshot.doctors.map((row) => (
                <div key={row.partner_id} style={{ marginBottom: 8 }}>
                  <Text>
                    {row.display_name} ({row.country_code}) — {row.status}
                  </Text>
                  <Badge kind={statusKind(row.readiness.final_status)}>{row.readiness.final_status}</Badge>
                  <Text size="caption">{row.readiness.message}</Text>
                </div>
              ))
            )}
          </Card>

          <Card>
            <Heading level={3}>Labs</Heading>
            {snapshot.labs.length === 0 ? (
              <EmptyState title="No lab organizations" description="Lab orgs appear after catalog onboarding." />
            ) : (
              snapshot.labs.map((row) => (
                <div key={row.organization_id} style={{ marginBottom: 8 }}>
                  <Text>
                    {row.name} ({row.country_code})
                  </Text>
                  <Badge kind={statusKind(row.readiness.final_status)}>{row.readiness.final_status}</Badge>
                  <Text size="caption">{row.readiness.message}</Text>
                </div>
              ))
            )}
          </Card>

          <Card>
            <Heading level={3}>Imaging</Heading>
            {snapshot.imaging.length === 0 ? (
              <EmptyState
                title="No imaging centers"
                description="Imaging centers appear after radiology onboarding."
              />
            ) : (
              snapshot.imaging.map((row) => (
                <div key={row.organization_id} style={{ marginBottom: 8 }}>
                  <Text>
                    {row.name} ({row.country_code})
                  </Text>
                  <Badge kind={statusKind(row.readiness.final_status)}>{row.readiness.final_status}</Badge>
                  <Text size="caption">{row.readiness.message}</Text>
                </div>
              ))
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
