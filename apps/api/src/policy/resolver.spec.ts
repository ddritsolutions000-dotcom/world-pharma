import { emptyPolicyDocument } from './empty-pack';
import { PolicyResolver } from './resolver';

describe('PolicyResolver fail-closed helpers', () => {
  const resolver = new PolicyResolver({} as never, {} as never);
  const document = emptyPolicyDocument();

  it('denies all services on the empty pack', () => {
    expect(resolver.canUseService(document, 'pharmacy')).toBe(false);
    expect(resolver.canUseService(document, 'LAB')).toBe(false);
    expect(resolver.canUseService(document, 'unknown')).toBe(false);
  });

  it('denies public partner join on the empty pack', () => {
    expect(resolver.canPartnerJoinPublic(document, 'DOCTOR')).toBe(false);
    expect(resolver.isPartnerTypeEnabled(document, 'PHARMACY')).toBe(false);
  });

  it('fails closed when the document is missing', () => {
    expect(resolver.canUseService(null, 'pharmacy')).toBe(false);
    expect(resolver.canPartnerJoinPublic(null, 'DOCTOR')).toBe(false);
    expect(resolver.getCurrency(null)).toBeNull();
  });

  it('fails closed for healthcare hooks on the empty pack', () => {
    expect(resolver.isDoctorOnboardingEnabled(document)).toBe(false);
    expect(resolver.isDoctorPubliclyVisible(document)).toBe(false);
    expect(resolver.isTelemedicineEligible(document)).toBe(false);
    expect(resolver.isConsultationCapable(document)).toBe(false);
    expect(resolver.areAppointmentsEnabled(document)).toBe(false);
    expect(resolver.isBookingConsentRequired(document)).toBe(false);
    expect(resolver.isRxPrescribeEnabled(document)).toBe(false);
    expect(resolver.isRxDispenseEnabled(document)).toBe(false);
    expect(resolver.isRxErxEnabled(document)).toBe(false);
    expect(resolver.isRxAmendEnabled(document)).toBe(false);
    expect(resolver.rxAllowedRestrictionCodes(document)).toEqual([]);
    expect(resolver.isRestrictionCodeAllowed(document, 'X')).toBe(false);
    expect(resolver.requiredCredentialTypes(document)).toEqual([]);
    expect(resolver.isDoctorOnboardingEnabled(null)).toBe(false);
    expect(resolver.isConsultationCapable(null)).toBe(false);
    expect(resolver.isRxPrescribeEnabled(null)).toBe(false);
  });
});
