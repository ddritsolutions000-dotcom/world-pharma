'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';

export type PartnerWalletView = {
  available_minor: string;
  held_minor: string;
  lifetime_earned_minor: string;
  lifetime_withdrawn_minor: string;
  currency: string;
  partner_type: string;
  message: string;
  live_payout?: boolean;
  sandbox?: boolean;
  payout_account_required: boolean;
  payout_account: {
    method: string;
    account_holder_name: string;
    bank_name: string | null;
    account_number_masked: string | null;
    ifsc_or_routing: string | null;
    upi_id_masked: string | null;
  } | null;
  ledger: Array<{
    id: string;
    kind: string;
    amount_minor: string;
    currency: string;
    balance_after_minor: string;
    created_at: string;
    note: string | null;
  }>;
  withdraw_requests: Array<{
    id: string;
    status: string;
    amount_minor: string;
    currency: string;
    destination_hint: string | null;
    created_at: string;
  }>;
};

function formatMinor(minor: string, currency: string): string {
  const value = Number(minor) / 100;
  if (Number.isNaN(value)) {
    return `${minor} ${currency}`;
  }
  return `${value.toFixed(2)} ${currency}`;
}

async function apiJson<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${typeof window !== 'undefined' ? window.location.origin : ''}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    credentials: 'include',
  });
  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(res.ok ? 'Invalid response' : 'Request failed');
    }
  }
  if (!res.ok) {
    const detail = (body as { detail?: string }).detail;
    throw new Error(detail ?? 'Request failed');
  }
  return body as T;
}

