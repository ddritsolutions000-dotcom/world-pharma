'use client';

import { Text } from '@world-pharma/ui-kit/web';
import { formatMoney } from './format-money';
import { upiCollectVpa, type UpiCollectNextAction } from './checkout-payment-ui';
import { MgBtn, MgCard } from './ui/mg-ui';

const UPI_APPS = [
  { id: 'phonepe', label: 'PhonePe' },
  { id: 'gpay', label: 'Google Pay' },
  { id: 'paytm', label: 'Paytm' },
] as const;

export function UpiCollectPanel({
  amountMinor,
  currency,
  nextAction,
  busy,
  onComplete,
  onCancel,
}: {
  amountMinor: string | number | null | undefined;
  currency: string;
  nextAction?: UpiCollectNextAction | null;
  busy?: boolean;
  onComplete: (app: string) => void;
  onCancel?: () => void;
}) {
  const vpa = upiCollectVpa(nextAction ?? undefined);
  const amountLabel = formatMoney(amountMinor, currency);

  return (
    <MgCard className="mg-upi-collect">
      <h3 className="mg-section-title">Complete UPI payment</h3>
      <Text tone="secondary">
        Sandbox demo — approve {amountLabel} in your UPI app or simulate approval below.
      </Text>
      <div className="mg-upi-qr" aria-hidden="true">
        <span className="mg-upi-qr-label">UPI ID</span>
        <strong>{vpa}</strong>
        <span className="mg-upi-qr-amount">{amountLabel}</span>
      </div>
      <div className="mg-upi-apps">
        {UPI_APPS.map((app) => (
          <MgBtn key={app.id} variant="secondary" disabled={busy} onClick={() => onComplete(app.id)}>
            Open {app.label}
          </MgBtn>
        ))}
      </div>
      <MgBtn block disabled={busy} onClick={() => onComplete('simulate')}>
        {busy ? 'Confirming…' : 'I have completed payment'}
      </MgBtn>
      {onCancel ? (
        <MgBtn variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Choose another method
        </MgBtn>
      ) : null}
    </MgCard>
  );
}
