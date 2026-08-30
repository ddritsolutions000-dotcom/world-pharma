import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { ClinicalModule } from '../clinical/clinical.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { LabModule } from '../lab/lab.module';
import { PartnerModule } from '../partner/partner.module';
import { PolicyModule } from '../policy/policy.module';
import { RadiologyModule } from '../radiology/radiology.module';
import { AdminHealthController } from './admin-health.controller';
import { AdminHealthService } from './admin-health.service';
import { BreakGlassBridgeService } from './break-glass-bridge.service';
import { HealthAccessService, HealthArtifactService } from './health-artifact.service';
import { HealthController } from './health.controller';
import { HealthDoctorController } from './health-doctor.controller';
import { HealthPrescriptionProjectionService } from './health-prescription-projection.service';
import { HealthConsultProjectionService } from './health-consult-projection.service';
import { HealthTimelineService } from './health-timeline.service';
import { HealthUploadService } from './health-upload.service';

@Module({
  imports: [
    IdentityModule,
    PolicyModule,
    EventsModule,
    PartnerModule,
    forwardRef(() => ClinicalModule),
    forwardRef(() => LabModule),
    forwardRef(() => RadiologyModule),
  ],
  controllers: [HealthController, HealthDoctorController, AdminHealthController],
  providers: [
    PrismaService,
    HealthTimelineService,
    HealthAccessService,
    HealthArtifactService,
    HealthUploadService,
    HealthPrescriptionProjectionService,
    HealthConsultProjectionService,
    BreakGlassBridgeService,
    AdminHealthService,
  ],
  exports: [
    HealthTimelineService,
    HealthAccessService,
    HealthArtifactService,
    HealthUploadService,
    HealthPrescriptionProjectionService,
    HealthConsultProjectionService,
    BreakGlassBridgeService,
  ],
})
export class HealthModule {}
