import { Injectable } from '@nestjs/common';
import {
  CountryProductionLifecycle,
  KycCaseStatus,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  PharmacyLicenceStatus,
} from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import {
  KYC_VERIFICATION_EXTERNAL,
  mapPartnerStatusToOpsPhase,
  type PharmacyPartnerOpsPhase,
} from './partner-lifecycle';
import { PharmacyLicenceService } from './pharmacy-licence.service';
import {
  VendorActivationReadinessService,
  type ReadinessCondition,
  type VendorOnboardingReadiness,
} from './vendor-activation-readiness.service';

export type PartnerOpsBlocker =
  | 'PROFILE_INCOMPLETE'
  | 'ORGANIZATION_NOT_LINKED'
  | 'ORGANIZATION_INACTIVE'
  | 'LICENCE_NOT_SUBMITTED'
  | 'LICENCE_UNDER_REVIEW'
  | 'LICENCE_NOT_VERIFIED'
  | 'LICENCE_EXPIRED'
  | 'LICENCE_REJECTED'
  | 'KYC_NOT_VERIFIED'
  | 'KYC_EXPIRED'
  | 'KYC_EXTERNAL_GATED'
  | 'COMMERCIAL_APPROVAL_MISSING'
  | 'CATALOG_NOT_READY'
  | 'INVENTORY_NOT_READY'
  | 'SERVICEABILITY_NOT_READY'
  | 'MARKETPLACE_NOT_ELIGIBLE'
  | 'APPLICATION_NOT_APPROVED'
  | 'COUNTRY_NOT_PRODUCTION_ACTIVE'
  | 'COUNTRY_PRODUCTION_SUSPENDED'
  | 'PARTNER_SUSPENDED'
  | 'PARTNER_NOT_ACTIVE';

export type DocumentChecklistRow = {
  requirement_code: string;
  label: string;
  required: boolean;
  submitted: boolean;
  verified: boolean;
  expiry: string | null;
  status: string;
  source: 'regulatory_requirement' | 'pharmacy_licence' | 'kyc_document';
};

export type PartnerOperationsReadiness = {
  partner_id: string;
  application_id: string;
  country_code: string;
  country_id: string;
  organization_id: string | null;
  lifecycle: PharmacyPartnerOpsPhase;
  partner_status: PartnerStatus;
  licence_readiness: {
    status: string;
    verified: boolean;
    expired: boolean;
  };
  kyc_readiness: {
    status: string | null;
    verified: boolean;
    verification_class: string | null;
    external_provider_verified: boolean;
    external_gated: boolean;
  };
  commercial_readiness: {
    approved: boolean;
    approved_by_id: string | null;
    approved_at: string | null;
  };
  organization_readiness: {
    linked: boolean;
    active: boolean;
  };
  catalog_readiness: { ready: boolean; offer_count: number };
  inventory_readiness: { ready: boolean };
  serviceability_readiness: { ready: boolean; required: boolean };
  marketplace_eligibility: { eligible: boolean; state: string | null };
  country_production: {
    lifecycle: CountryProductionLifecycle;
    active: boolean;
  };
  document_checklist: DocumentChecklistRow[];
  conditions: ReadinessCondition[];
  final_status: 'READY' | 'BLOCKED' | 'ACTIVE' | 'SUSPENDED';
  ready_for_activation: boolean;
  marketplace_purchasable: boolean;
  blockers: PartnerOpsBlocker[];
  warnings: string[];
};

const CONDITION_BLOCKER: Record<string, PartnerOpsBlocker> = {
  profile_complete: 'PROFILE_INCOMPLETE',
  documents_complete: 'KYC_NOT_VERIFIED',
  application_approved: 'APPLICATION_NOT_APPROVED',
  organization_linked: 'ORGANIZATION_NOT_LINKED',
  organization_active: 'ORGANIZATION_INACTIVE',
  catalog_ready: 'CATALOG_NOT_READY',
  inventory_ready: 'INVENTORY_NOT_READY',
  serviceability_ready: 'SERVICEABILITY_NOT_READY',
  marketplace_eligible: 'MARKETPLACE_NOT_ELIGIBLE',
  pharmacy_licence_verified: 'LICENCE_NOT_VERIFIED',
  kyc_verified: 'KYC_NOT_VERIFIED',
  commercial_approved: 'COMMERCIAL_APPROVAL_MISSING',
  country_production_active: 'COUNTRY_NOT_PRODUCTION_ACTIVE',
  partner_active: 'PARTNER_NOT_ACTIVE',
};

