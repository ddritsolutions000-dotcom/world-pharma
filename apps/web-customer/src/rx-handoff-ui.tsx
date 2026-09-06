'use client';

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
    <div className="mg-rx-notice" role="status">
      Prescription order — your medicines are reserved. Complete checkout to confirm delivery.
    </div>
  );
}
