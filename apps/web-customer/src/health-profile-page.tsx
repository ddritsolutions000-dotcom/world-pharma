'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  FormField,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  addHealthAllergy,
  addHealthCondition,
  addHealthVital,
  fetchHealthProfile,
  fetchHealthProfileSubjects,
  type HealthProfileResponse,
  type HealthSubjectOption,
  upsertHealthEmergencyContact,
  updateHealthProfile,
} from './health-profile-api';
import { useSelectedCountry } from './use-selected-country';
import { AccountHubNav } from './ui/account-hub-nav';
import { MgBtn, MgCard, Page, PageIntro, Section, ServiceHero } from './ui/mg-ui';

export function HealthProfileScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country: countryCode, countryName } = useSelectedCountry();
  const [subjects, setSubjects] = useState<HealthSubjectOption[]>([]);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string | null>(null);
  const [profile, setProfile] = useState<HealthProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | 'unauthorized' | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [allergen, setAllergen] = useState('');
  const [condition, setCondition] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const tokenOpts = useCallback(
    () => ({
      token: getAccessToken() ?? '',
      onUnauthorized: () => expire(),
      countryCode,
      familyMemberId: selectedFamilyMemberId,
    }),
    [countryCode, expire, getAccessToken, selectedFamilyMemberId],
  );

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    setError(null);
    const [subjectsResult, profileResult] = await Promise.all([
      fetchHealthProfileSubjects(tokenOpts()),
      fetchHealthProfile(tokenOpts()),
    ]);
    if (subjectsResult.ok) {
      setSubjects(subjectsResult.data.subjects ?? []);
    }
    if (profileResult.ok) {
      setProfile(profileResult.data);
      setFormError(null);
    } else if (profileResult.status === 401) {
      setError('unauthorized');
    } else if (profileResult.status === 403) {
      setError('forbidden');
    } else {
      setError('network');
    }
    setLoading(false);
  }, [getAccessToken, session.status, tokenOpts]);

  useEffect(() => {
    void load();
  }, [load, selectedFamilyMemberId]);

  const runMutation = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setFormError(null);
    const result = await fn();
    if (!result.ok) {
      setFormError(result.error || 'Save failed.');
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  };

  if (session.status === 'expired' || error === 'unauthorized') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }
  if (session.status !== 'authenticated') {
    return (
      <Page>
        <ServiceHero
          kicker="Patient-attested"
          title="Health profile"
          subtitle="Manage allergies, conditions, vitals, and emergency contact."
          compact
        />
        <Text>Sign in to manage your health profile.</Text>
      </Page>
    );
  }

  return (
    <Page>
      <AccountHubNav />
      <ServiceHero
        kicker="Patient-attested"
        title="Health profile"
        subtitle="Patient-attested health information stored securely on your account."
        compact
      />
      <PageIntro>
        <p>
          {`Market: ${countryName} (${countryCode}).`} This information is user-managed and informational only — not a clinical diagnosis or provider record.
        </p>
      </PageIntro>

      {subjects.length > 0 ? (
        <Section title="Profile for">
          <div className="mg-toolbar">
            {subjects.map((subject) => (
              <MgBtn
                key={subject.family_member_id ?? 'self'}
                variant={(subject.family_member_id ?? null) === selectedFamilyMemberId ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSelectedFamilyMemberId(subject.family_member_id)}
              >
                {subject.display_name}
              </MgBtn>
            ))}
          </div>
        </Section>
      ) : null}

      {loading ? <LoadingState label="Loading health profile" /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}

      {!loading && !error && profile ? (
        <>
          <Section title="Basic information">
            <MgCard>
              <p className="mg-list-meta">{`Last updated ${profile.profile.updated_at}`}</p>
              <MgBtn
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void runMutation(async () =>
                    updateHealthProfile({
                      ...tokenOpts(),
                      notes: profile.profile.notes ?? 'Updated from health profile',
                    }),
                  )
                }
              >
                Save profile note
              </MgBtn>
            </MgCard>
          </Section>

          <Section title="Allergies">
            {profile.profile.allergies.length === 0 ? (
              <EmptyState title="No allergies recorded" description="Add allergies you want care teams to know about." />
            ) : (
              <div className="mg-order-list">
                {profile.profile.allergies.map((row) => (
                  <MgCard key={row.id}>
                    <h3 className="mg-list-title">{row.allergen}</h3>
                    <p className="mg-list-meta">
                      {[row.severity, row.reaction, row.active ? 'Active' : 'Inactive'].filter(Boolean).join(' · ')}
                    </p>
                  </MgCard>
                ))}
              </div>
            )}
            <FormField label="Add allergy">
              {({ id }) => (
                <Input id={id} value={allergen} onChange={(e) => setAllergen(e.target.value)} />
              )}
            </FormField>
            <MgBtn
              variant="primary"
              size="sm"
              disabled={busy || !allergen.trim()}
              onClick={() =>
                void runMutation(async () => {
                  const result = await addHealthAllergy({ ...tokenOpts(), allergen: allergen.trim(), severity: 'MODERATE' });
                  if (result.ok) {
                    setAllergen('');
                  }
                  return result;
                })
              }
            >
              Add allergy
            </MgBtn>
          </Section>

          <Section title="Chronic conditions">
            {profile.profile.conditions.length === 0 ? (
              <EmptyState title="No conditions recorded" description="Track ongoing health conditions here." />
            ) : (
              <div className="mg-order-list">
                {profile.profile.conditions.map((row) => (
                  <MgCard key={row.id}>
                    <h3 className="mg-list-title">{row.condition}</h3>
                    <p className="mg-list-meta">{row.status}</p>
                  </MgCard>
                ))}
              </div>
            )}
            <FormField label="Add condition">
              {({ id }) => (
                <Input id={id} value={condition} onChange={(e) => setCondition(e.target.value)} />
              )}
            </FormField>
            <MgBtn
              variant="primary"
              size="sm"
              disabled={busy || !condition.trim()}
              onClick={() =>
                void runMutation(async () => {
                  const result = await addHealthCondition({ ...tokenOpts(), condition: condition.trim() });
                  if (result.ok) {
                    setCondition('');
                  }
                  return result;
                })
              }
            >
              Add condition
            </MgBtn>
          </Section>

          <Section title="Vitals">
            {profile.profile.vitals.length === 0 ? (
              <EmptyState title="No vitals recorded" description="Record height, weight, blood pressure, or pulse." />
            ) : (
              <div className="mg-order-list">
                {profile.profile.vitals.slice(0, 5).map((row) => (
                  <MgCard key={row.id}>
                    <p className="mg-list-meta">
                      {[
                        row.weight_kg != null ? `${row.weight_kg} kg` : null,
                        row.blood_pressure_systolic != null
                          ? `BP ${row.blood_pressure_systolic}/${row.blood_pressure_diastolic ?? '—'}`
                          : null,
                        row.pulse_bpm != null ? `${row.pulse_bpm} bpm` : null,
                        row.recorded_at,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </MgCard>
                ))}
              </div>
            )}
            <FormField label="Weight (kg)">
              {({ id }) => (
                <Input id={id} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
              )}
            </FormField>
            <MgBtn
              variant="primary"
              size="sm"
              disabled={busy || !weightKg.trim()}
              onClick={() =>
                void runMutation(async () =>
                  addHealthVital({ ...tokenOpts(), weight_kg: Number(weightKg) }),
                )
              }
            >
              Record vital
            </MgBtn>
          </Section>

          <Section title="Emergency contact">
            {profile.profile.emergency_contact ? (
              <MgCard>
                <h3 className="mg-list-title">{profile.profile.emergency_contact.name}</h3>
                <p className="mg-list-meta">
                  {`${profile.profile.emergency_contact.relationship} · ${profile.profile.emergency_contact.phone}`}
                </p>
              </MgCard>
            ) : (
              <EmptyState title="No emergency contact" description="Add someone we can reach in an emergency." />
            )}
            <FormField label="Name">
              {({ id }) => (
                <Input id={id} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
              )}
            </FormField>
            <FormField label="Relationship">
              {({ id }) => (
                <Input
                  id={id}
                  value={emergencyRelationship}
                  onChange={(e) => setEmergencyRelationship(e.target.value)}
                />
              )}
            </FormField>
            <FormField label="Phone">
              {({ id }) => (
                <Input id={id} value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
              )}
            </FormField>
            <MgBtn
              variant="primary"
              size="sm"
              disabled={busy || !emergencyName.trim() || !emergencyRelationship.trim() || !emergencyPhone.trim()}
              onClick={() =>
                void runMutation(async () =>
                  upsertHealthEmergencyContact({
                    ...tokenOpts(),
                    name: emergencyName.trim(),
                    relationship: emergencyRelationship.trim(),
                    phone: emergencyPhone.trim(),
                  }),
                )
              }
            >
              Save emergency contact
            </MgBtn>
          </Section>

          {formError ? <Text size="caption">{formError}</Text> : null}
        </>
      ) : null}
    </Page>
  );
}
