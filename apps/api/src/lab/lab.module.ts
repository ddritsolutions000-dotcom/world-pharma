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
import { AdminLabsController } from './admin-labs.controller';
import { CustomerLabBookingController } from './customer-lab-booking.controller';
import { LabBookingsController } from './lab-bookings.controller';
import { LabAdminService } from './lab-admin.service';
import { LabBookingService } from './lab-booking.service';
import { LabCapabilitiesController } from './lab-capabilities.controller';
import { LabCapabilityService } from './lab-capability.service';
import { LabCatalogController } from './lab-catalog.controller';
import { LabCollectionController } from './lab-collection.controller';
import { LabDiagnosticsOpsService } from './lab-diagnostics-ops.service';
import { LabOperationsController } from './lab-operations.controller';
import { LabEarningsController } from './lab-earnings.controller';
import { LabEarningsService } from './lab-earnings.service';
import { LabProfileController } from './lab-profile.controller';
import { LabWorkforceController } from './lab-workforce.controller';
import { LabWorkforceService } from './lab-workforce.service';
import { PathologistController } from './pathologist.controller';
import { PathologyService } from './pathology.service';
import { PhysicalReportService } from './physical-report.service';
import { PhlebotomistController } from './phlebotomist.controller';
import { SampleCollectionService } from './sample-collection.service';
import { PartnerModule } from '../partner/partner.module';
import { HealthcareModule } from '../healthcare/healthcare.module';
import { CrmModule } from '../crm/crm.module';
import { HealthModule } from '../health/health.module';

@Module({
  imports: [IdentityModule, PolicyModule, CatalogModule, EventsModule, PartnerModule, HealthcareModule, FinanceModule, CrmModule, forwardRef(() => PaymentModule), forwardRef(() => HealthModule)],
  controllers: [
    LabProfileController,
    LabEarningsController,
    LabWorkforceController,
    LabCapabilitiesController,
    LabCatalogController,
    AdminLabController,
    AdminLabsController,
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
    LabEarningsService,
    LabWorkforceService,
    LabAdminService,
    LabBookingService,
    SampleCollectionService,
    LabDiagnosticsOpsService,
    PathologyService,
    PhysicalReportService,
  ],
  exports: [LabCapabilityService, LabBookingService, SampleCollectionService, LabDiagnosticsOpsService, PathologyService, PhysicalReportService],
})
export class LabModule {}
