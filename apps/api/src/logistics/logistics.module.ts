import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { FinanceModule } from '../finance/finance.module';
import { LogisticsAdminController } from './admin.controller';
import { CarrierPort } from './carrier.port';
import { LogisticsCustomerController } from './customer.controller';
import { LogisticsService } from './logistics.service';
import { MockCarrierAdapter } from './mock.adapter';
import { CarrierRouter } from './router';
import { LogisticsVendorController } from './vendor.controller';
import { CarrierWebhookController } from './webhook.controller';
import { LogisticsWorker } from './worker';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule, FinanceModule],
  controllers: [
    LogisticsCustomerController,
    LogisticsVendorController,
    LogisticsAdminController,
    CarrierWebhookController,
  ],
  providers: [
    PrismaService,
    LogisticsService,
    CarrierRouter,
    MockCarrierAdapter,
    LogisticsWorker,
    { provide: CarrierPort, useClass: MockCarrierAdapter },
  ],
  exports: [LogisticsService, MockCarrierAdapter],
})
export class LogisticsModule {}
