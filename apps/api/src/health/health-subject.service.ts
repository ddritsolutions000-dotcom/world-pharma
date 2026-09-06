import { Injectable } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { forbidCrossObjectAccess } from '../identity/object-authorization';

export type HealthSubject = {
  kind: 'self' | 'family_member';
  ownerPersonId: string;
  countryId: string;
  countryCode: string;
  familyMemberId: string | null;
  displayName: string;
  relationshipCode: string | null;
};

@Injectable()
export class HealthSubjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  async resolve(
    principal: Principal,
    countryCode: string,
    familyMemberId?: string | null,
  ): Promise<HealthSubject> {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    if (!familyMemberId?.trim()) {
      return {
        kind: 'self',
        ownerPersonId: principal.personId,
        countryId: country.id,
        countryCode: country.isoAlpha2,
        familyMemberId: null,
        displayName: 'Me',
        relationshipCode: null,
      };
    }
    assertUuid(familyMemberId, 'family_member_id');
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const member = await this.prisma.customerFamilyMember.findFirst({
          where: {
            id: familyMemberId,
            customerPersonId: principal.personId,
            countryId: country.id,
            deletedAt: null,
          },
        });
        if (!member) {
          const foreign = await this.prisma.customerFamilyMember.findUnique({
            where: { id: familyMemberId },
          });
          if (foreign && foreign.customerPersonId !== principal.personId) {
            forbidCrossObjectAccess(
              'You are not authorized to view this family member health data.',
            );
          }
          throw Errors.notFound('Family member not found');
        }
        if (!member.healthAccessEnabled) {
          throw Errors.forbidden('Health access is disabled for this family member.');
        }
        return {
          kind: 'family_member',
          ownerPersonId: principal.personId,
          countryId: country.id,
          countryCode: country.isoAlpha2,
          familyMemberId: member.id,
          displayName: member.displayName,
          relationshipCode: member.relationshipCode,
        };
      },
    );
  }

  subjectRecordFilter(subject: HealthSubject) {
    if (subject.kind === 'self') {
      return { subjectFamilyMemberId: null };
    }
    return { subjectFamilyMemberId: subject.familyMemberId };
  }

  async listAuthorizedSubjects(principal: Principal, countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const members = await runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () =>
        this.prisma.customerFamilyMember.findMany({
          where: {
            customerPersonId: principal.personId,
            countryId: country.id,
            deletedAt: null,
            healthAccessEnabled: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
    );
    return {
      country_code: country.isoAlpha2,
      subjects: [
        {
          kind: 'self' as const,
          family_member_id: null,
          display_name: 'Me',
          relationship_code: null,
        },
        ...members.map((member) => ({
          kind: 'family_member' as const,
          family_member_id: member.id,
          display_name: member.displayName,
          relationship_code: member.relationshipCode,
        })),
      ],
    };
  }

  async auditSubjectAccess(
    actorPersonId: string,
    subject: HealthSubject,
    action: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.events.emit({
      type: 'HEALTH_SUBJECT_ACCESS',
      outcome: 'success',
      personId: actorPersonId,
      metadata: {
        action,
        subject_kind: subject.kind,
        subject_family_member_id: subject.familyMemberId,
        owner_person_id: subject.ownerPersonId,
        country_code: subject.countryCode,
        ...metadata,
      },
    });
  }
}