export function PartnerWalletPanel({
  token,
  partnerType,
  organizationId,
  title = 'Earnings wallet',
}: {
  token: string;
  partnerType: 'LAB' | 'AFFILIATE' | 'DELIVERY' | 'DOCTOR';
  organizationId?: string;
  title?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<PartnerWalletView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [method, setMethod] = useState<'BANK' | 'UPI'>('BANK');
  const [holder, setHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');

  const scopeQuery = new URLSearchParams({ partner_type: partnerType });
  if (organizationId) {
    scopeQuery.set('organization_id', organizationId);
  }

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson<PartnerWalletView>(
        `api/v1/partner/wallet?${scopeQuery.toString()}`,
        token,
      );
      setWallet(data);
      if (data.payout_account) {
        setMethod(data.payout_account.method === 'UPI' ? 'UPI' : 'BANK');
        setHolder(data.payout_account.account_holder_name);
        setBankName(data.payout_account.bank_name ?? '');
        setIfsc(data.payout_account.ifsc_or_routing ?? '');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load wallet');
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, partnerType, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAccount() {
    setBusy(true);
    setMessage(null);
    try {
      const body = await apiJson<{ message: string }>('api/v1/partner/wallet/payout-account', token, {
        method: 'POST',
        body: JSON.stringify({
          partner_type: partnerType,
          organization_id: organizationId,
          method,
          account_holder_name: holder,
          bank_name: method === 'BANK' ? bankName : undefined,
          account_number: method === 'BANK' ? accountNumber : undefined,
          ifsc_or_routing: method === 'BANK' ? ifsc : undefined,
          upi_id: method === 'UPI' ? upiId : undefined,
        }),
      });
      setAccountNumber('');
      setUpiId('');
      setMessage(body.message);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!wallet?.payout_account) {
      setMessage('Add a bank account or UPI ID first.');
      return;
    }
    const major = Number(withdrawAmount);
    if (!Number.isFinite(major) || major <= 0) {
      setMessage('Enter a positive amount.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const body = await apiJson<{ message: string }>('api/v1/partner/wallet/withdraw', token, {
        method: 'POST',
        body: JSON.stringify({
          partner_type: partnerType,
          organization_id: organizationId,
          amount_minor: String(Math.round(major * 100)),
        }),
      });
      setMessage(body.message);
      setWithdrawAmount('');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Withdraw failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading wallet" />;
  }
  if (error || !wallet) {
    return (
      <EmptyState
        title="Wallet unavailable"
        description={error ?? 'Partner wallet could not be loaded for this account.'}
        action={{ label: 'Retry', onClick: () => void load() }}
      />
    );
  }

  const canWithdraw = Boolean(wallet.payout_account) && Number(wallet.available_minor) > 0;

  return (
    <div className="wp-stack">
      <p className="wp-sandbox-banner" role="status">
        {wallet.live_payout
          ? 'Self-withdraw enabled: money leaves your wallet when you withdraw. Live payout confirms after gateway webhook.'
          : 'Self-withdraw like Paytm: withdraw anytime to bank/UPI. No Super Admin approval. Sandbox mock until live gateway.'}
      </p>
      <Heading level={2}>{title}</Heading>
      <Text size="caption" tone="secondary">
        {wallet.message}
      </Text>

      <Card className="wp-stack">
        <Heading level={3}>Balance</Heading>
        <Text>
          Available: <strong>{formatMinor(wallet.available_minor, wallet.currency)}</strong>
        </Text>
        <Text size="caption" tone="secondary">
          Held {formatMinor(wallet.held_minor, wallet.currency)} · Earned{' '}
          {formatMinor(wallet.lifetime_earned_minor, wallet.currency)} · Withdrawn{' '}
          {formatMinor(wallet.lifetime_withdrawn_minor, wallet.currency)}
        </Text>
      </Card>

      <Card className="wp-stack">
        <Heading level={3}>Payout account (required)</Heading>
        {wallet.payout_account ? (
          <Text>
            Saved: {wallet.payout_account.account_holder_name}
            {wallet.payout_account.method === 'UPI'
              ? ` · UPI ${wallet.payout_account.upi_id_masked}`
              : ` · ${wallet.payout_account.bank_name} ${wallet.payout_account.account_number_masked}`}
          </Text>
        ) : (
          <EmptyState title="No payout account" description="Add bank or UPI before withdrawing." />
        )}
        <div className="wp-toolbar wp-toolbar--wrap">
          <Button size="sm" variant={method === 'BANK' ? 'primary' : 'secondary'} onClick={() => setMethod('BANK')}>
            Bank
          </Button>
          <Button size="sm" variant={method === 'UPI' ? 'primary' : 'secondary'} onClick={() => setMethod('UPI')}>
            UPI
          </Button>
        </div>
        <FormField label="Account holder">
          {({ id }) => <Input id={id} value={holder} onChange={(e) => setHolder(e.target.value)} />}
        </FormField>
        {method === 'BANK' ? (
          <>
            <FormField label="Bank name">
              {({ id }) => <Input id={id} value={bankName} onChange={(e) => setBankName(e.target.value)} />}
            </FormField>
            <FormField label="Account number">
              {({ id }) => (
                <Input id={id} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              )}
            </FormField>
            <FormField label="IFSC / routing">
              {({ id }) => <Input id={id} value={ifsc} onChange={(e) => setIfsc(e.target.value)} />}
            </FormField>
          </>
        ) : (
          <FormField label="UPI ID">
            {({ id }) => <Input id={id} value={upiId} onChange={(e) => setUpiId(e.target.value)} />}
          </FormField>
        )}
        <Button disabled={busy} onClick={() => void saveAccount()}>
          {busy ? 'Saving…' : 'Save payout account'}
        </Button>
      </Card>

      <Card className="wp-stack">
        <Heading level={3}>Withdraw</Heading>
        <FormField label={`Amount (${wallet.currency})`}>
          {({ id }) => (
            <Input
              id={id}
              inputMode="decimal"
              value={withdrawAmount}
              disabled={!wallet.payout_account}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
          )}
        </FormField>
        <Button disabled={busy || !canWithdraw} onClick={() => void withdraw()}>
          {busy ? 'Withdrawing…' : 'Withdraw now'}
        </Button>
        {message ? <Text size="caption">{message}</Text> : null}
      </Card>

      <Card className="wp-stack">
        <Heading level={3}>Ledger</Heading>
        {wallet.ledger.length === 0 ? (
          <EmptyState title="No credits yet" description="Completed work credits this wallet automatically." />
        ) : (
          wallet.ledger.slice(0, 12).map((row) => (
            <Text key={row.id} size="caption">
              {row.kind} · {formatMinor(row.amount_minor, row.currency)} ·{' '}
              {new Date(row.created_at).toLocaleString()}
            </Text>
          ))
        )}
      </Card>
    </div>
  );
}
