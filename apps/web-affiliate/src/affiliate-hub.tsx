'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  AffiliateApiError,
  createReferralCode,
  createReferralLink,
  fetchAffiliateStats,
  listAffiliateEarnings,
  listReferralCodes,
  listReferralLinks,
  type ReferralCode,
  type ReferralLink,
} from './affiliate-api';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/codes', label: 'Codes' },
  { href: '/links', label: 'Links' },
  { href: '/earnings', label: 'Earnings' },
  { href: '/profile', label: 'Profile' },
];

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

function AffiliateNav() {
  const pathname = usePathname();
  return (
    <nav className="affiliate-nav" aria-label="Affiliate">
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AffiliateShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="shell-main">
      <Heading level={1}>Affiliate</Heading>
      <Text tone="secondary">Referral codes, links, and earnings visibility. Payouts remain disabled in R12-D.</Text>
      <AffiliateNav />
      {children}
    </main>
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
    return (
      <AffiliateShell>
        <PermissionDeniedState />
      </AffiliateShell>
    );
  }
  if (viewState === 'network') {
    return (
      <AffiliateShell>
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      </AffiliateShell>
    );
  }
  if (viewState === 'loading' && !stats) {
    return (
      <AffiliateShell>
        <LoadingState label="Loading affiliate stats" />
      </AffiliateShell>
    );
  }

  return (
    <AffiliateShell>
      <FormField label="Country code">
        {({ id }) => (
          <Input id={id} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
        )}
      </FormField>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Card>
          <Text tone="secondary">Clicks</Text>
          <Heading level={3}>{stats?.clicks_total ?? 0}</Heading>
        </Card>
        <Card>
          <Text tone="secondary">Links</Text>
          <Heading level={3}>{stats?.links_total ?? 0}</Heading>
        </Card>
        <Card>
          <Text tone="secondary">Active codes</Text>
          <Heading level={3}>{stats?.codes_active ?? 0}</Heading>
        </Card>
        <Card>
          <Text tone="secondary">Pending earnings (minor)</Text>
          <Heading level={3}>{stats?.earnings_pending_minor ?? '0'}</Heading>
        </Card>
      </div>
      {stats?.clinical_blocked_default ? (
        <Text tone="secondary">Clinical affiliate payout remains blocked by default.</Text>
      ) : null}
    </AffiliateShell>
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

  if (viewState === 'forbidden') {
    return (
      <AffiliateShell>
        <PermissionDeniedState />
      </AffiliateShell>
    );
  }
  if (viewState === 'network') {
    return (
      <AffiliateShell>
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      </AffiliateShell>
    );
  }

  return (
    <AffiliateShell>
      <FormField label="Country code">
        {({ id }) => (
          <Input id={id} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
        )}
      </FormField>
      <FormField label="New referral code">
        {({ id }) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} />}
      </FormField>
      {formError ? <Text tone="secondary">{formError}</Text> : null}
      <Button onClick={() => void handleCreate()}>Create code</Button>
      {viewState === 'loading' ? <LoadingState label="Loading codes" /> : null}
      {!codes.length && viewState === 'idle' ? (
        <EmptyState title="No referral codes yet" description="Create a referral code to get started." />
      ) : null}
      {codes.map((row) => (
        <Card key={row.id}>
          <Heading level={4}>{row.code}</Heading>
          <Text tone="secondary">
            {row.status} · v{row.version} · {row.redeemable ? 'redeemable' : 'not redeemable'}
          </Text>
        </Card>
      ))}
    </AffiliateShell>
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
    return (
      <AffiliateShell>
        <PermissionDeniedState />
      </AffiliateShell>
    );
  }
  if (viewState === 'network') {
    return (
      <AffiliateShell>
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      </AffiliateShell>
    );
  }

  return (
    <AffiliateShell>
      <FormField label="Country code">
        {({ id }) => (
          <Input id={id} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
        )}
      </FormField>
      <FormField label="Referral code">
        {({ id }) => (
          <select id={id} value={selectedCodeId} onChange={(e) => setSelectedCodeId(e.target.value)}>
            <option value="">Select code</option>
            {codes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField label="Label">
        {({ id }) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} />}
      </FormField>
      {formError ? <Text tone="secondary">{formError}</Text> : null}
      <Button onClick={() => void handleCreate()}>Create link</Button>
      {viewState === 'loading' ? <LoadingState label="Loading links" /> : null}
      {!links.length && viewState === 'idle' ? (
        <EmptyState title="No referral links yet" description="Create a link from an active referral code." />
      ) : null}
      {links.map((row) => (
        <Card key={row.id}>
          <Heading level={4}>{row.label ?? row.referral_code}</Heading>
          <Text>{row.share_url}</Text>
          <Text tone="secondary">{row.status}</Text>
        </Card>
      ))}
    </AffiliateShell>
  );
}

export function AffiliateEarningsPage() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listAffiliateEarnings>>['data']>([]);
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
    return (
      <AffiliateShell>
        <PermissionDeniedState />
      </AffiliateShell>
    );
  }
  if (viewState === 'network') {
    return (
      <AffiliateShell>
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      </AffiliateShell>
    );
  }

  return (
    <AffiliateShell>
      {viewState === 'loading' ? <LoadingState label="Loading earnings" /> : null}
      {!rows.length && viewState === 'idle' ? (
        <EmptyState title="No attributed earnings yet" description="Earnings appear when orders attribute to your codes." />
      ) : null}
      {rows.map((row) => (
        <Card key={row.order_id}>
          <Heading level={4}>Order {row.order_id.slice(0, 8)}…</Heading>
          <Text>
            {row.amount_minor} {row.currency} · {row.status}
          </Text>
          <Text tone="secondary">
            Code {row.affiliate_code ?? '—'} · clinical blocked: {String(row.clinical_blocked)}
          </Text>
        </Card>
      ))}
    </AffiliateShell>
  );
}

export function AffiliateProfilePage() {
  const { session } = useSession();
  return (
    <AffiliateShell>
      <Card>
        <Heading level={3}>Affiliate profile</Heading>
        <Text tone="secondary">Audience: {session.audience}</Text>
        <Text tone="secondary">Organization context is resolved server-side from membership.</Text>
      </Card>
    </AffiliateShell>
  );
}
