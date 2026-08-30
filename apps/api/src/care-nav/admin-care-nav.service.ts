import { Injectable } from '@nestjs/common';
import { CareNavSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminCareNavService {
  constructor(private readonly prisma: PrismaService) {}

  async listSessions(
    principal: Principal,
    query: { countryId?: string; status?: string; cursor?: string; limit?: number },
  ) {
    this.assertAdminAudience(principal);
    const take = this.resolveLimit(query.limit);
    const where: Prisma.CareNavigationSessionWhereInput = {};
    if (query.countryId?.trim()) {
      where.countryId = query.countryId.trim();
    }
    if (query.status?.trim()) {
      const status = query.status.trim().toUpperCase();
      if (!Object.values(CareNavSessionStatus).includes(status as CareNavSessionStatus)) {
        throw Errors.validation(`Invalid care navigation status: ${query.status}`);
      }
      where.status = status as CareNavSessionStatus;
    }
    const cursor = this.decodeCursor(query.cursor);
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.careNavigationSession.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: {
        id: true,
        personId: true,
        countryId: true,
        status: true,
        urgency: true,
        specialtyCode: true,
        redFlag: true,
        matchSetVersion: true,
        appointmentId: true,
        matchedAt: true,
        completedAt: true,
        terminatedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        assessments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            rulesVersion: true,
            urgency: true,
            redFlag: true,
            specialtyCodes: true,
            explanationKey: true,
            emergencyGuidanceKey: true,
            createdAt: true,
          },
        },
      },
    });

    const hydrated = await Promise.all(
      rows.slice(0, take).map(async (row) => {
        const activeMatches = await this.prisma.careMatchRecommendation.findMany({
          where: { sessionId: row.id, setVersion: row.matchSetVersion },
          select: { id: true, rank: true, doctorProfileId: true },
          orderBy: { rank: 'asc' },
        });
        return this.presentListItem({ ...row, matches: activeMatches });
      }),
    );

    const page = rows.slice(0, take);
    const next = rows.length > take ? page[page.length - 1] : undefined;

    const response = {
      data: hydrated,
      next_cursor: next ? this.encodeCursor(next.createdAt, next.id) : null,
    };
    return response;
  }

  async getSession(principal: Principal, sessionId: string) {
    this.assertAdminAudience(principal);
    if (!this.isUuid(sessionId)) {
      throw Errors.validation('Invalid session id');
    }

    const session = await this.prisma.careNavigationSession.findUnique({
      where: { id: sessionId },
      include: {
        assessments: { orderBy: { createdAt: 'desc' } },
        matches: { orderBy: [{ setVersion: 'desc' }, { rank: 'asc' }] },
        overrides: { orderBy: { createdAt: 'desc' }, take: 50 },
        audits: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!session) {
      throw Errors.notFound('Care navigation session not found');
    }

    const activeMatches = session.matches.filter((row) => row.setVersion === session.matchSetVersion);
    const response = this.presentDetail({ ...session, activeMatches });
    return response;
  }

  private presentListItem(
    row: {
      id: string;
      personId: string;
      countryId: string;
      status: CareNavSessionStatus;
      urgency: string | null;
      specialtyCode: string | null;
      redFlag: boolean;
      matchSetVersion: number;
      appointmentId: string | null;
      matchedAt: Date | null;
      completedAt: Date | null;
      terminatedAt: Date | null;
      expiresAt: Date;
      createdAt: Date;
      updatedAt: Date;
      matches: Array<{ id: string; rank: number; doctorProfileId: string | null }>;
      assessments: Array<{
        id: string;
        rulesVersion: string;
        urgency: string;
        redFlag: boolean;
        specialtyCodes: string[];
        explanationKey: string;
        emergencyGuidanceKey: string | null;
        createdAt: Date;
      }>;
    },
  ) {
    const assessment = row.assessments[0];
    return {
      id: row.id,
      person_id: row.personId,
      country_id: row.countryId,
      status: row.status,
      urgency: row.urgency,
      specialty_code: row.specialtyCode,
      red_flag: row.redFlag,
      match_set_version: row.matchSetVersion,
      appointment_id: row.appointmentId,
      matched_at: row.matchedAt?.toISOString() ?? null,
      completed_at: row.completedAt?.toISOString() ?? null,
      terminated_at: row.terminatedAt?.toISOString() ?? null,
      expires_at: row.expiresAt.toISOString(),
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      triage_state: assessment ? 'ASSESSED' : 'PENDING',
      match_state: row.matches.length > 0 ? 'MATCHED' : row.status === 'MATCHED' ? 'EMPTY' : 'NOT_MATCHED',
      recommendation_ids: row.matches.map((match) => match.id),
      assessment: assessment
        ? {
            id: assessment.id,
            rules_version: assessment.rulesVersion,
            urgency: assessment.urgency,
            red_flag: assessment.redFlag,
            specialty_codes: assessment.specialtyCodes,
            explanation_key: assessment.explanationKey,
            emergency_guidance_key: assessment.emergencyGuidanceKey,
            created_at: assessment.createdAt.toISOString(),
          }
        : null,
    };
  }

  private presentDetail(
    session: {
      id: string;
      personId: string;
      countryId: string;
      status: CareNavSessionStatus;
      urgency: string | null;
      specialtyCode: string | null;
      redFlag: boolean;
      matchSetVersion: number;
      appointmentId: string | null;
      matchedAt: Date | null;
      completedAt: Date | null;
      terminatedAt: Date | null;
      expiresAt: Date;
      createdAt: Date;
      updatedAt: Date;
      activeMatches: Array<{
        id: string;
        rank: number;
        doctorProfileId: string | null;
        explanationKey: string;
        setVersion: number;
        createdAt: Date;
      }>;
      matches: Array<{
        id: string;
        rank: number;
        doctorProfileId: string | null;
        explanationKey: string;
        setVersion: number;
        createdAt: Date;
      }>;
      assessments: Array<{
        id: string;
        rulesVersion: string;
        urgency: string;
        redFlag: boolean;
        specialtyCodes: string[];
        explanationKey: string;
        emergencyGuidanceKey: string | null;
        createdAt: Date;
      }>;
      overrides: Array<{
        id: string;
        actorPersonId: string;
        action: string;
        reason: string;
        priorState: Prisma.JsonValue;
        newState: Prisma.JsonValue;
        idempotencyKey: string | null;
        createdAt: Date;
      }>;
      audits: Array<{
        id: string;
        actorPersonId: string | null;
        action: string;
        metadata: Prisma.JsonValue;
        createdAt: Date;
      }>;
    },
  ) {
    return {
      ...this.presentListItem({
        ...session,
        matches: session.activeMatches.map((row) => ({
          id: row.id,
          rank: row.rank,
          doctorProfileId: row.doctorProfileId,
        })),
        assessments: session.assessments.slice(0, 1),
      }),
      assessments: session.assessments.map((row) => ({
        id: row.id,
        rules_version: row.rulesVersion,
        urgency: row.urgency,
        red_flag: row.redFlag,
        specialty_codes: row.specialtyCodes,
        explanation_key: row.explanationKey,
        emergency_guidance_key: row.emergencyGuidanceKey,
        created_at: row.createdAt.toISOString(),
      })),
      active_recommendations: session.activeMatches.map((row) => ({
        id: row.id,
        rank: row.rank,
        doctor_profile_id: row.doctorProfileId,
        explanation_key: row.explanationKey,
        set_version: row.setVersion,
        created_at: row.createdAt.toISOString(),
      })),
      recommendation_history: session.matches.map((row) => ({
        id: row.id,
        rank: row.rank,
        doctor_profile_id: row.doctorProfileId,
        explanation_key: row.explanationKey,
        set_version: row.setVersion,
        active: row.setVersion === session.matchSetVersion,
        created_at: row.createdAt.toISOString(),
      })),
      overrides: session.overrides.map((row) => ({
        id: row.id,
        actor_person_id: row.actorPersonId,
        action: row.action,
        reason: row.reason,
        prior_state: row.priorState,
        new_state: row.newState,
        idempotency_key: row.idempotencyKey,
        created_at: row.createdAt.toISOString(),
      })),
      audits: session.audits.map((row) => ({
        id: row.id,
        actor_person_id: row.actorPersonId,
        action: row.action,
        metadata: row.metadata,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  private assertAdminAudience(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin session required');
    }
  }

  private resolveLimit(limit?: number) {
    if (!limit || !Number.isFinite(limit)) {
      return DEFAULT_PAGE_SIZE;
    }
    return Math.min(Math.max(Math.floor(limit), 1), MAX_PAGE_SIZE);
  }

  private encodeCursor(createdAt: Date, id: string) {
    return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
  }

  private decodeCursor(cursor?: string) {
    if (!cursor?.trim()) {
      return null;
    }
    try {
      const decoded = Buffer.from(cursor.trim(), 'base64url').toString('utf8');
      const [createdAtRaw, id] = decoded.split('|');
      if (!createdAtRaw || !id) {
        return null;
      }
      const createdAt = new Date(createdAtRaw);
      if (Number.isNaN(createdAt.getTime())) {
        return null;
      }
      return { createdAt, id };
    } catch {
      throw Errors.validation('Invalid cursor');
    }
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
