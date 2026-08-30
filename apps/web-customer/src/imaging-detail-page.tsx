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
import { CustomerShell } from './customer-shell';
import {
  checkImagingEligibility,
  createImagingBooking,
  fetchImagingCatalogItem,
  fetchImagingLocations,
  fetchImagingSlots,
  ImagingCustomerApiError,
  payImagingBooking,
  type ImagingCatalogItem,
} from './imaging-api';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const PREP_INSTRUCTIONS = [
  'Arrive 15 minutes before your scheduled slot with your booking reference.',
  'Wear comfortable clothing without metal where possible.',
  'Follow any fasting or contrast instructions provided by the imaging center separately.',
];

export function ImagingDetailScreen({ slug }: { slug: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { countries } = useCountries();
  const country =
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('country')
      : null) ??
    countries[0]?.iso_alpha2 ??
    'XX';

  const [item, setItem] = useState<ImagingCatalogItem | null>(null);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; city: string | null }>>([]);
  const [slots, setSlots] = useState<Array<{ starts_at: string; ends_at: string }>>([]);
  const [locationId, setLocationId] = useState('');
  const [slotStarts, setSlotStarts] = useState('');
  const [slotEnds, setSlotEnds] = useState('');
  const [prepAck, setPrepAck] = useState(false);
  const [referralRef, setReferralRef] = useState('');
  const [referralRequired, setReferralRequired] = useState(false);
  const [eligibilityOk, setEligibilityOk] = useState<boolean | null>(null);
  const [eligibilityReason, setEligibilityReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'notfound' | 'generic' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const offer = item?.offers[0] ?? null;

  const handleErr = useCallback(
    (err: unknown) => {
      if (err instanceof ImagingCustomerApiError) {
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
      const detail = await fetchImagingCatalogItem(token, slug, country);
      setItem(detail);
      const first = detail.offers[0];
      if (first) {
        const [locs, slotRes, elig] = await Promise.all([
          fetchImagingLocations(token, first.seller_org_id, country),
          fetchImagingSlots(token, first.seller_org_id, country).catch(() => ({ data: [] })),
          checkImagingEligibility(token, {
            imaging_org_id: first.seller_org_id,
            offer_id: first.id,
            country,
          }),
        ]);
        setLocations(locs.data);
        if (locs.data[0]) {
          setLocationId(locs.data[0].id);
        }
        setSlots(slotRes.data);
        if (slotRes.data[0]) {
          setSlotStarts(slotRes.data[0].starts_at);
          setSlotEnds(slotRes.data[0].ends_at);
        }
        setReferralRequired(elig.referral_required);
        setEligibilityOk(elig.eligible);
        setEligibilityReason(elig.blocked_reason);
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
    void checkImagingEligibility(token, {
      imaging_org_id: offer.seller_org_id,
      offer_id: offer.id,
      country,
      referral_reference: referralRef.trim() || undefined,
    })
      .then((elig) => {
        setEligibilityOk(elig.eligible);
        setEligibilityReason(elig.blocked_reason);
        setReferralRequired(elig.referral_required);
      })
      .catch(() => {
        setEligibilityOk(false);
      });
  }, [country, getAccessToken, offer, referralRef]);

  const canSubmit = useMemo(() => {
    if (!offer || !slotStarts || !locationId || !prepAck || eligibilityOk !== true) {
      return false;
    }
    if (referralRequired && !referralRef.trim()) {
      return false;
    }
    return true;
  }, [eligibilityOk, locationId, offer, prepAck, referralRef, referralRequired, slotStarts]);

  async function bookAndPay(scenario: 'success' | 'failed') {
    const token = getAccessToken();
    if (!token || !offer) {
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const booking = await createImagingBooking(token, newIdempotencyKey('img-book'), {
        offer_id: offer.id,
        imaging_org_id: offer.seller_org_id,
        imaging_location_id: locationId,
        slot_starts_at: slotStarts,
        slot_ends_at: slotEnds || undefined,
        country,
        prep_acknowledged: true,
        referral_reference: referralRef.trim() || undefined,
      });
      const paid = await payImagingBooking(token, booking.id, newIdempotencyKey('img-pay'), scenario);
      if (paid.status === 'CAPTURED') {
        setSuccessId(booking.id);
        window.location.href = `/radiology/bookings/${booking.id}`;
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
      <Button variant="tertiary" size="sm" onClick={() => (window.location.href = '/radiology')}>
        Back to imaging catalog
      </Button>
      {loading ? <LoadingState label="Loading imaging study details…" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'notfound' ? (
        <EmptyState title="Study not found" description="This imaging study is unpublished or not bookable here." />
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
            <Text size="caption">Sandbox payment only. Imaging acquisition remains OFF (R8-C+).</Text>
          </Card>

          <Heading level={3}>Preparation</Heading>
          <Card>
            <ul>
              {PREP_INSTRUCTIONS.map((line) => (
                <li key={line}>
                  <Text size="caption">{line}</Text>
                </li>
              ))}
            </ul>
            <Text size="caption">Commercial preparation summary only. Not a clinical order.</Text>
          </Card>

          <Heading level={3}>Eligibility</Heading>
          {eligibilityOk === false ? (
            <EmptyState
              title="Not eligible to book"
              description={eligibilityReason ?? 'Imaging booking is unavailable for this center.'}
            />
          ) : null}
          {eligibilityOk === true ? <Text size="caption">Eligible for center booking in {country}.</Text> : null}
          {referralRequired ? (
            <FormField label="Referral reference (required by country pack)">
              {({ id }) => (
                <input
                  id={id}
                  className="wp-input"
                  value={referralRef}
                  onChange={(e) => setReferralRef(e.target.value)}
                  aria-required="true"
                />
              )}
            </FormField>
          ) : null}

          <Heading level={3}>Imaging center location</Heading>
          <FormField label="Center location">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {!locations.length ? <option value="">No active IMAGING locations</option> : null}
                {locations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.city ? ` · ${row.city}` : ''}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <Heading level={3}>Appointment slot</Heading>
          <FormField label="Preferred slot">
            {({ id }) => (
              <select
                id={id}
                className="wp-input"
                value={slotStarts}
                onChange={(e) => {
                  const pick = slots.find((s) => s.starts_at === e.target.value);
                  setSlotStarts(e.target.value);
                  setSlotEnds(pick?.ends_at ?? '');
                }}
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

          <Heading level={3}>Review & pay</Heading>
          <FormField label="Preparation acknowledgement">
            {({ id }) => (
              <label htmlFor={id}>
                <input
                  id={id}
                  type="checkbox"
                  checked={prepAck}
                  onChange={(e) => setPrepAck(e.target.checked)}
                />{' '}
                I have read the preparation information above.
              </label>
            )}
          </FormField>
          {formError ? <Text>{formError}</Text> : null}
          {busy ? <LoadingState label="Confirming sandbox imaging booking…" /> : null}
          <Button disabled={!canSubmit || busy} onClick={() => void bookAndPay('success')}>
            Book & pay (sandbox success)
          </Button>
          <Button variant="secondary" disabled={!canSubmit || busy} onClick={() => void bookAndPay('failed')}>
            Simulate sandbox payment failure
          </Button>
          {successId ? (
            <Button variant="tertiary" onClick={() => (window.location.href = `/radiology/bookings/${successId}`)}>
              Open booking
            </Button>
          ) : null}
        </>
      ) : null}
    </CustomerShell>
  );
}
