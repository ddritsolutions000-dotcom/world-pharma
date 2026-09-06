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
} from '@world-pharma/ui-kit/web';
import { adminJson, AdminHttpError } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { MarketCountrySelect } from './market-country-select';
import { marketCountryPickerValue, requireMarketCountry } from './working-country';

type Result = {
  serviceable?: boolean;
  city?: string | null;
  region?: string | null;
  medicine_delivery?: boolean;
  lab_home_collection?: boolean;
  express_delivery?: boolean;
  medicine_eta?: string;
  lab_eta?: string;
  message?: string;
  postal_code?: string;
};

type ZoneRow = {
  id: string;
  name: string;
  postal_prefix: string | null;
  postal_from: string | null;
  postal_to: string | null;
  city: string | null;
  region: string | null;
  medicine_delivery: boolean;
  lab_home_collection: boolean;
  express_delivery: boolean;
  cod_available: boolean;
  carrier_code: string | null;
  priority: number;
  active: boolean;
};

export function ServiceabilityAdminPanel() {
  const { session, getAccessToken } = useSession();
  const token = getAccessToken();
  const [country, setCountry] = useState(() => marketCountryPickerValue(session.countryCode));
  const [postal, setPostal] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({
    name: '',
    postal_prefix: '',
    city: '',
    region: '',
    priority: '100',
  });

  const loadZones = useCallback(async () => {
    if (!token || !country.trim()) {
      return;
    }
    setLoadingZones(true);
    try {
      const iso = requireMarketCountry(country);
      const res = await adminJson<{ data?: ZoneRow[] }>(
        token,
        `/api/v1/admin/shipments/serviceability/zones?country=${encodeURIComponent(iso)}`,
      );
      setZones(res.data ?? []);
    } catch (err) {
      setError(err instanceof AdminHttpError ? err.message : 'Could not load zones.');
    } finally {
      setLoadingZones(false);
    }
  }, [country, token]);

  useEffect(() => {
    if (session.status === 'authenticated' && country.trim()) {
      void loadZones();
    }
  }, [country, loadZones, session.status]);

  async function check() {
    if (!token || !country.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const iso = requireMarketCountry(country);
      const res = await adminJson<Result>(
        token,
        `/api/v1/admin/shipments/serviceability?country=${encodeURIComponent(iso)}&postal_code=${encodeURIComponent(postal)}`,
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof AdminHttpError ? err.message : 'Check failed.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function createZone() {
    if (!token || !country.trim() || !zoneForm.name.trim()) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const iso = requireMarketCountry(country);
      await adminJson(token, `/api/v1/admin/shipments/serviceability/zones?country=${encodeURIComponent(iso)}`, {
        method: 'POST',
        body: JSON.stringify({
          name: zoneForm.name.trim(),
          postal_prefix: zoneForm.postal_prefix.trim() || undefined,
          city: zoneForm.city.trim() || undefined,
          region: zoneForm.region.trim() || undefined,
          priority: Number(zoneForm.priority),
          medicine_delivery: true,
          lab_home_collection: true,
        }),
      });
      setMessage('Zone created.');
      setZoneForm({ name: '', postal_prefix: '', city: '', region: '', priority: '100' });
      await loadZones();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Serviceability</Heading>
        <p className="wp-page-intro">
          Configure delivery zones per country. The postal checker consumes active zone configuration first.
        </p>
      </header>
      <MarketCountrySelect ariaLabel="Serviceability country" value={country} onChange={setCountry} />

      <Card>
        <Heading level={3}>Postal checker</Heading>
        <FormField label="Postal code">
          {({ id }) => (
            <Input id={id} aria-label="Postal code" value={postal} onChange={(e) => setPostal(e.target.value)} />
          )}
        </FormField>
        <Button onClick={() => void check()} disabled={busy || !postal.trim() || !country.trim()}>
          {busy ? 'Checking…' : 'Check postal code'}
        </Button>
        {error ? <p className="wp-text-muted">{error}</p> : null}
        {result ? (
          <>
            <h2 className="wp-section-title">{result.serviceable ? 'Serviceable' : 'Not serviceable'}</h2>
            <p className="wp-list-meta">
              {result.city ?? '—'} {result.region ? `· ${result.region}` : ''} · {result.postal_code}
            </p>
            <p className="wp-text-muted">{result.message}</p>
          </>
        ) : (
          <EmptyState title="No check yet" description="Enter a postal code to test against configured zones." />
        )}
      </Card>

      <Card>
        <Heading level={3}>Delivery zones</Heading>
        {message ? <p className="wp-text-muted">{message}</p> : null}
        <div className="wp-admin-grid-2">
          <FormField label="Zone name">
            {({ id }) => (
              <Input id={id} value={zoneForm.name} onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} />
            )}
          </FormField>
          <FormField label="Postal prefix">
            {({ id }) => (
              <Input
                id={id}
                value={zoneForm.postal_prefix}
                onChange={(e) => setZoneForm((f) => ({ ...f, postal_prefix: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label="City">
            {({ id }) => (
              <Input id={id} value={zoneForm.city} onChange={(e) => setZoneForm((f) => ({ ...f, city: e.target.value }))} />
            )}
          </FormField>
          <FormField label="Priority">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                value={zoneForm.priority}
                onChange={(e) => setZoneForm((f) => ({ ...f, priority: e.target.value }))}
              />
            )}
          </FormField>
        </div>
        <Button disabled={busy || !zoneForm.name.trim() || !country.trim()} onClick={() => void createZone()}>
          Add zone
        </Button>
        {loadingZones ? <LoadingState label="Loading zones" /> : null}
        {zones.length ? (
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Postal</th>
                  <th>City</th>
                  <th>Services</th>
                  <th>Priority</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td>{zone.name}</td>
                    <td>{zone.postal_prefix ?? `${zone.postal_from ?? ''}-${zone.postal_to ?? ''}`}</td>
                    <td>{zone.city ?? '—'}</td>
                    <td>
                      {[
                        zone.medicine_delivery ? 'Rx' : null,
                        zone.lab_home_collection ? 'Lab' : null,
                        zone.express_delivery ? 'Express' : null,
                        zone.cod_available ? 'COD' : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td>{zone.priority}</td>
                    <td>{zone.active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !loadingZones && country.trim() ? (
          <EmptyState title="No zones" description="Add delivery zones for this country." />
        ) : null}
      </Card>
    </section>
  );
}
