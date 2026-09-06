import { useCallback, useEffect, useState } from 'react';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  DeliveryApiError,
  fetchPartnerWallet,
  savePartnerPayoutAccount,
  withdrawPartnerWallet,
  type PartnerWalletView,
} from './delivery-api';

function formatMinor(minor: string, currency: string): string {
  const value = Number(minor) / 100;
  if (Number.isNaN(value)) {
    return `${minor} ${currency}`;
  }
  return `${value.toFixed(2)} ${currency}`;
}

export function DeliveryEarningsPanel({
  token,
  onError,
}: {
  token: string;
  onError: (err: unknown) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wallet, setWallet] = useState<PartnerWalletView | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [holder, setHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [method, setMethod] = useState<'BANK' | 'UPI'>('BANK');

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchPartnerWallet(token);
      setWallet(body);
      setMessage(null);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <NativeLoadingState mode="dark" />;
  }
  if (!wallet) {
    return (
      <NativeEmptyState
        title="Wallet unavailable"
        description="Sign in as a delivery partner to see earnings."
      />
    );
  }

  const canWithdraw = Boolean(wallet.payout_account) && Number(wallet.available_minor) > 0;

  return (
    <>
      <NativeCard>
        <NativeText variant="h2">Rider wallet</NativeText>
        <NativeText>
          Available: {formatMinor(wallet.available_minor, wallet.currency)}
        </NativeText>
        <NativeText variant="caption">
          Held {formatMinor(wallet.held_minor, wallet.currency)} · Earned{' '}
          {formatMinor(wallet.lifetime_earned_minor, wallet.currency)} · Withdrawn{' '}
          {formatMinor(wallet.lifetime_withdrawn_minor, wallet.currency)}
        </NativeText>
        <NativeText variant="caption">{wallet.message}</NativeText>
        <NativeButton label="Refresh" onPress={() => void load()} />
      </NativeCard>

      <NativeCard>
        <NativeText variant="h2">Bank / UPI (required)</NativeText>
        {wallet.payout_account ? (
          <NativeText>
            Saved: {wallet.payout_account.account_holder_name}
            {wallet.payout_account.method === 'UPI'
              ? ` · UPI ${wallet.payout_account.upi_id_masked}`
              : ` · ${wallet.payout_account.bank_name} ${wallet.payout_account.account_number_masked}`}
          </NativeText>
        ) : (
          <NativeText variant="caption">Add payout details before withdrawing.</NativeText>
        )}
        <NativeButton
          label={method === 'BANK' ? 'Switch to UPI' : 'Switch to bank'}
          onPress={() => setMethod((m) => (m === 'BANK' ? 'UPI' : 'BANK'))}
        />
        <NativeInput label="Account holder" value={holder} onChangeText={setHolder} />
        {method === 'BANK' ? (
          <>
            <NativeInput label="Bank name" value={bankName} onChangeText={setBankName} />
            <NativeInput label="Account number" value={accountNumber} onChangeText={setAccountNumber} />
            <NativeInput label="IFSC" value={ifsc} onChangeText={setIfsc} />
          </>
        ) : (
          <NativeInput label="UPI ID" value={upiId} onChangeText={setUpiId} />
        )}
        <NativeButton
          label={busy ? 'Saving…' : 'Save payout account'}
          onPress={() => {
            void (async () => {
              setBusy(true);
              setMessage(null);
              try {
                await savePartnerPayoutAccount(token, {
                  method,
                  account_holder_name: holder,
                  bank_name: bankName || undefined,
                  account_number: accountNumber || undefined,
                  ifsc_or_routing: ifsc || undefined,
                  upi_id: upiId || undefined,
                });
                setMessage('Payout account saved.');
                await load();
              } catch (err) {
                if (err instanceof DeliveryApiError) {
                  setMessage(err.message);
                } else {
                  onError(err);
                }
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      </NativeCard>

      <NativeCard>
        <NativeText variant="h2">Withdraw</NativeText>
        <NativeInput
          label={`Amount (${wallet.currency})`}
          value={withdrawAmount}
          onChangeText={setWithdrawAmount}
          keyboardType="decimal-pad"
        />
        <NativeButton
          label={busy ? 'Working…' : 'Withdraw now'}
          onPress={() => {
            void (async () => {
              const major = Number(withdrawAmount);
              if (!Number.isFinite(major) || major <= 0) {
                setMessage('Enter a positive amount.');
                return;
              }
              setBusy(true);
              setMessage(null);
              try {
                const res = await withdrawPartnerWallet(token, String(Math.round(major * 100)));
                setMessage(
                  res.status === 'PAID'
                    ? `Paid ${formatMinor(res.amount_minor, res.currency)} (sandbox mock).`
                    : `Request ${res.status}`,
                );
                setWithdrawAmount('');
                await load();
              } catch (err) {
                if (err instanceof DeliveryApiError) {
                  setMessage(err.message);
                } else {
                  onError(err);
                }
              } finally {
                setBusy(false);
              }
            })();
          }}
          disabled={!canWithdraw || busy}
        />
        {message ? <NativeText variant="caption">{message}</NativeText> : null}
      </NativeCard>

      {wallet.ledger.length === 0 ? (
        <NativeEmptyState
          title="No credits yet"
          description="Delivered jobs credit this wallet automatically."
        />
      ) : (
        wallet.ledger.slice(0, 8).map((row) => (
          <NativeCard key={row.id}>
            <NativeText>
              {row.kind}: {formatMinor(row.amount_minor, row.currency)}
            </NativeText>
            <NativeText variant="caption">{row.note ?? row.created_at}</NativeText>
          </NativeCard>
        ))
      )}
    </>
  );
}
