'use client';

import Link from 'next/link';
import { AdminRequestError } from './admin-request-error';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { AdminDataTable } from './admin-data-table';
import {
  fetchCountriesOverview,
  fetchCountryDetail,
  activateCountry,
  suspendCountry,
  fetchProductionReadiness,
  fetchRegulatoryEvidence,
  activateProductionCountry,
  suspendProductionCountry,
  transitionProductionLifecycle,
  type CountryDetail,
  type CountryOverviewRow,
  type CountryReadinessState,
  type ProductionReadinessView,
  type RegulatoryEvidenceAdminRow,
} from './control-plane-api';

function readinessKind(state: CountryReadinessState): 'info' | 'pending' | 'success' | 'warning' {
  if (state === 'PRODUCTION_READY' || state === 'READY_FOR_ACTIVATION' || state === 'ACTIVE') return 'success';
  if (state === 'SANDBOX_READY' || state === 'READY_FOR_SANDBOX') return 'info';
  if (state === 'SUSPENDED') return 'warning';
  return 'pending';
}

function dimensionKind(status: string): 'info' | 'pending' | 'success' | 'warning' {
  if (status === 'PASS' || status === 'READY') return 'success';
  if (status === 'WARNING' || status === 'EXPIRED') return 'warning';
  return 'pending';
}

