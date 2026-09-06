import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, SafeAreaView, Share } from 'react-native';
import { createSessionStore } from '@world-pharma/shell-core';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeListRow,
  NativeListSection,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeOtpSignIn,
  NativeSessionExpiredState,
  NativeText,
  OpsKpiRow,
  OpsShell,
  OpsAccessGate,
} from '@world-pharma/ui-kit/native';
import {
  AffiliateApiError,
  createAffiliateSupportTicket,
  createReferralCode,
  createReferralLink,
  fetchAffiliateInbox,
  fetchAffiliateStats,
  fetchAffiliateSupportTickets,
  listAffiliateEarnings,
  listAffiliateStatement,
  listReferralCodes,
  listReferralLinks,
  markAffiliateInboxRead,
  fetchAffiliatePartnerWallet,
  saveAffiliatePayoutAccount,
  withdrawAffiliatePartnerWallet,
  updateReferralCode,
  type AffiliateEarning,
  type AffiliateEarningsResponse,
  type AffiliateInboxItem,
  type AffiliateStatementRow,
  type AffiliateStats,
  type AffiliateSupportTicket,
  type PartnerWalletView,
  type ReferralCode,
  type ReferralLink,
} from './affiliate-api';
import {
  earningStatusLabel,
  formatMoney,
  kycStatusSummary,
  payoutStatusLabel,
  referralStatusLabel,
  resolveShareUrl,
} from './affiliate-labels';
import {
  AFFILIATE_SHELL_TABS,
  affiliateMobileScreen,
  type AffiliateTab,
} from './navigation';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'expired';

const DEFAULT_COUNTRY = 'XX';

