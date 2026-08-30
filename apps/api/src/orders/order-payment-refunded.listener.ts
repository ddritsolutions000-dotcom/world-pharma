import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '../events/envelope';
import { EventHandlerRegistry } from '../events/handlers';
import { OrderService } from './order.service';

/** Consumes PAYMENT_REFUNDED and syncs linked order refund status. */
@Injectable()
export class OrderPaymentRefundedListenerService implements OnModuleInit {
  private readonly logger = new Logger(OrderPaymentRefundedListenerService.name);

  constructor(
    private readonly handlers: EventHandlerRegistry,
    private readonly orders: OrderService,
  ) {}

  onModuleInit(): void {
    this.handlers.register('PAYMENT_REFUNDED', (envelope) => this.handle(envelope));
    this.logger.log(JSON.stringify({ event: 'order_payment_refunded_listener_registered' }));
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    await this.orders.syncRefundStatusFromPaymentEvent(envelope);
  }
}
