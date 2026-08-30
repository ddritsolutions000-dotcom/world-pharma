import { MembershipScope, MembershipStatus } from '@prisma/client';
import { isCompanyRole } from '../identity/authority';
import type { Principal } from '../identity/current-principal';
import type { PrismaService } from '../app/prisma.service';
import { emptyTenantContext, type CompanyScope, type TenantContext } from './tenant-context';

const SCOPE_RANK: Record<CompanyScope, number> = {
  none: 0,
  location: 1,
  organization: 2,
  business_unit: 3,
  legal_entity: 4,
  country: 5,
  region: 6,
  platform: 7,
};

function membershipToScope(scope: MembershipScope, company: boolean): CompanyScope {
  if (!company) {
    if (scope === MembershipScope.location) {
      return 'location';
    }
    if (scope === MembershipScope.organization) {
      return 'organization';
    }
    return 'none';
  }
  if (scope === MembershipScope.platform) {
    return 'platform';
  }
  if (scope === MembershipScope.region) {
    return 'region';
  }
  if (scope === MembershipScope.country) {
    return 'country';
  }
  if (scope === MembershipScope.legal_entity) {
    return 'legal_entity';
  }
  return 'organization';
}

export async function buildUserTenantContext(
  prisma: PrismaService,
  principal: Principal,
): Promise<TenantContext> {
  const memberships = await prisma.membership.findMany({
    where: { personId: principal.personId, status: MembershipStatus.ACTIVE },
    include: { role: true },
  });
  const ctx = emptyTenantContext('user');
  ctx.personId = principal.personId;
  if (principal.organizationId) {
    ctx.organizationIds.push(principal.organizationId);
  }
  if (principal.countryId) {
    ctx.countryIds.push(principal.countryId);
  }
  if (principal.regionId) {
    ctx.regionIds.push(principal.regionId);
  }
  if (principal.legalEntityId) {
    ctx.legalEntityIds.push(principal.legalEntityId);
  }
  for (const membership of memberships) {
    const company = isCompanyRole(membership.role.code);
    const mapped = membershipToScope(membership.scope, company);
    if (SCOPE_RANK[mapped] > SCOPE_RANK[ctx.companyScope]) {
      ctx.companyScope = mapped;
    }
    if (membership.organizationId) {
      ctx.organizationIds.push(membership.organizationId);
    }
    if (membership.locationId) {
      ctx.locationIds.push(membership.locationId);
    }
    if (membership.countryId) {
      ctx.countryIds.push(membership.countryId);
    }
    if (membership.regionId) {
      ctx.regionIds.push(membership.regionId);
    }
    if (membership.legalEntityId) {
      ctx.legalEntityIds.push(membership.legalEntityId);
    }
  }
  return ctx;
}

export function authTenantContext(personId?: string): TenantContext {
  const ctx = emptyTenantContext('auth');
  ctx.personId = personId;
  return ctx;
}

export function workerTenantContext(input?: {
  organizationId?: string | null;
  countryId?: string | null;
  regionId?: string | null;
  legalEntityId?: string | null;
  personId?: string | null;
}): TenantContext {
  const ctx = emptyTenantContext('worker');
  ctx.personId = input?.personId ?? undefined;
  if (input?.organizationId) {
    ctx.organizationIds = [input.organizationId];
  }
  if (input?.countryId) {
    ctx.countryIds = [input.countryId];
    ctx.companyScope = 'country';
  }
  if (input?.regionId) {
    ctx.regionIds = [input.regionId];
  }
  if (input?.legalEntityId) {
    ctx.legalEntityIds = [input.legalEntityId];
  }
  return ctx;
}
