'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCountries, useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchAddresses, type CustomerAddress } from './account-api';
import { CustomerShell } from './customer-shell';
import {
  createLabBooking,
  fetchLabCatalogItem,
  fetchLabLocations,
  fetchLabSlots,
  LabCustomerApiError,
  payLabBooking,
  type LabCatalogItem,
} from './lab-api';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function LabDetailScreen({ slug }: { slug: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { countries } = useCountries();
  const country =
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('country')
      : null) ??
    countries[0]?.iso_alpha2 ??
    'XX';

  const [item, setItem] = useState<LabCatalogItem | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; city: string | null }>>([]);
  const [slots, setSlots] = useState<Array<{ starts_at: string; ends_at: string }>>([]);
  const [mode, setMode] = useState<'HOME' | 'CENTER'>('HOME');
  const [addressId, setAddressId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [slotStarts, setSlotStarts] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'notfound' | 'generic' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const offer = item?.offers[0] ?? null;
  const homeOk = offer?.lab_eligibility?.lab_home_enabled ?? true;
  const centerOk = offer?.lab_eligibility?.lab_center_enabled ?? false;

  const handleErr = useCallback(
    (err: unknown) => {
      if (err instanceof LabCustomerApiError) {
        if (err.status === 401) {
          expire();
          return;
        }
        if (err.status === 403) {
          setError('forbidden');
          return;
        }
        if (err.status === 404) {
          setError('notfound');
          return;
        }
        if (err.status === 0) {
          setError('network');
          return;
        }
        setFormError(err.message);
        return;
      }
      setError('generic');
    },
    [expire],
  );

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchLabCatalogItem(token, slug, country);
      setItem(detail);
      const first = detail.offers[0];
      if (first) {
        const [addrRes, locs, slotRes] = await Promise.all([
          fetchAddresses({ token }),
          fetchLabLocations(token, first.seller_org_id, country),
          fetchLabSlots(token, first.seller_org_id, 'HOME', country).catch(() => ({ data: [] })),
        ]);
        const addressRows = addrRes.ok && Array.isArray(addrRes.data) ? addrRes.data : [];
        setAddresses(addressRows);
        if (addressRows[0]) {
          setAddressId(addressRows[0].id);
        }
        setLocations(locs.data);
        if (locs.data[0]) {
          setLocationId(locs.data[0].id);
        }
        setSlots(slotRes.data);
        if (slotRes.data[0]) {
          setSlotStarts(slotRes.data[0].starts_at);
        }
        if (!(first.lab_eligibility?.lab_home_enabled) && first.lab_eligibility?.lab_center_enabled) {
          setMode('CENTER');
        }
      }
    } catch (err) {
      handleErr(err);
    } finally {
      setLoading(false);
    }
  }, [country, getAccessToken, handleErr, slug]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !offer) {
      return;
    }
    void fetchLabSlots(token, offer.seller_org_id, mode, country)
      .then((res) => {
        setSlots(res.data);
        setSlotStarts(res.data[0]?.starts_at ?? '');
      })
      .catch(() => setSlots([]));
  }, [country, getAccessToken, mode, offer]);

  const canSubmit = useMemo(() => {
    if (!offer || !slotStarts) {
      return false;
    }
    if (mode === 'HOME') {
      return Boolean(addressId) && homeOk;
    }
    return Boolean(locationId) && centerOk;
  }, [addressId, centerOk, homeOk, locationId, mode, offer, slotStarts]);

  async function bookAndPay(scenario: 'success' | 'failed') {
    const token = getAccessToken();
    if (!token || !offer) {
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const booking = await createLabBooking(token, newIdempotencyKey('lab-book'), {
        offer_id: offer.id,
        collection_mode: mode,
        lab_org_id: offer.seller_org_id,
        customer_address_id: mode === 'HOME' ? addressId : undefined,
        lab_location_id: mode === 'CENTER' ? locationId : undefined,
        slot_starts_at: slotStarts,
        country,
      });
      const paid = await payLabBooking(token, booking.id, newIdempotencyKey('lab-pay'), scenario);
      if (paid.status === 'CAPTURED') {
        setSuccessId(booking.id);
        window.location.href = `/lab/bookings/${booking.id}`;
        return;
      }
      setFormError(`Sandbox payment ended as ${paid.status}. Booking ${booking.id} was not confirmed.`);
      setSuccessId(booking.id);
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(false);
    }
  }

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  return (
    <CustomerShell apiReachable={true} countryLabel={country}>
      <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/lab')}>
        Back to lab catalog
      </Button>
      {loading ? <LoadingState label="Loading lab test details…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'notfound' ? (
        <EmptyState title="Test not found" description="This lab test is unpublished or not bookable here." />
      ) : null}
      {error === 'generic' ? <EmptyState title="Unable to load" description="Try again shortly." /> : null}
      {!loading && !error && item && offer ? (
        <>
          <Heading level={2}>{item.title}</Heading>
          <Text tone="secondary">{item.description || 'Commercial catalog description only.'}</Text>
          <Text size="caption">{item.note}</Text>
          <Card>
            <Text>{offer.seller_display_name}</Text>
            <Text>
              {offer.price ? `${offer.currency} ${offer.price.sell_minor}` : 'Price unavailable'}
            </Text>
            <Text size="caption">Sandbox payment only. No specimen collection in this step.</Text>
          </Card>
          <Heading level={3}>Book collection</Heading>
          <FormField label="Collection mode">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'HOME' | 'CENTER')}
              >
                {homeOk ? <option value="HOME">Home collection</option> : null}
                {centerOk ? <option value="CENTER">Lab center</option> : null}
              </select>
            )}
          </FormField>
          {mode === 'HOME' ? (
            <FormField label="Home address">
              {({ id }) => (
                <select
                  id={id}
                  className="wp-input"
                  value={addressId}
                  onChange={(e) => setAddressId(e.target.value)}
                >
                  {!addresses.length ? <option value="">No saved addresses</option> : null}
                  {addresses.map((row) => (
                    <option key={row.id} value={row.id}>
                      {(row.recipient_name ?? row.recipientName ?? 'Address') + ` — ${row.line1}`}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          ) : (
            <FormField label="Lab center location">
              {({ id }) => (
                <select
                  id={id}
                  className="wp-input"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  {!locations.length ? <option value="">No active LAB locations</option> : null}
                  {locations.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                      {row.city ? ` · ${row.city}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
          <FormField label="Preferred slot">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={slotStarts}
                onChange={(e) => setSlotStarts(e.target.value)}
              >
                {!slots.length ? <option value="">No slots</option> : null}
                {slots.map((slot) => (
                  <option key={slot.starts_at} value={slot.starts_at}>
                    {new Date(slot.starts_at).toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          {formError ? <Text>{formError}</Text> : null}
          {busy ? <LoadingState label="Confirming sandbox lab booking…" /> : null}
          <Button disabled={!canSubmit || busy} onClick={() => void bookAndPay('success')}>
            Book & pay (sandbox success)
          </Button>
          <Button
            variant="secondary"
            disabled={!canSubmit || busy}
            onClick={() => void bookAndPay('failed')}
          >
            Simulate sandbox payment failure
          </Button>
          {successId ? (
            <Button variant="tertiary" onClick={() => (window.location.href = `/lab/bookings/${successId}`)}>
              Open booking
            </Button>
          ) : null}
          {!addresses.length && mode === 'HOME' ? (
            <Button variant="tertiary" onClick={() => (window.location.href = '/account/addresses')}>
              Add an address first
            </Button>
          ) : null}
        </>
      ) : null}
    </CustomerShell>
  );
}
