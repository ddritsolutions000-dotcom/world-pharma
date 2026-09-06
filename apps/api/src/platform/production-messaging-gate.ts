/**
 * Sprint 45 — Authoritative production transactional messaging gate (SMS/email/push/WhatsApp).
 * Fail-closed. Never silently routes production messaging to mock/console providers.
 */
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import type { PrismaService } from '../app/prisma.service';
import {
  isLiveOtpEnabled,
  isMockOtpProvider,
  readCommunicationEnvironment,
} from '../identity/communication.config';

export type ProductionMessagingBlocker =
  | 'COUNTRY_NOT_FOUND'
  | 'COUNTRY_PRODUCTION_NOT_ACTIVE'
  | 'COUNTRY_PRODUCTION_SUSPENDED'
  | 'MESSAGING_PROVIDER_DEPENDENCY_MISSING'
  | 'MESSAGING_PROVIDER_NOT_LIVE'
  | 'MESSAGING_PROVIDER_EXTERNAL_GATED'
  | 'SENDER_CONFIG_REF_MISSING'
  | 'MOCK_MESSAGING_PROVIDER_PRODUCTION_FORBIDDEN'
  | 'LIVE_COMMUNICATIONS_DISABLED'
  | 'PRODUCTION_ENVIRONMENT_NOT_SET';

export type ProductionMessagingAvailability = {
  country_code: string;
  country_id: string;
  available: boolean;
  environment: 'sandbox' | 'production';
  live_communications_enabled: boolean;
  country_production_lifecycle: CountryProductionLifecycle;
  messaging_dependency: {
    present: boolean;
    dependency_type: string | null;
    status: ProductionDependencyStatus | null;
    config_reference: string | null;
    external_gated: boolean;
    provider_identifier: string | null;
  };
  blockers: ProductionMessagingBlocker[];
  warnings: string[];
  message: string;
  never_fallback_to_mock: true;
};

const LIVE_DEP_STATUSES = new Set<ProductionDependencyStatus>([
  ProductionDependencyStatus.VERIFIED,
]);

const MESSAGING_DEP_TYPES = ['SMS_PROVIDER', 'MESSAGING_PROVIDER', 'EMAIL_PROVIDER'] as const;

export async function evaluateProductionMessagingAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string },
): Promise<ProductionMessagingAvailability> {
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
      environment: readCommunicationEnvironment(),
      live_communications_enabled: isLiveOtpEnabled(),
      country_production_lifecycle: CountryProductionLifecycle.CONFIGURED,
      messaging_dependency: {
        present: false,
        dependency_type: null,
        status: null,
        config_reference: null,
        external_gated: true,
        provider_identifier: null,
      },
      blockers: ['COUNTRY_NOT_FOUND'],
      warnings: [],
      message: 'Country not found — production messaging unavailable.',
      never_fallback_to_mock: true,
    };
  }

  const blockers: ProductionMessagingBlocker[] = [];
  const warnings: string[] = [];
  const env = readCommunicationEnvironment();
  const liveEnabled = isLiveOtpEnabled();

  if (country.productionLifecycle === CountryProductionLifecycle.SUSPENDED) {
    blockers.push('COUNTRY_PRODUCTION_SUSPENDED');
  } else if (country.productionLifecycle !== CountryProductionLifecycle.ACTIVE) {
    blockers.push('COUNTRY_PRODUCTION_NOT_ACTIVE');
  }

  const deps = await prisma.productionDependency.findMany({
    where: {
      countryId: country.id,
      dependencyType: { in: [...MESSAGING_DEP_TYPES] },
      environment: 'production',
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Prefer SMS_PROVIDER, then MESSAGING_PROVIDER, then EMAIL_PROVIDER.
  const dep =
    deps.find((d) => d.dependencyType === 'SMS_PROVIDER') ??
    deps.find((d) => d.dependencyType === 'MESSAGING_PROVIDER') ??
    deps.find((d) => d.dependencyType === 'EMAIL_PROVIDER') ??
    null;

  const messagingDependency = {
    present: Boolean(dep),
    dependency_type: dep?.dependencyType ?? null,
    status: dep?.status ?? null,
    config_reference: dep?.configReference ?? null,
    external_gated: dep?.externalGated ?? true,
    provider_identifier: dep?.providerIdentifier ?? null,
  };

  if (!dep) {
    blockers.push('MESSAGING_PROVIDER_DEPENDENCY_MISSING');
  } else {
    if (dep.externalGated || dep.status === ProductionDependencyStatus.EXTERNAL_GATED) {
      blockers.push('MESSAGING_PROVIDER_EXTERNAL_GATED');
    }
    if (!LIVE_DEP_STATUSES.has(dep.status)) {
      blockers.push('MESSAGING_PROVIDER_NOT_LIVE');
    }
    if (!dep.configReference?.trim()) {
      blockers.push('SENDER_CONFIG_REF_MISSING');
    }
    if (isMockOtpProvider(dep.providerIdentifier)) {
      blockers.push('MOCK_MESSAGING_PROVIDER_PRODUCTION_FORBIDDEN');
    }
  }

  if (env !== 'production') {
    blockers.push('PRODUCTION_ENVIRONMENT_NOT_SET');
    warnings.push(
      'COMMUNICATION_ENVIRONMENT is not production — sandbox messaging rail remains active.',
    );
  }
  if (!liveEnabled) {
    blockers.push('LIVE_COMMUNICATIONS_DISABLED');
  }

  const available = blockers.length === 0;
  return {
    country_code: country.isoAlpha2,
    country_id: country.id,
    available,
    environment: env,
    live_communications_enabled: liveEnabled,
    country_production_lifecycle: country.productionLifecycle,
    messaging_dependency: messagingDependency,
    blockers: [...new Set(blockers)],
    warnings,
    message: available
      ? 'Production messaging rail is available for this country.'
      : `Production messaging blocked: ${[...new Set(blockers)].join(', ')}`,
    never_fallback_to_mock: true,
  };
}

export async function assertProductionMessagingAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string },
): Promise<ProductionMessagingAvailability> {
  const result = await evaluateProductionMessagingAvailable(prisma, input);
  if (result.available) {
    return result;
  }
  const primary = result.blockers[0] ?? 'LIVE_COMMUNICATIONS_DISABLED';
  throw Errors.problem(409, primary, 'Production messaging unavailable', result.message);
}
