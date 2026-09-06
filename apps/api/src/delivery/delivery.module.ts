import { forwardRef, Inject, Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { LabModule } from '../lab/lab.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { PartnerModule } from '../partner/partner.module';
import { RadiologyModule } from '../radiology/radiology.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryAdminController } from './delivery-admin.controller';
import { DeliverySupportController } from './delivery-support.controller';
import { DeliveryEvidenceService } from './delivery-evidence.service';
import { DeliveryService } from './delivery.service';
import { PlatformModule } from '../platform/platform.module';

@Module({
  imports: [
    IdentityModule,
    PartnerModule,
    forwardRef(() => LogisticsModule),
    PlatformModule,
    forwardRef(() => LabModule),
    forwardRef(() => RadiologyModule),
  ],
  controllers: [DeliveryController, DeliveryAdminController, DeliverySupportController],
  providers: [PrismaService, DeliveryService, DeliveryEvidenceService],
  exports: [DeliveryService, DeliveryEvidenceService],
})
export class DeliveryModule {}
