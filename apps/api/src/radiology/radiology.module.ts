import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { CatalogModule } from '../catalog/catalog.module';
import { CrmModule } from '../crm/crm.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PartnerModule } from '../partner/partner.module';
import { PaymentModule } from '../payment/payment.module';
import { PolicyModule } from '../policy/policy.module';
import { FinanceModule } from '../finance/finance.module';
import { AdminRadiologyController } from './admin-radiology.controller';
import { CustomerImagingBookingController } from './customer-imaging-booking.controller';
import { ImagingBookingsController } from './imaging-bookings.controller';
import { ImagingBookingService } from './imaging-booking.service';
import { ImagingOperationsController } from './imaging-operations.controller';
import { ImagingPhysicalReportService } from './imaging-physical-report.service';
import { InterpretationService } from './interpretation.service';
import { RadiologistController } from './radiologist.controller';
import { RadiologyCapabilitiesController } from './radiology-capabilities.controller';
import { RadiologyCapabilityService } from './radiology-capability.service';
import { ImagingStudyService } from './imaging-study.service';
import { RadiologyStudiesController } from './radiology-studies.controller';
import { RadiologyCatalogController } from './radiology-catalog.controller';
import { RadiologyProfileController } from './radiology-profile.controller';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [IdentityModule, PolicyModule, CatalogModule, EventsModule, PartnerModule, FinanceModule, CrmModule, forwardRef(() => PaymentModule), forwardRef(() => HealthModule)],
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
    InterpretationService,
    ImagingPhysicalReportService,
  ],
  exports: [RadiologyCapabilityService, ImagingBookingService, ImagingStudyService, InterpretationService, ImagingPhysicalReportService],
})
export class RadiologyModule {}
