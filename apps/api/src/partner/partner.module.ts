import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { CatalogModule } from '../catalog/catalog.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PolicyModule } from '../policy/policy.module';
import { PlatformModule } from '../platform/platform.module';
import { PartnerAdminController } from './admin.controller';
import { JoinController } from './join.controller';
import { JoinSupportController } from './join-support.controller';
import { VendorOnboardingController } from './vendor-onboarding.controller';
import { VendorTeamController } from './vendor-team.controller';
import { VendorTeamService } from './vendor-team.service';
import { InvitationService } from './invitation.service';
import { KycService } from './kyc.service';
import {
  AllowAllMalwareScanner,
  DeterministicSandboxMalwareScanner,
  GatedMalwareScanner,
  GatedPrivateObjectStore,
  LocalPrivateObjectStore,
  MalwareScanner,
  PrivateObjectStore,
} from './object-store';
import { OrganizationService } from './organization.service';
import { PartnerService } from './partner.service';
import { VendorActivationReadinessService } from './vendor-activation-readiness.service';
import { PharmacyLicenceService } from './pharmacy-licence.service';
import { PartnerCommercialApprovalService } from './partner-commercial-approval.service';
import { PartnerOperationsService } from './partner-operations.service';
import { PharmacyOnboardingController, VendorPharmacyReadinessController } from './pharmacy-onboarding.controller';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule, PlatformModule, CatalogModule, InventoryModule],
  controllers: [
    PartnerAdminController,
    JoinController,
    JoinSupportController,
    VendorOnboardingController,
    VendorTeamController,
    PharmacyOnboardingController,
    VendorPharmacyReadinessController,
  ],
  providers: [
    PrismaService,
    PartnerService,
    KycService,
    OrganizationService,
    InvitationService,
    VendorTeamService,
    VendorActivationReadinessService,
    PharmacyLicenceService,
    PartnerCommercialApprovalService,
    PartnerOperationsService,
    { provide: PrivateObjectStore, useFactory: () => new GatedPrivateObjectStore(new LocalPrivateObjectStore()) },
    {
      provide: MalwareScanner,
      useFactory: () => {
        const inner =
          process.env['MALWARE_SCANNER'] === 'sandbox-deterministic'
            ? new DeterministicSandboxMalwareScanner()
            : new AllowAllMalwareScanner();
        return new GatedMalwareScanner(inner);
      },
    },
  ],
  exports: [
    PartnerService,
    KycService,
    OrganizationService,
    InvitationService,
    VendorActivationReadinessService,
    PharmacyLicenceService,
    PartnerCommercialApprovalService,
    PartnerOperationsService,
    PrivateObjectStore,
    MalwareScanner,
  ],
})
export class PartnerModule {}
