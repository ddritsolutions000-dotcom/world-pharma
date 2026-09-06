import { forwardRef, Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { FinanceModule } from '../finance/finance.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OrderModule } from '../orders/order.module';
import { LogisticsAdminController } from './admin.controller';
import { CarrierPort } from './carrier.port';
import { LogisticsCustomerController } from './customer.controller';
import { LogisticsService } from './logistics.service';
import { ServiceabilityZoneService } from './serviceability-zone.service';
import { MockCarrierAdapter } from './mock.adapter';
import { CarrierRouter } from './router';
import { LogisticsVendorController } from './vendor.controller';
import { CarrierWebhookController } from './webhook.controller';
import { LogisticsWorker } from './worker';

@Module({
  imports: [
    IdentityModule,
    PolicyModule,
    EventsModule,
    FinanceModule,
    forwardRef(() => DeliveryModule),
    forwardRef(() => OrderModule),
  ],
  controllers: [
    LogisticsCustomerController,
    LogisticsVendorController,
    LogisticsAdminController,
    CarrierWebhookController,
  ],
  providers: [
    PrismaService,
    LogisticsService,
    ServiceabilityZoneService,
    CarrierRouter,
    MockCarrierAdapter,
    LogisticsWorker,
    { provide: CarrierPort, useClass: MockCarrierAdapter },
  ],
  exports: [LogisticsService, MockCarrierAdapter, ServiceabilityZoneService],
})
export class LogisticsModule {}
