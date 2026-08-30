import { Injectable } from '@nestjs/common';
import {
  CareNavSessionStatus,
  CareUrgencyLevel,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { PolicyResolver } from '../policy/resolver';
import { runWithTenant } from '../app/prisma.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { CareNavAuditService } from './care-nav-audit.service';
import {
  assertCareNavTransition,
  CARE_NAV_SESSION_TTL_HOURS,
  isTerminalCareNavStatus,
} from './care-nav-status';
import { RulesTriageEngine } from './rules-triage.engine';

const CHIEF_COMPLAINT_MAX = 500;

@Injectable()
export class CareNavigationService {
  private readonly triageEngine = new RulesTriageEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly audits: CareNavAuditService,
    private readonly outbox: OutboxService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async createSession(
    principal: Principal,
    input: { countryCode: string; chiefComplaint: string; idempotencyKey?: string },
    requestId?: string,
  ) {
    if (input.idempotencyKey?.trim()) {
      const cached = await this.readIdempotent(principal.personId, input.idempotencyKey.trim(), 'POST', '/care-nav/sessions');
      if (cached) {
        return cached;
      }
    }

    const country = await this.resolveCountry(input.countryCode);
    await this.assertCareNavigationEnabled(country.isoAlpha2);

    const complaint = input.chiefComplaint?.trim();
    if (!complaint) {
      throw Errors.validation('chief_complaint is required');
    }
    if (complaint.length > CHIEF_COMPLAINT_MAX) {
      throw Errors.validation(`chief_complaint must be at most ${CHIEF_COMPLAINT_MAX} characters`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CARE_NAV_SESSION_TTL_HOURS * 60 * 60 * 1000);
    const sessionId = uuidv7();

    const session = await this.prisma.careNavigationSession.create({
      data: {
        id: sessionId,
        personId: principal.personId,
        countryId: country.id,
        status: CareNavSessionStatus.INTAKE,
        chiefComplaintSummary: complaint.slice(0, 200),
        expiresAt,
        sandbox: true,
      },
    });

    await runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      await this.audits.record({
        sessionId: session.id,
        actorPersonId: principal.personId,
        action: 'SESSION_CREATED',
        metadata: { status: session.status },
      });
    });

    await this.outbox.enqueue(this.prisma, {
      type: 'CARE_NAV_SESSION_STARTED',
      aggregateType: 'care_navigation_session',
      aggregateId: session.id,
      producer: 'care-nav',
      countryId: country.id,
      actorId: principal.personId,
      occurrenceKey: `care_nav_started:${session.id}`,
      payload: {
        session_id: session.id,
        person_id: principal.personId,
        country_id: country.id,
      },
      correlationId: requestId ?? null,
    });

    await this.securityEvents.emit({
      type: 'CARE_NAV_SESSION_CREATED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: { session_id: session.id, country_id: country.id },
    });

    const body = this.presentSession(session);
    if (input.idempotencyKey?.trim()) {
      await this.storeIdempotent(principal.personId, input.idempotencyKey.trim(), 'POST', '/care-nav/sessions', 201, body);
    }
    return body;
  }

  async getSession(principal: Principal, sessionId: string, countryCode: string) {
    const country = await this.resolveCountry(countryCode);
    await this.assertCareNavigationEnabled(country.isoAlpha2);
    const session = await this.loadOwnedSession(sessionId, principal.personId, country.id);
    this.assertSessionActive(session);
    return this.presentSessionDetail(session);
  }

  async submitAnswer(
    principal: Principal,
    sessionId: string,
    countryCode: string,
    input: { question_key: string; answer_text: string },
    requestId?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.assertCareNavigationEnabled(country.isoAlpha2);
    const session = await this.loadOwnedSession(sessionId, principal.personId, country.id);
    this.assertSessionActive(session);

    if (session.status !== CareNavSessionStatus.INTAKE) {
      throw Errors.conflict('Answers can only be submitted during intake');
    }

    const questionKey = input.question_key?.trim();
    const answerText = input.answer_text?.trim();
    if (!questionKey || !answerText) {
      throw Errors.validation('question_key and answer_text are required');
    }
    if (answerText.length > 2000) {
      throw Errors.validation('answer_text is too long');
    }

    await runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), async () => {
      const existing = await this.prisma.careNavigationSessionAnswer.findUnique({
        where: { sessionId_questionKey: { sessionId: session.id, questionKey } },
      });
      if (existing) {
        if (existing.answerText !== answerText) {
          throw Errors.conflict('Answer for this question was already recorded');
        }
      } else {
        await this.prisma.careNavigationSessionAnswer.create({
          data: {
            id: uuidv7(),
            sessionId: session.id,
            questionKey,
            answerText,
          },
        });

        await this.audits.record({
          sessionId: session.id,
          actorPersonId: principal.personId,
          action: 'ANSWER_RECORDED',
          metadata: { question_key: questionKey },
        });
      }
    });

    await this.securityEvents.emit({
      type: 'CARE_NAV_ANSWER_RECORDED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: { session_id: session.id, question_key: questionKey },
    });

    return this.getSession(principal, sessionId, countryCode);
  }

  async completeIntake(
    principal: Principal,
    sessionId: string,
    countryCode: string,
    requestId?: string,
  ) {
    const country = await this.resolveCountry(countryCode);
    await this.assertCareNavigationEnabled(country.isoAlpha2);
    const session = await this.loadOwnedSession(sessionId, principal.personId, country.id);
    this.assertSessionActive(session);

    if (session.status !== CareNavSessionStatus.INTAKE) {
      throw Errors.conflict('Intake can only be completed from INTAKE status');
    }

    const answers = await this.prisma.careNavigationSessionAnswer.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });

    const triage = this.triageEngine.evaluate({
      chiefComplaint: session.chiefComplaintSummary ?? '',
      answers: answers.map((row) => ({ questionKey: row.questionKey, answerText: row.answerText })),
    });

    assertCareNavTransition(session.status, CareNavSessionStatus.TRIAGED);

    const updated = await runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const assessment = await this.prisma.careTriageAssessment.create({
        data: {
          id: uuidv7(),
          sessionId: session.id,
          rulesVersion: triage.rulesVersion,
          urgency: triage.urgency as CareUrgencyLevel,
          redFlag: triage.redFlag,
          specialtyCodes: triage.specialtyCodes,
          explanationKey: triage.explanationKey,
          emergencyGuidanceKey: triage.emergencyGuidanceKey,
        },
      });

      const row = await this.prisma.careNavigationSession.update({
        where: { id: session.id },
        data: {
          status: CareNavSessionStatus.TRIAGED,
          urgency: triage.urgency as CareUrgencyLevel,
          specialtyCode: triage.specialtyCodes[0] ?? null,
          redFlag: triage.redFlag,
        },
      });

      await this.audits.record({
        sessionId: session.id,
        actorPersonId: principal.personId,
        action: 'TRIAGE_COMPLETED',
        metadata: {
          assessment_id: assessment.id,
          urgency: triage.urgency,
          red_flag: triage.redFlag,
        },
      });

      return row;
    });

    await this.outbox.enqueue(this.prisma, {
      type: 'CARE_NAV_TRIAGE_COMPLETED',
      aggregateType: 'care_navigation_session',
      aggregateId: session.id,
      producer: 'care-nav',
      countryId: country.id,
      actorId: principal.personId,
      occurrenceKey: `care_nav_triage:${session.id}`,
      payload: {
        session_id: session.id,
        urgency: triage.urgency,
        red_flag: triage.redFlag,
      },
      correlationId: requestId ?? null,
    });

    await this.securityEvents.emit({
      type: 'CARE_NAV_TRIAGE_COMPLETED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: {
        session_id: session.id,
        urgency: triage.urgency,
        red_flag: triage.redFlag,
      },
    });

    return {
      ...this.presentSession(updated),
      assessment: await this.getAssessment(principal, sessionId, countryCode),
    };
  }

  async getAssessment(principal: Principal, sessionId: string, countryCode: string) {
    const country = await this.resolveCountry(countryCode);
    await this.assertCareNavigationEnabled(country.isoAlpha2);
    const session = await this.loadOwnedSession(sessionId, principal.personId, country.id);
    this.assertSessionActive(session);

    const assessment = await this.prisma.careTriageAssessment.findFirst({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!assessment) {
      throw Errors.notFound('Triage assessment not found');
    }

    return this.presentAssessment(assessment, session.redFlag);
  }

  async terminateSession(principal: Principal, sessionId: string, countryCode: string, requestId?: string) {
    const country = await this.resolveCountry(countryCode);
    await this.assertCareNavigationEnabled(country.isoAlpha2);
    const session = await this.loadOwnedSession(sessionId, principal.personId, country.id);
    this.assertSessionActive(session);

    if (isTerminalCareNavStatus(session.status)) {
      throw Errors.conflict('Session is already terminal');
    }

    assertCareNavTransition(session.status, CareNavSessionStatus.TERMINATED);

    const updated = await runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const row = await this.prisma.careNavigationSession.update({
        where: { id: session.id },
        data: {
          status: CareNavSessionStatus.TERMINATED,
          terminatedAt: new Date(),
        },
      });
      await this.audits.record({
        sessionId: session.id,
        actorPersonId: principal.personId,
        action: 'SESSION_TERMINATED',
        metadata: {},
      });
      return row;
    });

    await this.securityEvents.emit({
      type: 'CARE_NAV_SESSION_TERMINATED',
      outcome: 'success',
      personId: principal.personId,
      requestId,
      metadata: { session_id: session.id },
    });

    return this.presentSession(updated);
  }

  private async loadOwnedSession(sessionId: string, personId: string, countryId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw Errors.notFound('Care navigation session not found');
    }
    const session = await this.prisma.careNavigationSession.findFirst({
      where: { id: sessionId, personId, countryId },
      include: {
        answers: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      throw Errors.notFound('Care navigation session not found');
    }
    return session;
  }

  private assertSessionActive(session: { expiresAt: Date; status: CareNavSessionStatus }) {
    if (session.expiresAt.getTime() <= Date.now()) {
      throw Errors.forbidden('Care navigation session has expired');
    }
    if (isTerminalCareNavStatus(session.status)) {
      throw Errors.conflict('Care navigation session is no longer active');
    }
  }

  private async resolveCountry(countryCode: string) {
    const code = countryCode?.trim().toUpperCase();
    if (!code) {
      throw Errors.validation('country_code is required');
    }
    const country = await this.prisma.country.findUnique({ where: { isoAlpha2: code } });
    if (!country) {
      throw Errors.notFound('Country not found');
    }
    return country;
  }

  private async assertCareNavigationEnabled(isoAlpha2: string) {
    const resolved = await this.policy.resolvePublished(isoAlpha2);
    if (!this.policy.isCareNavigationEnabled(resolved?.document ?? null)) {
      throw Errors.forbidden('Care navigation is not enabled for this country');
    }
  }

  private presentSession(session: {
    id: string;
    status: CareNavSessionStatus;
    countryId: string;
    chiefComplaintSummary: string | null;
    urgency: CareUrgencyLevel | null;
    specialtyCode: string | null;
    redFlag: boolean;
    expiresAt: Date;
    createdAt: Date;
    completedAt: Date | null;
    terminatedAt: Date | null;
  }) {
    return {
      id: session.id,
      status: session.status,
      country_id: session.countryId,
      chief_complaint_summary: session.chiefComplaintSummary,
      urgency: session.urgency,
      specialty_code: session.specialtyCode,
      red_flag: session.redFlag,
      expires_at: session.expiresAt.toISOString(),
      created_at: session.createdAt.toISOString(),
      completed_at: session.completedAt?.toISOString() ?? null,
      terminated_at: session.terminatedAt?.toISOString() ?? null,
    };
  }

  private presentSessionDetail(session: {
    id: string;
    status: CareNavSessionStatus;
    countryId: string;
    chiefComplaintSummary: string | null;
    urgency: CareUrgencyLevel | null;
    specialtyCode: string | null;
    redFlag: boolean;
    expiresAt: Date;
    createdAt: Date;
    completedAt: Date | null;
    terminatedAt: Date | null;
    answers: Array<{ questionKey: string; answerText: string; createdAt: Date }>;
  }) {
    return {
      ...this.presentSession(session),
      answers: session.answers.map((row) => ({
        question_key: row.questionKey,
        answer_text: row.answerText,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  private presentAssessment(
    assessment: {
      id: string;
      rulesVersion: string;
      urgency: CareUrgencyLevel;
      redFlag: boolean;
      specialtyCodes: string[];
      explanationKey: string;
      emergencyGuidanceKey: string | null;
      createdAt: Date;
    },
    sessionRedFlag: boolean,
  ) {
    return {
      id: assessment.id,
      rules_version: assessment.rulesVersion,
      urgency: assessment.urgency,
      red_flag: assessment.redFlag,
      specialty_codes: assessment.specialtyCodes,
      explanation_key: assessment.explanationKey,
      emergency_guidance_key: assessment.emergencyGuidanceKey,
      booking_handoff_allowed: !sessionRedFlag,
      created_at: assessment.createdAt.toISOString(),
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
