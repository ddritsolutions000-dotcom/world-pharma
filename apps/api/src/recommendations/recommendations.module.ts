import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { CooccurrenceService } from './cooccurrence.service';
import { RecommendationsCatalogController } from './recommendations-catalog.controller';
import { RecommendationsMeController } from './recommendations-me.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [CatalogModule, IdentityModule, PolicyModule],
  controllers: [RecommendationsCatalogController, RecommendationsMeController],
  providers: [PrismaService, RecommendationsService, CooccurrenceService],
  exports: [RecommendationsService, CooccurrenceService],
})
export class RecommendationsModule {}
