'use client';

import { Card, Heading, Text } from '@world-pharma/ui-kit/web';
import { VENDOR_JOIN_ROUTES } from './vendor-join-routes';
import { VendorCtaLink } from './vendor-cta-link';
import type { VendorTabId } from './vendor-workspace-nav';

const LINKS: Array<{ tab: VendorTabId; label: string; detail: string }> = [
  { tab: 'organization', label: 'Organization & warehouses', detail: 'Legal entity and fulfilment locations' },
  { tab: 'profile', label: 'Operator profile', detail: 'Your seller contact details' },
  { tab: 'notifications', label: 'Notifications', detail: 'Email, order, settlement, and support alerts' },
  { tab: 'security', label: 'Security', detail: 'Session and sign-in controls' },
  { tab: 'compliance', label: 'Compliance', detail: 'KYC and marketplace gates' },
  { tab: 'pricing', label: 'Commercial rules', detail: 'Platform fees (read-only)' },
];

export function VendorSettingsPanel({ onNavigate }: { onNavigate: (tab: VendorTabId) => void }) {
  return (
    <div className="wp-stack">
      <Card>
        <Heading level={2}>Business settings</Heading>
        <Text tone="secondary">
          Company-level policy, global fees, payment activation, and platform commission are controlled by Main Admin.
          Below are the settings you can manage for your seller organization.
        </Text>
      </Card>

      <ul className="vd-setup-list">
        {LINKS.map((link) => (
          <li key={link.tab}>
            <button type="button" className="vd-setup-row" onClick={() => onNavigate(link.tab)}>
              <span className="vd-setup-body">
                <strong>{link.label}</strong>
                <small>{link.detail}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Card>
        <Heading level={3}>Read-only (company controlled)</Heading>
        <Text size="caption" tone="secondary">
          Country policy pack, platform take rates, delivery fee rules, and live payout configuration cannot be changed
          from the vendor portal.
        </Text>
        <VendorCtaLink href={VENDOR_JOIN_ROUTES.hub} variant="secondary" size="sm">
          Vendor program info
        </VendorCtaLink>
      </Card>
    </div>
  );
}
