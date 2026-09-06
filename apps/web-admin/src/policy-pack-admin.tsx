'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
  Switch,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import {
  PolicyPackAdminApiError,
  applyOperatorToDocument,
  createPolicyPackDraft,
  getPolicyPack,
  getPolicyPackDiff,
  listPolicyPacks,
  publishPolicyPack,
  rollbackPolicyPack,
  toggleOperatorGateway,
  toggleOperatorMethod,
  validatePolicyPackDocument,
  type PolicyDiffEntry,
  type PolicyOperatorView,
  type PolicyPackDetail,
  type PolicyPackListResponse,
  type PolicyPackVersion,
} from './policy-pack-admin-api';
import { adminApiRoot, adminAuthHeaders, classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { workingCountry } from './working-country';

const DEFAULT_COMMERCE: PolicyOperatorView['commerce'] = {
  platform_fee_bps: 0,
  platform_fee_flat_minor: 0,
  delivery_fee_minor: 0,
  packaging_fee_minor: 0,
  handling_fee_minor: 0,
  payment_convenience_fee_minor: 0,
  free_delivery_threshold_minor: null,
  carrier_cost_estimate_minor: 0,
};

function operatorWithCommerceDefaults(next: PolicyOperatorView): PolicyOperatorView {
  return {
    ...next,
    commerce: next.commerce ?? DEFAULT_COMMERCE,
  };
}

type ViewState = 'loading' | 'idle' | 'forbidden' | 'network' | 'error';
type EditorStatus = 'Draft' | 'Validated' | 'Published' | 'Rollback';

function statusKind(status: string): 'info' | 'pending' | 'success' | 'warning' {
  if (status === 'PUBLISHED' || status === 'Validated') {
    return 'success';
  }
  if (status === 'DRAFT' || status === 'Draft') {
    return 'pending';
  }
  if (status === 'SUPERSEDED' || status === 'Rollback') {
    return 'warning';
  }
  return 'info';
}

function dumpValue(value: unknown): string {
  if (value == null || value === '') {
    return '—';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export function PolicyPackOperatorPanel() {
  const { session, getAccessToken } = useSession();
  const canRead = session.permissions.includes('policy:read');
  const canPublish = session.permissions.includes('policy:publish');
  const [country, setCountry] = useState(() => workingCountry(session.countryCode));
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [list, setList] = useState<PolicyPackListResponse | null>(null);
  const [published, setPublished] = useState<PolicyPackDetail | null>(null);
  const [draft, setDraft] = useState<PolicyPackDetail | null>(null);
  const [operator, setOperator] = useState<PolicyOperatorView | null>(null);
  const [baseDocument, setBaseDocument] = useState<Record<string, unknown> | null>(null);
  const [editorStatus, setEditorStatus] = useState<EditorStatus>('Draft');
  const [diff, setDiff] = useState<PolicyDiffEntry[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dualControl, setDualControl] = useState(false);
  const [currenciesText, setCurrenciesText] = useState('');
  const [taxProfileId, setTaxProfileId] = useState('');
  const [defaultLocale, setDefaultLocale] = useState('');
  const [localesText, setLocalesText] = useState('');
  const [catalogCurrencyDefault, setCatalogCurrencyDefault] = useState('');
  const [catalogCurrencyAllowed, setCatalogCurrencyAllowed] = useState('');
  const [timezoneDefault, setTimezoneDefault] = useState('');
  const [ledgerLegalEntityId, setLedgerLegalEntityId] = useState('');
  const [legalEntities, setLegalEntities] = useState<Array<{ id: string; label: string }>>([]);
  const [ledgerAccountingCurrency, setLedgerAccountingCurrency] = useState('');
  const [platformFeeBps, setPlatformFeeBps] = useState('0');
  const [platformFeeFlatMinor, setPlatformFeeFlatMinor] = useState('0');
  const [deliveryFeeMinor, setDeliveryFeeMinor] = useState('0');
  const [packagingFeeMinor, setPackagingFeeMinor] = useState('0');
  const [handlingFeeMinor, setHandlingFeeMinor] = useState('0');
  const [paymentFeeMinor, setPaymentFeeMinor] = useState('0');
  const [freeDeliveryThresholdMinor, setFreeDeliveryThresholdMinor] = useState('');
  const [carrierCostEstimateMinor, setCarrierCostEstimateMinor] = useState('0');

  const hydrateOperatorForm = useCallback((next: PolicyOperatorView) => {
    const normalized = operatorWithCommerceDefaults(next);
    setCurrenciesText(normalized.payments.currencies.join(','));
    setTaxProfileId(normalized.tax_profile_id ?? '');
    setDefaultLocale(normalized.i18n.default_locale);
    setLocalesText(normalized.i18n.locales.join(','));
    setCatalogCurrencyDefault(normalized.currency.default);
    setCatalogCurrencyAllowed(normalized.currency.allowed.join(','));
    setTimezoneDefault(normalized.timezone_default);
    setLedgerLegalEntityId(normalized.ledger_legal_entity_id ?? '');
    setLedgerAccountingCurrency(normalized.ledger_accounting_currency ?? '');
    setPlatformFeeBps(String(normalized.commerce.platform_fee_bps));
    setPlatformFeeFlatMinor(String(normalized.commerce.platform_fee_flat_minor));
    setDeliveryFeeMinor(String(normalized.commerce.delivery_fee_minor));
    setPackagingFeeMinor(String(normalized.commerce.packaging_fee_minor));
    setHandlingFeeMinor(String(normalized.commerce.handling_fee_minor));
    setPaymentFeeMinor(String(normalized.commerce.payment_convenience_fee_minor));
    setFreeDeliveryThresholdMinor(
      normalized.commerce.free_delivery_threshold_minor == null
        ? ''
        : String(normalized.commerce.free_delivery_threshold_minor),
    );
    setCarrierCostEstimateMinor(String(normalized.commerce.carrier_cost_estimate_minor));
  }, []);

  const load = useCallback(async (iso = country, opts?: { keepEditor?: boolean }) => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setViewState('forbidden');
      return;
    }
    setViewState('loading');
    try {
      const code = iso.trim().toUpperCase();
      const body = await listPolicyPacks(token, code);
      setList(body);
      const leRes = await fetch(`${adminApiRoot()}/api/v1/admin/governance/legal-entities`, {
        headers: adminAuthHeaders(token),
      });
      if (leRes.ok) {
        const leBody = (await leRes.json()) as { data?: Array<Record<string, unknown>> };
        setLegalEntities(
          (leBody.data ?? []).map((row, index) => ({
            id: String(row.id ?? `le-${index}`),
            label: String(row.code ?? row.displayName ?? row.display_name ?? row.id ?? `entity-${index}`),
          })),
        );
      }
      if (body.published_id) {
        const pack = await getPolicyPack(token, body.published_id);
        setPublished(pack);
        if (!opts?.keepEditor) {
          setBaseDocument(pack.document);
          setOperator(operatorWithCommerceDefaults(pack.operator));
          setEditorStatus('Published');
          hydrateOperatorForm(pack.operator);
          setDualControl(pack.dual_control_required);
          setDraft(null);
          setDiff([]);
        }
      } else if (!opts?.keepEditor) {
        setPublished(null);
        setBaseDocument(null);
        setOperator(operatorWithCommerceDefaults(body.baseline_operator));
        setEditorStatus('Draft');
        hydrateOperatorForm(body.baseline_operator);
        setDraft(null);
        setDiff([]);
      }
      if (!opts?.keepEditor) {
        setMessage('');
      }
      setViewState('idle');
    } catch (err) {
      if (err instanceof PolicyPackAdminApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [canRead, country, getAccessToken, hydrateOperatorForm]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load('XX');
    }
  }, [session.audience, session.status]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }
  if (viewState === 'forbidden' || !canRead) {
    return <PermissionDeniedState />;
  }
  if (viewState === 'loading' && !list) {
    return <LoadingState label="Loading country policy packs" />;
  }
  if ((viewState === 'network' || viewState === 'error') && !list) {
    return <AdminViewLoadError viewState={viewState} onRetry={() => void load(country)} />;
  }

  const catalog = list;
  const workingDocument = baseDocument ?? published?.document ?? null;

  function syncOperator(next: PolicyOperatorView) {
    const normalized = operatorWithCommerceDefaults(next);
    setOperator(normalized);
    setEditorStatus('Draft');
    hydrateOperatorForm(normalized);
  }

  function composedOperator(current: PolicyOperatorView): PolicyOperatorView {
    const locales = localesText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const allowed = catalogCurrencyAllowed
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    const defaultCurrency = catalogCurrencyDefault.trim().toUpperCase();
    return {
      ...current,
      i18n: {
        default_locale: defaultLocale.trim() || current.i18n.default_locale,
        locales: locales.length ? locales : current.i18n.locales,
      },
      currency: {
        default: defaultCurrency || current.currency.default,
        allowed: allowed.length ? allowed : current.currency.allowed,
      },
      timezone_default: timezoneDefault.trim() || current.timezone_default,
      tax_profile_id: taxProfileId.trim() || null,
      ledger_legal_entity_id: ledgerLegalEntityId.trim() || null,
      ledger_accounting_currency: ledgerAccountingCurrency.trim().toUpperCase() || null,
      payments: {
        ...current.payments,
        currencies: currenciesText
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean),
      },
      commerce: {
        platform_fee_bps: Number(platformFeeBps) || 0,
        platform_fee_flat_minor: Number(platformFeeFlatMinor) || 0,
        delivery_fee_minor: Number(deliveryFeeMinor) || 0,
        packaging_fee_minor: Number(packagingFeeMinor) || 0,
        handling_fee_minor: Number(handlingFeeMinor) || 0,
        payment_convenience_fee_minor: Number(paymentFeeMinor) || 0,
        free_delivery_threshold_minor: freeDeliveryThresholdMinor.trim()
          ? Number(freeDeliveryThresholdMinor)
          : null,
        carrier_cost_estimate_minor: Number(carrierCostEstimateMinor) || 0,
      },
    };
  }

  async function run(action: () => Promise<void>) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof PolicyPackAdminApiError ? err.message : 'request_failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Country policy pack</Heading>
        <p className="wp-page-intro">
          Structured Country Policy Pack operator. Toggle pharmacy/marketplace off to stop selling in that country,
          then Validate + Publish. This cannot turn on live PSP secrets.
        </p>
      </header>
      <Card>
        <Badge kind={list?.live_payment_enabled ? 'error' : 'info'}>
          Live payments {list?.live_payment_enabled ? 'on' : 'off'} — not controllable here
        </Badge>
        <Text tone="secondary">{list?.live_unlock_note}</Text>
      </Card>

      <Card>
        <FormField label="Country ISO2" hint="Existing country records only. Do not treat test codes as production evidence.">
          {({ id }) => (
            <Input
              id={id}
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={2}
            />
          )}
        </FormField>
        <Button onClick={() => void load(country)} disabled={busy}>
          Load packs
        </Button>
      </Card>

      <Card>
        <Heading level={3}>Versions</Heading>
        <Badge kind={statusKind(editorStatus)}>{editorStatus}</Badge>
        {list && list.data.length > 0 ? (
          <Table
            caption="Policy pack versions"
            columns={['Version', 'Status', 'Published', 'Id']}
            rows={list.data.map((row: PolicyPackVersion) => [
              String(row.version),
              row.status,
              row.published_at ?? '—',
              row.id.slice(0, 8),
            ])}
          />
        ) : (
          <EmptyState title="No packs" description="Load an existing country to list pack versions." />
        )}
      </Card>

      {published ? (
        <Card>
          <Heading level={3}>Published pack</Heading>
          <Text>
            v{published.version} — payments {published.operator.payments.enabled ? 'enabled' : 'disabled'}, gateways{' '}
            {published.operator.payments.gateway_refs.join(', ') || 'none'}, tax profile{' '}
            {published.operator.tax_profile_id ?? 'none'}
          </Text>
        </Card>
      ) : null}

      {operator && catalog ? (
        <Card>
          <Heading level={3}>Structured editor</Heading>
          <Text tone="secondary">
            Edits apply to existing pack keys only. Gateway refs are limited to registered sandbox adapters.
          </Text>

          <Heading level={4}>Services</Heading>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !operator}
            onClick={() => {
              if (!operator) {
                return;
              }
              const services = { ...operator.services };
              for (const key of Object.keys(services)) {
                if (key === 'pharmacy' || key === 'marketplace' || key.startsWith('lab_')) {
                  services[key as keyof typeof services] = false;
                }
              }
              syncOperator({
                ...operator,
                services,
                payments: { ...operator.payments, enabled: false },
              });
              setMessage('Commerce flags off in the editor. Validate and Publish to apply to customer 3000.');
            }}
          >
            Block storefront in this country
          </Button>
          {catalog.service_keys.map((key) => (
            <Switch
              key={key}
              label={key}
              checked={operator.services[key] === true}
              onCheckedChange={(next) =>
                syncOperator({ ...operator, services: { ...operator.services, [key]: next } })
              }
            />
          ))}

          <Heading level={4}>Payments</Heading>
          <Switch
            label="payments.enabled"
            checked={operator.payments.enabled}
            onCheckedChange={(next) =>
              syncOperator({ ...operator, payments: { ...operator.payments, enabled: next } })
            }
          />
          {catalog.payment_method_families.map((method) => (
            <Checkbox
              key={method}
              label={method}
              checked={operator.payments.methods.includes(method)}
              onChange={(e) =>
                syncOperator(toggleOperatorMethod(operator, method, e.currentTarget.checked))
              }
            />
          ))}
          {catalog.registered_gateway_codes.map((code) => (
            <Checkbox
              key={code}
              label={code}
              checked={operator.payments.gateway_refs.includes(code)}
              onChange={(e) =>
                syncOperator(toggleOperatorGateway(operator, code, e.currentTarget.checked))
              }
            />
          ))}
          <FormField label="Payment currencies" hint="ISO-4217 codes, comma-separated. Ids only.">
            {({ id }) => (
              <Input
                id={id}
                value={currenciesText}
                onChange={(e) => {
                  setCurrenciesText(e.target.value);
                  setEditorStatus('Draft');
                }}
                onBlur={() =>
                  syncOperator({
                    ...operator,
                    payments: {
                      ...operator.payments,
                      currencies: currenciesText
                        .split(',')
                        .map((item) => item.trim().toUpperCase())
                        .filter(Boolean),
                    },
                  })
                }
              />
            )}
          </FormField>
          <FormField label="Tax profile id" hint="Id/code only. Never rates or API keys.">
            {({ id }) => (
              <Input
                id={id}
                value={taxProfileId}
                onChange={(e) => {
                  setTaxProfileId(e.target.value);
                  setEditorStatus('Draft');
                }}
                onBlur={() => syncOperator({ ...operator, tax_profile_id: taxProfileId.trim() || null })}
              />
            )}
          </FormField>
          <Heading level={4}>Localization and catalog money</Heading>
          <Text tone="secondary">
            Technical defaults only (en, XXX, UTC) until legal fills a real country pack. Leave legal-entity empty.
            Publishing cannot unlock live payments.
          </Text>
          <FormField label="Default locale" hint="BCP-47. Not a production country claim.">
            {({ id }) => (
              <Input
                id={id}
                value={defaultLocale}
                onChange={(e) => {
                  setDefaultLocale(e.target.value);
                  setEditorStatus('Draft');
                }}
              />
            )}
          </FormField>
          <FormField label="Locales" hint="Comma-separated BCP-47 tags.">
            {({ id }) => (
              <Input
                id={id}
                value={localesText}
                onChange={(e) => {
                  setLocalesText(e.target.value);
                  setEditorStatus('Draft');
                }}
              />
            )}
          </FormField>
          <FormField label="Catalog currency default" hint="ISO-4217. Distinct from payment method currencies.">
            {({ id }) => (
              <Input
                id={id}
                value={catalogCurrencyDefault}
                onChange={(e) => {
                  setCatalogCurrencyDefault(e.target.value);
                  setEditorStatus('Draft');
                }}
              />
            )}
          </FormField>
          <FormField label="Catalog currencies allowed" hint="ISO-4217, comma-separated.">
            {({ id }) => (
              <Input
                id={id}
                value={catalogCurrencyAllowed}
                onChange={(e) => {
                  setCatalogCurrencyAllowed(e.target.value);
                  setEditorStatus('Draft');
                }}
              />
            )}
          </FormField>
          <FormField label="Timezone default" hint="IANA timezone. Example: Europe/Berlin.">
            {({ id }) => (
              <Input
                id={id}
                value={timezoneDefault}
                onChange={(e) => {
                  setTimezoneDefault(e.target.value);
                  setEditorStatus('Draft');
                }}
              />
            )}
          </FormField>
          <FormField
            label="Legal entity"
            hint="Opaque id/code only. Leave empty until legal supplies a real entity. Never a name or credential."
          >
            {({ id }) => (
              <Select
                id={id}
                value={ledgerLegalEntityId}
                onChange={(e) => {
                  setLedgerLegalEntityId(e.target.value);
                  setEditorStatus('Draft');
                }}
              >
                <option value="">None</option>
                {legalEntities.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Accounting currency" hint="Optional ISO-4217. Must be in catalog currencies allowed.">
            {({ id }) => (
              <Input
                id={id}
                value={ledgerAccountingCurrency}
                onChange={(e) => {
                  setLedgerAccountingCurrency(e.target.value);
                  setEditorStatus('Draft');
                }}
              />
            )}
          </FormField>

          <Heading level={4}>Commerce fees (minor units)</Heading>
          <Text tone="secondary" size="caption">
            Country-pack-driven checkout fees. Carrier cost vs customer delivery charge is tracked separately at quote time.
          </Text>
          <FormField label="Platform fee (bps)">
            {({ id }) => (
              <Input id={id} value={platformFeeBps} onChange={(e) => { setPlatformFeeBps(e.target.value); setEditorStatus('Draft'); }} />
            )}
          </FormField>
          <FormField label="Platform fee flat (minor)">
            {({ id }) => (
              <Input id={id} value={platformFeeFlatMinor} onChange={(e) => { setPlatformFeeFlatMinor(e.target.value); setEditorStatus('Draft'); }} />
            )}
          </FormField>
          <FormField label="Customer delivery fee (minor)">
            {({ id }) => (
              <Input id={id} value={deliveryFeeMinor} onChange={(e) => { setDeliveryFeeMinor(e.target.value); setEditorStatus('Draft'); }} />
            )}
          </FormField>
          <FormField label="Carrier cost estimate (minor)">
            {({ id }) => (
              <Input id={id} value={carrierCostEstimateMinor} onChange={(e) => { setCarrierCostEstimateMinor(e.target.value); setEditorStatus('Draft'); }} />
            )}
          </FormField>
          <FormField label="Free delivery threshold (minor, optional)">
            {({ id }) => (
              <Input id={id} value={freeDeliveryThresholdMinor} onChange={(e) => { setFreeDeliveryThresholdMinor(e.target.value); setEditorStatus('Draft'); }} />
            )}
          </FormField>
          <FormField label="Packaging fee (minor)">
            {({ id }) => (
              <Input id={id} value={packagingFeeMinor} onChange={(e) => { setPackagingFeeMinor(e.target.value); setEditorStatus('Draft'); }} />
            )}
          </FormField>
          <FormField label="Handling fee (minor)">
            {({ id }) => (
              <Input id={id} value={handlingFeeMinor} onChange={(e) => { setHandlingFeeMinor(e.target.value); setEditorStatus('Draft'); }} />
            )}
          </FormField>
          <FormField label="Payment convenience fee (minor)">
            {({ id }) => (
              <Input id={id} value={paymentFeeMinor} onChange={(e) => { setPaymentFeeMinor(e.target.value); setEditorStatus('Draft'); }} />
            )}
          </FormField>
          <Text tone="secondary" size="caption">
            Partner platform fees (doctor / lab / delivery / pharmacy takes) and affiliate marketing commission
            live on the published pack document (`doctor_platform_fee_bps`, `lab_platform_fee_bps`,
            `delivery_platform_fee_bps`, `pharmacy_platform_fee_bps`, `affiliate_commission_bps`). Affiliate
            commission is paid separately; other costs are bundled into the partner platform fee so the
            company does not lose on the transaction.
          </Text>

          <Heading level={4}>Feature flags</Heading>
          <Switch
            label="crm.enabled"
            checked={operator.crm_enabled}
            onCheckedChange={(next) => syncOperator({ ...operator, crm_enabled: next })}
          />
          <Switch
            label="analytics.enabled"
            checked={operator.analytics_enabled}
            onCheckedChange={(next) => syncOperator({ ...operator, analytics_enabled: next })}
          />
          <Switch
            label="search.discovery_enabled"
            checked={operator.search_discovery_enabled}
            onCheckedChange={(next) => syncOperator({ ...operator, search_discovery_enabled: next })}
          />
          {catalog.healthcare_flag_keys.map((key) => (
            <Switch
              key={key}
              label={`healthcare.${key}`}
              checked={operator.healthcare_flags[key] === true}
              onCheckedChange={(next) =>
                syncOperator({
                  ...operator,
                  healthcare_flags: { ...operator.healthcare_flags, [key]: next },
                })
              }
            />
          ))}
          <Switch
            label="recording_allowed (dual control required when on)"
            checked={operator.recording_allowed}
            onCheckedChange={(next) => {
              syncOperator({ ...operator, recording_allowed: next });
              if (next) {
                setDualControl(true);
              }
            }}
          />
          <FormField label="Data residency mode">
            {({ id }) => (
              <Select
                id={id}
                value={operator.data_residency_mode}
                onChange={(e) =>
                  syncOperator({
                    ...operator,
                    data_residency_mode: e.target.value as PolicyOperatorView['data_residency_mode'],
                  })
                }
              >
                {catalog.data_residency_modes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          {canPublish ? (
            <Checkbox
              label="Require dual control on publish"
              checked={dualControl || operator.recording_allowed}
              onChange={(e) => setDualControl(e.currentTarget.checked)}
            />
          ) : null}

          {canPublish ? (
            <div className="wp-row">
              <Button
                disabled={busy || !workingDocument}
                onClick={() =>
                  void run(async () => {
                    const token = getAccessToken();
                    if (!token || !workingDocument || !operator) {
                      return;
                    }
                    const document = applyOperatorToDocument(workingDocument, composedOperator(operator));
                    const result = await validatePolicyPackDocument(token, country.trim().toUpperCase(), document);
                    setDiff(result.diff);
                    setEditorStatus('Validated');
                    setMessage(result.ok ? 'Validated' : result.errors.join('; '));
                  })
                }
              >
                Validate
              </Button>
              <Button
                disabled={busy || !workingDocument}
                onClick={() =>
                  void run(async () => {
                    const token = getAccessToken();
                    if (!token || !workingDocument || !operator) {
                      return;
                    }
                    const document = applyOperatorToDocument(workingDocument, composedOperator(operator));
                    const created = await createPolicyPackDraft(token, country.trim().toUpperCase(), document);
                    setDraft(created);
                    setBaseDocument(created.document);
                    setEditorStatus('Draft');
                    setMessage(`Draft v${created.version} created`);
                    await load(country, { keepEditor: true });
                  })
                }
              >
                Save draft
              </Button>
              <Button
                disabled={busy || !draft}
                onClick={() =>
                  void run(async () => {
                    const token = getAccessToken();
                    if (!token || !draft) {
                      return;
                    }
                    await publishPolicyPack(
                      token,
                      draft.id,
                      dualControl || operator.recording_allowed,
                    );
                    setEditorStatus('Published');
                    setMessage('Published');
                    setDraft(null);
                    await load(country);
                  })
                }
              >
                Publish
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const token = getAccessToken();
                    if (!token) {
                      return;
                    }
                    await rollbackPolicyPack(token, country.trim().toUpperCase());
                    await load(country);
                    setEditorStatus('Rollback');
                    setMessage('Rolled back to previous superseded pack');
                  })
                }
              >
                Rollback
              </Button>
            </div>
          ) : (
            <Text tone="secondary">policy:publish is required to draft, validate, publish, or roll back.</Text>
          )}
          {draft ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const token = getAccessToken();
                  if (!token || !draft) {
                    return;
                  }
                  const result = await getPolicyPackDiff(token, draft.id);
                  setDiff(result.entries);
                })
              }
            >
              Load diff
            </Button>
          ) : null}
          {message ? <Text>{message}</Text> : null}
        </Card>
      ) : null}

      {diff.length > 0 ? (
        <Card>
          <Heading level={3}>Diff vs published</Heading>
          <Table
            caption="Operator key diff"
            columns={['Path', 'Before', 'After']}
            rows={diff.map((row) => [row.path, dumpValue(row.before), dumpValue(row.after)])}
          />
        </Card>
      ) : null}
    </section>
  );
}
