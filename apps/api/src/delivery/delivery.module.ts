import { forwardRef, Inject, Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { LabModule } from '../lab/lab.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { RadiologyModule } from '../radiology/radiology.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryAdminController } from './delivery-admin.controller';
import { DeliverySupportController } from './delivery-support.controller';
import { DeliveryService } from './delivery.service';
import { PlatformModule } from '../platform/platform.module';

@Module({
  imports: [
    IdentityModule,
    LogisticsModule,
    PlatformModule,
    forwardRef(() => LabModule),
    forwardRef(() => RadiologyModule),
  ],
  controllers: [DeliveryController, DeliveryAdminController, DeliverySupportController],
  providers: [PrismaService, DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
