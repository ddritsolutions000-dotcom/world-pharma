import { Injectable } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { utcDayStart } from './analytics-query';

export type AnalyticsPurgeResult = {
  country_id: string;
  rollup_deleted: number;
  personalization_deleted: number;
  rollup_cutoff: string;
  personalization_cutoff: string;
};

@Injectable()
export class AnalyticsPurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
  ) {}

  async purgeCountry(countryId: string, isoAlpha2: string): Promise<AnalyticsPurgeResult> {
    const resolved = await this.policy.resolvePublished(isoAlpha2);
    const document = resolved?.document ?? null;
    const rollupRetentionDays = this.policy.analyticsRetentionDays(document);
    const personalizationRetentionDays = this.policy.personalizationRetentionDays(document);
    const now = utcDayStart(new Date());
    const rollupCutoff = new Date(now.getTime() - rollupRetentionDays * 86_400_000);
    const personalizationCutoff = new Date(Date.now() - personalizationRetentionDays * 86_400_000);

    return runWithTenant(workerTenantContext({ countryId }), async () => {
      const rollupDeleted =
        (await this.prisma.analyticsDailyCountryMetric.deleteMany({
          where: { countryId, metricDate: { lt: rollupCutoff } },
        })).count +
        (await this.prisma.analyticsDailyProductMetric.deleteMany({
          where: { countryId, metricDate: { lt: rollupCutoff } },
        })).count +
        (await this.prisma.analyticsDailyMarketingMetric.deleteMany({
          where: { countryId, metricDate: { lt: rollupCutoff } },
        })).count;
      const personalizationDeleted = (
        await this.prisma.personalizationEvent.deleteMany({
          where: { countryId, occurredAt: { lt: personalizationCutoff } },
        })
      ).count;
      return {
        country_id: countryId,
        rollup_deleted: rollupDeleted,
        personalization_deleted: personalizationDeleted,
        rollup_cutoff: rollupCutoff.toISOString().slice(0, 10),
        personalization_cutoff: personalizationCutoff.toISOString(),
      };
    });
  }

  async purgeAllCountries(): Promise<AnalyticsPurgeResult[]> {
    const countries = await this.prisma.country.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, isoAlpha2: true },
    });
    const results: AnalyticsPurgeResult[] = [];
    for (const country of countries) {
      results.push(await this.purgeCountry(country.id, country.isoAlpha2));
    }
    return results;
  }
}
