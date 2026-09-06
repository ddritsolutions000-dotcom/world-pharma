/**
 * Sprint 50 — First-country launch package, runbook, and activation dry-run.
 * Country-neutral. Composes FinalLaunchReadinessService; never mutates on dry-run.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import {
  FinalLaunchReadinessService,
  type FinalLaunchReadinessResult,
} from './final-launch-readiness.service';
import type { LaunchBlockerDetail, LaunchDimensionStatus } from './final-launch-readiness';
import {
  RUNBOOK_STAGE_LABELS,
  listKnownProductionDependencyCatalog,
  taxonomyCounts,
  type BlockerTaxonomy,
  type LaunchRunbookStage,
} from './launch-blocker-actionability';

export type FirstCountryPackageSection = {
  id:
    | 'COUNTRY'
    | 'LEGAL'
    | 'PARTNER_NETWORK'
    | 'HEALTHCARE'
    | 'PAYMENTS'
    | 'COMMUNICATIONS'
    | 'LOGISTICS'
    | 'INFRASTRUCTURE'
    | 'SECURITY'
    | 'OPERATIONAL_OWNERSHIP'
    | 'LAUNCH_DECISION';
  label: string;
  status: LaunchDimensionStatus | 'NOT_READY' | 'READY_FOR_ACTIVATION' | 'SUSPENDED' | 'INFO';
  summary: string;
  blocker_codes: string[];
  next_action: string | null;
};

export type LaunchRunbookItem = {
  id: string;
  stage: LaunchRunbookStage;
  stage_label: string;
  label: string;
  status: LaunchDimensionStatus | 'PENDING' | 'READY' | 'BLOCKED' | 'EXTERNAL_GATED';
  blocker_code: string | null;
  taxonomy: BlockerTaxonomy | null;
  can_clear_from_application: boolean | null;
};

export type ActivationDryRunResult = {
  country_code: string;
  result: 'PASS' | 'FAIL';
  would_activate: false;
  mutated: false;
  never_mutates: true;
  overall_decision: FinalLaunchReadinessResult['overall_decision'];
  activation_impossible: boolean;
  why_not_launch: string;
  next_action: string | null;
  evaluated_at: string;
  taxonomy_counts: Record<BlockerTaxonomy, number>;
  blockers: LaunchBlockerDetail[];
  internal_blockers: LaunchBlockerDetail[];
  external_blockers: LaunchBlockerDetail[];
  production_lifecycle_before: string;
  production_lifecycle_after: string;
  audit_event_emitted: boolean;
  hidden_gate_audit: {
    catalogued_dependencies: ReturnType<typeof listKnownProductionDependencyCatalog>;
    note: string;
  };
};

export type FirstCountryLaunchPackage = {
  country_code: string;
  country_id: string;
  country_neutral: true;
  no_india_assumptions: true;
  evaluated_at: string;
  overall_decision: FinalLaunchReadinessResult['overall_decision'];
  why_not_launch: string;
  next_action: string | null;
  taxonomy_counts: Record<BlockerTaxonomy, number>;
  sections: FirstCountryPackageSection[];
  runbook: LaunchRunbookItem[];
  readiness: FinalLaunchReadinessResult;
  never_fake_green: true;
  never_expose_secrets: true;
  never_expose_phi: true;
};

@Injectable()
export class FirstCountryLaunchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finalLaunch: FinalLaunchReadinessService,
    private readonly security: SecurityEventsService,
  ) {}

  async buildPackage(countryCode: string): Promise<FirstCountryLaunchPackage> {
    const readiness = await this.finalLaunch.evaluate(countryCode);
    const why = this.whyNotLaunch(readiness);
    const next = this.nextAction(readiness);
    const counts = taxonomyCounts(readiness.blockers);
    return {
      country_code: readiness.country_code,
      country_id: readiness.country_id,
      country_neutral: true,
      no_india_assumptions: true,
      evaluated_at: readiness.evaluated_at,
      overall_decision: readiness.overall_decision,
      why_not_launch: why,
      next_action: next,
      taxonomy_counts: counts,
      sections: this.buildSections(readiness),
      runbook: this.buildRunbook(readiness),
      readiness,
      never_fake_green: true,
      never_expose_secrets: true,
      never_expose_phi: true,
    };
  }

  /**
   * Safe activation dry-run: evaluates all requirements, never activates, never mutates lifecycle.
   */
  async activationDryRun(
    countryCode: string,
    principal?: Principal,
  ): Promise<ActivationDryRunResult> {
    const iso = countryCode.trim().toUpperCase();
    const before = await this.prisma.country.findUnique({ where: { isoAlpha2: iso } });
    if (!before) {
      throw Errors.notFound('Country not found');
    }
    const lifecycleBefore = before.productionLifecycle;
    const readiness = await this.finalLaunch.evaluate(iso);
    const pass = readiness.overall_decision === 'READY_FOR_ACTIVATION';
    const after = await this.prisma.country.findUnique({ where: { isoAlpha2: iso } });
    if (!after || after.productionLifecycle !== lifecycleBefore) {
      throw Errors.problem(
        500,
        'DRY_RUN_MUTATION_DETECTED',
        'Dry-run safety failure',
        'Activation dry-run must never mutate country production state',
      );
    }

    let audit = false;
    if (principal) {
      await this.security.emit({
        type: 'COUNTRY_ACTIVATION_DRY_RUN',
        outcome: 'success',
        personId: principal.personId,
        metadata: {
          country_code: iso,
          result: pass ? 'PASS' : 'FAIL',
          overall_decision: readiness.overall_decision,
          blocker_count: readiness.blockers.length,
          mutated: false,
        },
      });
      audit = true;
    }

    const internal = readiness.blockers.filter((b) => b.actionable === 'INTERNAL');
    const external = readiness.blockers.filter((b) => b.actionable === 'EXTERNAL');

    return {
      country_code: iso,
      result: pass ? 'PASS' : 'FAIL',
      would_activate: false,
      mutated: false,
      never_mutates: true,
      overall_decision: readiness.overall_decision,
      activation_impossible: readiness.activation_impossible,
      why_not_launch: this.whyNotLaunch(readiness),
      next_action: this.nextAction(readiness),
      evaluated_at: readiness.evaluated_at,
      taxonomy_counts: taxonomyCounts(readiness.blockers),
      blockers: readiness.blockers,
      internal_blockers: internal,
      external_blockers: external,
      production_lifecycle_before: lifecycleBefore,
      production_lifecycle_after: after.productionLifecycle,
      audit_event_emitted: audit,
      hidden_gate_audit: {
        catalogued_dependencies: listKnownProductionDependencyCatalog(),
        note:
          'Mandatory production rails from S43–S48 are composed into final launch readiness. Dry-run does not invent missing providers.',
      },
    };
  }

  whyNotLaunch(readiness: FinalLaunchReadinessResult): string {
    if (readiness.overall_decision === 'READY_FOR_ACTIVATION') {
      return 'All mandatory dimensions are READY — activation may proceed when explicitly authorized.';
    }
    if (readiness.overall_decision === 'SUSPENDED') {
      return 'Country production is SUSPENDED — resume lifecycle and resolve blockers before activation.';
    }
    const top = readiness.blockers.slice(0, 5).map((b) => b.code);
    const externalCount = readiness.blockers.filter((b) => b.actionable === 'EXTERNAL').length;
    const internalCount = readiness.blockers.filter((b) => b.actionable === 'INTERNAL').length;
    return `NOT_READY: ${readiness.blockers.length} blocker(s) (${internalCount} internal, ${externalCount} external). Top: ${top.join(', ') || 'none'}.`;
  }

  nextAction(readiness: FinalLaunchReadinessResult): string | null {
    if (readiness.overall_decision === 'READY_FOR_ACTIVATION') {
      return 'Run activation dry-run, then explicit Admin production activate (audited).';
    }
    const internal = readiness.blockers.find((b) => b.actionable === 'INTERNAL');
    if (internal) {
      return `${internal.actionability.resolving_workflow} (${internal.code})`;
    }
    const external = readiness.blockers[0];
    if (external) {
      return `External dependency required: ${external.actionability.required_provider_class ?? external.code} — cannot clear from app alone.`;
    }
    return null;
  }

  private buildSections(readiness: FinalLaunchReadinessResult): FirstCountryPackageSection[] {
    const dim = (id: string) => readiness.dimensions.find((d) => d.id === id);
    const codes = (id: string) =>
      readiness.blockers.filter((b) => b.dimension === id).map((b) => b.code);

    const software = dim('SOFTWARE');
    const legal = dim('LEGAL');
    const partners = dim('PARTNER_NETWORK');
    const healthcare = dim('HEALTHCARE');
    const payments = dim('PAYMENTS');
    const communications = dim('COMMUNICATIONS');
    const logistics = dim('LOGISTICS');
    const infra = dim('INFRASTRUCTURE');

    const securityCodes = readiness.blockers
      .filter((b) => b.taxonomy === 'SECURITY_REQUIRED' || /KMS|MALWARE|PITR|BACKUP|TLS|MONITOR/i.test(b.code))
      .map((b) => b.code);

    return [
      {
        id: 'COUNTRY',
        label: 'Country',
        status: software?.status ?? 'BLOCKED',
        summary: `Lifecycle ${readiness.production_lifecycle}. Software dimension: ${software?.status ?? 'UNKNOWN'}.`,
        blocker_codes: codes('SOFTWARE'),
        next_action: software?.status === 'READY' ? null : 'Complete country/policy configuration (Stage 1)',
      },
      {
        id: 'LEGAL',
        label: 'Legal / regulatory',
        status: legal?.status ?? 'BLOCKED',
        summary: legal?.summary ?? 'Legal readiness unknown',
        blocker_codes: codes('LEGAL'),
        next_action: legal?.status === 'READY' ? null : 'Publish policy + verify non-expired evidence',
      },
      {
        id: 'PARTNER_NETWORK',
        label: 'Pharmacy / partner network',
        status: partners?.status ?? 'BLOCKED',
        summary: partners?.summary ?? 'Partner readiness unknown',
        blocker_codes: codes('PARTNER_NETWORK'),
        next_action: partners?.status === 'READY' ? null : 'Licence / KYC / commercial workflows',
      },
      {
        id: 'HEALTHCARE',
        label: 'Healthcare network',
        status: healthcare?.status ?? 'EXTERNAL_GATED',
        summary: healthcare?.summary ?? 'Healthcare EXTERNAL_GATED',
        blocker_codes: codes('HEALTHCARE'),
        next_action: 'Genuine clinical partners/integrations required',
      },
      {
        id: 'PAYMENTS',
        label: 'Payments',
        status: payments?.status ?? 'EXTERNAL_GATED',
        summary: payments?.summary ?? 'Payments EXTERNAL_GATED',
        blocker_codes: codes('PAYMENTS'),
        next_action: 'Contract PSP + R14-A (not fakeable)',
      },
      {
        id: 'COMMUNICATIONS',
        label: 'Communications',
        status: communications?.status ?? 'EXTERNAL_GATED',
        summary: communications?.summary ?? 'Communications EXTERNAL_GATED',
        blocker_codes: codes('COMMUNICATIONS'),
        next_action: 'Contract OTP/messaging providers',
      },
      {
        id: 'LOGISTICS',
        label: 'Logistics',
        status: logistics?.status ?? 'EXTERNAL_GATED',
        summary: logistics?.summary ?? 'Logistics EXTERNAL_GATED',
        blocker_codes: codes('LOGISTICS'),
        next_action: 'Contract carrier/fleet + live adapter',
      },
      {
        id: 'INFRASTRUCTURE',
        label: 'Infrastructure',
        status: infra?.status ?? 'EXTERNAL_GATED',
        summary: infra?.summary ?? 'Infrastructure EXTERNAL_GATED',
        blocker_codes: codes('INFRASTRUCTURE'),
        next_action: 'Provision production cloud infra',
      },
      {
        id: 'SECURITY',
        label: 'Security',
        status: securityCodes.length ? 'EXTERNAL_GATED' : infra?.status ?? 'EXTERNAL_GATED',
        summary: 'KMS, malware scanning, backups/PITR, monitoring — EXTERNAL_GATED until genuine ops controls exist.',
        blocker_codes: securityCodes,
        next_action: 'Complete security/recovery Stage 5 with real providers',
      },
      {
        id: 'OPERATIONAL_OWNERSHIP',
        label: 'Operational ownership',
        status: 'INFO',
        summary:
          'Main Admin (policy:publish) owns activation. Partner managers own licence/KYC/commercial. Payment/ops owners own external provider unlocks. No self-fake verification.',
        blocker_codes: [],
        next_action: 'Assign owners per taxonomy; clear internal blockers first',
      },
      {
        id: 'LAUNCH_DECISION',
        label: 'Launch decision',
        status: readiness.overall_decision,
        summary: this.whyNotLaunch(readiness),
        blocker_codes: readiness.blockers.map((b) => b.code),
        next_action: this.nextAction(readiness),
      },
    ];
  }

  private buildRunbook(readiness: FinalLaunchReadinessResult): LaunchRunbookItem[] {
    const byCode = (code: string | null) =>
      code ? readiness.blockers.find((b) => b.code === code) ?? null : null;

    const item = (
      id: string,
      stage: LaunchRunbookStage,
      label: string,
      status: LaunchRunbookItem['status'],
      blocker_code: string | null,
    ): LaunchRunbookItem => {
      const blocker = byCode(blocker_code);
      return {
        id,
        stage,
        stage_label: RUNBOOK_STAGE_LABELS[stage],
        label,
        status,
        blocker_code,
        taxonomy: blocker?.taxonomy ?? (blocker_code ? null : null),
        can_clear_from_application: blocker?.actionability.can_clear_from_application ?? null,
      };
    };

    const software = readiness.dimensions.find((d) => d.id === 'SOFTWARE');
    const legal = readiness.dimensions.find((d) => d.id === 'LEGAL');
    const partners = readiness.dimensions.find((d) => d.id === 'PARTNER_NETWORK');
    const payments = readiness.dimensions.find((d) => d.id === 'PAYMENTS');
    const communications = readiness.dimensions.find((d) => d.id === 'COMMUNICATIONS');
    const logistics = readiness.dimensions.find((d) => d.id === 'LOGISTICS');
    const infra = readiness.dimensions.find((d) => d.id === 'INFRASTRUCTURE');
    const healthcare = readiness.dimensions.find((d) => d.id === 'HEALTHCARE');

    return [
      item('s1_country', 1, 'Country configured (currency/locale/timezone)', software?.status ?? 'BLOCKED', software?.status === 'READY' ? null : 'CURRENCY_NOT_CONFIGURED'),
      item('s1_policy', 1, 'Applicable policy pack configured/published', software?.status ?? 'BLOCKED', readiness.blockers.find((b) => /POLICY_PACK/i.test(b.code))?.code ?? null),
      item('s1_payments_policy', 1, 'Supported payment methods configured in policy', software?.status ?? 'BLOCKED', readiness.blockers.find((b) => /PAYMENT_POLICY/i.test(b.code))?.code ?? null),
      item('s1_serviceability', 1, 'Serviceability configured', software?.status ?? 'BLOCKED', readiness.blockers.find((b) => /SERVICEABILITY/i.test(b.code))?.code ?? null),
      item('s2_policy', 2, 'Healthcare policy published', legal?.status ?? 'BLOCKED', readiness.blockers.find((b) => /HEALTHCARE_POLICY|LEGAL_POLICY/i.test(b.code))?.code ?? null),
      item('s2_evidence', 2, 'Required evidence verified and non-expired', legal?.status ?? 'BLOCKED', readiness.blockers.find((b) => /LEGAL_EVIDENCE/i.test(b.code))?.code ?? 'LEGAL_EVIDENCE_MISSING'),
      item('s3_pharmacy', 3, 'Pharmacy partners + licence', partners?.status ?? 'BLOCKED', 'PHARMACY_LICENCE_MISSING'),
      item('s3_kyc', 3, 'KYC verification', partners?.status ?? 'BLOCKED', 'KYC_NOT_VERIFIED'),
      item('s3_commercial', 3, 'Commercial approval', partners?.status ?? 'BLOCKED', 'COMMERCIAL_APPROVAL_MISSING'),
      item('s3_catalog', 3, 'Catalogue / inventory / serviceability readiness', partners?.status ?? 'BLOCKED', partners?.status === 'READY' ? null : 'PHARMACY_LICENCE_MISSING'),
      item('s4_psp', 4, 'Production PSP (non-mock)', payments?.status ?? 'EXTERNAL_GATED', payments?.status === 'READY' ? null : 'PAYMENT_PROVIDER_EXTERNAL_GATED'),
      item('s4_otp', 4, 'Production OTP provider', communications?.status ?? 'EXTERNAL_GATED', communications?.status === 'READY' ? null : 'OTP_PROVIDER_EXTERNAL_GATED'),
      item('s4_messaging', 4, 'Transactional messaging provider(s)', communications?.status ?? 'EXTERNAL_GATED', 'MESSAGING_PROVIDER_EXTERNAL_GATED'),
      item('s4_carrier', 4, 'Production carrier/fleet', logistics?.status ?? 'EXTERNAL_GATED', 'CARRIER_EXTERNAL_GATED'),
      item('s4_healthcare', 4, 'Healthcare integrations (eRx/video/PACS/HL7/FHIR)', healthcare?.status ?? 'EXTERNAL_GATED', 'NO_PRODUCTION_CLINICAL_ADAPTER'),
      item('s5_kms', 5, 'Secrets / KMS', 'EXTERNAL_GATED', 'KMS_SECRETS_EXTERNAL_GATED'),
      item('s5_malware', 5, 'Malware scanning', 'EXTERNAL_GATED', 'MALWARE_SCANNER_EXTERNAL_GATED'),
      item('s5_pitr', 5, 'Backups / PITR / offsite recovery', 'EXTERNAL_GATED', 'PITR_EXTERNAL_GATED'),
      item('s5_monitor', 5, 'Monitoring / TLS / deployment readiness', infra?.status ?? 'EXTERNAL_GATED', infra?.status === 'READY' ? null : 'STORAGE_EXTERNAL_GATED'),
      item(
        's6_dimensions',
        6,
        'All mandatory dimensions READY',
        readiness.overall_decision === 'READY_FOR_ACTIVATION' ? 'READY' : 'BLOCKED',
        readiness.overall_decision === 'READY_FOR_ACTIVATION' ? null : 'FINAL_LAUNCH_NOT_READY',
      ),
      item(
        's6_activate',
        6,
        'Explicit Admin activation + audit → ACTIVE',
        readiness.production_lifecycle === 'ACTIVE' ? 'READY' : 'PENDING',
        readiness.production_lifecycle === 'ACTIVE' ? null : 'LIFECYCLE_NOT_ACTIVE',
      ),
    ];
  }
}
