import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { CarePlanModule } from '../care-plan/care-plan.module';
import { ClinicalModule } from '../clinical/clinical.module';
import { MedicationReminderModule } from '../medication-reminder/medication-reminder.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { LabModule } from '../lab/lab.module';
import { OrderModule } from '../orders/order.module';
import { PartnerModule } from '../partner/partner.module';
import { PolicyModule } from '../policy/policy.module';
import { RadiologyModule } from '../radiology/radiology.module';
import { AdminHealthController } from './admin-health.controller';
import { AdminHealthService } from './admin-health.service';
import { BreakGlassBridgeService } from './break-glass-bridge.service';
import { HealthAccessService, HealthArtifactService } from './health-artifact.service';
import { HealthController } from './health.controller';
import { HealthDashboardService } from './health-dashboard.service';
import { HealthProfileController } from './health-profile.controller';
import { HealthProfileService } from './health-profile.service';
import { HealthSubjectService } from './health-subject.service';
import { SubjectHealthRecordsService } from './subject-health-records.service';
import { HealthInsightsService } from './health-insights.service';
import { HealthDoctorController } from './health-doctor.controller';
import { HealthPrescriptionProjectionService } from './health-prescription-projection.service';
import { HealthConsultProjectionService } from './health-consult-projection.service';
import { HealthDiagnosticProjectionService } from './health-diagnostic-projection.service';
import { HealthTimelineService } from './health-timeline.service';
import { HealthUploadService } from './health-upload.service';

@Module({
  imports: [
    IdentityModule,
    PolicyModule,
    EventsModule,
    PartnerModule,
    OrderModule,
    forwardRef(() => ClinicalModule),
    forwardRef(() => LabModule),
    forwardRef(() => RadiologyModule),
    CarePlanModule,
    MedicationReminderModule,
  ],
  controllers: [HealthController, HealthProfileController, HealthDoctorController, AdminHealthController],
  providers: [
    PrismaService,
    HealthTimelineService,
    HealthDashboardService,
    HealthInsightsService,
    HealthSubjectService,
    HealthProfileService,
    SubjectHealthRecordsService,
    HealthAccessService,
    HealthArtifactService,
    HealthUploadService,
    HealthPrescriptionProjectionService,
    HealthConsultProjectionService,
    HealthDiagnosticProjectionService,
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
    HealthDiagnosticProjectionService,
    BreakGlassBridgeService,
    HealthSubjectService,
    SubjectHealthRecordsService,
    HealthProfileService,
  ],
})
export class HealthModule {}
