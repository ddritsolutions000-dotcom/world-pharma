'use client';

import Link from 'next/link';
import { Card, Heading, Text } from '@world-pharma/ui-kit/web';
import type { VendorOrganization } from './vendor-api';
import { VendorCtaLink } from './vendor-cta-link';
import { VENDOR_JOIN_ROUTES } from './vendor-join-routes';

export function VendorProfilePanel({ organization }: { organization: VendorOrganization }) {
  return (
    <div className="wp-stack">
      <Card>
        <Heading level={2}>Seller profile</Heading>
        <Text size="bodyLg">{organization.display_name}</Text>
        <Text tone="secondary">{organization.legal_name}</Text>
        <Text size="caption">
          {organization.kind} · {organization.country_code} · Status {organization.status}
        </Text>
        <Text size="caption">
          Role {organization.role_name} ({organization.role_code})
        </Text>
      </Card>
      <Card>
        <Heading level={3}>Account & onboarding</Heading>
        <Text tone="secondary">
          KYC, document review, and partner activation are managed by World Pharma on the partner portal and in Main
          Admin. You cannot change legal entity or compliance status here.
        </Text>
        <div className="vendor-marketing-hero-actions">
          <VendorCtaLink href={VENDOR_JOIN_ROUTES.status} variant="secondary" size="sm">
            Track application
          </VendorCtaLink>
          <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply} variant="tertiary" size="sm">
            New vendor apply
          </VendorCtaLink>
          <Link href="/join" className="wp-btn wp-btn-tertiary wp-btn-sm">
            Vendor program info
          </Link>
        </div>
      </Card>
    </div>
  );
}
