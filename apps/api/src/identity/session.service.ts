import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAudience, SessionStatus } from '@prisma/client';
import { AppEnv } from '@world-pharma/config';
import { hmacSha256Hex, randomToken, sha256Hex, uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from './security-events.service';
import { TokenService } from './token.service';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly events: SecurityEventsService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async issue(input: {
    personId: string;
    accountId: string;
    audience: JwtAudience;
    countryId?: string;
    organizationId?: string;
    regionId?: string;
    legalEntityId?: string;
    membershipId?: string;
    roles: string[];
    ip?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }> {
    const pepper = this.config.get('OTP_PEPPER', { infer: true });
    const refreshTtl = this.config.get('AUTH_REFRESH_TTL_SECONDS', { infer: true });
    const accessTtl = this.config.get('AUTH_ACCESS_TTL_SECONDS', { infer: true });
    const sessionId = uuidv7();
    const familyId = uuidv7();
    const refreshId = uuidv7();
    const rawRefresh = randomToken(32);
    const now = new Date();
    await this.prisma.session.create({
      data: {
        id: sessionId,
        personId: input.personId,
        accountId: input.accountId,
        membershipId: input.membershipId,
        audience: input.audience,
        countryId: input.countryId,
        status: SessionStatus.ACTIVE,
        tokenVersion: 1,
        ipHash: input.ip ? hmacSha256Hex(pepper, input.ip) : undefined,
        userAgentHash: input.userAgent ? sha256Hex(input.userAgent) : undefined,
        expiresAt: new Date(now.getTime() + refreshTtl * 1000),
        refreshTokens: {
          create: {
            id: refreshId,
            familyId,
            tokenHash: sha256Hex(rawRefresh),
            expiresAt: new Date(now.getTime() + refreshTtl * 1000),
          },
        },
      },
    });
    const accessToken = this.tokens.signAccess({
      sub: input.personId,
      sid: sessionId,
      aud: input.audience,
      membership_id: input.membershipId,
      roles: input.roles,
      country_id: input.countryId,
      organization_id: input.organizationId,
      region_id: input.regionId,
      legal_entity_id: input.legalEntityId,
      ver: 1,
    });
    await this.events.emit({
      type: 'SESSION_CREATED',
      outcome: 'success',
      personId: input.personId,
      sessionId,
      requestId: input.requestId,
      ipHash: input.ip ? hmacSha256Hex(pepper, input.ip) : undefined,
    });
    return { accessToken, refreshToken: rawRefresh, expiresIn: accessTtl, sessionId };
  }

  async rotate(
    rawRefresh: string,
    request: { ip?: string; requestId?: string },
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawRefresh) },
      include: { session: true },
    });
    if (!existing) {
      throw Errors.refreshInvalid();
    }
    if (existing.status !== 'ACTIVE' || existing.expiresAt <= new Date()) {
      if (existing.status === 'ROTATED') {
        await this.revokeFamily(existing.familyId, existing.session.personId, request.requestId);
      }
      throw Errors.refreshInvalid();
    }
    if (existing.session.status !== SessionStatus.ACTIVE) {
      throw Errors.refreshInvalid();
    }
    const refreshTtl = this.config.get('AUTH_REFRESH_TTL_SECONDS', { infer: true });
    const accessTtl = this.config.get('AUTH_ACCESS_TTL_SECONDS', { infer: true });
    const nextRaw = randomToken(32);
    const nextId = uuidv7();
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { status: 'ROTATED', rotatedAt: now, replacedById: nextId },
      }),
      this.prisma.refreshToken.create({
        data: {
          id: nextId,
          sessionId: existing.sessionId,
          familyId: existing.familyId,
          tokenHash: sha256Hex(nextRaw),
          expiresAt: new Date(now.getTime() + refreshTtl * 1000),
        },
      }),
      this.prisma.session.update({
        where: { id: existing.sessionId },
        data: { lastSeenAt: now },
      }),
    ]);
    const accessToken = this.tokens.signAccess({
      sub: existing.session.personId,
      sid: existing.session.id,
      aud: existing.session.audience,
      membership_id: existing.session.membershipId ?? undefined,
      roles: [],
      country_id: existing.session.countryId ?? undefined,
      ver: existing.session.tokenVersion,
    });
    await this.events.emit({
      type: 'REFRESH_TOKEN_ROTATED',
      outcome: 'success',
      personId: existing.session.personId,
      sessionId: existing.sessionId,
      requestId: request.requestId,
    });
    return {
      accessToken,
      refreshToken: nextRaw,
      expiresIn: accessTtl,
      sessionId: existing.sessionId,
    };
  }

  async revokeSession(sessionId: string, personId: string, requestId?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, personId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date() },
    });
    await this.prisma.refreshToken.updateMany({
      where: { sessionId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.events.emit({
      type: 'LOGOUT',
      outcome: 'success',
      personId,
      sessionId,
      requestId,
    });
  }

  async revokeAll(personId: string, requestId?: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { personId, status: SessionStatus.ACTIVE },
      select: { id: true },
    });
    await this.prisma.session.updateMany({
      where: { personId, status: SessionStatus.ACTIVE },
      data: { status: SessionStatus.REVOKED, revokedAt: new Date() },
    });
    await this.prisma.refreshToken.updateMany({
      where: { sessionId: { in: sessions.map((s) => s.id) }, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.events.emit({
      type: 'LOGOUT_ALL',
      outcome: 'success',
      personId,
      requestId,
    });
  }

  async listForPerson(personId: string, currentSessionId?: string) {
    const rows = await this.prisma.session.findMany({
      where: { personId },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        audience: row.audience,
        created_at: row.createdAt.toISOString(),
        last_seen_at: row.lastSeenAt.toISOString(),
        expires_at: row.expiresAt.toISOString(),
        revoked_at: row.revokedAt?.toISOString() ?? null,
        is_current: row.id === currentSessionId,
        ip_hint: row.ipHash ? row.ipHash.slice(0, 8) : null,
        device_hint: row.userAgentHash ? row.userAgentHash.slice(0, 8) : null,
      })),
    };
  }

  async revokeSessionByAdmin(input: {
    actorId: string;
    targetPersonId: string;
    sessionId: string;
    requestId?: string;
  }): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: input.sessionId } });
    if (!session || session.personId !== input.targetPersonId) {
      throw Errors.notFound('Session not found.');
    }
    if (session.status !== SessionStatus.ACTIVE) {
      return;
    }
    await this.revokeSession(input.sessionId, input.targetPersonId, input.requestId);
    await this.events.emit({
      type: 'SESSION_REVOKED',
      outcome: 'success',
      personId: input.actorId,
      sessionId: input.sessionId,
      requestId: input.requestId,
      metadata: { target_person_id: input.targetPersonId, revoked_by_admin: true },
    });
  }

  private async revokeFamily(familyId: string, personId: string, requestId?: string): Promise<void> {
    const tokens = await this.prisma.refreshToken.findMany({ where: { familyId } });
    const sessionIds = [...new Set(tokens.map((t) => t.sessionId))];
    await this.prisma.refreshToken.updateMany({
      where: { familyId },
      data: { status: 'REVOKED', reusedAt: new Date(), revokedAt: new Date() },
    });
    await this.prisma.session.updateMany({
      where: { id: { in: sessionIds } },
      data: { status: SessionStatus.STOLEN, revokedAt: new Date() },
    });
    await this.events.emit({
      type: 'REFRESH_TOKEN_REUSE_DETECTED',
      outcome: 'failure',
      personId,
      sessionId: sessionIds[0],
      requestId,
    });
  }
}
