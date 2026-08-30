import { MembershipScope } from '@prisma/client';
import {
  assertCountryAccess,
  assertLegalEntityAccess,
  assertOrganizationAccess,
  assertRegionAccess,
  countryFilter,
} from './scope';
import type { AccessScope } from './scope';

const platform: AccessScope = {
  personId: 'p1',
  roles: ['company_admin'],
  membershipScope: MembershipScope.platform,
  isCompany: true,
  isPlatform: true,
};

const countryA: AccessScope = {
  personId: 'p2',
  roles: ['company_operations'],
  membershipScope: MembershipScope.country,
  countryId: 'country-a',
  isCompany: true,
  isPlatform: false,
};

const orgA: AccessScope = {
  personId: 'p3',
  roles: ['org_admin'],
  membershipScope: MembershipScope.organization,
  countryId: 'country-a',
  organizationId: 'org-a',
  isCompany: false,
  isPlatform: false,
};

describe('MNC access scope', () => {
  it('lets platform company operators cross countries', () => {
    expect(() => assertCountryAccess(platform, 'country-b')).not.toThrow();
    expect(countryFilter(platform)).toBeUndefined();
  });

  it('blocks country-scoped operators from another country', () => {
    expect(() => assertCountryAccess(countryA, 'country-b')).toThrow();
    expect(countryFilter(countryA)).toBe('country-a');
  });

  it('blocks org admins from another organization', () => {
    expect(() => assertOrganizationAccess(orgA, 'org-b')).toThrow();
    expect(() => assertOrganizationAccess(orgA, 'org-a')).not.toThrow();
  });

  it('blocks legal-entity mismatch unless platform scoped', () => {
    const entity: AccessScope = { ...countryA, legalEntityId: 'le-a' };
    expect(() => assertLegalEntityAccess(entity, 'le-b')).toThrow();
    expect(() => assertLegalEntityAccess(platform, 'le-b')).not.toThrow();
  });

  it('blocks region mismatch unless platform scoped', () => {
    const regional: AccessScope = {
      ...countryA,
      membershipScope: MembershipScope.region,
      regionId: 'region-a',
    };
    expect(() => assertRegionAccess(regional, 'region-b')).toThrow();
    expect(() => assertRegionAccess(platform, 'region-b')).not.toThrow();
  });
});
