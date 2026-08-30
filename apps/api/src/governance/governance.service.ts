import { Injectable } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';

@Injectable()
export class GovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  listRegions() {
    return this.prisma.operatingRegion.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        nameI18n: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  listCountries() {
    return this.prisma.country.findMany({
      orderBy: { isoAlpha2: 'asc' },
      include: {
        region: { select: { id: true, code: true, nameI18n: true } },
      },
    });
  }

  listLegalEntities() {
    return this.prisma.legalEntity.findMany({
      orderBy: { code: 'asc' },
      include: {
        region: { select: { id: true, code: true } },
        incorporationCountry: { select: { id: true, isoAlpha2: true, nameI18n: true } },
      },
    });
  }

  listBusinessUnits() {
    return this.prisma.businessUnit.findMany({
      orderBy: { code: 'asc' },
      include: {
        legalEntity: { select: { id: true, code: true, displayName: true } },
      },
    });
  }

  listOrganizations(limit = 100) {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        kind: true,
        legalName: true,
        displayName: true,
        status: true,
        countryId: true,
        legalEntityId: true,
        regionId: true,
        timezone: true,
        locale: true,
        operatingCurrency: true,
        createdAt: true,
        country: { select: { isoAlpha2: true, nameI18n: true } },
        legalEntity: { select: { id: true, code: true, displayName: true } },
        region: { select: { id: true, code: true } },
      },
    });
  }

  listLocations(organizationId?: string) {
    return this.prisma.location.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: { name: 'asc' },
      take: 200,
      select: {
        id: true,
        organizationId: true,
        countryId: true,
        kind: true,
        name: true,
        isActive: true,
        createdAt: true,
        organization: { select: { id: true, displayName: true, legalName: true } },
      },
    });
  }

  listMemberships(filters: { personId?: string; organizationId?: string }) {
    return this.prisma.membership.findMany({
      where: {
        deletedAt: null,
        ...(filters.personId ? { personId: filters.personId } : {}),
        ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        personId: true,
        organizationId: true,
        scope: true,
        status: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        role: { select: { id: true, code: true, name: true } },
        organization: { select: { id: true, displayName: true, legalName: true } },
        person: {
          select: {
            id: true,
            status: true,
            identifiers: { select: { type: true, valueNormalized: true, verifiedAt: true } },
          },
        },
      },
    });
  }
}
