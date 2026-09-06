'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { bookAppointment, fetchDoctorProfile, fetchDoctorSlots, fetchPublicDoctorProfile, type DoctorPublicProfile } from './care-api';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, MgBackLink, Page, PageIntro, ServiceHero } from './ui/mg-ui';

export function DoctorDetailScreen({ profileId }: { profileId: string }) {
  const { session, getAccessToken, expire } = useSession();
  const { country: selectedCountry } = useSelectedCountry();
  const country =
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('country') : null) ??
    selectedCountry;

  const [profile, setProfile] = useState<DoctorPublicProfile | null>(null);
  const [slots, setSlots] = useState<Array<{ starts_at: string; ends_at?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'notfound' | 'generic' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [consultType, setConsultType] = useState<'IN_PERSON' | 'ONLINE'>('ONLINE');

  const onlineOk = profile?.online_capable ?? false;

  const loadProfile = useCallback(async () => {
    const token = getAccessToken();
    setLoading(true);
    setError(null);
    try {
      setProfile(
        token
          ? await fetchDoctorProfile(token, profileId, country)
          : await fetchPublicDoctorProfile(profileId, country),
      );
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        expire();
        return;
      }
      if (status === 403) setError('forbidden');
      else if (status === 404) setError('notfound');
      else if (status === 0) setError('network');
      else setError('generic');
    } finally {
      setLoading(false);
    }
  }, [country, expire, getAccessToken, profileId]);

  const loadSlots = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setSlotsLoading(true);
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 86400_000).toISOString();
    try {
      const body = (await fetchDoctorSlots(token, profileId, country, from, to)) as {
        slots?: Array<{ starts_at: string; ends_at?: string }>;
      };
      setSlots(body.slots ?? []);
    } catch {
      setFormError('Could not load availability.');
    } finally {
      setSlotsLoading(false);
    }
  }, [country, getAccessToken, profileId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, session.status]);

  useEffect(() => {
    if (session.status === 'authenticated' && profile) void loadSlots();
  }, [loadSlots, profile, session.status]);

  const headline = useMemo(() => profile?.display_name ?? 'Doctor', [profile?.display_name]);

  async function book(startsAt: string) {
    const token = getAccessToken();
    if (!token) return;
    setBooking(true);
    setFormError(null);
    try {
      await bookAppointment(token, {
        doctor_profile_id: profileId,
        country_code: country,
        starts_at: startsAt,
        type: consultType,
      });
      window.location.href = '/appointments';
    } catch (err) {
      setFormError((err as Error).message ?? 'Booking failed.');
    } finally {
      setBooking(false);
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/doctors/${profileId}`)}`;

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <MgBackLink href="/doctors">← All doctors</MgBackLink>
        <ServiceHero
          kicker="Verified network"
          title={headline}
          subtitle={profile?.specialties?.join(' · ') ?? 'Sign in to book a consult'}
        />
        <PageIntro>
          <p>Browse this doctor profile. Sign in with OTP to pick a slot for video or clinic visit.</p>
        </PageIntro>
        {loading ? <LoadingState label="Loading doctor profile" /> : null}
        {error === 'notfound' ? <EmptyState title="Doctor unavailable" description="This doctor is not listed in your area." /> : null}
        {error === 'network' || error === 'generic' ? (
          <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadProfile() }} />
        ) : null}
        {profile ? (
          <MgCard>
            <div className="mg-doctor-card">
              <div className="mg-doctor-avatar">{profile.display_name.charAt(0)}</div>
              <div>
                {profile.languages?.length ? <p className="mg-list-meta">Speaks: {profile.languages.join(', ')}</p> : null}
                {profile.online_capable ? <p className="mg-doctor-online">Online consult available</p> : null}
                {profile.bio ? <p className="mg-text-muted">{profile.bio}</p> : null}
              </div>
            </div>
            <div className="mg-toolbar">
              <MgBtn href={loginHref}>Sign in to book</MgBtn>
            </div>
          </MgCard>
        ) : null}
      </Page>
    );
  }

  return (
    <Page>
      <MgBackLink href="/doctors">← All doctors</MgBackLink>
      <ServiceHero
        kicker="Verified network"
        title={headline}
        subtitle={profile?.specialties?.join(' · ') ?? 'General physician'}
      />

      {loading ? <LoadingState label="Loading doctor profile" /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'notfound' ? <EmptyState title="Doctor unavailable" description="This doctor is not listed in your area." /> : null}
      {error === 'network' || error === 'generic' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadProfile() }} />
      ) : null}

      {profile ? (
        <>
          <MgCard>
            <div className="mg-doctor-card">
              <div className="mg-doctor-avatar">{profile.display_name.charAt(0)}</div>
              <div>
                {profile.languages?.length ? <p className="mg-list-meta">Speaks: {profile.languages.join(', ')}</p> : null}
                {profile.online_capable ? <p className="mg-doctor-online">Online consult available</p> : null}
                {profile.bio ? <p className="mg-text-muted">{profile.bio}</p> : null}
              </div>
            </div>
          </MgCard>

          <MgCard>
            <h2 className="mg-section-title">Book consultation</h2>
            <div className="mg-toolbar">
              <MgBtn variant={consultType === 'IN_PERSON' ? 'primary' : 'secondary'} size="sm" onClick={() => setConsultType('IN_PERSON')}>
                Clinic visit
              </MgBtn>
              {onlineOk ? (
                <MgBtn variant={consultType === 'ONLINE' ? 'primary' : 'secondary'} size="sm" onClick={() => setConsultType('ONLINE')}>
                  Video consult
                </MgBtn>
              ) : null}
            </div>
            {slotsLoading ? <LoadingState label="Loading slots" /> : null}
            {!slotsLoading && slots.length === 0 ? (
              <EmptyState title="No slots available" description="Try again later or choose another doctor." />
            ) : (
              <ul className="mg-slot-list">
                {slots.map((slot) => (
                  <li key={slot.starts_at}>
                    <MgBtn variant="secondary" block disabled={booking} onClick={() => void book(slot.starts_at)}>
                      {booking ? 'Booking…' : new Date(slot.starts_at).toLocaleString()}
                    </MgBtn>
                  </li>
                ))}
              </ul>
            )}
            {formError ? <Text tone="secondary">{formError}</Text> : null}
          </MgCard>
        </>
      ) : null}
    </Page>
  );
}
