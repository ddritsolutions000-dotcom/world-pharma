import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '../common/problem';
import { Principal } from './current-principal';
import { RbacService } from './rbac.service';
import { SecurityEventsService } from './security-events.service';

export const PERMISSIONS_KEY = 'identity:permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
    private readonly events: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    const principal = request.principal;
    if (!principal) {
      throw Errors.unauthorized();
    }
    const allowed = await Promise.all(
      required.map((permission) => this.rbac.hasPermission(principal.personId, permission)),
    );
    if (!allowed.every(Boolean)) {
      await this.events.emit({
        type: 'PRIVILEGE_DENIED',
        outcome: 'failure',
        personId: principal.personId,
      });
      throw Errors.forbidden();
    }
    return true;
  }
}
