'use client';

import { useState } from 'react';
import { PartnerInboxPanel, PartnerSupportPanel, PortalWorkspaceShell, useSession } from '@world-pharma/shell-web';
import { Heading } from '@world-pharma/ui-kit/web';
import { LogisticsOpsPanel } from './logistics-ops-panel';

const NAV = [
  { id: 'shipments', label: 'Shipments' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'support', label: 'Support' },
] as const;

type NavId = (typeof NAV)[number]['id'];

export function LogisticsShell() {
  const { getAccessToken } = useSession();
  const [nav, setNav] = useState<NavId>('shipments');
  const token = getAccessToken() ?? '';

  return (
    <PortalWorkspaceShell
      portalId="logistics"
      brandTitle="Logistics workspace"
      portalLabel="Logistics"
      nav={[...NAV]}
      currentNav={nav}
      onNavSelect={(id) => setNav(id as NavId)}
      audience="admin"
      breadcrumbs={[
        { label: 'World Pharma' },
        { label: 'Logistics' },
        { label: NAV.find((item) => item.id === nav)?.label ?? 'Shipments' },
      ]}
    >
      {nav === 'inbox' ? <PartnerInboxPanel token={token} audienceLabel="logistics operators" /> : null}
      {nav === 'support' ? <PartnerSupportPanel token={token} audienceLabel="logistics operators" /> : null}
      {nav === 'shipments' ? (
        <>
          <header className="wp-page-header">
            <Heading level={1}>Shipment operations</Heading>
            <p className="wp-page-intro">
              Sandbox mock carrier — book shipments, reconcile costs, assign delivery jobs, and handle exceptions. Live
              production carriers remain EXTERNAL_GATED. Rider earnings wallet is on the delivery mobile app Pay tab
              (sandbox-delivery@dev.local).
            </p>
          </header>
          <LogisticsOpsPanel />
        </>
      ) : null}
    </PortalWorkspaceShell>
  );
}
