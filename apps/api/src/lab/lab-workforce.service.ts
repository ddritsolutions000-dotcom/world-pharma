import { Injectable } from '@nestjs/common';
import { OrganizationKind } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { assertLabOrgAccess } from '../catalog/access';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const WORKFORCE_PARTNER_TYPES = ['PHLEBOTOMIST', 'PATHOLOGIST', 'LAB'] as const;

@Injectable()
export class LabWorkforceService {
  constructor(private readonly prisma: PrismaService) {}

  async listTeam(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const org = await this.prisma.organization.findFirst({
      where: { id: labOrgId, kind: OrganizationKind.LAB },
      include: { country: { select: { isoAlpha2: true, id: true } } },
    });
    if (!org) {
      throw Errors.notFound('Lab organization not found.');
    }

    return this.prisma.runWithTenant(
      workerTenantContext({
        countryId: org.country.id,
        organizationId: labOrgId,
        personId: principal.personId,
      }),
      async () => {
        const memberships = await this.prisma.membership.findMany({
          where: {
            organizationId: labOrgId,
            status: 'ACTIVE',
            deletedAt: null,
          },
          include: {
            role: { select: { code: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        });

        const personIds = memberships.map((row) => row.personId);
        const partners =
          personIds.length > 0
            ? await this.prisma.partner.findMany({
                where: {
                  personId: { in: personIds },
                  partnerTypeCode: { in: [...WORKFORCE_PARTNER_TYPES] },
                },
                select: { personId: true, partnerTypeCode: true, status: true },
              })
            : [];

        const partnerTypesByPerson = new Map<string, string[]>();
        for (const partner of partners) {
          if (partner.status !== 'ACTIVE') {
            continue;
          }
          const list = partnerTypesByPerson.get(partner.personId) ?? [];
          if (!list.includes(partner.partnerTypeCode)) {
            list.push(partner.partnerTypeCode);
          }
          partnerTypesByPerson.set(partner.personId, list);
        }

        return {
          lab_org_id: labOrgId,
          country_code: org.country.isoAlpha2,
          data: memberships.map((row) => {
            const partnerTypes = partnerTypesByPerson.get(row.personId) ?? [];
            const operationalRoles: string[] = [];
            if (partnerTypes.includes('PHLEBOTOMIST') || row.role.code === 'org_operations') {
              operationalRoles.push('phlebotomist');
            }
            if (partnerTypes.includes('PATHOLOGIST')) {
              operationalRoles.push('pathologist');
            }
            if (row.role.code === 'org_staff' && !partnerTypes.includes('PATHOLOGIST')) {
              operationalRoles.push('technician');
            }
            if (row.role.code === 'org_admin') {
              operationalRoles.push('lab_admin');
            }
            if (row.role.code === 'org_finance') {
              operationalRoles.push('finance');
            }
            return {
              person_id: row.personId,
              display_name: `Member ${row.personId.slice(0, 8)}`,
              membership_role_code: row.role.code,
              membership_role_name: row.role.name,
              partner_types: partnerTypes,
              operational_roles: operationalRoles.length ? operationalRoles : ['staff'],
              location_id: row.locationId,
            };
          }),
          note: 'Read-only workforce view from organization memberships and partner types. Not a full HR system.',
        };
      },
    );
  }
}
