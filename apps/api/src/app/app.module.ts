import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from '@world-pharma/config';
import { MetricsModule } from '../common/metrics.module';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { EventsModule } from '../events/events.module';
import { PartnerModule } from '../partner/partner.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartModule } from '../cart/cart.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderModule } from '../orders/order.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { FinanceModule } from '../finance/finance.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { HealthcareModule } from '../healthcare/healthcare.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { SecurityModule } from '../security/security.module';
import { StoreModule } from '../store/store.module';
import { GovernanceModule } from '../governance/governance.module';
import { PlatformModule } from '../platform/platform.module';
import { LabModule } from '../lab/lab.module';
import { RadiologyModule } from '../radiology/radiology.module';
import { HealthModule } from '../health/health.module';
import { CareNavModule } from '../care-nav/care-nav.module';
import { CmsModule } from '../cms/cms.module';
import { CrmModule } from '../crm/crm.module';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { PromoModule } from '../promo/promo.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { MedicationReminderModule } from '../medication-reminder/medication-reminder.module';
import { FamilyMemberModule } from '../family-member/family-member.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CarePlanModule } from '../care-plan/care-plan.module';
import { SpecialityCareModule } from '../speciality-care/speciality-care.module';
import { CorporateWellnessModule } from '../corporate-wellness/corporate-wellness.module';
import { HealthPackagesModule } from '../health-packages/health-packages.module';
import { StoreLocatorModule } from '../store-locator/store-locator.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { SearchModule } from '../search/search.module';
import { DiscoveryModule } from '../discovery/discovery.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MetricsController } from './metrics.controller';
import { TenantContextInterceptor } from '../tenancy/tenant.interceptor';
import { DevSandboxSeedService } from '../dev/dev-sandbox.seed.service';
import { DevTransactionalSeedService } from '../dev/dev-transactional.seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (raw) => parseEnv(raw),
    }),
    MetricsModule,
    SecurityModule,
    IdentityModule,
    PolicyModule,
    PartnerModule,
    CatalogModule,
    LabModule,
    RadiologyModule,
    HealthModule,
    CareNavModule,
    CmsModule,
    CrmModule,
    PromoModule,
    AffiliateModule,
    WishlistModule,
    MedicationReminderModule,
    FamilyMemberModule,
    LoyaltyModule,
    CarePlanModule,
    SpecialityCareModule,
    CorporateWellnessModule,
    HealthPackagesModule,
    StoreLocatorModule,
    ReviewsModule,
    PersonalizationModule,
    SearchModule,
    DiscoveryModule,
    RecommendationsModule,
    AnalyticsModule,
    InventoryModule,
    CartModule,
    PaymentModule,
    OrderModule,
    LogisticsModule,
    FinanceModule,
    ClinicalModule,
    HealthcareModule,
    StoreModule,
    DeliveryModule,
    GovernanceModule,
    PlatformModule,
    EventsModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    PrismaService,
    RedisService,
    DevSandboxSeedService,
    DevTransactionalSeedService,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
