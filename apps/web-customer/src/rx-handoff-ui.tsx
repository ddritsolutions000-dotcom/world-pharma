'use client';

import { Card, Text } from '@world-pharma/ui-kit/web';

export function RxHandoffBanner({
  skipInventoryHold,
  dispensingCaseId,
}: {
  skipInventoryHold?: boolean;
  dispensingCaseId?: string | null;
}) {
  if (!skipInventoryHold && !dispensingCaseId) {
    return null;
  }
  return (
    <Card>
      <Text size="caption" tone="secondary">
        Prescription order — medicines were reserved when the pharmacy dispensed your prescription. Checkout completes
        your commercial order (inventory hold skipped).
      </Text>
      {dispensingCaseId ? (
        <Text size="caption">{`Dispensing case: ${dispensingCaseId.slice(0, 8)}…`}</Text>
      ) : null}
    </Card>
  );
}
