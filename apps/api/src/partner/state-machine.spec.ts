import { PartnerStatus } from '@prisma/client';
import { assertPartnerTransition, canTransitionPartner } from './state-machine';
import { assertKycTransition, canTransitionKyc } from './kyc-state';

describe('partner state machine', () => {
  it('allows the happy path', () => {
    const path: PartnerStatus[] = [
      'DRAFT',
      'REGISTERED',
      'PROFILE_INCOMPLETE',
      'DOCUMENTS_REQUIRED',
      'DOCUMENTS_SUBMITTED',
      'UNDER_REVIEW',
      'VERIFIED',
      'APPROVED',
      'ACTIVE',
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransitionPartner(path[i], path[i + 1])).toBe(true);
    }
  });

  it('forbids skipping to ACTIVE', () => {
    expect(canTransitionPartner('DRAFT', 'ACTIVE')).toBe(false);
    expect(() => assertPartnerTransition('DRAFT', 'ACTIVE')).toThrow(/Invalid partner transition/);
  });

  it('forbids leaving BLOCKED', () => {
    expect(canTransitionPartner('BLOCKED', 'ACTIVE')).toBe(false);
  });
});

describe('KYC state machine', () => {
  it('allows submit → review → verified', () => {
    expect(canTransitionKyc('NOT_STARTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionKyc('IN_PROGRESS', 'SUBMITTED')).toBe(true);
    expect(canTransitionKyc('SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransitionKyc('UNDER_REVIEW', 'VERIFIED')).toBe(true);
  });

  it('forbids verifying from NOT_STARTED', () => {
    expect(() => assertKycTransition('NOT_STARTED', 'VERIFIED')).toThrow(/Invalid KYC transition/);
  });
});
