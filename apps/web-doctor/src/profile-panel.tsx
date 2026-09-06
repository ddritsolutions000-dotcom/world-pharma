'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  Text,
  TextArea,
} from '@world-pharma/ui-kit/web';
import { updateDoctorMe } from './doctor-api';
import { DoctorLoadFailure, mapDoctorApiFailure, type DoctorLoadError } from './doctor-load-state';

type DoctorProfileData = {
  partner_id?: string;
  person_id?: string;
  country_code?: string | null;
  partner_status?: string;
  profile?: {
    display_name?: string | null;
    professional_name?: string | null;
    specialties?: string[];
    languages?: string[];
    timezone?: string;
    online_capable?: boolean;
    bio?: string | null;
  };
};

export function DoctorProfilePanel() {
  const { getAccessToken, session, expire } = useSession();
  const [data, setData] = useState<DoctorProfileData | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [professionalName, setProfessionalName] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [languages, setLanguages] = useState('');
  const [onlineCapable, setOnlineCapable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<DoctorLoadError | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await apiCall<DoctorProfileData>('api/v1/doctor/me', {
      token,
      baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      onUnauthorized: () => expire(),
    });
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      setData(null);
    } else {
      setData(result.data);
      const profile = result.data.profile;
      setDisplayName(profile?.display_name ?? '');
      setProfessionalName(profile?.professional_name ?? '');
      setBio(profile?.bio ?? '');
      setTimezone(profile?.timezone ?? '');
      setSpecialties((profile?.specialties ?? []).join(', '));
      setLanguages((profile?.languages ?? []).join(', '));
      setOnlineCapable(profile?.online_capable ?? false);
    }
    setLoading(false);
  }, [getAccessToken, expire]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  async function save() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    const result = await updateDoctorMe({
      token,
      onUnauthorized: () => expire(),
      display_name: displayName.trim() || undefined,
      professional_name: professionalName.trim() || undefined,
      bio: bio.trim() || null,
      timezone: timezone.trim() || undefined,
      specialties: specialties
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      languages: languages
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      online_capable: onlineCapable,
    });
    setSaving(false);
    if (result.ok) {
      setSaveMessage('Profile saved.');
      void load();
    } else {
      setSaveMessage('Could not save profile.');
    }
  }

  if (loading) {
    return <LoadingState label="Loading profile" />;
  }
  if (error) {
    return (
      <DoctorLoadFailure
        error={error}
        onRetry={() => void load()}
        forbiddenTitle="Doctor profile unavailable"
        forbiddenDescription="Sign in with sandbox-doctor@dev.local (or your verified doctor partner email)."
      />
    );
  }

  if (!data) {
    return <Text>No profile data.</Text>;
  }

  return (
    <Card>
      {data.country_code ? <Text size="caption">Country: {data.country_code}</Text> : null}
      {data.partner_status ? <Text size="caption">Partner status: {data.partner_status}</Text> : null}
      <FormField label="Display name">
        {({ id }) => <Input id={id} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
      </FormField>
      <FormField label="Professional name">
        {({ id }) => (
          <Input id={id} value={professionalName} onChange={(e) => setProfessionalName(e.target.value)} />
        )}
      </FormField>
      <FormField label="Specialties (comma-separated)">
        {({ id }) => <Input id={id} value={specialties} onChange={(e) => setSpecialties(e.target.value)} />}
      </FormField>
      <FormField label="Languages (comma-separated)">
        {({ id }) => <Input id={id} value={languages} onChange={(e) => setLanguages(e.target.value)} />}
      </FormField>
      <FormField label="Timezone">
        {({ id }) => <Input id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)} />}
      </FormField>
      <FormField label="Bio">
        {({ id }) => <TextArea id={id} value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />}
      </FormField>
      <label>
        <input
          type="checkbox"
          checked={onlineCapable}
          onChange={(e) => setOnlineCapable(e.target.checked)}
        />{' '}
        Online consultations capable
      </label>
      <Button disabled={saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save profile'}
      </Button>
      {saveMessage ? <Text size="caption">{saveMessage}</Text> : null}
    </Card>
  );
}
