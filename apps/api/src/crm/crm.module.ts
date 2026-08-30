import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { PlatformModule } from '../platform/platform.module';
import { AdminCrmController } from './admin-crm.controller';
import { ConversionEventService } from './conversion-event.service';
import { Customer360Service } from './customer360.service';
import { MarketingPreferenceController } from './marketing-preference.controller';
import { MarketingPreferenceService } from './marketing-preference.service';
import { AdminMarketingController } from './marketing/admin-marketing.controller';
import { CampaignService } from './marketing/campaign.service';
import { SegmentService } from './marketing/segment.service';
import { SendPipelineService } from './marketing/send-pipeline.service';
import { SuppressionService } from './marketing/suppression.service';
import { AdminAutomationController } from './automation/admin-automation.controller';
import { AutomationRunService } from './automation/automation-run.service';
import { RefillMarketingService } from './automation/refill-marketing.service';
import { CrmAutomationSchedulerService } from './automation/crm-automation-scheduler.service';
import { CampaignSendSchedulerService } from './marketing/campaign-send-scheduler.service';
import { AbandonedCartRecoveryService } from './automation/abandoned-cart-recovery.service';
import { CartAbandonRecoveryDispatchService } from './automation/cart-abandon-recovery-dispatch.service';

@Module({
  imports: [IdentityModule, EventsModule, PolicyModule, forwardRef(() => PlatformModule)],
  controllers: [
    AdminCrmController,
    MarketingPreferenceController,
    AdminMarketingController,
    AdminAutomationController,
  ],
  providers: [
    PrismaService,
    Customer360Service,
    MarketingPreferenceService,
    ConversionEventService,
    SegmentService,
    CampaignService,
    SendPipelineService,
    SuppressionService,
    AutomationRunService,
    RefillMarketingService,
    CrmAutomationSchedulerService,
    CampaignSendSchedulerService,
    AbandonedCartRecoveryService,
    CartAbandonRecoveryDispatchService,
  ],
  exports: [
    Customer360Service,
    MarketingPreferenceService,
    ConversionEventService,
    SuppressionService,
    AutomationRunService,
    RefillMarketingService,
    CrmAutomationSchedulerService,
    CampaignSendSchedulerService,
    AbandonedCartRecoveryService,
  ],
})
export class CrmModule {}
