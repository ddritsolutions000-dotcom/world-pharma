/**
 * Sprint 44 — Authoritative production payment availability gate.
 * Fail-closed. Never silently routes production traffic to mock PSP.
 */
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import type { PrismaService } from '../app/prisma.service';
import {
  assertLiveProductionPrerequisites,
  isLivePaymentEnabled,
  isMockGatewayCode,
  readPaymentEnvironment,
} from './payment.config';
import { evaluateR14AGates, type R14AGateSnapshot } from './r14a-gate';
import { listProductionPspRequirements } from './production-psp-requirements';

export type ProductionPaymentBlocker =
  | 'COUNTRY_NOT_FOUND'
  | 'COUNTRY_PRODUCTION_NOT_ACTIVE'
  | 'COUNTRY_PRODUCTION_SUSPENDED'
  | 'PAYMENT_PROVIDER_DEPENDENCY_MISSING'
  | 'PAYMENT_PROVIDER_NOT_LIVE'
  | 'PAYMENT_PROVIDER_EXTERNAL_GATED'
  | 'MERCHANT_CONFIG_REF_MISSING'
  | 'R14_A_OWNER_CONFIRMATION_REQUIRED'
  | 'LIVE_PAYMENTS_DISABLED'
  | 'PRODUCTION_ENVIRONMENT_NOT_SET'
  | 'MOCK_GATEWAY_PRODUCTION_FORBIDDEN'
  | 'NO_PRODUCTION_GATEWAY';

export type ProductionPaymentAvailability = {
  country_code: string;
  country_id: string;
  available: boolean;
  environment: 'sandbox' | 'production';
  live_payments_enabled: boolean;
  country_production_lifecycle: CountryProductionLifecycle;
  payment_dependency: {
    present: boolean;
    status: ProductionDependencyStatus | null;
    config_reference: string | null;
    external_gated: boolean;
    provider_identifier: string | null;
  };
  r14a: {
    live_production_status: string;
    owner_evidenced_count: number;
    live_unlock_blocked_reason: string | null;
  };
  blockers: ProductionPaymentBlocker[];
  warnings: string[];
  requirements: ReturnType<typeof listProductionPspRequirements>;
  message: string;
};

const LIVE_DEP_STATUSES = new Set<ProductionDependencyStatus>([
  ProductionDependencyStatus.VERIFIED,
]);

