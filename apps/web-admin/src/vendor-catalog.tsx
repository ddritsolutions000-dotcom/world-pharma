'use client';

import { Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';

export function VendorCatalogPanel() {
  return (
    <section>
      <Heading level={2}>Vendor catalog</Heading>
      <Text tone="secondary">Manage your offers and prices. Orders, shipping, and settlement are not in this release.</Text>
      <Card>
        <EmptyState
          title="Vendor workspace"
          description="Use vendor catalog APIs with an organization membership. Another vendor cannot see your drafts."
        />
      </Card>
    </section>
  );
}
