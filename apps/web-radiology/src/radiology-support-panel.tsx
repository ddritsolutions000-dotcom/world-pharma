'use client';

import { PartnerSupportPanel } from '@world-pharma/shell-web';

export function RadiologySupportPanel({ token }: { token: string }) {
  return <PartnerSupportPanel token={token} audienceLabel="imaging operators" />;
}
