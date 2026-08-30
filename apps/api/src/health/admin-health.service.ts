import { Injectable } from '@nestjs/common';
import { BreakGlassGrantKind, BreakGlassReviewStatus, ConsentGrantStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { presentConsentScope, parseConsentScope } from '../clinical/consent-scope';
import type { Principal } from '../identity/current-principal';
import { BreakGlassBridgeService } from './break-glass-bridge.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly breakGlass: BreakGlassBridgeService,
  ) {}

  async listConsentGrants(
    principal: Principal,
    query: { countryId?: string; status?: string; cursor?: string; limit?: number },
  ) {
    this.assertAdmin(principal);
    const take = this.resolveLimit(query.limit);
    const where: Prisma.ConsentGrantWhereInput = {};
    if (query.countryId?.trim()) {
      where.countryId = query.countryId.trim();
    }
    if (query.status?.trim()) {
      const status = query.status.trim().toUpperCase();
      if (!Object.values(ConsentGrantStatus).includes(status as ConsentGrantStatus)) {
        throw Errors.validation(`Invalid consent status: ${query.status}`);
      }
      where.status = status as ConsentGrantStatus;
    }
    const cursor = this.decodeCursor(query.cursor);
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.consentGrant.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: {
        id: true,
        countryId: true,
        subjectPersonId: true,
        recipientPartnerId: true,
        organizationId: true,
        purpose: true,
        scope: true,
        status: true,
        grantedAt: true,
        expiresAt: true,
        revokedAt: true,
        grantedByPersonId: true,
        breakGlassGrantId: true,
        createdAt: true,
      },
    });

    const page = rows.slice(0, take);
    const next = rows.length > take ? page[page.length - 1] : undefined;

    return {
      data: page.map((row) => ({
        id: row.id,
        country_id: row.countryId,
        subject_person_id: row.subjectPersonId,
        recipient_partner_id: row.recipientPartnerId,
        organization_id: row.organizationId,
        purpose: row.purpose,
        scope: this.safePresentConsentScope(row.scope),
        status: row.status,
        granted_at: row.grantedAt.toISOString(),
        expires_at: row.expiresAt?.toISOString() ?? null,
        revoked_at: row.revokedAt?.toISOString() ?? null,
        granted_by_person_id: row.grantedByPersonId,
        break_glass_grant_id: row.breakGlassGrantId,
        created_at: row.createdAt.toISOString(),
      })),
      next_cursor: next ? this.encodeCursor(next.createdAt, next.id) : null,
    };
  }

  async listAccessAudits(
    principal: Principal,
    query: {
      countryId?: string;
      patientPersonId?: string;
      doctorPartnerId?: string;
      allowed?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    this.assertAdmin(principal);
    const take = this.resolveLimit(query.limit);
    const where: Prisma.HealthArtifactAccessAuditWhereInput = {};
    if (query.countryId?.trim()) {
      where.countryId = query.countryId.trim();
    }
    if (query.patientPersonId?.trim()) {
      where.patientPersonId = query.patientPersonId.trim();
    }
    if (query.doctorPartnerId?.trim()) {
      where.doctorPartnerId = query.doctorPartnerId.trim();
    }
    if (query.allowed?.trim()) {
      const value = query.allowed.trim().toLowerCase();
      if (value === 'true') {
        where.allowed = true;
      } else if (value === 'false') {
        where.allowed = false;
      } else {
        throw Errors.validation('allowed must be true or false');
      }
    }
    const cursor = this.decodeCursor(query.cursor);
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.healthArtifactAccessAudit.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: {
        id: true,
        countryId: true,
        artifactId: true,
        actorPersonId: true,
        patientPersonId: true,
        doctorPartnerId: true,
        organizationId: true,
        purpose: true,
        allowed: true,
        reason: true,
        requestId: true,
        createdAt: true,
      },
    });

    const page = rows.slice(0, take);
    const next = rows.length > take ? page[page.length - 1] : undefined;

    return {
      data: page.map((row) => ({
        id: row.id,
        country_id: row.countryId,
        artifact_id: row.artifactId,
        actor_person_id: row.actorPersonId,
        patient_person_id: row.patientPersonId,
        doctor_partner_id: row.doctorPartnerId,
        organization_id: row.organizationId,
        purpose: row.purpose,
        allowed: row.allowed,
        reason: row.reason,
        request_id: row.requestId,
        created_at: row.createdAt.toISOString(),
      })),
      next_cursor: next ? this.encodeCursor(next.createdAt, next.id) : null,
    };
  }

  async listBreakGlass(
    principal: Principal,
    query: { activeOnly?: string; cursor?: string; limit?: number },
  ) {
    this.assertAdmin(principal);
    const take = this.resolveLimit(query.limit);
    const where: Prisma.BreakGlassGrantWhereInput = {
      kind: BreakGlassGrantKind.HEALTH_CLINICAL,
    };
    if (query.activeOnly?.trim().toLowerCase() === 'true') {
      where.revokedAt = null;
      where.expiresAt = { gt: new Date() };
      where.reviewStatus = { not: BreakGlassReviewStatus.CLOSED };
    }
    const cursor = this.decodeCursor(query.cursor);
    if (cursor) {
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ];
    }

    const rows = await this.prisma.breakGlassGrant.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      include: {
        bridgedConsents: {
          select: {
            id: true,
            purpose: true,
            status: true,
            expiresAt: true,
          },
          take: 1,
        },
      },
    });

    const page = rows.slice(0, take);
    const next = rows.length > take ? page[page.length - 1] : undefined;

    return {
      data: page.map((grant) =>
        this.breakGlassPresent(grant, grant.bridgedConsents[0] ?? null),
      ),
      next_cursor: next ? this.encodeCursor(next.createdAt, next.id) : null,
    };
  }

  openBreakGlass(
    principal: Principal,
    body: {
      patient_person_id: string;
      doctor_partner_id: string;
      country_id: string;
      reason: string;
      ticket_id?: string;
      ttl_minutes?: number;
      organization_id?: string;
    },
    requestId?: string,
  ) {
    this.assertAdmin(principal);
    if (!body.patient_person_id?.trim()) {
      throw Errors.validation('patient_person_id is required');
    }
    if (!body.doctor_partner_id?.trim()) {
      throw Errors.validation('doctor_partner_id is required');
    }
    if (!body.country_id?.trim()) {
      throw Errors.validation('country_id is required');
    }
    return this.breakGlass.openHealthBreakGlass({
      actorId: principal.personId,
      patientPersonId: body.patient_person_id.trim(),
      doctorPartnerId: body.doctor_partner_id.trim(),
      countryId: body.country_id.trim(),
      reason: body.reason,
      ticketId: body.ticket_id,
      ttlMinutes: body.ttl_minutes,
      organizationId: body.organization_id,
      requestId,
    });
  }

  reviewBreakGlass(
    principal: Principal,
    grantId: string,
    body: { review_notes?: string },
    requestId?: string,
  ) {
    this.assertAdmin(principal);
    return this.breakGlass.reviewHealthBreakGlass({
      actorId: principal.personId,
      grantId,
      reviewNotes: body.review_notes,
      requestId,
    });
  }

  private breakGlassPresent(
    grant: {
      id: string;
      kind: BreakGlassGrantKind;
      reason: string;
      expiresAt: Date;
      revokedAt: Date | null;
      countryId: string | null;
      patientPersonId: string | null;
      doctorPartnerId: string | null;
      ticketId: string | null;
      reviewStatus: BreakGlassReviewStatus;
      reviewedAt: Date | null;
      reviewedById: string | null;
      reviewNotes: string | null;
      grantedById: string;
      createdAt: Date;
    },
    consent: {
      id: string;
      purpose: string;
      status: ConsentGrantStatus;
      expiresAt: Date | null;
    } | null,
  ) {
    return {
      id: grant.id,
      kind: grant.kind,
      reason: grant.reason,
      expires_at: grant.expiresAt.toISOString(),
      revoked_at: grant.revokedAt?.toISOString() ?? null,
      country_id: grant.countryId,
      patient_person_id: grant.patientPersonId,
      doctor_partner_id: grant.doctorPartnerId,
      ticket_id: grant.ticketId,
      review_status: grant.reviewStatus,
      reviewed_at: grant.reviewedAt?.toISOString() ?? null,
      reviewed_by_id: grant.reviewedById,
      review_notes: grant.reviewNotes,
      granted_by_id: grant.grantedById,
      created_at: grant.createdAt.toISOString(),
      active: this.breakGlass.isGrantActive(grant),
      bridged_consent: consent
        ? {
            id: consent.id,
            purpose: consent.purpose,
            status: consent.status,
            expires_at: consent.expiresAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  private safePresentConsentScope(scope: Prisma.JsonValue) {
    try {
      return presentConsentScope(scope);
    } catch {
      return parseConsentScope([]);
    }
  }

  private assertAdmin(principal: Principal) {
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
}
