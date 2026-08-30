'use client';

import { useState } from 'react';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';

export function DoctorsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/doctors`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setError('Doctor verification workspace could not be loaded.');
      return;
    }
    const body = (await res.json()) as { doctors?: Array<Record<string, unknown>> };
    setRows(body.doctors ?? []);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section>
      <Heading level={2}>Doctor verification</Heading>
      <Text tone="secondary">
        Review doctor partner applications and credential metadata. KYC documents and clinical
        records are not shown here. No invented license rules.
      </Text>
      <Button onClick={() => void load()}>Load applications</Button>
      {denied ? <EmptyState title="Permission denied" description="Requires doctor:review." /> : null}
      {error ? <Text>{error}</Text> : null}
      {rows ? (
        <Card>
          <Text>{rows.length} doctor partner(s)</Text>
        </Card>
      ) : null}
    </section>
  );
}
