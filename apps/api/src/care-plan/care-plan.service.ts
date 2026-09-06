import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { resolveCountryByCode } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { CarePlanDefinitionService } from './care-plan-definition.service';
import {
  carePlanDiscountMinor,
  isCarePlanActive,
} from './care-plan-catalog';
import type { CarePlanView } from './care-plan-definition.service';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class CarePlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly definitions: CarePlanDefinitionService,
  ) {}

  async listCatalog(countryCode: string) {
    const data = await this.definitions.listCatalog(countryCode);
    return {
      sandbox: true,
      billing: 'waived_until_live_psp',
      data,
    };
  }

  async getMine(principal: Principal, countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const row = await this.prisma.customerCarePlanMembership.findUnique({
        where: { customerPersonId_countryId: { customerPersonId: principal.personId, countryId: country.id } },
      });
      return await this.presentMine(row, country.isoAlpha2);
    });
  }

  async subscribe(principal: Principal, countryCode: string, planCode: string) {
    const plan = await this.definitions.getByCode(countryCode, planCode);
    if (!plan) {
      throw Errors.validation('Unknown care plan');
    }
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const now = new Date();
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const existing = await this.prisma.customerCarePlanMembership.findUnique({
        where: { customerPersonId_countryId: { customerPersonId: principal.personId, countryId: country.id } },
      });
      if (existing && isCarePlanActive(existing.status, existing.expiresAt, now)) {
        throw Errors.problem(
          409,
          'CARE_PLAN_ACTIVE',
          'Plan already active',
          'Cancel or wait until expiry before switching plans in this sandbox.',
        );
      }
      const row = await this.prisma.customerCarePlanMembership.upsert({
        where: { customerPersonId_countryId: { customerPersonId: principal.personId, countryId: country.id } },
        create: {
          id: uuidv7(),
          customerPersonId: principal.personId,
          countryId: country.id,
          planCode: plan.id,
          status: 'ACTIVE',
          sandbox: true,
          startedAt: now,
          expiresAt: new Date(now.getTime() + YEAR_MS),
          cancelledAt: null,
        },
        update: {
          planCode: plan.id,
          status: 'ACTIVE',
          sandbox: true,
          startedAt: now,
          expiresAt: new Date(now.getTime() + YEAR_MS),
          cancelledAt: null,
        },
      });
      return await this.presentMine(row, country.isoAlpha2);
    });
  }

  async cancel(principal: Principal, countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const existing = await this.prisma.customerCarePlanMembership.findUnique({
        where: { customerPersonId_countryId: { customerPersonId: principal.personId, countryId: country.id } },
      });
      if (!existing || !isCarePlanActive(existing.status, existing.expiresAt)) {
        throw Errors.problem(409, 'CARE_PLAN_INACTIVE', 'No active plan', 'There is no Care Plan to cancel.');
      }
      const row = await this.prisma.customerCarePlanMembership.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return await this.presentMine(row, country.isoAlpha2);
    });
  }

  async adminSummary(countryCode: string) {
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const catalog = await this.definitions.listCatalog(country.isoAlpha2);
    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const rows = await this.prisma.customerCarePlanMembership.findMany({
        where: { countryId: country.id },
        orderBy: { startedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          customerPersonId: true,
          planCode: true,
          status: true,
          startedAt: true,
          expiresAt: true,
          cancelledAt: true,
          sandbox: true,
        },
      });
      const now = new Date();
      const active = rows.filter((row) => isCarePlanActive(row.status, row.expiresAt, now));
      const byPlan = catalog.map((plan) => ({
        plan_code: plan.id,
        name: plan.name,
        price_label: plan.price_label,
        discount_bps: plan.discount_bps,
        free_delivery: plan.free_delivery,
        active_members: active.filter((row) => row.planCode === plan.id).length,
      }));
      return {
        country_code: country.isoAlpha2,
        sandbox: true,
        billing: 'waived_until_live_psp',
        active_members: active.length,
        total_rows: rows.length,
        catalog,
        by_plan: byPlan,
        memberships: rows.map((row) => ({
          id: row.id,
          customer_person_id: row.customerPersonId,
          plan_code: row.planCode,
          status: row.status,
          started_at: row.startedAt.toISOString(),
          expires_at: row.expiresAt.toISOString(),
          cancelled_at: row.cancelledAt?.toISOString() ?? null,
          sandbox: row.sandbox,
          active: isCarePlanActive(row.status, row.expiresAt, now),
        })),
      };
    });
  }

  async adminCancel(membershipId: string) {
    const existing = await this.prisma.customerCarePlanMembership.findUnique({ where: { id: membershipId } });
    if (!existing) {
      throw Errors.notFound('Care plan membership not found.');
    }
    return runWithTenant(workerTenantContext({ countryId: existing.countryId }), async () => {
      const row = await this.prisma.customerCarePlanMembership.findUnique({ where: { id: membershipId } });
      if (!row) {
        throw Errors.notFound('Care plan membership not found.');
      }
      if (!isCarePlanActive(row.status, row.expiresAt)) {
        throw Errors.problem(409, 'CARE_PLAN_INACTIVE', 'No active plan', 'This membership is not active.');
      }
      const updated = await this.prisma.customerCarePlanMembership.update({
        where: { id: row.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return {
        id: updated.id,
        status: updated.status,
        cancelled_at: updated.cancelledAt?.toISOString() ?? null,
      };
    });
  }

  async quoteBenefit(principal: Principal | undefined, countryCode: string, sellAfterPromo: bigint): Promise<{
    plan: CarePlanView | null;
    discount_minor: bigint;
    free_delivery: boolean;
  }> {
    if (!principal) {
      return { plan: null, discount_minor: 0n, free_delivery: false };
    }
    const mine = await this.getMine(principal, countryCode);
    if (!mine.membership?.active || !mine.plan) {
      return { plan: null, discount_minor: 0n, free_delivery: false };
    }
    return {
      plan: mine.plan,
      discount_minor: carePlanDiscountMinor(sellAfterPromo, mine.plan.discount_bps),
      free_delivery: mine.plan.free_delivery,
    };
  }

  private async presentMine(
    row: {
      planCode: string;
      status: string;
      sandbox: boolean;
      startedAt: Date;
      expiresAt: Date;
      cancelledAt: Date | null;
    } | null,
    countryCode: string,
  ) {
    const catalog = await this.definitions.listCatalog(countryCode);
    const plan = row ? (await this.definitions.getByCode(countryCode, row.planCode)) : null;
    const active = row ? isCarePlanActive(row.status, row.expiresAt) : false;
    return {
      country_code: countryCode,
      catalog,
      sandbox: true,
      membership: row
        ? {
            plan_code: row.planCode,
            status: active ? 'ACTIVE' : row.status,
            active,
            sandbox: row.sandbox,
            started_at: row.startedAt.toISOString(),
            expires_at: row.expiresAt.toISOString(),
            cancelled_at: row.cancelledAt?.toISOString() ?? null,
          }
        : null,
      plan: active ? plan : null,
    };
  }
}
