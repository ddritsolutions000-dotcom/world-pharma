import { Injectable } from '@nestjs/common';
import { CrmSuppressionChannel } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../../app/prisma.service';
import { workerTenantContext } from '../../tenancy/build-tenant-context';

@Injectable()
export class SuppressionService {
  constructor(private readonly prisma: PrismaService) {}

  async isSuppressed(
    personId: string,
    countryId: string,
    channel: CrmSuppressionChannel,
  ): Promise<boolean> {
    return runWithTenant(workerTenantContext({ countryId, personId }), async () => {
      const row = await this.prisma.crmSuppression.findFirst({
        where: {
          personId,
          countryId,
          revokedAt: null,
          channel: { in: [CrmSuppressionChannel.ALL, channel] },
        },
        select: { id: true },
      });
      return row != null;
    });
  }

  async recordOptOut(personId: string, countryId: string, reason = 'opt_out') {
    return runWithTenant(workerTenantContext({ countryId, personId }), async () => {
      const existing = await this.prisma.crmSuppression.findUnique({
        where: {
          personId_countryId_channel: {
            personId,
            countryId,
            channel: CrmSuppressionChannel.ALL,
          },
        },
      });
      if (existing && !existing.revokedAt) {
        return existing;
      }
      if (existing?.revokedAt) {
        return this.prisma.crmSuppression.update({
          where: { id: existing.id },
          data: { revokedAt: null, reason, createdAt: new Date() },
        });
      }
      return this.prisma.crmSuppression.create({
        data: {
          id: uuidv7(),
          personId,
          countryId,
          channel: CrmSuppressionChannel.ALL,
          reason,
        },
      });
    });
  }

  async revokeOptOut(personId: string, countryId: string) {
    return runWithTenant(workerTenantContext({ countryId, personId }), async () => {
      const existing = await this.prisma.crmSuppression.findUnique({
        where: {
          personId_countryId_channel: {
            personId,
            countryId,
            channel: CrmSuppressionChannel.ALL,
          },
        },
      });
      if (!existing || existing.revokedAt) {
        return null;
      }
      return this.prisma.crmSuppression.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    });
  }
}
