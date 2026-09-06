import { Module } from '@nestjs/common';
import { PaymentGatewayRegistry } from './gateway.registry';
import { MockPaymentGatewayAdapter } from './mock.adapter';

/** Leaf module so policy (and payments) can read registered adapter codes without a Policy↔Payment cycle. */
@Module({
  providers: [MockPaymentGatewayAdapter, PaymentGatewayRegistry],
  exports: [MockPaymentGatewayAdapter, PaymentGatewayRegistry],
})
export class PaymentGatewayRegistryModule {}
