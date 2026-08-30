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
