import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CatalogAdminController } from './admin.controller';
import { AdminMarketplaceController } from './admin-marketplace.controller';
import { CatalogService } from './catalog.service';
import { CatalogCustomerController } from './customer.controller';
import { MarketplaceEligibilityService } from './marketplace-eligibility.service';
import { PricingService } from './pricing.service';
import { CatalogSearchService } from './search.service';
import { CatalogVendorController } from './vendor.controller';
import { VendorMarketplaceController } from './vendor-marketplace.controller';
import { VendorProfileController } from './vendor-profile.controller';
import { BigIntJsonInterceptor } from './bigint.interceptor';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule, InventoryModule],
  controllers: [
    CatalogCustomerController,
    CatalogVendorController,
    VendorProfileController,
    VendorMarketplaceController,
    CatalogAdminController,
    AdminMarketplaceController,
  ],
  providers: [
    PrismaService,
    RedisService,
    CatalogService,
    PricingService,
    CatalogSearchService,
    MarketplaceEligibilityService,
    { provide: APP_INTERCEPTOR, useClass: BigIntJsonInterceptor },
  ],
  exports: [CatalogService, PricingService, MarketplaceEligibilityService, CatalogSearchService],
})
export class CatalogModule {}
