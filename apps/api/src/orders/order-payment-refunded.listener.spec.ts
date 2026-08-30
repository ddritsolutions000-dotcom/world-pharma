import { OrderPaymentRefundedListenerService } from './order-payment-refunded.listener';
import { OrderService } from './order.service';
import { EventHandlerRegistry } from '../events/handlers';
import type { EventEnvelope } from '../events/envelope';

describe('OrderPaymentRefundedListenerService (unit)', () => {
  it('registers exactly one PAYMENT_REFUNDED handler', () => {
    const handlers = new EventHandlerRegistry();
    const registerSpy = jest.spyOn(handlers, 'register');
    const orders = {
      syncRefundStatusFromPaymentEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderService;
    const listener = new OrderPaymentRefundedListenerService(handlers, orders);
    listener.onModuleInit();
    expect(registerSpy).toHaveBeenCalledWith('PAYMENT_REFUNDED', expect.any(Function));
    expect(handlers.handlersFor('PAYMENT_REFUNDED')).toHaveLength(1);
  });

  it('delegates handle to OrderService.syncRefundStatusFromPaymentEvent', async () => {
    const handlers = new EventHandlerRegistry();
    const orders = {
      syncRefundStatusFromPaymentEvent: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrderService;
    const listener = new OrderPaymentRefundedListenerService(handlers, orders);
    const envelope = {
      eventId: 'evt-1',
      eventName: 'PAYMENT_REFUNDED',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: 'PaymentIntent',
      aggregateId: 'pi-1',
      producer: 'payment',
      countryId: 'c1',
      correlationId: null,
      causationId: null,
      actorId: 'p1',
      payload: { amount_minor: '100', currency: 'XXX', sandbox: true },
      metadata: {},
    } satisfies EventEnvelope;
    await listener.handle(envelope);
    expect(orders.syncRefundStatusFromPaymentEvent).toHaveBeenCalledWith(envelope);
  });
});
