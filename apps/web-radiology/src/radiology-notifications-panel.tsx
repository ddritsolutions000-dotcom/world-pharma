'use client';

import { PartnerInboxPanel } from '@world-pharma/shell-web';

export function RadiologyNotificationsPanel({ token }: { token: string }) {
  return <PartnerInboxPanel token={token} audienceLabel="imaging operators" />;
}
