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
import { AllowlistRiskAdapter } from './allowlist.risk';
import { PaymentGatewayRegistry } from './gateway.registry';
import { MockPaymentGatewayAdapter } from './mock.adapter';
import { PaymentController } from './payment.controller';
import { PaymentRefundListenerService } from './payment-refund.listener';
import { PaymentService } from './payment.service';
import { PaymentRouter } from './router';
import { RiskPort } from './risk.port';
import { SandboxWebhookAdapter } from './sandbox.webhook.adapter';
import { PaymentWebhookRegistry } from './webhook.registry';
import { PaymentWebhookController } from './webhook.controller';

@Module({
  imports: [IdentityModule, PolicyModule, EventsModule, InventoryModule, OrderModule, FinanceModule, forwardRef(() => LabModule), forwardRef(() => RadiologyModule)],
  controllers: [PaymentController, PaymentAdminController, PaymentWebhookController],
  providers: [
    PrismaService,
    RedisService,
    PaymentService,
    PaymentRefundListenerService,
    PaymentRouter,
    PaymentGatewayRegistry,
    PaymentWebhookRegistry,
    MockPaymentGatewayAdapter,
    SandboxWebhookAdapter,
    AllowlistRiskAdapter,
    { provide: RiskPort, useExisting: AllowlistRiskAdapter },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
