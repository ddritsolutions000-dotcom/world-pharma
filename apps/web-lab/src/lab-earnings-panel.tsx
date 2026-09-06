'use client';

import { PartnerWalletPanel } from '@world-pharma/shell-web';
import { Text } from '@world-pharma/ui-kit/web';

type Props = {
  organizationId: string;
  token: string;
  onError?: (err: unknown) => void;
};

export function LabEarningsPanel({ organizationId, token }: Props) {
  return (
    <div className="wp-stack">
      <Text size="caption" tone="secondary">
        Lab payables from published reports credit this wallet. Add bank/UPI, then withdraw anytime (sandbox mock).
      </Text>
      <PartnerWalletPanel
        token={token}
        partnerType="LAB"
        organizationId={organizationId}
        title="Lab earnings wallet"
      />
    </div>
  );
}
