import { MembershipScope } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { isCompanyMembershipScope, isCompanyRole } from './authority';
import type { Principal } from './current-principal';

export type AccessScope = {
  personId: string;
  roles: string[];
  membershipScope?: MembershipScope;
  countryId?: string;
  organizationId?: string;
  regionId?: string;
  legalEntityId?: string;
  isCompany: boolean;
  isPlatform: boolean;
};

const MEMBERSHIP_SCOPE_RANK: Record<MembershipScope, number> = {
  self: 0,
  location: 1,
  organization: 2,
  legal_entity: 3,
  country: 4,
  region: 5,
  platform: 6,
};

export async function loadAccessScope(prisma: PrismaService, principal: Principal): Promise<AccessScope> {
  const memberships = await prisma.membership.findMany({
    where: { personId: principal.personId, status: 'ACTIVE', deletedAt: null },
    include: { role: true },
  });
  const companyMemberships = memberships.filter(
    (row) => isCompanyRole(row.role.code) && isCompanyMembershipScope(row.scope),
  );
  const isPlatform = companyMemberships.some((row) => row.scope === MembershipScope.platform);
  const preferred = principal.membershipId
    ? companyMemberships.find((row) => row.id === principal.membershipId)
    : undefined;
  const membership =
    preferred
    ?? [...companyMemberships].sort(
      (left, right) => MEMBERSHIP_SCOPE_RANK[right.scope] - MEMBERSHIP_SCOPE_RANK[left.scope],
    )[0];

  if (!membership) {
    return {
      personId: principal.personId,
      roles: principal.roles,
      countryId: principal.countryId,
      organizationId: principal.organizationId,
      regionId: principal.regionId,
      legalEntityId: principal.legalEntityId,
      isCompany: principal.roles.some((role) => isCompanyRole(role)),
      isPlatform,
    };
  }

  return {
    personId: principal.personId,
    roles: principal.roles,
    membershipScope: membership.scope,
    countryId: membership.countryId ?? principal.countryId,
    organizationId: membership.organizationId ?? undefined,
    regionId: membership.regionId ?? undefined,
    legalEntityId: membership.legalEntityId ?? undefined,
    isCompany: true,
    isPlatform,
  };
}

export function assertCountryAccess(scope: AccessScope, countryId: string): void {
  if (scope.isPlatform) {
    return;
  }
  if (scope.countryId && scope.countryId === countryId) {
    return;
  }
  throw Errors.forbidden('This country is outside the current membership scope.');
}

export function assertOrganizationAccess(scope: AccessScope, organizationId: string): void {
  if (scope.isPlatform) {
    return;
  }
  if (scope.organizationId && scope.organizationId === organizationId) {
    return;
  }
  throw Errors.forbidden('This organization is outside the current membership scope.');
}

export function assertLegalEntityAccess(scope: AccessScope, legalEntityId: string): void {
  if (scope.isPlatform) {
    return;
  }
  if (scope.legalEntityId && scope.legalEntityId === legalEntityId) {
    return;
  }
  throw Errors.forbidden('This legal entity is outside the current membership scope.');
}

export function countryFilter(scope: AccessScope): string | undefined {
  if (scope.isPlatform) {
    return undefined;
  }
  return scope.countryId;
}

export function assertRegionAccess(scope: AccessScope, regionId: string): void {
  if (scope.isPlatform) {
    return;
  }
  if (scope.regionId && scope.regionId === regionId) {
    return;
  }
  throw Errors.forbidden('This region is outside the current membership scope.');
}
