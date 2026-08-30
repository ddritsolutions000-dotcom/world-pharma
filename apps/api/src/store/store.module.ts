import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { ClinicalModule } from '../clinical/clinical.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderModule } from '../orders/order.module';
import { PlatformModule } from '../platform/platform.module';
import { StoreController } from './store.controller';
import { StoreSupportController } from './store-support.controller';
import { StoreService } from './store.service';

@Module({
  imports: [IdentityModule, InventoryModule, OrderModule, ClinicalModule, PlatformModule],
  controllers: [StoreController, StoreSupportController],
  providers: [PrismaService, StoreService],
  exports: [StoreService],
})
export class StoreModule {}
