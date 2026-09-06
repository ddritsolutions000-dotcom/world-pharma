import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PartnerStatus } from '@prisma/client';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CurrentPrincipal } from '../identity/current-principal';
import type { Principal } from '../identity/current-principal';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { PharmacyLicenceService, type SubmitLicenceDto } from './pharmacy-licence.service';
import { PartnerCommercialApprovalService } from './partner-commercial-approval.service';
import { PartnerOperationsService } from './partner-operations.service';
import { PartnerService } from './partner.service';
import { VendorActivationReadinessService } from './vendor-activation-readiness.service';

// ── Admin endpoints ────────────────────────────────────────────────────────

@Controller('admin/partners')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class PharmacyOnboardingController {
  constructor(
    private readonly licenceService: PharmacyLicenceService,
    private readonly commercial: PartnerCommercialApprovalService,
    private readonly readiness: VendorActivationReadinessService,
    private readonly ops: PartnerOperationsService,
    private readonly partners: PartnerService,
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventsService,
  ) {}

  // ── Pharmacy licence management (admin) ───────────────────────────────────

  @Get(':partnerId/pharmacy-licence')
  @RequirePermissions('partner:manage')
  getLicence(@Param('partnerId') partnerId: string) {
    return this.licenceService.getForPartner(partnerId);
  }

  @Get(':partnerId/pharmacy-licence/history')
  @RequirePermissions('partner:manage')
  licenceHistory(@Param('partnerId') partnerId: string) {
    return this.licenceService.history(partnerId);
  }

  @Get(':partnerId/document-checklist')
  @RequirePermissions('partner:manage')
  documentChecklist(@Param('partnerId') partnerId: string) {
    return this.ops.documentChecklist(partnerId);
  }

  @Get(':partnerId/operations-readiness')
  @RequirePermissions('partner:manage')
  operationsByPartner(@Param('partnerId') partnerId: string) {
    return this.ops.evaluateByPartnerId(partnerId);
  }

  @Post('licences/:id/under-review')
  @RequirePermissions('partner:manage')
  markUnderReview(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.licenceService.markUnderReview(principal, id);
  }

  @Post('licences/:id/verify')
  @RequirePermissions('partner:manage')
  verifyLicence(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.licenceService.verifyLicence(principal, id);
  }

  @Post('licences/:id/reject')
  @RequirePermissions('partner:manage')
  rejectLicence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    return this.licenceService.rejectLicence(principal, id, body.reason ?? 'Rejected by admin');
  }

  @Post('licences/:id/expire')
  @RequirePermissions('partner:manage')
  expireLicence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.licenceService.expireLicence(principal, id, body.reason);
  }

  @Post(':partnerId/pharmacy-licence/replace')
  @RequirePermissions('partner:manage')
  replaceLicence(
    @CurrentPrincipal() principal: Principal,
    @Param('partnerId') partnerId: string,
    @Body() body: SubmitLicenceDto,
  ) {
    return this.licenceService.replaceLicence(principal, partnerId, body);
  }

  // ── Commercial approval (admin) ───────────────────────────────────────────

  @Get(':partnerId/commercial-approval')
  @RequirePermissions('partner:manage')
  getCommercialApproval(@Param('partnerId') partnerId: string) {
    return this.commercial.get(partnerId);
  }

  @Get(':partnerId/commercial-approval/history')
  @RequirePermissions('partner:manage')
  commercialHistory(@Param('partnerId') partnerId: string) {
    return this.commercial.history(partnerId);
  }

  @Post(':partnerId/commercial-approval/approve')
  @RequirePermissions('partner:manage')
  approveCommercial(
    @CurrentPrincipal() principal: Principal,
    @Param('partnerId') partnerId: string,
    @Body() body: { notes?: string },
  ) {
    return this.commercial.approve(principal, partnerId, body.notes);
  }

  @Post(':partnerId/commercial-approval/revoke')
  @RequirePermissions('partner:manage')
  revokeCommercial(
    @CurrentPrincipal() principal: Principal,
    @Param('partnerId') partnerId: string,
    @Body() body: { notes?: string },
  ) {
    return this.commercial.revoke(principal, partnerId, body.notes);
  }

  // ── Full pharmacy onboarding readiness for Admin ──────────────────────────

  @Get('applications/:applicationId/pharmacy-readiness')
  @RequirePermissions('partner:manage')
  async pharmacyReadiness(@Param('applicationId') applicationId: string) {
    const readiness = await this.readiness.evaluateByApplicationId(applicationId);
    const blockers = this.extractBlockers(readiness.conditions);
    return { ...readiness, blockers };
  }

  @Get('applications/:applicationId/operations-readiness')
  @RequirePermissions('partner:manage')
  operationsReadiness(@Param('applicationId') applicationId: string) {
    return this.ops.evaluateByApplicationId(applicationId);
  }

  @Post('applications/:applicationId/activate-pharmacy')
  @RequirePermissions('partner:manage')
  async activatePharmacy(
    @CurrentPrincipal() principal: Principal,
    @Param('applicationId') applicationId: string,
    @Body()
    body: { organization_id?: string; location_id?: string; role_code?: string },
  ) {
    const gate = await this.ops.activatePharmacyPartner({
      principal,
      applicationId,
      organizationId: body.organization_id,
      locationId: body.location_id,
      roleCode: body.role_code,
    });
    if (gate.idempotent && gate.activated) {
      return gate;
    }
    const activated = await this.partners.activateApplication({
      applicationId,
      organizationId: body.organization_id,
      locationId: body.location_id,
      roleCode: body.role_code,
      actorId: principal.personId,
      skipReadinessGate: true, // ops gate already enforced above
    });
    await this.security.emit({
      type: 'PARTNER_OPS_ACTIVATED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { application_id: applicationId, partner_id: gate.partner_id },
    });
    const refreshed = await this.ops.evaluateByApplicationId(applicationId);
    return { ...refreshed, activated: true, application: activated };
  }

  @Post(':partnerId/suspend')
  @RequirePermissions('partner:manage')
  async suspendPartner(
    @CurrentPrincipal() principal: Principal,
    @Param('partnerId') partnerId: string,
    @Body() body: { reason?: string },
  ) {
    const application = await this.prisma.partnerApplication.findFirst({
      where: { partnerId, status: PartnerStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!application) {
      // Fall back: transition partner directly if application already ACTIVE
      const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
      if (!partner) throw Errors.notFound('Partner not found');
      if (partner.status !== PartnerStatus.ACTIVE) {
        throw Errors.validation('Only ACTIVE partners can be suspended');
      }
      const app = await this.prisma.partnerApplication.findFirst({
        where: { partnerId },
        orderBy: { createdAt: 'desc' },
      });
      if (!app) throw Errors.notFound('Partner application not found');
      const updated = await this.partners.transition({
        applicationId: app.id,
        to: PartnerStatus.SUSPENDED,
        actorId: principal.personId,
        reason: body.reason ?? 'Suspended by admin',
      });
      await this.security.emit({
        type: 'PARTNER_OPS_SUSPENDED',
        outcome: 'success',
        personId: principal.personId,
        metadata: { partner_id: partnerId, reason: body.reason ?? null },
      });
      return { ...updated, operations: await this.ops.evaluateByApplicationId(app.id) };
    }
    const updated = await this.partners.transition({
      applicationId: application.id,
      to: PartnerStatus.SUSPENDED,
      actorId: principal.personId,
      reason: body.reason ?? 'Suspended by admin',
    });
    await this.security.emit({
      type: 'PARTNER_OPS_SUSPENDED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { partner_id: partnerId, reason: body.reason ?? null },
    });
    return {
      ...updated,
      operations: await this.ops.evaluateByApplicationId(application.id),
    };
  }

  @Post(':partnerId/reactivate')
  @RequirePermissions('partner:manage')
  async reactivatePartner(
    @CurrentPrincipal() principal: Principal,
    @Param('partnerId') partnerId: string,
    @Body() body: { reason?: string },
  ) {
    const application = await this.prisma.partnerApplication.findFirst({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
    });
    if (!application) throw Errors.notFound('Partner application not found');
    if (application.status !== PartnerStatus.SUSPENDED) {
      throw Errors.validation('Partner is not suspended');
    }
    // Request reactivation then activate only if ops gates pass.
    await this.partners.transition({
      applicationId: application.id,
      to: PartnerStatus.REACTIVATION_REQUESTED,
      actorId: principal.personId,
      reason: body.reason ?? 'Reactivation requested',
    });
    await this.partners.transition({
      applicationId: application.id,
      to: PartnerStatus.UNDER_REVIEW,
      actorId: principal.personId,
      reason: 'Reactivation review',
    });
    // Move to APPROVED then ACTIVE only when ops readiness passes.
    await this.partners.transition({
      applicationId: application.id,
      to: PartnerStatus.VERIFIED,
      actorId: principal.personId,
      reason: 'Reactivation verified',
    });
    await this.partners.transition({
      applicationId: application.id,
      to: PartnerStatus.APPROVED,
      actorId: principal.personId,
      reason: 'Reactivation approved',
    });
    const gate = await this.ops.evaluateByApplicationId(application.id);
    if (!gate.ready_for_activation && gate.partner_status !== PartnerStatus.ACTIVE) {
      throw Errors.validation(
        `Cannot reactivate — blockers: ${gate.blockers.join(', ') || 'unknown'}`,
      );
    }
    await this.partners.activateApplication({
      applicationId: application.id,
      actorId: principal.personId,
      skipReadinessGate: true,
    });
    await this.security.emit({
      type: 'PARTNER_OPS_REACTIVATED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { partner_id: partnerId },
    });
    return this.ops.evaluateByApplicationId(application.id);
  }

  private extractBlockers(
    conditions: Array<{ code: string; required: boolean; satisfied: boolean; detail: string | null }>,
  ): string[] {
    const BLOCKER_MAP: Record<string, string> = {
      profile_complete: 'PROFILE_INCOMPLETE',
      documents_complete: 'KYC_MISSING',
      application_approved: 'COMMERCIAL_APPROVAL_REQUIRED',
      organization_linked: 'ORGANIZATION_NOT_LINKED',
      organization_active: 'ORGANIZATION_INACTIVE',
      catalog_ready: 'NO_PUBLISHED_OFFER',
      inventory_ready: 'NO_STOCK',
      serviceability_ready: 'SERVICEABILITY_MISSING',
      marketplace_eligible: 'COMMERCIAL_APPROVAL_REQUIRED',
      pharmacy_licence_verified: 'PHARMACY_LICENSE_UNVERIFIED',
      kyc_verified: 'KYC_NOT_VERIFIED',
      commercial_approved: 'COMMERCIAL_APPROVAL_REQUIRED',
      partner_active: 'COMMERCIAL_APPROVAL_REQUIRED',
    };
    return conditions
      .filter((c) => c.required && !c.satisfied)
      .map((c) => {
        if (c.detail && /^[A-Z_]+$/.test(c.detail)) return c.detail;
        return BLOCKER_MAP[c.code] ?? c.code.toUpperCase();
      });
  }
}

// ── Vendor self-service readiness endpoint ─────────────────────────────────

@Controller('vendor/onboarding')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class VendorPharmacyReadinessController {
  constructor(
    private readonly licenceService: PharmacyLicenceService,
    private readonly readiness: VendorActivationReadinessService,
    private readonly ops: PartnerOperationsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Vendor can submit their pharmacy licence (self-service). */
  @Post('pharmacy-licence')
  async submitLicence(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SubmitLicenceDto & { partner_id: string },
  ) {
    return this.licenceService.submitLicence(principal, body.partner_id, body);
  }

  @Post('pharmacy-licence/replace')
  async replaceLicence(
    @CurrentPrincipal() principal: Principal,
    @Body() body: SubmitLicenceDto & { partner_id: string },
  ) {
    return this.licenceService.replaceLicence(principal, body.partner_id, body);
  }

  /** Vendor can read their own onboarding readiness. */
  @Get(':applicationId/readiness')
  async vendorReadiness(
    @CurrentPrincipal() principal: Principal,
    @Param('applicationId') applicationId: string,
  ) {
    const application = await this.prisma.partnerApplication.findUnique({
      where: { id: applicationId },
      include: { partner: true },
    });
    if (!application) throw Errors.notFound('Application not found');
    if (application.partner.personId !== principal.personId) {
      throw Errors.forbidden('Not authorized');
    }
    const readiness = await this.readiness.evaluateByApplicationId(applicationId);
    const conditions = readiness.conditions.map((c) => ({
      code: c.code,
      label: c.label,
      satisfied: c.satisfied,
      required: c.required,
      detail: c.code === 'commercial_approved' ? null : c.detail,
      next_action: c.next_action,
    }));
    return { ...readiness, conditions };
  }

  /** Sprint 43 — vendor-facing operations readiness (no private evidence / admin notes). */
  @Get(':applicationId/operations-readiness')
  async vendorOpsReadiness(
    @CurrentPrincipal() principal: Principal,
    @Param('applicationId') applicationId: string,
  ) {
    const application = await this.prisma.partnerApplication.findUnique({
      where: { id: applicationId },
      include: { partner: true },
    });
    if (!application) throw Errors.notFound('Application not found');
    if (application.partner.personId !== principal.personId) {
      throw Errors.forbidden('Not authorized');
    }
    const ops = await this.ops.evaluateByApplicationId(applicationId);
    return {
      partner_id: ops.partner_id,
      application_id: ops.application_id,
      country_code: ops.country_code,
      lifecycle: ops.lifecycle,
      partner_status: ops.partner_status,
      licence_readiness: ops.licence_readiness,
      kyc_readiness: {
        status: ops.kyc_readiness.status,
        verified: ops.kyc_readiness.verified,
        verification_class: ops.kyc_readiness.verification_class,
        external_gated: ops.kyc_readiness.external_gated,
        // Never expose other partners' data or admin notes
      },
      commercial_readiness: {
        approved: ops.commercial_readiness.approved,
        // Hide approver identity from vendor
      },
      organization_readiness: ops.organization_readiness,
      catalog_readiness: ops.catalog_readiness,
      inventory_readiness: ops.inventory_readiness,
      serviceability_readiness: ops.serviceability_readiness,
      marketplace_eligibility: {
        eligible: ops.marketplace_eligibility.eligible,
      },
      country_production: ops.country_production,
      document_checklist: ops.document_checklist.map((row) => ({
        requirement_code: row.requirement_code,
        label: row.label,
        required: row.required,
        submitted: row.submitted,
        verified: row.verified,
        expiry: row.expiry,
        status: row.status,
      })),
      final_status: ops.final_status,
      ready_for_activation: ops.ready_for_activation,
      marketplace_purchasable: ops.marketplace_purchasable,
      blockers: ops.blockers,
      warnings: ops.warnings,
      conditions: ops.conditions.map((c) => ({
        code: c.code,
        label: c.label,
        satisfied: c.satisfied,
        required: c.required,
        detail: c.code === 'commercial_approved' ? null : c.detail,
        next_action: c.next_action,
      })),
    };
  }
}
