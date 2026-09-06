import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { CatalogModule } from '../catalog/catalog.module';
import { EventsModule } from '../events/events.module';
import { CmsModule } from '../cms/cms.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MedicationReminderController } from './medication-reminder.controller';
import { MedicationReminderService } from './medication-reminder.service';
import { MedicationReminderEnhancementController } from './medication-reminder-enhancement.controller';
import { MedicationReminderEnhancementService } from './medication-reminder-enhancement.service';

@Module({
  imports: [IdentityModule, EventsModule, CmsModule, CatalogModule, InventoryModule],
  controllers: [MedicationReminderController, MedicationReminderEnhancementController],
  providers: [MedicationReminderService, MedicationReminderEnhancementService, PrismaService],
  exports: [MedicationReminderService, MedicationReminderEnhancementService],
})
export class MedicationReminderModule {}
