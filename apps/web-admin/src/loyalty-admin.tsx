'use client';

import { useCallback, useEffect, useState } from 'react';
import { classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
} from '@world-pharma/ui-kit/web';
import {
  createLoyaltyProgram,
  listCarePlanMemberships,
  listLoyaltyPrograms,
  LoyaltyApiError,
  updateLoyaltyProgram,
  type LoyaltyProgram,
} from './loyalty-admin-api';
import { workingCountry, MARKET_COUNTRY_CODES } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

function loyaltyStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function LoyaltyAdminHub() {
  const { getAccessToken, session } = useSession();
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [carePlan, setCarePlan] = useState<{
    active_members: number;
    by_plan: Array<{ plan_code: string; name: string; active_members: number }>;
  } | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [points, setPoints] = useState('1');
  const [formError, setFormError] = useState('');
  const canManage = session.permissions.includes('loyalty:manage');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const [body, care] = await Promise.all([
        listLoyaltyPrograms(token, countryCode),
        listCarePlanMemberships(token, countryCode).catch(() => null),
      ]);
      setPrograms(body.data ?? []);
      setCarePlan(care);
      setViewState('idle');
    } catch (err) {
      if (err instanceof LoyaltyApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  async function handleCreate() {
    const token = getAccessToken();
    if (!token || !code.trim() || !name.trim()) {
      return;
    }
    setFormError('');
    try {
      await createLoyaltyProgram(token, {
        country_code: countryCode,
        code: code.trim(),
        name: name.trim(),
        points_per_currency_minor: Number(points) || 1,
      });
      setCode('');
      setName('');
      await load();
    } catch (err) {
      setFormError(err instanceof LoyaltyApiError ? err.message : 'Create failed');
    }
  }

  async function toggleStatus(row: LoyaltyProgram) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const nextStatus = row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateLoyaltyProgram(token, row.id, {
        country_code: countryCode,
        status: nextStatus,
        version: row.version,
      });
      await load();
    } catch (err) {
      setFormError(err instanceof LoyaltyApiError ? err.message : 'Update failed');
    }
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Loyalty programs</Heading>
        <p className="wp-page-intro">
          Country-scoped loyalty configuration. Customer balances use the same kernel. Care Plan memberships are sandbox-billed.
        </p>
      </header>
      {carePlan ? (
        <Card>
          <Heading level={2}>Care Plan members</Heading>
          <p className="wp-text-muted">
            {carePlan.active_members} active in {countryCode}
          </p>
          {carePlan.by_plan.length ? (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {carePlan.by_plan.map((row) => (
                    <tr key={row.plan_code}>
                      <td>{row.name}</td>
                      <td>{row.active_members}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : null}
      <div className="wp-toolbar">
        <FormField label="Country">
          {({ id }) => (
            <Select id={id} value={countryCode} onChange={(e) => setCountryCode(workingCountry(e.target.value))}>
              {MARKET_COUNTRY_CODES.map((iso) => (
                <option key={iso} value={iso}>
                  {iso}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
          {viewState === 'loading' ? 'Refreshing…' : 'Refresh programs'}
        </Button>
      </div>
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />
      {viewState === 'loading' && !programs.length ? <LoadingState label="Loading programs" /> : null}
      {!programs.length && viewState === 'idle' ? (
        <EmptyState title="No loyalty programs" description="Create a program for the selected country." />
      ) : (
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Code</th>
                <th>Status</th>
                <th>Points</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {programs.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>
                    {row.code} · v{row.version}
                  </td>
                  <td>
                    <span className="wp-status">{loyaltyStatusLabel(row.status)}</span>
                  </td>
                  <td>{row.points_per_currency_minor} pts/minor</td>
                  <td>
                    {canManage ? (
                      <Button size="sm" variant="secondary" onClick={() => void toggleStatus(row)}>
                        {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage ? (
        <Card>
          <h2 className="wp-section-title">Create program</h2>
          <div className="wp-form-grid">
          <FormField label="Code">
            {({ id }) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value)} />}
          </FormField>
          <FormField label="Name">
            {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
          </FormField>
          <FormField label="Points per currency minor unit">
            {({ id }) => <Input id={id} value={points} onChange={(e) => setPoints(e.target.value)} />}
          </FormField>
          <div className="wp-form-actions">
          <Button onClick={() => void handleCreate()}>Create program</Button>
          </div>
          </div>
        </Card>
      ) : null}
      {formError ? <p className="wp-text-muted">{formError}</p> : null}
    </div>
  );
}
