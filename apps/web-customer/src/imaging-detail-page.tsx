'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession, showDevTools } from '@world-pharma/shell-web';
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
  checkImagingEligibility,
  createImagingBooking,
  fetchImagingCatalogItem,
  fetchImagingLocations,
  fetchImagingSlots,
  ImagingCustomerApiError,
  payImagingBooking,
  type ImagingCatalogItem,
} from './imaging-api';
import { formatMoney } from './format-money';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, MgBackLink, Page, PageIntro, ServiceHero } from './ui/mg-ui';

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const PREP_INSTRUCTIONS = [
  'Arrive 15 minutes before your scheduled slot with your booking reference.',
  'Wear comfortable clothing without metal where possible.',
  'Follow any fasting or contrast instructions from the imaging center.',
] as const;

export function ImagingDetailScreen({ slug }: { slug: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country: selectedCountry } = useSelectedCountry();
  const country =
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('country') : null) ??
    selectedCountry;

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
    if (!token) return;
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
        if (locs.data[0]) setLocationId(locs.data[0].id);
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
    if (session.status === 'authenticated') void load();
  }, [load, session.status]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !offer) return;
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
      .catch(() => setEligibilityOk(false));
  }, [country, getAccessToken, offer, referralRef]);

  const canSubmit = useMemo(() => {
    if (!offer || !slotStarts || !locationId || !prepAck || eligibilityOk !== true) return false;
    if (referralRequired && !referralRef.trim()) return false;
    return true;
  }, [eligibilityOk, locationId, offer, prepAck, referralRef, referralRequired, slotStarts]);

  async function bookAndPay(scenario: 'success' | 'failed') {
    const token = getAccessToken();
    if (!token || !offer) return;
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
        window.location.href = `/radiology/bookings/${booking.id}`;
        return;
      }
      setFormError(`Payment ended as ${paid.status}. Booking ${booking.id} was not confirmed.`);
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
        <MgBackLink href="/radiology">← All imaging studies</MgBackLink>
        <ServiceHero
          kicker="Partner imaging"
          title="Book imaging study"
          subtitle="Sign in to view details and schedule at a partner center."
          tone="scan"
          compact
        />
        <PageIntro>
          <p>Commercial imaging listings — not a diagnosis or referral. Always follow your physician&apos;s advice.</p>
        </PageIntro>
        <EmptyState
          title="Sign in required"
          description="Login to view imaging study details and book an appointment."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </Page>
    );
  }

  return (
    <Page>
      <MgBackLink href="/radiology">← All imaging studies</MgBackLink>
      {loading ? <LoadingState label="Loading imaging study" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'notfound' ? (
        <EmptyState title="Study not found" description="This imaging study is not available in your area." />
      ) : null}
      {error === 'generic' ? <EmptyState title="Unable to load" description="Try again shortly." /> : null}
      {!loading && !error && item && offer ? (
        <>
          <ServiceHero
            kicker="Partner imaging"
            title={item.title}
            subtitle={item.description || 'Center visit · digital report when published.'}
            tone="scan"
            compact
          />
          <MgCard>
            <p className="mg-list-meta">{offer.seller_display_name}</p>
            <p className="mg-lab-price">
              {offer.price ? formatMoney(offer.price.sell_minor, offer.currency) : 'Price on request'}
            </p>
            <p className="mg-lab-badge">Partner imaging center</p>
            {item.note ? <p className="mg-text-muted">{item.note}</p> : null}
          </MgCard>

          <MgCard>
            <h2 className="mg-section-title">Before your visit</h2>
            <ul className="mg-prose">
              {PREP_INSTRUCTIONS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mg-text-muted">Commercial preparation summary — not a clinical order.</p>
          </MgCard>

          <MgCard>
            <h2 className="mg-section-title">Book appointment</h2>
            {eligibilityOk === false ? (
              <EmptyState
                title="Not eligible to book"
                description={eligibilityReason ?? 'Imaging booking is unavailable for this center.'}
              />
            ) : null}
            {eligibilityOk === true ? <p className="mg-text-muted">Eligible for center booking in {country}.</p> : null}
            {referralRequired ? (
              <FormField label="Referral reference (required)">
                {({ id }) => (
                  <input
                    id={id}
                    className="mg-input"
                    value={referralRef}
                    onChange={(e) => setReferralRef(e.target.value)}
                    aria-required="true"
                  />
                )}
              </FormField>
            ) : null}
            <FormField label="Imaging center">
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
            <FormField label="Preferred slot">
              {({ id }) => (
                <select
                  id={id}
                  className="mg-select"
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
            <label className="mg-field">
              <span className="mg-field-label">Preparation acknowledgement</span>
              <input type="checkbox" checked={prepAck} onChange={(e) => setPrepAck(e.target.checked)} /> I have read
              the preparation information above.
            </label>
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
          </MgCard>
          <p className="mg-auth-alt">
            View bookings in <Link href="/radiology/bookings">My imaging bookings</Link>
          </p>
        </>
      ) : null}
    </Page>
  );
}
