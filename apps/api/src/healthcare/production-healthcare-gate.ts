/**
 * Sprint 48 — Production healthcare integration gate (eRx/video/PACS/DICOM/HL7/FHIR).
 * Never treats sandbox adapters as live clinical integrations.
 */
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import type { PrismaService } from '../app/prisma.service';
import {
  HEALTHCARE_INTEGRATION_TYPES,
  integrationTypesForProvider,
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
  type HealthcareIntegrationType,
} from './healthcare-environment';
import type { HealthcareProviderKind } from './healthcare-partner-readiness';

export type ProductionHealthcareBlocker =
  | 'COUNTRY_NOT_FOUND'
  | 'COUNTRY_PRODUCTION_NOT_ACTIVE'
  | 'COUNTRY_PRODUCTION_SUSPENDED'
  | 'HEALTHCARE_LIVE_DISABLED'
  | 'PRODUCTION_ENVIRONMENT_NOT_SET'
  | 'INTEGRATION_MISSING'
  | 'INTEGRATION_EXTERNAL_GATED'
  | 'INTEGRATION_NOT_VERIFIED'
  | 'NO_PRODUCTION_CLINICAL_ADAPTER';

export type ProductionHealthcareAvailability = {
  country_code: string;
  country_id: string;
  kind: HealthcareProviderKind;
  available: boolean;
  environment: 'sandbox' | 'production';
  live_healthcare_enabled: boolean;
  country_production_lifecycle: CountryProductionLifecycle;
  integrations: Array<{
    dependency_type: HealthcareIntegrationType;
    present: boolean;
    status: ProductionDependencyStatus | null;
    external_gated: boolean;
    config_reference: string | null;
  }>;
  blockers: ProductionHealthcareBlocker[];
  message: string;
  never_fallback_to_sandbox_adapter: true;
};

export async function evaluateProductionHealthcareAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string; kind: HealthcareProviderKind },
): Promise<ProductionHealthcareAvailability> {
  const country = input.countryId
    ? await prisma.country.findUnique({ where: { id: input.countryId } })
    : input.countryCode
      ? await prisma.country.findUnique({
          where: { isoAlpha2: input.countryCode.trim().toUpperCase() },
        })
      : null;

  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const needed = integrationTypesForProvider(input.kind);

  if (!country) {
    return {
      country_code: input.countryCode?.toUpperCase() ?? '',
      country_id: input.countryId ?? '',
      kind: input.kind,
      available: false,
      environment: env,
      live_healthcare_enabled: live,
      country_production_lifecycle: CountryProductionLifecycle.CONFIGURED,
      integrations: needed.map((dependency_type) => ({
        dependency_type,
        present: false,
        status: null,
        external_gated: true,
        config_reference: null,
      })),
      blockers: ['COUNTRY_NOT_FOUND'],
      message: 'Country not found — production healthcare unavailable.',
      never_fallback_to_sandbox_adapter: true,
    };
  }

  const blockers: ProductionHealthcareBlocker[] = [];
  if (env !== 'production') blockers.push('PRODUCTION_ENVIRONMENT_NOT_SET');
  if (!live) blockers.push('HEALTHCARE_LIVE_DISABLED');
  if (country.productionLifecycle === CountryProductionLifecycle.SUSPENDED) {
    blockers.push('COUNTRY_PRODUCTION_SUSPENDED');
  } else if (country.productionLifecycle !== CountryProductionLifecycle.ACTIVE) {
    blockers.push('COUNTRY_PRODUCTION_NOT_ACTIVE');
  }

  const integrations: ProductionHealthcareAvailability['integrations'] = [];
  for (const dependency_type of needed) {
    const dep = await prisma.productionDependency.findFirst({
      where: {
        OR: [{ countryId: country.id }, { countryId: null }],
        dependencyType: dependency_type,
        environment: 'production',
      },
      orderBy: { updatedAt: 'desc' },
    });
    const status = dep?.status ?? null;
    const external =
      !dep ||
      status === ProductionDependencyStatus.EXTERNAL_GATED ||
      status === ProductionDependencyStatus.MISSING ||
      status === ProductionDependencyStatus.BLOCKED;
    if (!dep) blockers.push('INTEGRATION_MISSING');
    else if (status === ProductionDependencyStatus.EXTERNAL_GATED) blockers.push('INTEGRATION_EXTERNAL_GATED');
    else if (status !== ProductionDependencyStatus.VERIFIED) blockers.push('INTEGRATION_NOT_VERIFIED');
    integrations.push({
      dependency_type,
      present: Boolean(dep),
      status,
      external_gated: external,
      config_reference: dep?.configReference ?? null,
    });
  }

  // No live clinical SDK adapters are registered in this repository.
  blockers.push('NO_PRODUCTION_CLINICAL_ADAPTER');

  const unique = [...new Set(blockers)];
  return {
    country_code: country.isoAlpha2,
    country_id: country.id,
    kind: input.kind,
    available: unique.length === 0,
    environment: env,
    live_healthcare_enabled: live,
    country_production_lifecycle: country.productionLifecycle,
    integrations,
    blockers: unique,
    message:
      unique.length === 0
        ? 'Production healthcare integrations available.'
        : `Production healthcare blocked: ${unique.join(', ')}`,
    never_fallback_to_sandbox_adapter: true,
  };
}

export async function assertProductionHealthcareAvailable(
  prisma: PrismaService,
  input: { countryCode?: string; countryId?: string; kind: HealthcareProviderKind },
): Promise<ProductionHealthcareAvailability> {
  const result = await evaluateProductionHealthcareAvailable(prisma, input);
  if (result.available) return result;
  throw Errors.problem(
    409,
    result.blockers[0] ?? 'NO_PRODUCTION_CLINICAL_ADAPTER',
    'Production healthcare unavailable',
    result.message,
  );
}

export function listHealthcareIntegrationCatalog(): Array<{
  dependency_type: HealthcareIntegrationType;
  status: 'EXTERNAL_GATED';
  note: string;
}> {
  return HEALTHCARE_INTEGRATION_TYPES.map((dependency_type) => ({
    dependency_type,
    status: 'EXTERNAL_GATED' as const,
    note: 'Sandbox adapter only. Live clinical integration is not registered in this repository.',
  }));
}
