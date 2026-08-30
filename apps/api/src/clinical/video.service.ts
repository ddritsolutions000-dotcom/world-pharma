import { Inject, Injectable } from '@nestjs/common';
import {
  AppointmentStatus,
  AppointmentType,
  EncounterStatus,
  Prisma,
  VideoParticipantRole,
  VideoSessionStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors, ProblemException } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { ClinicalAccessService } from './clinical-access.service';
import { ACTIVE_VIDEO_STATUSES, assertVideoTransition } from './video-status';
import { VideoProviderPort } from './video-provider.port';

export const VIDEO_PROVIDER = 'VIDEO_PROVIDER';
const TOKEN_TTL_SECONDS = 90;
const WEBHOOK_TTL_MS = 5 * 60 * 1000;
/** Registered in NotificationDispatchService TITLE_BY_EVENT for the patient inbox. */
const PATIENT_VIDEO_NOTIFICATION_EVENTS = new Set([
  'VIDEO_SESSION_READY',
  'VIDEO_SESSION_STARTED',
  'VIDEO_PARTICIPANT_JOINED',
  'VIDEO_SESSION_ENDED',
]);
const JOINABLE: AppointmentStatus[] = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.RESCHEDULED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_CONSULTATION,
];

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClinicalAccessService,
    private readonly outbox: OutboxService,
    private readonly events: SecurityEventsService,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProviderPort,
  ) {}

  async join(appointmentId: string, principal: Principal, requestId?: string) {
    await this.assertJoinRate(principal.personId);
    const appointment = await this.loadAppointment(appointmentId);
    const role = this.roleOf(principal, appointment);
    await this.assertAuthorized(appointment, principal, requestId);
    if (!this.provider.isConfigured()) {
      throw Errors.problem(503, 'VIDEO_PROVIDER_UNAVAILABLE', 'Video provider unavailable', 'Video is not configured.');
    }
    const session = await this.ensureSession(appointment, requestId);
    if (!ACTIVE_VIDEO_STATUSES.includes(session.status) || session.expiresAt <= new Date()) {
      if (session.expiresAt <= new Date() && session.status !== VideoSessionStatus.EXPIRED) {
        await this.move(session.id, session.status, VideoSessionStatus.EXPIRED, 'expired', appointment.countryId);
      }
      throw Errors.forbidden('Video session is not joinable');
    }
    const identity = `${role === VideoParticipantRole.DOCTOR ? 'd' : 'c'}_${principal.personId}`;
    const issued = await this.provider.generateParticipantToken({
      roomId: session.providerRoomId,
      identity,
      role: role === VideoParticipantRole.DOCTOR ? 'doctor' : 'customer',
      ttlSeconds: TOKEN_TTL_SECONDS,
    });
    const next = this.afterJoin(session.status, role);
    if (next !== session.status) {
      await this.move(session.id, session.status, next, 'participant_joined', appointment.countryId, requestId, principal.personId);
    }
    if (role === VideoParticipantRole.DOCTOR) {
      await this.prisma.videoSession.update({ where: { id: session.id }, data: { doctorJoinedAt: new Date() } });
    } else {
      await this.prisma.videoSession.update({ where: { id: session.id }, data: { customerJoinedAt: new Date() } });
    }
    await this.audit(session.id, principal.personId, role, 'join_token', 'issued', undefined, requestId);
    await this.enqueueOnce({
      type: 'VIDEO_PARTICIPANT_JOINED',
      aggregateId: session.id,
      countryId: appointment.countryId,
      payload: this.patientNotificationPayload(appointment.customerPersonId, {
        session_id: session.id,
        appointment_id: appointment.id,
        role,
      }, principal.personId),
      actorId: null,
      occurrenceKey: `JOINED:${session.id}:${principal.personId}`,
    });
    await this.events.emit({
      type: 'VIDEO_PARTICIPANT_JOINED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: { session_id: session.id, appointment_id: appointment.id, role },
    });
    return {
      session_id: session.id,
      status: next,
      role,
      ws_url: this.provider.connectionUrl(),
      token: issued.token,
      token_expires_at: issued.expiresAt,
      recording_enabled: false,
      reconnect: true,
    };
  }

  async leave(appointmentId: string, principal: Principal, requestId?: string) {
    const appointment = await this.loadAppointment(appointmentId);
    const role = this.roleOf(principal, appointment);
    const session = await this.prisma.videoSession.findUnique({ where: { appointmentId } });
    if (!session) {
      throw Errors.notFound('Video session not found');
    }
    await this.audit(session.id, principal.personId, role, 'leave', 'ok', undefined, requestId);
    await this.enqueueOnce({
      type: 'VIDEO_PARTICIPANT_LEFT',
      aggregateId: session.id,
      countryId: appointment.countryId,
      payload: { session_id: session.id, appointment_id: appointment.id, role },
      actorId: principal.personId,
      occurrenceKey: `LEFT:${session.id}:${principal.personId}:${session.status}`,
    });
    await this.events.emit({
      type: 'VIDEO_PARTICIPANT_LEFT',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: { session_id: session.id, appointment_id: appointment.id, role },
    });
    return { session_id: session.id, status: session.status, encounter_completed: false };
  }

  async end(appointmentId: string, principal: Principal, requestId?: string) {
    const appointment = await this.loadAppointment(appointmentId);
    this.roleOf(principal, appointment);
    if (principal.audience !== 'doctor') {
      throw Errors.forbidden();
    }
    const session = await this.prisma.videoSession.findUnique({ where: { appointmentId } });
    if (!session) {
      throw Errors.notFound('Video session not found');
    }
    if (ACTIVE_VIDEO_STATUSES.includes(session.status)) {
      await this.provider.endSession(session.providerRoomId).catch(() => undefined);
      await this.move(session.id, session.status, VideoSessionStatus.ENDED, 'ended', appointment.countryId, requestId, principal.personId);
    }
    return { session_id: session.id, status: VideoSessionStatus.ENDED, encounter_completed: false };
  }

  async get(appointmentId: string, principal: Principal) {
    const appointment = await this.loadAppointment(appointmentId);
    this.roleOf(principal, appointment);
    const session = await this.prisma.videoSession.findUnique({ where: { appointmentId } });
    if (!session) {
      throw Errors.notFound('Video session not found');
    }
    return this.present(session);
  }

  async adminList() {
    const rows = await this.prisma.videoSession.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return { sessions: rows.map((row) => this.present(row)) };
  }

  async adminGet(id: string) {
    const row = await this.prisma.videoSession.findUnique({ where: { id } });
    if (!row) {
      throw Errors.notFound('Video session not found');
    }
    return this.present(row);
  }

  async handleWebhook(headers: Record<string, string | undefined>, rawBody: string) {
    const parsed = this.provider.verifyWebhook?.(headers, rawBody);
    if (!parsed?.eventId) {
      throw Errors.unauthorized('Invalid video webhook');
    }
    if (parsed.occurredAt) {
      if (Math.abs(Date.now() - parsed.occurredAt.getTime()) > WEBHOOK_TTL_MS) {
        throw Errors.problem(409, 'WEBHOOK_REPLAY', 'Stale webhook', 'Timestamp is outside the replay window.');
      }
    }
    try {
      const session = parsed.roomId
        ? await this.prisma.videoSession.findFirst({ where: { providerRoomId: parsed.roomId } })
        : null;
      await this.prisma.videoWebhookReceipt.create({
        data: {
          id: uuidv7(),
          provider: this.provider.name,
          eventId: parsed.eventId,
          eventType: parsed.eventType,
          sessionId: session?.id,
        },
      });
      const eventType = parsed.eventType.toLowerCase();
      if (eventType.includes('room_finished') && session) {
        if (ACTIVE_VIDEO_STATUSES.includes(session.status)) {
          await this.move(session.id, session.status, VideoSessionStatus.ENDED, 'provider_room_finished', session.countryId);
        }
        // Stale/out-of-order room_finished against ENDED/FAILED/EXPIRED is a no-op after receipt.
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { duplicate: true };
      }
      throw error;
    }
    return { accepted: true };
  }

  private async assertJoinRate(personId: string) {
    const since = new Date(Date.now() - 60_000);
    const count = await this.prisma.videoJoinAudit.count({
      where: { actorPersonId: personId, action: 'join_token', createdAt: { gte: since } },
    });
    if (count >= 20) {
      throw Errors.rateLimited(60);
    }
  }

  private async assertAuthorized(
    appointment: {
      type: AppointmentType;
      status: AppointmentStatus;
      customerPersonId: string;
      doctorPartnerId: string;
      country: { isoAlpha2: string };
    },
    principal: Principal,
    requestId?: string,
  ) {
    if (appointment.type !== AppointmentType.ONLINE) {
      throw Errors.forbidden('Appointment is not an online consultation');
    }
    if (!JOINABLE.includes(appointment.status)) {
      throw Errors.forbidden('Appointment is not eligible for video');
    }
    const access = await this.access.evaluateVideoJoin({
      actorId: principal.personId,
      audience: principal.audience,
      patientPersonId: appointment.customerPersonId,
      doctorPartnerId: appointment.doctorPartnerId,
      countryCode: appointment.country.isoAlpha2,
      requestId,
    });
    if (!access.allowed) {
      await this.events.emit({
        type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        outcome: 'failure',
        personId: principal.personId,
        requestId,
        metadata: { reason: access.reason, appointment_id: 'hidden' },
      });
      throw Errors.forbidden('Video join denied');
    }
  }

  private async ensureSession(
    appointment: {
      id: string;
      countryId: string;
      doctorProfileId: string;
      customerPersonId: string;
      doctorPartnerId: string;
      organizationId: string | null;
      endsAt: Date;
      encounter: { id: string } | null;
    },
    requestId?: string,
  ) {
    const existing = await this.prisma.videoSession.findUnique({ where: { appointmentId: appointment.id } });
    if (existing) {
      return existing;
    }
    let encounterId = appointment.encounter?.id;
    if (!encounterId) {
      const encounter = await this.prisma.encounter.create({
        data: {
          id: uuidv7(),
          appointmentId: appointment.id,
          countryId: appointment.countryId,
          customerPersonId: appointment.customerPersonId,
          doctorProfileId: appointment.doctorProfileId,
          doctorPartnerId: appointment.doctorPartnerId,
          organizationId: appointment.organizationId,
          status: EncounterStatus.PENDING,
        },
      });
      encounterId = encounter.id;
    }
    const roomId = `apt_${appointment.id.replaceAll('-', '').slice(0, 24)}`;
    try {
      const created = await this.prisma.videoSession.create({
        data: {
          id: uuidv7(),
          appointmentId: appointment.id,
          encounterId,
          countryId: appointment.countryId,
          doctorProfileId: appointment.doctorProfileId,
          customerPersonId: appointment.customerPersonId,
          provider: this.provider.name,
          providerRoomId: roomId,
          status: VideoSessionStatus.CREATED,
          recordingEnabled: false,
          expiresAt: new Date(Math.max(appointment.endsAt.getTime() + 15 * 60_000, Date.now() + 2 * 3600_000)),
        },
      });
      await this.prisma.$transaction(async (tx) => {
        await this.outbox.enqueue(tx, {
          type: 'VIDEO_SESSION_CREATED',
          aggregateType: 'VideoSession',
          aggregateId: created.id,
          producer: 'clinical',
          countryId: appointment.countryId,
          payload: { session_id: created.id, appointment_id: appointment.id, recording_enabled: false },
          actorId: null,
          occurrenceKey: `CREATED:${created.id}`,
        });
      });
      try {
        await this.provider.createSession({ roomId });
        await this.move(created.id, VideoSessionStatus.CREATED, VideoSessionStatus.READY, 'provider_ready', appointment.countryId, requestId);
        await this.prisma.appointment.update({ where: { id: appointment.id }, data: { videoSessionRef: created.id } });
        await this.prisma.encounter.update({ where: { id: encounterId }, data: { videoSessionRef: created.id } });
      } catch (error) {
        await this.move(created.id, VideoSessionStatus.CREATED, VideoSessionStatus.FAILED, 'provider_unavailable').catch(() => undefined);
        throw error;
      }
      return this.prisma.videoSession.findUniqueOrThrow({ where: { id: created.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.videoSession.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
      }
      throw error;
    }
  }

  private async loadAppointment(id: string) {
    const row = await this.prisma.appointment.findUnique({
      where: { id },
      include: { encounter: true, doctorProfile: true, country: true },
    });
    if (!row) {
      throw Errors.notFound('Appointment not found');
    }
    return row;
  }

  private roleOf(
    principal: Principal,
    appointment: { customerPersonId: string; doctorProfile: { personId: string } },
  ): VideoParticipantRole {
    if (principal.audience === 'doctor' && appointment.doctorProfile.personId === principal.personId) {
      return VideoParticipantRole.DOCTOR;
    }
    if (principal.audience === 'customer' && appointment.customerPersonId === principal.personId) {
      return VideoParticipantRole.CUSTOMER;
    }
    throw Errors.forbidden();
  }

  private afterJoin(current: VideoSessionStatus, role: VideoParticipantRole): VideoSessionStatus {
    if (current === VideoSessionStatus.READY && role === VideoParticipantRole.DOCTOR) {
      return VideoSessionStatus.DOCTOR_JOINED;
    }
    if (current === VideoSessionStatus.READY && role === VideoParticipantRole.CUSTOMER) {
      return VideoSessionStatus.CUSTOMER_JOINED;
    }
    if (current === VideoSessionStatus.DOCTOR_JOINED && role === VideoParticipantRole.CUSTOMER) {
      return VideoSessionStatus.IN_PROGRESS;
    }
    if (current === VideoSessionStatus.CUSTOMER_JOINED && role === VideoParticipantRole.DOCTOR) {
      return VideoSessionStatus.IN_PROGRESS;
    }
    return current;
  }

  private async move(
    id: string,
    from: VideoSessionStatus,
    to: VideoSessionStatus,
    reason: string,
    countryId?: string,
    requestId?: string,
    actorId?: string,
  ) {
    assertVideoTransition(from, to);
    const data: Prisma.VideoSessionUpdateInput = { status: to };
    if (to === VideoSessionStatus.IN_PROGRESS) {
      data.startedAt = new Date();
    }
    if (to === VideoSessionStatus.ENDED || to === VideoSessionStatus.FAILED || to === VideoSessionStatus.EXPIRED) {
      data.endedAt = new Date();
    }
    if (to === VideoSessionStatus.FAILED) {
      data.failureCategory = reason;
    }
    await this.prisma.videoSession.update({ where: { id }, data });
    const eventType =
      to === VideoSessionStatus.READY
        ? 'VIDEO_SESSION_READY'
        : to === VideoSessionStatus.IN_PROGRESS
          ? 'VIDEO_SESSION_STARTED'
          : to === VideoSessionStatus.ENDED
            ? 'VIDEO_SESSION_ENDED'
            : to === VideoSessionStatus.FAILED
              ? 'VIDEO_SESSION_FAILED'
              : null;
    if (eventType && countryId) {
      const session = await this.prisma.videoSession.findUniqueOrThrow({ where: { id } });
      const patientFacing = PATIENT_VIDEO_NOTIFICATION_EVENTS.has(eventType);
      await this.enqueueOnce({
        type: eventType,
        aggregateId: id,
        countryId,
        payload: patientFacing
          ? this.patientNotificationPayload(
              session.customerPersonId,
              { session_id: id, status: to, reason },
              actorId,
            )
          : { session_id: id, status: to, reason },
        actorId: patientFacing ? null : (actorId ?? null),
        occurrenceKey: `${to}:${id}`,
      });
      await this.events.emit({
        type: eventType,
        outcome: to === VideoSessionStatus.FAILED ? 'failure' : 'success',
        personId: actorId,
        requestId,
        metadata: { session_id: id, status: to },
      });
    }
  }

  private patientNotificationPayload(
    customerPersonId: string,
    payload: Record<string, unknown>,
    actorPersonId?: string | null,
  ): Record<string, unknown> {
    return {
      ...payload,
      customer_person_id: customerPersonId,
      ...(actorPersonId ? { actor_person_id: actorPersonId } : {}),
    };
  }

  private async enqueueOnce(input: {
    type: string;
    aggregateId: string;
    countryId: string;
    payload: Record<string, unknown>;
    actorId: string | null;
    occurrenceKey: string;
  }) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.outbox.enqueue(tx, {
          type: input.type,
          aggregateType: 'VideoSession',
          aggregateId: input.aggregateId,
          producer: 'clinical',
          countryId: input.countryId,
          payload: input.payload,
          actorId: input.actorId,
          occurrenceKey: input.occurrenceKey,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      if (error instanceof ProblemException && error.code === 'CONFLICT') {
        return;
      }
      throw error;
    }
  }

  private audit(
    sessionId: string,
    actorPersonId: string,
    role: VideoParticipantRole,
    action: string,
    outcome: string,
    reasonCategory?: string,
    requestId?: string,
  ) {
    return this.prisma.videoJoinAudit.create({
      data: {
        id: uuidv7(),
        sessionId,
        actorPersonId,
        role,
        action,
        outcome,
        reasonCategory,
        requestId,
      },
    });
  }

  private present(row: {
    id: string;
    appointmentId: string;
    encounterId: string | null;
    provider: string;
    status: VideoSessionStatus;
    recordingEnabled: boolean;
    startedAt: Date | null;
    endedAt: Date | null;
    expiresAt: Date;
    failureCategory: string | null;
  }) {
    return {
      id: row.id,
      appointment_id: row.appointmentId,
      encounter_id: row.encounterId,
      provider: row.provider,
      status: row.status,
      recording_enabled: false,
      started_at: row.startedAt,
      ended_at: row.endedAt,
      expires_at: row.expiresAt,
      failure_category: row.failureCategory,
    };
  }
}
