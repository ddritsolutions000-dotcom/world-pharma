import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { HealthModule } from '../health/health.module';
import { FamilyMemberController } from './family-member.controller';
import { FamilyMemberService } from './family-member.service';
import { FamilyProfileEnhancementController } from './family-profile-enhancement.controller';
import { FamilyProfileEnhancementService } from './family-profile-enhancement.service';

@Module({
  imports: [IdentityModule, forwardRef(() => HealthModule)],
  controllers: [FamilyMemberController, FamilyProfileEnhancementController],
  providers: [FamilyMemberService, FamilyProfileEnhancementService, PrismaService],
  exports: [FamilyMemberService, FamilyProfileEnhancementService],
})
export class FamilyMemberModule {}
