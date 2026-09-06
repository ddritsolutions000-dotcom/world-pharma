'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { EmptyState, LoadingState, NetworkErrorState, PermissionDeniedState, SessionExpiredState } from '@world-pharma/ui-kit/web';
import { fetchLoyaltyBalance, fetchLoyaltyLedger, type LoyaltyLedgerRow } from './loyalty-api';
import { useSelectedCountry } from './use-selected-country';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard, PageIntro } from './ui/mg-ui';

export function LoyaltyScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country: countryCode } = useSelectedCountry();
  const [balance, setBalance] = useState<number | null>(null);
  const [programCode, setProgramCode] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [ledger, setLedger] = useState<LoyaltyLedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void Promise.all([
      fetchLoyaltyBalance(token, countryCode, expire),
      fetchLoyaltyLedger(token, countryCode, expire),
    ])
      .then(([balanceRes, ledgerRes]) => {
        if (!balanceRes.ok) {
          setError(balanceRes.kind === 'forbidden' ? 'forbidden' : 'network');
          return;
        }
        setEnabled(balanceRes.data.enabled);
        setBalance(balanceRes.data.balance_points);
        setProgramCode(balanceRes.data.program_code ?? null);
        if (ledgerRes.ok) {
          setLedger(ledgerRes.data.data ?? []);
        } else if (ledgerRes.kind !== 'forbidden') {
          setError('network');
          return;
        }
        setError(null);
      })
      .finally(() => setLoading(false));
  }, [countryCode, expire, getAccessToken, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <AccountPage title="Rewards & loyalty" subtitle="Earn points on eligible orders.">
        <PageIntro>
          <p>Complete medicine orders to earn demo loyalty points. Redemption preview is available in sandbox mode.</p>
        </PageIntro>
        <EmptyState title="Sign in required" description="Login to view your loyalty rewards." action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }} />
      </AccountPage>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  return (
    <AccountPage title="Rewards & loyalty" subtitle="Earn points on eligible orders — sandbox demo program.">
      <PageIntro>
        <p>Points accrue automatically after delivered orders. Full redemption flows roll out by country policy pack.</p>
      </PageIntro>
      {loading ? <LoadingState label="Loading rewards" /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'network' ? <NetworkErrorState action={{ label: 'Retry', onClick: load }} /> : null}
      {!loading && !error ? (
        <>
          <MgCard className="mg-order-hero">
            <p className="mg-list-meta">Program {programCode ?? '—'}</p>
            <h2 className="mg-section-title">{enabled ? `${balance ?? 0} points` : 'Loyalty not enabled in your area'}</h2>
            <p className="mg-text-muted">Redemption is preview-only in sandbox — points track real checkout activity in demo.</p>
          </MgCard>
          {ledger.length ? (
            <ul className="mg-order-list">
              {ledger.map((row) => (
                <li key={row.id}>
                  <MgCard className="mg-order-card" flat>
                    <div className="mg-order-card-top">
                      <p className="mg-list-title">{row.kind.replace(/_/g, ' ')}</p>
                      <span className="mg-status">
                        {row.points_delta > 0 ? '+' : ''}
                        {row.points_delta} pts
                      </span>
                    </div>
                    <p className="mg-order-track-hint">{new Date(row.created_at).toLocaleString()}</p>
                  </MgCard>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No ledger entries yet"
              description="Complete an order to earn demo points."
              action={{ label: 'Shop medicines', onClick: () => (window.location.href = '/') }}
            />
          )}
          <MgBtn href="/account" variant="ghost" size="sm">
            Back to account
          </MgBtn>
        </>
      ) : null}
    </AccountPage>
  );
}
