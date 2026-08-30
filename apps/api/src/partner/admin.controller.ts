import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InvitationKind, OrganizationKind, PartnerApplicationSource, PartnerStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { InvitationService } from './invitation.service';
import { KycService } from './kyc.service';
import { OrganizationService } from './organization.service';
import { PartnerService } from './partner.service';

@Controller('admin/partners')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class PartnerAdminController {
  constructor(
    private readonly partners: PartnerService,
    private readonly kyc: KycService,
    private readonly orgs: OrganizationService,
    private readonly invitations: InvitationService,
  ) {}

  @Post('applications')
  @HttpCode(200)
  @RequirePermissions('partner:manage')
  createApplication(
    @Body()
    body: {
      person_id?: string;
      partner_type_code?: string;
      country_code?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.person_id || !body.partner_type_code || !body.country_code) {
      throw Errors.validation('person_id, partner_type_code and country_code are required');
    }
    return this.partners.createApplication({
      personId: body.person_id,
      partnerTypeCode: body.partner_type_code,
      countryCode: body.country_code,
      source: PartnerApplicationSource.INTERNAL,
      actorId: principal.personId,
    });
  }

  @Post('applications/:id/transition')
  @HttpCode(200)
  @RequirePermissions('partner:manage')
  transition(
    @Param('id') id: string,
    @Body() body: { to?: PartnerStatus; reason?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.to || !body.reason) {
      throw Errors.validation('to and reason are required');
    }
    return this.partners.transition({
      applicationId: id,
      to: body.to,
      actorId: principal.personId,
      reason: body.reason,
    });
  }

  @Post(':partnerId/kyc')
  @HttpCode(200)
  @RequirePermissions('kyc:review')
  openKyc(
    @Param('partnerId') partnerId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.kyc.openCase({ partnerId, actorId: principal.personId });
  }

  @Post('organizations')
  @HttpCode(200)
  @RequirePermissions('partner:manage')
  createOrg(
    @Body()
    body: {
      country_code?: string;
      kind?: OrganizationKind;
      legal_name?: string;
      display_name?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.country_code || !body.kind || !body.legal_name || !body.display_name) {
      throw Errors.validation('country_code, kind, legal_name and display_name are required');
    }
    return this.orgs.create({
      countryCode: body.country_code,
      kind: body.kind,
      legalName: body.legal_name,
      displayName: body.display_name,
      actorId: principal.personId,
    });
  }

  @Post('invitations')
  @HttpCode(200)
  @RequirePermissions('partner:manage')
  invite(
    @Body()
    body: {
      kind?: InvitationKind;
      country_code?: string;
      intended_role_code?: string;
      partner_type_code?: string;
      organization_id?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.kind || !body.country_code || !body.intended_role_code) {
      throw Errors.validation('kind, country_code and intended_role_code are required');
    }
    return this.invitations.create({
      kind: body.kind,
      countryCode: body.country_code,
      invitedById: principal.personId,
      intendedRoleCode: body.intended_role_code,
      partnerTypeCode: body.partner_type_code,
      organizationId: body.organization_id,
    });
  }

  @Get('documents/:id')
  @RequirePermissions('kyc:document_read')
  async viewDocument(
    @Param('id') id: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    const result = await this.kyc.readDocument({
      documentId: id,
      actorId: principal.personId,
      permission: 'view',
    });
    return {
      content_type: result.contentType,
      original_name: result.originalName,
      byte_size: result.bytes.length,
      content_base64: result.bytes.toString('base64'),
      watermark: 'CONFIDENTIAL — VIEW AUDITED',
    };
  }

  @Post('documents/:id/review')
  @HttpCode(200)
  @RequirePermissions('kyc:review')
  reviewDocument(
    @Param('id') id: string,
    @Body() body: { approve?: boolean; reason?: string },
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.kyc.reviewDocument({
      documentId: id,
      actorId: principal.personId,
      approve: Boolean(body.approve),
      reason: body.reason,
    });
  }

  @Get('applications/:id/documents')
  @RequirePermissions('partner:manage')
  listApplicationDocuments(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    return this.kyc.listDocumentsForApplication(id, principal.personId);
  }

  @Get('applications')
  @RequirePermissions('partner:manage')
  listApplications(
    @Query('status') status?: PartnerStatus,
    @Query('country_code') countryCode?: string,
  ) {
    return this.partners.listApplicationsForReview({ status, countryCode });
  }

  @Get('applications/:id')
  @RequirePermissions('partner:manage')
  getApplication(@Param('id') id: string) {
    return this.partners.getApplicationForReview(id);
  }

  @Post('applications/:id/activate')
  @HttpCode(200)
  @RequirePermissions('partner:manage')
  activate(
    @Param('id') id: string,
    @Body()
    body: {
      organization_id?: string;
      location_id?: string;
      role_code?: string;
    },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!body.organization_id) {
      throw Errors.validation('organization_id is required');
    }
    return this.partners.activateApplication({
      applicationId: id,
      organizationId: body.organization_id,
      locationId: body.location_id,
      roleCode: body.role_code,
      actorId: principal.personId,
    });
  }

}