export async function evaluateProductionPaymentAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string; humanGates?: R14AGateSnapshot[] },
): Promise<ProductionPaymentAvailability> {
  const country = input.countryId
    ? await prisma.country.findUnique({ where: { id: input.countryId } })
    : input.countryCode
      ? await prisma.country.findUnique({
          where: { isoAlpha2: input.countryCode.trim().toUpperCase() },
        })
      : null;

  if (!country) {
    return {
      country_code: input.countryCode?.toUpperCase() ?? '',
      country_id: input.countryId ?? '',
      available: false,
      environment: readPaymentEnvironment(),
      live_payments_enabled: isLivePaymentEnabled(),
      country_production_lifecycle: CountryProductionLifecycle.CONFIGURED,
      payment_dependency: {
        present: false,
        status: null,
        config_reference: null,
        external_gated: true,
        provider_identifier: null,
      },
      r14a: {
        live_production_status: 'R14_A_LIVE_PRODUCTION_BLOCKED',
        owner_evidenced_count: 0,
        live_unlock_blocked_reason: 'Country not found',
      },
      blockers: ['COUNTRY_NOT_FOUND'],
      warnings: [],
      requirements: listProductionPspRequirements(input.countryCode),
      message: 'Country not found — production payment unavailable.',
    };
  }

  const blockers: ProductionPaymentBlocker[] = [];
  const warnings: string[] = [];
  const env = readPaymentEnvironment();
  const liveEnabled = isLivePaymentEnabled();

  if (country.productionLifecycle === CountryProductionLifecycle.SUSPENDED) {
    blockers.push('COUNTRY_PRODUCTION_SUSPENDED');
  } else if (country.productionLifecycle !== CountryProductionLifecycle.ACTIVE) {
    blockers.push('COUNTRY_PRODUCTION_NOT_ACTIVE');
  }

  const dep = await prisma.productionDependency.findFirst({
    where: {
      countryId: country.id,
      dependencyType: 'PAYMENT_PROVIDER',
      environment: 'production',
    },
    orderBy: { updatedAt: 'desc' },
  });

  const paymentDependency = {
    present: Boolean(dep),
    status: dep?.status ?? null,
    config_reference: dep?.configReference ?? null,
    external_gated: dep?.externalGated ?? true,
    provider_identifier: dep?.providerIdentifier ?? null,
  };

  if (!dep) {
    blockers.push('PAYMENT_PROVIDER_DEPENDENCY_MISSING');
  } else {
    if (dep.externalGated || dep.status === ProductionDependencyStatus.EXTERNAL_GATED) {
      blockers.push('PAYMENT_PROVIDER_EXTERNAL_GATED');
    }
    if (!LIVE_DEP_STATUSES.has(dep.status)) {
      blockers.push('PAYMENT_PROVIDER_NOT_LIVE');
    }
    if (!dep.configReference?.trim()) {
      blockers.push('MERCHANT_CONFIG_REF_MISSING');
    }
    if (dep.providerIdentifier && isMockGatewayCode(dep.providerIdentifier)) {
      blockers.push('MOCK_GATEWAY_PRODUCTION_FORBIDDEN');
    }
  }

  const humanGates =
    input.humanGates ??
    (await prisma.r14AHumanGate.findMany()).map((row) => ({
      gateCode: row.gateCode,
      valueText: row.valueText,
      evidenceClass: row.evidenceClass,
      evidenceRef: row.evidenceRef,
      updatedByPersonId: row.updatedByPersonId,
      verifiedByPersonId: row.verifiedByPersonId,
      verifiedAt: row.verifiedAt,
      updatedAt: row.updatedAt,
    }));
  const r14a = evaluateR14AGates(humanGates, { livePaymentEnabled: liveEnabled });
  if (r14a.live_production_status !== 'R14_A_LIVE_PRODUCTION_READY') {
    blockers.push('R14_A_OWNER_CONFIRMATION_REQUIRED');
  }

  if (env !== 'production') {
    blockers.push('PRODUCTION_ENVIRONMENT_NOT_SET');
    warnings.push('PAYMENT_ENVIRONMENT is not production — sandbox rail remains active.');
  }
  if (!liveEnabled) {
    blockers.push('LIVE_PAYMENTS_DISABLED');
  }

  const available = blockers.length === 0;
  return {
    country_code: country.isoAlpha2,
    country_id: country.id,
    available,
    environment: env,
    live_payments_enabled: liveEnabled,
    country_production_lifecycle: country.productionLifecycle,
    payment_dependency: paymentDependency,
    r14a: {
      live_production_status: r14a.live_production_status,
      owner_evidenced_count: r14a.owner_evidenced_count,
      live_unlock_blocked_reason: r14a.live_unlock_blocked_reason,
    },
    blockers: [...new Set(blockers)],
    warnings,
    requirements: listProductionPspRequirements(country.isoAlpha2),
    message: available
      ? 'Production payment rail is available for this country.'
      : `Production payment blocked: ${[...new Set(blockers)].join(', ')}`,
  };
}

/** Throws structured fail-closed problem — never falls back to mock. */
export async function assertProductionPaymentAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string },
): Promise<ProductionPaymentAvailability> {
  const result = await evaluateProductionPaymentAvailable(prisma, input);
  if (result.available) {
    // Double-check human gates via existing assert (throws if incomplete).
    const humanGates = await prisma.r14AHumanGate.findMany();
    assertLiveProductionPrerequisites('production payment', {
      countryIso2: result.country_code,
      humanGates: humanGates.map((row) => ({
        gateCode: row.gateCode,
        valueText: row.valueText,
        evidenceClass: row.evidenceClass,
        evidenceRef: row.evidenceRef,
        updatedByPersonId: row.updatedByPersonId,
        verifiedByPersonId: row.verifiedByPersonId,
        verifiedAt: row.verifiedAt,
        updatedAt: row.updatedAt,
      })),
    });
    return result;
  }
  const primary = result.blockers[0] ?? 'LIVE_PAYMENTS_DISABLED';
  throw Errors.problem(
    409,
    primary,
    'Production payment unavailable',
    result.message,
  );
}
