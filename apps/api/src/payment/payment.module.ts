import { forwardRef, Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { InventoryModule } from '../inventory/inventory.module';
import { LabModule } from '../lab/lab.module';
import { OrderModule } from '../orders/order.module';
import { FinanceModule } from '../finance/finance.module';
import { PolicyModule } from '../policy/policy.module';
import { RadiologyModule } from '../radiology/radiology.module';
import { PaymentAdminController } from './admin.controller';
import { ProviderConfigAdminController } from './provider-config.admin.controller';
import { ProviderConfigService } from './provider-config.service';
import { R14AGateAdminController } from './r14a-gate.admin.controller';
import { R14AGateService } from './r14a-gate.service';
import { AllowlistRiskAdapter } from './allowlist.risk';
import { PaymentGatewayRegistryModule } from './gateway-registry.module';
import { PaymentController } from './payment.controller';
import { PaymentRefundListenerService } from './payment-refund.listener';
import { PaymentService } from './payment.service';
import { PaymentRouter } from './router';
import { RiskPort } from './risk.port';
import { SandboxWebhookAdapter } from './sandbox.webhook.adapter';
import { PaymentWebhookRegistry } from './webhook.registry';
import { PaymentWebhookController } from './webhook.controller';

@Module({
  imports: [
    IdentityModule,
    PolicyModule,
    PaymentGatewayRegistryModule,
    EventsModule,
    InventoryModule,
    OrderModule,
    FinanceModule,
    forwardRef(() => LabModule),
    forwardRef(() => RadiologyModule),
  ],
  controllers: [
    PaymentController,
    R14AGateAdminController,
    ProviderConfigAdminController,
    PaymentAdminController,
    PaymentWebhookController,
  ],
  providers: [
    PrismaService,
    RedisService,
    PaymentService,
    R14AGateService,
    ProviderConfigService,
    PaymentRefundListenerService,
    PaymentRouter,
    PaymentWebhookRegistry,
    SandboxWebhookAdapter,
    AllowlistRiskAdapter,
    { provide: RiskPort, useExisting: AllowlistRiskAdapter },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
