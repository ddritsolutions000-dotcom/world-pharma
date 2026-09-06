'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';

import {
  createFamilyMember,
  deleteFamilyMember,
  fetchFamilyMembers,
} from './family-api';
import { FAMILY_RELATIONSHIPS, memberSummary, type FamilyMember } from './family-member-ui';
import { useSelectedCountry } from './use-selected-country';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard } from './ui/mg-ui';

export function FamilyMembersScreen() {
  const { session, getAccessToken, expire } = useSession();
  const { country: countryCode } = useSelectedCountry();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [relationshipCode, setRelationshipCode] = useState('PARENT');
  const [ageYears, setAgeYears] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await fetchFamilyMembers(token, countryCode);
      setMembers(body.members ?? []);
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        setError('forbidden');
      } else if (status === 401) {
        expire();
      } else {
        setError('network');
      }
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [countryCode, expire, getAccessToken, session.status]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  const submitMember = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !displayName.trim()) {
      setFormError('Enter a name.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const created = await createFamilyMember(token, countryCode, {
        display_name: displayName.trim(),
        relationship_code: relationshipCode,
        age_years: ageYears.trim() ? Number(ageYears) : null,
        phone: phone.trim() || null,
      });
      setMembers((prev) => [...prev, created]);
      setDisplayName('');
      setAgeYears('');
      setPhone('');
      setShowForm(false);
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 401) {
        expire();
        return;
      }
      setFormError((err as { message?: string }).message ?? 'Could not save member.');
    } finally {
      setBusy(false);
    }
  }, [ageYears, countryCode, displayName, expire, getAccessToken, phone, relationshipCode]);

  const removeMember = useCallback(
    async (id: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setBusy(true);
      try {
        await deleteFamilyMember(token, id);
        setMembers((prev) => prev.filter((row) => row.id !== id));
      } catch (err: unknown) {
        if ((err as { status?: number }).status === 401) {
          expire();
        }
      } finally {
        setBusy(false);
      }
    },
    [expire, getAccessToken],
  );

  if (session.status !== 'authenticated') {
    return (
      <AccountPage title="Family members" subtitle="Order medicines for loved ones.">
        <EmptyState
          title="Sign in required"
          description="Sign in to manage family members."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </AccountPage>
    );
  }

  if (session.audience !== 'customer') {
    return (
      <AccountPage title="Family members">
        <PermissionDeniedState />
      </AccountPage>
    );
  }

  return (
    <AccountPage
      title="Family members"
      subtitle="Order for saved family members — names only, not separate medical accounts."
    >
      <MgCard flat>
        <Text tone="secondary">
          Add parents, spouse, or children to speed up checkout. Use a delivery address with the same recipient name.
          This does not create a separate health record.
        </Text>
      </MgCard>

      {loading ? <LoadingState label="Loading family members" /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}

      {!loading && !error ? (
        <>
          <div className="mg-toolbar">
            <MgBtn size="sm" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancel' : 'Add member'}
            </MgBtn>
            <MgBtn href="/account/addresses" variant="ghost" size="sm">
              Manage addresses
            </MgBtn>
          </div>

          {showForm ? (
            <MgCard className="mg-family-form">
              <label className="mg-field">
                <span>Name</span>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Mom" maxLength={120} />
              </label>
              <label className="mg-field">
                <span>Relationship</span>
                <select value={relationshipCode} onChange={(e) => setRelationshipCode(e.target.value)}>
                  {FAMILY_RELATIONSHIPS.map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mg-field">
                <span>Age (optional)</span>
                <input value={ageYears} onChange={(e) => setAgeYears(e.target.value)} inputMode="numeric" placeholder="62" />
              </label>
              <label className="mg-field">
                <span>Phone (optional)</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+country-code…" />
              </label>
              {formError ? <Text tone="secondary">{formError}</Text> : null}
              {!busy ? <MgBtn onClick={() => void submitMember()}>Save member</MgBtn> : <LoadingState label="Saving" />}
            </MgCard>
          ) : null}

          {members.length === 0 ? (
            <EmptyState
              title="No family members yet"
              description="Add someone you often order medicines for."
            />
          ) : (
            <ul className="mg-order-list">
              {members.map((row) => (
                <li key={row.id}>
                  <MgCard className="mg-order-card">
                    <div className="mg-order-card-top">
                      <div>
                        <p className="mg-list-title">{row.display_name}</p>
                        <p className="mg-list-meta">{memberSummary(row)}</p>
                        {row.phone ? <p className="mg-order-track-hint">{row.phone}</p> : null}
                      </div>
                    </div>
                    <div className="mg-list-actions">
                      <MgBtn href="/" variant="secondary" size="sm">
                        Order medicines
                      </MgBtn>
                      <MgBtn variant="ghost" size="sm" disabled={busy} onClick={() => void removeMember(row.id)}>
                        Remove
                      </MgBtn>
                    </div>
                  </MgCard>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </AccountPage>
  );
}
