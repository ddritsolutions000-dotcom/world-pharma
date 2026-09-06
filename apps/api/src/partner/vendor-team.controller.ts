import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { VendorTeamService } from './vendor-team.service';

@Controller('vendor/team')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class VendorTeamController {
  constructor(private readonly team: VendorTeamService) {}

  @Get('members')
  listMembers(
    @CurrentPrincipal() principal: Principal,
    @Query('seller_org_id') sellerOrgId: string,
  ) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.team.listMembers(principal, sellerOrgId);
  }

  @Post('invitations')
  invite(
    @CurrentPrincipal() principal: Principal,
    @Body() body: Record<string, unknown>,
  ) {
    const sellerOrgId = typeof body['seller_org_id'] === 'string' ? body['seller_org_id'].trim() : '';
    const roleCode = typeof body['role_code'] === 'string' ? body['role_code'].trim() : '';
    const countryCode = typeof body['country_code'] === 'string' ? body['country_code'].trim() : '';
    const email = typeof body['email'] === 'string' ? body['email'].trim() : undefined;
    if (!sellerOrgId || !roleCode) {
      throw Errors.validation('seller_org_id and role_code are required.');
    }
    return this.team.createInvitation(principal, sellerOrgId, {
      email,
      role_code: roleCode,
      country_code: countryCode,
    });
  }

  @Post('invitations/accept')
  acceptInvitation(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    const token = typeof body['token'] === 'string' ? body['token'].trim() : '';
    if (!token) {
      throw Errors.validation('token is required.');
    }
    return this.team.acceptInvitation(principal, token);
  }

  @Delete('members/:membershipId')
  removeMember(
    @CurrentPrincipal() principal: Principal,
    @Param('membershipId') membershipId: string,
    @Query('seller_org_id') sellerOrgId: string,
  ) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required.');
    }
    return this.team.removeMember(principal, sellerOrgId, membershipId);
  }
}
