import { Injectable } from '@nestjs/common';
import { CheckoutStatus, CrmAutomationKind } from '@prisma/client';
import { PrismaService, runWithTenant } from '../../app/prisma.service';
import { PolicyResolver } from '../../policy/resolver';
import { workerTenantContext } from '../../tenancy/build-tenant-context';
import { abandonedCartRecoveryCopy } from './automation-copy';
import { AutomationRunService } from './automation-run.service';

export type CartAbandonRecoveryInput = {
  countryCode: string;
  countryId: string;
  checkoutSessionId: string;
  customerPersonId: string;
  cartId?: string | null;
};

export type CartAbandonRecoveryOutcome = {
  status: 'sent' | 'skipped' | 'duplicate';
  skip_reason?: string;
  run_id?: string;
};

@Injectable()
export class AbandonedCartRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automationRuns: AutomationRunService,
    private readonly policies: PolicyResolver,
  ) {}

  async attemptRecovery(input: CartAbandonRecoveryInput): Promise<CartAbandonRecoveryOutcome> {
    const config = await this.resolveAutomationConfig(input.countryCode);
    if (!config) {
      return { status: 'skipped', skip_reason: 'automation_disabled' };
    }

    return runWithTenant(
      workerTenantContext({ countryId: input.countryId, personId: input.customerPersonId }),
      async () => {
        const session = await this.prisma.checkoutSession.findFirst({
          where: {
            id: input.checkoutSessionId,
            countryId: input.countryId,
            customerPersonId: input.customerPersonId,
            status: { not: CheckoutStatus.CANCELLED },
            orders: { none: {} },
          },
          select: { id: true, cartId: true },
        });
        if (!session) {
          return { status: 'skipped', skip_reason: 'session_not_eligible' };
        }

        const copy = abandonedCartRecoveryCopy();
        const result = await this.automationRuns.attemptRun({
          automationKind: CrmAutomationKind.CART_ABANDON_RECOVERY,
          sourceId: session.id,
          personId: input.customerPersonId,
          countryId: input.countryId,
          countryCode: input.countryCode.trim().toUpperCase(),
          title: copy.title,
          body: copy.body,
          referenceType: 'cart_abandon_recovery',
        });

        if (result.duplicate) {
          return { status: 'duplicate', run_id: result.run_id };
        }
        if (result.status === 'SKIPPED') {
          return { status: 'skipped', skip_reason: result.skip_reason, run_id: result.run_id };
        }
        return { status: 'sent', run_id: result.run_id };
      },
    );
  }

  private async resolveAutomationConfig(
    countryCode: string,
  ): Promise<{ enabled: true } | null> {
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
    return { enabled: true };
  }
}
