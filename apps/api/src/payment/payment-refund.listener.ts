import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '../events/envelope';
import { EventHandlerRegistry } from '../events/handlers';
import { PaymentService } from './payment.service';

/** Consumes PAYMENT_REFUND_REQUESTED and executes payment refunds via PaymentService. */
@Injectable()
export class PaymentRefundListenerService implements OnModuleInit {
  private readonly logger = new Logger(PaymentRefundListenerService.name);

  constructor(
    private readonly handlers: EventHandlerRegistry,
    private readonly payments: PaymentService,
  ) {}

  onModuleInit(): void {
    this.handlers.register('PAYMENT_REFUND_REQUESTED', (envelope) => this.handle(envelope));
    this.logger.log(JSON.stringify({ event: 'payment_refund_listener_registered' }));
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    await this.payments.refundFromEvent(envelope);
  }
}
