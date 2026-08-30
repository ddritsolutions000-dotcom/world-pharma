import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '../../events/envelope';
import { EventHandlerRegistry } from '../../events/handlers';
import { AbandonedCartRecoveryService } from './abandoned-cart-recovery.service';
import { CRM_CART_ABANDON_RECOVERY_EVENT } from './cart-abandon-recovery.config';

@Injectable()
export class CartAbandonRecoveryDispatchService implements OnModuleInit {
  private readonly logger = new Logger(CartAbandonRecoveryDispatchService.name);

  constructor(
    private readonly handlers: EventHandlerRegistry,
    private readonly recovery: AbandonedCartRecoveryService,
  ) {}

  onModuleInit(): void {
    this.handlers.register(CRM_CART_ABANDON_RECOVERY_EVENT, async (envelope) =>
      this.handleRecoveryEvent(envelope),
    );
  }

  private async handleRecoveryEvent(envelope: EventEnvelope): Promise<void> {
    const checkoutSessionId =
      typeof envelope.payload.checkout_session_id === 'string'
        ? envelope.payload.checkout_session_id.trim()
        : envelope.aggregateId;
    const customerPersonId =
      typeof envelope.payload.customer_person_id === 'string'
        ? envelope.payload.customer_person_id.trim()
        : '';
    const countryCode =
      typeof envelope.payload.country_code === 'string'
        ? envelope.payload.country_code.trim().toUpperCase()
        : '';
    const countryId = envelope.countryId ?? '';

    if (!checkoutSessionId || !customerPersonId || !countryCode || !countryId) {
      this.logger.warn(
        JSON.stringify({
          event: 'cart_abandon_recovery_invalid_payload',
          event_id: envelope.eventId,
        }),
      );
      return;
    }

    const cartId =
      typeof envelope.payload.cart_id === 'string' ? envelope.payload.cart_id.trim() : null;

    const outcome = await this.recovery.attemptRecovery({
      countryCode,
      countryId,
      checkoutSessionId,
      customerPersonId,
      cartId,
    });

    this.logger.log(
      JSON.stringify({
        event: 'cart_abandon_recovery_processed',
        event_id: envelope.eventId,
        checkout_session_id: checkoutSessionId,
        status: outcome.status,
        skip_reason: outcome.skip_reason ?? null,
      }),
    );
  }
}
