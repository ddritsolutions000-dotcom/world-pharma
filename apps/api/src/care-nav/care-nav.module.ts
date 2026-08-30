import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { CareNavAuditService } from './care-nav-audit.service';
import { CareNavController } from './care-nav.controller';
import { AdminCareNavController } from './admin-care-nav.controller';
import { CareNavigationService } from './care-navigation.service';
import { CareMatchService } from './care-match.service';
import { CareNavHandoffService } from './care-nav-handoff.service';
import { AdminCareNavService } from './admin-care-nav.service';
import { CareNavOverrideService } from './care-nav-override.service';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule, ClinicalModule],
  controllers: [CareNavController, AdminCareNavController],
  providers: [
    PrismaService,
    CareNavigationService,
    CareNavAuditService,
    CareMatchService,
    CareNavHandoffService,
    AdminCareNavService,
    CareNavOverrideService,
  ],
  exports: [CareNavigationService],
})
export class CareNavModule {}
