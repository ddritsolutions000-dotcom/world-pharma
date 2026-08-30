import { Injectable } from '@nestjs/common';
import {
  CrmAutomationKind,
  OrderStatus,
  RefillRequestStatus,
  RxSubscriptionStatus,
} from '@prisma/client';
import { PrismaService, runWithTenant } from '../../app/prisma.service';
import { Errors } from '../../common/problem';
import type { Principal } from '../../identity/current-principal';
import { PolicyResolver } from '../../policy/resolver';
import { resolveCountryByCode, assertUuid } from '../../cms/cms-country';
import { workerTenantContext } from '../../tenancy/build-tenant-context';
import {
  refillStatusNudgeCopy,
  reorderReminderCopy,
  subscriptionReminderCopy,
} from './automation-copy';
import { AutomationRunService } from './automation-run.service';

const REORDER_ELIGIBLE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.DELIVERED,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
];

const REFILL_NUDGE_STATUSES: RefillRequestStatus[] = [
  RefillRequestStatus.REQUESTED,
  RefillRequestStatus.APPROVED,
];

@Injectable()
export class RefillMarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automationRuns: AutomationRunService,
    private readonly policies: PolicyResolver,
  ) {}

  async evaluateCountry(principal: Principal, countryCode: string) {
    this.assertAdmin(principal);
    return this.runCountryEvaluation(countryCode, principal.personId);
  }

  /** Scheduler path — no admin principal; policy gates still apply. */
  async evaluateCountryScheduled(countryCode: string) {
    const config = await this.resolveAutomationConfig(countryCode);
    if (!config) {
      return {
        status: 'skipped' as const,
        country_code: countryCode.trim().toUpperCase(),
        reason: 'automation_disabled',
      };
    }
    const result = await this.runCountryEvaluation(countryCode, undefined, config);
    return { status: 'completed' as const, ...result };
  }

  private async runCountryEvaluation(
    countryCode: string,
    actorPersonId?: string,
    config?: { reorderReminderDays: number },
  ) {
    const resolvedConfig = config ?? (await this.assertAutomationEnabled(countryCode));
    const country = await resolveCountryByCode(this.prisma, countryCode);
    const cutoff = new Date(Date.now() - resolvedConfig.reorderReminderDays * 24 * 60 * 60 * 1000);

    return runWithTenant(
      workerTenantContext({
        countryId: country.id,
        ...(actorPersonId ? { personId: actorPersonId } : {}),
      }),
      async () => {
        let sent = 0;
        let skipped = 0;
        let evaluated = 0;

        const orders = await this.prisma.order.findMany({
          where: {
            countryId: country.id,
            status: { in: REORDER_ELIGIBLE_STATUSES },
            createdAt: { lte: cutoff },
          },
          select: {
            id: true,
            customerPersonId: true,
            items: { select: { title: true }, take: 1, orderBy: { id: 'asc' } },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 500,
        });

        for (const order of orders) {
          if (!order.items.length) {
            continue;
          }
          evaluated += 1;
          const copy = reorderReminderCopy(order.items[0]!.title);
          const result = await this.automationRuns.attemptRun({
            automationKind: CrmAutomationKind.REORDER_REMINDER,
            sourceId: order.id,
            personId: order.customerPersonId,
            countryId: country.id,
            countryCode: country.isoAlpha2,
            title: copy.title,
            body: copy.body,
            referenceType: 'reorder_reminder',
            actorPersonId,
          });
          if (result.status === 'SENT' && !result.duplicate) {
            sent += 1;
          } else {
            skipped += 1;
          }
        }

        const refills = await this.prisma.refillRequest.findMany({
          where: {
            countryId: country.id,
            status: { in: REFILL_NUDGE_STATUSES },
          },
          select: { id: true, customerPersonId: true },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: 500,
        });

        for (const refill of refills) {
          evaluated += 1;
          const copy = refillStatusNudgeCopy();
          const result = await this.automationRuns.attemptRun({
            automationKind: CrmAutomationKind.REFILL_STATUS_NUDGE,
            sourceId: refill.id,
            personId: refill.customerPersonId,
            countryId: country.id,
            countryCode: country.isoAlpha2,
            title: copy.title,
            body: copy.body,
            referenceType: 'refill_reminder',
            actorPersonId,
          });
          if (result.status === 'SENT' && !result.duplicate) {
            sent += 1;
          } else {
            skipped += 1;
          }
        }

        const subscriptions = await this.prisma.rxSubscription.findMany({
          where: {
            countryId: country.id,
            status: RxSubscriptionStatus.ACTIVE,
            autoExecuteEnabled: false,
          },
          select: { id: true, customerPersonId: true },
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: 500,
        });

        for (const subscription of subscriptions) {
          evaluated += 1;
          const copy = subscriptionReminderCopy();
          const result = await this.automationRuns.attemptRun({
            automationKind: CrmAutomationKind.SUBSCRIPTION_REMINDER,
            sourceId: subscription.id,
            personId: subscription.customerPersonId,
            countryId: country.id,
            countryCode: country.isoAlpha2,
            title: copy.title,
            body: copy.body,
            referenceType: 'subscription_reminder',
            actorPersonId,
          });
          if (result.status === 'SENT' && !result.duplicate) {
            sent += 1;
          } else {
            skipped += 1;
          }
        }

        return {
          country_code: country.isoAlpha2,
          evaluated_count: evaluated,
          sent_count: sent,
          skipped_count: skipped,
        };
      },
    );
  }

  async listRuns(
    principal: Principal,
    query: { country_code: string; person_id?: string; limit?: number },
  ) {
    this.assertAdmin(principal);
    await this.assertCrmEnabled(query.country_code);
    const country = await resolveCountryByCode(this.prisma, query.country_code);
    if (query.person_id) {
      assertUuid(query.person_id, 'person id');
    }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.crmAutomationRun.findMany({
          where: {
            countryId: country.id,
            ...(query.person_id ? { personId: query.person_id } : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: limit,
        });
        return {
          data: rows.map((row) => ({
            id: row.id,
            automation_kind: row.automationKind,
            source_id: row.sourceId,
            person_id: row.personId,
            status: row.status,
            skip_reason: row.skipReason,
            created_at: row.createdAt.toISOString(),
          })),
        };
      },
    );
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience required');
    }
  }

  private async assertCrmEnabled(countryCode: string) {
    const policy = await this.policies.resolvePublished(countryCode);
    if (!policy?.document.crm?.enabled) {
      throw Errors.forbidden('CRM is not enabled for this country');
    }
  }

  private async assertAutomationEnabled(countryCode: string) {
    const config = await this.resolveAutomationConfig(countryCode);
    if (!config) {
      await this.assertCrmEnabled(countryCode);
      const policy = await this.policies.resolvePublished(countryCode);
      if (policy?.document.crm?.marketing?.enabled === false) {
        throw Errors.forbidden('Marketing is not enabled for this country');
      }
      throw Errors.forbidden('CRM automation is not enabled for this country');
    }
    return config;
  }

  private async resolveAutomationConfig(
    countryCode: string,
  ): Promise<{ reorderReminderDays: number } | null> {
    const policy = await this.policies.resolvePublished(countryCode);
    if (!policy?.document.crm?.enabled) {
      return null;
    }
    if (policy.document.crm.marketing?.enabled === false) {
      return null;
    }
    const automation = policy.document.crm.automation;
    if (!automation?.enabled) {
      return null;
    }
    return {
      reorderReminderDays: automation.reorder_reminder_days ?? 30,
    };
  }
}