export function CountryControlCenter() {
  const { session, getAccessToken } = useSession();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<CountryOverviewRow[]>([]);
  const [detail, setDetail] = useState<CountryDetail | null>(null);
  const [production, setProduction] = useState<ProductionReadinessView | null>(null);
  const [evidence, setEvidence] = useState<RegulatoryEvidenceAdminRow[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const canRead = session.permissions?.includes('policy:read');
  const canActivate = session.permissions?.includes('policy:publish');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setDenied(!canRead);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const body = await fetchCountriesOverview(token);
      setRows(body.data ?? []);
    } catch (err) {
      if (typeof err === 'object' && err && 'status' in err && (err as { status: number }).status === 403) {
        setDenied(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [canRead, getAccessToken]);

  const loadDetail = useCallback(
    async (iso: string) => {
      const token = getAccessToken();
      if (!token || !iso) return;
      setDetailLoading(true);
      setSelected(iso);
      try {
        const [nextDetail, nextProduction, nextEvidence] = await Promise.all([
          fetchCountryDetail(token, iso),
          fetchProductionReadiness(token, iso).catch(() => null),
          fetchRegulatoryEvidence(token, iso).catch(() => [] as RegulatoryEvidenceAdminRow[]),
        ]);
        setDetail(nextDetail);
        setProduction(nextProduction);
        setEvidence(Array.isArray(nextEvidence) ? nextEvidence : []);
      } catch {
        setDetail(null);
        setProduction(null);
        setEvidence([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  useEffect(() => {
    const iso = searchParams.get('country')?.trim().toUpperCase();
    if (!iso || session.status !== 'authenticated' || rows.length === 0) {
      return;
    }
    if (rows.some((row) => row.country_code === iso)) {
      void loadDetail(iso);
    }
  }, [loadDetail, rows, searchParams, session.status]);

  if (denied) {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Global country control</Heading>
        <p className="wp-page-intro">
          Unified readiness view over policy packs, payments, notifications, logistics, and activation state — without
          duplicating canonical configuration systems.
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
        <Link href="/policy-packs">
          <Button variant="tertiary" size="sm">
            Policy packs
          </Button>
        </Link>
        <Link href={selected ? `/launch-readiness?country=${selected}` : '/launch-readiness'}>
          <Button variant="tertiary" size="sm">
            Final launch readiness
          </Button>
        </Link>
      </div>
      {loading ? <LoadingState label="Loading countries" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {!loading && !error ? (
        rows.length ? (
          <div className="wp-order-layout">
            <AdminDataTable
              caption="Countries"
              rows={rows}
              rowKey={(row) => row.country_code}
              activeKey={selected}
              columns={[
                {
                  id: 'country',
                  header: 'Country',
                  cell: (row) => (
                    <button type="button" className="wp-link-button" onClick={() => void loadDetail(row.country_code)}>
                      {row.country_code} · {row.name}
                    </button>
                  ),
                },
                {
                  id: 'readiness',
                  header: 'Readiness',
                  cell: (row) => (
                    <Badge kind={readinessKind(row.readiness)}>{row.readiness.replaceAll('_', ' ')}</Badge>
                  ),
                },
                {
                  id: 'currency',
                  header: 'Currency',
                  cell: (row) => row.currency,
                  hideOnMobile: true,
                },
                {
                  id: 'policy',
                  header: 'Policy',
                  cell: (row) => (row.policy_published ? 'Published' : 'Not published'),
                  hideOnMobile: true,
                },
                {
                  id: 'status',
                  header: 'Status',
                  cell: (row) => <span className="wp-status">{row.status}</span>,
                },
              ]}
            />
            <div className="wp-stack">
              {detailLoading ? <LoadingState label="Loading country detail" /> : null}
              {detail && !detailLoading ? (
                <Card>
                  <Heading level={2}>
                    {detail.country_code} · {detail.name}
                  </Heading>
                  <Badge kind={readinessKind(detail.readiness)}>{detail.readiness.replaceAll('_', ' ')}</Badge>
                  <dl className="wp-kpi-grid">
                    <div>
                      <dt>
                        <Text tone="secondary">Currency / TZ</Text>
                      </dt>
                      <dd>
                        {detail.currency} · {detail.timezone}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <Text tone="secondary">Activation</Text>
                      </dt>
                      <dd>{detail.status}</dd>
                    </div>
                    <div>
                      <dt>
                        <Text tone="secondary">Policy published</Text>
                      </dt>
                      <dd>{detail.policy.published_version ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>
                        <Text tone="secondary">Payment</Text>
                      </dt>
                      <dd>
                        {detail.payments.sandbox ? 'Sandbox' : 'Live'} ·{' '}
                        {detail.payments.live_psp ?? 'EXTERNAL_GATED'}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <Text tone="secondary">Delivery</Text>
                      </dt>
                      <dd>
                        zones {detail.logistics.serviceability_zones} ·{' '}
                        {detail.logistics.live_carrier ?? 'EXTERNAL_GATED'}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <Text tone="secondary">Notifications</Text>
                      </dt>
                      <dd>
                        {detail.notifications.verified} verified ·{' '}
                        {detail.notifications.live_messaging ?? 'EXTERNAL_GATED'}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <Text tone="secondary">Finance / settlement</Text>
                      </dt>
                      <dd>
                        {detail.finance?.settlement_policy_configured ? 'Policy set' : 'Missing'} ·{' '}
                        {detail.finance?.live_payout ?? 'EXTERNAL_GATED'}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <Text tone="secondary">Updated</Text>
                      </dt>
                      <dd>{detail.updated_at ? new Date(detail.updated_at).toLocaleString() : '—'}</dd>
                    </div>
                  </dl>
                  {detail.blockers && detail.blockers.length > 0 ? (
                    <div>
                      <Heading level={3}>Readiness blockers</Heading>
                      <ul>
                        {detail.blockers.map((code) => (
                          <li key={code}>
                            <Text tone="secondary">{code}</Text>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <Text tone="secondary">No mandatory readiness blockers.</Text>
                  )}
                  {detail.external_gates && detail.external_gates.length > 0 ? (
                    <div>
                      <Heading level={3}>External gates</Heading>
                      <ul>
                        {detail.external_gates.map((code) => (
                          <li key={code}>
                            <Text tone="secondary">{code}</Text>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {detail.healthcare?.status === 'NOT_MODELED' ? (
                    <Text tone="secondary">
                      Healthcare regulatory readiness is NOT_MODELED — technical config is not legal certification.
                    </Text>
                  ) : null}
                  {production ? (
                    <div className="wp-stack">
                      <Heading level={3}>Production readiness</Heading>
                      <Text tone="secondary">
                        Lifecycle {production.production_lifecycle} · overall {production.overall_status}
                        {production.activation_eligible ? ' · activation eligible' : ''}
                      </Text>
                      <dl className="wp-kpi-grid">
                        {production.dimensions.map((dim) => (
                          <div key={dim.dimension}>
                            <dt>
                              <Text tone="secondary">{dim.dimension}</Text>
                            </dt>
                            <dd>
                              <Badge kind={dimensionKind(dim.status)}>{dim.status}</Badge>
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {production.blockers.length > 0 ? (
                        <div>
                          <Heading level={4}>Activation blockers</Heading>
                          <ul>
                            {production.blockers.map((code) => (
                              <li key={code}>
                                <Text tone="secondary">{code}</Text>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <Text tone="secondary">No production blockers.</Text>
                      )}
                      <Heading level={4}>Requirement coverage</Heading>
                      <ul>
                        {production.requirement_coverage
                          .filter((row) => row.mandatory)
                          .slice(0, 12)
                          .map((row) => (
                            <li key={row.code}>
                              <Text tone="secondary">
                                {row.code} · {row.mandatory ? 'mandatory' : 'optional'} ·{' '}
                                {row.satisfied ? 'satisfied' : row.evidence_status ?? 'missing'}
                                {row.expires_at ? ` · expires ${row.expires_at.slice(0, 10)}` : ''}
                              </Text>
                            </li>
                          ))}
                      </ul>
                      <Heading level={4}>Evidence</Heading>
                      {evidence.length === 0 ? (
                        <Text tone="secondary">No evidence rows. Private object refs are never shown to customers/vendors.</Text>
                      ) : (
                        <ul>
                          {evidence.slice(0, 12).map((row) => (
                            <li key={row.id}>
                              <Text tone="secondary">
                                {row.requirement_code ?? 'unscoped'} · {row.status}
                                {row.expires_at ? ` · exp ${row.expires_at.slice(0, 10)}` : ''}
                                {row.verified_by_id ? ` · verifier ${row.verified_by_id.slice(0, 8)}` : ''}
                                {row.has_private_object_ref ? ' · private ref attached' : ''}
                              </Text>
                            </li>
                          ))}
                        </ul>
                      )}
                      {canActivate ? (
                        <div className="wp-toolbar wp-toolbar-wrap">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={actionBusy || production.production_lifecycle !== 'CONFIGURED'}
                            onClick={() => {
                              void (async () => {
                                const token = getAccessToken();
                                if (!token) return;
                                setActionBusy(true);
                                try {
                                  await transitionProductionLifecycle(token, detail.country_code, 'UNDER_REVIEW');
                                  await loadDetail(detail.country_code);
                                  setActionMessage('Moved to UNDER_REVIEW.');
                                } catch (err) {
                                  setActionMessage((err as Error).message ?? 'Lifecycle transition failed');
                                } finally {
                                  setActionBusy(false);
                                }
                              })();
                            }}
                          >
                            Start review
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={
                              actionBusy ||
                              production.production_lifecycle !== 'UNDER_REVIEW' ||
                              !production.production_ready
                            }
                            onClick={() => {
                              void (async () => {
                                const token = getAccessToken();
                                if (!token) return;
                                setActionBusy(true);
                                try {
                                  await transitionProductionLifecycle(
                                    token,
                                    detail.country_code,
                                    'READY_FOR_ACTIVATION',
                                  );
                                  await loadDetail(detail.country_code);
                                  setActionMessage('Marked READY_FOR_ACTIVATION.');
                                } catch (err) {
                                  setActionMessage((err as Error).message ?? 'Lifecycle transition failed');
                                } finally {
                                  setActionBusy(false);
                                }
                              })();
                            }}
                          >
                            Mark ready
                          </Button>
                          <Button
                            size="sm"
                            disabled={actionBusy || !production.activation_eligible || production.production_lifecycle === 'ACTIVE'}
                            onClick={() => {
                              void (async () => {
                                const token = getAccessToken();
                                if (!token) return;
                                setActionBusy(true);
                                try {
                                  const next = await activateProductionCountry(token, detail.country_code);
                                  setProduction(next);
                                  setActionMessage(
                                    'Production activated. Live PSP/OTP/carrier still require external owner gates.',
                                  );
                                  await loadDetail(detail.country_code);
                                } catch (err) {
                                  setActionMessage((err as Error).message ?? 'Production activation failed');
                                } finally {
                                  setActionBusy(false);
                                }
                              })();
                            }}
                          >
                            Activate Production
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={actionBusy || production.production_lifecycle !== 'ACTIVE'}
                            onClick={() => {
                              void (async () => {
                                const token = getAccessToken();
                                if (!token) return;
                                setActionBusy(true);
                                try {
                                  const next = await suspendProductionCountry(
                                    token,
                                    detail.country_code,
                                    'Emergency suspension from Main Admin',
                                  );
                                  setProduction(next);
                                  setActionMessage('Production suspended. Historical records remain readable.');
                                  await loadDetail(detail.country_code);
                                } catch (err) {
                                  setActionMessage((err as Error).message ?? 'Production suspend failed');
                                } finally {
                                  setActionBusy(false);
                                }
                              })();
                            }}
                          >
                            Suspend Production
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {actionMessage ? <Text tone="secondary">{actionMessage}</Text> : null}
                  <div className="wp-toolbar wp-toolbar-wrap">
                    {canActivate ? (
                      <>
                        <Button
                          size="sm"
                          disabled={actionBusy || detail.status === 'ACTIVE' || !detail.can_activate_sandbox}
                          onClick={() => {
                            void (async () => {
                              const token = getAccessToken();
                              if (!token) return;
                              setActionBusy(true);
                              setActionMessage(null);
                              try {
                                const next = await activateCountry(token, detail.country_code);
                                setDetail(next);
                                setActionMessage('Country activated for sandbox commerce. Live providers remain gated.');
                                await load();
                              } catch (err) {
                                setActionMessage((err as Error).message ?? 'Activation failed');
                              } finally {
                                setActionBusy(false);
                              }
                            })();
                          }}
                        >
                          Activate sandbox
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={actionBusy || detail.status === 'INACTIVE'}
                          onClick={() => {
                            void (async () => {
                              const token = getAccessToken();
                              if (!token) return;
                              setActionBusy(true);
                              setActionMessage(null);
                              try {
                                const next = await suspendCountry(token, detail.country_code);
                                setDetail(next);
                                setActionMessage('Country suspended. New policy-resolved commerce is blocked.');
                                await load();
                              } catch (err) {
                                setActionMessage((err as Error).message ?? 'Suspend failed');
                              } finally {
                                setActionBusy(false);
                              }
                            })();
                          }}
                        >
                          Suspend
                        </Button>
                      </>
                    ) : (
                      <Text tone="secondary">Activation requires policy:publish.</Text>
                    )}
                    {Object.entries(detail.links).map(([key, href]) => (
                      <Link key={key} href={href}>
                        <Button size="sm" variant="secondary">
                          {key.replaceAll('_', ' ')}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </Card>
              ) : !detailLoading ? (
                <EmptyState title="Select a country" description="Choose a market to inspect readiness and deep links." />
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState title="No countries configured" description="Seed sandbox countries or add markets in governance." />
        )
      ) : null}
    </div>
  );
}
