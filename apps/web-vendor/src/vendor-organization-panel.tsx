'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  createVendorLocation,
  fetchVendorLocations,
  type VendorLocation,
  type VendorOrganization,
} from './vendor-api';

export function VendorOrganizationPanel({
  organization,
  organizationId,
  token,
  onError,
}: {
  organization: VendorOrganization | null;
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [locations, setLocations] = useState<VendorLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [newLocationName, setNewLocationName] = useState('');

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    setFormError('');
    try {
      const body = await fetchVendorLocations(token, organizationId);
      setLocations(body.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitLocation = async () => {
    const name = newLocationName.trim();
    if (!name) {
      setFormError('Warehouse name is required.');
      return;
    }
    setBusy(true);
    setFormError('');
    setMessage('');
    try {
      await createVendorLocation(token, {
        organization_id: organizationId,
        name,
        fulfillment_capable: true,
      });
      setNewLocationName('');
      setMessage('Warehouse location created.');
      await load();
    } catch (err) {
      if (err instanceof VendorApiError) {
        setFormError(err.message);
      } else {
        onError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wp-stack">
      <Card>
        <Heading level={2}>Organization</Heading>
        {organization ? (
          <>
            <Text size="bodyLg">{organization.display_name}</Text>
            <Text tone="secondary">{organization.legal_name}</Text>
            <Text size="caption">
              {organization.kind} · {organization.country_code} · Status {organization.status}
            </Text>
            <Text size="caption">
              Role {organization.role_name} ({organization.role_code})
            </Text>
          </>
        ) : (
          <Text tone="secondary">Select a seller organization above.</Text>
        )}
      </Card>

      <Card>
        <header className="wp-card-head">
          <Heading level={2}>Warehouse locations</Heading>
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </header>
        <Text tone="secondary" size="caption">
          Fulfillment locations for inventory receipts, transfers, and order pick/pack. KYC and company approval stay in
          Main Admin — not editable here.
        </Text>
        {loading ? <LoadingState label="Loading warehouse locations…" /> : null}
        {!loading && locations.length === 0 ? (
          <EmptyState
            title="No warehouse yet"
            description="Create your first vendor warehouse below, then receive stock from the Inventory tab."
          />
        ) : null}
        {!loading && locations.length > 0 ? (
          <ul className="wp-mini-list">
            {locations.map((row) => (
              <li key={row.id} className="wp-mini-row">
                <div className="wp-mini-main">
                  <p className="wp-mini-title">{row.name}</p>
                  <p className="wp-mini-meta">
                    {row.kind}
                    {row.is_active === false ? ' · inactive' : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <Heading level={3}>Add warehouse</Heading>
        <div className="wp-toolbar">
          <FormField label="Location name">
            {({ id }) => (
              <Input
                id={id}
                value={newLocationName}
                placeholder="e.g. Mumbai central warehouse"
                onChange={(event) => setNewLocationName(event.target.value)}
              />
            )}
          </FormField>
          <Button disabled={busy} onClick={() => void submitLocation()}>
            {busy ? 'Creating…' : 'Create location'}
          </Button>
        </div>
        {formError ? <Text tone="secondary">{formError}</Text> : null}
        {message ? <Text>{message}</Text> : null}
      </Card>
    </div>
  );
}
