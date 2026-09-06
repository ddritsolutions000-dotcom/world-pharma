import { forwardRef, Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { CartModule } from '../cart/cart.module';
import { CatalogModule } from '../catalog/catalog.module';
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
import { OrderCustomerController } from './customer.controller';
import { OrderPublicController } from './public.controller';
import { OrderPaymentRefundedListenerService } from './order-payment-refunded.listener';
import { OrderService } from './order.service';
import { ReorderService } from './reorder.service';
import { OrderVendorController } from './vendor.controller';
import { OrderVendorReturnsController } from './vendor-returns.controller';

@Module({
  imports: [
    IdentityModule,
    PolicyModule,
    EventsModule,
    forwardRef(() => CartModule),
    CatalogModule,
    InventoryModule,
    forwardRef(() => LogisticsModule),
    FinanceModule,
    LoyaltyModule,
    PersonalizationModule,
    CrmModule,
    RecommendationsModule,
  ],
  controllers: [
    OrderCustomerController,
    OrderVendorController,
    OrderVendorReturnsController,
    OrderAdminController,
    OrderPublicController,
  ],
  providers: [PrismaService, OrderService, ReorderService, OrderPaymentRefundedListenerService],
  exports: [OrderService],
})
export class OrderModule {}
