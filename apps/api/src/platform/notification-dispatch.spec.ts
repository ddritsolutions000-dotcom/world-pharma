import { NotificationDispatchService } from './notification-dispatch.service';
import type { NotificationService } from './notification.service';
import type { EventHandlerRegistry } from '../events/handlers';
import type { EventEnvelope } from '../events/envelope';

function env(partial: Partial<EventEnvelope> & Pick<EventEnvelope, 'eventName' | 'aggregateId'>): EventEnvelope {
  return {
    eventId: 'evt-1',
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    aggregateType: 'Test',
    producer: 'test',
    countryId: null,
    correlationId: null,
    causationId: null,
    actorId: null,
    payload: {},
    metadata: {},
    ...partial,
  };
}

describe('NotificationDispatchService settlement recipients', () => {
  it('delivers settlement notifications to person_ids in payload', async () => {
    const enqueueInbox = jest.fn().mockResolvedValue({ created: true, id: 'n1' });
    const getPreferences = jest.fn().mockResolvedValue({
      email_enabled: true,
      push_enabled: false,
      sms_enabled: false,
      order_updates: true,
      appointment_updates: true,
      delivery_updates: true,
      settlement_updates: true,
      support_updates: true,
      marketing: false,
    });
    const notifications = { enqueueInbox, getPreferences } as unknown as NotificationService;
    const handlers = { register: jest.fn() } as unknown as EventHandlerRegistry;
    const metrics = { increment: jest.fn() } as never;
    const service = new NotificationDispatchService(notifications, handlers, metrics);

    await service.handleDomainEvent(
      env({
        eventName: 'SETTLEMENT_CREATED',
        aggregateId: 'batch-1',
        aggregateType: 'SettlementBatch',
        producer: 'finance',
        payload: {
          person_ids: ['person-vendor-1', 'person-vendor-2'],
          settlement_line_id: 'line-1',
          sandbox: true,
        },
      }),
    );

    expect(enqueueInbox).toHaveBeenCalledTimes(2);
    expect(enqueueInbox).toHaveBeenCalledWith(
      'person-vendor-1',
      expect.objectContaining({
        title: 'Settlement statement ready',
        reference_type: 'settlement_line',
        reference_id: 'line-1',
        event_type: 'SETTLEMENT_CREATED',
      }),
      expect.objectContaining({
        occurrenceKey: 'notif:SETTLEMENT_CREATED:batch-1:person-vendor-1',
        recipientCategory: 'vendor',
      }),
    );
  });

  it('skips settlement delivery when settlement_updates pref is off', async () => {
    const enqueueInbox = jest.fn().mockResolvedValue({ created: true, id: 'n1' });
    const getPreferences = jest.fn().mockResolvedValue({
      email_enabled: true,
      push_enabled: false,
      sms_enabled: false,
      order_updates: true,
      appointment_updates: true,
      delivery_updates: true,
      settlement_updates: false,
      support_updates: true,
      marketing: false,
    });
    const notifications = { enqueueInbox, getPreferences } as unknown as NotificationService;
    const handlers = { register: jest.fn() } as unknown as EventHandlerRegistry;
    const metrics = { increment: jest.fn() } as never;
    const service = new NotificationDispatchService(notifications, handlers, metrics);

    await service.handleDomainEvent(
      env({
        eventName: 'PAYOUT_PAID',
        aggregateId: 'payout-1',
        aggregateType: 'Payout',
        producer: 'finance',
        payload: { person_ids: ['person-vendor-1'], sandbox: true },
      }),
    );

    expect(enqueueInbox).not.toHaveBeenCalled();
  });
});
