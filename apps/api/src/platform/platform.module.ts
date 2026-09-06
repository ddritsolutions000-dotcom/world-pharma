import { Module, forwardRef } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { AdminNotificationController } from './admin-notification.controller';
import { AdminNotificationProviderController } from './admin-notification-provider.controller';
import { AdminControlPlaneController } from './admin-control-plane.controller';
import { AdminControlPlaneService } from './admin-control-plane.service';
import { RegulatoryController } from './regulatory.controller';
import { RegulatoryService } from './regulatory.service';
import { CountryProductionService } from './country-production.service';
import { FinalLaunchReadinessService } from './final-launch-readiness.service';
import { FirstCountryLaunchService } from './first-country-launch.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationService } from './notification.service';
import { NotificationProviderConfigService } from './notification-provider-config.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { VendorSupportController } from './vendor-support.controller';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { MetricsModule } from '../common/metrics.module';
import { IdentityModule } from '../identity/identity.module';
import { EventsModule } from '../events/events.module';
import { CrmModule } from '../crm/crm.module';
import { PolicyModule } from '../policy/policy.module';
import { PaymentGatewayRegistryModule } from '../payment/gateway-registry.module';

@Module({
  imports: [
    IdentityModule,
    EventsModule,
    MetricsModule,
    PolicyModule,
    PaymentGatewayRegistryModule,
    forwardRef(() => CrmModule),
  ],
  controllers: [NotificationController, AdminNotificationController, AdminNotificationProviderController, AdminControlPlaneController, SupportController, VendorSupportController, RegulatoryController],
  providers: [
    PrismaService,
    RedisService,
    NotificationService,
    NotificationDispatchService,
    NotificationProviderConfigService,
    AdminControlPlaneService,
    SupportService,
    RegulatoryService,
    CountryProductionService,
    FinalLaunchReadinessService,
    FirstCountryLaunchService,
  ],
  exports: [
    NotificationService,
    NotificationDispatchService,
    NotificationProviderConfigService,
    AdminControlPlaneService,
    SupportService,
    RegulatoryService,
    CountryProductionService,
    FinalLaunchReadinessService,
    FirstCountryLaunchService,
  ],
})
export class PlatformModule {}
