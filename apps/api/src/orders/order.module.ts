import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { FinanceModule } from '../finance/finance.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { CrmModule } from '../crm/crm.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { PolicyModule } from '../policy/policy.module';
import { OrderAdminController } from './admin.controller';
import { CarrierPort } from './carrier.port';
import { OrderCustomerController } from './customer.controller';
import { NoopCarrierAdapter } from './noop.carrier';
import { OrderPaymentRefundedListenerService } from './order-payment-refunded.listener';
import { OrderService } from './order.service';
import { OrderVendorController } from './vendor.controller';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule, InventoryModule, LogisticsModule, FinanceModule, LoyaltyModule, PersonalizationModule, CrmModule, RecommendationsModule],
  controllers: [OrderCustomerController, OrderVendorController, OrderAdminController],
  providers: [PrismaService, OrderService, OrderPaymentRefundedListenerService, { provide: CarrierPort, useClass: NoopCarrierAdapter }],
  exports: [OrderService],
})
export class OrderModule {}
