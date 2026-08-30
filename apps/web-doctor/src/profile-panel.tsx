'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiCall } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import {
  Card,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'network' | 'forbidden' | 'error' | null>(null);

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
      onUnauthorized: () => expire(),
    });
    if (!result.ok) {
      if (result.kind === 'forbidden') {
        setError('forbidden');
      } else if (result.kind === 'network') {
        setError('network');
      } else {
        setError('error');
      }
      setData(null);
    } else {
      setData(result.data);
    }
    setLoading(false);
  }, [getAccessToken, expire]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  if (loading) {
    return <LoadingState label="Loading profile" />;
  }
  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (error === 'network') {
    return (
      <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
    );
  }
  if (error === 'error') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  if (!data) {
    return <Text>No profile data.</Text>;
  }

  const profile = data.profile;
  const displayName = profile?.display_name || profile?.professional_name || 'Doctor';

  return (
    <Card>
      <Text>{displayName}</Text>
      {data.country_code ? <Text size="caption">Country: {data.country_code}</Text> : null}
      {data.partner_status ? <Text size="caption">Partner status: {data.partner_status}</Text> : null}
      {profile?.specialties?.length ? (
        <Text size="caption">Specialties: {profile.specialties.join(', ')}</Text>
      ) : null}
      {profile?.languages?.length ? (
        <Text size="caption">Languages: {profile.languages.join(', ')}</Text>
      ) : null}
      {profile?.timezone ? <Text size="caption">Timezone: {profile.timezone}</Text> : null}
      {profile?.online_capable !== undefined ? (
        <Text size="caption">Online capable: {profile.online_capable ? 'Yes' : 'No'}</Text>
      ) : null}
      {profile?.bio ? <Text size="caption">{profile.bio}</Text> : null}
    </Card>
  );
}
