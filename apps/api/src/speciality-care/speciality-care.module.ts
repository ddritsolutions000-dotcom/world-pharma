import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { SpecialityCareController } from './speciality-care.controller';
import { PublicSpecialityCareController } from './public.controller';
import { AdminSpecialityCareController } from './admin.controller';
import { SpecialityCareService } from './speciality-care.service';

@Module({
  imports: [IdentityModule],
  controllers: [SpecialityCareController, PublicSpecialityCareController, AdminSpecialityCareController],
  providers: [SpecialityCareService, PrismaService],
  exports: [SpecialityCareService],
})
export class SpecialityCareModule {}
