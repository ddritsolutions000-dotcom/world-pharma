import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { CatalogModule } from '../catalog/catalog.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentModule } from '../payment/payment.module';
import { PolicyModule } from '../policy/policy.module';
import { PromoModule } from '../promo/promo.module';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { CrmModule } from '../crm/crm.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CarePlanModule } from '../care-plan/care-plan.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [
    IdentityModule,
    PolicyModule,
    EventsModule,
    CatalogModule,
    InventoryModule,
    PaymentModule,
    PromoModule,
    AffiliateModule,
    PersonalizationModule,
    CrmModule,
    LoyaltyModule,
    CarePlanModule,
    LogisticsModule,
    forwardRef(() => ClinicalModule),
  ],
  controllers: [CartController],
  providers: [PrismaService, RedisService, CartService],
  exports: [CartService],
})
export class CartModule {}
