/**
 * Sprint 48 — Pure healthcare partner readiness evaluation (compose, do not invent licences).
 */
import type { CountryProductionLifecycle, PartnerStatus } from '@prisma/client';
import { mapPartnerStatusToOpsPhase, type PharmacyPartnerOpsPhase } from '../partner/partner-lifecycle';
import { requirementCodesForProvider } from './healthcare-environment';

export type HealthcareProviderKind = 'DOCTOR' | 'LAB' | 'IMAGING_CENTER' | 'RADIOLOGIST';

export type HealthcareCredentialVerificationClass =
  | 'OPERATOR_VERIFIED'
  | 'EXTERNAL_REGISTRY_VERIFIED'
  | 'UNVERIFIED';

export type HealthcareReadinessStatus = 'READY' | 'BLOCKED' | 'EXTERNAL_GATED' | 'SUSPENDED';

export type HealthcarePartnerBlocker =
  | 'PARTNER_NOT_FOUND'
  | 'PARTNER_NOT_ACTIVE'
  | 'PARTNER_SUSPENDED'
  | 'PARTNER_REJECTED'
  | 'PROFILE_MISSING'
  | 'CREDENTIAL_NOT_VERIFIED'
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_REJECTED'
  | 'ORGANIZATION_NOT_LINKED'
  | 'ORGANIZATION_INACTIVE'
  | 'CAPABILITY_NOT_ELIGIBLE'
  | 'REGULATORY_REQUIREMENT_MISSING'
  | 'REGULATORY_EVIDENCE_EXPIRED'
  | 'REGULATORY_EVIDENCE_MISSING'
  | 'COUNTRY_NOT_PRODUCTION_ACTIVE'
  | 'COUNTRY_PRODUCTION_SUSPENDED'
  | 'INTEGRATION_EXTERNAL_GATED'
  | 'INTEGRATION_MISSING'
  | 'SANDBOX_ATTESTATION_NOT_LEGAL_ACCREDITATION';

export type HealthcareRegulatoryRow = {
  code: string;
  label: string;
  mandatory: boolean;
  applicable: boolean;
  satisfied: boolean;
  evidence_status: string | null;
  blocker: HealthcarePartnerBlocker | null;
};

export type HealthcareIntegrationRow = {
  dependency_type: string;
  status: string;
  present: boolean;
  external_gated: boolean;
  live: boolean;
};

export type HealthcarePartnerReadinessInput = {
  kind: HealthcareProviderKind;
  partner_id: string | null;
  partner_status: PartnerStatus | null;
  country_code: string;
  country_id: string;
  production_lifecycle: CountryProductionLifecycle;
  organization_id: string | null;
  organization_active: boolean;
  profile_present: boolean;
  credential: {
    present: boolean;
    status: string | null;
    expires_on: string | null;
    verification_class: HealthcareCredentialVerificationClass;
  } | null;
  capability_eligible: boolean | null;
  capability_note: string | null;
  regulatory_rows: HealthcareRegulatoryRow[];
  integrations: HealthcareIntegrationRow[];
  now?: Date;
};

export type HealthcarePartnerReadiness = {
  kind: HealthcareProviderKind;
  partner_id: string | null;
  country_code: string;
  lifecycle: PharmacyPartnerOpsPhase | 'UNKNOWN';
  partner_status: PartnerStatus | null;
  credential: HealthcarePartnerReadinessInput['credential'];
  organization: { linked: boolean; active: boolean };
  capability: { eligible: boolean | null; note: string | null };
  country_production: {
    lifecycle: CountryProductionLifecycle;
    active: boolean;
    suspended: boolean;
  };
  regulatory: HealthcareRegulatoryRow[];
  integrations: HealthcareIntegrationRow[];
  final_status: HealthcareReadinessStatus;
  ready_for_activation: boolean;
  bookable_sandbox: boolean;
  bookable_production: boolean;
  blockers: HealthcarePartnerBlocker[];
  warnings: string[];
  never_claim_live_integrations: true;
  message: string;
};

export function isCredentialExpired(expiresOn: string | null | undefined, now = new Date()): boolean {
  if (!expiresOn) return false;
  const exp = new Date(expiresOn);
  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() <= now.getTime();
}

