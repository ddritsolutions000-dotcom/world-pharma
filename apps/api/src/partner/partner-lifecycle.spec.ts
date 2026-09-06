import { PartnerStatus } from '@prisma/client';
import { mapPartnerStatusToOpsPhase } from './partner-lifecycle';

describe('partner-lifecycle ops phase mapping', () => {
  it('maps draft/registered to APPLIED', () => {
    expect(mapPartnerStatusToOpsPhase(PartnerStatus.DRAFT)).toBe('APPLIED');
    expect(mapPartnerStatusToOpsPhase(PartnerStatus.REGISTERED)).toBe('APPLIED');
  });

  it('maps documents required', () => {
    expect(mapPartnerStatusToOpsPhase(PartnerStatus.DOCUMENTS_REQUIRED)).toBe('DOCUMENTS_REQUIRED');
  });

  it('maps verified/approved with commercial', () => {
    expect(mapPartnerStatusToOpsPhase(PartnerStatus.VERIFIED)).toBe('VERIFIED');
    expect(mapPartnerStatusToOpsPhase(PartnerStatus.VERIFIED, { commercialApproved: true })).toBe(
      'COMMERCIAL_APPROVED',
    );
    expect(mapPartnerStatusToOpsPhase(PartnerStatus.APPROVED, { commercialApproved: true })).toBe(
      'COMMERCIAL_APPROVED',
    );
  });

  it('maps active and suspended', () => {
    expect(mapPartnerStatusToOpsPhase(PartnerStatus.ACTIVE)).toBe('ACTIVE');
    expect(mapPartnerStatusToOpsPhase(PartnerStatus.SUSPENDED)).toBe('SUSPENDED');
  });
});
