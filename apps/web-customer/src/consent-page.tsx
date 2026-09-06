'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import {
  CONSENT_PURPOSES,
  CONSENT_SCOPES,
  fetchCareDoctorsForConsent,
  fetchConsentGrants,
  grantConsent,
  revokeConsent,
  type CareDoctor,
  type ConsentGrant,
} from './consent-api';
import { useSelectedCountry } from './use-selected-country';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard, Section } from './ui/mg-ui';

function formatWhen(iso: string | null | undefined) {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ConsentScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country: countryCode, countryName } = useSelectedCountry();
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [doctors, setDoctors] = useState<CareDoctor[]>([]);
  const [loading, setLoading] = useState(false);
  const [policyUnavailable, setPolicyUnavailable] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [grantPartnerId, setGrantPartnerId] = useState('');
  const [grantPurpose, setGrantPurpose] = useState('consultation');
  const [grantScopes, setGrantScopes] = useState<string[]>(CONSENT_SCOPES.map((row) => row.value));

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(null);
    setPolicyUnavailable(false);
    setMessage(null);

    const [grantsResult, doctorsResult] = await Promise.all([
      fetchConsentGrants({ token, onUnauthorized }),
      fetchCareDoctorsForConsent({ token, onUnauthorized, countryCode }),
    ]);

    if (grantsResult.ok) {
      setGrants(grantsResult.data.consents ?? []);
    } else if (grantsResult.kind === 'forbidden') {
      setError('forbidden');
    } else if (grantsResult.kind !== 'unauthorized') {
      setError('network');
    }

    if (doctorsResult.ok) {
      setDoctors(doctorsResult.data.doctors ?? []);
      setGrantPartnerId((current) => current || doctorsResult.data.doctors?.[0]?.partner_id || '');
    } else if (
      doctorsResult.kind === 'forbidden' ||
      (!doctorsResult.ok && doctorsResult.status === 503)
    ) {
      setPolicyUnavailable(true);
      setDoctors([]);
    } else if (doctorsResult.kind !== 'unauthorized') {
      setPolicyUnavailable(true);
    }

    setLoading(false);
  }, [countryCode, getAccessToken, onUnauthorized, session.status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <AccountPage title="Consent" subtitle="Control clinical data access.">
        <EmptyState title="Sign in required" description="Sign in to manage consent grants." />
      </AccountPage>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return (
      <AccountPage title="Consent" subtitle="Control clinical data access.">
        <LoadingState label="Loading consent grants" />
      </AccountPage>
    );
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return (
      <AccountPage title="Consent" subtitle="Control clinical data access.">
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      </AccountPage>
    );
  }

  async function handleGrant() {
    const token = getAccessToken();
    if (!token || !grantPartnerId || !grantPurpose) {
      return;
    }
    setBusyId('grant');
    setMessage(null);
    const result = await grantConsent({
      token,
      onUnauthorized,
      recipient_partner_id: grantPartnerId,
      purpose: grantPurpose,
      scope: grantScopes,
    });
    setBusyId(null);
    if (result.ok) {
      setMessage('Consent granted.');
      void load();
    } else {
      setMessage(result.error);
    }
  }

  async function handleRevoke(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    const result = await revokeConsent({ token, onUnauthorized, consentId: id });
    setBusyId(null);
    if (result.ok) {
      setMessage('Consent revoked.');
      void load();
    } else {
      setMessage(result.error);
    }
  }

  const activeGrants = grants.filter((row) => row.status === 'ACTIVE');

  return (
    <AccountPage title="Consent" subtitle="Grant doctors access to your health records when needed.">
      <p className="mg-toolbar">
        <Link href="/account/privacy" className="mg-btn mg-btn--ghost mg-btn--sm">
          Privacy & security
        </Link>
      </p>

      {policyUnavailable ? (
        <MgCard flat>
          <p className="mg-list-meta">
            Doctor directory is unavailable for the selected country. Consent cannot be granted until clinical services
            are enabled in your region.
          </p>
        </MgCard>
      ) : null}

      <Section title="Grant consent">
        <MgCard className="mg-form-card">
          <p className="mg-list-meta">{`Market: ${countryName} (${countryCode})`}</p>
          <label className="mg-field">
            <span className="mg-field-label">Doctor</span>
            <select
              className="mg-input"
              value={grantPartnerId}
              disabled={!doctors.length || policyUnavailable}
              onChange={(e) => setGrantPartnerId(e.target.value)}
            >
              {!doctors.length ? <option value="">No doctors available</option> : null}
              {doctors.map((doc) => (
                <option key={doc.partner_id} value={doc.partner_id}>
                  {doc.display_name}
                  {doc.specialties?.length ? ` (${doc.specialties.join(', ')})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="mg-field">
            <span className="mg-field-label">Purpose</span>
            <select
              className="mg-input"
              value={grantPurpose}
              disabled={policyUnavailable}
              onChange={(e) => setGrantPurpose(e.target.value)}
            >
              {CONSENT_PURPOSES.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mg-field">
            <span className="mg-field-label">Health record scope</span>
            <div className="mg-toolbar">
              {CONSENT_SCOPES.map((row) => {
                const selected = grantScopes.includes(row.value);
                return (
                  <MgBtn
                    key={row.value}
                    variant={selected ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() =>
                      setGrantScopes((current) =>
                        selected ? current.filter((value) => value !== row.value) : [...current, row.value],
                      )
                    }
                  >
                    {row.label}
                  </MgBtn>
                );
              })}
            </div>
          </div>
          <MgBtn
            disabled={!!busyId || policyUnavailable || !grantPartnerId || grantScopes.length === 0}
            onClick={() => void handleGrant()}
          >
            {busyId === 'grant' ? 'Granting…' : 'Grant consent'}
          </MgBtn>
        </MgCard>
      </Section>

      <Section title="Your consent grants">
        {grants.length === 0 ? (
          <EmptyState
            title="No consent grants"
            description="Active grants for clinical access will appear here after you grant consent to a doctor."
          />
        ) : (
          <ul className="mg-order-list">
            {grants.map((row) => (
              <li key={row.id}>
                <MgCard>
                  <h3 className="mg-list-title">
                    {row.recipient_display_name ?? `Partner ${row.recipient_partner_id.slice(0, 8)}`}
                  </h3>
                  <p className="mg-list-meta">Purpose: {row.purpose}</p>
                  {Array.isArray(row.scope) && row.scope.length ? (
                    <p className="mg-list-meta">Scope: {(row.scope as string[]).join(', ')}</p>
                  ) : null}
                  <p className="mg-list-meta">
                    Status: {row.status} · Granted: {formatWhen(row.granted_at)}
                  </p>
                  {row.revoked_at ? <p className="mg-list-meta">Revoked: {formatWhen(row.revoked_at)}</p> : null}
                  {row.status === 'ACTIVE' ? (
                    <MgBtn variant="secondary" size="sm" disabled={!!busyId} onClick={() => void handleRevoke(row.id)}>
                      {busyId === row.id ? 'Revoking…' : 'Revoke'}
                    </MgBtn>
                  ) : null}
                </MgCard>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {activeGrants.length === 0 && grants.length > 0 ? (
        <p className="mg-list-meta">No active grants. Revoked or expired grants remain listed for your reference.</p>
      ) : null}

      {message ? <p className="mg-page-subtitle">{message}</p> : null}
    </AccountPage>
  );
}
