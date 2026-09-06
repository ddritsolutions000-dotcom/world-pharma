import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { CatalogModule } from '../catalog/catalog.module';
import { CrmModule } from '../crm/crm.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PartnerModule } from '../partner/partner.module';
import { HealthcareModule } from '../healthcare/healthcare.module';
import { PaymentModule } from '../payment/payment.module';
import { PolicyModule } from '../policy/policy.module';
import { FinanceModule } from '../finance/finance.module';
import { AdminRadiologyController } from './admin-radiology.controller';
import { CustomerImagingBookingController } from './customer-imaging-booking.controller';
import { ImagingBookingsController } from './imaging-bookings.controller';
import { ImagingBookingService } from './imaging-booking.service';
import { ImagingOperationsController } from './imaging-operations.controller';
import { ImagingPhysicalReportService } from './imaging-physical-report.service';
import { ImagingIngestService } from './imaging-ingest.service';
import { InterpretationService } from './interpretation.service';
import { RadiologistController } from './radiologist.controller';
import { RadiologyCapabilitiesController } from './radiology-capabilities.controller';
import { RadiologyCapabilityService } from './radiology-capability.service';
import { ImagingStudyService } from './imaging-study.service';
import { RadiologyStudiesController } from './radiology-studies.controller';
import { RadiologyCatalogController } from './radiology-catalog.controller';
import { RadiologyProfileController } from './radiology-profile.controller';
import { ImagingAdminOperationsService } from './imaging-admin-operations.service';
import { ImagingDiagnosticViewerService } from './imaging-diagnostic-viewer.service';
import { SandboxPacsAdapter } from './sandbox-pacs.adapter';
import { PACS_ADAPTER } from './pacs.port';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [IdentityModule, PolicyModule, CatalogModule, EventsModule, PartnerModule, HealthcareModule, FinanceModule, CrmModule, forwardRef(() => PaymentModule), forwardRef(() => HealthModule)],
  controllers: [
    RadiologyProfileController,
    RadiologyCapabilitiesController,
    RadiologyCatalogController,
    AdminRadiologyController,
    CustomerImagingBookingController,
    ImagingBookingsController,
    RadiologyStudiesController,
    RadiologistController,
    ImagingOperationsController,
  ],
  providers: [
    PrismaService,
    RedisService,
    RadiologyCapabilityService,
    ImagingBookingService,
    ImagingStudyService,
    ImagingIngestService,
    InterpretationService,
    ImagingPhysicalReportService,
    ImagingAdminOperationsService,
    ImagingDiagnosticViewerService,
    SandboxPacsAdapter,
    { provide: PACS_ADAPTER, useExisting: SandboxPacsAdapter },
  ],
  exports: [RadiologyCapabilityService, ImagingBookingService, ImagingStudyService, ImagingIngestService, InterpretationService, ImagingPhysicalReportService, ImagingAdminOperationsService, ImagingDiagnosticViewerService],
})
export class RadiologyModule {}
