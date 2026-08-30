import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { SupportService } from './support.service';

@Controller('support')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'doctor', 'admin', 'partner_applicant')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  async list(@CurrentPrincipal() principal: Principal) {
    return { data: await this.support.listTickets(principal.personId) };
  }

  @Post('tickets')
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      subject?: string;
      body?: string;
      country_code?: string;
      reference_type?: string;
      reference_id?: string;
      idempotency_key?: string;
    },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.support.createTicket({
      personId: principal.personId,
      subject: String(body.subject ?? ''),
      body: String(body.body ?? ''),
      countryCode: body.country_code,
      referenceType: body.reference_type,
      referenceId: body.reference_id,
      idempotencyKey: body.idempotency_key ?? idempotencyHeader,
    });
  }

  @Get('tickets/:id')
  getTicket(@CurrentPrincipal() principal: Principal, @Param('id') ticketId: string) {
    return this.support.getCustomerTicket(principal.personId, ticketId);
  }

  @Post('tickets/:id/messages')
  addMessage(
    @CurrentPrincipal() principal: Principal,
    @Param('id') ticketId: string,
    @Body() body: { body?: string; idempotency_key?: string },
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    return this.support.addCustomerMessage(
      principal.personId,
      ticketId,
      String(body.body ?? ''),
      body.idempotency_key ?? idempotencyHeader,
    );
  }

  @Post('tickets/:id/close')
  close(@CurrentPrincipal() principal: Principal, @Param('id') ticketId: string) {
    return this.support.closeCustomerTicket(principal.personId, ticketId);
  }
}
