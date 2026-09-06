import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { AdminPromoController } from './admin-promo.controller';
import { CustomerPromoController } from './customer-promo.controller';
import { CustomerPromoService } from './customer-promo.service';
import { PromoCampaignService } from './promo-campaign.service';
import { PromoEvaluatorService } from './promo-evaluator.service';

@Module({
  imports: [IdentityModule, PolicyModule],
  controllers: [AdminPromoController, CustomerPromoController],
  providers: [PrismaService, PromoCampaignService, CustomerPromoService, PromoEvaluatorService],
  exports: [PromoEvaluatorService],
})
export class PromoModule {}
