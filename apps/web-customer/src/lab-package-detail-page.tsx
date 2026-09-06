'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';
import { useSelectedCountry } from './use-selected-country';
import {
  bookHealthPackage,
  fetchPublicHealthPackage,
  formatPackageRupees,
  type HealthPackageDetail,
} from './health-packages-api';
import { MgBackLink, MgBtn, MgCard, Page, PageIntro, ServiceHero } from './ui/mg-ui';

export function LabPackageDetailPage({ packageId }: { packageId: string }) {
  const { session, getAccessToken, expire } = useSession();
  const { country } = useSelectedCountry();
  const [pkg, setPkg] = useState<HealthPackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void fetchPublicHealthPackage(packageId, country)
      .then(setPkg)
      .catch(() => setPkg(null))
      .finally(() => setLoading(false));
  }, [country, packageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function book() {
    if (session.status !== 'authenticated') {
      window.location.href = `/login?next=/lab/packages/${encodeURIComponent(packageId)}`;
      return;
    }
    const token = getAccessToken();
    if (!token) {
      window.location.href = `/login?next=/lab/packages/${encodeURIComponent(packageId)}`;
      return;
    }
    setBusy(true);
    setMessage(null);
    setBookingId(null);
    const result = await bookHealthPackage(
      token,
      { package_id: packageId, country_code: country, home_collection: true },
      expire,
    );
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setMessage(result.data.message);
    setBookingId(result.data.id);
  }

  return (
    <Page>
      <MgBackLink href="/lab/packages">← All checkups</MgBackLink>
      {loading ? <LoadingState label="Loading package" /> : null}
      {!loading && !pkg ? (
        <EmptyState
          title="Package not found"
          description="This checkup is not listed for your country."
          action={{ label: 'Browse packages', onClick: () => (window.location.href = '/lab/packages') }}
        />
      ) : null}
      {pkg ? (
        <>
          <ServiceHero
            kicker="Health checkup"
            title={pkg.name}
            subtitle={`${pkg.tests_count} tests · ${pkg.report_turnaround} · ${pkg.lab_partners.join(', ')}`}
            tone="lab"
            actions={
              <MgBtn onClick={() => void book()} disabled={busy}>
                {session.status === 'authenticated' ? (busy ? 'Requesting…' : 'Book home collection') : 'Sign in to book'}
              </MgBtn>
            }
          />
          <PageIntro>
            <p>{pkg.description}</p>
            <p>
              {formatPackageRupees(pkg.price)}{' '}
              <s className="mg-text-muted">{formatPackageRupees(pkg.original_price)}</s>
              {pkg.discount ? ` · ${pkg.discount}% off` : ''}
              {pkg.requires_fasting ? ' · Fasting required' : ' · Fasting not required'}
            </p>
          </PageIntro>
          {message ? <p className="mg-list-meta">{message}</p> : null}
          {bookingId ? (
            <div className="mg-toolbar">
              <MgBtn href={`/lab/bookings/${bookingId}`}>View booking status</MgBtn>
              <MgBtn href="/lab/bookings" variant="secondary">
                All lab bookings
              </MgBtn>
            </div>
          ) : null}
          <MgCard>
            <h2 className="mg-list-title">Included tests</h2>
            <ul className="mg-care-plan-perks">
              {pkg.included_tests.map((test) => (
                <li key={test}>{test}</li>
              ))}
            </ul>
          </MgCard>
          <MgCard>
            <h2 className="mg-list-title">How to prepare</h2>
            <ul className="mg-care-plan-perks">
              {pkg.preparation_instructions.map((row) => (
                <li key={row}>{row}</li>
              ))}
            </ul>
          </MgCard>
        </>
      ) : null}
    </Page>
  );
}
