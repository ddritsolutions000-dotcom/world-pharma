import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { ConsentService } from './consent.service';

@Controller('consent')
@UseGuards(JwtAuthGuard)
export class ConsentController {
  constructor(private readonly consents: ConsentService) {}

  @Post('grants')
  @HttpCode(200)
  grant(
    @Body()
    body: {
      recipient_partner_id?: string;
      purpose?: string;
      scope?: string[];
      organization_id?: string;
      expires_at?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.recipient_partner_id || !body.purpose) {
      throw Errors.validation('recipient_partner_id and purpose are required');
    }
    return this.consents.grant({
      actorId: principal.personId,
      subjectPersonId: principal.personId,
      recipientPartnerId: body.recipient_partner_id,
      purpose: body.purpose,
      scope: body.scope,
      organizationId: body.organization_id,
      expiresAt: body.expires_at,
    });
  }

  @Post('grants/:id/revoke')
  @HttpCode(200)
  revoke(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.consents.revoke({ actorId: principal.personId, consentId: id });
  }

  @Get('grants')
  list(@CurrentPrincipal() principal: Principal) {
    return this.consents.listForSubject(principal.personId);
  }
}
