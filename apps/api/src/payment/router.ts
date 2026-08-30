import { Injectable } from '@nestjs/common';
import { PaymentMethodFamily, Prisma } from '@prisma/client';
import { Errors } from '../common/problem';
import { PrismaService } from '../app/prisma.service';
import {
  assertLiveProductionPrerequisites,
} from './payment.config';

export type RoutingInput = {
  countryId: string;
  countryIso2: string;
  currency: string;
  method: PaymentMethodFamily;
  amountMinor: bigint;
  legalEntityId?: string;
};

export type RoutingDecision = {
  gatewayId: string;
  gatewayCode: string;
  gatewayEnvironment: string;
  accountCode: string;
  priority: number;
  reason: string;
};

export type RoutingIneligible = {
  gatewayId: string;
  gatewayCode: string;
  gatewayEnvironment: string;
  priority: number;
  reason: string;
};

export type RoutingExplainResult = {
  candidates: RoutingDecision[];
  ineligible: RoutingIneligible[];
};

@Injectable()
export class PaymentRouter {
  constructor(private readonly prisma: PrismaService) {}

  async candidates(
    input: RoutingInput,
    targetEnvironment: 'sandbox' | 'production' = 'sandbox',
  ): Promise<RoutingDecision[]> {
    const explained = await this.explain(input, targetEnvironment);
    return explained.candidates;
  }

  async explain(
    input: RoutingInput,
    targetEnvironment: 'sandbox' | 'production' = 'sandbox',
  ): Promise<RoutingExplainResult> {
    if (targetEnvironment === 'production') {
      assertLiveProductionPrerequisites('payment routing', { countryIso2: input.countryIso2 });
    }
    const rules = await this.prisma.paymentRoutingRule.findMany({
      where: {
        active: true,
        method: input.method,
        OR: [{ countryId: input.countryId }, { countryId: null }],
      },
      orderBy: { priority: 'asc' },
    });
    const gateways = await this.prisma.paymentGateway.findMany({
      where: { active: true, environment: targetEnvironment, healthScore: { gt: 0 } },
      include: { accounts: true, capabilities: true },
      orderBy: { priority: 'asc' },
    });
    const ranked: RoutingDecision[] = [];
    const ineligible: RoutingIneligible[] = [];
    for (const gw of gateways) {
      const rule = rules.find((r) => r.gatewayCode === gw.code);
      const priority = rule?.priority ?? gw.priority;
      const account = gw.accounts.find((a) => {
        if (!a.active) {
          return false;
        }
        if (a.countryId && a.countryId !== input.countryId) {
          return false;
        }
        if (a.legalEntityId && input.legalEntityId && a.legalEntityId !== input.legalEntityId) {
          return false;
        }
        return true;
      });
      if (!account) {
        ineligible.push({
          gatewayId: gw.id,
          gatewayCode: gw.code,
          gatewayEnvironment: gw.environment,
          priority,
          reason: 'no_matching_account',
        });
        continue;
      }
      if (!csvIncludes(account.currenciesCsv, input.currency)) {
        ineligible.push({
          gatewayId: gw.id,
          gatewayCode: gw.code,
          gatewayEnvironment: gw.environment,
          priority,
          reason: 'currency_not_supported',
        });
        continue;
      }
      if (!csvIncludes(account.countriesCsv, input.countryIso2)) {
        ineligible.push({
          gatewayId: gw.id,
          gatewayCode: gw.code,
          gatewayEnvironment: gw.environment,
          priority,
          reason: 'country_not_authorized',
        });
        continue;
      }
      if (!csvIncludes(account.methodsCsv, input.method)) {
        ineligible.push({
          gatewayId: gw.id,
          gatewayCode: gw.code,
          gatewayEnvironment: gw.environment,
          priority,
          reason: 'method_not_supported',
        });
        continue;
      }
      ranked.push({
        gatewayId: gw.id,
        gatewayCode: gw.code,
        gatewayEnvironment: gw.environment,
        accountCode: account.code,
        priority,
        reason: rule ? `rule:${rule.id}` : `gateway_priority:${gw.priority}`,
      });
    }
    ranked.sort((a, b) => a.priority - b.priority);
    ineligible.sort((a, b) => a.priority - b.priority);
    return { candidates: ranked, ineligible };
  }

  /** Active routing — sandbox only until human gates close. */
  async decide(input: RoutingInput): Promise<RoutingDecision> {
    const list = await this.candidates(input, 'sandbox');
    if (list.length === 0) {
      throw Object.assign(new Error('No sandbox gateway available'), {
        status: 409,
        code: 'NO_PAYMENT_GATEWAY',
      });
    }
    return list[0];
  }

  /** Structural readiness check — does not activate production routing. */
  async assertProductionRoutingReady(input: RoutingInput): Promise<void> {
    assertLiveProductionPrerequisites('production routing readiness', { countryIso2: input.countryIso2 });
    const list = await this.candidates(input, 'production');
    if (list.length === 0) {
      throw Errors.problem(
        409,
        'NO_PRODUCTION_GATEWAY',
        'No production gateway',
        'No active production gateway matches this payment context.',
      );
    }
    for (const route of list) {
      assertLiveProductionPrerequisites('production routing readiness', {
        gatewayCode: route.gatewayCode,
        countryIso2: input.countryIso2,
      });
    }
  }
}

function csvIncludes(csv: string, value: string): boolean {
  if (csv === '*') {
    return true;
  }
  return csv.split(',').map((s) => s.trim()).includes(value);
}

export function routingJson(decision: RoutingDecision): Prisma.InputJsonValue {
  return {
    gateway_id: decision.gatewayId,
    gateway_code: decision.gatewayCode,
    gateway_environment: decision.gatewayEnvironment,
    account_code: decision.accountCode,
    priority: decision.priority,
    reason: decision.reason,
    frozen: true,
  };
}
