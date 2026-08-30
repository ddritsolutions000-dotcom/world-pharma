import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { assertInventoryOwner, requireInventoryLocation } from '../inventory/access';
import { SupportService } from '../platform/support.service';

const ALLOWED_REFS = new Set(['order', 'lot', 'dispensing_case', 'account']);

@Controller('store/support')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class StoreSupportController {
  constructor(
    private readonly support: SupportService,
    private readonly prisma: PrismaService,
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
      organization_id?: string;
      location_id?: string;
      subject?: string;
      body?: string;
      reference_type?: string;
      reference_id?: string;
    },
  ) {
    const organizationId = String(body.organization_id ?? '');
    const locationId = String(body.location_id ?? '');
    if (!organizationId || !locationId) {
      throw Errors.validation('organization_id and location_id are required.');
    }
    await assertInventoryOwner(this.prisma, principal, organizationId, locationId);
    await requireInventoryLocation(this.prisma, locationId, organizationId);

    const referenceType = body.reference_type?.trim();
    const referenceId = body.reference_id?.trim();
    if (referenceType || referenceId) {
      if (!referenceType || !referenceId || !ALLOWED_REFS.has(referenceType)) {
        throw Errors.validation('reference_type must be order, lot, dispensing_case, or account.');
      }
      await this.assertReferenceOwned(organizationId, locationId, referenceType, referenceId);
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
      organization_id: organizationId,
      location_id: locationId,
      category: 'store_ops',
      note: 'Shared support kernel. Clinical content must not be pasted into tickets.',
    };
  }

  private async assertReferenceOwned(
    organizationId: string,
    locationId: string,
    referenceType: string,
    referenceId: string,
  ): Promise<void> {
    if (referenceType === 'account') {
      if (referenceId !== organizationId) {
        throw Errors.forbidden('Account reference must match your store organization.');
      }
      return;
    }
    if (referenceType === 'order') {
      const order = await this.prisma.order.findUnique({
        where: { id: referenceId },
        select: { sellerOrgId: true, fulfillingLocationId: true },
      });
      if (
        !order ||
        order.sellerOrgId !== organizationId ||
        order.fulfillingLocationId !== locationId
      ) {
        throw Errors.forbidden('You cannot correlate support to another location’s order.');
      }
      return;
    }
    if (referenceType === 'lot') {
      const lot = await this.prisma.inventoryLot.findUnique({
        where: { id: referenceId },
        select: { ownerOrgId: true, locationId: true },
      });
      if (!lot || lot.ownerOrgId !== organizationId || lot.locationId !== locationId) {
        throw Errors.forbidden('You cannot correlate support to another location’s lot.');
      }
      return;
    }
    if (referenceType === 'dispensing_case') {
      const row = await this.prisma.dispensingCase.findUnique({
        where: { id: referenceId },
        select: { organizationId: true, locationId: true },
      });
      if (!row || row.organizationId !== organizationId) {
        throw Errors.forbidden('You cannot correlate support to another store’s dispensing case.');
      }
      if (row.locationId && row.locationId !== locationId) {
        throw Errors.forbidden('You cannot correlate support to another location’s dispensing case.');
      }
    }
  }
}
