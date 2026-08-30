import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { AdminLoyaltyController, LoyaltySelfController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [IdentityModule, PolicyModule],
  controllers: [LoyaltySelfController, AdminLoyaltyController],
  providers: [PrismaService, LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
