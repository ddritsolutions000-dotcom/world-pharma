import { PaymentRefundListenerService } from './payment-refund.listener';
import { PaymentService } from './payment.service';
import { EventHandlerRegistry } from '../events/handlers';
import type { EventEnvelope } from '../events/envelope';

describe('PaymentRefundListenerService (unit)', () => {
  it('registers exactly one PAYMENT_REFUND_REQUESTED handler', () => {
    const handlers = new EventHandlerRegistry();
    const registerSpy = jest.spyOn(handlers, 'register');
    const payments = { refundFromEvent: jest.fn().mockResolvedValue(undefined) } as unknown as PaymentService;
    const listener = new PaymentRefundListenerService(handlers, payments);
    listener.onModuleInit();
    expect(registerSpy).toHaveBeenCalledWith('PAYMENT_REFUND_REQUESTED', expect.any(Function));
    expect(handlers.handlersFor('PAYMENT_REFUND_REQUESTED')).toHaveLength(1);
  });

  it('delegates handle to PaymentService.refundFromEvent', async () => {
    const handlers = new EventHandlerRegistry();
    const payments = { refundFromEvent: jest.fn().mockResolvedValue(undefined) } as unknown as PaymentService;
    const listener = new PaymentRefundListenerService(handlers, payments);
    const envelope = {
      eventId: 'evt-1',
      eventName: 'PAYMENT_REFUND_REQUESTED',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: 'PaymentIntent',
      aggregateId: 'pi-1',
      producer: 'order',
      countryId: 'c1',
      correlationId: null,
      causationId: null,
      actorId: 'p1',
      payload: { order_id: 'o1', payment_intent_id: 'pi-1' },
      metadata: {},
    } satisfies EventEnvelope;
    await listener.handle(envelope);
    expect(payments.refundFromEvent).toHaveBeenCalledWith(envelope);
  });
});
