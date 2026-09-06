'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  FormField,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchAddresses, type CustomerAddress } from './account-api';
import {
  createLabBooking,
  fetchLabCatalogItem,
  fetchLabLocations,
  fetchLabSlots,
  LabCustomerApiError,
  payLabBooking,
  type LabCatalogItem,
} from './lab-api';
import { formatMoney } from './format-money';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, MgBackLink, Page, PageIntro, ServiceHero } from './ui/mg-ui';
import { showDevTools } from '@world-pharma/shell-web';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function LabDetailScreen({ slug }: { slug: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country: selectedCountry } = useSelectedCountry();
  const country =
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('country')
      : null) ?? selectedCountry;

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
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  const rankedOffers = useMemo(() => {
    if (!item) return [];
    return [...item.offers].sort(
      (a, b) => Number(a.price?.sell_minor ?? Number.POSITIVE_INFINITY) - Number(b.price?.sell_minor ?? Number.POSITIVE_INFINITY),
    );
  }, [item]);
  const offer = (item?.offers.find((row) => row.id === selectedOfferId) ?? rankedOffers[0]) ?? null;
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
      const cheapest = [...detail.offers].sort(
        (a, b) => Number(a.price?.sell_minor ?? Number.POSITIVE_INFINITY) - Number(b.price?.sell_minor ?? Number.POSITIVE_INFINITY),
      )[0];
      const first = cheapest ?? detail.offers[0];
      setSelectedOfferId(first?.id ?? null);
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

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !offer) {
      return;
    }
    void fetchLabLocations(token, offer.seller_org_id, country)
      .then((locs) => {
        setLocations(locs.data);
        setLocationId(locs.data[0]?.id ?? '');
      })
      .catch(() => setLocations([]));
  }, [country, getAccessToken, offer]);

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

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <MgBackLink href="/lab">← All lab tests</MgBackLink>
        <ServiceHero
          kicker="Home collection"
          title="Book lab test"
          subtitle="Sign in to schedule home collection or center visit."
          tone="lab"
          compact
        />
        <PageIntro>
          <p>Home phlebotomist collection where available. Digital reports appear in your health timeline when ready.</p>
        </PageIntro>
        <EmptyState title="Sign in required" description="Login to book this lab test." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </Page>
    );
  }

  return (
    <Page>
      <MgBackLink href="/lab">← All lab tests</MgBackLink>
      {loading ? <LoadingState label="Loading lab test" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'notfound' ? (
        <EmptyState title="Test not found" description="This lab test is not available in your area." />
      ) : null}
      {error === 'generic' ? <EmptyState title="Unable to load" description="Try again shortly." /> : null}
      {!loading && !error && item && offer ? (
        <>
          <ServiceHero
            kicker="Home collection"
            title={item.title}
            subtitle={item.description || 'Home sample collection where available.'}
            tone="lab"
            compact
          />
          <MgCard>
            <p className="mg-list-meta">{offer.seller_display_name}</p>
            <p className="mg-lab-price">
              {offer.price ? formatMoney(offer.price.sell_minor, offer.currency) : 'Price on request'}
            </p>
            <p className="mg-lab-badge">NABL-certified partner lab · reports in health timeline</p>
          </MgCard>
          {rankedOffers.length > 1 ? (
            <MgCard>
              <h2 className="mg-section-title">Compare labs</h2>
              <ul className="mg-order-list">
                {rankedOffers.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={row.id === offer.id ? 'mg-chip is-active' : 'mg-chip'}
                      onClick={() => setSelectedOfferId(row.id)}
                    >
                      {row.seller_display_name} ·{' '}
                      {row.price ? formatMoney(row.price.sell_minor, row.currency) : 'Price on request'}
                    </button>
                  </li>
                ))}
              </ul>
            </MgCard>
          ) : null}
          <MgCard>
            <h2 className="mg-section-title">Book collection</h2>
            <FormField label="Collection mode">
              {({ id }) => (
                <select id={id} className="mg-select" value={mode} onChange={(e) => setMode(e.target.value as 'HOME' | 'CENTER')}>
                  {homeOk ? <option value="HOME">Home collection</option> : null}
                  {centerOk ? <option value="CENTER">Lab center</option> : null}
                </select>
              )}
            </FormField>
            {mode === 'HOME' ? (
              <FormField label="Home address">
                {({ id }) => (
                  <select id={id} className="mg-select" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
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
              <FormField label="Lab center">
                {({ id }) => (
                  <select id={id} className="mg-select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    {!locations.length ? <option value="">No locations</option> : null}
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
                <select id={id} className="mg-select" value={slotStarts} onChange={(e) => setSlotStarts(e.target.value)}>
                  {!slots.length ? <option value="">No slots</option> : null}
                  {slots.map((slot) => (
                    <option key={slot.starts_at} value={slot.starts_at}>
                      {new Date(slot.starts_at).toLocaleString()}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            {formError ? <Text tone="secondary">{formError}</Text> : null}
            {busy ? <LoadingState label="Confirming booking" /> : null}
            <MgBtn block disabled={!canSubmit || busy} onClick={() => void bookAndPay('success')}>
              Book &amp; pay
            </MgBtn>
            {showDevTools() ? (
              <MgBtn variant="ghost" disabled={!canSubmit || busy} onClick={() => void bookAndPay('failed')}>
                Dev: simulate failure
              </MgBtn>
            ) : null}
            {!addresses.length && mode === 'HOME' ? (
              <MgBtn variant="ghost" href="/account/addresses">
                Add address first
              </MgBtn>
            ) : null}
          </MgCard>
        </>
      ) : null}
    </Page>
  );
}
