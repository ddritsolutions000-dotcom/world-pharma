/**
 * Sprint 45 — Authoritative production OTP availability gate.
 * Fail-closed. Never silently routes production OTP to mock/console adapters.
 */
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import type { PrismaService } from '../app/prisma.service';
import {
  isLiveOtpEnabled,
  isMockOtpProvider,
  readCommunicationEnvironment,
} from './communication.config';

export type ProductionOtpBlocker =
  | 'COUNTRY_NOT_FOUND'
  | 'COUNTRY_PRODUCTION_NOT_ACTIVE'
  | 'COUNTRY_PRODUCTION_SUSPENDED'
  | 'OTP_PROVIDER_DEPENDENCY_MISSING'
  | 'OTP_PROVIDER_NOT_LIVE'
  | 'OTP_PROVIDER_EXTERNAL_GATED'
  | 'SENDER_CONFIG_REF_MISSING'
  | 'MOCK_OTP_PROVIDER_PRODUCTION_FORBIDDEN'
  | 'LIVE_OTP_DISABLED'
  | 'PRODUCTION_ENVIRONMENT_NOT_SET';

export type ProductionOtpAvailability = {
  country_code: string;
  country_id: string;
  available: boolean;
  environment: 'sandbox' | 'production';
  live_otp_enabled: boolean;
  country_production_lifecycle: CountryProductionLifecycle;
  otp_dependency: {
    present: boolean;
    status: ProductionDependencyStatus | null;
    config_reference: string | null;
    external_gated: boolean;
    provider_identifier: string | null;
  };
  blockers: ProductionOtpBlocker[];
  warnings: string[];
  message: string;
  never_fallback_to_mock: true;
};

const LIVE_DEP_STATUSES = new Set<ProductionDependencyStatus>([
  ProductionDependencyStatus.VERIFIED,
]);

export async function evaluateProductionOtpAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string },
): Promise<ProductionOtpAvailability> {
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
      live_otp_enabled: isLiveOtpEnabled(),
      country_production_lifecycle: CountryProductionLifecycle.CONFIGURED,
      otp_dependency: {
        present: false,
        status: null,
        config_reference: null,
        external_gated: true,
        provider_identifier: null,
      },
      blockers: ['COUNTRY_NOT_FOUND'],
      warnings: [],
      message: 'Country not found — production OTP unavailable.',
      never_fallback_to_mock: true,
    };
  }

  const blockers: ProductionOtpBlocker[] = [];
  const warnings: string[] = [];
  const env = readCommunicationEnvironment();
  const liveEnabled = isLiveOtpEnabled();

  if (country.productionLifecycle === CountryProductionLifecycle.SUSPENDED) {
    blockers.push('COUNTRY_PRODUCTION_SUSPENDED');
  } else if (country.productionLifecycle !== CountryProductionLifecycle.ACTIVE) {
    blockers.push('COUNTRY_PRODUCTION_NOT_ACTIVE');
  }

  const dep = await prisma.productionDependency.findFirst({
    where: {
      countryId: country.id,
      dependencyType: 'OTP_PROVIDER',
      environment: 'production',
    },
    orderBy: { updatedAt: 'desc' },
  });

  const otpDependency = {
    present: Boolean(dep),
    status: dep?.status ?? null,
    config_reference: dep?.configReference ?? null,
    external_gated: dep?.externalGated ?? true,
    provider_identifier: dep?.providerIdentifier ?? null,
  };

  if (!dep) {
    blockers.push('OTP_PROVIDER_DEPENDENCY_MISSING');
  } else {
    if (dep.externalGated || dep.status === ProductionDependencyStatus.EXTERNAL_GATED) {
      blockers.push('OTP_PROVIDER_EXTERNAL_GATED');
    }
    if (!LIVE_DEP_STATUSES.has(dep.status)) {
      blockers.push('OTP_PROVIDER_NOT_LIVE');
    }
    if (!dep.configReference?.trim()) {
      blockers.push('SENDER_CONFIG_REF_MISSING');
    }
    if (isMockOtpProvider(dep.providerIdentifier)) {
      blockers.push('MOCK_OTP_PROVIDER_PRODUCTION_FORBIDDEN');
    }
  }

  if (env !== 'production') {
    blockers.push('PRODUCTION_ENVIRONMENT_NOT_SET');
    warnings.push('COMMUNICATION_ENVIRONMENT is not production — sandbox OTP rail remains active.');
  }
  if (!liveEnabled) {
    blockers.push('LIVE_OTP_DISABLED');
  }

  const available = blockers.length === 0;
  return {
    country_code: country.isoAlpha2,
    country_id: country.id,
    available,
    environment: env,
    live_otp_enabled: liveEnabled,
    country_production_lifecycle: country.productionLifecycle,
    otp_dependency: otpDependency,
    blockers: [...new Set(blockers)],
    warnings,
    message: available
      ? 'Production OTP rail is available for this country.'
      : `Production OTP blocked: ${[...new Set(blockers)].join(', ')}`,
    never_fallback_to_mock: true,
  };
}

/** Throws structured fail-closed problem — never falls back to mock/console OTP. */
export async function assertProductionOtpAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string },
): Promise<ProductionOtpAvailability> {
  const result = await evaluateProductionOtpAvailable(prisma, input);
  if (result.available) {
    return result;
  }
  const primary = result.blockers[0] ?? 'LIVE_OTP_DISABLED';
  throw Errors.problem(409, primary, 'Production OTP unavailable', result.message);
}
