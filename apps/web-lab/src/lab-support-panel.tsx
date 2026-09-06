'use client';

import { PartnerSupportPanel } from '@world-pharma/shell-web';

export function LabSupportPanel({ token }: { token: string }) {
  return <PartnerSupportPanel token={token} audienceLabel="lab operators" />;
}
