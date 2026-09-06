import { PartnerStatus } from '@prisma/client';

/**
 * Sprint 43 — conceptual pharmacy partner ops phases mapped onto existing PartnerStatus.
 * Do not invent a parallel enum in the DB; reuse PartnerStatus transitions.
 */
export type PharmacyPartnerOpsPhase =
  | 'APPLIED'
  | 'UNDER_REVIEW'
  | 'DOCUMENTS_REQUIRED'
  | 'VERIFICATION_PENDING'
  | 'VERIFIED'
  | 'COMMERCIAL_APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'WITHDRAWN';

export function mapPartnerStatusToOpsPhase(
  status: PartnerStatus,
  opts?: { commercialApproved?: boolean },
): PharmacyPartnerOpsPhase {
  switch (status) {
    case PartnerStatus.DRAFT:
    case PartnerStatus.REGISTERED:
    case PartnerStatus.PROFILE_INCOMPLETE:
    case PartnerStatus.DOCUMENTS_SUBMITTED:
      return 'APPLIED';
    case PartnerStatus.DOCUMENTS_REQUIRED:
    case PartnerStatus.ADDITIONAL_INFORMATION_REQUIRED:
      return 'DOCUMENTS_REQUIRED';
    case PartnerStatus.UNDER_REVIEW:
      return 'UNDER_REVIEW';
    case PartnerStatus.VERIFIED:
      return opts?.commercialApproved ? 'COMMERCIAL_APPROVED' : 'VERIFIED';
    case PartnerStatus.APPROVED:
      return opts?.commercialApproved ? 'COMMERCIAL_APPROVED' : 'VERIFICATION_PENDING';
    case PartnerStatus.ACTIVE:
      return 'ACTIVE';
    case PartnerStatus.SUSPENDED:
      return 'SUSPENDED';
    case PartnerStatus.REJECTED:
      return 'REJECTED';
    case PartnerStatus.DEACTIVATED:
    case PartnerStatus.BLOCKED:
      return 'WITHDRAWN';
    case PartnerStatus.REACTIVATION_REQUESTED:
      return 'UNDER_REVIEW';
    default:
      return 'APPLIED';
  }
}

/** KYC verification class — never conflate internal review with live provider verification. */
export const KYC_VERIFICATION_INTERNAL = 'INTERNAL_VERIFIED' as const;
export const KYC_VERIFICATION_EXTERNAL = 'EXTERNAL_PROVIDER_VERIFIED' as const;
export type KycVerificationClass =
  | typeof KYC_VERIFICATION_INTERNAL
  | typeof KYC_VERIFICATION_EXTERNAL;
