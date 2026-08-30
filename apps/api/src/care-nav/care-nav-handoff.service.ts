import { Injectable } from '@nestjs/common';
import { AppointmentType, CareNavSessionStatus, PartnerStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { AppointmentService } from '../clinical/appointment.service';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { CareNavAuditService } from './care-nav-audit.service';
import { assertCareNavTransition } from './care-nav-status';
import {
  assertAppointmentsEnabled,
  assertCareNavSessionActive,
  assertCareNavigationEnabled,
  assertRedFlagHandoffAllowed,
  loadOwnedCareNavSession,
  resolveCareNavCountry,
} from './care-nav-session.access';

@Injectable()
export class CareNavHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly appointments: AppointmentService,
    private readonly audits: CareNavAuditService,
    private readonly outbox: OutboxService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async bookAppointment(
    principal: Principal,
    sessionId: string,
    countryCode: string,
    input: {
      doctorProfileId: string;
      startsAt: string;
      type?: string;
      authorized?: boolean;
      idempotencyKey?: string;
    },
    requestId?: string,
  ) {
    const path = `/care-nav/sessions/${sessionId}/handoff/appointment`;
    if (input.idempotencyKey?.trim()) {
      const cached = await this.readIdempotent(principal.personId, input.idempotencyKey.trim(), 'POST', path);
      if (cached) {
        return cached;
      }
    }

    if (input.authorized !== true) {
      throw Errors.validation('authorized must be true to confirm appointment handoff');
    }
    if (!input.doctorProfileId?.trim()) {
      throw Errors.validation('doctor_profile_id is required');
    }
    if (!input.startsAt?.trim()) {
      throw Errors.validation('starts_at is required');
    }

    const country = await resolveCareNavCountry(this.prisma, countryCode);
    await assertCareNavigationEnabled(this.policy, country.isoAlpha2);
    await assertAppointmentsEnabled(this.policy, country.isoAlpha2);

    const session = await loadOwnedCareNavSession(this.prisma, sessionId, principal.personId, country.id);
    assertCareNavSessionActive(session);
    assertRedFlagHandoffAllowed(session);

    if (session.appointmentId) {
      return this.presentHandoff(session.id, session.status, session.appointmentId, country.isoAlpha2);
    }

    if (session.status !== CareNavSessionStatus.MATCHED) {
      throw Errors.conflict('Complete provider matching before appointment handoff');
    }

    const recommended = session.matches.find((row) => row.doctorProfileId === input.doctorProfileId.trim());
    if (!recommended) {
      throw Errors.forbidden('Selected provider is not eligible for this care navigation session');
    }

    const appointmentType = input.type === 'ONLINE' ? AppointmentType.ONLINE : AppointmentType.IN_PERSON;
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    if (appointmentType === AppointmentType.ONLINE) {
      if (!this.policy.isTelemedicineEligible(resolved?.document ?? null)) {
        throw Errors.serviceDisabled('Online consultation is not enabled for this country');
      }
      const profile = await this.prisma.doctorProfile.findUnique({ where: { id: input.doctorProfileId.trim() } });
      if (!profile?.onlineCapable) {
        throw Errors.forbidden('Selected provider does not support online consultation');
      }
    } else if (!this.policy.isConsultationCapable(resolved?.document ?? null)) {
      throw Errors.serviceDisabled('Consultation is not enabled for this country');
    }

    const booked = await this.appointments.book({
      customerPersonId: principal.personId,
      audience: principal.audience,
      doctorProfileId: input.doctorProfileId.trim(),
      countryCode: country.isoAlpha2,
      startsAt: input.startsAt.trim(),
      type: appointmentType,
      reasonCategory: 'care_navigation',
      requestId,
    });

    const now = new Date();
    await runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      assertCareNavTransition(session.status, CareNavSessionStatus.COMPLETED);
      await this.prisma.careNavigationSession.update({
        where: { id: session.id },
        data: {
          status: CareNavSessionStatus.COMPLETED,
          appointmentId: booked.id as string,
          completedAt: now,
        },
      });
      await this.audits.record({
        sessionId: session.id,
        actorPersonId: principal.personId,
        action: 'HANDOFF_BOOKED',
        metadata: {
          appointment_id: booked.id,
          doctor_profile_id: input.doctorProfileId.trim(),
          appointment_type: appointmentType,
        },
      });
    });

    await this.outbox.enqueue(this.prisma, {
      type: 'CARE_NAV_HANDOFF_BOOKED',
      aggregateType: 'care_navigation_session',
      aggregateId: session.id,
      producer: 'care-nav',
      countryId: country.id,
      actorId: principal.personId,
      occurrenceKey: `care_nav_handoff:${session.id}`,
      payload: {
        session_id: session.id,
        appointment_id: booked.id,
        doctor_profile_id: input.doctorProfileId.trim(),
        appointment_type: appointmentType,
      },
      correlationId: requestId ?? null,
    });

    await this.securityEvents.emit({
      type: 'CARE_NAV_HANDOFF_BOOKED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: { session_id: session.id, appointment_id: booked.id },
    });

    const body = this.presentHandoff(session.id, CareNavSessionStatus.COMPLETED, booked.id as string, country.isoAlpha2, {
      starts_at:
        booked.starts_at instanceof Date
          ? booked.starts_at.toISOString()
          : String(booked.starts_at),
      type: appointmentType,
      status: booked.status as string,
    });

    if (input.idempotencyKey?.trim()) {
      await this.storeIdempotent(principal.personId, input.idempotencyKey.trim(), 'POST', path, 200, body);
    }
    return body;
  }

  async getHandoffStatus(principal: Principal, sessionId: string, countryCode: string) {
    const country = await resolveCareNavCountry(this.prisma, countryCode);
    await assertCareNavigationEnabled(this.policy, country.isoAlpha2);

    const session = await this.prisma.careNavigationSession.findFirst({
      where: { id: sessionId, personId: principal.personId, countryId: country.id },
    });
    if (!session) {
      throw Errors.notFound('Care navigation session not found');
    }

    if (!session.appointmentId) {
      const resolved = await this.policy.resolvePublished(country.isoAlpha2);
      const telePack = this.policy.isTelemedicineEligible(resolved?.document ?? null);
      return {
        session_id: session.id,
        status: session.status,
        handoff_completed: false,
        appointment_id: null,
        tele: {
          available: telePack,
          path: telePack ? 'in_person_default' : 'in_person_only',
          video_join_route: null,
          recording_enabled: false,
        },
      };
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: session.appointmentId },
      include: { doctorProfile: true },
    });
    if (!appointment) {
      throw Errors.notFound('Linked appointment not found');
    }

    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    const telePack = this.policy.isTelemedicineEligible(resolved?.document ?? null);
    const teleAvailable =
      telePack && appointment.type === AppointmentType.ONLINE && appointment.doctorProfile.onlineCapable;

    return {
      session_id: session.id,
      status: session.status,
      handoff_completed: session.status === CareNavSessionStatus.COMPLETED,
      appointment_id: session.appointmentId,
      appointment: {
        id: appointment.id,
        status: appointment.status,
        type: appointment.type,
        starts_at: appointment.startsAt.toISOString(),
        doctor_profile_id: appointment.doctorProfileId,
      },
      tele: {
        available: teleAvailable,
        path: teleAvailable ? 'online' : 'in_person',
        video_join_route: teleAvailable ? `/api/v1/appointments/${appointment.id}/video/join` : null,
        recording_enabled: false,
      },
    };
  }

  private presentHandoff(
    sessionId: string,
    status: CareNavSessionStatus,
    appointmentId: string,
    countryCode: string,
    appointment?: { starts_at: string; type: AppointmentType; status: string },
  ) {
    return {
      session_id: sessionId,
      status,
      handoff_completed: status === CareNavSessionStatus.COMPLETED,
      appointment_id: appointmentId,
      appointment,
      tele: {
        available: appointment?.type === AppointmentType.ONLINE,
        path: appointment?.type === AppointmentType.ONLINE ? 'online' : 'in_person_default',
        video_join_route:
          appointment?.type === AppointmentType.ONLINE
            ? `/api/v1/appointments/${appointmentId}/video/join`
            : null,
        recording_enabled: false,
      },
      country_code: countryCode,
    };
  }

  private async readIdempotent(personId: string, key: string, method: string, path: string) {
    const row = await this.prisma.idempotencyRecord.findUnique({
      where: { personId_key: { personId, key } },
    });
    if (!row || row.method !== method || row.path !== path) {
      return null;
    }
    return row.body as Record<string, unknown>;
  }

  private async storeIdempotent(
    personId: string,
    key: string,
    method: string,
    path: string,
    statusCode: number,
    body: Record<string, unknown>,
  ) {
    await this.prisma.idempotencyRecord.create({
      data: {
        id: uuidv7(),
        personId,
        key,
        method,
        path,
        statusCode,
        body: body as Prisma.InputJsonValue,
      },
    });
  }
}
