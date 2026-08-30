import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PartnerApplicationSource } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PolicyResolver } from '../policy/resolver';
import { KycService } from './kyc.service';
import { PartnerService } from './partner.service';

@Controller('join')
export class JoinController {
  constructor(
    private readonly partners: PartnerService,
    private readonly kyc: KycService,
    private readonly policy: PolicyResolver,
  ) {}

  @Get('public')
  async publicJoin(@Query('country') countryCode: string) {
    if (!countryCode) {
      throw Errors.validation('country query parameter is required.');
    }
    const resolved = await this.policy.resolvePublished(countryCode);
    if (!resolved) {
      return { public: false, partner_types: [] };
    }
    const types = Object.entries(resolved.document.partner_types)
      .filter(([, row]) => row.enabled && row.join_public)
      .map(([code, row]) => ({
        code,
        enabled: row.enabled,
        join_public: row.join_public,
        required_documents: row.required_documents ?? [],
      }));
    return {
      public: types.length > 0,
      country_code: resolved.isoAlpha2,
      partner_types: types,
    };
  }

  @Post('applications')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('partner_applicant', 'customer')
  createApplication(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { partner_type_code?: string; country_code?: string },
  ) {
    if (!body.partner_type_code || !body.country_code) {
      throw Errors.validation('partner_type_code and country_code are required.');
    }
    return this.partners.createApplication({
      personId: principal.personId,
      partnerTypeCode: body.partner_type_code,
      countryCode: body.country_code,
      source: PartnerApplicationSource.PUBLIC,
      actorId: principal.personId,
    });
  }

  @Get('applications/me')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('partner_applicant', 'customer')
  async myApplications(@CurrentPrincipal() principal: Principal) {
    const rows = await this.partners.listApplicationsForPerson(principal.personId);
    return { data: rows };
  }

  @Get('applications/:id')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('partner_applicant', 'customer')
  getApplication(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.partners.getApplicationForPerson(principal.personId, id);
  }

  @Post('applications/:id/submit')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('partner_applicant', 'customer')
  submitApplication(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.partners.submitApplication(principal.personId, id);
  }

  @Get('applications/:id/required-documents')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('partner_applicant', 'customer')
  async requiredDocuments(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country') countryCode: string,
  ) {
    const app = await this.partners.getApplicationForPerson(principal.personId, id);
    const docs = await this.kyc.requiredDocuments(countryCode, app.partner_type_code);
    return { document_types: docs };
  }

  @Post('applications/:id/kyc/open')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('partner_applicant', 'customer')
  async openKyc(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    const app = await this.partners.getApplicationForPerson(principal.personId, id);
    const kycCase = await this.kyc.openCase({
      partnerId: app.partner_id,
      applicationId: app.id,
      actorId: principal.personId,
    });
    return { kyc_case_id: kycCase.id, status: kycCase.status };
  }

  @Get('applications/:id/documents')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('partner_applicant', 'customer')
  listDocuments(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.kyc.listDocumentsForApplication(id, principal.personId);
  }

  @Post('applications/:id/documents')
  @UseGuards(JwtAuthGuard, AudienceGuard)
  @RequireAudiences('partner_applicant', 'customer')
  async uploadDocument(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      document_type_code?: string;
      content_type?: string;
      original_name?: string;
      content_base64?: string;
    },
  ) {
    const app = await this.partners.getApplicationForPerson(principal.personId, id);
    if (!body.document_type_code || !body.content_type || !body.content_base64) {
      throw Errors.validation('document_type_code, content_type and content_base64 are required.');
    }
    const kycCase = await this.kyc.openCase({
      partnerId: app.partner_id,
      applicationId: app.id,
      actorId: principal.personId,
    });
    const bytes = Buffer.from(body.content_base64, 'base64');
    const uploaded = await this.kyc.uploadDocument({
      kycCaseId: kycCase.id,
      actorId: principal.personId,
      documentTypeCode: body.document_type_code,
      bytes,
      contentType: body.content_type,
      originalName: body.original_name ?? body.document_type_code,
    });
    return uploaded;
  }
}
