'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminViewLoadError } from './admin-request-error';
import { classifyAdminViewState } from './admin-http';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import {
  fetchCountriesOverview,
  fetchFirstCountryLaunchPackage,
  runActivationDryRun,
  type ActivationDryRunView,
  type CountryOverviewRow,
  type FirstCountryLaunchPackageView,
  type LaunchDimensionStatus,
} from './control-plane-api';
import { fetchReleaseGate } from './reliability-admin-api';
import { ProductionLaunchControlPanel } from './production-launch-control-admin';

function statusKind(status: LaunchDimensionStatus | string): 'pending' | 'warning' | 'info' {
  if (status === 'READY' || status === 'READY_FOR_ACTIVATION' || status === 'PASS') return 'info';
  if (
    status === 'EXTERNAL_GATED' ||
    status === 'NOT_CONFIGURED' ||
    status === 'PENDING' ||
    status === 'INFO' ||
    status === 'NOT_VERIFIED' ||
    status === 'NOT_APPLICABLE'
  ) {
    return 'pending';
  }
  return 'warning';
}

export function FinalLaunchReadinessPanel() {
  const { session, getAccessToken } = useSession();
  const searchParams = useSearchParams();
  const canRead = session.permissions?.includes('policy:read') ?? false;

  const [countries, setCountries] = useState<CountryOverviewRow[]>([]);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState<'loading' | 'idle' | 'forbidden' | 'network' | 'error'>('loading');
  const [pkg, setPkg] = useState<FirstCountryLaunchPackageView | null>(null);
  const [dryRun, setDryRun] = useState<ActivationDryRunView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dryBusy, setDryBusy] = useState(false);
  const [releaseGate, setReleaseGate] = useState<{
    overall_launch_ready: boolean;
    internal_software_ready: boolean;
    decision: string;
    categories: Array<{ id: string; status: string; blocker: string | null; next_action: string }>;
    message: string;
  } | null>(null);

  const loadCountries = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setView('forbidden');
      return;
    }
    setView('loading');
    try {
      const [body, gate] = await Promise.all([fetchCountriesOverview(token), fetchReleaseGate(token)]);
      const rows = body.data ?? [];
      setCountries(rows);
      setReleaseGate(gate);
      setView('idle');
      const fromQuery = searchParams.get('country')?.trim().toUpperCase();
      const initial =
        (fromQuery && rows.some((r) => r.country_code === fromQuery) ? fromQuery : null) ??
        rows[0]?.country_code ??
        '';
      if (initial) setSelected(initial);
    } catch (err) {
      setView(classifyAdminViewState(err));
    }
  }, [canRead, getAccessToken, searchParams]);

  const loadPackage = useCallback(
    async (iso: string) => {
      const token = getAccessToken();
      if (!token || !iso) return;
      setDetailLoading(true);
      setDryRun(null);
      try {
        const next = await fetchFirstCountryLaunchPackage(token, iso);
        setPkg(next);
      } catch {
        setPkg(null);
        setView('network');
      } finally {
        setDetailLoading(false);
      }
    },
    [getAccessToken],
  );

  const onDryRun = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !selected) return;
    setDryBusy(true);
    try {
      const result = await runActivationDryRun(token, selected);
      setDryRun(result);
    } catch {
      setView('network');
    } finally {
      setDryBusy(false);
    }
  }, [getAccessToken, selected]);

  useEffect(() => {
    if (session.status === 'authenticated') void loadCountries();
  }, [loadCountries, session.status]);

  useEffect(() => {
    if (selected && session.status === 'authenticated') void loadPackage(selected);
  }, [loadPackage, selected, session.status]);

  const readiness = pkg?.readiness ?? null;

  const runbookByStage = useMemo(() => {
    if (!pkg) return [];
    const stages = [1, 2, 3, 4, 5, 6] as const;
    return stages.map((stage) => ({
      stage,
      label: pkg.runbook.find((r) => r.stage === stage)?.stage_label ?? `STAGE ${stage}`,
      items: pkg.runbook.filter((r) => r.stage === stage),
    }));
  }, [pkg]);

  if (view === 'forbidden') return <PermissionDeniedState />;
  if ((view === 'network' || view === 'error') && !pkg) {
    return <AdminViewLoadError viewState={view} onRetry={() => void loadCountries()} />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Final launch readiness</Heading>
        <p className="wp-page-intro">
          First-country launch package: actionable blockers, runbook stages, and activation dry-run.
          Country-neutral — EXTERNAL_GATED stays gated until genuine providers exist. Software
          composition here is <strong>not</strong> a production launch certificate: live PSP, OTP,
          carrier, eRx, video, PACS, payouts, storage, and KMS remain unavailable until authorized.
          Use Reliability → Final internal release gate and{' '}
          <Link href="/provider-activation">Provider activation</Link> for INTERNAL SOFTWARE vs EXTERNAL /
          INFRASTRUCTURE / LEGAL readiness.
        </p>
      </header>

      <ProductionLaunchControlPanel />

      <div className="wp-toolbar">
        <label className="wp-field">
          <Text tone="secondary">Country</Text>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Select country"
          >
            {countries.map((c) => (
              <option key={c.country_code} value={c.country_code}>
                {c.country_code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          onClick={() => void loadPackage(selected)}
          disabled={!selected || detailLoading}
        >
          Re-evaluate
        </Button>
        <Button variant="secondary" onClick={() => void onDryRun()} disabled={!selected || dryBusy}>
          {dryBusy ? 'Dry-run…' : 'Activation dry-run'}
        </Button>
        <Link href={selected ? `/countries?country=${selected}` : '/countries'}>
          <Button variant="tertiary" size="sm">
            Country control
          </Button>
        </Link>
        <Link href="/reliability">
          <Button variant="tertiary" size="sm">
            Reliability / recovery
          </Button>
        </Link>
      </div>

      {releaseGate ? (
        <Card>
          <Heading level={2}>Internal software vs production launch</Heading>
          <Text>{releaseGate.message}</Text>
          <div className="wp-toolbar">
            <Badge kind={releaseGate.overall_launch_ready ? 'info' : 'warning'}>
              Production launch ready: {String(releaseGate.overall_launch_ready)}
            </Badge>
            <Badge kind={releaseGate.internal_software_ready ? 'info' : 'warning'}>
              Internal software: {releaseGate.internal_software_ready ? 'READY' : 'NOT READY'}
            </Badge>
            <Badge kind="pending">{releaseGate.decision}</Badge>
          </div>
          <ul className="wp-stack">
            {releaseGate.categories.map((row) => (
              <li key={row.id}>
                <Badge kind={statusKind(row.status)}>{row.status}</Badge> <strong>{row.id}</strong>
                {row.blocker ? (
                  <Text tone="secondary">
                    {' '}
                    · Blocker: {row.blocker}
                  </Text>
                ) : null}
                <div>
                  <Text tone="secondary">Next: {row.next_action}</Text>
                </div>
              </li>
            ))}
          </ul>
          <Text tone="secondary">
            EXTERNAL_GATED = provider/infra/legal outside this app. PASS here is software-only — not launch approval.
          </Text>
        </Card>
      ) : null}

      {view === 'loading' && !pkg ? <LoadingState label="Loading countries" /> : null}
      {detailLoading && !pkg ? <LoadingState label="Building first-country package" /> : null}

      {!countries.length && view === 'idle' ? (
        <EmptyState title="No countries" description="Create a country before evaluating launch readiness." />
      ) : null}

      {pkg ? (
        <>
          <Card>
            <Heading level={2}>Why not launch?</Heading>
            <div className="wp-toolbar">
              <Badge kind={statusKind(pkg.overall_decision)}>
                {pkg.overall_decision.replaceAll('_', ' ')}
              </Badge>
              <Badge kind="pending">Lifecycle: {pkg.readiness.production_lifecycle}</Badge>
            </div>
            <Text>{pkg.why_not_launch}</Text>
            {pkg.next_action ? (
              <p>
                <strong>Next action:</strong> {pkg.next_action}
              </p>
            ) : null}
            <Text tone="secondary">
              Last evaluated {new Date(pkg.evaluated_at).toLocaleString()}
            </Text>
            <dl className="wp-kpi-grid">
              {Object.entries(pkg.taxonomy_counts).map(([key, count]) => (
                <div key={key}>
                  <dt>
                    <Text tone="secondary">{key.replaceAll('_', ' ')}</Text>
                  </dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {dryRun ? (
            <Card>
              <Heading level={2}>Activation dry-run</Heading>
              <Badge kind={dryRun.result === 'PASS' ? 'info' : 'warning'}>{dryRun.result}</Badge>
              <Text tone="secondary">
                would_activate={String(dryRun.would_activate)} · mutated={String(dryRun.mutated)} ·
                lifecycle {dryRun.production_lifecycle_before} → {dryRun.production_lifecycle_after}
              </Text>
              <Text>{dryRun.why_not_launch}</Text>
              <Text tone="secondary">
                Internal blockers: {dryRun.internal_blockers.length} · External:{' '}
                {dryRun.external_blockers.length}
                {dryRun.audit_event_emitted ? ' · Audit event recorded' : ''}
              </Text>
            </Card>
          ) : null}

          <Heading level={2}>First-country package</Heading>
          <div className="wp-kpi-grid">
            {pkg.sections.map((section) => (
              <Card key={section.id}>
                <Heading level={3}>{section.label}</Heading>
                <Badge kind={statusKind(section.status)}>{String(section.status).replaceAll('_', ' ')}</Badge>
                <Text tone="secondary">{section.summary}</Text>
                {section.next_action ? (
                  <Text tone="secondary">Next: {section.next_action}</Text>
                ) : null}
              </Card>
            ))}
          </div>

          <Heading level={2}>Dimensions</Heading>
          <div className="wp-kpi-grid">
            {(readiness?.dimensions ?? []).map((dim) => (
              <Card key={dim.id}>
                <Heading level={3}>{dim.label}</Heading>
                <Badge kind={statusKind(dim.status)}>{dim.status.replaceAll('_', ' ')}</Badge>
                <Text tone="secondary">{dim.summary}</Text>
                <Text tone="secondary">{dim.software_ready_note}</Text>
              </Card>
            ))}
          </div>

          <Card>
            <Heading level={2}>Blockers</Heading>
            {(readiness?.blockers.length ?? 0) === 0 ? (
              <Text tone="secondary">No blockers recorded.</Text>
            ) : (
              <ul className="wp-stack">
                {(readiness?.blockers ?? []).map((b) => (
                  <li key={`${b.dimension}-${b.code}`}>
                    <Badge kind={b.actionable === 'EXTERNAL' ? 'pending' : 'warning'}>
                      {b.taxonomy ?? b.actionable}
                    </Badge>{' '}
                    <Badge kind="pending">{b.severity}</Badge>{' '}
                    <strong>{b.code}</strong> · {b.dimension}
                    <div>
                      <Text tone="secondary">
                        {b.actionability?.what_is_missing ?? b.explanation}
                      </Text>
                    </div>
                    <div>
                      <Text tone="secondary">
                        Why: {b.actionability?.why_blocks_launch ?? b.explanation}
                      </Text>
                    </div>
                    <div>
                      <Text tone="secondary">
                        Resolve via: {b.actionability?.resolving_workflow ?? 'Main Admin workflow'}
                        {b.actionability?.resolving_href ? (
                          <>
                            {' '}
                            ·{' '}
                            <Link href={b.actionability.resolving_href}>Open workflow</Link>
                          </>
                        ) : null}
                      </Text>
                    </div>
                    <div>
                      <Text tone="secondary">
                        Stage {b.actionability?.runbook_stage ?? '—'} · Clear from app:{' '}
                        {b.actionability?.can_clear_from_application ? 'yes' : 'no'} · Permission:{' '}
                        {b.actionability?.authorized_permission ?? 'policy:read'}
                      </Text>
                    </div>
                    {b.actionable === 'EXTERNAL' ? (
                      <div>
                        <Text tone="secondary">
                          Provider class: {b.actionability?.required_provider_class ?? '—'} · Config
                          ref required: {b.actionability?.config_reference_required ? 'yes' : 'no'} ·
                          Live verification: {b.actionability?.live_verification_required ? 'yes' : 'no'}
                        </Text>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Heading level={2}>Launch runbook</Heading>
          {runbookByStage.map((group) => (
            <Card key={group.stage}>
              <Heading level={3}>{group.label}</Heading>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Badge kind={statusKind(item.status)}>{item.status.replaceAll('_', ' ')}</Badge>{' '}
                    {item.label}
                    {item.blocker_code ? (
                      <Text tone="secondary">
                        {' '}
                        · {item.blocker_code}
                        {item.can_clear_from_application === false ? ' (external)' : ''}
                      </Text>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </>
      ) : null}
    </div>
  );
}
