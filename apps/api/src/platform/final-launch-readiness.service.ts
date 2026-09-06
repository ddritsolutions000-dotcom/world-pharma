/**
 * Sprint 49 — Authoritative Final Real-Market Launch Readiness (compose S39–S48 gates).
 * Fail-closed. Never converts EXTERNAL_GATED into READY. No secrets/PHI in payload.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { isLivePaymentEnabled, readPaymentEnvironment } from '../payment/payment.config';
import { evaluateProductionPaymentAvailable } from '../payment/production-payment-gate';
import { evaluateProductionOtpAvailable } from '../identity/production-otp-gate';
import { evaluateProductionMessagingAvailable } from './production-messaging-gate';
import { evaluateProductionLogisticsAvailable } from '../logistics/production-logistics-gate';
import { evaluateProductionInfrastructureAvailable } from '../ops/production-infrastructure-gate';
import {
  evaluateProductionHealthcareAvailable,
  listHealthcareIntegrationCatalog,
} from '../healthcare/production-healthcare-gate';
import { CountryProductionService } from './country-production.service';
import {
  DIMENSION_LABELS,
  buildBlockerDetail,
  decideOverall,
  mapCountryDimensionStatus,
  overallToDimensionStatus,
  statusFromGateBlockers,
  type LaunchBlockerDetail,
  type LaunchChecklistItem,
  type LaunchDimensionId,
  type LaunchDimensionStatus,
  type LaunchDimensionView,
  type LaunchOverallDecision,
} from './final-launch-readiness';

export type FinalLaunchReadinessResult = {
  country_code: string;
  country_id: string;
  production_lifecycle: string;
  evaluated_at: string;
  overall_decision: LaunchOverallDecision;
  activation_impossible: boolean;
  software_ready_vs_real_world: {
    software_composition_ready: boolean;
    real_world_dependencies_required: boolean;
    note: string;
  };
  dimensions: LaunchDimensionView[];
  blockers: LaunchBlockerDetail[];
  checklist: LaunchChecklistItem[];
  external_gated_items: Array<{
    code: string;
    dimension: LaunchDimensionId;
    label: string;
  }>;
  never_fake_green: true;
  never_expose_secrets: true;
  never_expose_phi: true;
  sources: {
    country_production: true;
    payment_gate: true;
    otp_gate: true;
    messaging_gate: true;
    logistics_gate: true;
    infrastructure_gate: true;
    healthcare_gate: true;
  };
};

@Injectable()
export class FinalLaunchReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly countryProduction: CountryProductionService,
  ) {}

  async evaluate(countryCode: string): Promise<FinalLaunchReadinessResult> {
    const iso = countryCode.trim().toUpperCase();
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: iso } });
    if (!country) {
      throw Errors.notFound('Country not found');
    }

    const [
      production,
      payment,
      otp,
      messaging,
      logistics,
      healthcareDoctor,
      healthcareLab,
      healthcareImaging,
    ] = await Promise.all([
      this.countryProduction.evaluate(iso),
      evaluateProductionPaymentAvailable(this.prisma, { countryCode: iso }),
      evaluateProductionOtpAvailable(this.prisma, { countryCode: iso }),
      evaluateProductionMessagingAvailable(this.prisma, { countryCode: iso }),
      evaluateProductionLogisticsAvailable(this.prisma, { countryCode: iso }),
      evaluateProductionHealthcareAvailable(this.prisma, { countryCode: iso, kind: 'DOCTOR' }),
      evaluateProductionHealthcareAvailable(this.prisma, { countryCode: iso, kind: 'LAB' }),
      evaluateProductionHealthcareAvailable(this.prisma, {
        countryCode: iso,
        kind: 'IMAGING_CENTER',
      }),
    ]);
    const infrastructure = evaluateProductionInfrastructureAvailable();

    const blockers: LaunchBlockerDetail[] = [];
    const pushCodes = (
      dimension: LaunchDimensionId,
      codes: string[],
      category: string,
      explanation?: string,
    ) => {
      for (const code of codes) {
        if (blockers.some((b) => b.code === code && b.dimension === dimension)) continue;
        blockers.push(
          buildBlockerDetail({
            code,
            dimension,
            country_code: iso,
            category,
            explanation,
          }),
        );
      }
    };

    const softwareDim = production.dimensions.find((d) => d.dimension === 'SOFTWARE');
    const legalDim = production.dimensions.find((d) => d.dimension === 'LEGAL');
    const partnerDim = production.dimensions.find((d) => d.dimension === 'PARTNER');

    let softwareStatus = mapCountryDimensionStatus(softwareDim?.status ?? 'BLOCKED');
    let legalStatus = mapCountryDimensionStatus(legalDim?.status ?? 'BLOCKED');
    let partnerStatus = mapCountryDimensionStatus(partnerDim?.status ?? 'BLOCKED');

    pushCodes('SOFTWARE', softwareDim?.blockers ?? [], 'software');
    pushCodes('LEGAL', legalDim?.blockers ?? [], 'legal');
    pushCodes('PARTNER_NETWORK', partnerDim?.blockers ?? [], 'partners');

    if (!production.partner_readiness.pharmacy_licence_verified) {
      pushCodes('PARTNER_NETWORK', ['PHARMACY_LICENCE_MISSING'], 'partners');
      if (partnerStatus === 'READY') partnerStatus = 'BLOCKED';
    }
    if (!production.partner_readiness.kyc_verified) {
      pushCodes('PARTNER_NETWORK', ['KYC_NOT_VERIFIED'], 'partners');
      if (partnerStatus === 'READY') partnerStatus = 'BLOCKED';
    }
    if (!production.partner_readiness.commercial_approved) {
      pushCodes('PARTNER_NETWORK', ['COMMERCIAL_APPROVAL_MISSING'], 'partners');
      if (partnerStatus === 'READY') partnerStatus = 'BLOCKED';
    }

    const integrationDim = production.dimensions.find((d) => d.dimension === 'INTEGRATION');
    for (const code of integrationDim?.blockers ?? []) {
      if (/KYC_PROVIDER/i.test(code)) {
        pushCodes('PARTNER_NETWORK', [code], 'partners', 'Live KYC provider remains EXTERNAL_GATED');
      } else if (/PSP|PAYMENT/i.test(code)) {
        pushCodes('PAYMENTS', [code], 'payments');
      } else if (/OTP|MESSAGING/i.test(code)) {
        pushCodes('COMMUNICATIONS', [code], 'communications');
      } else if (/CARRIER/i.test(code)) {
        pushCodes('LOGISTICS', [code], 'logistics');
      }
    }

    const paymentStatus = statusFromGateBlockers(payment.available, payment.blockers);
    pushCodes('PAYMENTS', payment.blockers, 'payments', payment.message);

    const otpStatus = statusFromGateBlockers(otp.available, otp.blockers);
    const messagingStatus = statusFromGateBlockers(messaging.available, messaging.blockers);
    const communicationsStatus = worstStatus([otpStatus, messagingStatus]);
    pushCodes('COMMUNICATIONS', otp.blockers, 'communications', otp.message);
    pushCodes('COMMUNICATIONS', messaging.blockers, 'communications', messaging.message);

    const logisticsStatus = statusFromGateBlockers(logistics.available, logistics.blockers);
    pushCodes('LOGISTICS', logistics.blockers, 'logistics', logistics.message);

    const infraBlockers = [
      ...infrastructure.blockers,
      ...(infrastructure.storage !== 'READY' ? ['STORAGE_EXTERNAL_GATED'] : []),
      ...(infrastructure.malware_scanning !== 'READY' ? ['MALWARE_SCANNER_EXTERNAL_GATED'] : []),
      ...(infrastructure.kms_secrets !== 'READY' ? ['KMS_SECRETS_EXTERNAL_GATED'] : []),
      ...(infrastructure.backups !== 'READY' ? ['BACKUPS_EXTERNAL_GATED'] : []),
      ...(infrastructure.pitr === 'EXTERNAL_GATED' ? ['PITR_EXTERNAL_GATED'] : []),
    ];
    const infraStatus =
      infrastructure.status === 'READY'
        ? 'READY'
        : infrastructure.status === 'BLOCKED'
          ? 'BLOCKED'
          : 'EXTERNAL_GATED';
    pushCodes('INFRASTRUCTURE', infraBlockers, 'infrastructure', infrastructure.message);

    const hcBlockers = [
      ...new Set([
        ...healthcareDoctor.blockers,
        ...healthcareLab.blockers,
        ...healthcareImaging.blockers,
      ]),
    ];
    const healthcareStatus = worstStatus([
      statusFromGateBlockers(healthcareDoctor.available, healthcareDoctor.blockers),
      statusFromGateBlockers(healthcareLab.available, healthcareLab.blockers),
      statusFromGateBlockers(healthcareImaging.available, healthcareImaging.blockers),
    ]);
    pushCodes('HEALTHCARE', hcBlockers, 'healthcare', healthcareDoctor.message);
    for (const integ of listHealthcareIntegrationCatalog()) {
      pushCodes(
        'HEALTHCARE',
        [`${integ.dependency_type}_EXTERNAL_GATED`],
        'healthcare',
        integ.note,
      );
    }

    // Expired / missing regulatory evidence
    for (const row of production.requirement_coverage) {
      if (row.mandatory && row.blocker === 'LEGAL_EVIDENCE_EXPIRED') {
        pushCodes('LEGAL', ['LEGAL_EVIDENCE_EXPIRED'], 'legal', `${row.code} evidence expired`);
        legalStatus = 'BLOCKED';
      }
      if (row.mandatory && !row.satisfied && row.blocker === 'LEGAL_EVIDENCE_MISSING') {
        pushCodes('LEGAL', ['LEGAL_EVIDENCE_MISSING'], 'legal', `${row.code} evidence missing`);
        if (legalStatus === 'READY') legalStatus = 'BLOCKED';
      }
    }

    if (production.production_lifecycle === 'SUSPENDED') {
      pushCodes('SOFTWARE', ['COUNTRY_PRODUCTION_SUSPENDED'], 'lifecycle');
      softwareStatus = 'SUSPENDED';
    }

    const coreDimensions: LaunchDimensionView[] = [
      this.dimensionView('SOFTWARE', softwareStatus, blockers),
      this.dimensionView('LEGAL', legalStatus, blockers),
      this.dimensionView('PARTNER_NETWORK', partnerStatus, blockers),
      this.dimensionView('PAYMENTS', paymentStatus, blockers),
      this.dimensionView('COMMUNICATIONS', communicationsStatus, blockers),
      this.dimensionView('LOGISTICS', logisticsStatus, blockers),
      this.dimensionView('INFRASTRUCTURE', infraStatus, blockers),
      this.dimensionView('HEALTHCARE', healthcareStatus, blockers),
    ];

    const overall = decideOverall(production.production_lifecycle, coreDimensions);
    const dimensions: LaunchDimensionView[] = [
      ...coreDimensions,
      this.dimensionView('OVERALL', overallToDimensionStatus(overall), blockers),
    ];
    const checklist = this.buildChecklist({
      production,
      paymentStatus,
      otpStatus,
      messagingStatus,
      logisticsStatus,
      infraStatus,
      healthcareStatus,
      blockers,
    });

    const external_gated_items = blockers
      .filter((b) => b.actionable === 'EXTERNAL')
      .map((b) => ({
        code: b.code,
        dimension: b.dimension,
        label: DIMENSION_LABELS[b.dimension],
      }));

    return {
      country_code: iso,
      country_id: country.id,
      production_lifecycle: production.production_lifecycle,
      evaluated_at: new Date().toISOString(),
      overall_decision: overall,
      activation_impossible: overall !== 'READY_FOR_ACTIVATION',
      software_ready_vs_real_world: {
        software_composition_ready: coreDimensions.every(
          (d) => d.status === 'READY' || d.status === 'EXTERNAL_GATED',
        ),
        real_world_dependencies_required: external_gated_items.length > 0 || overall !== 'READY_FOR_ACTIVATION',
        note:
          'Software rails and fail-closed gates are composed here. EXTERNAL_GATED means a genuine provider, licence, accreditation, or operator approval is still required — never treat as production-launched.',
      },
      dimensions,
      blockers,
      checklist,
      external_gated_items,
      never_fake_green: true,
      never_expose_secrets: true,
      never_expose_phi: true,
      sources: {
        country_production: true,
        payment_gate: true,
        otp_gate: true,
        messaging_gate: true,
        logistics_gate: true,
        infrastructure_gate: true,
        healthcare_gate: true,
      },
    };
  }

  /**
   * Authoritative fail-closed assert for real-market activation.
   * Never converts EXTERNAL_GATED → READY.
   */
  async assertReadyForActivation(countryCode: string): Promise<FinalLaunchReadinessResult> {
    const result = await this.evaluate(countryCode);
    if (result.overall_decision === 'SUSPENDED') {
      throw Errors.problem(
        409,
        'COUNTRY_PRODUCTION_SUSPENDED',
        'Country production suspended',
        result.blockers.map((b) => b.code).join(',') || 'Country suspended',
      );
    }
    if (result.overall_decision !== 'READY_FOR_ACTIVATION') {
      throw Errors.problem(
        409,
        'FINAL_LAUNCH_NOT_READY',
        'Final launch readiness not met',
        result.blockers
          .slice(0, 20)
          .map((b) => b.code)
          .join(',') || 'Mandatory dimensions remain BLOCKED/EXTERNAL_GATED/NOT_CONFIGURED',
      );
    }
    return result;
  }

  /**
   * Production-bound environments must pass final launch readiness.
   * Sandbox/software lifecycle activation (S42) remains usable when not production-bound.
   */
  async enforceIfProductionBound(countryCode: string): Promise<FinalLaunchReadinessResult> {
    const result = await this.evaluate(countryCode);
    const productionBound =
      readPaymentEnvironment() === 'production' || isLivePaymentEnabled();
    if (!productionBound) {
      return result;
    }
    return this.assertReadyForActivation(countryCode);
  }

  private dimensionView(
    id: LaunchDimensionId,
    status: LaunchDimensionStatus,
    blockers: LaunchBlockerDetail[],
  ): LaunchDimensionView {
    const dimBlockers = blockers.filter((b) => b.dimension === id);
    return {
      id,
      label: DIMENSION_LABELS[id],
      status,
      blocker_count: dimBlockers.length,
      external_gated_count: dimBlockers.filter((b) => b.actionable === 'EXTERNAL').length,
      summary:
        status === 'READY'
          ? `${DIMENSION_LABELS[id]} is ready for real-market activation.`
          : status === 'EXTERNAL_GATED'
            ? `${DIMENSION_LABELS[id]} software boundary exists; live dependency remains EXTERNAL_GATED.`
            : `${DIMENSION_LABELS[id]} is ${status}.`,
      software_ready_note:
        status === 'EXTERNAL_GATED'
          ? 'Software ready ≠ real-world dependency satisfied'
          : status === 'READY'
            ? 'Dimension cleared'
            : 'Not ready for activation',
    };
  }

  private buildChecklist(input: {
    production: Awaited<ReturnType<CountryProductionService['evaluate']>>;
    paymentStatus: LaunchDimensionStatus;
    otpStatus: LaunchDimensionStatus;
    messagingStatus: LaunchDimensionStatus;
    logisticsStatus: LaunchDimensionStatus;
    infraStatus: LaunchDimensionStatus;
    healthcareStatus: LaunchDimensionStatus;
    blockers: LaunchBlockerDetail[];
  }): LaunchChecklistItem[] {
    const p = input.production;
    const item = (
      id: string,
      category: LaunchChecklistItem['category'],
      label: string,
      status: LaunchDimensionStatus,
      blocker_code: string | null,
    ): LaunchChecklistItem => ({
      id,
      category,
      label,
      status,
      blocker_code,
      external: blocker_code ? /EXTERNAL|NO_PRODUCTION|R14_A|PITR/i.test(blocker_code) : status === 'EXTERNAL_GATED',
    });

    const legalBlocker = p.requirement_coverage.find((r) => r.mandatory && !r.satisfied)?.blocker ?? null;
    const legalDimStatus = mapCountryDimensionStatus(
      p.dimensions.find((d) => d.dimension === 'LEGAL')?.status ?? 'BLOCKED',
    );
    return [
      item(
        'healthcare_policy',
        'LEGAL',
        'Healthcare policy published',
        legalDimStatus,
        legalDimStatus === 'READY' ? null : legalBlocker ?? 'LEGAL_POLICY_INCOMPLETE',
      ),
      item(
        'regulatory_evidence',
        'LEGAL',
        'Required regulatory evidence verified and non-expired',
        p.requirement_coverage.every((r) => !r.mandatory || r.satisfied) ? 'READY' : 'BLOCKED',
        legalBlocker,
      ),
      item(
        'pharmacy_licence',
        'PARTNERS',
        'Pharmacy licence requirements satisfied',
        p.partner_readiness.pharmacy_licence_verified ? 'READY' : 'BLOCKED',
        p.partner_readiness.pharmacy_licence_verified ? null : 'PHARMACY_LICENCE_MISSING',
      ),
      item(
        'kyc',
        'PARTNERS',
        'KYC verification',
        p.partner_readiness.kyc_verified ? 'READY' : 'BLOCKED',
        p.partner_readiness.kyc_verified ? null : 'KYC_NOT_VERIFIED',
      ),
      item(
        'commercial',
        'PARTNERS',
        'Commercial approval',
        p.partner_readiness.commercial_approved ? 'READY' : 'BLOCKED',
        p.partner_readiness.commercial_approved ? null : 'COMMERCIAL_APPROVAL_MISSING',
      ),
      item(
        'psp',
        'PAYMENTS',
        'Production PSP dependency (non-mock)',
        input.paymentStatus,
        input.paymentStatus === 'READY' ? null : 'PAYMENT_PROVIDER_EXTERNAL_GATED',
      ),
      item(
        'r14a',
        'PAYMENTS',
        'R14-A owner confirmation',
        input.paymentStatus,
        'R14_A_OWNER_CONFIRMATION_REQUIRED',
      ),
      item(
        'otp',
        'COMMUNICATIONS',
        'Production OTP provider + sender configuration',
        input.otpStatus,
        input.otpStatus === 'READY' ? null : 'OTP_PROVIDER_EXTERNAL_GATED',
      ),
      item(
        'messaging',
        'COMMUNICATIONS',
        'Transactional messaging provider(s)',
        input.messagingStatus,
        input.messagingStatus === 'READY' ? null : 'MESSAGING_PROVIDER_EXTERNAL_GATED',
      ),
      item(
        'carrier',
        'LOGISTICS',
        'Production carrier/fleet + serviceability',
        input.logisticsStatus,
        input.logisticsStatus === 'READY' ? null : 'CARRIER_EXTERNAL_GATED',
      ),
      item(
        'storage',
        'INFRASTRUCTURE',
        'Object storage / malware scanning / KMS',
        input.infraStatus,
        'STORAGE_EXTERNAL_GATED',
      ),
      item(
        'pitr',
        'INFRASTRUCTURE',
        'Backups / PITR / offsite recovery',
        'EXTERNAL_GATED',
        'PITR_EXTERNAL_GATED',
      ),
      item(
        'erx_video_pacs',
        'HEALTHCARE',
        'eRx / video / PACS / DICOM / HL7 / FHIR',
        input.healthcareStatus,
        'NO_PRODUCTION_CLINICAL_ADAPTER',
      ),
      item(
        'clinical_providers',
        'HEALTHCARE',
        'Doctor / lab / imaging credential & licence requirements',
        input.healthcareStatus,
        input.healthcareStatus === 'READY' ? null : 'HEALTHCARE_EXTERNAL_GATED',
      ),
    ];
  }
}

function worstStatus(statuses: LaunchDimensionStatus[]): LaunchDimensionStatus {
  const order: LaunchDimensionStatus[] = [
    'SUSPENDED',
    'BLOCKED',
    'NOT_CONFIGURED',
    'EXTERNAL_GATED',
    'READY',
  ];
  for (const s of order) {
    if (statuses.includes(s)) return s;
  }
  return 'BLOCKED';
}
