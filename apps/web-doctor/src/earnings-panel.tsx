'use client';

import { PartnerWalletPanel, useSession } from '@world-pharma/shell-web';
import { Text } from '@world-pharma/ui-kit/web';

export function DoctorEarningsPanel() {
  const { getAccessToken } = useSession();
  const token = getAccessToken() ?? '';

  return (
    <div className="wp-stack">
      <Text size="caption" tone="secondary">
        Completed consultations credit this wallet. Add bank/UPI first, then withdraw anytime (sandbox mock payout).
      </Text>
      <PartnerWalletPanel token={token} partnerType="DOCTOR" title="Doctor earnings wallet" />
    </div>
  );
}
