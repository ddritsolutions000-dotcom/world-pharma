import { MembershipScope } from '@prisma/client';
import { companyGovernanceLevel } from './authority';

describe('company governance levels', () => {
  it('maps company platform membership to global company', () => {
    expect(companyGovernanceLevel({ isCompany: true, scope: MembershipScope.platform })).toBe(
      'global_company',
    );
  });

  it('never treats a partner platform membership as global company', () => {
    expect(companyGovernanceLevel({ isCompany: false, scope: MembershipScope.platform })).toBe('none');
  });

  it('maps region, country, legal entity, organization, and location', () => {
    expect(companyGovernanceLevel({ isCompany: true, scope: MembershipScope.region })).toBe('region');
    expect(companyGovernanceLevel({ isCompany: true, scope: MembershipScope.country })).toBe('country');
    expect(companyGovernanceLevel({ isCompany: true, scope: MembershipScope.legal_entity })).toBe(
      'legal_entity',
    );
    expect(companyGovernanceLevel({ isCompany: false, scope: MembershipScope.organization })).toBe(
      'organization',
    );
    expect(companyGovernanceLevel({ isCompany: false, scope: MembershipScope.location })).toBe('location');
  });
});
