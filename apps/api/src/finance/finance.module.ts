import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { FinanceAdminController } from './admin.controller';
import { FinanceService } from './finance.service';
import { MockPayoutAdapter } from './mock-payout.adapter';
import { MockSettlementImportAdapter } from './mock-settlement-import.adapter';
import { PayoutPort } from './payout.port';
import { ReconBreakService } from './recon-break.service';
import { SettlementImportListenerService } from './settlement-import.listener';
import { SettlementImportScheduleService } from './settlement-import-schedule.service';
import { SettlementImportWorkerService } from './settlement-import-worker.service';
import { SettlementImportRegistry } from './settlement-import.registry';
import { SettlementImportService } from './settlement-import.service';
import { FinanceVendorController } from './vendor.controller';

@Module({
  imports: [IdentityModule, EventsModule],
  controllers: [FinanceAdminController, FinanceVendorController],
  providers: [
    PrismaService,
    FinanceService,
    MockPayoutAdapter,
    { provide: PayoutPort, useExisting: MockPayoutAdapter },
    MockSettlementImportAdapter,
    SettlementImportRegistry,
    SettlementImportService,
    SettlementImportListenerService,
    SettlementImportWorkerService,
    SettlementImportScheduleService,
    ReconBreakService,
  ],
  exports: [FinanceService, SettlementImportService, ReconBreakService, SettlementImportWorkerService, SettlementImportScheduleService],
})
export class FinanceModule {}
