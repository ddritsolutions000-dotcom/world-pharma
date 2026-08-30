import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { assertVendorSellerAccess } from '../catalog/access';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { SupportService } from './support.service';

const ALLOWED_REFS = new Set(['order', 'settlement_line', 'shipment', 'account']);

@Controller('vendor/support')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class VendorSupportController {
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
      seller_org_id?: string;
      subject?: string;
      body?: string;
      reference_type?: string;
      reference_id?: string;
    },
  ) {
    const sellerOrgId = String(body.seller_org_id ?? '');
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);

    const referenceType = body.reference_type?.trim();
    const referenceId = body.reference_id?.trim();
    if (referenceType || referenceId) {
      if (!referenceType || !referenceId || !ALLOWED_REFS.has(referenceType)) {
        throw Errors.validation('reference_type must be order, settlement_line, shipment, or account.');
      }
      await this.assertReferenceOwned(principal, sellerOrgId, referenceType, referenceId);
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
      seller_org_id: sellerOrgId,
      note: 'Shared support kernel. Clinical content must not be pasted into tickets.',
    };
  }

  private async assertReferenceOwned(
    principal: Principal,
    sellerOrgId: string,
    referenceType: string,
    referenceId: string,
  ): Promise<void> {
    if (referenceType === 'account') {
      if (referenceId !== sellerOrgId) {
        throw Errors.forbidden('Account reference must match your seller organization.');
      }
      return;
    }
    if (referenceType === 'order') {
      const order = await this.prisma.order.findUnique({
        where: { id: referenceId },
        select: { sellerOrgId: true },
      });
      if (!order || order.sellerOrgId !== sellerOrgId) {
        throw Errors.forbidden('You cannot correlate support to another seller’s order.');
      }
      await assertVendorSellerAccess(this.prisma, principal, order.sellerOrgId);
      return;
    }
    if (referenceType === 'settlement_line') {
      const line = await this.prisma.settlementLine.findUnique({
        where: { id: referenceId },
        select: { sellerOrgId: true },
      });
      if (!line || line.sellerOrgId !== sellerOrgId) {
        throw Errors.forbidden('You cannot correlate support to another seller’s settlement.');
      }
      await assertVendorSellerAccess(this.prisma, principal, line.sellerOrgId);
      return;
    }
    if (referenceType === 'shipment') {
      const shipment = await this.prisma.shipment.findUnique({
        where: { id: referenceId },
        select: { sellerOrgId: true },
      });
      if (!shipment || shipment.sellerOrgId !== sellerOrgId) {
        throw Errors.forbidden('You cannot correlate support to another seller’s shipment.');
      }
      await assertVendorSellerAccess(this.prisma, principal, shipment.sellerOrgId);
    }
  }
}
