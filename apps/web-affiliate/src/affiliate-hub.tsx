'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PartnerWalletPanel, useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  Select,
  Text,
  TextArea,
} from '@world-pharma/ui-kit/web';
import {
  AffiliateApiError,
  affiliateStatementCsvUrl,
  createReferralCode,
  createReferralLink,
  createAffiliateSupportTicket,
  fetchAffiliateInbox,
  fetchAffiliateStats,
  fetchAffiliateSupportTickets,
  listAffiliateEarnings,
  listAffiliateStatement,
  listReferralCodes,
  listReferralLinks,
  markAffiliateInboxRead,
  type ReferralCode,
  type ReferralLink,
  updateReferralCode,
} from './affiliate-api';
import {
  affiliateInboxHref,
  formatInboxWhen,
  groupAffiliateInbox,
  inboxCategoryLabel,
} from './affiliate-inbox';
import {
  earningStatusLabel,
  fullShareUrl,
  referralCodeStatusLabel,
  supportTicketStatusLabel,
} from './affiliate-labels';
import { formatMoney } from './format-money';
import { AffiliateSandboxScopeNotice, AFFILIATE_SANDBOX_COUNTRY_CODE, isAffiliateSandboxCountry } from './affiliate-sandbox-scope';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

function PageHeader({ title, intro }: { title: string; intro: string }) {
  return (
    <header className="wp-page-header">
      <Heading level={1}>{title}</Heading>
      <p className="wp-page-intro">{intro}</p>
    </header>
  );
}