export function computeHealthcarePartnerReadiness(
  input: HealthcarePartnerReadinessInput,
): HealthcarePartnerReadiness {
  const now = input.now ?? new Date();
  const blockers: HealthcarePartnerBlocker[] = [];
  const warnings: string[] = [];

  if (!input.partner_id || !input.partner_status) {
    blockers.push('PARTNER_NOT_FOUND');
  } else if (
    input.partner_status === 'SUSPENDED' ||
    input.partner_status === 'BLOCKED' ||
    input.partner_status === 'DEACTIVATED'
  ) {
    blockers.push('PARTNER_SUSPENDED');
  } else if (input.partner_status === 'REJECTED') {
    blockers.push('PARTNER_REJECTED');
  } else if (input.partner_status !== 'ACTIVE') {
    blockers.push('PARTNER_NOT_ACTIVE');
  }

  if (!input.profile_present && (input.kind === 'DOCTOR' || input.kind === 'RADIOLOGIST')) {
    blockers.push('PROFILE_MISSING');
  }

  if (!input.organization_id) {
    if (input.kind === 'LAB' || input.kind === 'IMAGING_CENTER') {
      blockers.push('ORGANIZATION_NOT_LINKED');
    }
  } else if (!input.organization_active) {
    blockers.push('ORGANIZATION_INACTIVE');
  }

  if (input.kind === 'DOCTOR' || input.kind === 'RADIOLOGIST') {
    if (!input.credential?.present) {
      blockers.push('CREDENTIAL_NOT_VERIFIED');
    } else if (input.credential.status === 'REJECTED') {
      blockers.push('CREDENTIAL_REJECTED');
    } else if (input.credential.status !== 'VERIFIED') {
      blockers.push('CREDENTIAL_NOT_VERIFIED');
    } else if (isCredentialExpired(input.credential.expires_on, now)) {
      blockers.push('CREDENTIAL_EXPIRED');
    }
    if (input.credential?.verification_class === 'OPERATOR_VERIFIED') {
      warnings.push('CREDENTIAL_OPERATOR_VERIFIED_NOT_REGISTRY');
    }
  }

  if (input.capability_eligible === false) {
    blockers.push('CAPABILITY_NOT_ELIGIBLE');
  }
  if (input.kind === 'LAB' || input.kind === 'IMAGING_CENTER') {
    warnings.push('SANDBOX_ATTESTATION_NOT_LEGAL_ACCREDITATION');
  }

  for (const row of input.regulatory_rows) {
    if (!row.applicable || !row.mandatory) continue;
    if (row.blocker && !blockers.includes(row.blocker)) {
      blockers.push(row.blocker);
    }
  }

  if (input.production_lifecycle === 'SUSPENDED') {
    blockers.push('COUNTRY_PRODUCTION_SUSPENDED');
  }

  const integrationBlockers: HealthcarePartnerBlocker[] = [];
  for (const integ of input.integrations) {
    if (!integ.present) {
      integrationBlockers.push('INTEGRATION_MISSING');
    } else if (integ.external_gated || !integ.live) {
      integrationBlockers.push('INTEGRATION_EXTERNAL_GATED');
    }
  }
  const uniqueIntegration = [...new Set(integrationBlockers)];
  for (const code of uniqueIntegration) {
    if (!blockers.includes(code)) blockers.push(code);
  }

  const suspended =
    blockers.includes('PARTNER_SUSPENDED') || blockers.includes('COUNTRY_PRODUCTION_SUSPENDED');
  const hardOps = blockers.filter(
    (b) =>
      b !== 'INTEGRATION_EXTERNAL_GATED' &&
      b !== 'INTEGRATION_MISSING' &&
      b !== 'COUNTRY_NOT_PRODUCTION_ACTIVE',
  );
  const sandboxOk = hardOps.length === 0 && !suspended;
  const productionActive = input.production_lifecycle === 'ACTIVE';
  if (!productionActive && !suspended) {
    warnings.push('COUNTRY_PRODUCTION_NOT_ACTIVE');
  }

  let final_status: HealthcareReadinessStatus = 'BLOCKED';
  if (suspended) final_status = 'SUSPENDED';
  else if (sandboxOk && uniqueIntegration.length > 0) final_status = 'EXTERNAL_GATED';
  else if (sandboxOk) final_status = 'READY';
  else final_status = 'BLOCKED';

  const lifecycle = input.partner_status
    ? mapPartnerStatusToOpsPhase(input.partner_status)
    : 'UNKNOWN';

  return {
    kind: input.kind,
    partner_id: input.partner_id,
    country_code: input.country_code,
    lifecycle,
    partner_status: input.partner_status,
    credential: input.credential,
    organization: {
      linked: Boolean(input.organization_id),
      active: input.organization_active,
    },
    capability: {
      eligible: input.capability_eligible,
      note: input.capability_note,
    },
    country_production: {
      lifecycle: input.production_lifecycle,
      active: productionActive,
      suspended: input.production_lifecycle === 'SUSPENDED',
    },
    regulatory: input.regulatory_rows,
    integrations: input.integrations,
    final_status,
    ready_for_activation: final_status === 'READY' && productionActive && uniqueIntegration.length === 0,
    bookable_sandbox: sandboxOk,
    bookable_production: sandboxOk && productionActive && uniqueIntegration.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    never_claim_live_integrations: true,
    message:
      final_status === 'READY'
        ? 'Sandbox healthcare partner operationally ready. Live eRx/PACS/video/HL7 remain EXTERNAL_GATED until real providers are configured.'
        : final_status === 'EXTERNAL_GATED'
          ? 'Partner ops gates passed; required live clinical integrations remain EXTERNAL_GATED.'
          : final_status === 'SUSPENDED'
            ? 'Provider or country production is suspended — new production healthcare transactions fail closed.'
            : `Healthcare partner blocked: ${[...new Set(blockers)].join(', ')}`,
  };
}

export function emptyRegulatoryRows(
  kind: HealthcareProviderKind,
  configured: Array<{ code: string; label: string; status: string }>,
): HealthcareRegulatoryRow[] {
  const applicable = new Set(requirementCodesForProvider(kind));
  return configured
    .filter((row) => applicable.has(row.code))
    .map((row) => {
      const mandatory = row.status === 'REQUIRED';
      return {
        code: row.code,
        label: row.label,
        mandatory,
        applicable: true,
        satisfied: false,
        evidence_status: 'NOT_CONFIGURED',
        blocker: mandatory ? 'REGULATORY_EVIDENCE_MISSING' : null,
      };
    });
}
