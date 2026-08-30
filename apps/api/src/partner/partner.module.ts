import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { PlatformModule } from '../platform/platform.module';
import { PartnerAdminController } from './admin.controller';
import { JoinController } from './join.controller';
import { JoinSupportController } from './join-support.controller';
import { InvitationService } from './invitation.service';
import { KycService } from './kyc.service';
import {
  AllowAllMalwareScanner,
  LocalPrivateObjectStore,
  MalwareScanner,
  PrivateObjectStore,
} from './object-store';
import { OrganizationService } from './organization.service';
import { PartnerService } from './partner.service';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule, PlatformModule],
  controllers: [PartnerAdminController, JoinController, JoinSupportController],
  providers: [
    PrismaService,
    PartnerService,
    KycService,
    OrganizationService,
    InvitationService,
    { provide: PrivateObjectStore, useClass: LocalPrivateObjectStore },
    { provide: MalwareScanner, useClass: AllowAllMalwareScanner },
  ],
  exports: [PartnerService, KycService, OrganizationService, InvitationService, PrivateObjectStore, MalwareScanner],
})
export class PartnerModule {}
