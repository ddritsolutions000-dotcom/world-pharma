import { Injectable } from '@nestjs/common';
import { LocationKind, MembershipScope, MembershipStatus, OrganizationKind, OrganizationStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { COMPANY_ROLE_CODES } from '../identity/authority';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';

const ORG_ROLE_CODES = [
  'org_owner',
  'org_admin',
  'org_manager',
  'org_staff',
  'org_finance',
  'org_operations',
  'clinic_doctor',
  'hospital_doctor',
  'independent_doctor',
] as const;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly events: SecurityEventsService,
  ) {}

  async create(input: {
    countryCode: string;
    kind: OrganizationKind;
    legalName: string;
    displayName: string;
    actorId: string;
    requestId?: string;
  }) {
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!resolved) {
      throw Errors.validation('Country has no published policy pack');
    }
    const org = await this.prisma.organization.create({
      data: {
        id: uuidv7(),
        countryId: resolved.countryId,
        kind: input.kind,
        legalName: input.legalName,
        displayName: input.displayName,
        status: OrganizationStatus.DRAFT,
      },
    });
    await this.events.emit({
      type: 'ORGANIZATION_CREATED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { organization_id: org.id },
    });
    return org;
  }

  async addMember(input: {
    organizationId: string;
    personId: string;
    roleCode: string;
    locationId?: string;
    actorId: string;
    requestId?: string;
  }) {
    if (!ORG_ROLE_CODES.includes(input.roleCode as (typeof ORG_ROLE_CODES)[number])) {
      throw Errors.validation('Unknown organization role');
    }
    const actorCompany = await this.prisma.membership.findFirst({
      where: {
        personId: input.actorId,
        status: MembershipStatus.ACTIVE,
        deletedAt: null,
        scope: { in: [MembershipScope.platform, MembershipScope.country] },
        role: { code: { in: [...COMPANY_ROLE_CODES] } },
      },
    });
    if (!actorCompany) {
      const sameOrg = await this.prisma.membership.findFirst({
        where: {
          personId: input.actorId,
          organizationId: input.organizationId,
          status: MembershipStatus.ACTIVE,
          deletedAt: null,
        },
      });
      if (!sameOrg) {
        throw Errors.forbidden('Organization administrators cannot manage another organization');
      }
    }
    const role = await this.prisma.role.findUnique({ where: { code: input.roleCode } });
    if (!role) {
      throw Errors.validation('Role is not seeded');
    }
    const org = await this.prisma.organization.findUnique({ where: { id: input.organizationId } });
    if (!org) {
      throw Errors.notFound('Organization not found');
    }
    const dup = await this.prisma.membership.findUnique({
      where: {
        personId_organizationId_roleId: {
          personId: input.personId,
          organizationId: org.id,
          roleId: role.id,
        },
      },
    });
    if (dup && dup.status === MembershipStatus.ACTIVE && !dup.deletedAt) {
      throw Errors.validation('Membership already exists');
    }
    const membership = await this.prisma.membership.create({
      data: {
        id: uuidv7(),
        personId: input.personId,
        roleId: role.id,
        scope: 'organization',
        countryId: org.countryId,
        organizationId: org.id,
        locationId: input.locationId ?? null,
        status: MembershipStatus.ACTIVE,
      },
    });
    await this.events.emit({
      type: 'ORGANIZATION_MEMBER_ADDED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { membership_id: membership.id, organization_id: org.id },
    });
    return membership;
  }

  async removeMember(input: {
    membershipId: string;
    actorId: string;
    organizationId: string;
    requestId?: string;
  }) {
    const membership = await this.prisma.membership.findUnique({ where: { id: input.membershipId } });
    if (!membership || membership.organizationId !== input.organizationId) {
      throw Errors.forbidden('Wrong organization access');
    }
    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.SUSPENDED, deletedAt: new Date(), endsAt: new Date() },
    });
    await this.events.emit({
      type: 'ORGANIZATION_MEMBER_REMOVED',
      outcome: 'success',
      personId: input.actorId,
      requestId: input.requestId,
      metadata: { membership_id: membership.id },
    });
    return updated;
  }

  async createLocation(input: {
    organizationId: string;
    kind: LocationKind;
    name: string;
    actorId: string;
    region?: string;
    city?: string;
    postalCode?: string;
    addressLine?: string;
  }) {
    const org = await this.prisma.organization.findUnique({ where: { id: input.organizationId } });
    if (!org) {
      throw Errors.notFound('Organization not found');
    }
    return this.prisma.location.create({
      data: {
        id: uuidv7(),
        organizationId: org.id,
        countryId: org.countryId,
        kind: input.kind,
        name: input.name,
        region: input.region,
        city: input.city,
        postalCode: input.postalCode,
        addressLine: input.addressLine,
      },
    });
  }
}
