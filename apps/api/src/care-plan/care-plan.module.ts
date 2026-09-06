import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { AdminCarePlanController, CarePlanSelfController, PublicCarePlanController } from './care-plan.controller';
import { CarePlanDefinitionService } from './care-plan-definition.service';
import { CarePlanService } from './care-plan.service';

@Module({
  imports: [IdentityModule],
  controllers: [PublicCarePlanController, CarePlanSelfController, AdminCarePlanController],
  providers: [PrismaService, CarePlanService, CarePlanDefinitionService],
  exports: [CarePlanService, CarePlanDefinitionService],
})
export class CarePlanModule {}
