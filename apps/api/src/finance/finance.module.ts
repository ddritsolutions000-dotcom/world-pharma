import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { PolicyModule } from '../policy/policy.module';
import { FinanceAdminController } from './admin.controller';
import { FinanceService } from './finance.service';
import { MockPayoutAdapter } from './mock-payout.adapter';
import { MockSettlementImportAdapter } from './mock-settlement-import.adapter';
import { PayoutPort } from './payout.port';
import { RazorpayXPayoutAdapter } from './razorpayx-payout.adapter';
import { ReconBreakService } from './recon-break.service';
import { SettlementImportListenerService } from './settlement-import.listener';
import { SettlementImportScheduleService } from './settlement-import-schedule.service';
import { SettlementImportWorkerService } from './settlement-import-worker.service';
import { SettlementImportRegistry } from './settlement-import.registry';
import { SettlementImportService } from './settlement-import.service';
import { FinanceVendorController, FinanceVendorSettlementsController } from './vendor.controller';
import { PartnerWalletController } from './partner-wallet.controller';
import { PartnerWalletService } from './partner-wallet.service';
import { PartnerPayoutConfirmService } from './partner-payout-confirm.service';
import { PartnerPayoutWebhookController } from './partner-payout-webhook.controller';
import { PartnerWithdrawAdminService } from './partner-withdraw-admin.service';

@Module({
  imports: [IdentityModule, EventsModule, PolicyModule],
  controllers: [
    FinanceAdminController,
    FinanceVendorController,
    FinanceVendorSettlementsController,
    PartnerWalletController,
    PartnerPayoutWebhookController,
  ],
  providers: [
    PrismaService,
    FinanceService,
    PartnerWalletService,
    PartnerWithdrawAdminService,
    PartnerPayoutConfirmService,
    MockPayoutAdapter,
    RazorpayXPayoutAdapter,
    {
      provide: PayoutPort,
      useFactory: (mock: MockPayoutAdapter, razorpayx: RazorpayXPayoutAdapter) => {
        const { isLivePartnerPayoutReady, readPartnerPayoutProvider } = require('./payout.config') as typeof import('./payout.config');
        // Bind live adapter only when all live gates are clear — otherwise keep Mock for sandbox withdraws.
        if (readPartnerPayoutProvider() === 'RAZORPAYX' && isLivePartnerPayoutReady()) {
          return razorpayx;
        }
        return mock;
      },
      inject: [MockPayoutAdapter, RazorpayXPayoutAdapter],
    },
    MockSettlementImportAdapter,
    SettlementImportRegistry,
    SettlementImportService,
    SettlementImportListenerService,
    SettlementImportWorkerService,
    SettlementImportScheduleService,
    ReconBreakService,
  ],
  exports: [
    FinanceService,
    PartnerWalletService,
    PartnerWithdrawAdminService,
    PartnerPayoutConfirmService,
    SettlementImportService,
    ReconBreakService,
    SettlementImportWorkerService,
    SettlementImportScheduleService,
    PayoutPort,
  ],
})
export class FinanceModule {}
