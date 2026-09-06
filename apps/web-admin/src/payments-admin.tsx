'use client';

import Link from 'next/link';
import { classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { persistAdminCountry, resolveAdminWorkingCountry } from './working-country';
import { MarketCountrySelect } from './market-country-select';
import { AdminDataTable } from './admin-data-table';
import {
  getPaymentProviderAudit,
  getPaymentObservability,
  getPaymentProviders,
  getPaymentRoutingMatrix,
  getProductionPaymentAvailability,
  getR14AGateConfig,
  listPaymentReconciliations,
  listPayments,
  listR14AGateRevisions,
  listUnknownPayments,
  updatePaymentProvider,
  updateR14AGate,
  verifyR14AGate,
  refundPayment,
  PaymentsAdminApiError,
  type PaymentProviderAuditRow,
  type PaymentObservabilityDetail,
  type PaymentAttemptHistory,
  type PaymentProviderConfigResponse,
  type PaymentRoutingMatrix,
  type PaymentSummary,
  type ProductionPaymentAvailability,
  type ReconReviewRow,
  type R14AGateConfigResponse,
  type R14AGateRevision,
} from './payments-admin-api';

type ViewState = 'loading' | 'idle' | 'forbidden' | 'network' | 'error';
type MatrixViewState = 'loading' | 'idle' | 'forbidden' | 'network' | 'error' | 'empty';

export function PaymentsAdminPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session, getAccessToken } = useSession();
  const countryCode = resolveAdminWorkingCountry({
    urlCountry: searchParams.get('country'),
    sessionCountry: session.countryCode,
  });
  const selectedId = searchParams.get('id');
  const [rows, setRows] = useState<PaymentSummary[]>([]);
  const [unknown, setUnknown] = useState<PaymentSummary[]>([]);
  const [detail, setDetail] = useState<PaymentObservabilityDetail | null>(null);
  const [matrix, setMatrix] = useState<PaymentRoutingMatrix | null>(null);
  const [gateConfig, setGateConfig] = useState<R14AGateConfigResponse | null>(null);
  const [providerConfig, setProviderConfig] = useState<PaymentProviderConfigResponse | null>(null);
  const [productionGate, setProductionGate] = useState<ProductionPaymentAvailability | null>(null);
  const [reconRows, setReconRows] = useState<ReconReviewRow[]>([]);
  const [matrixViewState, setMatrixViewState] = useState<MatrixViewState>('loading');
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [statusFilter, setStatusFilter] = useState('');
  const [gatewayFilter, setGatewayFilter] = useState('');

  const canRead = session.permissions.includes('payment:read');
  const canReconcile = session.permissions.includes('payment:reconcile');
  const canAdminPayments = session.permissions.includes('payment:admin');
  const canRefund = session.permissions.includes('payment:refund');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setViewState('forbidden');
      return;
    }
    if (!countryCode) {
      setRows([]);
      setUnknown([]);
      setDetail(null);
      setMatrix(null);
      setViewState('idle');
      setMatrixViewState('empty');
      return;
    }
    setViewState('loading');
    setMatrixViewState('loading');
    try {
      const [listBody, unknownBody, matrixBody, gatesBody, providersBody, prodBody, reconBody] =
        await Promise.all([
          listPayments(token, countryCode),
          canReconcile ? listUnknownPayments(token, countryCode) : Promise.resolve({ data: [] }),
          getPaymentRoutingMatrix(token, countryCode),
          getR14AGateConfig(token),
          getPaymentProviders(token),
          getProductionPaymentAvailability(token, countryCode).catch(() => null),
          canReconcile
            ? listPaymentReconciliations(token, { country_code: countryCode, limit: 25 }).catch(() => ({
                data: [] as ReconReviewRow[],
              }))
            : Promise.resolve({ data: [] as ReconReviewRow[] }),
        ]);
      let data = listBody.data ?? [];
      if (statusFilter) {
        data = data.filter((row) => row.status === statusFilter);
      }
      if (gatewayFilter.trim()) {
        data = data.filter((row) => row.gateway_code === gatewayFilter.trim());
      }
      setRows(data);
      setUnknown(unknownBody.data ?? []);
      setMatrix(matrixBody);
      setGateConfig(gatesBody);
      setProviderConfig(providersBody);
      setProductionGate(prodBody);
      setReconRows(reconBody.data ?? []);
      setMatrixViewState(matrixBody.rows.length || matrixBody.effective_fail_closed_reason ? 'idle' : 'empty');
      if (selectedId) {
        const obs = await getPaymentObservability(token, selectedId, countryCode);
        setDetail(obs);
      } else {
        setDetail(null);
      }
      setViewState('idle');
    } catch (err) {
      if (err instanceof PaymentsAdminApiError && err.status === 403) {
        setViewState('forbidden');
        setMatrixViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
      setMatrixViewState(classifyAdminViewState(err));
    }
  }, [canRead, canReconcile, countryCode, gatewayFilter, getAccessToken, selectedId, statusFilter]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (viewState === 'forbidden' || !canRead) {
    return <PermissionDeniedState />;
  }

  if (!countryCode) {
    return (
      <div className="wp-stack">
        <Heading level={1}>Payments</Heading>
        <EmptyState
          title="Select a country"
          description="Choose IN, AE, or US before loading country-scoped payment APIs."
        />
        <MarketCountrySelect
          ariaLabel="Payments country"
          value={countryCode}
          onChange={(iso) => {
            const next = persistAdminCountry(iso);
            router.replace(next ? `/payments?country=${next}` : '/payments');
          }}
        />
      </div>
    );
  }

  if (viewState === 'loading' && rows.length === 0 && !detail) {
    return <LoadingState label="Loading payments" />;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Payments (sandbox)</Heading>
        <p className="wp-page-intro">
          Enable or disable sandbox gateways. Live PSP onboarding is not available here. Intents show after checkout.
        </p>
      </header>
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />
      {productionGate ? (
        <Card>
          <Heading level={3}>Production payment rail</Heading>
          <Text tone="secondary">
            {productionGate.available ? 'AVAILABLE' : 'FAIL-CLOSED'} — {productionGate.message}
          </Text>
          <Text size="caption">
            Lifecycle {productionGate.country_production_lifecycle} · env {productionGate.environment} · live flag{' '}
            {String(productionGate.live_payments_enabled)} · R14-A {productionGate.r14a.live_production_status} (
            {productionGate.r14a.owner_evidenced_count}/7)
          </Text>
          <Text size="caption">
            PSP dependency:{' '}
            {productionGate.payment_dependency.present
              ? `${productionGate.payment_dependency.status ?? 'unknown'}${
                  productionGate.payment_dependency.external_gated ? ' (EXTERNAL_GATED)' : ''
                }`
              : 'missing'}
          </Text>
          {productionGate.blockers.length ? (
            <Text tone="secondary">Blockers: {productionGate.blockers.join(', ')}</Text>
          ) : null}
          <Text size="caption">Production payment never falls back to mock PSP.</Text>
        </Card>
      ) : null}
      {canReconcile ? (
        <Card>
          <Heading level={3}>Reconciliation review</Heading>
          <Text tone="secondary">Discrepancies are reviewable — never silently auto-fixed.</Text>
          {!reconRows.length ? (
            <Text tone="secondary">No reconciliation records for this country yet.</Text>
          ) : (
            <ul className="wp-mini-list">
              {reconRows.map((row) => (
                <li key={row.reconciliation_id}>
                  <Text size="caption">
                    {row.discrepancy} · {row.reconciliation_status}
                    {row.expected_amount_minor
                      ? ` · expect ${row.expected_amount_minor} ${row.expected_currency ?? ''}`
                      : ''}
                    {row.provider_amount_minor
                      ? ` · provider ${row.provider_amount_minor} ${row.provider_currency ?? ''}`
                      : ''}
                    {row.webhook_state ? ` · webhook ${row.webhook_state}` : ''}
                    {row.intent_id ? ` · intent ${row.intent_id.slice(0, 8)}` : ''}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      {providerConfig ? (
        <PaymentProviderConfigSection
          config={providerConfig}
          canAdmin={canAdminPayments}
          token={getAccessToken()}
          onUpdated={setProviderConfig}
        />
      ) : null}
      <div className="wp-toolbar">
        <MarketCountrySelect
          ariaLabel="Payments country"
          value={countryCode}
          allowEmpty={false}
          onChange={(iso) => {
            const next = persistAdminCountry(iso);
            const params = new URLSearchParams(searchParams.toString());
            if (next) {
              params.set('country', next);
            } else {
              params.delete('country');
            }
            router.replace(`/payments?${params.toString()}`);
          }}
        />
        <FormField label="Status filter">
          {({ id }) => (
            <Select id={id} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All</option>
              <option value="CAPTURED">CAPTURED</option>
              <option value="FAILED">FAILED</option>
              <option value="UNKNOWN">UNKNOWN</option>
              <option value="AUTHORIZED">AUTHORIZED</option>
            </Select>
          )}
        </FormField>
        <FormField label="Gateway">
          {({ id }) => (
            <Input
              id={id}
              value={gatewayFilter}
              onChange={(event) => setGatewayFilter(event.target.value)}
              placeholder="MOCK_PRIMARY"
            />
          )}
        </FormField>
        <Button onClick={() => void load()}>Refresh</Button>
      </div>

      {detail ? (
        <PaymentObservabilityDetailView
          detail={detail}
          countryCode={countryCode}
          canRefund={canRefund}
          token={getAccessToken()}
          onReload={() => void load()}
        />
      ) : null}

      <PaymentRoutingMatrixSection matrix={matrix} viewState={matrixViewState} onReload={() => void load()} />

      <Card>
        <Heading level={3}>Payment intents</Heading>
        {!rows.length ? (
          <EmptyState title="No payments" description="No sandbox payment intents match the current filters." />
        ) : (
          <AdminDataTable
            caption="Payment intents"
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              {
                id: 'intent',
                header: 'Intent',
                cell: (row) => (
                  <Link href={`/payments?country=${countryCode}&id=${row.id}`}>
                    {row.order_number ?? row.id} — {row.status} {row.currency} {row.amount_minor}{' '}
                    {row.gateway_code ? `(${row.gateway_code}/${row.gateway_environment})` : ''}
                    {row.failure_classification ? ` — ${row.failure_classification}` : ''}
                  </Link>
                ),
              },
            ]}
          />
        )}
      </Card>

      {canReconcile ? (
        <Card>
          <Heading level={3}>UNKNOWN queue ({unknown.length})</Heading>
          {!unknown.length ? (
            <EmptyState title="Queue empty" description="No payments in UNKNOWN status for this country." />
          ) : (
            <ul>
              {unknown.map((row) => (
                <li key={row.id}>
                  <Link href={`/payments?country=${countryCode}&id=${row.id}`}>
                    {row.id} — {row.failure_classification ?? 'unknown_state'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      {gateConfig ? (
        <R14AGateConfigSection
          config={gateConfig}
          canAdmin={canAdminPayments}
          token={getAccessToken()}
          onUpdated={setGateConfig}
        />
      ) : null}
    </section>
  );
}

const GATE_HINTS: Record<string, string> = {
  NAMED_PSP: 'Legal vendor name and memo/reference. Do not invent a PSP.',
  PRODUCTION_COUNTRY: 'Owner-approved ISO 3166-1 alpha-2 only. Do not assume India until owners decide.',
  LEGAL_ENTITY: 'Contracting legal entity and jurisdiction reference. Do not invent an entity name.',
  MERCHANT_OF_RECORD: 'Owner/legal model (platform, facilitator, or vendor-as-seller) and OD-PAY-01 reference.',
  PSP_CONTRACT: 'Signed contract ID or DMS reference — never paste the PDF.',
  VAULT_PATH: 'Production credential-manager path only — never paste API keys or certificates.',
  PCI_SAQ: 'Applicable SAQ type and attestation/reference ID. Engineering controls are not PCI evidence.',
};

function workflowBadgeKind(status: string): 'pending' | 'warning' | 'verified' {
  if (status === 'OWNER_EVIDENCED') {
    return 'verified';
  }
  if (status === 'PENDING') {
    return 'pending';
  }
  return 'warning';
}

function R14AGateConfigSection({
  config,
  canAdmin,
  token,
  onUpdated,
}: {
  config: R14AGateConfigResponse;
  canAdmin: boolean;
  token: string | null;
  onUpdated: (next: R14AGateConfigResponse) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { value: string; evidence_ref: string }>>(() =>
    Object.fromEntries(
      (config.gates ?? []).map((gate) => [gate.gate_code, { value: gate.value, evidence_ref: gate.evidence_ref ?? '' }]),
    ),
  );
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisionsByCode, setRevisionsByCode] = useState<Record<string, R14AGateRevision[]>>({});

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        (config.gates ?? []).map((gate) => [gate.gate_code, { value: gate.value, evidence_ref: gate.evidence_ref ?? '' }]),
      ),
    );
  }, [config]);

  const failMessage = (err: unknown, fallback: string) => {
    if (err instanceof PaymentsAdminApiError && err.code === 'PLACEHOLDER_NOT_OWNER_EVIDENCE') {
      return 'Placeholder/DEV/DEMO values cannot be verified as owner evidence.';
    }
    if (err instanceof PaymentsAdminApiError && err.code === 'DUAL_CONTROL_REQUIRED') {
      return 'A different authorized reviewer must verify this gate.';
    }
    if (err instanceof PaymentsAdminApiError && err.code === 'SECRET_VALUE_FORBIDDEN') {
      return 'Secret values, API keys, PAN/CVV, and certificates are forbidden.';
    }
    if (err instanceof PaymentsAdminApiError && err.code === 'DOCUMENT_PAYLOAD_FORBIDDEN') {
      return 'Contract PDFs cannot be stored. Record a reference ID only.';
    }
    return fallback;
  };

  const save = async (gateCode: string) => {
    if (!token || !canAdmin) {
      return;
    }
    const draft = drafts[gateCode];
    if (!draft?.value.trim()) {
      setError('Value is required.');
      return;
    }
    setBusyCode(gateCode);
    setError(null);
    try {
      const next = await updateR14AGate(token, gateCode, {
        value: draft.value.trim(),
        evidence_ref: draft.evidence_ref.trim() || null,
      });
      onUpdated(next);
    } catch (err) {
      setError(failMessage(err, 'Unable to save gate evidence.'));
    } finally {
      setBusyCode(null);
    }
  };

  const verify = async (gateCode: string) => {
    if (!token || !canAdmin) {
      return;
    }
    const draft = drafts[gateCode];
    const evidenceRef = draft?.evidence_ref.trim();
    if (!evidenceRef) {
      setError('evidence_ref is required to verify.');
      return;
    }
    setBusyCode(gateCode);
    setError(null);
    try {
      const next = await verifyR14AGate(token, gateCode, { evidence_ref: evidenceRef });
      onUpdated(next);
    } catch (err) {
      setError(failMessage(err, 'Unable to verify gate evidence.'));
    } finally {
      setBusyCode(null);
    }
  };

  const loadRevisions = async (gateCode: string) => {
    if (!token) {
      return;
    }
    setBusyCode(gateCode);
    setError(null);
    try {
      const body = await listR14AGateRevisions(token, gateCode);
      setRevisionsByCode((current) => ({ ...current, [gateCode]: body.data }));
    } catch {
      setError('Unable to load revision history.');
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <Card>
      <Heading level={3}>R14-A gate configuration</Heading>
      <Text tone="secondary">
        {config.readiness_status} — {config.next_required_action}. Engineering {config.engineering_config_status}. Live
        remains {config.live_production_status} ({String(config.live_payment_enabled)}). Book-263 production evidence:{' '}
        {config.book_263_production_evidence}. {config.owner_evidenced_count}/7 OWNER_EVIDENCED. Recording or verifying
        gates does not enable live payments.
      </Text>
      <ul>
        { (config.gates ?? []).map((gate) => {
          const draft = drafts[gate.gate_code] ?? { value: '', evidence_ref: '' };
          const revisions = revisionsByCode[gate.gate_code];
          return (
            <li key={gate.gate_code}>
              <Text>
                {gate.gate_code}: {gate.value} ({gate.evidence_class}
                {gate.placeholder ? ', PLACEHOLDER' : ''})
              </Text>
              <Badge kind={workflowBadgeKind(gate.workflow_status)}>{gate.workflow_status}</Badge>
              <Text tone="secondary">{GATE_HINTS[gate.gate_code]}</Text>
              <Text tone="secondary">
                evidence_ref {gate.evidence_ref ?? 'none'} — updated {gate.updated_at}
                {gate.updated_by_person_id ? ` by ${gate.updated_by_person_id}` : ''}
                {gate.verified_at
                  ? ` — verified ${gate.verified_at}${gate.verified_by_person_id ? ` by ${gate.verified_by_person_id}` : ''}`
                  : ''}
              </Text>
              {canAdmin ? (
                <span className="wp-stack">
                  <FormField label={`${gate.gate_code} value`}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={draft.value}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [gate.gate_code]: { ...draft, value: event.target.value },
                          }))
                        }
                        aria-label={`${gate.gate_code} value`}
                      />
                    )}
                  </FormField>
                  <FormField label={`${gate.gate_code} evidence_ref`}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={draft.evidence_ref}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [gate.gate_code]: { ...draft, evidence_ref: event.target.value },
                          }))
                        }
                        aria-label={`${gate.gate_code} evidence_ref`}
                      />
                    )}
                  </FormField>
                  <Button disabled={busyCode === gate.gate_code} onClick={() => void save(gate.gate_code)}>
                    Save {gate.gate_code}
                  </Button>
                  {gate.workflow_status === 'PENDING' ? (
                    <Button disabled={busyCode === gate.gate_code} onClick={() => void verify(gate.gate_code)}>
                      Verify {gate.gate_code}
                    </Button>
                  ) : null}
                </span>
              ) : null}
              <Button disabled={busyCode === gate.gate_code} onClick={() => void loadRevisions(gate.gate_code)}>
                Revisions {gate.gate_code}
              </Button>
              {revisions?.length ? (
                <ul>
                  {revisions.map((row) => (
                    <li key={row.id}>
                      {row.created_at} {row.action} {row.previous_evidence_class}→{row.new_evidence_class} by{' '}
                      {row.actor_person_id}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <Text tone="secondary">{error}</Text> : null}
    </Card>
  );
}

function PaymentProviderConfigSection({
  config,
  canAdmin,
  token,
  onUpdated,
}: {
  config: PaymentProviderConfigResponse;
  canAdmin: boolean;
  token: string | null;
  onUpdated: (next: PaymentProviderConfigResponse) => void;
}) {
  const [priorityByCode, setPriorityByCode] = useState<Record<string, string>>(() =>
    Object.fromEntries(config.providers.map((row) => [row.code, String(row.priority)])),
  );
  const [accountByCode, setAccountByCode] = useState<
    Record<string, { countries: string; currencies: string; methods: string; vaultPath: string }>
  >(() =>
    Object.fromEntries(
      config.providers.map((row) => [
        row.code,
        {
          countries: row.accounts[0]?.countries_csv ?? '*',
          currencies: row.accounts[0]?.currencies_csv ?? '*',
          methods: row.accounts[0]?.methods_csv ?? '',
          vaultPath: '',
        },
      ]),
    ),
  );
  const [auditByCode, setAuditByCode] = useState<Record<string, PaymentProviderAuditRow[]>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const accountByCodeRef = useRef(accountByCode);
  accountByCodeRef.current = accountByCode;
  const priorityByCodeRef = useRef(priorityByCode);
  priorityByCodeRef.current = priorityByCode;

  useEffect(() => {
    setPriorityByCode(Object.fromEntries(config.providers.map((row) => [row.code, String(row.priority)])));
  }, [config]);

  const save = async (code: string, active: boolean) => {
    if (!token || !canAdmin) {
      return;
    }
    const parsed = Number(priorityByCodeRef.current[code]);
    if (!Number.isInteger(parsed)) {
      setSaveError('Priority must be an integer.');
      return;
    }
    const account = accountByCodeRef.current[code];
    setSavingCode(code);
    setSaveError(null);
    try {
      const next = await updatePaymentProvider(token, code, {
        active,
        priority: parsed,
        ...(account
          ? {
              account: {
                countries_csv: account.countries,
                currencies_csv: account.currencies,
                methods_csv: account.methods,
                ...(account.vaultPath.trim() ? { vault_path: account.vaultPath.trim() } : {}),
              },
            }
          : {}),
      });
      const saved = next.providers.find((row) => row.code === code);
      setAccountByCode((current) => ({
        ...current,
        [code]: {
          countries: saved?.accounts[0]?.countries_csv ?? account?.countries ?? '*',
          currencies: saved?.accounts[0]?.currencies_csv ?? account?.currencies ?? '*',
          methods: saved?.accounts[0]?.methods_csv ?? account?.methods ?? '',
          vaultPath: '',
        },
      }));
      onUpdated(next);
    } catch {
      setSaveError('Unable to save provider configuration.');
    } finally {
      setSavingCode(null);
    }
  };

  const loadAudit = async (code: string) => {
    if (!token) {
      return;
    }
    setSaveError(null);
    try {
      const body = await getPaymentProviderAudit(token, code);
      setAuditByCode((current) => ({ ...current, [code]: body.data }));
    } catch {
      setSaveError('Unable to load provider audit.');
    }
  };

  return (
    <Card>
      <Heading level={3}>Payment provider configuration</Heading>
      <Text tone="secondary">
        Sandbox adapters only. Enable, disable, or change priority. Live payments remain blocked (
        {config.live_production_status}
        {config.live_unlock_blocked_reason ? ` — ${config.live_unlock_blocked_reason}` : ''}). Credential paths are
        write-only.
      </Text>
      {!config.providers.length ? (
        <EmptyState title="No providers" description="No catalog rows exist yet." />
      ) : (
        <ul className="wp-provider-list">
          {config.providers.map((row) => (
            <li key={row.code}>
              <strong>
                {row.code} — {row.name}
              </strong>
              <p className="wp-text-muted">
                {row.environment} · {row.active ? 'active' : 'inactive'} · priority {row.priority}
                {row.registry_registered ? ' · adapter registered' : ' · adapter missing'}
                {row.accounts[0] ? ` · countries ${row.accounts[0].countries_csv}` : ''}
              </p>
              {canAdmin ? (
                <div className="wp-form-grid">
                  <FormField label={`Priority ${row.code}`}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={priorityByCode[row.code] ?? String(row.priority)}
                        onChange={(event) =>
                          setPriorityByCode((current) => ({ ...current, [row.code]: event.target.value }))
                        }
                        aria-label={`Priority ${row.code}`}
                      />
                    )}
                  </FormField>
                  <FormField label={`Countries ${row.code}`} hint="* or comma-separated ISO2.">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={accountByCode[row.code]?.countries ?? ''}
                        onChange={(event) =>
                          setAccountByCode((current) => ({
                            ...current,
                            [row.code]: {
                              countries: event.target.value,
                              currencies: current[row.code]?.currencies ?? '*',
                              methods: current[row.code]?.methods ?? '',
                              vaultPath: current[row.code]?.vaultPath ?? '',
                            },
                          }))
                        }
                        aria-label={`Countries ${row.code}`}
                      />
                    )}
                  </FormField>
                  <FormField label={`Currencies ${row.code}`} hint="* or comma-separated ISO-4217.">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={accountByCode[row.code]?.currencies ?? ''}
                        onChange={(event) =>
                          setAccountByCode((current) => ({
                            ...current,
                            [row.code]: {
                              countries: current[row.code]?.countries ?? '*',
                              currencies: event.target.value,
                              methods: current[row.code]?.methods ?? '',
                              vaultPath: current[row.code]?.vaultPath ?? '',
                            },
                          }))
                        }
                        aria-label={`Currencies ${row.code}`}
                      />
                    )}
                  </FormField>
                  <FormField label={`Methods ${row.code}`} hint="Registered payment-method families only.">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={accountByCode[row.code]?.methods ?? ''}
                        onChange={(event) =>
                          setAccountByCode((current) => ({
                            ...current,
                            [row.code]: {
                              countries: current[row.code]?.countries ?? '*',
                              currencies: current[row.code]?.currencies ?? '*',
                              methods: event.target.value,
                              vaultPath: current[row.code]?.vaultPath ?? '',
                            },
                          }))
                        }
                        aria-label={`Methods ${row.code}`}
                      />
                    )}
                  </FormField>
                  <FormField
                    label={`Vault path ${row.code}`}
                    hint="Write-only env:NAME or vault:path. Leave empty to keep the current path. Never displayed."
                  >
                    {({ id }) => (
                      <Input
                        id={id}
                        value={accountByCode[row.code]?.vaultPath ?? ''}
                        onChange={(event) =>
                          setAccountByCode((current) => ({
                            ...current,
                            [row.code]: {
                              countries: current[row.code]?.countries ?? '*',
                              currencies: current[row.code]?.currencies ?? '*',
                              methods: current[row.code]?.methods ?? '',
                              vaultPath: event.target.value,
                            },
                          }))
                        }
                        aria-label={`Vault path ${row.code}`}
                        autoComplete="off"
                      />
                    )}
                  </FormField>
                  <div className="wp-form-actions">
                    <Button disabled={savingCode === row.code} onClick={() => void save(row.code, row.active)}>
                      Save {row.code}
                    </Button>
                    <Button disabled={savingCode === row.code} onClick={() => void save(row.code, !row.active)}>
                      {row.active ? `Disable ${row.code}` : `Enable ${row.code}`}
                    </Button>
                  </div>
                </div>
              ) : null}
              <Button disabled={!token} onClick={() => void loadAudit(row.code)}>
                Audit {row.code}
              </Button>
              {auditByCode[row.code]?.length ? (
                <ul>
                  {auditByCode[row.code]!.map((entry) => (
                    <li key={entry.id}>
                      {entry.actor_person_id ?? 'system'} — {entry.created_at} — {entry.outcome}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {saveError ? <Text tone="secondary">{saveError}</Text> : null}
    </Card>
  );
}

function PaymentRoutingMatrixSection({
  matrix,
  viewState,
  onReload,
}: {
  matrix: PaymentRoutingMatrix | null;
  viewState: MatrixViewState;
  onReload: () => void;
}) {
  if (viewState === 'forbidden') {
    return null;
  }
  if (viewState === 'loading' && !matrix) {
    return (
      <Card>
        <Heading level={3}>Routing matrix</Heading>
        <LoadingState label="Loading routing matrix" />
      </Card>
    );
  }
  if ((viewState === 'network' || viewState === 'error') && !matrix) {
    return (
      <Card>
        <Heading level={3}>Routing matrix</Heading>
        <AdminViewLoadError viewState={viewState} onRetry={onReload} />
      </Card>
    );
  }
  if (!matrix) {
    return null;
  }

  return (
    <Card>
      <Heading level={3}>Routing matrix (read-only)</Heading>
      <Text tone="secondary">
        Sandbox effective routes only. Production preview remains inactive while live payments are disabled.
      </Text>
      <Text>
        Active environment: {matrix.active_environment} · Live enabled: {String(matrix.live_payments_enabled)} · Policy:{' '}
        {matrix.policy_source}
      </Text>
      {matrix.effective_route ? (
        <Text>
          Effective route: {matrix.effective_route.gateway_code}/{matrix.effective_route.gateway_environment} (priority{' '}
          {matrix.effective_route.priority})
        </Text>
      ) : (
        <Text tone="secondary">
          No active route{matrix.effective_fail_closed_reason ? ` — ${matrix.effective_fail_closed_reason}` : ''}
        </Text>
      )}
      {!matrix.rows?.length ? (
        <EmptyState title="No routing rows" description="No sandbox routing rows match the current policy context." />
      ) : (
        <ul>
          {matrix.rows.map((row) => (
            <li key={`${row.gateway_code}:${row.gateway_environment}`}>
              {row.gateway_code}/{row.gateway_environment} — priority {row.priority} — {row.status}
              {row.fail_closed_reason ? ` — ${row.fail_closed_reason}` : ''}
              {row.capabilities.length ? ` — capabilities: ${row.capabilities.join(', ')}` : ''}
            </li>
          ))}
        </ul>
      )}
      <Heading level={4}>Production preview (inactive)</Heading>
      <Text tone="secondary">{matrix.production_preview.fail_closed_reason}</Text>
      {!matrix.production_preview.rows?.length ? (
        <Text tone="secondary">No production preview rows.</Text>
      ) : (
        <ul>
          {matrix.production_preview.rows.map((row) => (
            <li key={`prod-${row.gateway_code}:${row.gateway_environment}`}>
              {row.gateway_code}/{row.gateway_environment} — {row.status}
              {row.fail_closed_reason ? ` — ${row.fail_closed_reason}` : ''}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PaymentAttemptHistorySection({
  history,
  payment,
}: {
  history: PaymentAttemptHistory | undefined;
  payment: PaymentSummary;
}) {
  if (!history) {
    return (
      <>
        <Heading level={4}>Gateway attempts</Heading>
        <Text tone="secondary">Attempt history was not returned for this payment. Reload to try again.</Text>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </>
    );
  }
  if (!history.attempts.length) {
    return (
      <>
        <Heading level={4}>Gateway attempts</Heading>
        <EmptyState title="No attempts" description="No gateway submit attempts recorded for this payment." />
      </>
    );
  }
  return (
    <>
      <Heading level={4}>Gateway attempts</Heading>
      <Text tone="secondary">
        Final gateway: {history.final_selected_gateway ?? payment.gateway_code ?? 'none'}
        {history.fallback_occurred ? ' · Fallback used' : ' · Primary only'}
      </Text>
      <ul>
        {history.attempts.map((attempt) => (
          <li key={attempt.id}>
            #{attempt.attempt_number} {attempt.gateway_code}/{attempt.gateway_environment} — {attempt.outcome}
            {attempt.failure_classification ? ` — ${attempt.failure_classification}` : ''}
            {attempt.failure_outcome ? ` — ${attempt.failure_outcome}` : ''}
            {attempt.selected ? ' (selected)' : ''}
            {attempt.created_at ? ` — ${attempt.created_at}` : ''}
          </li>
        ))}
      </ul>
    </>
  );
}

function PaymentObservabilityDetailView({
  detail,
  countryCode,
  canRefund,
  token,
  onReload,
}: {
  detail: PaymentObservabilityDetail;
  countryCode: string;
  canRefund: boolean;
  token: string | null;
  onReload: () => void;
}) {
  const payment = detail.payment;
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);

  return (
    <Card>
      <Heading level={3}>Payment detail</Heading>
      <Text>
        {payment.order_number ?? payment.id} — {payment.status} — {payment.gateway_code}/{payment.gateway_environment}
      </Text>
      {payment.failure_classification ? <Text tone="secondary">Failure: {payment.failure_classification}</Text> : null}
      {payment.failure_outcome ? <Text tone="secondary">Outcome: {payment.failure_outcome}</Text> : null}
      {payment.last_reconciliation_break ? (
        <Text tone="secondary">Reconciliation break: {payment.last_reconciliation_break}</Text>
      ) : null}
      <Text tone="secondary">
        Order: {payment.order_number ?? 'none'} · Country: {payment.country_code} · Sandbox: {String(payment.sandbox)} ·
        Amount: {payment.amount_minor ?? '—'} {payment.currency ?? ''}
      </Text>
      <Heading level={4}>Refunds</Heading>
      {!detail.refunds?.length ? (
        <Text tone="secondary">No refunds recorded.</Text>
      ) : (
        <ul>
          {detail.refunds.map((row) => (
            <li key={row.id}>
              {row.status} — {row.amount_minor} {row.currency}
            </li>
          ))}
        </ul>
      )}
      {canRefund && payment.status === 'CAPTURED' ? (
        <div className="wp-stack" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button
            size="sm"
            disabled={refundBusy || !token}
            onClick={() => {
              if (!token) {
                return;
              }
              setRefundBusy(true);
              setRefundError(null);
              void refundPayment(token, payment.id, `admin-refund-${payment.id}-${Date.now()}`)
                .then(() => onReload())
                .catch((err: Error) => setRefundError(err.message))
                .finally(() => setRefundBusy(false));
            }}
          >
            Full refund (authorized)
          </Button>
          {refundError ? <Text tone="secondary">{refundError}</Text> : null}
        </div>
      ) : null}
      <Button onClick={onReload}>Reload detail</Button>
      <PaymentAttemptHistorySection history={detail.attempt_history} payment={detail.payment} />
      <Heading level={4}>Webhook health</Heading>
      {!detail.webhooks.length ? (
        <EmptyState title="No webhook events" description="No webhook events recorded for this gateway window." />
      ) : (
        <ul>
          {detail.webhooks.map((hook) => (
            <li key={hook.id}>
              {hook.provider_event_id} — {hook.processing_status}
              {hook.rejection_reason ? ` (${hook.rejection_reason})` : ''} — {hook.event_type}
            </li>
          ))}
        </ul>
      )}
      <Heading level={4}>Reconciliation</Heading>
      {!detail.reconciliations.length ? (
        <Text tone="secondary">No reconciliation records yet.</Text>
      ) : (
        <ul>
          {detail.reconciliations.map((row) => (
            <li key={row.id}>
              {row.status} {row.break_type ? `— ${row.break_type}` : ''} — {row.detail}
            </li>
          ))}
        </ul>
      )}
      <Heading level={4}>Audit timeline</Heading>
      {!detail.audit_timeline.length ? (
        <EmptyState title="No audit events" description="Lifecycle events will appear here." />
      ) : (
        <ul>
          {detail.audit_timeline.map((entry) => (
            <li key={`${entry.source}-${entry.id}`}>
              {entry.occurred_at} — {entry.source}/{entry.type}
            </li>
          ))}
        </ul>
      )}
      <Link href={`/payments?country=${countryCode}`}>Back to list</Link>
    </Card>
  );
}
