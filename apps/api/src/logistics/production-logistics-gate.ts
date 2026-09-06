/**
 * Sprint 46 — Authoritative production logistics / last-mile availability gate.
 * Fail-closed. Never silently routes production shipments to MockCarrierAdapter.
 */
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import type { PrismaService } from '../app/prisma.service';
import {
  isLiveCarrierEnabled,
  isMockCarrierCode,
  readLogisticsEnvironment,
} from './carrier.config';

export type ProductionLogisticsBlocker =
  | 'COUNTRY_NOT_FOUND'
  | 'COUNTRY_PRODUCTION_NOT_ACTIVE'
  | 'COUNTRY_PRODUCTION_SUSPENDED'
  | 'CARRIER_DEPENDENCY_MISSING'
  | 'CARRIER_NOT_LIVE'
  | 'CARRIER_EXTERNAL_GATED'
  | 'CARRIER_CONFIG_MISSING'
  | 'SERVICEABILITY_NOT_READY'
  | 'MOCK_CARRIER_PRODUCTION_FORBIDDEN'
  | 'NO_PRODUCTION_CARRIER_ADAPTER'
  | 'LOGISTICS_LIVE_DISABLED'
  | 'PRODUCTION_ENVIRONMENT_NOT_SET';

export type ProductionLogisticsAvailability = {
  country_code: string;
  country_id: string;
  available: boolean;
  environment: 'sandbox' | 'production';
  live_logistics_enabled: boolean;
  country_production_lifecycle: CountryProductionLifecycle;
  carrier_dependency: {
    present: boolean;
    status: ProductionDependencyStatus | null;
    config_reference: string | null;
    external_gated: boolean;
    provider_identifier: string | null;
  };
  serviceability_ready: boolean;
  external_gate: 'EXTERNAL_GATED' | 'OPEN';
  blockers: ProductionLogisticsBlocker[];
  warnings: string[];
  message: string;
  never_fallback_to_mock: true;
};

const LIVE_DEP_STATUSES = new Set<ProductionDependencyStatus>([ProductionDependencyStatus.VERIFIED]);

export async function evaluateProductionLogisticsAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string },
): Promise<ProductionLogisticsAvailability> {
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
      environment: readLogisticsEnvironment(),
      live_logistics_enabled: isLiveCarrierEnabled(),
      country_production_lifecycle: CountryProductionLifecycle.CONFIGURED,
      carrier_dependency: {
        present: false,
        status: null,
        config_reference: null,
        external_gated: true,
        provider_identifier: null,
      },
      serviceability_ready: false,
      external_gate: 'EXTERNAL_GATED',
      blockers: ['COUNTRY_NOT_FOUND'],
      warnings: [],
      message: 'Country not found — production logistics unavailable.',
      never_fallback_to_mock: true,
    };
  }

  const blockers: ProductionLogisticsBlocker[] = [];
  const warnings: string[] = [];
  const env = readLogisticsEnvironment();
  const liveEnabled = isLiveCarrierEnabled();

  if (country.productionLifecycle === CountryProductionLifecycle.SUSPENDED) {
    blockers.push('COUNTRY_PRODUCTION_SUSPENDED');
  } else if (country.productionLifecycle !== CountryProductionLifecycle.ACTIVE) {
    blockers.push('COUNTRY_PRODUCTION_NOT_ACTIVE');
  }

  const dep = await prisma.productionDependency.findFirst({
    where: {
      countryId: country.id,
      dependencyType: 'CARRIER',
      environment: 'production',
    },
    orderBy: { updatedAt: 'desc' },
  });

  const carrierDependency = {
    present: Boolean(dep),
    status: dep?.status ?? null,
    config_reference: dep?.configReference ?? null,
    external_gated: dep?.externalGated ?? true,
    provider_identifier: dep?.providerIdentifier ?? null,
  };

  if (!dep) {
    blockers.push('CARRIER_DEPENDENCY_MISSING');
  } else {
    if (dep.externalGated || dep.status === ProductionDependencyStatus.EXTERNAL_GATED) {
      blockers.push('CARRIER_EXTERNAL_GATED');
    }
    if (!LIVE_DEP_STATUSES.has(dep.status)) {
      blockers.push('CARRIER_NOT_LIVE');
    }
    if (!dep.configReference?.trim()) {
      blockers.push('CARRIER_CONFIG_MISSING');
    }
    if (isMockCarrierCode(dep.providerIdentifier)) {
      blockers.push('MOCK_CARRIER_PRODUCTION_FORBIDDEN');
    }
  }

  const zoneCount = await prisma.serviceabilityZone.count({
    where: { countryId: country.id, active: true },
  });
  const coverageCount = await prisma.carrierCoverage.count({
    where: {
      active: true,
      OR: [{ originIso2: country.isoAlpha2 }, { originIso2: '*' }, { destIso2: country.isoAlpha2 }, { destIso2: '*' }],
    },
  });
  const serviceabilityReady = zoneCount > 0 || coverageCount > 0;
  if (!serviceabilityReady) {
    blockers.push('SERVICEABILITY_NOT_READY');
  }

  if (env !== 'production') {
    blockers.push('PRODUCTION_ENVIRONMENT_NOT_SET');
    warnings.push('LOGISTICS_ENVIRONMENT is not production — sandbox MockCarrierAdapter remains active.');
  }
  if (!liveEnabled) {
    blockers.push('LOGISTICS_LIVE_DISABLED');
  }

  // No live carrier SDK is registered in this codebase. Do not invent an open external gate.
  blockers.push('NO_PRODUCTION_CARRIER_ADAPTER');

  const unique = [...new Set(blockers)];
  const available = unique.length === 0;
  return {
    country_code: country.isoAlpha2,
    country_id: country.id,
    available,
    environment: env,
    live_logistics_enabled: liveEnabled,
    country_production_lifecycle: country.productionLifecycle,
    carrier_dependency: carrierDependency,
    serviceability_ready: serviceabilityReady,
    external_gate: 'EXTERNAL_GATED',
    blockers: unique,
    warnings,
    message: available
      ? 'Production logistics rail is available for this country.'
      : `Production logistics blocked: ${unique.join(', ')}`,
    never_fallback_to_mock: true,
  };
}

/** Throws structured fail-closed problem — never falls back to MockCarrierAdapter. */
export async function assertProductionLogisticsAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string },
): Promise<ProductionLogisticsAvailability> {
  const result = await evaluateProductionLogisticsAvailable(prisma, input);
  if (result.available) {
    return result;
  }
  const primary = result.blockers[0] ?? 'LOGISTICS_LIVE_DISABLED';
  throw Errors.problem(409, primary, 'Production logistics unavailable', result.message);
}
