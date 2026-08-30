import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { SupportService } from '../platform/support.service';
import { PartnerService } from './partner.service';

const ALLOWED_REFS = new Set(['partner_application']);

@Controller('join/support')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('partner_applicant', 'customer')
export class JoinSupportController {
  constructor(
    private readonly support: SupportService,
    private readonly partners: PartnerService,
  ) {}

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
      reference_type?: string;
      reference_id?: string;
    },
  ) {
    const referenceType = body.reference_type?.trim();
    const referenceId = body.reference_id?.trim();
    if (referenceType || referenceId) {
      if (!referenceType || !referenceId || !ALLOWED_REFS.has(referenceType)) {
        throw Errors.validation('reference_type must be partner_application.');
      }
      await this.partners.getApplicationForPerson(principal.personId, referenceId);
    }

    const ticket = await this.support.createTicket({
      personId: principal.personId,
      subject: String(body.subject ?? ''),
      body: String(body.body ?? ''),
      referenceType,
      referenceId,
    });
    return {
      ...ticket,
      category: 'onboarding',
      note: 'Shared support kernel. Do not paste KYC document contents into tickets.',
    };
  }
}
