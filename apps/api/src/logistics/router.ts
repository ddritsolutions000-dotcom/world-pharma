import { Injectable } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { PolicyResolver } from '../policy/resolver';
import { readLogisticsEnvironment } from './carrier.config';
import { assertProductionLogisticsAvailable } from './production-logistics-gate';

export type RouteInput = {
  countryIso2: string;
  originIso2: string;
  destIso2: string;
  international: boolean;
  rx: boolean;
  temperature: string;
  serviceLevel: string;
  excludeCarrierId?: string | null;
  preferredCarrierCode?: string | null;
};

@Injectable()
export class CarrierRouter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
  ) {}

  async choose(input: RouteInput) {
    if (readLogisticsEnvironment() === 'production') {
      await assertProductionLogisticsAvailable(this.prisma, { countryCode: input.countryIso2 });
      throw Errors.problem(
        503,
        'NO_PRODUCTION_CARRIER_ADAPTER',
        'Production carrier unavailable',
        'No live carrier adapter is registered. Production booking cannot use MockCarrierAdapter.',
      );
    }
    const pack = await this.policy.resolvePublished(input.countryIso2);
    if (!pack) {
      throw Errors.problem(
        409,
        'SHIPPING_POLICY_DENIED',
        'Shipping denied',
        'LEGAL/COMPLIANCE REVIEW REQUIRED: Country Policy is missing. Shipping fails closed.',
      );
    }
    const shipping = (pack.document as { shipping?: { domestic?: boolean; international?: boolean; rx?: boolean } }).shipping;
    if (input.international) {
      if (shipping?.international !== true) {
        throw Errors.problem(
          409,
          'SHIPPING_POLICY_DENIED',
          'Shipping denied',
          'LEGAL/COMPLIANCE REVIEW REQUIRED: international shipping is not enabled in Country Policy.',
        );
      }
    } else if (shipping?.domestic !== true) {
      throw Errors.problem(
        409,
        'SHIPPING_POLICY_DENIED',
        'Shipping denied',
        'LEGAL/COMPLIANCE REVIEW REQUIRED: domestic shipping is not enabled in Country Policy.',
      );
    }
    if (input.rx && shipping?.rx !== true) {
      throw Errors.problem(409, 'REGULATED_SHIP_DENIED', 'Regulated shipping denied', 'LEGAL/COMPLIANCE REVIEW REQUIRED.');
    }
    const carriers = await this.prisma.carrier.findMany({
      where: { active: true, environment: 'sandbox' },
      include: { accounts: true, capabilities: true, coverages: true, health: true, services: true },
      orderBy: { createdAt: 'asc' },
    });
    const ranked = carriers.filter((carrier) => {
      if (input.excludeCarrierId && carrier.id === input.excludeCarrierId) {
        return false;
      }
      if (carrier.health?.circuitOpen) {
        return false;
      }
      const cov = carrier.coverages.some(
        (row) =>
          row.active &&
          (row.originIso2 === '*' || row.originIso2 === input.originIso2) &&
          (row.destIso2 === '*' || row.destIso2 === input.destIso2) &&
          (!input.international || row.international),
      );
      const caps = new Set(carrier.capabilities.filter((c) => c.enabled).map((c) => c.name));
      if (input.temperature !== 'AMBIENT' && !caps.has('temperature_controlled')) {
        return false;
      }
      return cov && caps.has('create_shipment');
    });
    ranked.sort((a, b) => (a.accounts[0]?.priority ?? 100) - (b.accounts[0]?.priority ?? 100));
    const preferredCode = input.preferredCarrierCode?.trim().toUpperCase();
    const chosen = preferredCode
      ? ranked.find((carrier) => carrier.code === preferredCode)
      : ranked[0];
    if (preferredCode && !chosen) {
      throw Errors.problem(
        409,
        'CARRIER_UNAVAILABLE',
        'Carrier unavailable',
        `Carrier ${preferredCode} is not eligible for this shipment in sandbox.`,
      );
    }
    if (!chosen) {
      throw Errors.problem(409, 'NO_CARRIER', 'No carrier', 'No sandbox carrier matches this shipment.');
    }
    return {
      carrierId: chosen.id,
      carrierCode: chosen.code,
      accountId: chosen.accounts[0]?.id ?? null,
      reason: preferredCode ? 'admin_selected' : 'priority_sandbox',
      candidates: ranked.map((c) => c.code),
    };
  }
}