@Injectable()
export class PartnerOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vendorReadiness: VendorActivationReadinessService,
    private readonly licenceService: PharmacyLicenceService,
  ) {}

  async evaluateByApplicationId(applicationId: string): Promise<PartnerOperationsReadiness> {
    const base = await this.vendorReadiness.evaluateByApplicationId(applicationId);
    return this.compose(base);
  }

  async evaluateByPartnerId(partnerId: string): Promise<PartnerOperationsReadiness> {
    const application = await this.prisma.partnerApplication.findFirst({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
    });
    if (!application) throw Errors.notFound('Partner application not found');
    return this.evaluateByApplicationId(application.id);
  }

  /**
   * Authoritative marketplace purchasability for a seller org under current partner + country state.
   * Fail-closed for production-active countries; sandbox (non-ACTIVE production lifecycle) keeps
   * softer Sprint 40/41 behaviour unless an explicit licence/commercial gate is present.
   */
  async assertSellerPurchasable(sellerOrgId: string): Promise<{
    purchasable: boolean;
    blockers: PartnerOpsBlocker[];
  }> {
    const partner = await this.prisma.partner.findFirst({
      where: { organizationId: sellerOrgId },
      include: { country: true },
    });
    if (!partner) {
      return { purchasable: true, blockers: [] };
    }
    if (
      partner.status === PartnerStatus.SUSPENDED ||
      partner.status === PartnerStatus.BLOCKED ||
      partner.status === PartnerStatus.DEACTIVATED ||
      partner.status === PartnerStatus.REJECTED
    ) {
      return { purchasable: false, blockers: ['PARTNER_SUSPENDED'] };
    }
    if (partner.status !== PartnerStatus.ACTIVE) {
      return { purchasable: false, blockers: ['PARTNER_NOT_ACTIVE'] };
    }

    const productionLifecycle = partner.country.productionLifecycle;
    if (productionLifecycle === CountryProductionLifecycle.SUSPENDED) {
      return { purchasable: false, blockers: ['COUNTRY_PRODUCTION_SUSPENDED'] };
    }

    const blockers: PartnerOpsBlocker[] = [];
    const licence = await this.licenceService.computeReadiness(partner.id, partner.countryId);
    const commercial = await this.prisma.partnerCommercialApproval.findFirst({
      where: { partnerId: partner.id, countryId: partner.countryId },
    });
    const kyc = await this.prisma.kycCase.findFirst({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
    });

    const productionHard = productionLifecycle === CountryProductionLifecycle.ACTIVE;

    if (productionHard || licence.hasLicence) {
      if (!licence.hasLicence) blockers.push('LICENCE_NOT_SUBMITTED');
      else if (licence.isExpired) blockers.push('LICENCE_EXPIRED');
      else if (licence.status === PharmacyLicenceStatus.UNDER_REVIEW) blockers.push('LICENCE_UNDER_REVIEW');
      else if (licence.status === PharmacyLicenceStatus.REJECTED) blockers.push('LICENCE_REJECTED');
      else if (!licence.isVerified) blockers.push('LICENCE_NOT_VERIFIED');
    }

    if (productionHard || commercial != null) {
      const approved = commercial?.approved === true && !commercial.revokedAt;
      if (!approved) blockers.push('COMMERCIAL_APPROVAL_MISSING');
    }

    if (productionHard) {
      const kycOk =
        kyc?.status === KycCaseStatus.VERIFIED &&
        (kyc.expiresAt == null || kyc.expiresAt > new Date());
      if (!kycOk) {
        if (kyc?.status === KycCaseStatus.EXPIRED || (kyc?.expiresAt && kyc.expiresAt <= new Date())) {
          blockers.push('KYC_EXPIRED');
        } else {
          blockers.push('KYC_NOT_VERIFIED');
        }
      }
      if (kyc?.verificationLevel === KYC_VERIFICATION_EXTERNAL) {
        // Live provider not wired — treat as external-gated warning path only when claimed.
        blockers.push('KYC_EXTERNAL_GATED');
      }
    } else if (kyc?.status === KycCaseStatus.EXPIRED) {
      blockers.push('KYC_EXPIRED');
    }

    return { purchasable: blockers.length === 0, blockers };
  }

  async activatePharmacyPartner(_input: {
    principal: Principal;
    applicationId: string;
    organizationId?: string;
    locationId?: string;
    roleCode?: string;
  }): Promise<PartnerOperationsReadiness & { activated: boolean; idempotent?: boolean }> {
    const readiness = await this.evaluateByApplicationId(_input.applicationId);
    if (readiness.partner_status === PartnerStatus.ACTIVE) {
      return { ...readiness, activated: true, idempotent: true };
    }
    if (!readiness.ready_for_activation) {
      throw Errors.validation(
        readiness.blockers.length
          ? `Not ready for pharmacy partner activation: ${readiness.blockers.join(', ')}`
          : 'Not ready for pharmacy partner activation',
      );
    }
    // Controller performs PartnerService.activateApplication after this gate.
    return { ...readiness, activated: false };
  }

  async documentChecklist(partnerId: string): Promise<DocumentChecklistRow[]> {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw Errors.notFound('Partner not found');

    const requirements = await this.prisma.regulatoryRequirement.findMany({
      where: { countryId: partner.countryId, status: 'REQUIRED' },
      orderBy: { code: 'asc' },
    });

    const evidence = await this.prisma.regulatoryEvidence.findMany({
      where: { countryId: partner.countryId },
    });

    const licence = await this.licenceService.getForPartner(partnerId);
    const kyc = await this.prisma.kycCase.findFirst({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      include: { documents: true },
    });

    const rows: DocumentChecklistRow[] = requirements.map((req) => {
      const linked = evidence.filter((e) => e.requirementId === req.id);
      const latest = linked.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const submitted = latest != null && latest.status !== 'PENDING';
      const verified = latest?.status === 'VERIFIED';
      return {
        requirement_code: req.code,
        label: req.label,
        required: true,
        submitted,
        verified,
        expiry: latest?.expiresAt?.toISOString() ?? null,
        status: latest?.status ?? 'MISSING',
        source: 'regulatory_requirement',
      };
    });

    // Pharmacy licence row when licence model is in play (not invented when no licence + no pharmacy req)
    const pharmacyReq = requirements.find((r) =>
      /PHARMACY|LICENCE|LICENSE/i.test(r.code) || /pharmacy|licence|license/i.test(r.label),
    );
    if (licence || pharmacyReq) {
      const alreadyCovered = pharmacyReq
        ? rows.some((r) => r.requirement_code === pharmacyReq.code)
        : false;
      if (!alreadyCovered) {
        rows.push({
          requirement_code: 'PHARMACY_LICENCE',
          label: 'Pharmacy licence',
          required: true,
          submitted: licence != null && licence.status !== PharmacyLicenceStatus.NOT_SUBMITTED,
          verified: licence?.status === PharmacyLicenceStatus.VERIFIED,
          expiry: licence?.expiresAt?.toISOString() ?? null,
          status: licence?.status ?? 'NOT_SUBMITTED',
          source: 'pharmacy_licence',
        });
      }
    }

    if (kyc?.documents?.length) {
      for (const doc of kyc.documents) {
        rows.push({
          requirement_code: doc.documentTypeCode,
          label: doc.documentTypeCode,
          required: false,
          submitted: true,
          verified: doc.status === 'VERIFIED',
          expiry: doc.expiresOn?.toISOString() ?? null,
          status: doc.status,
          source: 'kyc_document',
        });
      }
    }

    return rows;
  }

  private async compose(base: VendorOnboardingReadiness): Promise<PartnerOperationsReadiness> {
    const partner = await this.prisma.partner.findUnique({
      where: { id: base.partner_id },
      include: { country: true },
    });
    if (!partner) throw Errors.notFound('Partner not found');

    const licenceReadiness = await this.licenceService.computeReadiness(
      partner.id,
      partner.countryId,
    );
    const commercial = await this.prisma.partnerCommercialApproval.findFirst({
      where: { partnerId: partner.id, countryId: partner.countryId },
    });
    const commercialApproved = commercial?.approved === true && !commercial.revokedAt;
    const kyc = await this.prisma.kycCase.findFirst({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
    });

    const productionLifecycle = partner.country.productionLifecycle;
    const countryProductionActive = productionLifecycle === CountryProductionLifecycle.ACTIVE;

    const orgLinked = Boolean(base.organization_id);
    let orgActive = false;
    if (base.organization_id) {
      const org = await this.prisma.organization.findUnique({ where: { id: base.organization_id } });
      orgActive = org?.status === OrganizationStatus.ACTIVE && org.kind === OrganizationKind.VENDOR;
    }

    const kycVerified =
      kyc?.status === KycCaseStatus.VERIFIED &&
      (kyc.expiresAt == null || kyc.expiresAt > new Date());
    const verificationClass = kyc?.verificationLevel ?? null;
    const externalProviderVerified = verificationClass === KYC_VERIFICATION_EXTERNAL;
    // No live KYC provider — claiming EXTERNAL is never satisfied in-software.
    const externalGated = true;

    const hardenedConditions: ReadinessCondition[] = base.conditions.map((c) => {
      if (c.code === 'pharmacy_licence_verified') {
        return {
          ...c,
          required: true,
          satisfied: licenceReadiness.isVerified,
          detail: licenceReadiness.isVerified
            ? 'Licence verified (operator action — not regulator DB).'
            : licenceReadiness.blockers[0] ?? 'Licence not verified.',
          next_action: licenceReadiness.isVerified
            ? null
            : 'Submit pharmacy licence and await admin verification.',
        };
      }
      if (c.code === 'kyc_verified') {
        return {
          ...c,
          required: true,
          satisfied: kycVerified && !externalProviderVerified,
          detail: kyc
            ? `KYC ${kyc.status}; class=${verificationClass ?? 'NONE'}; live_provider=EXTERNAL_GATED`
            : 'KYC not started.',
          next_action: kycVerified
            ? null
            : 'Complete KYC for internal operator verification (not live provider).',
        };
      }
      if (c.code === 'commercial_approved') {
        return {
          ...c,
          required: true,
          satisfied: commercialApproved,
          detail: commercialApproved
            ? 'Commercial participation approved.'
            : 'Commercial approval missing.',
          next_action: commercialApproved ? null : 'Await Main Admin commercial approval.',
        };
      }
      return c;
    });

    hardenedConditions.push({
      code: 'country_production_active',
      label: 'Country production active',
      satisfied: countryProductionActive,
      required: true,
      detail: `Country production lifecycle: ${productionLifecycle}`,
      next_action: countryProductionActive
        ? null
        : 'Country must reach production lifecycle ACTIVE before marketplace production activation.',
    });

    const checklist = await this.documentChecklist(partner.id);

    const blockers: PartnerOpsBlocker[] = [];
    const warnings: string[] = [];

    if (partner.status === PartnerStatus.SUSPENDED) blockers.push('PARTNER_SUSPENDED');
    if (productionLifecycle === CountryProductionLifecycle.SUSPENDED) {
      blockers.push('COUNTRY_PRODUCTION_SUSPENDED');
    }

    for (const c of hardenedConditions) {
      if (!c.required || c.satisfied) continue;
      if (c.code === 'pharmacy_licence_verified') {
        if (!licenceReadiness.hasLicence) blockers.push('LICENCE_NOT_SUBMITTED');
        else if (licenceReadiness.isExpired) blockers.push('LICENCE_EXPIRED');
        else if (licenceReadiness.status === 'UNDER_REVIEW') blockers.push('LICENCE_UNDER_REVIEW');
        else if (licenceReadiness.status === 'REJECTED') blockers.push('LICENCE_REJECTED');
        else blockers.push('LICENCE_NOT_VERIFIED');
        continue;
      }
      if (c.code === 'kyc_verified' && externalProviderVerified) {
        blockers.push('KYC_EXTERNAL_GATED');
        continue;
      }
      blockers.push(CONDITION_BLOCKER[c.code] ?? (c.code.toUpperCase() as PartnerOpsBlocker));
    }

    if (externalGated) {
      warnings.push('Live KYC provider remains EXTERNAL_GATED — INTERNAL_VERIFIED is operator review only.');
    }
    if (!countryProductionActive) {
      warnings.push('Country production lifecycle is not ACTIVE — sandbox commerce may still operate.');
    }

    const setupOk = hardenedConditions
      .filter((c) => c.required && c.code !== 'partner_active')
      .every((c) => c.satisfied);

    const readyForActivation =
      setupOk &&
      !blockers.includes('PARTNER_SUSPENDED') &&
      partner.status !== PartnerStatus.ACTIVE &&
      (partner.status === PartnerStatus.APPROVED || partner.status === PartnerStatus.VERIFIED);

    const purchasability = base.organization_id
      ? await this.assertSellerPurchasable(base.organization_id)
      : { purchasable: false, blockers: ['ORGANIZATION_NOT_LINKED'] as PartnerOpsBlocker[] };

    let finalStatus: PartnerOperationsReadiness['final_status'] = 'BLOCKED';
    if (partner.status === PartnerStatus.SUSPENDED) finalStatus = 'SUSPENDED';
    else if (partner.status === PartnerStatus.ACTIVE && purchasability.purchasable) finalStatus = 'ACTIVE';
    else if (readyForActivation) finalStatus = 'READY';
    else finalStatus = 'BLOCKED';

    return {
      partner_id: partner.id,
      application_id: base.application_id,
      country_code: base.country_code,
      country_id: partner.countryId,
      organization_id: base.organization_id,
      lifecycle: mapPartnerStatusToOpsPhase(partner.status, { commercialApproved }),
      partner_status: partner.status,
      licence_readiness: {
        status: String(licenceReadiness.status),
        verified: licenceReadiness.isVerified,
        expired: licenceReadiness.isExpired,
      },
      kyc_readiness: {
        status: kyc?.status ?? null,
        verified: kycVerified,
        verification_class: verificationClass,
        external_provider_verified: externalProviderVerified,
        external_gated: externalGated,
      },
      commercial_readiness: {
        approved: commercialApproved,
        approved_by_id: commercial?.approvedById ?? null,
        approved_at: commercial?.approvedAt?.toISOString() ?? null,
      },
      organization_readiness: { linked: orgLinked, active: orgActive },
      catalog_readiness: {
        ready: base.conditions.find((c) => c.code === 'catalog_ready')?.satisfied ?? false,
        offer_count: Number(
          (base.conditions.find((c) => c.code === 'catalog_ready')?.detail ?? '').match(/\d+/)?.[0] ?? 0,
        ),
      },
      inventory_readiness: {
        ready: base.conditions.find((c) => c.code === 'inventory_ready')?.satisfied ?? false,
      },
      serviceability_readiness: {
        ready: base.conditions.find((c) => c.code === 'serviceability_ready')?.satisfied ?? true,
        required: base.conditions.find((c) => c.code === 'serviceability_ready')?.required ?? false,
      },
      marketplace_eligibility: {
        eligible: base.conditions.find((c) => c.code === 'marketplace_eligible')?.satisfied ?? false,
        state: base.conditions.find((c) => c.code === 'marketplace_eligible')?.detail ?? null,
      },
      country_production: {
        lifecycle: productionLifecycle,
        active: countryProductionActive,
      },
      document_checklist: checklist,
      conditions: hardenedConditions,
      final_status: finalStatus,
      ready_for_activation: readyForActivation,
      marketplace_purchasable: purchasability.purchasable,
      blockers: [...new Set([...blockers, ...purchasability.blockers])],
      warnings,
    };
  }
}
