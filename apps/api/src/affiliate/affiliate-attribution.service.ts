import { Injectable } from '@nestjs/common';
import { AffiliateReferralCodeStatus } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { isRedeemableReferralCode, normalizeReferralCode } from './affiliate-status';

@Injectable()
export class AffiliateAttributionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves checkout affiliate_code against managed referral codes.
   * Managed inactive/expired codes are stripped; unknown legacy strings pass through.
   */
  async resolveCheckoutCode(affiliateCode: string | null, countryId: string): Promise<string | null> {
    if (!affiliateCode) {
      return null;
    }
    const normalized = normalizeReferralCode(affiliateCode);
    if (!normalized) {
      return null;
    }
    const managed = await runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.affiliateReferralCode.findUnique({
        where: { countryId_code: { countryId, code: normalized } },
      }),
    );
    if (!managed) {
      return normalized;
    }
    if (!isRedeemableReferralCode(managed.status, managed.expiresAt)) {
      return null;
    }
    return normalized;
  }

  async isSelfReferral(
    affiliateCode: string | null,
    countryId: string,
    customerPersonId?: string,
  ): Promise<boolean> {
    if (!affiliateCode || !customerPersonId) {
      return false;
    }
    const normalized = normalizeReferralCode(affiliateCode);
    if (!normalized) {
      return false;
    }
    const managed = await runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.affiliateReferralCode.findUnique({
        where: { countryId_code: { countryId, code: normalized } },
        include: { partner: true },
      }),
    );
    if (!managed) {
      return false;
    }
    if (managed.partner?.personId === customerPersonId) {
      return true;
    }
    const membership = await this.prisma.membership.count({
      where: {
        personId: customerPersonId,
        organizationId: managed.organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        role: { code: { in: ['org_owner', 'org_admin'] } },
      },
    });
    return membership > 0;
  }

  async hasActiveManagedCode(affiliateCode: string | null, countryId: string): Promise<boolean> {
    if (!affiliateCode) {
      return false;
    }
    const normalized = normalizeReferralCode(affiliateCode);
    if (!normalized) {
      return false;
    }
    const managed = await runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.affiliateReferralCode.findUnique({
        where: { countryId_code: { countryId, code: normalized } },
      }),
    );
    if (!managed) {
      return false;
    }
    return isRedeemableReferralCode(managed.status, managed.expiresAt);
  }

  async isManagedCode(code: string, countryId: string): Promise<boolean> {
    const normalized = normalizeReferralCode(code);
    if (!normalized) {
      return false;
    }
    const row = await runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.affiliateReferralCode.findUnique({
        where: { countryId_code: { countryId, code: normalized } },
      }),
    );
    return Boolean(row);
  }

  async validateClickBinding(
    clickId: string | null | undefined,
    affiliateCode: string | null,
    countryId: string,
  ): Promise<boolean> {
    const trimmed = clickId?.trim();
    if (!trimmed || !affiliateCode) {
      return true;
    }
    const normalized = normalizeReferralCode(affiliateCode);
    if (!normalized) {
      return false;
    }
    const click = await runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.affiliateClick.findUnique({
        where: { clickId: trimmed },
        include: { referralCode: true },
      }),
    );
    if (!click || click.countryId !== countryId) {
      return false;
    }
    return normalizeReferralCode(click.referralCode.code) === normalized;
  }

  async resolveCheckoutAttribution(input: {
    affiliateCode: string | null;
    clickId?: string | null;
    countryId: string;
  }): Promise<string | null> {
    const resolved = await this.resolveCheckoutCode(input.affiliateCode, input.countryId);
    if (!resolved) {
      return null;
    }
    const clickOk = await this.validateClickBinding(input.clickId, resolved, input.countryId);
    return clickOk ? resolved : null;
  }

  async assertActiveManagedCode(code: string, countryId: string): Promise<void> {
    const normalized = normalizeReferralCode(code);
    const row = await runWithTenant(workerTenantContext({ countryId }), () =>
      this.prisma.affiliateReferralCode.findUnique({
        where: { countryId_code: { countryId, code: normalized } },
      }),
    );
    if (!row) {
      return;
    }
    if (
      row.status !== AffiliateReferralCodeStatus.ACTIVE ||
      (row.expiresAt && row.expiresAt <= new Date())
    ) {
      throw new Error('AFFILIATE_CODE_INACTIVE');
    }
  }
}
