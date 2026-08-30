import { Injectable } from '@nestjs/common';
import {
  AffiliateLinkStatus,
  AffiliateReferralCodeStatus,
  OrganizationKind,
  OrganizationStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { isCompanyRole } from '../identity/authority';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { AffiliateContextService } from './affiliate-context.service';
import {
  assertReferralCodeTransition,
  isRedeemableReferralCode,
  normalizeReferralCode,
} from './affiliate-status';

@Injectable()
export class AffiliateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AffiliateContextService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async listPartners(principal: Principal, countryCode: string) {
    this.assertAdmin(principal);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.organization.findMany({
          where: {
            countryId: country.id,
            kind: OrganizationKind.AFFILIATE_ORG,
            status: { in: [OrganizationStatus.ACTIVE, OrganizationStatus.DRAFT] },
          },
          orderBy: { displayName: 'asc' },
        });
        return {
          data: rows.map((row) => ({
            id: row.id,
            display_name: row.displayName,
            legal_name: row.legalName,
            status: row.status,
            country_code: country.isoAlpha2,
          })),
        };
      },
    );
  }

  async adminCreateReferralCode(
    principal: Principal,
    input: {
      country_code: string;
      organization_id: string;
      code: string;
      partner_id?: string | null;
      expires_at?: string | null;
    },
  ) {
    this.assertAdmin(principal);
    assertUuid(input.organization_id, 'organization_id');
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const org = await this.prisma.organization.findFirst({
      where: {
        id: input.organization_id,
        countryId: country.id,
        kind: OrganizationKind.AFFILIATE_ORG,
      },
    });
    if (!org) {
      throw Errors.notFound('Affiliate organization not found');
    }
    return this.createReferralCode(principal, {
      organizationId: org.id,
      countryId: country.id,
      countryCode: country.isoAlpha2,
      code: input.code,
      partnerId: input.partner_id ?? null,
      expiresAt: input.expires_at ?? null,
      activate: true,
    });
  }

  async listReferralCodes(principal: Principal, countryCode?: string) {
    const { organizationId, countryId } = await this.context.resolveAffiliateOrg(principal);
    const country = countryCode
      ? await resolveCountryByCode(this.prisma, countryCode)
      : await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    if (country.id !== countryId) {
      throw Errors.forbidden('This country is outside the affiliate organization scope.');
    }
    return runWithTenant(
      workerTenantContext({ countryId: country.id, organizationId, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.affiliateReferralCode.findMany({
          where: { organizationId, countryId: country.id },
          orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
        });
        return { data: rows.map((row) => this.presentCode(row, country.isoAlpha2)) };
      },
    );
  }

  async createSelfReferralCode(
    principal: Principal,
    input: { country_code?: string; code: string; expires_at?: string | null },
  ) {
    const { organizationId, countryId } = await this.context.resolveAffiliateOrg(principal);
    const country = input.country_code
      ? await resolveCountryByCode(this.prisma, input.country_code)
      : await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    if (country.id !== countryId) {
      throw Errors.forbidden('This country is outside the affiliate organization scope.');
    }
    return this.createReferralCode(principal, {
      organizationId,
      countryId: country.id,
      countryCode: country.isoAlpha2,
      code: input.code,
      partnerId: null,
      expiresAt: input.expires_at ?? null,
      activate: true,
    });
  }

  async updateReferralCode(
    principal: Principal,
    id: string,
    input: { country_code?: string; status?: string; version: number },
  ) {
    const { organizationId, countryId } = await this.context.resolveAffiliateOrg(principal);
    assertUuid(id, 'referral code id');
    const country = input.country_code
      ? await resolveCountryByCode(this.prisma, input.country_code)
      : await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    if (country.id !== countryId) {
      throw Errors.forbidden('This country is outside the affiliate organization scope.');
    }
    const nextStatus = input.status
      ? this.parseCodeStatus(input.status)
      : undefined;
    return runWithTenant(
      workerTenantContext({ countryId: country.id, organizationId, personId: principal.personId }),
      async () => {
        const row = await this.prisma.affiliateReferralCode.findFirst({
          where: { id, organizationId, countryId: country.id },
        });
        if (!row) {
          throw Errors.notFound('Referral code not found');
        }
        if (row.version !== input.version) {
          throw Errors.conflict('Referral code version conflict');
        }
        if (nextStatus) {
          assertReferralCodeTransition(row.status, nextStatus);
        }
        const updated = await this.prisma.affiliateReferralCode.update({
          where: { id: row.id },
          data: {
            status: nextStatus ?? row.status,
            version: { increment: 1 },
          },
        });
        return this.presentCode(updated, country.isoAlpha2);
      },
    );
  }

  async listLinks(principal: Principal, countryCode?: string) {
    const { organizationId, countryId } = await this.context.resolveAffiliateOrg(principal);
    const country = countryCode
      ? await resolveCountryByCode(this.prisma, countryCode)
      : await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    if (country.id !== countryId) {
      throw Errors.forbidden('This country is outside the affiliate organization scope.');
    }
    return runWithTenant(
      workerTenantContext({ countryId: country.id, organizationId, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.affiliateLink.findMany({
          where: { organizationId, countryId: country.id },
          include: { referralCode: true },
          orderBy: [{ updatedAt: 'desc' }],
        });
        return { data: rows.map((row) => this.presentLink(row, country.isoAlpha2)) };
      },
    );
  }

  async createLink(
    principal: Principal,
    input: {
      country_code?: string;
      referral_code_id: string;
      label?: string | null;
      landing_path?: string | null;
    },
  ) {
    const { organizationId, countryId } = await this.context.resolveAffiliateOrg(principal);
    assertUuid(input.referral_code_id, 'referral_code_id');
    const country = input.country_code
      ? await resolveCountryByCode(this.prisma, input.country_code)
      : await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    if (country.id !== countryId) {
      throw Errors.forbidden('This country is outside the affiliate organization scope.');
    }
    return runWithTenant(
      workerTenantContext({ countryId: country.id, organizationId, personId: principal.personId }),
      async () => {
        const code = await this.prisma.affiliateReferralCode.findFirst({
          where: { id: input.referral_code_id, organizationId, countryId: country.id },
        });
        if (!code) {
          throw Errors.notFound('Referral code not found');
        }
        if (!isRedeemableReferralCode(code.status, code.expiresAt)) {
          throw Errors.problem(
            422,
            'AFFILIATE_CODE_INACTIVE',
            'Referral code inactive',
            'Referral code must be active to create links.',
          );
        }
        const row = await this.prisma.affiliateLink.create({
          data: {
            id: uuidv7(),
            organizationId,
            countryId: country.id,
            referralCodeId: code.id,
            label: input.label?.trim() || null,
            landingPath: input.landing_path?.trim() || null,
            status: AffiliateLinkStatus.ACTIVE,
            createdByPersonId: principal.personId,
          },
          include: { referralCode: true },
        });
        await this.securityEvents.emit({
          type: 'AFFILIATE_REFERRAL_CREATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: {
            link_id: row.id,
            referral_code_id: code.id,
            organization_id: organizationId,
            country_id: country.id,
          },
        });
        return this.presentLink(row, country.isoAlpha2);
      },
    );
  }

  async stats(principal: Principal, countryCode?: string) {
    const { organizationId, countryId } = await this.context.resolveAffiliateOrg(principal);
    const country = countryCode
      ? await resolveCountryByCode(this.prisma, countryCode)
      : await this.prisma.country.findUniqueOrThrow({ where: { id: countryId } });
    if (country.id !== countryId) {
      throw Errors.forbidden('This country is outside the affiliate organization scope.');
    }
    return runWithTenant(
      workerTenantContext({ countryId: country.id, organizationId, personId: principal.personId }),
      async () => {
        const [clicks, links, codes, codeRows] = await Promise.all([
          this.prisma.affiliateClick.count({ where: { organizationId, countryId: country.id } }),
          this.prisma.affiliateLink.count({ where: { organizationId, countryId: country.id } }),
          this.prisma.affiliateReferralCode.count({
            where: {
              organizationId,
              countryId: country.id,
              status: AffiliateReferralCodeStatus.ACTIVE,
            },
          }),
          this.prisma.affiliateReferralCode.findMany({
            where: { organizationId, countryId: country.id },
            select: { code: true },
          }),
        ]);
        const liabilities = codeRows.length
          ? await this.prisma.affiliateLiability.findMany({
              where: { affiliateCode: { in: codeRows.map((row) => row.code) } },
            })
          : [];
        const pendingMinor = liabilities
          .filter((row) => row.status === 'PENDING')
          .reduce((sum, row) => sum + row.amountMinor, 0n);
        return {
          clicks_total: clicks,
          links_total: links,
          codes_active: codes,
          earnings_pending_minor: pendingMinor.toString(),
          clinical_blocked_default: true,
          payout_enabled: false,
        };
      },
    );
  }

  async listEarnings(principal: Principal) {
    const { organizationId } = await this.context.resolveAffiliateOrg(principal);
    const codeRows = await this.prisma.affiliateReferralCode.findMany({
      where: { organizationId },
      select: { code: true },
    });
    const codes = codeRows.map((row) => row.code);
    const rows = codes.length
      ? await this.prisma.affiliateLiability.findMany({
          where: { affiliateCode: { in: codes } },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    return {
      data: rows.map((row) => ({
        order_id: row.orderId,
        amount_minor: row.amountMinor.toString(),
        currency: row.currency,
        status: row.status,
        clinical_blocked: row.clinicalBlocked,
        affiliate_code: row.affiliateCode,
      })),
      payout_visibility: 'liability_status_only',
      live_payout: false,
    };
  }

  private async createReferralCode(
    principal: Principal,
    input: {
      organizationId: string;
      countryId: string;
      countryCode: string;
      code: string;
      partnerId: string | null;
      expiresAt: string | null;
      activate: boolean;
    },
  ) {
    const code = normalizeReferralCode(input.code);
    if (!code || code.length < 3) {
      throw Errors.validation('Referral code must be at least 3 characters');
    }
    if (input.partnerId) {
      assertUuid(input.partnerId, 'partner_id');
    }
    try {
      return await runWithTenant(
        workerTenantContext({
          countryId: input.countryId,
          organizationId: input.organizationId,
          personId: principal.personId,
        }),
        async () => {
          const row = await this.prisma.affiliateReferralCode.create({
            data: {
              id: uuidv7(),
              organizationId: input.organizationId,
              countryId: input.countryId,
              partnerId: input.partnerId,
              code,
              status: input.activate
                ? AffiliateReferralCodeStatus.ACTIVE
                : AffiliateReferralCodeStatus.DRAFT,
              expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
              createdByPersonId: principal.personId,
            },
          });
          await this.securityEvents.emit({
            type: 'AFFILIATE_REFERRAL_CREATED',
            outcome: 'success',
            personId: principal.personId,
            metadata: {
              referral_code_id: row.id,
              organization_id: input.organizationId,
              country_id: input.countryId,
            },
          });
          return this.presentCode(row, input.countryCode);
        },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('Referral code already exists in this country');
      }
      throw err;
    }
  }

  private presentCode(
    row: {
      id: string;
      code: string;
      status: AffiliateReferralCodeStatus;
      version: number;
      expiresAt: Date | null;
      organizationId: string;
      createdAt: Date;
      updatedAt: Date;
    },
    countryCode: string,
  ) {
    return {
      id: row.id,
      code: row.code,
      status: row.status,
      version: row.version,
      country_code: countryCode,
      organization_id: row.organizationId,
      expires_at: row.expiresAt?.toISOString() ?? null,
      redeemable: isRedeemableReferralCode(row.status, row.expiresAt),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private presentLink(
    row: {
      id: string;
      label: string | null;
      landingPath: string | null;
      status: AffiliateLinkStatus;
      version: number;
      organizationId: string;
      referralCode: { code: string; id: string };
      createdAt: Date;
      updatedAt: Date;
    },
    countryCode: string,
  ) {
    const path = row.landingPath ?? '/';
    return {
      id: row.id,
      label: row.label,
      landing_path: path,
      status: row.status,
      version: row.version,
      country_code: countryCode,
      organization_id: row.organizationId,
      referral_code_id: row.referralCode.id,
      referral_code: row.referralCode.code,
      share_url: `/r/${row.referralCode.code}?lid=${row.id}`,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private parseCodeStatus(raw: string): AffiliateReferralCodeStatus {
    const upper = raw.trim().toUpperCase();
    if (
      !Object.values(AffiliateReferralCodeStatus).includes(upper as AffiliateReferralCodeStatus)
    ) {
      throw Errors.validation('Invalid referral code status');
    }
    return upper as AffiliateReferralCodeStatus;
  }

  private assertAdmin(principal: Principal) {
    if (!principal.roles.some((role) => isCompanyRole(role))) {
      throw Errors.forbidden('Admin access required');
    }
  }
}
