import { Injectable } from '@nestjs/common';
import { PromoCampaignStatus, PromoFunding, PromoKind } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  assertPromoTransition,
  isEditablePromoStatus,
  isTerminalPromoStatus,
} from './promo-status';

@Injectable()
export class PromoCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
    private readonly policies: PolicyResolver,
  ) {}

  async list(principal: Principal, countryCode: string) {
    this.assertAdmin(principal);
    await this.assertPromoEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.promoCampaign.findMany({
          where: { countryId: country.id },
          orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
        });
        return { data: rows.map((row) => this.present(row, country.isoAlpha2)) };
      },
    );
  }

  async get(principal: Principal, id: string, countryCode: string) {
    this.assertAdmin(principal);
    assertUuid(id, 'promo campaign id');
    await this.assertPromoEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.promoCampaign.findFirst({
          where: { id, countryId: country.id },
        });
        if (!row) {
          throw Errors.notFound('Promo campaign not found');
        }
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async create(
    principal: Principal,
    input: {
      country_code: string;
      code: string;
      kind: string;
      percent_bps?: number;
      fixed_minor?: string;
      min_basket_minor?: string;
      funding?: string;
      max_redemptions?: number | null;
      expires_at?: string | null;
    },
  ) {
    this.assertAdmin(principal);
    await this.assertPromoEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const code = input.code.trim().toUpperCase();
    if (!code) {
      throw Errors.validation('code is required');
    }
    const kind = this.parseKind(input.kind);
    const funding = this.parseFunding(input.funding ?? 'PLATFORM');
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.promoCampaign.create({
          data: {
            id: uuidv7(),
            code,
            kind,
            percentBps: input.percent_bps ?? 0,
            fixedMinor: BigInt(input.fixed_minor ?? '0'),
            minBasketMinor: BigInt(input.min_basket_minor ?? '0'),
            funding,
            countryId: country.id,
            status: PromoCampaignStatus.DRAFT,
            maxRedemptions: input.max_redemptions ?? null,
            expiresAt: input.expires_at ? new Date(input.expires_at) : null,
            createdByPersonId: principal.personId,
          },
        });
        await this.securityEvents.emit({
          type: 'PROMO_CAMPAIGN_CREATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { campaign_id: row.id, country_id: country.id },
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
      kind?: string;
      percent_bps?: number;
      fixed_minor?: string;
      min_basket_minor?: string;
      funding?: string;
      max_redemptions?: number | null;
      expires_at?: string | null;
      status?: string;
      version?: number;
    },
  ) {
    this.assertAdmin(principal);
    assertUuid(id, 'promo campaign id');
    await this.assertPromoEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const existing = await this.prisma.promoCampaign.findFirst({
          where: { id, countryId: country.id },
        });
        if (!existing) {
          throw Errors.notFound('Promo campaign not found');
        }
        if (input.version != null && existing.version !== input.version) {
          throw Errors.problem(409, 'VERSION_CONFLICT', 'Version conflict', 'Promo was updated elsewhere.');
        }
        if (isTerminalPromoStatus(existing.status) && input.status && input.status !== existing.status) {
          throw Errors.conflict('Terminal promo campaigns cannot change status');
        }
        const nextStatus = input.status ? this.parseStatus(input.status) : existing.status;
        if (nextStatus !== existing.status) {
          assertPromoTransition(existing.status, nextStatus);
        }
        const editableFields = isEditablePromoStatus(existing.status) || nextStatus !== existing.status;
        if (
          !editableFields &&
          (input.kind ||
            input.percent_bps != null ||
            input.fixed_minor != null ||
            input.min_basket_minor != null ||
            input.funding ||
            input.max_redemptions !== undefined ||
            input.expires_at !== undefined)
        ) {
          throw Errors.conflict('Promo campaign cannot be edited in its current status');
        }
        const row = await this.prisma.promoCampaign.update({
          where: { id: existing.id },
          data: {
            ...(input.kind ? { kind: this.parseKind(input.kind) } : {}),
            ...(input.percent_bps != null ? { percentBps: input.percent_bps } : {}),
            ...(input.fixed_minor != null ? { fixedMinor: BigInt(input.fixed_minor) } : {}),
            ...(input.min_basket_minor != null ? { minBasketMinor: BigInt(input.min_basket_minor) } : {}),
            ...(input.funding ? { funding: this.parseFunding(input.funding) } : {}),
            ...(input.max_redemptions !== undefined ? { maxRedemptions: input.max_redemptions } : {}),
            ...(input.expires_at !== undefined
              ? { expiresAt: input.expires_at ? new Date(input.expires_at) : null }
              : {}),
            ...(input.status ? { status: nextStatus } : {}),
            version: { increment: 1 },
          },
        });
        const eventType =
          nextStatus === PromoCampaignStatus.ACTIVE && existing.status !== PromoCampaignStatus.ACTIVE
            ? 'PROMO_CAMPAIGN_PUBLISHED'
            : 'PROMO_CAMPAIGN_UPDATED';
        await this.securityEvents.emit({
          type: eventType,
          outcome: 'success',
          personId: principal.personId,
          metadata: { campaign_id: row.id, country_id: country.id, status: row.status },
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async listRedemptions(principal: Principal, id: string, countryCode: string) {
    this.assertAdmin(principal);
    assertUuid(id, 'promo campaign id');
    await this.assertPromoEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const campaign = await this.prisma.promoCampaign.findFirst({
          where: { id, countryId: country.id },
          select: { id: true },
        });
        if (!campaign) {
          throw Errors.notFound('Promo campaign not found');
        }
        const rows = await this.prisma.promoApplication.findMany({
          where: { campaignId: campaign.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 100,
        });
        return {
          data: rows.map((row) => ({
            id: row.id,
            session_id: row.sessionId,
            campaign_id: row.campaignId,
            discount_minor: row.discountMinor.toString(),
            funding: row.funding,
            created_at: row.createdAt.toISOString(),
          })),
        };
      },
    );
  }

  private present(
    row: {
      id: string;
      code: string;
      kind: PromoKind;
      percentBps: number;
      fixedMinor: bigint;
      minBasketMinor: bigint;
      funding: PromoFunding;
      countryId: string | null;
      status: PromoCampaignStatus;
      maxRedemptions: number | null;
      redeemedCount: number;
      expiresAt: Date | null;
      version: number;
      createdByPersonId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    countryCode: string,
  ) {
    return {
      id: row.id,
      code: row.code,
      kind: row.kind,
      percent_bps: row.percentBps,
      fixed_minor: row.fixedMinor.toString(),
      min_basket_minor: row.minBasketMinor.toString(),
      funding: row.funding,
      country_id: row.countryId,
      country_code: countryCode,
      status: row.status,
      max_redemptions: row.maxRedemptions,
      redeemed_count: row.redeemedCount,
      expires_at: row.expiresAt?.toISOString() ?? null,
      version: row.version,
      created_by_person_id: row.createdByPersonId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private parseKind(raw: string): PromoKind {
    const upper = raw.trim().toUpperCase();
    if (!Object.values(PromoKind).includes(upper as PromoKind)) {
      throw Errors.validation(`Invalid promo kind: ${raw}`);
    }
    return upper as PromoKind;
  }

  private parseFunding(raw: string): PromoFunding {
    const upper = raw.trim().toUpperCase();
    if (!Object.values(PromoFunding).includes(upper as PromoFunding)) {
      throw Errors.validation(`Invalid promo funding: ${raw}`);
    }
    return upper as PromoFunding;
  }

  private parseStatus(raw: string): PromoCampaignStatus {
    const upper = raw.trim().toUpperCase();
    if (!Object.values(PromoCampaignStatus).includes(upper as PromoCampaignStatus)) {
      throw Errors.validation(`Invalid promo status: ${raw}`);
    }
    return upper as PromoCampaignStatus;
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience required');
    }
  }

  private async assertPromoEnabled(countryCode: string) {
    const policy = await this.policies.resolvePublished(countryCode);
    if (!policy?.document.services?.pharmacy) {
      throw Errors.forbidden('Commerce is not enabled for this country');
    }
  }
}
