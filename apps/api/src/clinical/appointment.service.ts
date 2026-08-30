import { Injectable, Inject, forwardRef } from '@nestjs/common';
import {
  AppointmentStatus,
  AppointmentType,
  ClinicalRelationshipKind,
  ConversionEventKind,
  EncounterStatus,
  PartnerStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { ClinicalAccessService } from './clinical-access.service';
import { ConsentService } from './consent.service';
import { DoctorService } from './doctor.service';
import { OCCUPYING_STATUSES, assertAppointmentTransition } from './appointment-status';
import { ScheduleService } from './schedule.service';
import { ConversionEventService } from '../crm/conversion-event.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { HealthConsultProjectionService } from '../health/health-consult-projection.service';
import { EncounterConsultNoteService } from './encounter-consult-note.service';

type Actor = {
  personId: string;
  audience: string;
  requestId?: string;
  reasonCode?: string;
  patientSummary?: string;
};

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly schedule: ScheduleService,
    private readonly doctors: DoctorService,
    private readonly consents: ConsentService,
    private readonly access: ClinicalAccessService,
    private readonly outbox: OutboxService,
    private readonly events: SecurityEventsService,
    private readonly conversionEvents: ConversionEventService,
    private readonly consultNotes: EncounterConsultNoteService,
    @Inject(forwardRef(() => HealthConsultProjectionService))
    private readonly healthConsultProjection: HealthConsultProjectionService,
  ) {}

  async directory(countryCode: string) {
    const resolved = await this.requireAppointmentsEnabled(countryCode);
    const rows = await this.prisma.doctorProfile.findMany({
      where: { countryId: resolved.countryId, partner: { status: PartnerStatus.ACTIVE, partnerTypeCode: 'DOCTOR' } },
      include: { partner: true },
      take: 50,
      orderBy: { displayName: 'asc' },
    });
    return {
      doctors: rows.map((row) => ({
        profile_id: row.id,
        partner_id: row.partnerId,
        display_name: row.displayName || row.professionalName || 'Doctor',
        specialties: row.specialties,
        timezone: row.timezone,
        online_capable: row.onlineCapable,
      })),
    };
  }

  async publicProfile(profileId: string, countryCode: string) {
    await this.requireAppointmentsEnabled(countryCode);
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { id: profileId },
      include: { partner: true },
    });
    if (!profile || profile.partner.status !== PartnerStatus.ACTIVE) {
      throw Errors.notFound('Doctor is not available');
    }
    return {
      profile_id: profile.id,
      display_name: profile.displayName || profile.professionalName || 'Doctor',
      specialties: profile.specialties,
      languages: profile.languages,
      timezone: profile.timezone,
      online_capable: profile.onlineCapable,
      bio: profile.bio,
    };
  }

  async slots(profileId: string, countryCode: string, fromIso: string, toIso: string) {
    await this.requireAppointmentsEnabled(countryCode);
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (!(from < to)) {
      throw Errors.validation('Invalid slot range');
    }
    return { slots: await this.schedule.slotsForProfile(profileId, from, to) };
  }

  async book(input: {
    customerPersonId: string;
    audience: string;
    doctorProfileId: string;
    countryCode: string;
    startsAt: string;
    type?: string;
    organizationId?: string;
    locationId?: string;
    reasonCategory?: string;
    requestId?: string;
  }) {
    if (input.audience !== 'customer') {
      throw Errors.forbidden('Only a customer session can book');
    }
    const resolved = await this.requireAppointmentsEnabled(input.countryCode);
    const type = input.type === 'ONLINE' ? AppointmentType.ONLINE : AppointmentType.IN_PERSON;
    if (type === AppointmentType.ONLINE && !this.policy.isTelemedicineEligible(resolved.document)) {
      throw Errors.serviceDisabled('Online consultation is not enabled for this country.');
    }
    if (type === AppointmentType.IN_PERSON && !this.policy.isConsultationCapable(resolved.document)) {
      throw Errors.serviceDisabled('Consultation is not enabled for this country.');
    }
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { id: input.doctorProfileId },
      include: { partner: true },
    });
    if (!profile || profile.partner.status !== PartnerStatus.ACTIVE) {
      throw Errors.forbidden('Doctor is not eligible for booking');
    }
    const startsAt = new Date(input.startsAt);
    const window = await this.prisma.doctorAvailabilityWindow.findFirst({
      where: { doctorProfileId: profile.id, isActive: true },
    });
    const slotMinutes = window?.slotMinutes ?? 30;
    const endsAt = new Date(startsAt.getTime() + slotMinutes * 60_000);
    const open = await this.schedule.slotsForProfile(profile.id, startsAt, endsAt);
    if (!open.some((slot) => new Date(slot.starts_at).getTime() === startsAt.getTime())) {
      throw Errors.conflict('Requested slot is not available');
    }
    if (this.policy.isBookingConsentRequired(resolved.document)) {
      const consent = await this.consents.activeGrant({
        subjectPersonId: input.customerPersonId,
        recipientPartnerId: profile.partnerId,
        purpose: 'consultation',
      });
      if (!consent) {
        throw Errors.forbidden('Consent is required before booking');
      }
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM doctor_profiles WHERE id = ${profile.id}::uuid FOR UPDATE`;
        const overlap = await tx.appointment.findFirst({
          where: {
            doctorProfileId: profile.id,
            status: { in: OCCUPYING_STATUSES },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        });
        if (overlap) {
          throw Errors.conflict('This slot is already booked');
        }
        const appointment = await tx.appointment.create({
          data: {
            id: uuidv7(),
            countryId: profile.countryId,
            customerPersonId: input.customerPersonId,
            doctorProfileId: profile.id,
            doctorPartnerId: profile.partnerId,
            organizationId: input.organizationId,
            locationId: input.locationId,
            timezone: profile.timezone,
            type,
            startsAt,
            endsAt,
            status: AppointmentStatus.REQUESTED,
            reasonCategory: input.reasonCategory,
          },
        });
        await tx.appointmentScheduleRevision.create({
          data: {
            id: uuidv7(),
            appointmentId: appointment.id,
            startsAt,
            endsAt,
            timezone: profile.timezone,
            kind: 'ORIGINAL',
            actorPersonId: input.customerPersonId,
          },
        });
        await this.writeHistory(tx, appointment.id, null, AppointmentStatus.REQUESTED, input.customerPersonId, 'booked', input.requestId);
        await this.ensureCareRelationship(tx, {
          countryId: profile.countryId,
          patientPersonId: input.customerPersonId,
          doctorPartnerId: profile.partnerId,
          organizationId: input.organizationId,
        });
        await this.outbox.enqueue(tx, {
          type: 'APPOINTMENT_CREATED',
          aggregateType: 'Appointment',
          aggregateId: appointment.id,
          producer: 'clinical',
          countryId: appointment.countryId,
          payload: {
            appointment_id: appointment.id,
            doctor_profile_id: profile.id,
            customer_person_id: input.customerPersonId,
            status: appointment.status,
          },
          correlationId: input.requestId ?? null,
          actorId: input.customerPersonId,
          occurrenceKey: `created:${appointment.id}`,
        });
        return appointment;
      });
      await this.events.emit({
        type: 'APPOINTMENT_CREATED',
        outcome: 'success',
        personId: input.customerPersonId,
        requestId: input.requestId,
        metadata: { appointment_id: created.id },
      });
      return this.present(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === '23P01') {
        throw Errors.conflict('This slot is already booked');
      }
      throw error;
    }
  }

  async listForCustomer(personId: string) {
    const rows = await this.prisma.appointment.findMany({
      where: { customerPersonId: personId },
      orderBy: { startsAt: 'asc' },
      include: { encounter: true, doctorProfile: true },
    });
    return { appointments: rows.map((row) => this.present(row)) };
  }

  async listForDoctor(personId: string) {
    const partner = await this.doctors.requireDoctorPartner(personId);
    const profile = await this.prisma.doctorProfile.findUnique({ where: { partnerId: partner.id } });
    if (!profile) {
      throw Errors.notFound('Doctor profile not found');
    }
    const rows = await this.prisma.appointment.findMany({
      where: { doctorProfileId: profile.id },
      orderBy: { startsAt: 'asc' },
      include: { encounter: true, doctorProfile: true },
    });
    return { appointments: rows.map((row) => this.present(row)) };
  }

  async listAdmin() {
    const rows = await this.prisma.appointment.findMany({
      orderBy: { startsAt: 'desc' },
      take: 100,
      include: { encounter: true, doctorProfile: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
    return { appointments: rows.map((row) => this.present(row)) };
  }

  async get(id: string, actor: Actor) {
    const row = await this.load(id);
    this.assertView(row, actor);
    const history = await this.prisma.appointmentStatusHistory.findMany({
      where: { appointmentId: id },
      orderBy: { createdAt: 'asc' },
    });
    const revisions = await this.prisma.appointmentScheduleRevision.findMany({
      where: { appointmentId: id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...this.present(row),
      history: history.map((item) => ({
        from: item.fromStatus,
        to: item.toStatus,
        reason: item.reason,
        created_at: item.createdAt,
      })),
      schedule_revisions: revisions.map((item) => ({
        kind: item.kind,
        starts_at: item.startsAt,
        ends_at: item.endsAt,
        timezone: item.timezone,
      })),
    };
  }

  confirm(id: string, actor: Actor) {
    return this.move(id, actor, AppointmentStatus.CONFIRMED, 'confirmed', 'doctor');
  }

  async checkIn(id: string, actor: Actor) {
    await this.move(id, actor, AppointmentStatus.CHECKED_IN, 'checked_in', 'doctor');
    await this.ensureEncounter(id);
    return this.present(await this.load(id));
  }

  async startConsultation(id: string, actor: Actor) {
    const row = await this.load(id);
    this.assertDoctor(row, actor);
    const country = await this.prisma.country.findUnique({ where: { id: row.countryId } });
    const access = await this.access.evaluate({
      actorId: actor.personId,
      audience: 'doctor',
      patientPersonId: row.customerPersonId,
      purpose: 'consultation',
      countryCode: country?.isoAlpha2 ?? '',
      requestId: actor.requestId,
    });
    if (!access.allowed) {
      throw Errors.forbidden('Consultation access denied');
    }
    await this.ensureEncounter(id);
    await this.move(id, actor, AppointmentStatus.IN_CONSULTATION, 'started', 'doctor');
    await this.prisma.encounter.updateMany({
      where: { appointmentId: id },
      data: { status: EncounterStatus.STARTED, startedAt: new Date() },
    });
    await this.emitStandalone(row, actor, 'ENCOUNTER_STARTED');
    return this.present(await this.load(id));
  }

  async complete(id: string, actor: Actor) {
    const row = await this.load(id);
    this.assertDoctor(row, actor);
    assertAppointmentTransition(row.status, AppointmentStatus.COMPLETED);
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: row.countryId } });
    const patientSummary = this.consultNotes.normalizePatientSummary(actor.patientSummary);
    const completedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id }, data: { status: AppointmentStatus.COMPLETED } });
      await this.writeHistory(
        tx,
        id,
        row.status,
        AppointmentStatus.COMPLETED,
        actor.personId,
        'completed',
        actor.requestId,
      );
      await tx.encounter.updateMany({
        where: { appointmentId: id },
        data: { status: EncounterStatus.COMPLETED, endedAt: completedAt },
      });

      if (patientSummary) {
        const encounter = await tx.encounter.findUniqueOrThrow({ where: { appointmentId: id } });
        await this.consultNotes.recordOnComplete(tx, {
          encounterId: encounter.id,
          countryId: encounter.countryId,
          patientPersonId: encounter.customerPersonId,
          doctorProfileId: encounter.doctorProfileId,
          patientSummary,
          completedAt,
        });
        await this.prisma.runWithTenant(
          workerTenantContext({
            countryId: encounter.countryId,
            personId: actor.personId,
          }),
          () =>
            this.healthConsultProjection.projectCompletedEncounter(tx, {
              encounterId: encounter.id,
              patientPersonId: encounter.customerPersonId,
              countryId: encounter.countryId,
              countryCode: country.isoAlpha2,
              publishedAt: completedAt,
              title: 'Consultation summary',
            }),
        );
      }
    });

    const updated = await this.load(id);
    await this.emitStandalone(updated, actor, 'ENCOUNTER_COMPLETED');
    await this.conversionEvents
      .recordHook({
        countryCode: country.isoAlpha2,
        personId: updated.customerPersonId,
        eventKind: ConversionEventKind.APPOINTMENT_COMPLETED,
        source: 'appointment',
        sourceKey: updated.id,
        metadata: { appointment_id: updated.id },
      })
      .catch(() => undefined);
    return this.present(updated);
  }

  markNoShow(id: string, actor: Actor) {
    return this.move(id, actor, AppointmentStatus.NO_SHOW, 'no_show', 'doctor');
  }

  async cancel(id: string, actor: Actor) {
    const row = await this.load(id);
    this.assertCancel(row, actor);
    assertAppointmentTransition(row.status, AppointmentStatus.CANCELLED);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledByPersonId: actor.personId,
          cancelReasonCode: (actor.reasonCode ?? 'unspecified').slice(0, 64),
        },
      });
      await this.writeHistory(tx, id, row.status, AppointmentStatus.CANCELLED, actor.personId, actor.reasonCode ?? 'cancelled', actor.requestId);
      await this.outbox.enqueue(tx, {
        type: 'APPOINTMENT_CANCELLED',
        aggregateType: 'Appointment',
        aggregateId: id,
        producer: 'clinical',
        countryId: row.countryId,
        payload: this.patientNotificationPayload(row.customerPersonId, actor.personId, {
          appointment_id: id,
          status: AppointmentStatus.CANCELLED,
        }),
        occurrenceKey: `cancelled:${id}`,
      });
      return next;
    });
    return this.present(updated);
  }

  async reschedule(id: string, actor: Actor, startsAtIso: string) {
    const row = await this.load(id);
    this.assertCancel(row, actor);
    const startsAt = new Date(startsAtIso);
    const endsAt = new Date(startsAt.getTime() + (row.endsAt.getTime() - row.startsAt.getTime()));
    const open = await this.schedule.slotsForProfile(row.doctorProfileId, startsAt, endsAt, row.id);
    if (!open.some((slot) => new Date(slot.starts_at).getTime() === startsAt.getTime())) {
      throw Errors.conflict('New slot is not available');
    }
    assertAppointmentTransition(row.status, AppointmentStatus.RESCHEDULED);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM doctor_profiles WHERE id = ${row.doctorProfileId}::uuid FOR UPDATE`;
      const overlap = await tx.appointment.findFirst({
        where: {
          doctorProfileId: row.doctorProfileId,
          id: { not: row.id },
          status: { in: OCCUPYING_STATUSES },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (overlap) {
        throw Errors.conflict('New slot conflicts with another appointment');
      }
      await tx.appointmentScheduleRevision.create({
        data: {
          id: uuidv7(),
          appointmentId: row.id,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          timezone: row.timezone,
          kind: 'SUPERSEDED',
          actorPersonId: actor.personId,
        },
      });
      const next = await tx.appointment.update({
        where: { id: row.id },
        data: { startsAt, endsAt, status: AppointmentStatus.RESCHEDULED },
      });
      await tx.appointmentScheduleRevision.create({
        data: {
          id: uuidv7(),
          appointmentId: row.id,
          startsAt,
          endsAt,
          timezone: row.timezone,
          kind: 'RESCHEDULE',
          actorPersonId: actor.personId,
        },
      });
      await this.writeHistory(tx, id, row.status, AppointmentStatus.RESCHEDULED, actor.personId, 'rescheduled', actor.requestId);
      await this.outbox.enqueue(tx, {
        type: 'APPOINTMENT_RESCHEDULED',
        aggregateType: 'Appointment',
        aggregateId: id,
        producer: 'clinical',
        countryId: row.countryId,
        payload: this.patientNotificationPayload(row.customerPersonId, actor.personId, {
          appointment_id: id,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        }),
        occurrenceKey: `rescheduled:${id}:${startsAt.toISOString()}`,
      });
      return next;
    });
    return this.present(updated);
  }

  private async move(id: string, actor: Actor, to: AppointmentStatus, reason: string, role: 'doctor' | 'admin') {
    const row = await this.load(id);
    if (role === 'doctor') {
      this.assertDoctor(row, actor);
    } else if (actor.audience !== 'admin') {
      throw Errors.forbidden();
    }
    assertAppointmentTransition(row.status, to);
    const eventName =
      to === AppointmentStatus.CONFIRMED
        ? 'APPOINTMENT_CONFIRMED'
        : to === AppointmentStatus.CHECKED_IN
          ? 'APPOINTMENT_CHECKED_IN'
          : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.appointment.update({ where: { id }, data: { status: to } });
      await this.writeHistory(tx, id, row.status, to, actor.personId, reason, actor.requestId);
      if (eventName) {
        await this.outbox.enqueue(tx, {
          type: eventName,
          aggregateType: 'Appointment',
          aggregateId: id,
          producer: 'clinical',
          countryId: row.countryId,
          payload: this.patientNotificationPayload(row.customerPersonId, actor.personId, {
            appointment_id: id,
            status: to,
          }),
          occurrenceKey: `${to}:${id}`,
        });
      }
      return next;
    });
    return this.present(updated);
  }

  private async ensureEncounter(appointmentId: string) {
    const row = await this.load(appointmentId);
    await this.prisma.encounter.upsert({
      where: { appointmentId },
      create: {
        id: uuidv7(),
        appointmentId,
        countryId: row.countryId,
        customerPersonId: row.customerPersonId,
        doctorProfileId: row.doctorProfileId,
        doctorPartnerId: row.doctorPartnerId,
        organizationId: row.organizationId,
        status: EncounterStatus.PENDING,
        videoSessionRef: null,
      },
      update: {},
    });
  }

  private async ensureCareRelationship(
    tx: Prisma.TransactionClient,
    input: { countryId: string; patientPersonId: string; doctorPartnerId: string; organizationId?: string },
  ) {
    const existing = await tx.clinicalRelationship.findFirst({
      where: {
        patientPersonId: input.patientPersonId,
        doctorPartnerId: input.doctorPartnerId,
        organizationId: input.organizationId ?? null,
      },
    });
    if (existing) {
      return;
    }
    await tx.clinicalRelationship.create({
      data: {
        id: uuidv7(),
        countryId: input.countryId,
        patientPersonId: input.patientPersonId,
        doctorPartnerId: input.doctorPartnerId,
        organizationId: input.organizationId,
        kind: ClinicalRelationshipKind.CARE,
      },
    });
  }

  private writeHistory(
    tx: Prisma.TransactionClient,
    appointmentId: string,
    from: AppointmentStatus | null,
    to: AppointmentStatus,
    actorPersonId: string | null,
    reason?: string,
    requestId?: string,
  ) {
    return tx.appointmentStatusHistory.create({
      data: {
        id: uuidv7(),
        appointmentId,
        fromStatus: from,
        toStatus: to,
        actorPersonId,
        reason,
        requestId,
      },
    });
  }

  private async requireAppointmentsEnabled(countryCode: string) {
    const resolved = await this.policy.resolvePublished(countryCode);
    if (!this.policy.areAppointmentsEnabled(resolved?.document ?? null)) {
      throw Errors.serviceDisabled('Appointments are not enabled for this country.');
    }
    return resolved!;
  }

  private async load(id: string) {
    const row = await this.prisma.appointment.findUnique({
      where: { id },
      include: { encounter: true, doctorProfile: true },
    });
    if (!row) {
      throw Errors.notFound('Appointment not found');
    }
    return row;
  }

  private patientNotificationPayload(
    customerPersonId: string,
    actorPersonId: string,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      ...payload,
      customer_person_id: customerPersonId,
      actor_person_id: actorPersonId,
    };
  }

  private async emitStandalone(
    row: { id: string; countryId: string },
    actor: Actor,
    type: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.enqueue(tx, {
        type,
        aggregateType: 'Appointment',
        aggregateId: row.id,
        producer: 'clinical',
        countryId: row.countryId,
        payload: { appointment_id: row.id },
        actorId: actor.personId,
        occurrenceKey: `${type}:${row.id}`,
      });
    });
  }

  private assertView(
    row: { customerPersonId: string; doctorProfile: { personId: string } },
    actor: Actor,
  ) {
    if (actor.audience === 'admin') {
      return;
    }
    if (actor.audience === 'customer' && row.customerPersonId === actor.personId) {
      return;
    }
    if (actor.audience === 'doctor' && row.doctorProfile.personId === actor.personId) {
      return;
    }
    throw Errors.forbidden();
  }

  private assertDoctor(row: { doctorProfile: { personId: string } }, actor: Actor) {
    if (actor.audience === 'admin') {
      return;
    }
    if (actor.audience === 'doctor' && row.doctorProfile.personId === actor.personId) {
      return;
    }
    throw Errors.forbidden();
  }

  private assertCancel(
    row: { customerPersonId: string; doctorProfile: { personId: string } },
    actor: Actor,
  ) {
    if (actor.audience === 'admin') {
      return;
    }
    if (actor.audience === 'customer' && row.customerPersonId === actor.personId) {
      return;
    }
    if (actor.audience === 'doctor' && row.doctorProfile.personId === actor.personId) {
      return;
    }
    throw Errors.forbidden();
  }

  present(row: {
    id: string;
    customerPersonId: string;
    doctorProfileId: string;
    organizationId: string | null;
    locationId: string | null;
    timezone: string;
    type: AppointmentType;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    reasonCategory: string | null;
    cancelReasonCode: string | null;
    cancelledAt: Date | null;
    videoSessionRef: string | null;
    encounter?: { id: string; status: EncounterStatus; startedAt: Date | null; endedAt: Date | null } | null;
    doctorProfile?: { displayName: string; professionalName: string };
  }) {
    return {
      id: row.id,
      customer_person_id: row.customerPersonId,
      doctor_profile_id: row.doctorProfileId,
      organization_id: row.organizationId,
      location_id: row.locationId,
      timezone: row.timezone,
      type: row.type,
      starts_at: row.startsAt,
      ends_at: row.endsAt,
      status: row.status,
      reason_category: row.reasonCategory,
      cancel_reason_code: row.cancelReasonCode,
      cancelled_at: row.cancelledAt,
      video_session_ref: row.videoSessionRef,
      doctor_display_name: row.doctorProfile?.displayName || row.doctorProfile?.professionalName,
      encounter: row.encounter
        ? {
            id: row.encounter.id,
            status: row.encounter.status,
            started_at: row.encounter.startedAt,
            ended_at: row.encounter.endedAt,
            video_session_ref: row.videoSessionRef,
          }
        : null,
    };
  }
}