export function App() {
  const store = useMemo(() => createSessionStore(), []);
  const [session, setSession] = useState(store.snapshot());
  const [tab, setTab] = useState<AffiliateTab>('dashboard');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY);
  const [viewState, setViewState] = useState<ViewState>('idle');

  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [earnings, setEarnings] = useState<AffiliateEarningsResponse | null>(null);
  const [statement, setStatement] = useState<AffiliateStatementRow[]>([]);
  const [statementMeta, setStatementMeta] = useState<{ currency: string | null; live_payout: boolean } | null>(
    null,
  );
  const [inbox, setInbox] = useState<AffiliateInboxItem[]>([]);
  const [tickets, setTickets] = useState<AffiliateSupportTicket[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [selectedCodeId, setSelectedCodeId] = useState('');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [denyDetail, setDenyDetail] = useState<string | null>(null);

  const token = store.getAccessToken();
  const screen = affiliateMobileScreen(session, tab);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof AffiliateApiError) {
        if (err.status === 403) {
          setDenyDetail(err.message);
          setViewState('forbidden');
          return;
        }
        if (err.status === 401) {
          store.expire();
          setSession(store.snapshot());
          setViewState('expired');
          return;
        }
        if (err.status === 404) {
          setActionMessage('Resource not found or not yours.');
          setViewState('idle');
          return;
        }
      }
      setViewState('network');
    },
    [store],
  );

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setViewState('loading');
    try {
      const body = await fetchAffiliateStats(token, countryCode);
      setStats(body);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, countryCode, handleError]);

  const loadLinks = useCallback(async () => {
    if (!token) return;
    setViewState('loading');
    try {
      const [codeBody, linkBody] = await Promise.all([
        listReferralCodes(token, countryCode),
        listReferralLinks(token, countryCode),
      ]);
      setCodes(codeBody.data ?? []);
      setLinks(linkBody.data ?? []);
      if (!selectedCodeId && codeBody.data?.[0]) {
        setSelectedCodeId(codeBody.data[0].id);
      }
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, countryCode, handleError, selectedCodeId]);

  const loadEarnings = useCallback(async () => {
    if (!token) return;
    setViewState('loading');
    try {
      const body = await listAffiliateEarnings(token);
      setEarnings(body);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  const loadStatement = useCallback(async () => {
    if (!token) return;
    setViewState('loading');
    try {
      const body = await listAffiliateStatement(token);
      setStatement(body.data ?? []);
      setStatementMeta({ currency: body.currency, live_payout: body.live_payout });
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  const loadInbox = useCallback(async () => {
    if (!token) return;
    setViewState('loading');
    try {
      const body = await fetchAffiliateInbox(token);
      setInbox(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  const loadSupport = useCallback(async () => {
    if (!token) return;
    setViewState('loading');
    try {
      const body = await fetchAffiliateSupportTickets(token);
      setTickets(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, handleError]);

  const loadProfile = useCallback(async () => {
    if (!token) return;
    setViewState('loading');
    try {
      const body = await fetchAffiliateStats(token, countryCode);
      setStats(body);
      setViewState('idle');
    } catch (err) {
      handleError(err);
    }
  }, [token, countryCode, handleError]);

  useEffect(() => {
    if (session.status !== 'authenticated') return;
    setActionMessage(null);
    if (tab === 'dashboard') void loadDashboard();
    else if (tab === 'links') void loadLinks();
    else if (tab === 'earnings') void loadEarnings();
    else if (tab === 'statement') void loadStatement();
    else if (tab === 'inbox') void loadInbox();
    else if (tab === 'support') void loadSupport();
    else if (tab === 'profile') void loadProfile();
  }, [
    session.status,
    tab,
    loadDashboard,
    loadLinks,
    loadEarnings,
    loadStatement,
    loadInbox,
    loadSupport,
    loadProfile,
  ]);

  const retry = () => {
    if (tab === 'dashboard') void loadDashboard();
    else if (tab === 'links') void loadLinks();
    else if (tab === 'earnings') void loadEarnings();
    else if (tab === 'statement') void loadStatement();
    else if (tab === 'inbox') void loadInbox();
    else if (tab === 'support') void loadSupport();
    else void loadProfile();
  };

  if (screen === 'sign-in') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <NativeOtpSignIn
          portalTitle="World Pharma Affiliate"
          portalDescription="Referral desk — codes, share links, commissions, and statements."
          audience="customer"
          staffEmail="sandbox-affiliate@dev.local"
          onAuthenticated={({ accessToken, refreshToken }) => {
            store.authenticate({ accessToken, refreshToken, audience: 'customer' });
            setSession(store.snapshot());
            setViewState('idle');
          }}
        />
      </SafeAreaView>
    );
  }

  if (screen === 'expired') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <NativeSessionExpiredState
          onAction={() => {
            store.signOut();
            setSession(store.snapshot());
            setStats(null);
            setEarnings(null);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#07111A' }}>
      <OpsShell
        product="Affiliate"
        accent="#ECC94B"
        status="Partner desk"
        tabs={AFFILIATE_SHELL_TABS}
        active={tab === 'dashboard' || tab === 'links' || tab === 'earnings' || tab === 'profile' ? tab : 'profile'}
        onSelect={(id) => {
          setTab(id as AffiliateTab);
        }}
      >
        {viewState === 'loading' ? <NativeLoadingState mode="dark" /> : null}
        {viewState === 'forbidden' ? (
          <OpsAccessGate
            detail={denyDetail}
            staffEmail="sandbox-affiliate@dev.local"
            onRetry={retry}
            onSignOut={() => {
              store.signOut();
              setSession(store.snapshot());
              setDenyDetail(null);
              setViewState('idle');
            }}
          />
        ) : null}
        {viewState === 'network' ? <NativeNetworkErrorState onRetry={retry} /> : null}
        {actionMessage ? <NativeText mode="dark" variant="caption">{actionMessage}</NativeText> : null}

        {viewState === 'idle' ? (
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
            {tab === 'dashboard' ? (
              <DashboardPanel
                stats={stats}
                countryCode={countryCode}
                onCountryChange={setCountryCode}
                onRefresh={() => void loadDashboard()}
              />
            ) : null}

            {tab === 'links' ? (
              <LinksPanel
                codes={codes}
                links={links}
                countryCode={countryCode}
                newCode={newCode}
                newLinkLabel={newLinkLabel}
                selectedCodeId={selectedCodeId}
                onNewCodeChange={setNewCode}
                onNewLinkLabelChange={setNewLinkLabel}
                onSelectCode={setSelectedCodeId}
                onCreateCode={async () => {
                  if (!token || !newCode.trim()) return;
                  setViewState('loading');
                  try {
                    await createReferralCode(token, {
                      country_code: countryCode,
                      code: newCode.trim().toUpperCase(),
                    });
                    setNewCode('');
                    setActionMessage('Referral code created.');
                    await loadLinks();
                  } catch (err) {
                    handleError(err);
                  }
                }}
                onToggleCode={async (row) => {
                  if (!token) return;
                  setViewState('loading');
                  try {
                    await updateReferralCode(token, row.id, {
                      country_code: countryCode,
                      status: row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                      version: row.version,
                    });
                    await loadLinks();
                  } catch (err) {
                    handleError(err);
                  }
                }}
                onCreateLink={async () => {
                  if (!token || !selectedCodeId) return;
                  setViewState('loading');
                  try {
                    await createReferralLink(token, {
                      country_code: countryCode,
                      referral_code_id: selectedCodeId,
                      label: newLinkLabel.trim() || undefined,
                    });
                    setNewLinkLabel('');
                    setActionMessage('Referral link created.');
                    await loadLinks();
                  } catch (err) {
                    handleError(err);
                  }
                }}
                onShare={async (url) => {
                  const full = resolveShareUrl(url);
                  try {
                    await Share.share({ message: full, url: full });
                    setActionMessage(`Shared: ${full}`);
                  } catch {
                    setActionMessage(`Copy this referral URL: ${full}`);
                  }
                }}
              />
            ) : null}

            {tab === 'earnings' ? <EarningsPanel token={token ?? ''} earnings={earnings} onError={handleError} /> : null}
            {tab === 'statement' ? (
              <StatementPanel rows={statement} currency={statementMeta?.currency ?? null} livePayout={statementMeta?.live_payout ?? false} />
            ) : null}
            {tab === 'inbox' ? (
              <InboxPanel
                rows={inbox}
                onMarkRead={async (id) => {
                  if (!token) return;
                  try {
                    await markAffiliateInboxRead(token, id);
                    await loadInbox();
                  } catch (err) {
                    handleError(err);
                  }
                }}
              />
            ) : null}
            {tab === 'support' ? (
              <SupportPanel
                tickets={tickets}
                subject={supportSubject}
                body={supportBody}
                onSubjectChange={setSupportSubject}
                onBodyChange={setSupportBody}
                onSubmit={async () => {
                  if (!token || !supportSubject.trim() || !supportBody.trim()) return;
                  setViewState('loading');
                  try {
                    await createAffiliateSupportTicket(token, {
                      subject: supportSubject.trim(),
                      body: supportBody.trim(),
                    });
                    setSupportSubject('');
                    setSupportBody('');
                    setActionMessage('Support ticket submitted.');
                    await loadSupport();
                  } catch (err) {
                    handleError(err);
                  }
                }}
              />
            ) : null}
            {tab === 'profile' ? (
              <>
                <NativeListSection title="Desk">
                  <NativeListRow label="Statement" hint="Attributed orders" onPress={() => setTab('statement')} />
                  <NativeListRow label="Inbox" onPress={() => setTab('inbox')} />
                  <NativeListRow label="Support" onPress={() => setTab('support')} />
                </NativeListSection>
                <ProfilePanel
                  audience={session.audience ?? 'customer'}
                  stats={stats}
                  onSignOut={() => {
                    store.signOut();
                    setSession(store.snapshot());
                  }}
                />
              </>
            ) : null}
          </ScrollView>
        ) : null}
      </OpsShell>
    </SafeAreaView>
  );
}

function DashboardPanel({
  stats,
  countryCode,
  onCountryChange,
  onRefresh,
}: {
  stats: AffiliateStats | null;
  countryCode: string;
  onCountryChange: (v: string) => void;
  onRefresh: () => void;
}) {
  if (!stats) {
    return <NativeEmptyState title="No stats yet" description="Affiliate membership required for this country." />;
  }
  return (
    <>
      <OpsKpiRow
        items={[
          { label: 'Clicks', value: stats.clicks_total },
          { label: 'Conv', value: stats.conversions_total ?? 0 },
          { label: 'Pending', value: formatMoney(stats.earnings_pending_minor) },
        ]}
      />
      <NativeCard>
        <NativeText variant="h2">Market</NativeText>
        <NativeInput label="Country code" value={countryCode} onChangeText={onCountryChange} placeholder="XX" />
        <NativeButton label="Refresh" onPress={onRefresh} />
        {stats.sandbox ? <NativeText variant="caption">Sandbox data — not live production payouts.</NativeText> : null}
      </NativeCard>
      <NativeCard>
        <NativeText variant="h2">Traffic</NativeText>
        <NativeText>Clicks: {stats.clicks_total}</NativeText>
        <NativeText>Conversions / orders: {stats.conversions_total ?? 0}</NativeText>
        <NativeText>Active codes: {stats.codes_active}</NativeText>
        <NativeText>Links: {stats.links_total}</NativeText>
      </NativeCard>
      <NativeCard>
        <NativeText variant="h2">Commissions</NativeText>
        <NativeText>Pending: {formatMoney(stats.earnings_pending_minor)}</NativeText>
        <NativeText>Approved: {formatMoney(stats.earnings_approved_minor)}</NativeText>
        <NativeText>Payable: {formatMoney(stats.earnings_payable_minor)}</NativeText>
        <NativeText>Paid: {formatMoney(stats.earnings_paid_minor)}</NativeText>
        <NativeText>Reversed: {formatMoney(stats.earnings_reversed_minor)}</NativeText>
      </NativeCard>
      <NativeCard>
        <NativeText variant="h2">Payout</NativeText>
        <NativeText>{payoutStatusLabel(stats.payout_status, stats.payout_enabled)}</NativeText>
        <NativeText variant="caption">Mobile cannot execute payouts. Server-authorized admin/finance only.</NativeText>
      </NativeCard>
    </>
  );
}

function LinksPanel(props: {
  codes: ReferralCode[];
  links: ReferralLink[];
  countryCode: string;
  newCode: string;
  newLinkLabel: string;
  selectedCodeId: string;
  onNewCodeChange: (v: string) => void;
  onNewLinkLabelChange: (v: string) => void;
  onSelectCode: (id: string) => void;
  onCreateCode: () => Promise<void>;
  onToggleCode: (row: ReferralCode) => Promise<void>;
  onCreateLink: () => Promise<void>;
  onShare: (url: string) => Promise<void>;
}) {
  return (
    <>
      <NativeCard>
        <NativeText variant="h2">Create referral code ({props.countryCode})</NativeText>
        <NativeInput label="New code" value={props.newCode} onChangeText={props.onNewCodeChange} placeholder="CODE" />
        <NativeButton label="Create code" onPress={() => void props.onCreateCode()} />
      </NativeCard>
      {props.codes.length === 0 ? (
        <NativeEmptyState title="No referral codes" description="Create a code to start attribution." />
      ) : (
        props.codes.map((row) => (
          <NativeCard key={row.id}>
            <NativeText variant="h2">{row.code}</NativeText>
            <NativeText>{referralStatusLabel(row.status)} · v{row.version}</NativeText>
            <NativeText variant="caption">{row.redeemable ? 'Redeemable' : 'Not redeemable'}</NativeText>
            <NativeButton
              label={props.selectedCodeId === row.id ? 'Selected for new link' : 'Use for link'}
              onPress={() => props.onSelectCode(row.id)}
            />
            <NativeButton
              label={row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              onPress={() => void props.onToggleCode(row)}
            />
          </NativeCard>
        ))
      )}
      <NativeCard>
        <NativeText variant="h2">Create share link</NativeText>
        <NativeInput
          label="Link label"
          value={props.newLinkLabel}
          onChangeText={props.onNewLinkLabelChange}
          placeholder="Optional label"
        />
        <NativeButton label="Create link" onPress={() => void props.onCreateLink()} />
      </NativeCard>
      {props.links.length === 0 ? (
        <NativeEmptyState title="No referral links" description="Create a link from an active code." />
      ) : (
        props.links.map((row) => (
          <NativeCard key={row.id}>
            <NativeText variant="h2">{row.label ?? row.referral_code}</NativeText>
            <NativeText>{referralStatusLabel(row.status)}</NativeText>
            <NativeText variant="caption">{resolveShareUrl(row.share_url)}</NativeText>
            <NativeButton label="Share link" onPress={() => void props.onShare(row.share_url)} />
          </NativeCard>
        ))
      )}
    </>
  );
}

function EarningsPanel({
  token,
  earnings,
  onError,
}: {
  token: string;
  earnings: AffiliateEarningsResponse | null;
  onError: (err: unknown) => void;
}) {
  const [wallet, setWallet] = useState<PartnerWalletView | null>(null);
  const [walletMsg, setWalletMsg] = useState<string | null>(null);
  const [holder, setHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [method, setMethod] = useState<'BANK' | 'UPI'>('BANK');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const body = await fetchAffiliatePartnerWallet(token);
      setWallet(body);
    } catch (err) {
      onError(err);
    }
  }, [token, onError]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  if (!earnings && !wallet) {
    return <NativeEmptyState title="No earnings" description="Commissions appear after attributed orders." />;
  }
  const summary = earnings?.summary;
  const rows: AffiliateEarning[] = earnings?.data ?? [];
  return (
    <>
      {wallet ? (
        <NativeCard>
          <NativeText variant="h2">Earnings wallet</NativeText>
          <NativeText>
            Available: {formatMoney(wallet.available_minor, wallet.currency)}
          </NativeText>
          <NativeText variant="caption">{wallet.message}</NativeText>
          {wallet.payout_account ? (
            <NativeText variant="caption">
              Payout: {wallet.payout_account.account_holder_name}
              {wallet.payout_account.method === 'UPI'
                ? ` · ${wallet.payout_account.upi_id_masked}`
                : ` · ${wallet.payout_account.bank_name} ${wallet.payout_account.account_number_masked}`}
            </NativeText>
          ) : (
            <>
              <NativeButton
                label={method === 'BANK' ? 'Use UPI' : 'Use bank'}
                onPress={() => setMethod((m) => (m === 'BANK' ? 'UPI' : 'BANK'))}
              />
              <NativeInput label="Account holder" value={holder} onChangeText={setHolder} />
              {method === 'BANK' ? (
                <>
                  <NativeInput label="Bank" value={bankName} onChangeText={setBankName} />
                  <NativeInput label="Account #" value={accountNumber} onChangeText={setAccountNumber} />
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
                    try {
                      await saveAffiliatePayoutAccount(token, {
                        method,
                        account_holder_name: holder,
                        bank_name: bankName || undefined,
                        account_number: accountNumber || undefined,
                        ifsc_or_routing: ifsc || undefined,
                        upi_id: upiId || undefined,
                      });
                      setWalletMsg('Payout account saved.');
                      await loadWallet();
                    } catch (err) {
                      if (err instanceof AffiliateApiError) {
                        setWalletMsg(err.message);
                      } else {
                        onError(err);
                      }
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            </>
          )}
          <NativeInput
            label={`Withdraw (${wallet.currency})`}
            value={withdrawAmount}
            onChangeText={setWithdrawAmount}
            keyboardType="decimal-pad"
          />
          <NativeButton
            label={busy ? 'Working…' : 'Withdraw'}
            onPress={() => {
              void (async () => {
                const major = Number(withdrawAmount);
                if (!Number.isFinite(major) || major <= 0) {
                  setWalletMsg('Enter a positive amount.');
                  return;
                }
                setBusy(true);
                try {
                  const res = await withdrawAffiliatePartnerWallet(
                    token,
                    String(Math.round(major * 100)),
                  );
                  setWalletMsg(res.message ?? res.status);
                  setWithdrawAmount('');
                  await loadWallet();
                } catch (err) {
                  if (err instanceof AffiliateApiError) {
                    setWalletMsg(err.message);
                  } else {
                    onError(err);
                  }
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />
          {walletMsg ? <NativeText variant="caption">{walletMsg}</NativeText> : null}
        </NativeCard>
      ) : null}
      <NativeCard>
        <NativeText variant="h2">Liability summary</NativeText>
        {summary ? (
          <>
            <NativeText>Pending: {formatMoney(summary.pending_minor, rows[0]?.currency)}</NativeText>
            <NativeText>Approved: {formatMoney(summary.approved_minor, rows[0]?.currency)}</NativeText>
            <NativeText>Payable: {formatMoney(summary.payable_minor, rows[0]?.currency)}</NativeText>
            <NativeText>Paid: {formatMoney(summary.paid_minor, rows[0]?.currency)}</NativeText>
            <NativeText>Reversed: {formatMoney(summary.reversed_minor, rows[0]?.currency)}</NativeText>
          </>
        ) : (
          <NativeText variant="caption">No summary buckets yet.</NativeText>
        )}
        {earnings ? (
          <NativeText variant="caption">
            Payout: {payoutStatusLabel(earnings.payout_status, Boolean(earnings.payout_execution_enabled))}
            {earnings.live_payout ? '' : ' · live payout off'}
          </NativeText>
        ) : null}
      </NativeCard>
      {rows.length === 0 ? (
        <NativeEmptyState title="No commission rows" description="Attributed orders will list here." />
      ) : (
        rows.map((row) => (
          <NativeCard key={`${row.order_id}-${row.status}-${row.updated_at ?? row.created_at ?? ''}`}>
            <NativeText variant="h2">{formatMoney(row.amount_minor, row.currency)}</NativeText>
            <NativeText>{earningStatusLabel(row.status)}</NativeText>
            <NativeText variant="caption">
              Order {row.order_id.slice(0, 8)}… · {row.affiliate_code ?? '—'}
              {row.clinical_blocked ? ' · clinical blocked' : ''}
            </NativeText>
          </NativeCard>
        ))
      )}
    </>
  );
}

function StatementPanel({
  rows,
  currency,
  livePayout,
}: {
  rows: AffiliateStatementRow[];
  currency: string | null;
  livePayout: boolean;
}) {
  return (
    <>
      <NativeCard>
        <NativeText variant="h2">Settlement statement</NativeText>
        <NativeText variant="caption">
          {livePayout ? 'Live payout visible' : 'Sandbox statement — live payout EXTERNAL_GATED'}
        </NativeText>
      </NativeCard>
      {rows.length === 0 ? (
        <NativeEmptyState title="No statement rows" description="Statement fills as commissions settle." />
      ) : (
        rows.map((row) => (
          <NativeCard key={`${row.order_id}-${row.date}-${row.status}`}>
            <NativeText variant="h2">{formatMoney(row.commission_amount_minor, row.currency || currency || 'XXX')}</NativeText>
            <NativeText>{earningStatusLabel(row.status)}</NativeText>
            <NativeText variant="caption">
              {row.date} · {row.order_number ?? row.order_id.slice(0, 8)} · {row.period}
              {row.reversal ? ' · reversal' : ''}
              {row.refund_adjusted ? ' · refund adjusted' : ''}
            </NativeText>
          </NativeCard>
        ))
      )}
    </>
  );
}

function InboxPanel({
  rows,
  onMarkRead,
}: {
  rows: AffiliateInboxItem[];
  onMarkRead: (id: string) => Promise<void>;
}) {
  if (rows.length === 0) {
    return <NativeEmptyState title="Inbox empty" description="Affiliate notifications appear here." />;
  }
  return (
    <>
      {rows.map((row) => (
        <NativeCard key={row.id}>
          <NativeText variant="h2">{row.title}</NativeText>
          {!row.read ? <NativeText variant="caption">Unread</NativeText> : null}
          <NativeText>{row.body}</NativeText>
          <NativeText variant="caption">{new Date(row.created_at).toLocaleString()}</NativeText>
          {!row.read ? <NativeButton label="Mark read" onPress={() => void onMarkRead(row.id)} /> : null}
        </NativeCard>
      ))}
    </>
  );
}

function SupportPanel({
  tickets,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  onSubmit,
}: {
  tickets: AffiliateSupportTicket[];
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <>
      <NativeCard>
        <NativeText variant="h2">New ticket</NativeText>
        <NativeInput label="Subject" value={subject} onChangeText={onSubjectChange} placeholder="Subject" />
        <NativeInput label="Details" value={body} onChangeText={onBodyChange} placeholder="Details" />
        <NativeButton label="Submit" onPress={() => void onSubmit()} />
      </NativeCard>
      {tickets.length === 0 ? (
        <NativeEmptyState title="No tickets" description="Support history for your affiliate account." />
      ) : (
        tickets.map((row) => (
          <NativeCard key={row.id}>
            <NativeText variant="h2">{row.subject}</NativeText>
            <NativeText>{referralStatusLabel(row.status)}</NativeText>
            <NativeText variant="caption">{row.body}</NativeText>
          </NativeCard>
        ))
      )}
    </>
  );
}

function ProfilePanel({
  audience,
  stats,
  onSignOut,
}: {
  audience: string;
  stats: AffiliateStats | null;
  onSignOut: () => void;
}) {
  const kyc = kycStatusSummary({
    payout_enabled: Boolean(stats?.payout_enabled),
    payout_status: stats?.payout_status,
    clinical_blocked_default: stats?.clinical_blocked_default,
  });
  return (
    <>
      <NativeCard>
        <NativeText variant="h2">Session</NativeText>
        <NativeText>Audience: {audience}</NativeText>
        <NativeText variant="caption">Affiliate org membership is enforced by the API (403 if missing).</NativeText>
      </NativeCard>
      <NativeCard>
        <NativeText variant="h2">{kyc.headline}</NativeText>
        <NativeText>{kyc.detail}</NativeText>
        <NativeText variant="caption">Raw KYC documents and evidence are never shown here.</NativeText>
      </NativeCard>
      <NativeCard>
        <NativeText variant="h2">Payout controls</NativeText>
        <NativeText>
          {payoutStatusLabel(stats?.payout_status, Boolean(stats?.payout_enabled))}
        </NativeText>
        <NativeText variant="caption">
          No payout execute button — S149 server authorization only. CAN_PRODUCTION_LAUNCH = NO.
        </NativeText>
      </NativeCard>
      <NativeButton label="Sign out" onPress={onSignOut} />
    </>
  );
}
