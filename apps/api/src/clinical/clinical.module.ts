import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { CartModule } from '../cart/cart.module';
import { CrmModule } from '../crm/crm.module';
import { EventsModule } from '../events/events.module';
import { HealthModule } from '../health/health.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PartnerModule } from '../partner/partner.module';
import { HealthcareModule } from '../healthcare/healthcare.module';
import { PlatformModule } from '../platform/platform.module';
import { PolicyModule } from '../policy/policy.module';
import { AdminAppointmentController } from './admin-appointment.controller';
import { AdminDispensingController } from './admin-dispensing.controller';
import { AdminPrescriptionController } from './admin-prescription.controller';
import { AdminVideoController } from './admin-video.controller';
import { AppointmentService } from './appointment.service';
import { ClinicalSearchController } from './clinical-search.controller';
import { ClinicalSearchService } from './clinical-search.service';
import { ClinicalAccessController } from './clinical-access.controller';
import { ClinicalAccessService } from './clinical-access.service';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';
import { CustomerAppointmentController } from './customer-appointment.controller';
import { PublicCareController } from './public.controller';
import { CustomerPrescriptionController } from './customer-prescription.controller';
import { CustomerRxHandoffController } from './customer-rx-handoff.controller';
import { CustomerRefillController, DoctorRefillController, AdminRefillController } from './refill.controller';
import { RefillService } from './refill.service';
import { DoctorAdminController } from './doctor-admin.controller';
import { DoctorAppointmentController } from './doctor-appointment.controller';
import { DoctorController } from './doctor.controller';
import { DoctorEarningsController } from './doctor-earnings.controller';
import { DoctorEarningsService } from './doctor-earnings.service';
import { DoctorWalletService } from './doctor-wallet.service';
import { DoctorPrescriptionController } from './doctor-prescription.controller';
import { DoctorEncounterPrescriptionController } from './doctor-encounter-prescription.controller';
import { EncounterConsultNoteService } from './encounter-consult-note.service';
import { DoctorService } from './doctor.service';
import { DISPENSING_BOUNDARY } from './dispensing-boundary.port';
import { DispensingService } from './dispensing.service';
import { ErxSubmissionService } from './erx-submission.service';
import { ERX_PORT } from './erx.port';
import { LiveKitVideoProvider } from './livekit-video.provider';
import { MockVideoProvider } from './mock-video.provider';
import { NullERxAdapter } from './null-erx.adapter';
import { SandboxERxAdapter } from './sandbox-erx.adapter';
import { ErxRouter } from './erx-router';
import { PrescriptionService } from './prescription.service';
import { RxFulfillmentSafetyGate } from './rx-fulfillment-safety-gate';
import { RxHandoffService } from './rx-handoff.service';
import { ScheduleService } from './schedule.service';
import { VIDEO_PROVIDER, VideoService } from './video.service';
import { VideoWebhookController } from './video-webhook.controller';

@Module({
  imports: [
    IdentityModule,
    PolicyModule,
    EventsModule,
    PartnerModule,
    HealthcareModule,
    InventoryModule,
    CrmModule,
    forwardRef(() => PlatformModule),
    forwardRef(() => CartModule),
    forwardRef(() => HealthModule),
  ],
  controllers: [
    DoctorController,
    DoctorAdminController,
    ConsentController,
    ClinicalAccessController,
    ClinicalSearchController,
    PublicCareController,
    CustomerAppointmentController,
    DoctorAppointmentController,
    DoctorEarningsController,
    AdminAppointmentController,
    AdminVideoController,
    VideoWebhookController,
    DoctorPrescriptionController,
    DoctorEncounterPrescriptionController,
    CustomerPrescriptionController,
    CustomerRxHandoffController,
    CustomerRefillController,
    DoctorRefillController,
    AdminRefillController,
    AdminPrescriptionController,
    AdminDispensingController,
  ],
  providers: [
    PrismaService,
    DoctorService,
    DoctorEarningsService,
    DoctorWalletService,
    ConsentService,
    ClinicalAccessService,
    ClinicalSearchService,
    ScheduleService,
    AppointmentService,
    EncounterConsultNoteService,
    VideoService,
    MockVideoProvider,
    LiveKitVideoProvider,
    PrescriptionService,
    NullERxAdapter,
    SandboxERxAdapter,
    ErxRouter,
    ErxSubmissionService,
    DispensingService,
    RxHandoffService,
    RefillService,
    RxFulfillmentSafetyGate,
    { provide: ERX_PORT, useExisting: NullERxAdapter },
    { provide: DISPENSING_BOUNDARY, useExisting: DispensingService },
    {
      provide: VIDEO_PROVIDER,
      useFactory: (mock: MockVideoProvider, livekit: LiveKitVideoProvider) => {
        if (process.env.NODE_ENV === 'test') {
          return mock;
        }
        if (process.env.VIDEO_PROVIDER === 'mock') {
          return mock;
        }
        if (process.env.VIDEO_PROVIDER === 'livekit' && livekit.isConfigured()) {
          return livekit;
        }
        if (livekit.isConfigured()) {
          return livekit;
        }
        return mock;
      },
      inject: [MockVideoProvider, LiveKitVideoProvider],
    },
  ],
  exports: [
    DoctorService,
    ConsentService,
    ClinicalAccessService,
    ClinicalSearchService,
    ScheduleService,
    AppointmentService,
    EncounterConsultNoteService,
    PrescriptionService,
    DispensingService,
    RxHandoffService,
    RefillService,
    RxFulfillmentSafetyGate,
  ],
})
export class ClinicalModule {}
