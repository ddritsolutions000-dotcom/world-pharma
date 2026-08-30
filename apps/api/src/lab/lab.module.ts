import { forwardRef, Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { CatalogModule } from '../catalog/catalog.module';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PaymentModule } from '../payment/payment.module';
import { PolicyModule } from '../policy/policy.module';
import { FinanceModule } from '../finance/finance.module';
import { AdminLabController } from './admin-lab.controller';
import { CustomerLabBookingController } from './customer-lab-booking.controller';
import { LabBookingsController } from './lab-bookings.controller';
import { LabBookingService } from './lab-booking.service';
import { LabCapabilitiesController } from './lab-capabilities.controller';
import { LabCapabilityService } from './lab-capability.service';
import { LabCatalogController } from './lab-catalog.controller';
import { LabCollectionController } from './lab-collection.controller';
import { LabDiagnosticsOpsService } from './lab-diagnostics-ops.service';
import { LabOperationsController } from './lab-operations.controller';
import { LabProfileController } from './lab-profile.controller';
import { PathologistController } from './pathologist.controller';
import { PathologyService } from './pathology.service';
import { PhysicalReportService } from './physical-report.service';
import { PhlebotomistController } from './phlebotomist.controller';
import { SampleCollectionService } from './sample-collection.service';
import { PartnerModule } from '../partner/partner.module';
import { CrmModule } from '../crm/crm.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [IdentityModule, PolicyModule, CatalogModule, EventsModule, PartnerModule, FinanceModule, CrmModule, forwardRef(() => PaymentModule), forwardRef(() => HealthModule)],
  controllers: [
    LabProfileController,
    LabCapabilitiesController,
    LabCatalogController,
    AdminLabController,
    CustomerLabBookingController,
    LabBookingsController,
    LabCollectionController,
    LabOperationsController,
    PathologistController,
    PhlebotomistController,
  ],
  providers: [
    PrismaService,
    RedisService,
    LabCapabilityService,
    LabBookingService,
    SampleCollectionService,
    LabDiagnosticsOpsService,
    PathologyService,
    PhysicalReportService,
  ],
  exports: [LabCapabilityService, LabBookingService, SampleCollectionService, LabDiagnosticsOpsService, PathologyService, PhysicalReportService],
})
export class LabModule {}
