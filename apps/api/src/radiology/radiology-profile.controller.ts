import { Controller, Get, UseGuards } from '@nestjs/common';
import { OrganizationKind, OrganizationStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';

@Controller('radiology')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class RadiologyProfileController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  me(@CurrentPrincipal() principal: Principal) {
    return { person_id: principal.personId };
  }

  @Get('organizations')
  async organizations(@CurrentPrincipal() principal: Principal) {
    const memberships = await this.prisma.membership.findMany({
      where: {
        personId: principal.personId,
        status: 'ACTIVE',
        deletedAt: null,
        organizationId: { not: null },
        organization: {
          kind: OrganizationKind.IMAGING_CENTER,
          status: { in: [OrganizationStatus.ACTIVE, OrganizationStatus.DRAFT, OrganizationStatus.SUSPENDED] },
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            kind: true,
            status: true,
            country: { select: { isoAlpha2: true, nameI18n: true } },
          },
        },
        role: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const seen = new Map<string, unknown>();
    for (const row of memberships) {
      if (!row.organization || row.organization.kind !== OrganizationKind.IMAGING_CENTER) {
        continue;
      }
      seen.set(row.organization.id, {
        id: row.organization.id,
        display_name: row.organization.displayName,
        legal_name: row.organization.legalName,
        kind: row.organization.kind,
        status: row.organization.status,
        country_code: row.organization.country.isoAlpha2,
        role_code: row.role.code,
        role_name: row.role.name,
        location_id: row.locationId,
      });
    }
    return { data: [...seen.values()] };
  }
}
