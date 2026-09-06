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
import { AdminDataTable } from './admin-data-table';
import { marketCountryPickerValue, requireMarketCountry } from './working-country';

type PackageRow = {
  id: string;
  code: string;
  name: string;
  category?: string;
  price?: number;
  price_minor?: number;
  currency?: string;
  tests_count?: number;
  is_popular?: boolean;
  status?: string;
  description?: string;
};

const STATUS_OPTIONS = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];

export function HealthPackagesAdminPanel() {
  const { session, getAccessToken } = useSession();
  const token = getAccessToken();
  const [country, setCountry] = useState(() => marketCountryPickerValue(session.countryCode));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    category: 'full_body',
    price_minor: '99900',
    currency: '',
    tests_count: '50',
    is_popular: false,
  });

  const canManage = useMemo(() => session.permissions?.includes('lab:review'), [session.permissions]);
  const countryReady = Boolean(country.trim());

  const load = useCallback(async () => {
    if (!token || !countryReady) {
      return;
    }
    setLoading(true);
    setDenied(false);
    setError(false);
    try {
      const params = new URLSearchParams({ country_code: country });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      const res = await adminJson<{ packages?: PackageRow[] }>(
        token,
        `/api/v1/admin/health-packages?${params.toString()}`,
      );
      setRows(res.packages ?? []);
    } catch (err) {
      if (err instanceof AdminHttpError && err.status === 403) {
        setDenied(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [country, countryReady, search, statusFilter, token]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin' && countryReady) {
      void load();
    }
  }, [countryReady, load, session.audience, session.status]);

  const resetForm = () => {
    setEditing(null);
    setForm({
      code: '',
      name: '',
      description: '',
      category: 'full_body',
      price_minor: '99900',
      currency: '',
      tests_count: '50',
      is_popular: false,
    });
  };

  const save = async () => {
    if (!token || !countryReady) {
      setMessage('Select a country scope first.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const iso = requireMarketCountry(country);
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        price_minor: Number(form.price_minor),
        currency: form.currency.trim() || undefined,
        tests_count: Number(form.tests_count),
        is_popular: form.is_popular,
      };
      if (editing) {
        await adminJson(token, `/api/v1/admin/health-packages/${encodeURIComponent(editing.code)}?country_code=${iso}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setMessage('Package updated.');
      } else {
        await adminJson(token, `/api/v1/admin/health-packages?country_code=${iso}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setMessage('Package created.');
      }
      resetForm();
      await load();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (row: PackageRow, status: string) => {
    if (!token || !countryReady) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const iso = requireMarketCountry(country);
      await adminJson(
        token,
        `/api/v1/admin/health-packages/${encodeURIComponent(row.code)}/status?country_code=${iso}`,
        { method: 'POST', body: JSON.stringify({ status }) },
      );
      setMessage(`Status set to ${status}.`);
      await load();
    } catch (err) {
      setMessage(err instanceof AdminHttpError ? err.message : 'Status change failed.');
    } finally {
      setBusy(false);
    }
  };

  const formatPrice = (row: PackageRow) => {
    if (row.price != null && row.currency) {
      return `${row.currency} ${row.price}`;
    }
    if (row.price_minor != null && row.currency) {
      return `${row.currency} ${(row.price_minor / 100).toFixed(2)}`;
    }
    return row.price != null ? String(row.price) : '—';
  };

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Health packages</Heading>
        <p className="wp-page-intro">
          Country-scoped checkup catalog backed by the database. Pricing uses each market&apos;s configured currency.
        </p>
      </header>
      <div className="wp-toolbar">
        <MarketCountrySelect ariaLabel="Package country" value={country} onChange={setCountry} />
        <FormField label="Search">
          {({ id }) => (
            <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or code" />
          )}
        </FormField>
        <FormField label="Status">
          {({ id }) => (
            <Select id={id} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button onClick={() => void load()} disabled={loading || !countryReady}>
          Refresh
        </Button>
      </div>
      {!countryReady ? (
        <EmptyState title="Select country" description="Choose a market country to load the catalog." />
      ) : null}
      {canManage ? (
        <Card>
          <Heading level={3}>{editing ? 'Edit package' : 'Create package'}</Heading>
          <div className="wp-admin-grid-2">
            <FormField label="Code">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.code}
                  disabled={Boolean(editing)}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Name">
              {({ id }) => (
                <Input id={id} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              )}
            </FormField>
            <FormField label="Category">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Price (minor units)">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  value={form.price_minor}
                  onChange={(e) => setForm((f) => ({ ...f, price_minor: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Currency override">
              {({ id }) => (
                <Input
                  id={id}
                  placeholder="Uses country default if empty"
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Tests count">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  value={form.tests_count}
                  onChange={(e) => setForm((f) => ({ ...f, tests_count: e.target.value }))}
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
          <label className="wp-checkbox-row">
            <input
              type="checkbox"
              checked={form.is_popular}
              onChange={(e) => setForm((f) => ({ ...f, is_popular: e.target.checked }))}
            />
            Popular package
          </label>
          <div className="wp-toolbar">
            <Button disabled={busy || !form.code.trim() || !form.name.trim()} onClick={() => void save()}>
              {busy ? 'Saving…' : editing ? 'Update' : 'Create'}
            </Button>
            {editing ? (
              <Button variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
      {message ? <p className="wp-text-muted">{message}</p> : null}
      {loading && rows.length === 0 ? <LoadingState label="Loading packages" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires lab:review." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {rows.length ? (
        <Card>
          <AdminDataTable
            caption="Health packages"
            rows={rows}
            rowKey={(row) => row.code}
            loading={loading}
            columns={[
              { id: 'name', header: 'Package', cell: (row) => row.name },
              { id: 'category', header: 'Category', cell: (row) => row.category ?? '—', hideOnMobile: true },
              { id: 'tests', header: 'Tests', cell: (row) => row.tests_count ?? '—', hideOnMobile: true },
              { id: 'price', header: 'Price', cell: (row) => formatPrice(row) },
              {
                id: 'status',
                header: 'Status',
                cell: (row) => <span className="wp-status">{row.status ?? '—'}</span>,
              },
              { id: 'popular', header: 'Popular', cell: (row) => (row.is_popular ? 'Yes' : '—'), hideOnMobile: true },
              {
                id: 'actions',
                header: '',
                cell: (row) =>
                  canManage ? (
                    <div className="wp-toolbar wp-toolbar-wrap">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditing(row);
                          setForm({
                            code: row.code,
                            name: row.name,
                            description: row.description ?? '',
                            category: row.category ?? 'full_body',
                            price_minor: String(row.price_minor ?? (row.price != null ? row.price * 100 : 0)),
                            currency: row.currency ?? '',
                            tests_count: String(row.tests_count ?? 0),
                            is_popular: Boolean(row.is_popular),
                          });
                        }}
                      >
                        Edit
                      </Button>
                      {row.status !== 'ACTIVE' ? (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus(row, 'ACTIVE')}>
                          Activate
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void setStatus(row, 'INACTIVE')}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  ) : null,
              },
            ]}
          />
        </Card>
      ) : countryReady && !loading && !denied && !error ? (
        <EmptyState title="No packages" description="Catalog is empty for this country." />
      ) : null}
    </section>
  );
}
