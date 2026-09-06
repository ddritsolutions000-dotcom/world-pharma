import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { CorporateWellnessController } from './corporate-wellness.controller';
import { PublicCorporateWellnessController } from './public.controller';
import { AdminCorporateWellnessController } from './admin.controller';
import { CorporateWellnessService } from './corporate-wellness.service';

@Module({
  imports: [IdentityModule, EventsModule],
  controllers: [CorporateWellnessController, PublicCorporateWellnessController, AdminCorporateWellnessController],
  providers: [CorporateWellnessService, PrismaService],
  exports: [CorporateWellnessService],
})
export class CorporateWellnessModule {}
