import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import type { EventEnvelope } from '../events/envelope';
import { EventHandlerRegistry } from '../events/handlers';
import { NotificationService } from './notification.service';

type InboxCategory = 'appointment' | 'video' | 'order' | 'shipment' | 'support';

const TITLE_BY_EVENT: Record<
  string,
  {
    title: string;
    category: InboxCategory;
    pref: keyof Awaited<ReturnType<NotificationService['getPreferences']>>;
  }
> = {
  APPOINTMENT_CREATED: { title: 'Appointment requested', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_CONFIRMED: { title: 'Appointment confirmed', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_RESCHEDULED: { title: 'Appointment rescheduled', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_CANCELLED: { title: 'Appointment cancelled', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_CHECKED_IN: { title: 'Checked in for appointment', category: 'appointment', pref: 'appointment_updates' },
  VIDEO_SESSION_READY: { title: 'Video consult ready', category: 'video', pref: 'appointment_updates' },
  VIDEO_PARTICIPANT_JOINED: { title: 'Participant joined video', category: 'video', pref: 'appointment_updates' },
  VIDEO_SESSION_STARTED: { title: 'Video consult started', category: 'video', pref: 'appointment_updates' },
  VIDEO_SESSION_ENDED: { title: 'Video consult ended', category: 'video', pref: 'appointment_updates' },
  ORDER_CREATED: { title: 'Order placed', category: 'order', pref: 'order_updates' },
  ORDER_CONFIRMED: { title: 'Order confirmed', category: 'order', pref: 'order_updates' },
  ORDER_READY_FOR_SHIPMENT: { title: 'Order ready for shipment', category: 'order', pref: 'order_updates' },
  ORDER_CANCELLED: { title: 'Order cancelled', category: 'order', pref: 'order_updates' },
  SHIPMENT_CREATED: { title: 'Shipment created', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_IN_TRANSIT: { title: 'Shipment in transit', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_OUT_FOR_DELIVERY: { title: 'Out for delivery', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_DELIVERED: { title: 'Shipment delivered', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_FAILED: { title: 'Shipment failed', category: 'shipment', pref: 'delivery_updates' },
  PRESCRIPTION_CREATED: { title: 'Prescription created', category: 'appointment', pref: 'appointment_updates' },
  PRESCRIPTION_ISSUED: { title: 'Prescription issued', category: 'appointment', pref: 'appointment_updates' },
  REFILL_REQUESTED: { title: 'Refill requested', category: 'appointment', pref: 'appointment_updates' },
  REFILL_APPROVED: { title: 'Refill authorized', category: 'appointment', pref: 'appointment_updates' },
  REFILL_REJECTED: { title: 'Refill not authorized', category: 'appointment', pref: 'appointment_updates' },
  PRESCRIPTION_AMENDED: { title: 'Prescription updated', category: 'appointment', pref: 'appointment_updates' },
  PRESCRIPTION_CANCELLED: { title: 'Prescription cancelled', category: 'appointment', pref: 'appointment_updates' },
  SUPPORT_TICKET_CREATED: { title: 'Support ticket received', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_UPDATED: { title: 'Support ticket updated', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_ASSIGNED: { title: 'Support ticket assigned', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_CUSTOMER_REPLY: { title: 'Support reply received', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_AGENT_REPLY: { title: 'Support team replied', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_RESOLVED: { title: 'Support ticket resolved', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_CLOSED: { title: 'Support ticket closed', category: 'support', pref: 'support_updates' },
  LAB_BOOKING_CREATED: { title: 'Lab booking created', category: 'order', pref: 'order_updates' },
  LAB_BOOKING_CONFIRMED: { title: 'Lab booking confirmed', category: 'order', pref: 'order_updates' },
  LAB_BOOKING_CANCELLED: { title: 'Lab booking cancelled', category: 'order', pref: 'order_updates' },
  LAB_BOOKING_PAYMENT_FAILED: { title: 'Lab booking payment failed', category: 'order', pref: 'order_updates' },
  IMAGING_BOOKING_CREATED: { title: 'Imaging booking created', category: 'order', pref: 'order_updates' },
  IMAGING_BOOKING_CONFIRMED: { title: 'Imaging booking confirmed', category: 'order', pref: 'order_updates' },
  IMAGING_BOOKING_CANCELLED: { title: 'Imaging booking cancelled', category: 'order', pref: 'order_updates' },
  IMAGING_BOOKING_PAYMENT_FAILED: { title: 'Imaging booking payment failed', category: 'order', pref: 'order_updates' },
  LAB_SAMPLE_ASSIGNED: { title: 'Lab sample collection scheduled', category: 'order', pref: 'order_updates' },
  LAB_SAMPLE_COLLECTED: { title: 'Lab sample collected', category: 'order', pref: 'order_updates' },
  LAB_SAMPLE_HANDED_OVER: { title: 'Lab sample handed over', category: 'order', pref: 'order_updates' },
  LAB_SAMPLE_TRANSPORT_ENQUEUED: { title: 'Lab sample transport scheduled', category: 'order', pref: 'order_updates' },
  LAB_SAMPLE_COLLECTION_FAILED: { title: 'Lab sample collection issue', category: 'order', pref: 'order_updates' },
  LAB_SAMPLE_COC_UPDATED: { title: 'Lab sample status updated', category: 'order', pref: 'order_updates' },
  LAB_REPORT_PUBLISHED: { title: 'Lab report ready', category: 'order', pref: 'order_updates' },
  LAB_REPORT_AMENDED: { title: 'Lab report updated', category: 'order', pref: 'order_updates' },
  IMAGING_REPORT_PUBLISHED: { title: 'Imaging report ready', category: 'order', pref: 'order_updates' },
  IMAGING_REPORT_AMENDED: { title: 'Imaging report updated', category: 'order', pref: 'order_updates' },
  PHYSICAL_REPORT_REQUESTED: { title: 'Physical report requested', category: 'order', pref: 'order_updates' },
  PHYSICAL_REPORT_ACCEPTED: { title: 'Physical report accepted', category: 'order', pref: 'order_updates' },
  PHYSICAL_REPORT_DISPATCHED: { title: 'Physical report dispatched', category: 'shipment', pref: 'delivery_updates' },
  PHYSICAL_REPORT_DELIVERED: { title: 'Physical report delivered', category: 'shipment', pref: 'delivery_updates' },
  PHYSICAL_REPORT_FAILED: { title: 'Physical report delivery issue', category: 'shipment', pref: 'delivery_updates' },
  PHYSICAL_REPORT_CANCELLED: { title: 'Physical report cancelled', category: 'order', pref: 'order_updates' },
};

@Injectable()
export class NotificationDispatchService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly handlers: EventHandlerRegistry,
  ) {}

  onModuleInit(): void {
    for (const name of Object.keys(TITLE_BY_EVENT)) {
      this.handlers.register(name, async (envelope) => {
        await this.handleDomainEvent(envelope);
      });
    }
    this.logger.log(JSON.stringify({ event: 'notification_handlers_registered', count: Object.keys(TITLE_BY_EVENT).length }));
  }

  async handleDomainEvent(envelope: EventEnvelope): Promise<void> {
    const meta = TITLE_BY_EVENT[envelope.eventName];
    if (!meta) {
      return;
    }
    const recipients = this.resolveRecipients(envelope);
    if (!recipients.length) {
      return;
    }
    for (const personId of recipients) {
      const prefs = await this.notifications.getPreferences(personId);
      if (!prefs[meta.pref]) {
        continue;
      }
      await this.notifications.enqueueInbox(personId, {
        id: uuidv7(),
        channel: 'in_app',
        title: meta.title,
        body: 'Open the app for details. External channels remain disabled in sandbox.',
        read: false,
        created_at: new Date().toISOString(),
        reference_type: meta.category,
        reference_id: envelope.aggregateId,
      });
    }
  }

  private resolveRecipients(envelope: EventEnvelope): string[] {
    const payload = envelope.payload ?? {};
    const ids = new Set<string>();
    const candidates = [
      envelope.actorId,
      typeof payload.customer_person_id === 'string' ? payload.customer_person_id : null,
      typeof payload.patient_person_id === 'string' ? payload.patient_person_id : null,
      typeof payload.person_id === 'string' ? payload.person_id : null,
      typeof payload.buyer_person_id === 'string' ? payload.buyer_person_id : null,
    ];
    for (const id of candidates) {
      if (id && id.length >= 8) {
        ids.add(id);
      }
    }
    return [...ids];
  }
}