function InboxTable({
  rows,
  markingId,
  onMarkRead,
}: {
  rows: Awaited<ReturnType<typeof fetchAffiliateInbox>>['data'];
  markingId: string | null;
  onMarkRead: (id: string) => void;
}) {
  return (
    <table className="wp-data-table">
      <thead>
        <tr>
          <th>Notice</th>
          <th>Category</th>
          <th>When</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const href = affiliateInboxHref(row);
          const category = inboxCategoryLabel(row.reference_type);
          return (
            <tr key={row.id}>
              <td>
                <strong>{row.title}</strong>
                {!row.read ? <span className="wp-status">Unread</span> : null}
                <p className="wp-text-muted">{row.body}</p>
              </td>
              <td>{category || '—'}</td>
              <td>{formatInboxWhen(row.created_at)}</td>
              <td>
                <div className="wp-toolbar">
                  {href?.startsWith('http') ? (
                    <a href={href}>
                      <Button variant="secondary" size="sm">
                        Open
                      </Button>
                    </a>
                  ) : href ? (
                    <Link href={href}>
                      <Button variant="secondary" size="sm">
                        Open
                      </Button>
                    </Link>
                  ) : null}
                  {!row.read ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={markingId === row.id}
                      onClick={() => onMarkRead(row.id)}
                    >
                      {markingId === row.id ? 'Updating…' : 'Mark as read'}
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function AffiliateDashboard() {
  const { getAccessToken } = useSession();
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [countryCode, setCountryCode] = useState('XX');
  const [stats, setStats] = useState<Awaited<ReturnType<typeof fetchAffiliateStats>> | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await fetchAffiliateStats(token, countryCode);
      setStats(body);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'forbidden') {
    return <AffiliateSandboxScopeNotice requestedCountry={countryCode} />;
  }
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }
  if (viewState === 'loading' && !stats) {
    return <LoadingState label="Loading affiliate stats" />;
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        intro="Referral performance for your affiliate organization — sandbox financial data only; live payout is not enabled."
      />
      <Card>
        <FormField label="Country code">
          {({ id }) => (
            <Input
              id={id}
              placeholder="XX"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            />
          )}
        </FormField>
        {isAffiliateSandboxCountry(countryCode) ? (
          <Text size="caption" tone="secondary">
            Sandbox market XX — intentional demo scope; not a live storefront country.
          </Text>
        ) : (
          <Text size="caption" tone="secondary">
            Store markets (IN/AE/US) require a matching affiliate partner membership. Demo partners use XX.
          </Text>
        )}
      </Card>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
          {viewState === 'loading' ? 'Refreshing…' : 'Refresh stats'}
        </Button>
      </div>
      <Card>
        <PortalKpiCards
          items={[
            { label: 'Clicks', value: stats?.clicks_total ?? 0 },
            { label: 'Links', value: stats?.links_total ?? 0 },
            { label: 'Active codes', value: stats?.codes_active ?? 0 },
            { label: 'Conversions', value: stats?.conversions_total ?? 0 },
            { label: 'Pending earnings', value: formatMoney(stats?.earnings_pending_minor, 'XXX') },
            { label: 'Approved earnings', value: formatMoney(stats?.earnings_approved_minor, 'XXX') },
            { label: 'Payable earnings', value: formatMoney(stats?.earnings_payable_minor, 'XXX') },
            { label: 'Paid earnings', value: formatMoney(stats?.earnings_paid_minor, 'XXX') },
          ]}
        />
        {stats?.payout_status === 'external_gated' ? (
          <p className="wp-text-muted">
            Payout execution is external-gated. Payable amounts are liability records only — not live bank settlement.
          </p>
        ) : null}
      </Card>
      {stats?.clinical_blocked_default ? (
        <p className="wp-text-muted">Clinical/Rx affiliate commission remains blocked by country policy.</p>
      ) : null}
      {!stats?.payout_enabled ? (
        <p className="wp-text-muted">Live payout is disabled. Earnings show liability status only.</p>
      ) : null}
    </>
  );
}

export function AffiliateCodesPage() {
  const { getAccessToken } = useSession();
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [countryCode, setCountryCode] = useState('XX');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await listReferralCodes(token, countryCode);
      setCodes(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const token = getAccessToken();
    if (!token || !code.trim()) {
      return;
    }
    setFormError('');
    try {
      await createReferralCode(token, { country_code: countryCode, code: code.trim() });
      setCode('');
      await load();
    } catch (err) {
      setFormError(err instanceof AffiliateApiError ? err.message : 'Create failed');
    }
  }

  async function toggleCode(row: ReferralCode) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const nextStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setFormError('');
    try {
      await updateReferralCode(token, row.id, {
        country_code: countryCode,
        status: nextStatus,
        version: row.version,
      });
      await load();
    } catch (err) {
      setFormError(err instanceof AffiliateApiError ? err.message : 'Update failed');
    }
  }

  if (viewState === 'forbidden') {
    return <AffiliateSandboxScopeNotice requestedCountry={countryCode} />;
  }
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <>
      <PageHeader title="Referral codes" intro="Create and activate codes customers can use at checkout." />
      <Card>
        <FormField label="Country code">
          {({ id }) => (
            <Input id={id} placeholder="XX" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
          )}
        </FormField>
        <FormField label="New referral code">
          {({ id }) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />}
        </FormField>
        {formError ? <p className="wp-text-muted">{formError}</p> : null}
        <div className="wp-toolbar">
          <Button onClick={() => void handleCreate()}>Create code</Button>
          <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
            Refresh
          </Button>
        </div>
      </Card>
      {viewState === 'loading' && !codes.length ? <LoadingState label="Loading codes" /> : null}
      {!codes.length && viewState === 'idle' ? (
        <EmptyState title="No referral codes yet" description="Create a referral code to get started." />
      ) : (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Version</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {codes.map((row) => (
              <tr key={row.id}>
                <td>{row.code}</td>
                <td>
                  <span className="wp-status">{referralCodeStatusLabel(row.status)}</span>
                </td>
                <td>
                  v{row.version} · {row.redeemable ? 'redeemable' : 'not redeemable'}
                </td>
                <td>
                  {row.status === 'ACTIVE' || row.status === 'INACTIVE' ? (
                    <Button size="sm" variant="secondary" onClick={() => void toggleCode(row)}>
                      {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function AffiliateLinksPage() {
  const { getAccessToken } = useSession();
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [countryCode, setCountryCode] = useState('XX');
  const [selectedCodeId, setSelectedCodeId] = useState('');
  const [label, setLabel] = useState('');
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const [linkBody, codeBody] = await Promise.all([
        listReferralLinks(token, countryCode),
        listReferralCodes(token, countryCode),
      ]);
      setLinks(linkBody.data ?? []);
      setCodes(codeBody.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const token = getAccessToken();
    if (!token || !selectedCodeId) {
      return;
    }
    setFormError('');
    try {
      await createReferralLink(token, {
        country_code: countryCode,
        referral_code_id: selectedCodeId,
        label: label || undefined,
      });
      setLabel('');
      await load();
    } catch (err) {
      setFormError(err instanceof AffiliateApiError ? err.message : 'Create failed');
    }
  }

  if (viewState === 'forbidden') {
    return <AffiliateSandboxScopeNotice requestedCountry={countryCode} />;
  }
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <>
      <PageHeader title="Referral links" intro="Shareable URLs that attribute customer visits to your codes." />
      <Card>
        <FormField label="Country code">
          {({ id }) => (
            <Input id={id} placeholder="XX" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
          )}
        </FormField>
        <FormField label="Referral code">
          {({ id }) => (
            <Select id={id} value={selectedCodeId} onChange={(e) => setSelectedCodeId(e.target.value)}>
              <option value="">Select code</option>
              {codes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Label">
          {({ id }) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} />}
        </FormField>
        {formError ? <p className="wp-text-muted">{formError}</p> : null}
        <div className="wp-toolbar">
          <Button onClick={() => void handleCreate()}>Create link</Button>
          <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
            Refresh
          </Button>
        </div>
      </Card>
      {viewState === 'loading' && !links.length ? <LoadingState label="Loading links" /> : null}
      {!links.length && viewState === 'idle' ? (
        <EmptyState title="No referral links yet" description="Create a link from an active referral code." />
      ) : (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Link</th>
              <th>Status</th>
              <th>Share URL</th>
            </tr>
          </thead>
          <tbody>
            {links.map((row) => (
              <tr key={row.id}>
                <td>{row.label ?? row.referral_code}</td>
                <td>
                  <span className="wp-status">{referralCodeStatusLabel(row.status)}</span>
                </td>
                <td>{fullShareUrl(row.share_url)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function AffiliateEarningsPage() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAffiliateEarnings>>['data']>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof listAffiliateEarnings>>['summary']>();
  const [viewState, setViewState] = useState<ViewState>('loading');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await listAffiliateEarnings(token);
      setRows(body.data ?? []);
      setSummary(body.summary);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'forbidden') {
    return <AffiliateSandboxScopeNotice requestedCountry={AFFILIATE_SANDBOX_COUNTRY_CODE} />;
  }
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <>
      <PageHeader
        title="Earnings"
        intro="Commission liabilities credit your wallet when approved/payable. Add bank/UPI, then withdraw anytime (sandbox mock)."
      />
      <PartnerWalletPanel
        token={getAccessToken() ?? ''}
        partnerType="AFFILIATE"
        title="Affiliate earnings wallet"
      />
      {summary ? (
        <Card>
          <Heading level={3}>Liability summary</Heading>
          <dl className="wp-kpi-grid">
            <div>
              <dt>Calculated</dt>
              <dd>{formatMoney(summary.calculated_minor, rows[0]?.currency ?? 'XXX')}</dd>
            </div>
            <div>
              <dt>Pending</dt>
              <dd>{formatMoney(summary.pending_minor, rows[0]?.currency ?? 'XXX')}</dd>
            </div>
            <div>
              <dt>Approved</dt>
              <dd>{formatMoney(summary.approved_minor, rows[0]?.currency ?? 'XXX')}</dd>
            </div>
            <div>
              <dt>Payable</dt>
              <dd>{formatMoney(summary.payable_minor, rows[0]?.currency ?? 'XXX')}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{formatMoney(summary.paid_minor, rows[0]?.currency ?? 'XXX')}</dd>
            </div>
            <div>
              <dt>Reversed</dt>
              <dd>{formatMoney(summary.reversed_minor, rows[0]?.currency ?? 'XXX')}</dd>
            </div>
          </dl>
        </Card>
      ) : null}
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
          {viewState === 'loading' ? 'Refreshing…' : 'Refresh earnings'}
        </Button>
      </div>
      {viewState === 'loading' && !rows.length ? <LoadingState label="Loading earnings" /> : null}
      {!rows.length && viewState === 'idle' ? (
        <EmptyState title="No attributed earnings yet" description="Earnings appear when orders attribute to your codes." />
      ) : (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Code</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.order_id}>
                <td>{row.order_id.slice(0, 8)}…</td>
                <td>
                  <span className="wp-status">{earningStatusLabel(row.status)}</span>
                </td>
                <td>{formatMoney(row.amount_minor, row.currency)}</td>
                <td>
                  {row.affiliate_code ?? '—'} · {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function AffiliateStatementPage() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAffiliateStatement>>['data']>([]);
  const [currency, setCurrency] = useState<string>('XXX');
  const [viewState, setViewState] = useState<ViewState>('loading');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await listAffiliateStatement(token);
      setRows(body.data ?? []);
      setCurrency(body.currency ?? 'XXX');
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'forbidden') {
    return <AffiliateSandboxScopeNotice requestedCountry={AFFILIATE_SANDBOX_COUNTRY_CODE} />;
  }
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <>
      <PageHeader
        title="Statement"
        intro="Read-only commission statement from authoritative liability records. CSV export available; live payout remains external-gated."
      />
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
          {viewState === 'loading' ? 'Refreshing…' : 'Refresh statement'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const token = getAccessToken();
            if (!token) {
              return;
            }
            void fetch(affiliateStatementCsvUrl(token), {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(async (res) => {
                if (!res.ok) {
                  throw new Error(`export_failed_${res.status}`);
                }
                return res.blob();
              })
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'affiliate-statement.csv';
                anchor.click();
                URL.revokeObjectURL(url);
              })
              .catch(() => {
                /* keep statement view; operator can retry */
              });
          }}
        >
          Export CSV
        </Button>
      </div>
      {viewState === 'loading' && !rows.length ? <LoadingState label="Loading statement" /> : null}
      {!rows.length && viewState === 'idle' ? (
        <EmptyState title="No statement rows yet" description="Commission rows appear after attributed conversions." />
      ) : (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Commission</th>
              <th>Period</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.order_id}-${row.date}`}>
                <td>{row.order_number ?? row.order_id.slice(0, 8)}</td>
                <td>
                  <span className="wp-status">{earningStatusLabel(row.status)}</span>
                </td>
                <td>{formatMoney(row.commission_amount_minor, row.currency ?? currency)}</td>
                <td>
                  {row.period}
                  {row.reversal ? ' · Reversed' : ''}
                  {row.refund_adjusted ? ' · Refund adjusted' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function AffiliateProfilePage() {
  const { session } = useSession();
  return (
    <>
      <PageHeader title="Profile" intro="Your affiliate session and organization context." />
      <Card>
        <p className="wp-list-meta">Audience: {session.audience}</p>
        <p className="wp-text-muted">Organization context is resolved server-side from membership.</p>
      </Card>
    </>
  );
}

export function AffiliateInboxPage() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAffiliateInbox>>['data']>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await fetchAffiliateInbox(token);
      setRows(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMarkingId(id);
    try {
      await markAffiliateInboxRead(token, id);
      await load();
    } catch {
      setViewState('network');
    } finally {
      setMarkingId(null);
    }
  }

  if (viewState === 'forbidden') {
    return <AffiliateSandboxScopeNotice requestedCountry={AFFILIATE_SANDBOX_COUNTRY_CODE} />;
  }
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  const grouped = groupAffiliateInbox(rows);

  return (
    <>
      <PageHeader
        title="Inbox"
        intro="Application updates, commission notices, and support replies for your affiliate account."
      />
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
          {viewState === 'loading' ? 'Refreshing…' : 'Refresh inbox'}
        </Button>
      </div>
      {viewState === 'loading' && !rows.length ? <LoadingState label="Loading inbox" /> : null}
      {!rows.length && viewState === 'idle' ? (
        <EmptyState title="No notifications" description="Application, commission, and support notices appear here." />
      ) : null}
      {grouped.unread.length ? (
        <>
          <h2 className="inbox-section-title">Unread</h2>
          <InboxTable rows={grouped.unread} markingId={markingId} onMarkRead={(id) => void markRead(id)} />
        </>
      ) : null}
      {grouped.read.length ? (
        <>
          <h2 className="inbox-section-title">Earlier</h2>
          <InboxTable rows={grouped.read} markingId={markingId} onMarkRead={(id) => void markRead(id)} />
        </>
      ) : null}
    </>
  );
}

export function AffiliateSupportPage() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAffiliateSupportTickets>>['data']>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const bodyRes = await fetchAffiliateSupportTickets(token);
      setRows(bodyRes.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState('network');
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const token = getAccessToken();
    if (!token || !subject.trim() || !body.trim()) {
      return;
    }
    setFormError('');
    try {
      await createAffiliateSupportTicket(token, { subject: subject.trim(), body: body.trim() });
      setSubject('');
      setBody('');
      await load();
    } catch (err) {
      setFormError(err instanceof AffiliateApiError ? err.message : 'Submit failed');
    }
  }

  if (viewState === 'forbidden') {
    return <AffiliateSandboxScopeNotice requestedCountry={AFFILIATE_SANDBOX_COUNTRY_CODE} />;
  }
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <>
      <PageHeader
        title="Support"
        intro="Contact World Pharma operations. Do not include customer health information in tickets."
      />
      <Card>
        <FormField label="Subject">
          {({ id }) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} />}
        </FormField>
        <FormField label="Message">
          {({ id }) => (
            <TextArea id={id} value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          )}
        </FormField>
        {formError ? <p className="wp-text-muted">{formError}</p> : null}
        <div className="wp-toolbar">
          <Button onClick={() => void submit()}>Create ticket</Button>
          <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
            Refresh tickets
          </Button>
        </div>
      </Card>
      {viewState === 'loading' && !rows.length ? <LoadingState label="Loading tickets" /> : null}
      {!rows.length && viewState === 'idle' ? (
        <EmptyState title="No support tickets" description="Create a ticket for compliance or operational help." />
      ) : (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.subject}</td>
                <td>
                  <span className="wp-status">{supportTicketStatusLabel(row.status)}</span>
                </td>
                <td>{formatInboxWhen(row.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
