import { PaymentMethodFamily } from '@prisma/client';
import type { PolicyDocument } from '../policy/empty-pack';
import { ProblemException } from '../common/problem';
import { isLivePaymentEnabled, isMockGatewayCode, readPaymentEnvironment } from './payment.config';
import type { PaymentGatewayRegistry } from './gateway.registry';
import { assertObservabilityResponseSafe } from './payment-observability';
import type { PaymentRouter, RoutingDecision, RoutingIneligible } from './router';

export type RoutingMatrixRow = {
  gateway_code: string;
  gateway_environment: string;
  priority: number;
  capabilities: string[];
  registry_registered: boolean;
  policy_allowed: boolean;
  router_eligible: boolean;
  status: 'active' | 'inactive' | 'blocked';
  fail_closed_reason: string | null;
  effective_rank: number | null;
  policy_source: string;
  routing_reason: string | null;
};

export type RoutingMatrixEffectiveRoute = {
  gateway_code: string;
  gateway_environment: string;
  priority: number;
  account_code: string;
  routing_reason: string;
};

export type RoutingMatrixResponse = {
  sandbox: true;
  active_environment: 'sandbox';
  live_payments_enabled: boolean;
  runtime_environment: ReturnType<typeof readPaymentEnvironment>;
  country_code: string;
  method: PaymentMethodFamily;
  currency: string;
  payments_enabled: boolean;
  policy_source: string;
  gateway_refs: string[];
  rows: RoutingMatrixRow[];
  effective_route: RoutingMatrixEffectiveRoute | null;
  effective_fail_closed_reason: string | null;
  router_decision_matches: boolean;
  production_preview: {
    active: false;
    fail_closed_reason: string;
    rows: RoutingMatrixRow[];
  };
};

export function filterPolicyAlignedCandidates(
  candidates: RoutingDecision[],
  gatewayRefs: readonly string[],
): RoutingDecision[] {
  const allowed = new Set(gatewayRefs);
  return candidates.filter((candidate) => allowed.has(candidate.gatewayCode));
}

export async function resolvePaymentSubmitRoute(input: {
  router: PaymentRouter;
  gateways: PaymentGatewayRegistry;
  routingInput: {
    countryId: string;
    countryIso2: string;
    currency: string;
    method: PaymentMethodFamily;
    amountMinor: bigint;
    legalEntityId?: string;
  };
  gatewayRefs: readonly string[];
}): Promise<{ route: RoutingDecision | null; reason: string | null; candidates: RoutingDecision[] }> {
  const candidates = await input.router.candidates(input.routingInput, 'sandbox');
  const effective = resolveEffectiveRoute(candidates, input.gatewayRefs, input.gateways);
  return { ...effective, candidates };
}

export function resolveRegistryEligibility(
  gateways: Pick<PaymentGatewayRegistry, 'isRegistered' | 'resolve'>,
  gatewayCode: string,
  gatewayEnvironment: string,
): { eligible: boolean; reason: string | null } {
  if (!gateways.isRegistered(gatewayCode)) {
    return { eligible: false, reason: 'unknown_gateway' };
  }
  try {
    gateways.resolve(gatewayCode, gatewayEnvironment);
    return { eligible: true, reason: null };
  } catch (err) {
    if (err instanceof ProblemException) {
      return { eligible: false, reason: err.code ?? 'registry_fail_closed' };
    }
    return { eligible: false, reason: 'registry_fail_closed' };
  }
}

export function resolveEffectiveRoute(
  candidates: RoutingDecision[],
  gatewayRefs: readonly string[],
  gateways: Pick<PaymentGatewayRegistry, 'isRegistered' | 'resolve'>,
): { route: RoutingDecision | null; reason: string | null } {
  if (!gatewayRefs.length) {
    return { route: null, reason: 'empty_routing_policy' };
  }
  const aligned = filterPolicyAlignedCandidates(candidates, gatewayRefs);
  for (const candidate of aligned) {
    const registry = resolveRegistryEligibility(gateways, candidate.gatewayCode, candidate.gatewayEnvironment);
    if (registry.eligible) {
      return { route: candidate, reason: null };
    }
  }
  if (candidates.length && !aligned.length) {
    return { route: null, reason: 'policy_gateway_not_allowed' };
  }
  if (!candidates.length) {
    return { route: null, reason: 'no_router_candidate' };
  }
  return { route: null, reason: 'unknown_gateway_or_capability' };
}

