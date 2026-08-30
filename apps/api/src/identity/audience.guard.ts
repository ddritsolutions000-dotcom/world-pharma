import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtAudience } from '@prisma/client';
import { Errors } from '../common/problem';
import { Principal } from './current-principal';
import { AUDIENCES_KEY } from './require-audiences';
import { RbacService } from './rbac.service';
import { SecurityEventsService } from './security-events.service';

@Injectable()
export class AudienceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
    private readonly events: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = this.reflector.getAllAndOverride<JwtAudience[]>(AUDIENCES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    const principal = request.principal;
    if (!principal) {
      throw Errors.unauthorized();
    }
    if (allowed.includes(principal.audience)) {
      return true;
    }
    if (allowed.includes('admin') && (await this.rbac.hasCompanyAuthority(principal.personId))) {
      return true;
    }
    await this.events.emit({
      type: 'APP_AUDIENCE_DENIED',
      outcome: 'failure',
      personId: principal.personId,
      metadata: {
        audience: principal.audience,
        required: allowed,
      },
    });
    throw Errors.forbidden('This application token cannot access this API family');
  }
}
