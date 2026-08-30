'use client';

import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { bookAppointment, fetchCareDoctors, fetchDoctorSlots } from './care-api';
import { CustomerShell } from './customer-shell';

export function DoctorsScreen() {
  const { session, getAccessToken } = useSession();
  const [doctors, setDoctors] = useState<Array<Record<string, unknown>>>([]);
  const [slots, setSlots] = useState<Array<{ starts_at: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const country = 'DQ';

  useEffect(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    void fetchCareDoctors(token, country)
      .then((body: { doctors?: Array<Record<string, unknown>> }) => setDoctors(body.doctors ?? []))
      .catch(() => setError('Doctor directory is unavailable or disabled for this country.'));
  }, [session.status]);

  async function loadSlots(profileId: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 7 * 86400_000).toISOString();
    const body = (await fetchDoctorSlots(token, profileId, country, from, to)) as {
      slots?: Array<{ starts_at: string }>;
    };
    setSelected(profileId);
    setSlots(body.slots ?? []);
  }

  async function book(startsAt: string) {
    const token = getAccessToken();
    if (!token || !selected) {
      return;
    }
    await bookAppointment(token, {
      doctor_profile_id: selected,
      country_code: country,
      starts_at: startsAt,
      type: 'IN_PERSON',
    });
    window.location.href = '/appointments';
  }

  return (
    <CustomerShell apiReachable={true} countryLabel={country}>
      <Heading level={2}>Doctors</Heading>
      <Text tone="secondary">
        Booking foundation only. Directory is not a marketplace and hides credentials.
      </Text>
      {error ? <Text>{error}</Text> : null}
      {doctors.length === 0 ? (
        <EmptyState title="No doctors listed" description="Country policy may keep discovery closed." />
      ) : (
        doctors.map((doc) => (
          <Card key={String(doc.profile_id)}>
            <Text>{String(doc.display_name)}</Text>
            <Button size="sm" onClick={() => void loadSlots(String(doc.profile_id))}>
              Availability
            </Button>
          </Card>
        ))
      )}
      {slots.map((slot) => (
        <Button key={slot.starts_at} variant="secondary" onClick={() => void book(slot.starts_at)}>
          Book {slot.starts_at}
        </Button>
      ))}
    </CustomerShell>
  );
}
