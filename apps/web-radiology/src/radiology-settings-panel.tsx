'use client';

import { Card, Heading, Text } from '@world-pharma/ui-kit/web';
import type { ImagingOrganization } from './radiology-api';

export function RadiologySettingsPanel({
  organization,
  actorPersonId,
}: {
  organization: ImagingOrganization | null;
  actorPersonId: string | null;
}) {
  if (!organization) {
    return (
      <Card>
        <Heading level={2}>Organization settings</Heading>
        <Text tone="secondary">Select an imaging center to view settings.</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Heading level={2}>Organization settings</Heading>
      <Text tone="secondary">Imaging center profile and membership context (read-only sandbox).</Text>
      <dl className="wp-stack" style={{ marginTop: '1rem' }}>
        <div>
          <Text size="caption">Display name</Text>
          <Text>{organization.display_name}</Text>
        </div>
        <div>
          <Text size="caption">Country</Text>
          <Text>{organization.country_code}</Text>
        </div>
        <div>
          <Text size="caption">Organization ID</Text>
          <Text>{organization.id}</Text>
        </div>
        {organization.location_id ? (
          <div>
            <Text size="caption">Primary location</Text>
            <Text>{organization.location_id}</Text>
          </div>
        ) : null}
        {actorPersonId ? (
          <div>
            <Text size="caption">Signed-in operator</Text>
            <Text>{actorPersonId}</Text>
          </div>
        ) : null}
      </dl>
      <Text tone="secondary" size="caption">
        Timezone, contact, and notification preferences are configured through company operations after partner activation.
      </Text>
    </Card>
  );
}
