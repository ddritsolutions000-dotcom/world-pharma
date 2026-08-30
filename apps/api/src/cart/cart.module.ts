import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { CatalogModule } from '../catalog/catalog.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentModule } from '../payment/payment.module';
import { PolicyModule } from '../policy/policy.module';
import { PromoModule } from '../promo/promo.module';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { CrmModule } from '../crm/crm.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule, CatalogModule, InventoryModule, PaymentModule, PromoModule, AffiliateModule, PersonalizationModule, CrmModule],
  controllers: [CartController],
  providers: [PrismaService, RedisService, CartService],
  exports: [CartService],
})
export class CartModule {}
