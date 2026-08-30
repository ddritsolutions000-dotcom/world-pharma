'use client';

import { useEffect, useState } from 'react';
import { Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

export function CatalogAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [items, setItems] = useState<unknown[]>([]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    void fetch(`${apiBaseUrl()}/api/v1/admin/catalog/items`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((body) => setItems(Array.isArray(body) ? body : []));
  }, [getAccessToken]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section>
      <Heading level={2}>Catalog</Heading>
      <Text tone="secondary">Review brands, items, offers, and commercial rules. No warehouse or payouts.</Text>
      {items.length === 0 ? (
        <EmptyState
          title="No catalog rows loaded"
          description="Sign in with an operator access token to manage catalog. Shell demo tokens cannot call write APIs."
        />
      ) : (
        <Card>
          <Text>{items.length} catalog items</Text>
        </Card>
      )}
    </section>
  );
}