function buildRow(
  input: {
    gatewayCode: string;
    gatewayEnvironment: string;
    priority: number;
    capabilities: string[];
    routerEligible: boolean;
    routingReason: string | null;
    policyAllowed: boolean;
    registryRegistered: boolean;
    registryReason: string | null;
    routerReason: string | null;
    effectiveRank: number | null;
    policySource: string;
  },
): RoutingMatrixRow {
  let failClosedReason: string | null = null;
  if (!input.policyAllowed) {
    failClosedReason = 'policy_gateway_not_allowed';
  } else if (!input.routerEligible) {
    failClosedReason = input.routerReason ?? 'router_ineligible';
  } else if (!input.registryRegistered) {
    failClosedReason = 'unknown_gateway';
  } else if (input.registryReason) {
    failClosedReason = input.registryReason;
  }

  let status: RoutingMatrixRow['status'] = 'inactive';
  if (input.effectiveRank !== null) {
    status = 'active';
  } else if (failClosedReason) {
    status = 'blocked';
  }

  return {
    gateway_code: input.gatewayCode,
    gateway_environment: input.gatewayEnvironment,
    priority: input.priority,
    capabilities: input.capabilities,
    registry_registered: input.registryRegistered,
    policy_allowed: input.policyAllowed,
    router_eligible: input.routerEligible,
    status,
    fail_closed_reason: failClosedReason,
    effective_rank: input.effectiveRank,
    policy_source: input.policySource,
    routing_reason: input.routingReason,
  };
}

function capabilityNames(
  capabilities: Array<{ name: string; enabled: boolean }>,
): string[] {
  return capabilities.filter((cap) => cap.enabled).map((cap) => cap.name).sort();
}

