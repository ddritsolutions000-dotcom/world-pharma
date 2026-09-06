'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Select,
  TextArea,
} from '@world-pharma/ui-kit/web';
import { adminJson, AdminHttpError } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { MarketCountrySelect } from './market-country-select';
import { marketCountryPickerValue, requireMarketCountry } from './working-country';

type PlanRow = {
  id?: string;
  plan_code?: string;
  name?: string;
  price_label?: string;
  price_minor?: string;
  currency?: string;
  discount_bps?: number;
  free_delivery?: boolean;
  featured?: boolean;
  status?: string;
  description?: string;
  active_members?: number;
};

type MembershipRow = {
  id: string;
  customer_person_id: string;
  plan_code: string;
  status: string;
  expires_at?: string;
  active?: boolean;
};

type Summary = {
  country_code?: string;
  active_members?: number;
  total_rows?: number;
  billing?: string;
  by_plan?: PlanRow[];
  memberships?: MembershipRow[];
};

const CATALOG_STATUS = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];

export function CarePlanAdminPanel() {
  const { session, getAccessToken } = useSession();
  const token = getAccessToken();
  const [tab, setTab] = useState<'catalog' | 'memberships'>('catalog');
  const [country, setCountry] = useState(() => marketCountryPickerValue(session.countryCode));
  const [catalog, setCatalog] = useState<PlanRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [form, setForm] = useState({
    plan_code: '',
    name: '',
    description: '',
    price_minor: '49900',
    period: 'year',
    discount_bps: '500',
    free_delivery: true,
    featured: false,
  });

  const canManage = useMemo(() => session.permissions?.includes('loyalty:manage'), [session.permissions]);
  const countryReady = Boolean(country.trim());

  const loadCatalog = useCallback(async () => {
    if (!token || !countryReady) {
      return;
    }
    setLoading(true);
    setDenied(false);
    setError(false);
    try {
      const iso = requireMarketCountry(country);
      const res = await adminJson<{ data?: PlanRow[]; plans?: PlanRow[] }>(
        token,
        `/api/v1/admin/care-plan/catalog?country_code=${encodeURIComponent(iso)}`,
      );
      setCatalog(res.data ?? res.plans ?? []);
    } catch (err) {
      if (err instanceof AdminHttpError && err.status === 403) {
        setDenied(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [country, countryReady, token]);

  const loadMemberships = useCallback(async () => {
    if (!token || !countryReady) {
      return;
    }
    setLoading(true);
    setDenied(false);
    setError(false);
    try {
      const iso = requireMarketCountry(country);
      const res = await adminJson<Summary>(
        token,
        `/api/v1/admin/care-plan/memberships?country_code=${encodeURIComponent(iso)}`,
      );
      setSummary(res);
    } catch (err) {
      if (err instanceof AdminHttpError && err.status === 403) {
        setDenied(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [country, countryReady, token]);

  const load = useCallback(async () => {
    if (tab === 'catalog') {
      await loadCatalog();
    } else {
      await loadMemberships();
    }
  }, [loadCatalog, loadMemberships, tab]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin' && countryReady) {
      void load();
    }
  }, [countryReady, load, session.audience, session.status]);

  async function cancel(id: string) {
    if (!token) {
      return;
    }
    setBusyId(id);
    setMessage(null);
    try {
      await adminJson(token, `/api/v1/admin/care-plan/memberships/${id}/cancel`, {
        method: 'POST',
        body: '{}',
      });
      setMessage('Membership cancelled.');
      await loadMemberships();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Cancel failed.');
    } finally {
      setBusyId(null);
    }
  }

  const savePlan = async () => {
    if (!token || !countryReady) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const iso = requireMarketCountry(country);
      const body = {
        plan_code: form.plan_code.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        price_minor: Number(form.price_minor),
        period: form.period.trim(),
        discount_bps: Number(form.discount_bps),
        free_delivery: form.free_delivery,
        featured: form.featured,
      };
      if (editing) {
        await adminJson(
          token,
          `/api/v1/admin/care-plan/catalog/${encodeURIComponent(editing.id ?? editing.plan_code ?? '')}?country_code=${iso}`,
          { method: 'PATCH', body: JSON.stringify(body) },
        );
        setMessage('Plan updated.');
      } else {
        await adminJson(token, `/api/v1/admin/care-plan/catalog?country_code=${iso}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setMessage('Plan created.');
      }
      setEditing(null);
      await loadCatalog();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const setPlanStatus = async (plan: PlanRow, status: string) => {
    if (!token || !countryReady) {
      return;
    }
    setBusy(true);
    try {
      const iso = requireMarketCountry(country);
      const code = plan.id ?? plan.plan_code ?? '';
      await adminJson(token, `/api/v1/admin/care-plan/catalog/${encodeURIComponent(code)}/status?country_code=${iso}`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setMessage(`Plan ${status.toLowerCase()}.`);
      await loadCatalog();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Status change failed.');
    } finally {
      setBusy(false);
    }
  };

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  const memberships = summary?.memberships ?? [];

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Care plans</Heading>
        <p className="wp-page-intro">
          Database-backed catalog per country. Membership billing remains sandbox until live PSP gates close.
        </p>
      </header>
      <div className="wp-toolbar">
        <MarketCountrySelect ariaLabel="Care plan country" value={country} onChange={setCountry} />
        <Button variant={tab === 'catalog' ? 'primary' : 'secondary'} onClick={() => setTab('catalog')}>
          Catalog
        </Button>
        <Button variant={tab === 'memberships' ? 'primary' : 'secondary'} onClick={() => setTab('memberships')}>
          Memberships
        </Button>
        <Button onClick={() => void load()} disabled={loading || !countryReady}>
          Refresh
        </Button>
      </div>
      {!countryReady ? (
        <EmptyState title="Select country" description="Choose a market country to manage care plans." />
      ) : null}
      {message ? <p className="wp-text-muted">{message}</p> : null}
      {loading && tab === 'catalog' && catalog.length === 0 ? <LoadingState label="Loading catalog" /> : null}
      {loading && tab === 'memberships' && !summary ? <LoadingState label="Loading memberships" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires loyalty:read." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}

      {tab === 'catalog' && countryReady && canManage ? (
        <Card>
          <Heading level={3}>{editing ? 'Edit plan' : 'Create plan'}</Heading>
          <div className="wp-admin-grid-2">
            <FormField label="Plan code">
              {({ id }) => (
                <Input
                  id={id}
                  disabled={Boolean(editing)}
                  value={form.plan_code}
                  onChange={(e) => setForm((f) => ({ ...f, plan_code: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Name">
              {({ id }) => (
                <Input id={id} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              )}
            </FormField>
            <FormField label="Price (minor)">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  value={form.price_minor}
                  onChange={(e) => setForm((f) => ({ ...f, price_minor: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Period">
              {({ id }) => (
                <Input id={id} value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
              )}
            </FormField>
            <FormField label="Discount (bps)">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  value={form.discount_bps}
                  onChange={(e) => setForm((f) => ({ ...f, discount_bps: e.target.value }))}
                />
              )}
            </FormField>
          </div>
          <FormField label="Description">
            {({ id }) => (
              <TextArea
                id={id}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            )}
          </FormField>
          <Button disabled={busy || !form.plan_code.trim() || !form.name.trim()} onClick={() => void savePlan()}>
            {busy ? 'Saving…' : editing ? 'Update plan' : 'Create plan'}
          </Button>
        </Card>
      ) : null}

      {tab === 'catalog' && catalog.length ? (
        <Card>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Price</th>
                  <th>Discount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((plan) => (
                  <tr key={plan.id ?? plan.plan_code}>
                    <td>{plan.name ?? plan.plan_code}</td>
                    <td>{plan.price_label ?? plan.price_minor ?? '—'}</td>
                    <td>{plan.discount_bps != null ? `${plan.discount_bps / 100}%` : '—'}</td>
                    <td>
                      <span className="wp-status">{plan.status ?? '—'}</span>
                    </td>
                    <td>
                      {canManage ? (
                        <div className="wp-toolbar">
                          {plan.status !== 'ACTIVE' ? (
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setPlanStatus(plan, 'ACTIVE')}>
                              Activate
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setPlanStatus(plan, 'INACTIVE')}>
                              Deactivate
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : tab === 'catalog' && countryReady && !loading && !denied && !error ? (
        <EmptyState title="No plans" description="Create a care plan for this country." />
      ) : null}

      {tab === 'memberships' && summary ? (
        <Card>
          <p className="wp-list-meta">
            {summary.country_code}: {summary.active_members ?? 0} active / {summary.total_rows ?? 0} rows.{' '}
            {summary.billing ?? ''}
          </p>
        </Card>
      ) : null}
      {tab === 'memberships' && memberships.length ? (
        <Card>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Customer</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((row) => (
                  <tr key={row.id}>
                    <td>{row.plan_code}</td>
                    <td>
                      <span className="wp-status">{row.status}</span>
                    </td>
                    <td>
                      <code>{row.customer_person_id.slice(0, 8)}…</code>
                    </td>
                    <td>{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : '—'}</td>
                    <td>
                      {row.active && canManage ? (
                        <Button variant="secondary" disabled={busyId === row.id} onClick={() => void cancel(row.id)}>
                          {busyId === row.id ? 'Cancelling…' : 'Cancel'}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : tab === 'memberships' && summary && !loading ? (
        <EmptyState title="No memberships" description="Customers subscribe from the customer care plan page." />
      ) : null}
    </section>
  );
}
