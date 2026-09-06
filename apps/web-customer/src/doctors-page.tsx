'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, NetworkErrorState, Text } from '@world-pharma/ui-kit/web';
import { fetchCareDoctors, fetchPublicCareDoctors } from './care-api';
import { useSelectedCountry } from './use-selected-country';
import { MgBtn, MgCard, Page } from './ui/mg-ui';

type DirectoryDoctor = {
  profile_id: string;
  display_name: string;
  specialties?: string[];
  online_capable?: boolean;
};

const DOCTOR_BENEFITS = [
  'General physicians and specialists verified by our partner network',
  'Video consult from home — no clinic visit required',
  'Digital prescriptions sent to your account when clinically appropriate',
] as const;

const SPECIALTY_CHIPS = [
  'General Medicine',
  'Dermatologist',
  'Pediatrician',
  'Gynecologist',
  'Psychiatrist',
  'Cardiologist',
  'Orthopedist',
  'ENT',
  'Diabetologist',
] as const;

export function DoctorsScreen() {
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [doctors, setDoctors] = useState<DirectoryDoctor[]>([]);
  const [specialty, setSpecialty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'generic' | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    setLoading(true);
    setError(null);
    try {
      const body = token
        ? ((await fetchCareDoctors(token, country)) as { doctors?: DirectoryDoctor[] })
        : ((await fetchPublicCareDoctors(country)) as { doctors?: DirectoryDoctor[] });
      setDoctors(body.doctors ?? []);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        expire();
        return;
      }
      setError(status === 0 ? 'network' : 'generic');
    } finally {
      setLoading(false);
    }
  }, [country, expire, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load, session.status]);

  const instantDoctor = doctors.find((d) => d.online_capable);
  const visibleDoctors = specialty
    ? doctors.filter((doc) =>
        (doc.specialties ?? []).some((s) => s.toLowerCase().includes(specialty.toLowerCase())),
      )
    : doctors;

  return (
    <Page>
      <section className="mg-service-hero" aria-label="Doctor consults">
        <p className="mg-service-kicker">Verified doctors · Video & clinic</p>
        <h1 className="mg-service-title">Consult a doctor online</h1>
        <p className="mg-service-sub">
          General physicians and specialists from our partner network — digital prescriptions when clinically appropriate.
        </p>
      </section>

      <ul className="mg-benefits">
        {DOCTOR_BENEFITS.map((item) => (
          <li key={item} className="mg-benefit">
            {item}
          </li>
        ))}
      </ul>

      <MgCard>
        <h2 className="mg-section-title">Instant consult</h2>
        <Text tone="secondary">
          Need advice now? Book the next available video slot with a general physician — same flow as a scheduled consult.
        </Text>
        <div className="mg-toolbar">
          {session.status === 'authenticated' && instantDoctor ? (
            <MgBtn href={`/doctors/${instantDoctor.profile_id}`}>Start video consult</MgBtn>
          ) : (
            <MgBtn href="/login?next=/doctors">Sign in for instant consult</MgBtn>
          )}
          <MgBtn href="/lab/bookings" variant="secondary">
            Follow up from a lab report
          </MgBtn>
        </div>
      </MgCard>

      {session.status !== 'authenticated' ? (
        <MgCard className="mg-signin-card">
          <h2 className="mg-section-title">Sign in to book a slot</h2>
          <Text tone="secondary">Browse available doctors below. Sign in with OTP to pick a time and start your consult.</Text>
          <div className="mg-toolbar">
            <MgBtn href="/login?next=/doctors">Sign in</MgBtn>
            <MgBtn href="/signup" variant="secondary">
              Create account
            </MgBtn>
          </div>
        </MgCard>
      ) : null}

      <div className="mg-section">
        <h2 className="mg-section-title">Browse by specialty</h2>
        <ul className="mg-chips">
          {SPECIALTY_CHIPS.map((s) => (
            <li key={s}>
              <button
                type="button"
                className={specialty === s ? 'mg-chip is-active' : 'mg-chip'}
                onClick={() => setSpecialty(specialty === s ? '' : s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {loading ? <LoadingState label="Loading doctors" /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      {error === 'generic' ? <EmptyState title="Could not load doctors" description="Please try again." /> : null}

      {!loading && !error && visibleDoctors.length === 0 ? (
        <EmptyState title="No doctors available yet" description="Doctors will appear when partners go live in your area." />
      ) : null}

      {!loading && visibleDoctors.length > 0 ? (
        <ul className="mg-doctor-grid">
          {visibleDoctors.map((doc) => {
            const initials = doc.display_name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0] ?? '')
              .join('')
              .toUpperCase();
            return (
              <li key={doc.profile_id}>
                <MgCard>
                  <div className="mg-doctor-card">
                    <div className="mg-doctor-avatar" aria-hidden>
                      {initials || 'Dr'}
                    </div>
                    <div className="mg-doctor-body">
                      <span className="mg-discovery-type">Doctor</span>
                      <h3 className="mg-doctor-name">{doc.display_name}</h3>
                      <p className="mg-doctor-spec">{doc.specialties?.join(' · ') ?? 'General practice'}</p>
                      {doc.online_capable ? <span className="mg-doctor-online">Video consult</span> : null}
                      <div className="mg-doctor-actions">
                        <MgBtn href={`/doctors/${doc.profile_id}`} size="sm">
                          Consult now
                        </MgBtn>
                      </div>
                    </div>
                  </div>
                </MgCard>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mg-text-muted">
        Need help choosing? <Link href="/help">Visit help centre</Link>
      </p>
    </Page>
  );
}
