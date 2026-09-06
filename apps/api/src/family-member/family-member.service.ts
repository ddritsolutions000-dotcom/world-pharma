import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const RELATIONSHIPS = new Set(['SPOUSE', 'PARENT', 'CHILD', 'GRANDPARENT', 'SIBLING', 'OTHER']);
const MAX_MEMBERS = 8;

export type FamilyMemberInput = {
  country_code: string;
  display_name: string;
  relationship_code?: string;
  age_years?: number | null;
  phone?: string | null;
  notes?: string | null;
};

@Injectable()
export class FamilyMemberService {
  constructor(private readonly prisma: PrismaService) {}

  async list(principal: Principal, countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.customerFamilyMember.findMany({
          where: {
            customerPersonId: principal.personId,
            countryId: country.id,
            deletedAt: null,
          },
          orderBy: { createdAt: 'asc' },
        });
        return {
          members: rows.map((row) => this.present(row, country.isoAlpha2)),
        };
      },
    );
  }

  async create(principal: Principal, input: FamilyMemberInput) {
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const payload = this.validateInput(input);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const count = await this.prisma.customerFamilyMember.count({
          where: { customerPersonId: principal.personId, countryId: country.id, deletedAt: null },
        });
        if (count >= MAX_MEMBERS) {
          throw Errors.problem(
            409,
            'FAMILY_MEMBER_LIMIT',
            'Member limit reached',
            `You may save up to ${MAX_MEMBERS} family members.`,
          );
        }
        const row = await this.prisma.customerFamilyMember.create({
          data: {
            id: uuidv7(),
            customerPersonId: principal.personId,
            countryId: country.id,
            displayName: payload.displayName,
            relationshipCode: payload.relationshipCode,
            ageYears: payload.ageYears,
            phone: payload.phone,
            notes: payload.notes,
          },
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async update(principal: Principal, id: string, input: Partial<FamilyMemberInput>) {
    assertUuid(id, 'id');
    const existing = await this.prisma.customerFamilyMember.findFirst({
      where: { id, customerPersonId: principal.personId, deletedAt: null },
    });
    if (!existing) {
      throw Errors.notFound('Family member not found');
    }
    const country = await resolveCountryByCode(
      this.prisma,
      input.country_code ?? (await this.countryCode(existing.countryId)),
    );
    const payload = this.validateInput({
      country_code: country.isoAlpha2,
      display_name: input.display_name ?? existing.displayName,
      relationship_code: input.relationship_code ?? existing.relationshipCode,
      age_years: input.age_years !== undefined ? input.age_years : existing.ageYears,
      phone: input.phone !== undefined ? input.phone : existing.phone,
      notes: input.notes !== undefined ? input.notes : existing.notes,
    });
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.customerFamilyMember.update({
          where: { id: existing.id },
          data: payload,
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async remove(principal: Principal, id: string) {
    assertUuid(id, 'id');
    const existing = await this.prisma.customerFamilyMember.findFirst({
      where: { id, customerPersonId: principal.personId, deletedAt: null },
    });
    if (!existing) {
      throw Errors.notFound('Family member not found');
    }
    return runWithTenant(
      workerTenantContext({ countryId: existing.countryId, personId: principal.personId }),
      async () => {
        await this.prisma.customerFamilyMember.update({
          where: { id: existing.id },
          data: { deletedAt: new Date() },
        });
        return { removed: true, id: existing.id };
      },
    );
  }

  private async countryCode(countryId: string) {
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    return country.isoAlpha2;
  }

  private validateInput(input: FamilyMemberInput) {
    const displayName = input.display_name?.trim();
    if (!displayName || displayName.length > 120) {
      throw Errors.validation('display_name is required (max 120 characters).');
    }
    const relationshipCode = (input.relationship_code ?? 'OTHER').trim().toUpperCase();
    if (!RELATIONSHIPS.has(relationshipCode)) {
      throw Errors.validation('relationship_code is invalid.');
    }
    if (input.age_years != null) {
      if (!Number.isInteger(input.age_years) || input.age_years < 0 || input.age_years > 130) {
        throw Errors.validation('age_years must be between 0 and 130.');
      }
    }
    const phone = input.phone?.trim() ? input.phone.trim().slice(0, 32) : null;
    const notes = input.notes?.trim() ? input.notes.trim().slice(0, 500) : null;
    return {
      displayName,
      relationshipCode,
      ageYears: input.age_years ?? null,
      phone,
      notes,
    };
  }

  private present(
    row: {
      id: string;
      displayName: string;
      relationshipCode: string;
      ageYears: number | null;
      phone: string | null;
      notes: string | null;
      healthAccessEnabled: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    countryCode: string,
  ) {
    return {
      id: row.id,
      country_code: countryCode,
      display_name: row.displayName,
      relationship_code: row.relationshipCode,
      age_years: row.ageYears,
      phone: row.phone,
      notes: row.notes,
      health_access_enabled: row.healthAccessEnabled,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
