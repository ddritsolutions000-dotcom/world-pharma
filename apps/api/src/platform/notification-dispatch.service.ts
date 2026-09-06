import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { MetricsService } from '../common/metrics.service';
import type { EventEnvelope } from '../events/envelope';
import { EventHandlerRegistry } from '../events/handlers';
import { TITLE_BY_EVENT } from './notification-catalog';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationDispatchService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly handlers: EventHandlerRegistry,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    for (const name of Object.keys(TITLE_BY_EVENT)) {
      this.handlers.register(name, async (envelope) => {
        await this.handleDomainEvent(envelope);
      });
    }
    this.logger.log(
      JSON.stringify({
        event: 'notification_handlers_registered',
        count: Object.keys(TITLE_BY_EVENT).length,
      }),
    );
  }

  async handleDomainEvent(envelope: EventEnvelope): Promise<void> {
    const meta = TITLE_BY_EVENT[envelope.eventName];
    if (!meta) {
      return;
    }
    try {
      const recipients = this.resolveRecipients(envelope);
      if (!recipients.length) {
        return;
      }
      const countryCode =
        typeof envelope.payload?.country_code === 'string'
          ? envelope.payload.country_code
          : null;
      for (const personId of recipients) {
        const prefs = await this.notifications.getPreferences(personId);
        if (!prefs[meta.pref]) {
          continue;
        }
        const payload = envelope.payload ?? {};
        const reference = this.resolveReference(meta.category, payload, envelope.aggregateId);
        const occurrenceKey = `notif:${envelope.eventName}:${envelope.aggregateId}:${personId}`;
        await this.notifications.enqueueInbox(
          personId,
          {
            id: uuidv7(),
            channel: 'in_app',
            title: meta.title,
            body: NotificationService.safeSandboxBody(),
            read: false,
            created_at: new Date().toISOString(),
            reference_type: reference.type,
            reference_id: reference.id,
            event_type: envelope.eventName,
            occurrence_key: occurrenceKey,
            country_code: countryCode,
            correlation_id: envelope.correlationId,
          },
          {
            occurrenceKey,
            recipientCategory: this.recipientCategory(meta.category, payload, personId),
          },
        );
      }
    } catch (err) {
      this.metrics.increment('notification_failure_total', { event: envelope.eventName });
      throw err;
    }
  }

  private recipientCategory(
    category: string,
    payload: Record<string, unknown>,
    personId: string,
  ): string {
    if (Array.isArray(payload.person_ids) && payload.person_ids.includes(personId)) {
      if (category === 'order') return 'vendor';
      if (category === 'settlement') return 'vendor';
      if (category === 'affiliate') return 'affiliate';
    }
    if (typeof payload.affiliate_person_id === 'string' && payload.affiliate_person_id === personId) {
      return 'affiliate';
    }
    if (typeof payload.doctor_person_id === 'string' && payload.doctor_person_id === personId) {
      return 'doctor';
    }
    if (typeof payload.lab_person_id === 'string' && payload.lab_person_id === personId) {
      return 'lab';
    }
    if (typeof payload.delivery_person_id === 'string' && payload.delivery_person_id === personId) {
      return 'delivery';
    }
    return 'customer';
  }

  private resolveReference(
    category: string,
    payload: Record<string, unknown>,
    aggregateId: string,
  ): { type: string; id: string } {
    if (category === 'health_artifact' && typeof payload.artifact_id === 'string') {
      return { type: 'health_artifact', id: payload.artifact_id };
    }
    if (category === 'prescription') {
      const prescriptionId =
        typeof payload.prescription_id === 'string' ? payload.prescription_id : aggregateId;
      return { type: 'prescription', id: prescriptionId };
    }
    if (category === 'lab_booking' && typeof payload.lab_booking_id === 'string') {
      return { type: 'lab_booking', id: payload.lab_booking_id };
    }
    if (category === 'imaging_booking' && typeof payload.imaging_booking_id === 'string') {
      return { type: 'imaging_booking', id: payload.imaging_booking_id };
    }
    if (category === 'partner_application' && typeof payload.application_id === 'string') {
      return { type: 'partner_application', id: payload.application_id };
    }
    if (category === 'settlement' && typeof payload.settlement_line_id === 'string') {
      return { type: 'settlement_line', id: payload.settlement_line_id };
    }
    if (category === 'affiliate' && typeof payload.liability_id === 'string') {
      return { type: 'affiliate', id: payload.liability_id };
    }
    if (category === 'affiliate' && typeof payload.order_id === 'string') {
      return { type: 'affiliate', id: payload.order_id };
    }
    return {
      type: category === 'settlement' ? 'settlement_line' : category,
      id: aggregateId,
    };
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
      typeof payload.doctor_person_id === 'string' ? payload.doctor_person_id : null,
      typeof payload.applicant_person_id === 'string' ? payload.applicant_person_id : null,
      typeof payload.lab_person_id === 'string' ? payload.lab_person_id : null,
      typeof payload.delivery_person_id === 'string' ? payload.delivery_person_id : null,
      typeof payload.affiliate_person_id === 'string' ? payload.affiliate_person_id : null,
    ];
    if (Array.isArray(payload.person_ids)) {
      for (const id of payload.person_ids) {
        if (typeof id === 'string' && id.length >= 8) {
          ids.add(id);
        }
      }
    }
    for (const id of candidates) {
      if (id && id.length >= 8) {
        ids.add(id);
      }
    }
    return [...ids];
  }
}
