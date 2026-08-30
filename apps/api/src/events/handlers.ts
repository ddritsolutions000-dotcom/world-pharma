import { Injectable, Logger } from '@nestjs/common';
import type { EventEnvelope } from './envelope';

export type DomainHandler = (envelope: EventEnvelope) => Promise<void>;

@Injectable()
export class EventHandlerRegistry {
  private readonly logger = new Logger(EventHandlerRegistry.name);
  private readonly handlers = new Map<string, DomainHandler[]>();

  constructor() {
    this.register('USER_REGISTERED', async (envelope) => {
      this.logger.log(
        JSON.stringify({
          handler: 'USER_REGISTERED',
          event_id: envelope.eventId,
          aggregate_id: envelope.aggregateId,
        }),
      );
    });
    this.register('PARTNER_CREATED', async (envelope) => {
      this.logger.log(
        JSON.stringify({
          handler: 'PARTNER_CREATED',
          event_id: envelope.eventId,
          aggregate_id: envelope.aggregateId,
        }),
      );
    });
    this.register('PARTNER_STATUS_CHANGED', async (envelope) => {
      this.logger.log(
        JSON.stringify({
          handler: 'PARTNER_STATUS_CHANGED',
          event_id: envelope.eventId,
          aggregate_id: envelope.aggregateId,
        }),
      );
    });
    for (const name of [
      'DOCTOR_PROFILE_CREATED',
      'DOCTOR_PROFILE_UPDATED',
      'DOCTOR_CREDENTIAL_SUBMITTED',
      'DOCTOR_CREDENTIAL_REVIEWED',
      'CONSENT_GRANTED',
      'CONSENT_REVOKED',
      'CLINICAL_ACCESS_EVALUATED',
      'BREAK_GLASS_HEALTH_OPENED',
      'CARE_NAV_SESSION_STARTED',
      'CARE_NAV_TRIAGE_COMPLETED',
      'APPOINTMENT_CREATED',
      'APPOINTMENT_CONFIRMED',
      'APPOINTMENT_RESCHEDULED',
      'APPOINTMENT_CANCELLED',
      'APPOINTMENT_CHECKED_IN',
      'ENCOUNTER_STARTED',
      'ENCOUNTER_COMPLETED',
      'VIDEO_SESSION_CREATED',
      'VIDEO_SESSION_READY',
      'VIDEO_PARTICIPANT_JOINED',
      'VIDEO_PARTICIPANT_LEFT',
      'VIDEO_SESSION_STARTED',
      'VIDEO_SESSION_ENDED',
      'VIDEO_SESSION_FAILED',
    ]) {
      this.register(name, async (envelope) => {
        this.logger.log(JSON.stringify({ handler: name, event_id: envelope.eventId, aggregate_id: envelope.aggregateId }));
      });
    }
  }

  register(eventName: string, handler: DomainHandler): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  handlersFor(eventName: string): DomainHandler[] {
    return this.handlers.get(eventName) ?? [];
  }
}
