import { Injectable } from '@nestjs/common';
import { CountryStatus, PolicyPackStatus, PrivilegeGrantStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { buildRuntimeProfile } from '../common/runtime-profile';
import { Errors } from '../common/problem';
import { isLivePaymentEnabled } from '../payment/payment.config';
import { evaluateProductionConfigInventory, listOperationalSignals } from '../ops/production-config';
import { evaluateProductionInfrastructureAvailable } from '../ops/production-infrastructure-gate';
import { listBackupCatalog } from '../ops/backup-catalog';
import { getRecoveryObjectives } from '../ops/recovery-targets';
import { evaluateProductionConfigValidation } from '../ops/production-config-validator';
import { evaluateFinalInternalReleaseGate } from '../ops/final-internal-release-gate';
import {
  evaluateAllProviderActivations,
  verifyProviderIntegration,
  type ProviderIntegrationId,
} from '../ops/provider-activation';
import { evaluatePspFirstOnboarding } from '../payment/psp-first-onboarding';
import { evaluateRealPspFirstOnboarding } from '../payment/psp-real-activation-first-onboarding';
import { evaluateMessagingFirstOnboarding } from '../identity/messaging-first-onboarding';
import { evaluateRealMessagingFirstOnboarding } from '../identity/messaging-real-activation-first-onboarding';
import { evaluateCarrierFirstOnboarding } from '../logistics/carrier-first-onboarding';
import { evaluateRealCarrierFirstOnboarding } from '../logistics/carrier-real-activation-first-onboarding';
import { evaluateErxFirstOnboarding } from '../clinical/erx-first-onboarding';
import { evaluateVideoFirstOnboarding } from '../clinical/video-first-onboarding';
import { evaluatePacsFirstOnboarding } from '../radiology/pacs-first-onboarding';
import { evaluateAffiliatePayoutFirstOnboarding } from '../finance/affiliate-payout-first-onboarding';
import { evaluatePartnerPayoutSoftwareReadiness } from '../finance/partner-payout-software-readiness';
import { evaluateKycFirstOnboarding } from '../partner/kyc-first-onboarding';
import { evaluateRealKycFirstOnboarding } from '../partner/kyc-real-activation-first-onboarding';
import { evaluateProductionStorageFirstOnboarding } from '../ops/production-storage-first-onboarding';
import { evaluateRealStorageFirstOnboarding } from '../ops/storage-real-activation-first-onboarding';
import { evaluateProductionBackupFirstOnboarding } from '../ops/production-backup-first-onboarding';
import { evaluateRealBackupFirstOnboarding } from '../ops/backup-real-activation-first-onboarding';
import { evaluateObservabilityFirstOnboarding } from '../ops/observability-first-onboarding';
import { evaluateRealObservabilityFirstOnboarding } from '../ops/observability-real-activation-first-onboarding';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from '../ops/observability-apm-monitoring-alerting-production-activation-path';
import { evaluateDeploymentReleaseEngineeringProductionActivationPath } from '../ops/deployment-release-engineering-production-activation-path';
import { evaluateProductionDeploymentTargetActivationPath } from '../ops/production-deployment-target-activation-path';
import { evaluateProductionDatabaseActivationPath } from '../ops/production-database-activation-path';
import { evaluateProductionManagedBackupPitrActivationPath } from '../ops/production-managed-backup-pitr-activation-path';
import { evaluateProductionSecurityLaunchGatePath } from '../ops/production-security-launch-gate-path';
import { evaluateAffiliatePayoutSettlementProductionWorkflowClosure } from '../finance/affiliate-payout-settlement-production-workflow-closure';
import { evaluateProductionKycKybHealthcarePartnerVerificationActivationPath } from '../partner/production-kyc-kyb-healthcare-partner-verification-activation-path';
import { evaluateApplicationSecurityHardening } from '../ops/application-security-hardening';
import { evaluateExternalPentestPreparation } from '../ops/external-pentest-preparation';
import { evaluateProductionSecretsEnvFirstOnboarding } from '../ops/production-secrets-env-first-onboarding';
import { evaluateSecretsManagerRuntimeResolver } from '../ops/secrets-manager-runtime-resolver';
import { evaluateProductionDeploymentFirstOnboarding } from '../ops/production-deployment-first-onboarding';
import { evaluateProductionProviderOnboardingFirstOnboarding } from '../ops/production-provider-onboarding-first-onboarding';
import { evaluateProductionFoundationFirstOnboarding } from '../ops/production-foundation-first-onboarding';
import { evaluateFoundationRealActivation } from '../ops/foundation-real-activation-first-onboarding';
import { evaluateProductionFoundationActivationPreparation } from '../ops/production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from '../ops/production-release-engineering-readiness';
import { evaluateProductionDeploymentTargetActivation } from '../ops/production-deployment-target-activation-contract';
import { evaluatePspPaymentActivationPreparation } from '../payment/psp-payment-activation-preparation';
import { evaluatePspPaymentProductionActivationControl } from '../payment/psp-payment-production-activation-control';
import { evaluatePspPaymentProductionActivationPath } from '../payment/psp-payment-production-activation-path';
import { evaluateOtpMessagingActivationPreparation } from '../identity/otp-messaging-activation-preparation';
import { evaluateOtpMessagingProductionActivationPath } from '../identity/otp-messaging-production-activation-path';
import { evaluateCarrierLogisticsActivationPreparation } from '../logistics/carrier-logistics-activation-preparation';
import { evaluateCarrierLogisticsProductionActivationPath } from '../logistics/carrier-logistics-production-activation-path';
import { evaluateKycHealthcarePartnerVerificationActivationPreparation } from '../partner/kyc-healthcare-partner-verification-activation-preparation';
import { evaluatePharmacyVendorNetworkClosure } from '../partner/pharmacy-vendor-network-closure';
import { evaluateLabPartnerOnboardingActivationPreparation } from '../lab/lab-partner-onboarding-activation-preparation';
import { evaluateLabPartnerProductionWorkflowClosure } from '../lab/lab-partner-production-workflow-closure';
import { evaluateErxProductionActivationPath } from '../clinical/erx-production-activation-path';
import { evaluateDoctorConsultationErxProductionWorkflowClosure } from '../clinical/doctor-consultation-erx-production-workflow-closure';
import { evaluateVideoProductionActivationPath } from '../clinical/video-production-activation-path';
import { evaluateTelemedicineLiveConsultationProductionWorkflowClosure } from '../clinical/telemedicine-live-consultation-production-workflow-closure';
import { evaluatePacsProductionActivationPath } from '../radiology/pacs-production-activation-path';
import { evaluateImagingPacsDicomProductionWorkflowClosure } from '../radiology/imaging-pacs-dicom-production-workflow-closure';
import { evaluatePrivateStorageKmsMalwareProductionActivationPath } from '../ops/private-storage-kms-malware-production-activation-path';
import { evaluatePrivateStorageKmsMalwareProductionWorkflowClosure } from '../ops/private-storage-kms-malware-production-workflow-closure';
import { evaluateApiAbuseHardening } from '../ops/api-abuse-hardening';
import { evaluateEdgeWafDdosActivation } from '../ops/edge-waf-ddos-real-activation-first-onboarding';
import { evaluateInputSecurityHardening } from '../ops/input-security-hardening';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { PaymentGatewayRegistry } from '../payment/gateway.registry';
import { SecurityEventsService } from '../identity/security-events.service';
import type { Principal } from '../identity/current-principal';
import { PolicyCache } from '../policy/cache';
import {
  computeMarketReadiness,
  legacyReadinessAlias,
  parsePolicyCommerceSignals,
  type CountryReadinessState,
  type MarketReadinessState,
} from './market-readiness';

export type { CountryReadinessState, MarketReadinessState };

const PARTNER_REVIEW_STATUSES = [
  'UNDER_REVIEW',
  'DOCUMENTS_SUBMITTED',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'DOCUMENTS_REQUIRED',
  'PROFILE_INCOMPLETE',
] as const;

@Injectable()
export class AdminControlPlaneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
    private readonly policyCache: PolicyCache,
    private readonly paymentGateways: PaymentGatewayRegistry,
  ) {}

  async commandCenterSnapshot(countryCode?: string) {
    const iso = countryCode?.trim().toUpperCase();
    const country = iso
      ? await this.prisma.country.findUnique({ where: { isoAlpha2: iso } })
      : null;

    const countryWhere = country ? { countryId: country.id } : {};
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      orderCount,
      ordersToday,
      partnerPending,
      activeVendors,
      labCount,
      doctorPartners,
      imagingPartners,
      securityEvents,
      financeFacts,
      openBreaks,
      failedPayments,
      capturedPayments,
      refundFacts,
      pendingGrants,
      activeBreakGlass,
      countries,
      appointmentsToday,
      labBookingsOpen,
      imagingBookingsOpen,
      shipmentsActive,
      deliveryExceptions,
      vendorPayablesOpen,
      affiliatePayable,
      affiliateLiability,
      kycPending,
      outboxDead,
      outboxPending,
    ] = await Promise.all([
      this.prisma.order.count({ where: countryWhere }),
      this.prisma.order.count({
        where: { ...countryWhere, createdAt: { gte: since24h } },
      }),
      this.prisma.partnerApplication.count({
        where: { status: { in: [...PARTNER_REVIEW_STATUSES] } },
      }),
      this.prisma.partner.count({
        where: {
          partnerTypeCode: { in: ['VENDOR', 'PHARMACY'] },
          status: 'ACTIVE',
          ...(country ? { countryId: country.id } : {}),
        },
      }),
      this.prisma.partner.count({
        where: { partnerTypeCode: 'LAB', ...(country ? { countryId: country.id } : {}) },
      }),
      this.prisma.partner.count({
        where: {
          partnerTypeCode: 'DOCTOR',
          ...(country ? { countryId: country.id } : {}),
        },
      }),
      this.prisma.partner.count({
        where: {
          partnerTypeCode: 'IMAGING_CENTER',
          ...(country ? { countryId: country.id } : {}),
        },
      }),
      this.prisma.securityEvent.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      this.prisma.financialFact.count({ where: countryWhere }),
      this.prisma.financeReconciliation.count({ where: { workflowStatus: 'OPEN' } }),
      this.prisma.paymentIntent.count({
        where: { status: 'FAILED', ...countryWhere },
      }),
      this.prisma.paymentIntent.count({
        where: { status: 'CAPTURED', ...countryWhere, createdAt: { gte: since24h } },
      }),
      this.prisma.financialFact.count({
        where: { kind: 'REFUND', ...countryWhere },
      }),
      this.prisma.privilegeGrantRequest.count({ where: { status: PrivilegeGrantStatus.PENDING } }),
      this.prisma.breakGlassGrant.count({
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.prisma.country.findMany({
        orderBy: { isoAlpha2: 'asc' },
        select: {
          id: true,
          isoAlpha2: true,
          status: true,
          defaultCurrency: true,
          publishedPolicyPackId: true,
        },
      }),
      this.prisma.appointment.count({
        where: { ...countryWhere, createdAt: { gte: since24h } },
      }),
      this.prisma.labBooking.count({
        where: {
          ...countryWhere,
          status: { in: ['BOOKED', 'CONFIRMED'] },
        },
      }),
      this.prisma.imagingBooking.count({
        where: {
          ...countryWhere,
          status: { in: ['BOOKED', 'CONFIRMED'] },
        },
      }),
      this.prisma.shipment.count({
        where: {
          ...(country ? { order: { countryId: country.id } } : {}),
          status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED', 'LOST'] },
        },
      }),
      this.prisma.shipment.count({
        where: {
          ...(country ? { order: { countryId: country.id } } : {}),
          status: { in: ['DELIVERY_FAILED', 'BOOKING_FAILED', 'RETURN_TO_ORIGIN', 'DAMAGED'] },
        },
      }),
      this.prisma.vendorPayable.count({
        where: {
          ...countryWhere,
          status: { in: ['PENDING', 'ELIGIBLE', 'ON_HOLD', 'APPROVED'] },
        },
      }),
      this.prisma.financialFact.count({
        where: { kind: 'AFFILIATE', ...countryWhere },
      }),
      this.prisma.affiliateLiability.count({
        where: {
          ...(country ? { order: { countryId: country.id } } : {}),
          status: { in: ['PENDING', 'APPROVED', 'PAYABLE'] },
        },
      }),
      this.prisma.kycCase.count({
        where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
      }),
      this.prisma.outboxEvent.count({ where: { status: 'DEAD_LETTERED' } }),
      this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
    ]);

    let analytics: {
      order_paid_count: number;
      order_gmv_minor: string;
      checkout_started_count: number;
    } | null = null;
    if (country) {
      const rows = await this.prisma.analyticsDailyCountryMetric.findMany({
        where: { countryId: country.id },
        orderBy: { metricDate: 'desc' },
        take: 30,
      });
      analytics = {
        order_paid_count: rows.reduce((sum, row) => sum + row.orderPaidCount, 0),
        order_gmv_minor: String(rows.reduce((sum, row) => sum + BigInt(row.orderGmvMinor), 0n)),
        checkout_started_count: rows.reduce((sum, row) => sum + row.checkoutStartedCount, 0),
      };
    }

    return {
      scope: iso ?? 'GLOBAL',
      currency: country?.defaultCurrency ?? null,
      country_code: iso ?? null,
      commerce: {
        orders: orderCount,
        orders_today: ordersToday,
        analytics,
        successful_payments_24h: capturedPayments,
        failed_payments: failedPayments,
        refund_facts: refundFacts,
        active_vendors: activeVendors,
      },
      healthcare: {
        labs: labCount,
        doctors: doctorPartners,
        imaging_centers: imagingPartners,
        appointments_24h: appointmentsToday,
        lab_bookings_open: labBookingsOpen,
        imaging_bookings_open: imagingBookingsOpen,
        partner_reviews_pending: partnerPending,
      },
      logistics: {
        active_shipments: shipmentsActive,
        delivery_exceptions: deliveryExceptions,
        note: country
          ? 'Use serviceability console for zone coverage in selected country.'
          : 'Select a country scope for serviceability detail.',
      },
      finance: {
        facts: financeFacts,
        open_breaks: openBreaks,
        vendor_payables_open: vendorPayablesOpen,
        affiliate_facts: affiliatePayable,
        affiliate_liabilities_open: affiliateLiability,
        live_payment_enabled: isLivePaymentEnabled(),
        sandbox: !isLivePaymentEnabled(),
        settlement_status: isLivePaymentEnabled() ? 'GATED' : 'SANDBOX_NOT_SETTLED',
      },
      governance: {
        pending_grants: pendingGrants,
        partner_reviews_pending: partnerPending,
        kyc_pending: kycPending,
        active_break_glass: activeBreakGlass,
      },
      reliability: {
        outbox_pending: outboxPending,
        outbox_dead_lettered: outboxDead,
      },
      security: {
        events_last_7d: securityEvents,
      },
      global: {
        active_countries: countries.filter((row) => row.status === CountryStatus.ACTIVE).length,
        total_countries: countries.length,
      },
    };
  }

  async approvalQueue(limit = 50) {
    const items: Array<{
      id: string;
      type: string;
      title: string;
      entity_id: string;
      country_code: string | null;
      status: string;
      created_at: string;
      required_permission: string;
      href: string;
      requester_label: string | null;
    }> = [];

    const [grants, applications, labs] = await Promise.all([
      this.prisma.privilegeGrantRequest.findMany({
        where: { status: PrivilegeGrantStatus.PENDING },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.partnerApplication.findMany({
        where: { status: { in: [...PARTNER_REVIEW_STATUSES] } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { partner: { include: { country: { select: { isoAlpha2: true } } } } },
      }),
      this.prisma.partner.findMany({
        where: { partnerTypeCode: 'LAB', status: { in: ['UNDER_REVIEW', 'DOCUMENTS_SUBMITTED', 'PROFILE_INCOMPLETE'] } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { organization: true, country: { select: { isoAlpha2: true } } },
      }),
    ]);

    for (const row of grants) {
      items.push({
        id: row.id,
        type: 'staff_role_grant',
        title: `Elevated role: ${row.roleCode ?? 'membership'}`,
        entity_id: row.targetPersonId,
        country_code: null,
        status: row.status,
        created_at: row.createdAt.toISOString(),
        required_permission: 'rbac:grant_company',
        href: '/company-authority',
        requester_label: row.requestedById.slice(0, 8),
      });
    }

    for (const row of applications) {
      items.push({
        id: row.id,
        type: 'partner_kyc',
        title: `${row.partnerTypeCode} application review`,
        entity_id: row.id,
        country_code: row.partner?.country?.isoAlpha2 ?? null,
        status: row.status,
        created_at: row.createdAt.toISOString(),
        required_permission: 'partner:manage',
        href: '/partners',
        requester_label: row.partnerId?.slice(0, 8) ?? null,
      });
    }

    for (const row of labs) {
      items.push({
        id: row.id,
        type: 'lab_review',
        title: row.organization?.displayName ?? `Lab ${row.id.slice(0, 8)}`,
        entity_id: row.id,
        country_code: row.country?.isoAlpha2 ?? null,
        status: row.status,
        created_at: row.createdAt.toISOString(),
        required_permission: 'lab:review',
        href: '/labs',
        requester_label: null,
      });
    }

    items.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return { data: items.slice(0, limit) };
  }

  async operationsExceptions(limit = 30) {
    const items: Array<{
      id: string;
      kind: string;
      title: string;
      detail: string;
      severity: 'warning' | 'critical' | 'info';
      href: string;
      country_code: string | null;
    }> = [];

    const [failedPayments, openBreaks, pendingPartners, pendingGrants, unconfiguredProviders, inactiveCountries] =
      await Promise.all([
        this.prisma.paymentIntent.findMany({
          where: { status: 'FAILED' },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          include: { country: { select: { isoAlpha2: true } } },
        }),
        this.prisma.financeReconciliation.findMany({
          where: { workflowStatus: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.partnerApplication.count({
          where: { status: { in: [...PARTNER_REVIEW_STATUSES] } },
        }),
        this.prisma.privilegeGrantRequest.count({ where: { status: PrivilegeGrantStatus.PENDING } }),
        this.prisma.notificationCountryProvider.count({
          where: { configStatus: 'UNCONFIGURED', active: true },
        }),
        this.prisma.country.count({ where: { status: CountryStatus.INACTIVE } }),
      ]);

    for (const row of failedPayments) {
      items.push({
        id: `payment-${row.id}`,
        kind: 'failed_payment',
        title: `Payment failed · ${row.id.slice(0, 8)}`,
        detail: `${row.currency} ${row.amountMinor} · ${row.method}`,
        severity: 'warning',
        href: `/payments?id=${row.id}`,
        country_code: row.country?.isoAlpha2 ?? null,
      });
    }

    for (const row of openBreaks) {
      items.push({
        id: `break-${row.id}`,
        kind: 'settlement_break',
        title: `Finance break · ${row.breakType}`,
        detail: row.detail ?? 'Open settlement break requires reconciliation',
        severity: 'critical',
        href: '/finance',
        country_code: null,
      });
    }

    if (pendingPartners > 0) {
      items.push({
        id: 'partners-pending',
        kind: 'pending_kyc',
        title: `${pendingPartners} partner applications awaiting review`,
        detail: 'Partner onboarding queue has pending KYC / profile reviews',
        severity: 'info',
        href: '/partners',
        country_code: null,
      });
    }

    if (pendingGrants > 0) {
      items.push({
        id: 'grants-pending',
        kind: 'privilege_grant',
        title: `${pendingGrants} elevated role grants pending approval`,
        detail: 'Dual-control staff role grants require company authority review',
        severity: 'warning',
        href: '/company-authority',
        country_code: null,
      });
    }

    if (unconfiguredProviders > 0) {
      items.push({
        id: 'providers-unconfigured',
        kind: 'provider_config',
        title: `${unconfiguredProviders} notification providers unconfigured`,
        detail: 'Country notification matrix has active slots without verified configuration',
        severity: 'info',
        href: '/notifications',
        country_code: null,
      });
    }

    if (!isLivePaymentEnabled()) {
      items.push({
        id: 'r14a-blocked',
        kind: 'production_gate',
        title: 'Live payments blocked (R14-A)',
        detail: 'Production payment routing remains sandbox-only until R14-A gates are evidenced',
        severity: 'info',
        href: '/payments',
        country_code: null,
      });
    }

    if (inactiveCountries > 0) {
      items.push({
        id: 'countries-inactive',
        kind: 'country_readiness',
        title: `${inactiveCountries} countries not yet active`,
        detail: 'Markets exist in draft/inactive state — review country control center',
        severity: 'info',
        href: '/countries',
        country_code: null,
      });
    }

    const deadLetters = await this.prisma.outboxEvent.findMany({
      where: { status: 'DEAD_LETTERED' },
      orderBy: { failedAt: 'desc' },
      take: 10,
    });
    for (const row of deadLetters) {
      items.push({
        id: `outbox-${row.id}`,
        kind: 'outbox_dead_letter',
        title: `Outbox dead letter · ${row.type}`,
        detail: row.lastError ?? 'Event exhausted retries',
        severity: 'critical',
        href: `/reliability?status=DEAD_LETTERED`,
        country_code: null,
      });
    }

    return { data: items.slice(0, limit) };
  }

  async reliabilitySnapshot() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stuckCutoff = new Date(Date.now() - 120_000);
    const [
      pending,
      processing,
      published,
      deadLettered,
      failed,
      stuckProcessing,
      idempotencyRecent,
    ] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
      this.prisma.outboxEvent.count({ where: { status: 'PROCESSING' } }),
      this.prisma.outboxEvent.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.outboxEvent.count({ where: { status: 'DEAD_LETTERED' } }),
      this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
      this.prisma.outboxEvent.count({
        where: { status: 'PROCESSING', updatedAt: { lt: stuckCutoff } },
      }),
      this.prisma.idempotencyRecord.count({ where: { createdAt: { gte: since } } }),
    ]);
    const runtime = buildRuntimeProfile();
    return {
      runtime,
      outbox: {
        pending,
        processing,
        published,
        dead_lettered: deadLettered,
        failed,
        stuck_processing: stuckProcessing,
      },
      idempotency: {
        records_last_24h: idempotencyRecent,
        ttl: 'none_durable',
        storage: 'postgres.idempotency_records',
      },
      live_payment_enabled: isLivePaymentEnabled(),
      production_config: evaluateProductionConfigInventory(),
      infrastructure: evaluateProductionInfrastructureAvailable(),
      backup_catalog: listBackupCatalog(8),
      recovery_objectives: getRecoveryObjectives(),
      production_config_validation: evaluateProductionConfigValidation(),
      final_internal_release_gate: evaluateFinalInternalReleaseGate(),
      provider_activation: evaluateAllProviderActivations(),
      operational_signals: listOperationalSignals(),
      never_expose_secrets: true as const,
      dependency_readiness: {
        note: 'Authoritative probe is GET /health/ready (postgres + redis). External-gated providers do not fail readiness.',
        health_ready_path: '/health/ready',
        runtime_dependencies: runtime.dependencies.map((d) => ({
          name: d.name,
          mode: d.mode,
        })),
      },
      links: {
        notification_ops: '/notifications',
        health_ready: '/health/ready',
        metrics: '/metrics',
      },
      replay_available: false,
    };
  }

  providerActivationMatrix() {
    const matrix = evaluateAllProviderActivations();
    return {
      ...matrix,
      psp_first_onboarding: evaluatePspFirstOnboarding(this.paymentGateways),
      messaging_first_onboarding: evaluateMessagingFirstOnboarding(),
      carrier_first_onboarding: evaluateCarrierFirstOnboarding(),
      erx_first_onboarding: evaluateErxFirstOnboarding(),
      video_first_onboarding: evaluateVideoFirstOnboarding(),
      pacs_first_onboarding: evaluatePacsFirstOnboarding(),
      affiliate_payout_first_onboarding: evaluateAffiliatePayoutFirstOnboarding(),
      kyc_first_onboarding: evaluateKycFirstOnboarding(),
      production_storage_first_onboarding: evaluateProductionStorageFirstOnboarding(),
      production_backup_first_onboarding: evaluateProductionBackupFirstOnboarding(),
      observability_first_onboarding: evaluateObservabilityFirstOnboarding(),
    };
  }

  verifyProvider(id: string) {
    const normalized = id.trim().toUpperCase().replace(/-/g, '_') as ProviderIntegrationId;
    const base = verifyProviderIntegration(normalized);
    if (normalized === 'PAYMENTS_PSP') {
      return {
        ...base,
        psp_first_onboarding: evaluatePspFirstOnboarding(this.paymentGateways),
      };
    }
    if (normalized === 'OTP_AUTH' || normalized === 'MESSAGING') {
      return {
        ...base,
        messaging_first_onboarding: evaluateMessagingFirstOnboarding(),
      };
    }
    if (normalized === 'CARRIER') {
      return {
        ...base,
        carrier_first_onboarding: evaluateCarrierFirstOnboarding(),
      };
    }
    if (normalized === 'ERX') {
      return {
        ...base,
        erx_first_onboarding: evaluateErxFirstOnboarding(),
      };
    }
    if (normalized === 'VIDEO') {
      return {
        ...base,
        video_first_onboarding: evaluateVideoFirstOnboarding(),
      };
    }
    if (normalized === 'PACS_DICOM') {
      return {
        ...base,
        pacs_first_onboarding: evaluatePacsFirstOnboarding(),
      };
    }
    if (normalized === 'AFFILIATE_PAYOUT') {
      return {
        ...base,
        affiliate_payout_first_onboarding: evaluateAffiliatePayoutFirstOnboarding(),
      };
    }
    if (normalized === 'KYC') {
      return {
        ...base,
        kyc_first_onboarding: evaluateKycFirstOnboarding(),
      };
    }
    if (
      normalized === 'OBJECT_STORAGE' ||
      normalized === 'KMS' ||
      normalized === 'MALWARE_SCANNER'
    ) {
      return {
        ...base,
        production_storage_first_onboarding: evaluateProductionStorageFirstOnboarding(),
      };
    }
    if (normalized === 'MANAGED_DB_PITR') {
      return {
        ...base,
        production_backup_first_onboarding: evaluateProductionBackupFirstOnboarding(),
      };
    }
    if (normalized === 'MONITORING_APM') {
      return {
        ...base,
        observability_first_onboarding: evaluateObservabilityFirstOnboarding(),
      };
    }
    return base;
  }

  pspFirstOnboarding() {
    return evaluatePspFirstOnboarding(this.paymentGateways);
  }

  realPspFirstOnboarding() {
    return evaluateRealPspFirstOnboarding();
  }

  messagingFirstOnboarding() {
    return evaluateMessagingFirstOnboarding();
  }

  realMessagingFirstOnboarding() {
    return evaluateRealMessagingFirstOnboarding();
  }

  carrierFirstOnboarding() {
    return evaluateCarrierFirstOnboarding();
  }

  realCarrierFirstOnboarding() {
    return evaluateRealCarrierFirstOnboarding();
  }

  erxFirstOnboarding() {
    return evaluateErxFirstOnboarding();
  }

  videoFirstOnboarding() {
    return evaluateVideoFirstOnboarding();
  }

  pacsFirstOnboarding() {
    return evaluatePacsFirstOnboarding();
  }

  affiliatePayoutFirstOnboarding() {
    return evaluateAffiliatePayoutFirstOnboarding();
  }

  partnerPayoutSoftwareReadiness() {
    return evaluatePartnerPayoutSoftwareReadiness();
  }

  kycFirstOnboarding() {
    return evaluateKycFirstOnboarding();
  }

  realKycFirstOnboarding() {
    return evaluateRealKycFirstOnboarding();
  }

  productionStorageFirstOnboarding() {
    return evaluateProductionStorageFirstOnboarding();
  }

  realStorageFirstOnboarding() {
    return evaluateRealStorageFirstOnboarding();
  }

  productionBackupFirstOnboarding() {
    return evaluateProductionBackupFirstOnboarding();
  }

  realBackupFirstOnboarding() {
    return evaluateRealBackupFirstOnboarding();
  }

  observabilityFirstOnboarding() {
    return evaluateObservabilityFirstOnboarding();
  }

  realObservabilityFirstOnboarding() {
    return evaluateRealObservabilityFirstOnboarding();
  }

  observabilityApmMonitoringAlertingProductionActivationPath(input?: {
    correlation_id?: string;
  }) {
    return evaluateObservabilityApmMonitoringAlertingProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  deploymentReleaseEngineeringProductionActivationPath(input?: {
    correlation_id?: string;
  }) {
    return evaluateDeploymentReleaseEngineeringProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  productionDeploymentTargetActivationPath(input?: { correlation_id?: string }) {
    return evaluateProductionDeploymentTargetActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  productionDatabaseActivationPath(input?: { correlation_id?: string }) {
    return evaluateProductionDatabaseActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  productionManagedBackupPitrActivationPath(input?: { correlation_id?: string }) {
    return evaluateProductionManagedBackupPitrActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  productionSecurityLaunchGatePath(input?: { correlation_id?: string }) {
    return evaluateProductionSecurityLaunchGatePath({
      correlation_id: input?.correlation_id,
    });
  }

  affiliatePayoutSettlementProductionWorkflowClosure(input?: {
    correlation_id?: string;
  }) {
    return evaluateAffiliatePayoutSettlementProductionWorkflowClosure({
      correlation_id: input?.correlation_id,
    });
  }

  productionKycKybHealthcarePartnerVerificationActivationPath(input?: {
    correlation_id?: string;
  }) {
    return evaluateProductionKycKybHealthcarePartnerVerificationActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  applicationSecurityHardening() {
    return evaluateApplicationSecurityHardening();
  }

  externalPentestPreparation() {
    return evaluateExternalPentestPreparation();
  }

  productionSecretsEnvFirstOnboarding() {
    return evaluateProductionSecretsEnvFirstOnboarding();
  }

  secretsManagerRuntimeResolver(input?: { correlation_id?: string }) {
    return evaluateSecretsManagerRuntimeResolver({
      correlation_id: input?.correlation_id,
    });
  }

  productionDeploymentFirstOnboarding() {
    return evaluateProductionDeploymentFirstOnboarding();
  }

  productionProviderOnboardingFirstOnboarding(input?: { correlation_id?: string }) {
    return evaluateProductionProviderOnboardingFirstOnboarding({
      correlation_id: input?.correlation_id,
    });
  }

  productionFoundationFirstOnboarding(input?: { correlation_id?: string }) {
    return evaluateProductionFoundationFirstOnboarding({
      correlation_id: input?.correlation_id,
    });
  }

  foundationRealActivation(input?: { correlation_id?: string }) {
    return evaluateFoundationRealActivation({
      correlation_id: input?.correlation_id,
    });
  }

  productionFoundationActivationPreparation(input?: { correlation_id?: string }) {
    return evaluateProductionFoundationActivationPreparation({
      correlation_id: input?.correlation_id,
    });
  }

  productionReleaseEngineeringReadiness(input?: { correlation_id?: string }) {
    return evaluateProductionReleaseEngineeringReadiness({
      correlation_id: input?.correlation_id,
    });
  }

  productionDeploymentTargetActivation(input?: { correlation_id?: string }) {
    return evaluateProductionDeploymentTargetActivation({
      correlation_id: input?.correlation_id,
    });
  }

  pspPaymentActivationPreparation(input?: { correlation_id?: string }) {
    return evaluatePspPaymentActivationPreparation({
      correlation_id: input?.correlation_id,
    });
  }

  pspPaymentProductionActivationControl(input?: { correlation_id?: string }) {
    return evaluatePspPaymentProductionActivationControl({
      correlation_id: input?.correlation_id,
    });
  }

  pspPaymentProductionActivationPath(input?: { correlation_id?: string }) {
    return evaluatePspPaymentProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  otpMessagingActivationPreparation(input?: { correlation_id?: string }) {
    return evaluateOtpMessagingActivationPreparation({
      correlation_id: input?.correlation_id,
    });
  }

  otpMessagingProductionActivationPath(input?: { correlation_id?: string }) {
    return evaluateOtpMessagingProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  carrierLogisticsActivationPreparation(input?: { correlation_id?: string }) {
    return evaluateCarrierLogisticsActivationPreparation({
      correlation_id: input?.correlation_id,
    });
  }

  carrierLogisticsProductionActivationPath(input?: { correlation_id?: string }) {
    return evaluateCarrierLogisticsProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  kycHealthcarePartnerVerificationActivationPreparation(input?: {
    correlation_id?: string;
  }) {
    return evaluateKycHealthcarePartnerVerificationActivationPreparation({
      correlation_id: input?.correlation_id,
    });
  }

  labPartnerOnboardingActivationPreparation(input?: { correlation_id?: string }) {
    return evaluateLabPartnerOnboardingActivationPreparation({
      correlation_id: input?.correlation_id,
    });
  }

  pharmacyVendorNetworkClosure(input?: { correlation_id?: string }) {
    return evaluatePharmacyVendorNetworkClosure({
      correlation_id: input?.correlation_id,
    });
  }

  labPartnerProductionWorkflowClosure(input?: { correlation_id?: string }) {
    return evaluateLabPartnerProductionWorkflowClosure({
      correlation_id: input?.correlation_id,
    });
  }

  erxProductionActivationPath(input?: { correlation_id?: string }) {
    return evaluateErxProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  doctorConsultationErxProductionWorkflowClosure(input?: { correlation_id?: string }) {
    return evaluateDoctorConsultationErxProductionWorkflowClosure({
      correlation_id: input?.correlation_id,
    });
  }

  videoProductionActivationPath(input?: { correlation_id?: string }) {
    return evaluateVideoProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  telemedicineLiveConsultationProductionWorkflowClosure(input?: {
    correlation_id?: string;
  }) {
    return evaluateTelemedicineLiveConsultationProductionWorkflowClosure({
      correlation_id: input?.correlation_id,
    });
  }

  pacsProductionActivationPath(input?: { correlation_id?: string }) {
    return evaluatePacsProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  imagingPacsDicomProductionWorkflowClosure(input?: { correlation_id?: string }) {
    return evaluateImagingPacsDicomProductionWorkflowClosure({
      correlation_id: input?.correlation_id,
    });
  }

  privateStorageKmsMalwareProductionActivationPath(input?: { correlation_id?: string }) {
    return evaluatePrivateStorageKmsMalwareProductionActivationPath({
      correlation_id: input?.correlation_id,
    });
  }

  privateStorageKmsMalwareProductionWorkflowClosure(input?: { correlation_id?: string }) {
    return evaluatePrivateStorageKmsMalwareProductionWorkflowClosure({
      correlation_id: input?.correlation_id,
    });
  }

  apiAbuseHardening(input?: { correlation_id?: string }) {
    return evaluateApiAbuseHardening({
      correlation_id: input?.correlation_id,
    });
  }

  edgeWafDdosActivation(input?: { correlation_id?: string }) {
    return evaluateEdgeWafDdosActivation({
      correlation_id: input?.correlation_id,
    });
  }

  inputSecurityHardening(input?: { correlation_id?: string }) {
    return evaluateInputSecurityHardening({
      correlation_id: input?.correlation_id,
    });
  }

  productionSecurityGate(input?: { correlation_id?: string }) {
    return evaluateProductionSecurityGate({
      correlation_id: input?.correlation_id,
    });
  }

  productionLaunchControl(input?: { market?: string; service_scope?: string; correlation_id?: string }) {
    const scope = input?.service_scope?.trim().toUpperCase();
    const allowed = new Set([
      'GLOBAL',
      'MEDICINE_COMMERCE',
      'LABS',
      'DOCTOR_CONSULTATION',
      'ERX',
      'IMAGING',
      'DELIVERY',
      'AFFILIATE',
    ]);
    return evaluateProductionLaunchControl({
      market: input?.market,
      service_scope: scope && allowed.has(scope) ? (scope as never) : 'GLOBAL',
      correlation_id: input?.correlation_id,
    });
  }

  async listOutboxEvents(input: { status?: string; limit?: number }) {
    const take = Math.min(input.limit ?? 50, 100);
    const status = input.status?.trim().toUpperCase();
    const rows = await this.prisma.outboxEvent.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        aggregateType: true,
        aggregateId: true,
        status: true,
        attempts: true,
        correlationId: true,
        occurrenceKey: true,
        lastError: true,
        createdAt: true,
        failedAt: true,
        processedAt: true,
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        aggregate_type: row.aggregateType,
        aggregate_id: row.aggregateId,
        status: row.status,
        attempts: row.attempts,
        correlation_id: row.correlationId,
        occurrence_key: row.occurrenceKey,
        last_error: row.lastError,
        created_at: row.createdAt.toISOString(),
        failed_at: row.failedAt?.toISOString() ?? null,
        processed_at: row.processedAt?.toISOString() ?? null,
      })),
    };
  }

  async lookupIdempotency(input: { key?: string; person_id?: string; limit?: number }) {
    const take = Math.min(input.limit ?? 20, 50);
    if (!input.key?.trim() && !input.person_id?.trim()) {
      return { data: [] };
    }
    const rows = await this.prisma.idempotencyRecord.findMany({
      where: {
        ...(input.person_id ? { personId: input.person_id.trim() } : {}),
        ...(input.key ? { key: { startsWith: input.key.trim() } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        personId: true,
        key: true,
        method: true,
        path: true,
        statusCode: true,
        createdAt: true,
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        person_id: row.personId,
        key: row.key,
        method: row.method,
        path: row.path,
        status_code: row.statusCode,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async countryReadiness(isoAlpha2: string) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: isoAlpha2.toUpperCase() },
      include: {
        region: { select: { code: true, nameI18n: true } },
      },
    });
    if (!country) {
      return null;
    }

    const [publishedPack, draftPack, providers, zones, paymentMethods, settlementPolicy] =
      await Promise.all([
        country.publishedPolicyPackId
          ? this.prisma.policyPack.findUnique({ where: { id: country.publishedPolicyPackId } })
          : Promise.resolve(null),
        this.prisma.policyPack.findFirst({
          where: { countryId: country.id, status: PolicyPackStatus.DRAFT },
          orderBy: { version: 'desc' },
        }),
        this.prisma.notificationCountryProvider.findMany({
          where: { countryId: country.id },
          orderBy: { channel: 'asc' },
        }),
        this.prisma.serviceabilityZone.count({ where: { countryId: country.id, active: true } }),
        this.prisma.paymentRoutingRule.count({ where: { countryId: country.id, active: true } }),
        this.prisma.settlementPolicy.findUnique({ where: { countryId: country.id } }),
      ]);

    const packSignals = parsePolicyCommerceSignals(publishedPack?.document);
    const verifiedProviders = providers.filter(
      (row) => row.configStatus === 'VERIFIED' || row.configStatus === 'SANDBOX',
    ).length;
    const unconfiguredProviders = providers.filter((row) => row.configStatus === 'UNCONFIGURED').length;

    const computed = computeMarketReadiness({
      countryStatus: country.status === CountryStatus.ACTIVE ? 'ACTIVE' : 'INACTIVE',
      currency: country.defaultCurrency,
      hasPublishedPolicyPack: Boolean(publishedPack),
      paymentPolicyConfigured: packSignals.paymentPolicyConfigured,
      deliveryPolicyConfigured: packSignals.deliveryPolicyConfigured,
      serviceabilityZonesActive: zones,
      notificationProvidersConfigured: providers.length,
      settlementPolicyConfigured: Boolean(settlementPolicy),
      livePaymentEnabled: isLivePaymentEnabled(),
    });

    // If country was deactivated after being active, surface SUSPENDED while remaining re-activatable.
    let readiness: MarketReadinessState = computed.readiness;
    if (
      country.status === CountryStatus.INACTIVE &&
      computed.can_activate_sandbox &&
      (computed.readiness === 'READY_FOR_ACTIVATION' || computed.readiness === 'READY_FOR_SANDBOX')
    ) {
      // Keep READY_* for activation UX; expose activation_status separately.
      readiness = computed.readiness;
    }

    const nameI18n = country.nameI18n as Record<string, string>;

    return {
      country_code: country.isoAlpha2,
      name: nameI18n.en ?? country.isoAlpha2,
      status: country.status,
      activation_status: country.status,
      readiness,
      readiness_legacy: legacyReadinessAlias(readiness),
      blockers: computed.blockers,
      external_gates: computed.external_gates,
      can_activate_sandbox: computed.can_activate_sandbox,
      healthcare: computed.healthcare,
      currency: country.defaultCurrency,
      timezone: country.defaultTimezone,
      locale: country.defaultLocale,
      region_code: country.region?.code ?? null,
      updated_at: country.updatedAt.toISOString(),
      policy: {
        published_version: publishedPack?.version ?? null,
        draft_version: draftPack?.version ?? null,
        published_at: publishedPack?.publishedAt?.toISOString() ?? null,
        payment_configured: packSignals.paymentPolicyConfigured,
        delivery_configured: packSignals.deliveryPolicyConfigured,
      },
      payments: {
        enabled_methods: paymentMethods,
        policy_configured: packSignals.paymentPolicyConfigured,
        live_enabled: false,
        sandbox: true,
        live_psp: 'EXTERNAL_GATED' as const,
      },
      notifications: {
        total: providers.length,
        verified: verifiedProviders,
        unconfigured: unconfiguredProviders,
        live_messaging: 'EXTERNAL_GATED' as const,
      },
      logistics: {
        serviceability_zones: zones,
        delivery_policy_configured: packSignals.deliveryPolicyConfigured,
        live_carrier: 'EXTERNAL_GATED' as const,
        sandbox_carrier: true,
      },
      finance: {
        settlement_policy_configured: Boolean(settlementPolicy),
        currency: country.defaultCurrency,
        live_payout: 'EXTERNAL_GATED' as const,
      },
      links: {
        policy_pack: `/policy-packs?country=${country.isoAlpha2}`,
        notifications: `/notifications?country=${country.isoAlpha2}`,
        serviceability: `/serviceability?country=${country.isoAlpha2}`,
        payments: `/payments?country=${country.isoAlpha2}`,
        finance: '/finance',
      },
    };
  }

  /**
   * Activate country for sandbox commerce. Blocked when mandatory readiness blockers remain.
   * Does not enable live PSP/carrier/OTP/messaging.
   */
  async activateCountry(principal: Principal, isoAlpha2: string, requestId?: string) {
    const iso = isoAlpha2.trim().toUpperCase();
    const detail = await this.countryReadiness(iso);
    if (!detail) {
      throw Errors.notFound('Country not found');
    }
    if (!detail.can_activate_sandbox) {
      throw Errors.problem(
        409,
        'COUNTRY_NOT_READY',
        'Country not ready',
        `Activation blocked: ${detail.blockers.join(', ') || 'incomplete configuration'}`,
      );
    }
    const country = await this.prisma.country.findUniqueOrThrow({ where: { isoAlpha2: iso } });
    if (country.status === CountryStatus.ACTIVE) {
      const again = await this.countryReadiness(iso);
      await this.securityEvents.emit({
        type: 'COUNTRY_ACTIVATED',
        outcome: 'success',
        personId: principal.personId,
        requestId,
        metadata: {
          country_code: iso,
          idempotent: true,
          readiness: again?.readiness,
          sandbox: true,
        },
      });
      return again;
    }
    await this.prisma.country.update({
      where: { id: country.id },
      data: { status: CountryStatus.ACTIVE },
    });
    await this.policyCache.invalidate(iso);
    const activated = await this.countryReadiness(iso);
    await this.securityEvents.emit({
      type: 'COUNTRY_ACTIVATED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: {
        country_code: iso,
        readiness: activated?.readiness,
        sandbox: true,
        live_psp: false,
        live_carrier: false,
        live_messaging: false,
      },
    });
    return activated;
  }

  /** Suspend country (INACTIVE). Idempotent. Blocks new policy-resolved commerce. */
  async suspendCountry(principal: Principal, isoAlpha2: string, requestId?: string) {
    const iso = isoAlpha2.trim().toUpperCase();
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: iso } });
    if (!country) {
      throw Errors.notFound('Country not found');
    }
    if (country.status === CountryStatus.INACTIVE) {
      const detail = await this.countryReadiness(iso);
      await this.securityEvents.emit({
        type: 'COUNTRY_SUSPENDED',
        outcome: 'success',
        personId: principal.personId,
        requestId,
        metadata: { country_code: iso, idempotent: true, readiness: 'SUSPENDED' },
      });
      return detail ? { ...detail, readiness: 'SUSPENDED' as MarketReadinessState } : detail;
    }
    await this.prisma.country.update({
      where: { id: country.id },
      data: { status: CountryStatus.INACTIVE },
    });
    await this.policyCache.invalidate(iso);
    const detail = await this.countryReadiness(iso);
    await this.securityEvents.emit({
      type: 'COUNTRY_SUSPENDED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: { country_code: iso, readiness: 'SUSPENDED', sandbox: true },
    });
    return detail ? { ...detail, readiness: 'SUSPENDED' as MarketReadinessState } : detail;
  }

  async listCountriesOverview() {
    const countries = await this.prisma.country.findMany({
      orderBy: { isoAlpha2: 'asc' },
      select: {
        id: true,
        isoAlpha2: true,
        nameI18n: true,
        status: true,
        defaultCurrency: true,
        defaultTimezone: true,
        publishedPolicyPackId: true,
        updatedAt: true,
      },
    });

    const rows = await Promise.all(
      countries.map(async (country) => {
        const snapshot = await this.countryReadiness(country.isoAlpha2);
        const nameI18n = country.nameI18n as Record<string, string>;
        return {
          country_code: country.isoAlpha2,
          name: nameI18n.en ?? country.isoAlpha2,
          status: country.status,
          currency: country.defaultCurrency,
          timezone: country.defaultTimezone,
          readiness: snapshot?.readiness ?? 'NOT_READY',
          readiness_legacy: snapshot?.readiness_legacy ?? 'DRAFT',
          blockers: snapshot?.blockers ?? [],
          can_activate_sandbox: snapshot?.can_activate_sandbox ?? false,
          policy_published: Boolean(country.publishedPolicyPackId),
          updated_at: country.updatedAt.toISOString(),
          payments_sandbox: snapshot?.payments.sandbox ?? true,
          delivery_sandbox: snapshot?.logistics.sandbox_carrier ?? true,
          notifications_gated: snapshot?.notifications.live_messaging ?? 'EXTERNAL_GATED',
          finance_gated: snapshot?.finance.live_payout ?? 'EXTERNAL_GATED',
        };
      }),
    );

    return { data: rows };
  }
}
