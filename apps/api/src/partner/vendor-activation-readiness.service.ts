import { Injectable } from '@nestjs/common';
import {
  KycCaseStatus,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { MarketplaceEligibilityService } from '../catalog/marketplace-eligibility.service';
import { Errors } from '../common/problem';
import { InventoryService } from '../inventory/inventory.service';
import { PolicyResolver } from '../policy/resolver';
import { KycService } from './kyc.service';
import { PharmacyLicenceService } from './pharmacy-licence.service';
import { missingRequiredDocuments } from './join-document-rules';

export type ReadinessCondition = {
  code: string;
  label: string;
  satisfied: boolean;
  required: boolean;
  detail: string | null;
  next_action: string | null;
};

export type VendorOnboardingLifecycle =
  | 'APPLICATION'
  | 'REVIEW'
  | 'APPROVED'
  | 'SETUP'
  | 'READY_FOR_ACTIVATION'
  | 'ACTIVE'
  | 'BLOCKED';

export type VendorOnboardingReadiness = {
  application_id: string;
  partner_id: string;
  partner_status: PartnerStatus;
  partner_type_code: string;
  country_code: string;
  organization_id: string | null;
  lifecycle_phase: VendorOnboardingLifecycle;
  ready_for_activation: boolean;
  marketplace_visible: boolean;
  conditions: ReadinessCondition[];
  next_actions: string[];
  /** Join → seller licence handoff (VENDOR/PHARMACY). Operator verify only — not live KYC. */
  pharmacy_licence: {
    applicable: boolean;
    status: string;
    verified: boolean;
    expired: boolean;
    has_evidence: boolean;
    blockers: string[];
    next_step: string | null;
    vendor_submit_path: string;
    vendor_portal_path: string;
  };
};

const APPROVED_STATUSES = new Set<PartnerStatus>([
  PartnerStatus.APPROVED,
  PartnerStatus.VERIFIED,
  PartnerStatus.ACTIVE,
]);

const BLOCKED_STATUSES = new Set<PartnerStatus>([
  PartnerStatus.REJECTED,
  PartnerStatus.SUSPENDED,
  PartnerStatus.BLOCKED,
  PartnerStatus.DEACTIVATED,
]);

export type PharmacyOnboardingBlocker =
  | 'PHARMACY_LICENSE_MISSING'
  | 'PHARMACY_LICENSE_UNVERIFIED'
  | 'PHARMACY_LICENSE_UNDER_REVIEW'
  | 'PHARMACY_LICENSE_REJECTED'
  | 'PHARMACY_LICENSE_EXPIRED'
  | 'KYC_MISSING'
  | 'KYC_NOT_VERIFIED'
  | 'NO_PUBLISHED_OFFER'
  | 'NO_STOCK'
  | 'SERVICEABILITY_MISSING'
  | 'COUNTRY_NOT_READY'
  | 'COMMERCIAL_APPROVAL_REQUIRED';

@Injectable()
export class VendorActivationReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly kyc: KycService,
    private readonly inventory: InventoryService,
    private readonly marketplace: MarketplaceEligibilityService,
    private readonly licenceService: PharmacyLicenceService,
  ) {}

  async evaluateByApplicationId(applicationId: string): Promise<VendorOnboardingReadiness> {
    const application = await this.prisma.partnerApplication.findUnique({
      where: { id: applicationId },
      include: { partner: true },
    });
    if (!application) {
      throw Errors.notFound('Application not found');
    }
    return this.evaluateApplication(application);
  }

  async evaluateByOrganizationId(organizationId: string): Promise<VendorOnboardingReadiness | null> {
    const partner = await this.prisma.partner.findFirst({
      where: { organizationId, partnerTypeCode: 'VENDOR' },
    });
    if (!partner) {
      return null;
    }
    const application = await this.prisma.partnerApplication.findFirst({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
      include: { partner: true },
    });
    if (!application) {
      return null;
    }
    return this.evaluateApplication(application);
  }

  private async evaluateApplication(
    application: Prisma.PartnerApplicationGetPayload<{ include: { partner: true } }>,
  ): Promise<VendorOnboardingReadiness> {
    const country = await this.prisma.country.findUnique({ where: { id: application.countryId } });
    const countryCode = country?.isoAlpha2 ?? 'XX';
    const resolved = await this.policy.resolvePublished(countryCode);
    const document = resolved?.document ?? null;
    const partner = application.partner;
    const organizationId = partner.organizationId;

    const vendorOnboarding =
      application.partnerTypeCode === 'VENDOR' &&
      this.policy.isPartnerTypeEnabled(document, 'VENDOR');
    const requiredFields = await this.kyc.requiredFields(countryCode, application.partnerTypeCode);
    const requiredDocuments = await this.kyc.requiredDocuments(countryCode, application.partnerTypeCode);
    const storedFields =
      application.applicationFields && typeof application.applicationFields === 'object'
        ? (application.applicationFields as Record<string, string>)
        : {};

    const missingFields = requiredFields.filter((code) => !storedFields[code]?.trim());
    const profileComplete = missingFields.length === 0;

    const kycCase = await this.prisma.kycCase.findFirst({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
    });
    const docs = kycCase
      ? await this.prisma.partnerDocument.findMany({ where: { kycCaseId: kycCase.id } })
      : [];
    const missingDocs = missingRequiredDocuments(requiredDocuments, docs, 'submit');
    const documentsComplete = missingDocs.length === 0;
    const missingVerifiedDocs = missingRequiredDocuments(requiredDocuments, docs, 'activate');
    const documentsVerified = missingVerifiedDocs.length === 0;

    const applicationApproved = APPROVED_STATUSES.has(application.status);
    const partnerActive = application.status === PartnerStatus.ACTIVE && partner.status === PartnerStatus.ACTIVE;

    let organizationLinked = false;
    let organizationActive = false;
    if (organizationId) {
      organizationLinked = true;
      const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
      organizationActive = org?.status === OrganizationStatus.ACTIVE && org.kind === OrganizationKind.VENDOR;
    }

    let catalogReady = false;
    let inventoryReady = false;
    let catalogOfferCount = 0;
    let stockedOfferCount = 0;
    if (organizationId && vendorOnboarding) {
      const offers = await this.prisma.catalogOffer.findMany({
        where: {
          sellerOrgId: organizationId,
          countryId: application.countryId,
          status: OfferStatus.PUBLISHED,
          ownership: { in: [OfferOwnership.VENDOR_OWNED, OfferOwnership.MARKETPLACE] },
          prices: { some: { isCurrent: true } },
        },
        select: { id: true, variantId: true },
      });
      catalogOfferCount = offers.length;
      catalogReady = catalogOfferCount > 0;
      if (catalogReady) {
        for (const offer of offers) {
          const qty = await this.inventory.availableUnits(
            offer.variantId,
            organizationId,
            application.countryId,
          );
          if (qty > 0) {
            stockedOfferCount += 1;
          }
        }
        inventoryReady = stockedOfferCount > 0;
      }
    }

    const serviceabilityRequired = Boolean(document?.shipping?.domestic) && vendorOnboarding;
    let serviceabilityReady = !serviceabilityRequired;
    let serviceabilityZoneCount = 0;
    if (serviceabilityRequired) {
      serviceabilityZoneCount = await this.prisma.serviceabilityZone.count({
        where: {
          countryId: application.countryId,
          active: true,
          medicineDelivery: true,
        },
      });
      serviceabilityReady = serviceabilityZoneCount > 0;
    }

    let marketplaceEligible = false;
    let marketplaceState: string | null = null;
    if (organizationId && vendorOnboarding) {
      const eligibility = await this.marketplace.evaluate(organizationId);
      marketplaceState = eligibility.state;
      marketplaceEligible =
        eligibility.gates.catalog_write &&
        eligibility.attested &&
        eligibility.acceptance === 'ACCEPTED';
    }

    // Sprint 40: pharmacy licence readiness
    // Required when the partner has submitted a licence (indicating it's a pharmacy partner)
    // OR when a verified licence already exists.
    const licenceReadiness = await this.licenceService.computeReadiness(partner.id, application.countryId);
    // Advisory/blocking only when a licence record has been submitted (opt-in by the partner or admin action)
    const licenceRequired = licenceReadiness.hasLicence && vendorOnboarding;

    // Document admin-verify is required for activation when the pack lists required_documents.
    const documentsVerifiedRequired = requiredDocuments.length > 0;
    const kycCaseVerified = kycCase?.status === KycCaseStatus.VERIFIED;
    const kycCasePresent = kycCase != null;
    // Case-level KYC VERIFIED remains advisory — per-document verify is the hard gate.
    const kycVerifiedRequired = false;

    // Sprint 40: commercial approval — required only when an explicit record exists (admin can require it)
    const commercialApproval = await this.prisma.partnerCommercialApproval.findFirst({
      where: { partnerId: partner.id, countryId: application.countryId },
    });
    // Commercial approval blocks only when a record exists AND it is explicitly not approved
    const commercialApprovalRecordExists = commercialApproval != null;
    const commercialApproved = !commercialApprovalRecordExists || (commercialApproval!.approved === true && !commercialApproval!.revokedAt);

    const conditions: ReadinessCondition[] = [
      {
        code: 'profile_complete',
        label: 'Profile complete',
        satisfied: profileComplete,
        required: requiredFields.length > 0,
        detail: profileComplete ? null : `Missing: ${missingFields.join(', ')}`,
        next_action: profileComplete ? null : 'Complete required pharmacy profile fields.',
      },
      {
        code: 'documents_complete',
        label: 'Documents uploaded',
        satisfied: documentsComplete,
        required: requiredDocuments.length > 0,
        detail: documentsComplete ? null : `Missing: ${missingDocs.join(', ')}`,
        next_action: documentsComplete ? null : 'Upload required business/KYC documents.',
      },
      {
        code: 'documents_verified',
        label: 'Documents verified',
        satisfied: documentsVerified,
        required: documentsVerifiedRequired,
        detail: documentsVerified
          ? null
          : `Awaiting admin verify: ${missingVerifiedDocs.join(', ') || requiredDocuments.join(', ')}`,
        next_action: documentsVerified
          ? null
          : 'Admin must verify required KYC documents before activation.',
      },
      {
        code: 'application_approved',
        label: 'Application approved',
        satisfied: applicationApproved,
        required: true,
        detail: applicationApproved ? null : `Status is ${application.status}.`,
        next_action: applicationApproved ? null : 'Wait for company review and approval.',
      },
      {
        code: 'organization_linked',
        label: 'Seller organization linked',
        satisfied: organizationLinked,
        required: true,
        detail: organizationLinked ? null : 'No vendor organization is linked yet.',
        next_action: organizationLinked ? null : 'Company must provision a seller organization.',
      },
      {
        code: 'organization_active',
        label: 'Seller organization active',
        satisfied: organizationActive,
        required: true,
        detail: organizationActive ? null : 'Organization is not ACTIVE.',
        next_action: organizationActive ? null : 'Company must activate the seller organization.',
      },
      {
        code: 'catalog_ready',
        label: 'Catalog ready',
        satisfied: catalogReady,
        required: vendorOnboarding,
        detail: catalogReady ? `${catalogOfferCount} published offer(s).` : 'No published catalog offers.',
        next_action: catalogReady ? null : 'Publish at least one catalog offer with a current price.',
      },
      {
        code: 'inventory_ready',
        label: 'Inventory ready',
        satisfied: inventoryReady,
        required: vendorOnboarding && catalogReady,
        detail: inventoryReady
          ? `${stockedOfferCount} offer(s) with stock.`
          : catalogReady
            ? 'Published offers have no available inventory.'
            : 'Add inventory after catalog offers exist.',
        next_action: inventoryReady ? null : 'Receive or adjust inventory for at least one published offer.',
      },
      {
        code: 'serviceability_ready',
        label: 'Serviceability ready',
        satisfied: serviceabilityReady,
        required: serviceabilityRequired,
        detail: serviceabilityRequired
          ? serviceabilityReady
            ? `${serviceabilityZoneCount} active medicine-delivery zone(s).`
            : 'No active medicine-delivery serviceability zones for this country.'
          : 'Not required by country pack.',
        next_action: serviceabilityReady
          ? null
          : serviceabilityRequired
            ? 'Company must configure country serviceability zones.'
            : null,
      },
      {
        code: 'marketplace_eligible',
        label: 'Marketplace eligible',
        satisfied: marketplaceEligible,
        required: vendorOnboarding && this.policy.canUseService(document, 'marketplace'),
        detail: marketplaceEligible ? 'Marketplace participation accepted.' : marketplaceState ?? 'Not evaluated.',
        next_action: marketplaceEligible
          ? null
          : 'Complete marketplace attestation and company acceptance.',
      },
      {
        code: 'partner_active',
        label: 'Partner activated',
        satisfied: partnerActive,
        required: true,
        detail: partnerActive ? null : 'Partner is not ACTIVE yet.',
        next_action: partnerActive ? null : 'Company must activate the approved vendor application.',
      },
      // Sprint 40 conditions
      {
        code: 'pharmacy_licence_verified',
        label: 'Pharmacy licence verified',
        satisfied: licenceReadiness.isVerified,
        required: licenceRequired,
        detail: licenceReadiness.isVerified
          ? 'Licence verified.'
          : licenceReadiness.blockers[0] ?? 'Licence not verified.',
        next_action: licenceReadiness.isVerified
          ? null
          : 'Submit pharmacy licence for admin verification.',
      },
      {
        code: 'kyc_verified',
        label: 'KYC verified',
        satisfied: kycCasePresent ? kycCaseVerified : true,
        required: kycVerifiedRequired,
        detail: kycCasePresent
          ? `KYC status: ${kycCase?.status ?? 'UNKNOWN'}`
          : 'No KYC case opened yet.',
        next_action: (kycCasePresent && !kycCaseVerified) ? 'Complete KYC and await admin verification.' : null,
      },
      {
        code: 'commercial_approved',
        label: 'Commercial approval',
        satisfied: commercialApproved,
        // Required only when an approval record exists (admin has explicitly placed a commercial gate)
        required: commercialApprovalRecordExists,
        detail: commercialApprovalRecordExists
          ? (commercialApproved ? 'Commercial relationship approved.' : 'Commercial approval not yet granted.')
          : 'No commercial approval gate configured.',
        next_action: (commercialApprovalRecordExists && !commercialApproved) ? 'Await admin commercial approval.' : null,
      },
    ];

    const setupConditions = conditions.filter(
      (row) =>
        row.required &&
        [
          'profile_complete',
          'documents_complete',
          'documents_verified',
          'application_approved',
          'organization_linked',
          'organization_active',
          'catalog_ready',
          'inventory_ready',
          'serviceability_ready',
          'marketplace_eligible',
          'pharmacy_licence_verified',
          'kyc_verified',
          'commercial_approved',
        ].includes(row.code),
    );
    const readyForActivation =
      applicationApproved &&
      !partnerActive &&
      !BLOCKED_STATUSES.has(application.status) &&
      setupConditions.every((row) => row.satisfied);

    const marketplaceVisible =
      partnerActive &&
      organizationActive &&
      Boolean(organizationId) &&
      (await this.marketplace.evaluate(organizationId!)).state === 'ELIGIBLE';

    const lifecyclePhase = this.resolveLifecyclePhase(application.status, readyForActivation, partnerActive);

    const nextActions = conditions
      .filter((row) => row.required && !row.satisfied && row.next_action)
      .map((row) => row.next_action as string);

    const pharmacyLicenceApplicable =
      application.partnerTypeCode === 'VENDOR' || application.partnerTypeCode === 'PHARMACY';
    const licenceRow = pharmacyLicenceApplicable
      ? await this.licenceService.getForPartner(partner.id)
      : null;
    const pharmacyLicenceNextStep = !pharmacyLicenceApplicable
      ? null
      : licenceReadiness.isVerified
        ? null
        : !licenceReadiness.hasLicence
          ? 'Submit pharmacy retail licence details in the seller portal for company operator review.'
          : licenceReadiness.blockers.includes('PHARMACY_LICENSE_REJECTED')
            ? 'Update and resubmit pharmacy licence after addressing the rejection reason.'
            : 'Await company operator verification of your pharmacy licence (not a live government check).';

    if (pharmacyLicenceApplicable && pharmacyLicenceNextStep) {
      nextActions.unshift(pharmacyLicenceNextStep);
    }

    return {
      application_id: application.id,
      partner_id: partner.id,
      partner_status: application.status,
      partner_type_code: application.partnerTypeCode,
      country_code: countryCode,
      organization_id: organizationId,
      lifecycle_phase: lifecyclePhase,
      ready_for_activation: readyForActivation,
      marketplace_visible: marketplaceVisible,
      conditions,
      next_actions: nextActions,
      pharmacy_licence: {
        applicable: pharmacyLicenceApplicable,
        status: licenceReadiness.status,
        verified: licenceReadiness.isVerified,
        expired: licenceReadiness.isExpired,
        has_evidence: Boolean(licenceRow?.evidenceObjectKey),
        blockers: pharmacyLicenceApplicable ? licenceReadiness.blockers : [],
        next_step: pharmacyLicenceNextStep,
        vendor_submit_path: '/api/v1/vendor/onboarding/pharmacy-licence',
        vendor_portal_path: '/join/status',
      },
    };
  }

  private resolveLifecyclePhase(
    status: PartnerStatus,
    readyForActivation: boolean,
    partnerActive: boolean,
  ): VendorOnboardingLifecycle {
    if (BLOCKED_STATUSES.has(status)) {
      return 'BLOCKED';
    }
    if (partnerActive) {
      return 'ACTIVE';
    }
    if (readyForActivation) {
      return 'READY_FOR_ACTIVATION';
    }
    if (status === PartnerStatus.APPROVED || status === PartnerStatus.VERIFIED) {
      return 'SETUP';
    }
    if (
      status === PartnerStatus.UNDER_REVIEW ||
      status === PartnerStatus.DOCUMENTS_SUBMITTED ||
      status === PartnerStatus.ADDITIONAL_INFORMATION_REQUIRED
    ) {
      return 'REVIEW';
    }
    return 'APPLICATION';
  }
}
