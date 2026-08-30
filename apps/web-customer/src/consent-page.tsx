'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
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

const DEFAULT_COUNTRY = 'DQ';

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

function statusTone(status: string): 'secondary' | undefined {
  if (status === 'ACTIVE') {
    return undefined;
  }
  return 'secondary';
}

export function ConsentScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
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
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY);

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
    return <EmptyState title="Sign in required" description="Sign in to manage consent grants." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading consent grants" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
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
    <section>
      <Heading level={1}>Consent management</Heading>
      <Text tone="secondary">
        View and manage consent grants for clinical access. Purposes and eligibility are governed by your country
        policy pack — not by this screen.
      </Text>
      <Link href="/account/privacy">
        <Button variant="tertiary" size="sm">
          Privacy &amp; security
        </Button>
      </Link>
      <Link href="/account">
        <Button variant="tertiary" size="sm">
          Back to account
        </Button>
      </Link>

      {policyUnavailable ? (
        <Card>
          <Text tone="secondary">
            Doctor directory or clinical services are unavailable for the selected country. Consent cannot be granted
            until country policy permits clinical access.
          </Text>
        </Card>
      ) : null}

      <Heading level={2}>Grant consent</Heading>
      <FormField label="Country code">
        {({ id }) => (
          <input
            id={id}
            className="wp-input"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            onBlur={() => void load()}
          />
        )}
      </FormField>
      <FormField label="Doctor">
        {({ id }) => (
          <select
            id={id}
            className="wp-input"
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
        )}
      </FormField>
      <FormField label="Purpose">
        {({ id }) => (
          <select
            id={id}
            className="wp-input"
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
        )}
      </FormField>
      <FormField label="Health record scope">
        {() => (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CONSENT_SCOPES.map((row) => {
              const selected = grantScopes.includes(row.value);
              return (
                <Button
                  key={row.value}
                  type="button"
                  variant={selected ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={policyUnavailable}
                  onClick={() =>
                    setGrantScopes((current) =>
                      selected ? current.filter((value) => value !== row.value) : [...current, row.value],
                    )
                  }
                >
                  {row.label}
                </Button>
              );
            })}
          </div>
        )}
      </FormField>
      <Button disabled={!!busyId || policyUnavailable || !grantPartnerId || grantScopes.length === 0} onClick={() => void handleGrant()}>
        {busyId === 'grant' ? 'Granting…' : 'Grant consent'}
      </Button>

      <Heading level={2}>Your consent grants</Heading>
      {grants.length === 0 ? (
        <EmptyState
          title="No consent grants"
          description="Active grants for clinical access will appear here after you grant consent to a doctor."
        />
      ) : (
        grants.map((row) => (
          <Card key={row.id}>
            <Text>{row.recipient_display_name ?? `Partner ${row.recipient_partner_id.slice(0, 8)}`}</Text>
            <Text size="caption">Purpose: {row.purpose}</Text>
            {Array.isArray(row.scope) && row.scope.length ? (
              <Text size="caption">Scope: {(row.scope as string[]).join(', ')}</Text>
            ) : null}
            <Text size="caption" tone={statusTone(row.status)}>
              Status: {row.status}
            </Text>
            <Text size="caption">Granted: {formatWhen(row.granted_at)}</Text>
            <Text size="caption">Expires: {formatWhen(row.expires_at)}</Text>
            {row.revoked_at ? <Text size="caption">Revoked: {formatWhen(row.revoked_at)}</Text> : null}
            {row.status === 'ACTIVE' ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={!!busyId}
                onClick={() => void handleRevoke(row.id)}
              >
                {busyId === row.id ? 'Revoking…' : 'Revoke'}
              </Button>
            ) : null}
          </Card>
        ))
      )}

      {activeGrants.length === 0 && grants.length > 0 ? (
        <Text tone="secondary">No active grants. Revoked or expired grants remain listed for your reference.</Text>
      ) : null}

      {message ? <Text>{message}</Text> : null}
    </section>
  );
}
