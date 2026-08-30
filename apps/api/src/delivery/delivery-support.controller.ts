import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { SupportService } from '../platform/support.service';
import { DeliveryService } from './delivery.service';

const ALLOWED_REFS = new Set(['logistics_job']);

@Controller('delivery/support')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class DeliverySupportController {
  constructor(
    private readonly support: SupportService,
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
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
    await this.delivery.assertRiderAccess(principal);

    const referenceType = body.reference_type?.trim();
    const referenceId = body.reference_id?.trim();
    if (referenceType || referenceId) {
      if (!referenceType || !referenceId || !ALLOWED_REFS.has(referenceType)) {
        throw Errors.validation('reference_type must be logistics_job.');
      }
      await this.assertJobReference(principal, referenceId);
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
      category: 'delivery',
      note: 'Shared support kernel. No clinical or recipient PHI in ticket bodies.',
    };
  }

  private async assertJobReference(principal: Principal, jobId: string): Promise<void> {
    const job = await this.prisma.logisticsJob.findUnique({
      where: { id: jobId },
      select: { assigneeId: true },
    });
    if (!job) {
      throw Errors.notFound('Job not found.');
    }
    if (job.assigneeId && job.assigneeId !== principal.personId) {
      throw Errors.forbidden('You cannot correlate support to another rider’s job.');
    }
  }
}
