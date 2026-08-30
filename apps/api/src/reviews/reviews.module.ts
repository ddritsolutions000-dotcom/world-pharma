import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { SecurityModule } from '../security/security.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { ReviewsService } from './reviews.service';
import {
  ReviewsCatalogController,
  ReviewsSelfController,
} from './reviews.controller';
import { AdminQuestionsController, AdminReviewsController } from './admin-reviews.controller';

@Module({
  imports: [IdentityModule, PolicyModule, SecurityModule, PersonalizationModule],
  controllers: [
    ReviewsCatalogController,
    ReviewsSelfController,
    AdminReviewsController,
    AdminQuestionsController,
  ],
  providers: [PrismaService, ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
