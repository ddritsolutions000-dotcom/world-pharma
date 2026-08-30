import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtAudience } from '@prisma/client';

export interface Principal {
  personId: string;
  sessionId: string;
  audience: JwtAudience;
  roles: string[];
  membershipId?: string;
  tokenVersion: number;
  countryId?: string;
  organizationId?: string;
  regionId?: string;
  legalEntityId?: string;
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const request = ctx.switchToHttp().getRequest<{ principal?: Principal }>();
    if (!request.principal) {
      throw new Error('principal_missing');
    }
    return request.principal;
  },
);
