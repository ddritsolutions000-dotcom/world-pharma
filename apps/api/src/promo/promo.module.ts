import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { AdminPromoController } from './admin-promo.controller';
import { PromoCampaignService } from './promo-campaign.service';
import { PromoEvaluatorService } from './promo-evaluator.service';

@Module({
  imports: [IdentityModule, PolicyModule],
  controllers: [AdminPromoController],
  providers: [PrismaService, PromoCampaignService, PromoEvaluatorService],
  exports: [PromoEvaluatorService],
})
export class PromoModule {}
