import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { MetricsService } from '../common/metrics.service';
import { Principal } from './current-principal';
import { SecurityEventsService } from './security-events.service';
import { TokenService } from './token.service';
import { authTenantContext } from '../tenancy/build-tenant-context';
import { parseCookieHeader, readAccessTokenFromRequest } from './auth-cookies';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const cookies = parseCookieHeader(request.header('cookie'));
    const token = readAccessTokenFromRequest(request.header('authorization'), cookies);
    if (!token) {
      this.metrics.increment('auth_failure_total', { reason: 'missing' });
      throw Errors.unauthorized();
    }
    let claims;
    try {
      claims = this.tokens.verifyAccess(token);
    } catch {
      this.metrics.increment('auth_failure_total', { reason: 'invalid' });
      await this.events.emit({ type: 'UNAUTHORIZED_ACCESS_ATTEMPT', outcome: 'failure' });
      throw Errors.unauthorized();
    }
    const session = await this.prisma.runWithTenant(authTenantContext(claims.sub), () =>
      this.prisma.session.findUnique({
        where: { id: claims.sid },
        include: { account: true, person: true },
      }),
    );
    if (
      !session ||
      session.status !== SessionStatus.ACTIVE ||
      session.personId !== claims.sub ||
      session.tokenVersion !== claims.ver ||
      session.expiresAt <= new Date()
    ) {
      throw Errors.unauthorized();
    }
    if (session.person.status === 'DISABLED' || session.account.status !== 'ACTIVE') {
      throw Errors.accountDenied();
    }
    request.principal = {
      personId: claims.sub,
      sessionId: claims.sid,
      audience: claims.aud,
      roles: claims.roles ?? [],
      membershipId: claims.membership_id,
      tokenVersion: claims.ver,
      countryId: claims.country_id,
      organizationId: claims.organization_id,
      regionId: claims.region_id,
      legalEntityId: claims.legal_entity_id,
    };
    return true;
  }
}
