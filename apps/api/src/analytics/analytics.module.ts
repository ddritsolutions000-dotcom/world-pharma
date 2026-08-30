import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { CrmModule } from '../crm/crm.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { AnalyticsPurgeService } from './analytics-purge.service';
import { AnalyticsReadService } from './analytics-read.service';
import { AnalyticsRollupSchedulerService } from './analytics-rollup-scheduler.service';
import { AnalyticsWorkerService } from './analytics-worker.service';

@Module({
  imports: [IdentityModule, PolicyModule, CrmModule, EventsModule],
  controllers: [AdminAnalyticsController],
  providers: [
    PrismaService,
    AnalyticsIngestService,
    AnalyticsPurgeService,
    AnalyticsReadService,
    AnalyticsWorkerService,
    AnalyticsRollupSchedulerService,
  ],
  exports: [
    AnalyticsIngestService,
    AnalyticsPurgeService,
    AnalyticsReadService,
    AnalyticsWorkerService,
    AnalyticsRollupSchedulerService,
  ],
})
export class AnalyticsModule {}
