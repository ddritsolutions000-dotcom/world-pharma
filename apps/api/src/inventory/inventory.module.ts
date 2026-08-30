import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { InventoryAdminController } from './admin.controller';
import { InventoryService } from './inventory.service';
import { InventoryTtlService } from './ttl.service';
import { InventoryVendorController } from './vendor.controller';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule],
  controllers: [InventoryAdminController, InventoryVendorController],
  providers: [PrismaService, InventoryService, InventoryTtlService],
  exports: [InventoryService],
})
export class InventoryModule {}
