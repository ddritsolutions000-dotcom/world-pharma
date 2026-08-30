import { Injectable } from '@nestjs/common';
import { AffiliateLinkStatus, ConversionEventKind, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { AbuseService } from '../security/abuse.service';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { isRedeemableReferralCode, normalizeReferralCode } from './affiliate-status';

@Injectable()
export class AffiliateClickService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
    private readonly abuse: AbuseService,
  ) {}

  async recordClick(input: {
    click_id: string;
    country_code: string;
    link_id?: string;
    referral_code?: string;
    requestId?: string;
  }) {
    const clickId = input.click_id?.trim();
    if (!clickId || clickId.length > 128) {
      throw Errors.validation('click_id is required');
    }
    if (!input.link_id && !input.referral_code) {
      throw Errors.validation('link_id or referral_code is required');
    }
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const existing = await runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.prisma.affiliateClick.findUnique({ where: { clickId } }),
    );
    if (existing) {
      return {
        recorded: false,
        duplicate: true,
        click_id: clickId,
      };
    }

    let link:
      | {
          id: string;
          organizationId: string;
          countryId: string;
          referralCodeId: string;
          status: AffiliateLinkStatus;
          referralCode: { id: string; code: string; status: string; expiresAt: Date | null };
        }
      | null = null;
    let referralCodeId: string | undefined;
    let organizationId: string | undefined;
    let linkId: string | null = null;

    if (input.link_id) {
      assertUuid(input.link_id, 'link_id');
      link = await runWithTenant(workerTenantContext({ countryId: country.id }), () =>
        this.prisma.affiliateLink.findFirst({
          where: { id: input.link_id, countryId: country.id },
          include: { referralCode: true },
        }),
      );
      if (!link) {
        await this.abuse.record('affiliate_abuse', input.requestId);
        throw Errors.notFound('Affiliate link not found');
      }
      if (link.status !== AffiliateLinkStatus.ACTIVE) {
        throw Errors.problem(410, 'AFFILIATE_LINK_INACTIVE', 'Link inactive', 'Affiliate link is not active.');
      }
      if (!isRedeemableReferralCode(link.referralCode.status as never, link.referralCode.expiresAt)) {
        throw Errors.problem(410, 'AFFILIATE_CODE_INACTIVE', 'Code inactive', 'Referral code is not active.');
      }
      referralCodeId = link.referralCodeId;
      organizationId = link.organizationId;
      linkId = link.id;
    } else {
      const normalized = normalizeReferralCode(input.referral_code ?? '');
      if (!normalized) {
        throw Errors.validation('referral_code is invalid');
      }
      const code = await runWithTenant(workerTenantContext({ countryId: country.id }), () =>
        this.prisma.affiliateReferralCode.findUnique({
          where: { countryId_code: { countryId: country.id, code: normalized } },
        }),
      );
      if (!code) {
        await this.abuse.record('affiliate_abuse', input.requestId);
        throw Errors.notFound('Referral code not found');
      }
      if (!isRedeemableReferralCode(code.status, code.expiresAt)) {
        throw Errors.problem(410, 'AFFILIATE_CODE_INACTIVE', 'Code inactive', 'Referral code is not active.');
      }
      referralCodeId = code.id;
      organizationId = code.organizationId;
    }

    let row;
    try {
      row = await runWithTenant(workerTenantContext({ countryId: country.id }), () =>
        this.prisma.affiliateClick.create({
          data: {
            id: uuidv7(),
            clickId,
            organizationId: organizationId!,
            countryId: country.id,
            referralCodeId: referralCodeId!,
            linkId,
          },
        }),
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return {
          recorded: false,
          duplicate: true,
          click_id: clickId,
        };
      }
      throw err;
    }

    await runWithTenant(workerTenantContext({ countryId: country.id }), () =>
      this.prisma.conversionEvent.create({
        data: {
          id: uuidv7(),
          countryId: country.id,
          source: 'affiliate_click',
          sourceKey: clickId,
          eventKind: ConversionEventKind.AFFILIATE_CLICK,
          metadata: {
            click_id: clickId,
            link_id: linkId,
            referral_code_id: referralCodeId,
            organization_id: organizationId,
          },
        },
      }),
    ).catch(() => undefined);

    await this.securityEvents.emit({
      type: 'CONVERSION_EVENT_RECORDED',
      outcome: 'success',
      metadata: {
        click_id: clickId,
        affiliate_click_id: row.id,
        country_id: country.id,
        organization_id: organizationId,
      },
    });

    return {
      recorded: true,
      duplicate: false,
      click_id: clickId,
    };
  }
}