export async function buildPaymentRoutingMatrix(input: {
  router: PaymentRouter;
  gateways: PaymentGatewayRegistry;
  countryCode: string;
  countryId: string;
  currency: string;
  policy: PolicyDocument | null;
  policySource: string;
  method?: PaymentMethodFamily;
  gatewayFilter?: string;
  activeOnly?: boolean;
  environmentFilter?: 'sandbox' | 'production' | 'all';
  capabilityMap: Map<string, string[]>;
}): Promise<RoutingMatrixResponse> {
  const method = input.method ?? PaymentMethodFamily.CARD;
  const paymentsEnabled = Boolean(input.policy?.payments.enabled);
  const gatewayRefs = input.policy?.payments.gateway_refs ?? [];
  const routingInput = {
    countryId: input.countryId,
    countryIso2: input.countryCode,
    currency: input.currency,
    method,
    amountMinor: 1n,
  };

  const emptyProductionPreview = {
    active: false as const,
    fail_closed_reason: 'live_payments_disabled',
    rows: [] as RoutingMatrixRow[],
  };

  if (!input.policy) {
    return {
      sandbox: true,
      active_environment: 'sandbox',
      live_payments_enabled: isLivePaymentEnabled(),
      runtime_environment: readPaymentEnvironment(),
      country_code: input.countryCode,
      method,
      currency: input.currency,
      payments_enabled: false,
      policy_source: input.policySource,
      gateway_refs: [],
      rows: [],
      effective_route: null,
      effective_fail_closed_reason: 'missing_routing_policy',
      router_decision_matches: true,
      production_preview: emptyProductionPreview,
    };
  }

  if (!paymentsEnabled) {
    return {
      sandbox: true,
      active_environment: 'sandbox',
      live_payments_enabled: isLivePaymentEnabled(),
      runtime_environment: readPaymentEnvironment(),
      country_code: input.countryCode,
      method,
      currency: input.currency,
      payments_enabled: false,
      policy_source: input.policySource,
      gateway_refs: gatewayRefs,
      rows: [],
      effective_route: null,
      effective_fail_closed_reason: 'payments_disabled',
      router_decision_matches: true,
      production_preview: emptyProductionPreview,
    };
  }

  if (!gatewayRefs.length) {
    return {
      sandbox: true,
      active_environment: 'sandbox',
      live_payments_enabled: isLivePaymentEnabled(),
      runtime_environment: readPaymentEnvironment(),
      country_code: input.countryCode,
      method,
      currency: input.currency,
      payments_enabled: true,
      policy_source: input.policySource,
      gateway_refs: gatewayRefs,
      rows: [],
      effective_route: null,
      effective_fail_closed_reason: 'empty_routing_policy',
      router_decision_matches: true,
      production_preview: emptyProductionPreview,
    };
  }

  const explained = await input.router.explain(routingInput, 'sandbox');
  const effective = resolveEffectiveRoute(explained.candidates, gatewayRefs, input.gateways);
  const submitPreview = await resolvePaymentSubmitRoute({
    router: input.router,
    gateways: input.gateways,
    routingInput,
    gatewayRefs,
  });
  const routerDecisionMatches =
    effective.route?.gatewayCode === submitPreview.route?.gatewayCode &&
    effective.route?.gatewayEnvironment === submitPreview.route?.gatewayEnvironment &&
    effective.reason === submitPreview.reason;

  const rowByCode = new Map<string, RoutingMatrixRow>();
  const upsertCandidate = (
    candidate: RoutingDecision | RoutingIneligible,
    routerEligible: boolean,
    routerReason: string | null,
    routingReason: string | null,
  ) => {
    const policyAllowed = gatewayRefs.includes(candidate.gatewayCode);
    const registry = resolveRegistryEligibility(input.gateways, candidate.gatewayCode, candidate.gatewayEnvironment);
    const effectiveRank =
      effective.route &&
      effective.route.gatewayCode === candidate.gatewayCode &&
      effective.route.gatewayEnvironment === candidate.gatewayEnvironment
        ? 1
        : null;
    const row = buildRow({
      gatewayCode: candidate.gatewayCode,
      gatewayEnvironment: candidate.gatewayEnvironment,
      priority: candidate.priority,
      capabilities: input.capabilityMap.get(candidate.gatewayCode) ?? [],
      routerEligible,
      routingReason,
      policyAllowed,
      registryRegistered: input.gateways.isRegistered(candidate.gatewayCode),
      registryReason: registry.reason,
      routerReason,
      effectiveRank,
      policySource: input.policySource,
    });
    rowByCode.set(`${candidate.gatewayCode}:${candidate.gatewayEnvironment}`, row);
  };

  for (const candidate of explained.candidates) {
    upsertCandidate(candidate, true, null, candidate.reason);
  }
  for (const blocked of explained.ineligible) {
    upsertCandidate(blocked, false, blocked.reason, null);
  }
  for (const ref of gatewayRefs) {
    if (![...rowByCode.keys()].some((key) => key.startsWith(`${ref}:`))) {
      const registry = resolveRegistryEligibility(input.gateways, ref, 'sandbox');
      const row = buildRow({
        gatewayCode: ref,
        gatewayEnvironment: 'sandbox',
        priority: Number.MAX_SAFE_INTEGER,
        capabilities: input.capabilityMap.get(ref) ?? [],
        routerEligible: false,
        routingReason: null,
        policyAllowed: true,
        registryRegistered: input.gateways.isRegistered(ref),
        registryReason: registry.reason,
        routerReason: 'gateway_not_configured',
        effectiveRank: null,
        policySource: input.policySource,
      });
      rowByCode.set(`${ref}:sandbox`, row);
    }
  }

  let rows = [...rowByCode.values()].sort((a, b) => a.priority - b.priority || a.gateway_code.localeCompare(b.gateway_code));
  if (input.gatewayFilter?.trim()) {
    rows = rows.filter((row) => row.gateway_code === input.gatewayFilter?.trim());
  }
  if (input.activeOnly) {
    rows = rows.filter((row) => row.status === 'active');
  }
  if (input.environmentFilter && input.environmentFilter !== 'all') {
    rows = rows.filter((row) => row.gateway_environment === input.environmentFilter);
  }

  const productionPreview = await buildProductionPreview({
    router: input.router,
    gateways: input.gateways,
    routingInput,
    gatewayRefs,
    capabilityMap: input.capabilityMap,
    policySource: input.policySource,
  });

  return {
    sandbox: true,
    active_environment: 'sandbox',
    live_payments_enabled: isLivePaymentEnabled(),
    runtime_environment: readPaymentEnvironment(),
    country_code: input.countryCode,
    method,
    currency: input.currency,
    payments_enabled: true,
    policy_source: input.policySource,
    gateway_refs: gatewayRefs,
    rows,
    effective_route: effective.route
      ? {
          gateway_code: effective.route.gatewayCode,
          gateway_environment: effective.route.gatewayEnvironment,
          priority: effective.route.priority,
          account_code: effective.route.accountCode,
          routing_reason: effective.route.reason,
        }
      : null,
    effective_fail_closed_reason: effective.reason,
    router_decision_matches: routerDecisionMatches,
    production_preview: productionPreview,
  };
}

