import { Injectable } from '@nestjs/common';
import { CrmSegmentStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../../app/prisma.service';
import { Errors } from '../../common/problem';
import type { Principal } from '../../identity/current-principal';
import { SecurityEventsService } from '../../identity/security-events.service';
import { PolicyResolver } from '../../policy/resolver';
import { resolveCountryByCode, assertUuid } from '../../cms/cms-country';
import { workerTenantContext } from '../../tenancy/build-tenant-context';
import { evaluateSegmentRules, validateSegmentRules } from './segment-rules';

@Injectable()
export class SegmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
    private readonly policies: PolicyResolver,
  ) {}

  async list(principal: Principal, countryCode: string) {
    this.assertAdmin(principal);
    await this.assertMarketingEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.crmSegment.findMany({
          where: { countryId: country.id },
          orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
        });
        return { data: rows.map((row) => this.present(row, country.isoAlpha2)) };
      },
    );
  }

  async get(principal: Principal, id: string, countryCode: string) {
    this.assertAdmin(principal);
    assertUuid(id, 'segment id');
    await this.assertMarketingEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.crmSegment.findFirst({
          where: { id, countryId: country.id },
        });
        if (!row) {
          throw Errors.notFound('Segment not found');
        }
        const previewCount = await this.previewCount(country.id, row.rules);
        return { ...this.present(row, country.isoAlpha2), preview_count: previewCount };
      },
    );
  }

  async create(
    principal: Principal,
    input: { country_code: string; code: string; name: string; rules?: unknown; status?: string },
  ) {
    this.assertAdmin(principal);
    await this.assertMarketingEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const rules = validateSegmentRules(input.rules ?? { type: 'has_order_in_country' });
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) {
      throw Errors.validation('code and name are required');
    }
    const status = this.parseSegmentStatus(input.status ?? 'DRAFT');
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.crmSegment.create({
          data: {
            id: uuidv7(),
            countryId: country.id,
            code,
            name,
            status,
            rules: rules as Prisma.InputJsonValue,
            createdByPersonId: principal.personId,
          },
        });
        await this.securityEvents.emit({
          type: 'CRM_SEGMENT_CREATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { segment_id: row.id, country_id: country.id },
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async update(
    principal: Principal,
    id: string,
    input: {
      country_code: string;
      name?: string;
      rules?: unknown;
      status?: string;
      version?: number;
    },
  ) {
    this.assertAdmin(principal);
    assertUuid(id, 'segment id');
    await this.assertMarketingEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const existing = await this.prisma.crmSegment.findFirst({
          where: { id, countryId: country.id },
        });
        if (!existing) {
          throw Errors.notFound('Segment not found');
        }
        if (input.version != null && existing.version !== input.version) {
          throw Errors.problem(409, 'VERSION_CONFLICT', 'Version conflict', 'Segment was updated elsewhere.');
        }
        const rules = input.rules != null ? validateSegmentRules(input.rules) : undefined;
        const row = await this.prisma.crmSegment.update({
          where: { id: existing.id },
          data: {
            ...(input.name != null ? { name: input.name.trim() } : {}),
            ...(rules ? { rules: rules as Prisma.InputJsonValue } : {}),
            ...(input.status ? { status: this.parseSegmentStatus(input.status) } : {}),
            version: { increment: 1 },
          },
        });
        await this.securityEvents.emit({
          type: 'CRM_SEGMENT_UPDATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { segment_id: row.id, country_id: country.id },
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async evaluateMemberIds(countryId: string, rulesJson: unknown): Promise<string[]> {
    const rules = validateSegmentRules(rulesJson);
    return evaluateSegmentRules(this.prisma, countryId, rules);
  }

  private async previewCount(countryId: string, rulesJson: unknown) {
    const ids = await this.evaluateMemberIds(countryId, rulesJson);
    return ids.length;
  }

  private parseSegmentStatus(raw: string): CrmSegmentStatus {
    const upper = raw.trim().toUpperCase();
    if (!Object.values(CrmSegmentStatus).includes(upper as CrmSegmentStatus)) {
      throw Errors.validation(`Invalid segment status: ${raw}`);
    }
    return upper as CrmSegmentStatus;
  }

  private present(
    row: {
      id: string;
      countryId: string;
      code: string;
      name: string;
      status: CrmSegmentStatus;
      rules: unknown;
      version: number;
      createdByPersonId: string;
      createdAt: Date;
      updatedAt: Date;
    },
    countryCode: string,
  ) {
    return {
      id: row.id,
      country_id: row.countryId,
      country_code: countryCode,
      code: row.code,
      name: row.name,
      status: row.status,
      rules: row.rules,
      version: row.version,
      created_by_person_id: row.createdByPersonId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience required');
    }
  }

  private async assertMarketingEnabled(countryCode: string) {
    const policy = await this.policies.resolvePublished(countryCode);
    if (!policy?.document.crm?.enabled) {
      throw Errors.forbidden('CRM is not enabled for this country');
    }
    if (policy.document.crm.marketing?.enabled === false) {
      throw Errors.forbidden('Marketing is not enabled for this country');
    }
  }
}
