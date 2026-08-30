import { Injectable } from '@nestjs/common';
import { OrganizationKind } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { loadAccessScope } from '../identity/scope';

const AFFILIATE_OPERATOR_ROLES = ['org_owner', 'org_admin'] as const;

@Injectable()
export class AffiliateContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAffiliateOrg(principal: Principal): Promise<{ organizationId: string; countryId: string }> {
    const scope = await loadAccessScope(this.prisma, principal);
    if (!scope.organizationId) {
      throw Errors.forbidden('Affiliate organization membership required.');
    }
    const org = await this.prisma.organization.findUnique({ where: { id: scope.organizationId } });
    if (!org || org.kind !== OrganizationKind.AFFILIATE_ORG) {
      throw Errors.forbidden('Affiliate organization membership required.');
    }
    const membership = await this.prisma.membership.findFirst({
      where: {
        personId: principal.personId,
        organizationId: org.id,
        status: 'ACTIVE',
        deletedAt: null,
        role: { code: { in: [...AFFILIATE_OPERATOR_ROLES] } },
      },
    });
    if (!membership) {
      throw Errors.forbidden('Affiliate organization operator access required.');
    }
    return { organizationId: org.id, countryId: org.countryId };
  }
}
