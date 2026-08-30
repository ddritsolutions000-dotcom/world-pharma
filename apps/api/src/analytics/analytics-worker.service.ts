import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { PolicyResolver } from '../policy/resolver';
import { utcDayStart } from './analytics-query';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { AnalyticsPurgeService } from './analytics-purge.service';

@Injectable()
export class AnalyticsWorkerService {
  private readonly logger = new Logger(AnalyticsWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly ingest: AnalyticsIngestService,
    private readonly purge: AnalyticsPurgeService,
  ) {}

  async runDailyRollups(metricDate = utcDayStart(new Date(Date.now() - 86_400_000))) {
    const metricDateKey = metricDate.toISOString().slice(0, 10);
    this.logger.log(
      JSON.stringify({
        event: 'analytics_rollup_daily_started',
        metric_date: metricDateKey,
      }),
    );
    const countries = await this.prisma.country.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, isoAlpha2: true },
    });
    const results = [];
    for (const country of countries) {
      const resolved = await this.policy.resolvePublished(country.isoAlpha2);
      if (!this.policy.isAnalyticsEnabled(resolved?.document ?? null)) {
        continue;
      }
      const result = await this.ingest.ingestCountryDay(country.id, metricDate);
      results.push(result);
    }
    this.logger.log(
      JSON.stringify({
        event: 'analytics_rollup_daily_completed',
        metric_date: metricDateKey,
        countries_processed: results.length,
      }),
    );
    return results;
  }

  runRetentionPurge() {
    const runDateKey = utcDayStart(new Date()).toISOString().slice(0, 10);
    this.logger.log(
      JSON.stringify({
        event: 'analytics_retention_purge_started',
        run_date: runDateKey,
      }),
    );
    return this.purge.purgeAllCountries().then((results) => {
      const personalizationDeleted = results.reduce((sum, row) => sum + row.personalization_deleted, 0);
      const rollupDeleted = results.reduce((sum, row) => sum + row.rollup_deleted, 0);
      this.logger.log(
        JSON.stringify({
          event: 'analytics_retention_purge_completed',
          run_date: runDateKey,
          countries_processed: results.length,
          personalization_deleted: personalizationDeleted,
          rollup_deleted: rollupDeleted,
        }),
      );
      return results;
    });
  }
}