async function buildProductionPreview(input: {
  router: PaymentRouter;
  gateways: PaymentGatewayRegistry;
  routingInput: {
    countryId: string;
    countryIso2: string;
    currency: string;
    method: PaymentMethodFamily;
    amountMinor: bigint;
  };
  gatewayRefs: readonly string[];
  capabilityMap: Map<string, string[]>;
  policySource: string;
}): Promise<RoutingMatrixResponse['production_preview']> {
  if (!isLivePaymentEnabled()) {
    const rows = input.gatewayRefs.flatMap((ref) => {
      const registry = resolveRegistryEligibility(input.gateways, ref, 'production');
      const reason = isMockGatewayCode(ref)
        ? 'mock_gateway_production_forbidden'
        : registry.reason ?? 'live_payments_disabled';
      return [
        buildRow({
          gatewayCode: ref,
          gatewayEnvironment: 'production',
          priority: Number.MAX_SAFE_INTEGER,
          capabilities: input.capabilityMap.get(ref) ?? [],
          routerEligible: false,
          routingReason: null,
          policyAllowed: true,
          registryRegistered: input.gateways.isRegistered(ref),
          registryReason: registry.reason,
          routerReason: reason,
          effectiveRank: null,
          policySource: input.policySource,
        }),
      ];
    });
    return {
      active: false,
      fail_closed_reason: 'live_payments_disabled',
      rows,
    };
  }

  try {
    const explained = await input.router.explain(input.routingInput, 'production');
    const rows = [...explained.candidates, ...explained.ineligible].map((entry) => {
      const routerEligible = 'accountCode' in entry;
      const registry = resolveRegistryEligibility(input.gateways, entry.gatewayCode, entry.gatewayEnvironment);
      return buildRow({
        gatewayCode: entry.gatewayCode,
        gatewayEnvironment: entry.gatewayEnvironment,
        priority: entry.priority,
        capabilities: input.capabilityMap.get(entry.gatewayCode) ?? [],
        routerEligible,
        routingReason: routerEligible ? entry.reason : null,
        policyAllowed: input.gatewayRefs.includes(entry.gatewayCode),
        registryRegistered: input.gateways.isRegistered(entry.gatewayCode),
        registryReason: registry.reason,
        routerReason: routerEligible ? null : entry.reason,
        effectiveRank: null,
        policySource: input.policySource,
      });
    });
    return {
      active: false,
      fail_closed_reason: 'production_preview_only',
      rows,
    };
  } catch (err) {
    const reason =
      err instanceof ProblemException ? (err.code ?? 'live_payments_disabled') : 'live_payments_disabled';
    return {
      active: false,
      fail_closed_reason: reason,
      rows: [],
    };
  }
}

export async function loadGatewayCapabilityMap(
  prisma: {
    paymentGateway: {
      findMany: (args: {
        select: { code: true; capabilities: { select: { name: true; enabled: true } } };
      }) => Promise<Array<{ code: string; capabilities: Array<{ name: string; enabled: boolean }> }>>;
    };
  },
): Promise<Map<string, string[]>> {
  const gateways = await prisma.paymentGateway.findMany({
    select: { code: true, capabilities: { select: { name: true, enabled: true } } },
  });
  return new Map(gateways.map((gw) => [gw.code, capabilityNames(gw.capabilities)]));
}

export function assertRoutingMatrixResponseSafe(body: unknown): void {
  assertObservabilityResponseSafe(body);
  const serialized = JSON.stringify(body);
  const liveKey = `${'sk'}_${'live'}`;
  const apiKey = `${'api'}_${'key'}`;
  if (
    /secretRef|payload_cipher/i.test(serialized) ||
    new RegExp(liveKey, 'i').test(serialized) ||
    new RegExp(apiKey, 'i').test(serialized)
  ) {
    throw new Error('Routing matrix exposed sensitive configuration');
  }
}
