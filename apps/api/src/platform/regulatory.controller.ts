import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { Errors } from '../common/problem';
import { RegulatoryService } from './regulatory.service';
import { CountryProductionService } from './country-production.service';
import { FinalLaunchReadinessService } from './final-launch-readiness.service';
import { FirstCountryLaunchService } from './first-country-launch.service';
import type {
  AttachEvidenceDto,
  CreateHealthcarePolicyDto,
  RegisterDependencyDto,
} from './regulatory.service';
import type { ProductionLifecycleState } from './production-lifecycle';

@Controller('admin/regulatory')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class RegulatoryController {
  constructor(
    private readonly regulatory: RegulatoryService,
    private readonly production: CountryProductionService,
    private readonly finalLaunch: FinalLaunchReadinessService,
    private readonly firstCountry: FirstCountryLaunchService,
  ) {}

  // ── Healthcare Policy ──────────────────────────────────────────────────────

  @Post('countries/:iso/healthcare-policy')
  @RequirePermissions('policy:publish')
  createHealthcarePolicy(
    @CurrentPrincipal() principal: Principal,
    @Param('iso') iso: string,
    @Body() body: Omit<CreateHealthcarePolicyDto, 'countryCode'>,
  ) {
    return this.regulatory.createHealthcarePolicy(principal, { ...body, countryCode: iso });
  }

  @Post('countries/:iso/healthcare-policy/:version/publish')
  @RequirePermissions('policy:publish')
  publishHealthcarePolicy(
    @CurrentPrincipal() principal: Principal,
    @Param('iso') iso: string,
    @Param('version') version: string,
  ) {
    return this.regulatory.publishHealthcarePolicy(principal, iso, Number(version));
  }

  @Get('countries/:iso/healthcare-policy')
  @RequirePermissions('policy:read')
  getHealthcarePolicy(@Param('iso') iso: string) {
    return this.regulatory.getHealthcarePolicy(iso);
  }

  @Get('countries/:iso/healthcare-policy/versions')
  @RequirePermissions('policy:read')
  listHealthcarePolicies(@Param('iso') iso: string) {
    return this.regulatory.listHealthcarePolicies(iso);
  }

  // ── Regulatory Requirements ────────────────────────────────────────────────

  @Get('countries/:iso/requirements')
  @RequirePermissions('policy:read')
  listRequirements(@Param('iso') iso: string) {
    return this.regulatory.listRequirements(iso);
  }

  @Get('countries/:iso/requirement-coverage')
  @RequirePermissions('policy:read')
  async requirementCoverage(@Param('iso') iso: string) {
    const readiness = await this.production.evaluate(iso);
    return {
      country_code: readiness.country_code,
      rows: readiness.requirement_coverage,
    };
  }

  // ── Regulatory Evidence ────────────────────────────────────────────────────

  @Post('countries/:iso/evidence')
  @RequirePermissions('policy:publish')
  attachEvidence(
    @CurrentPrincipal() principal: Principal,
    @Param('iso') iso: string,
    @Body() body: Omit<AttachEvidenceDto, 'countryCode'>,
  ) {
    return this.regulatory.attachEvidence(principal, { ...body, countryCode: iso });
  }

  @Post('evidence/:id/verify')
  @RequirePermissions('policy:publish')
  verifyEvidence(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.regulatory.verifyEvidence(principal, id);
  }

  @Post('evidence/:id/submit')
  @RequirePermissions('policy:publish')
  submitEvidence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.production.markEvidenceUnderReview(principal, id, body?.reason);
  }

  @Post('evidence/:id/reject')
  @RequirePermissions('policy:publish')
  rejectEvidence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    if (!body?.reason?.trim()) throw Errors.validation('reason is required');
    return this.production.rejectEvidence(principal, id, body.reason);
  }

  @Post('evidence/:id/expire')
  @RequirePermissions('policy:publish')
  expireEvidence(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.production.expireEvidence(principal, id, body?.reason);
  }

  @Get('evidence/:id/history')
  @RequirePermissions('policy:read')
  evidenceHistory(@Param('id') id: string) {
    return this.production.listEvidenceHistory(id);
  }

  @Get('countries/:iso/evidence')
  @RequirePermissions('policy:read')
  listEvidence(@Param('iso') iso: string) {
    return this.regulatory.listEvidence(iso);
  }

  // ── Production Dependencies ────────────────────────────────────────────────

  @Post('dependencies')
  @RequirePermissions('policy:publish')
  registerDependency(
    @CurrentPrincipal() principal: Principal,
    @Body() body: RegisterDependencyDto,
  ) {
    return this.regulatory.registerDependency(principal, body);
  }

  @Post('dependencies/:id/verify')
  @RequirePermissions('policy:publish')
  verifyDependency(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.regulatory.verifyDependency(principal, id);
  }

  @Get('dependencies')
  @RequirePermissions('policy:read')
  listDependencies() {
    return this.regulatory.listDependencies();
  }

  @Get('countries/:iso/dependencies')
  @RequirePermissions('policy:read')
  listCountryDependencies(@Param('iso') iso: string) {
    return this.regulatory.listDependencies(iso);
  }

  // ── Launch / Production Readiness ──────────────────────────────────────────

  @Get('countries/:iso/launch-readiness')
  @RequirePermissions('policy:read')
  launchReadiness(@Param('iso') iso: string) {
    return this.regulatory.computeCountryLaunchReadiness(iso);
  }

  @Get('countries/:iso/final-launch-readiness')
  @RequirePermissions('policy:read')
  finalLaunchReadiness(@Param('iso') iso: string) {
    return this.finalLaunch.evaluate(iso);
  }

  @Get('countries/:iso/first-country-launch-package')
  @RequirePermissions('policy:read')
  firstCountryLaunchPackage(@Param('iso') iso: string) {
    return this.firstCountry.buildPackage(iso);
  }

  @Post('countries/:iso/activation-dry-run')
  @RequirePermissions('policy:read')
  activationDryRun(@CurrentPrincipal() principal: Principal, @Param('iso') iso: string) {
    return this.firstCountry.activationDryRun(iso, principal);
  }

  @Get('countries/:iso/production-readiness')
  @RequirePermissions('policy:read')
  productionReadiness(@Param('iso') iso: string) {
    return this.production.evaluate(iso);
  }

  // ── Production lifecycle ───────────────────────────────────────────────────

  @Post('countries/:iso/lifecycle/transition')
  @RequirePermissions('policy:publish')
  async transitionLifecycle(
    @CurrentPrincipal() principal: Principal,
    @Param('iso') iso: string,
    @Body() body: { to?: ProductionLifecycleState; reason?: string },
  ) {
    if (!body?.to) throw Errors.validation('to is required');
    // Real-market ACTIVE requires final launch readiness when production-bound.
    // Sandbox/software lifecycle READY_FOR_ACTIVATION remains S42 production_ready.
    if (body.to === 'ACTIVE') {
      await this.finalLaunch.enforceIfProductionBound(iso);
    }
    return this.production.transitionLifecycle(principal, iso, body.to, body.reason);
  }

  @Post('countries/:iso/production/activate')
  @RequirePermissions('policy:publish')
  async activateProduction(
    @CurrentPrincipal() principal: Principal,
    @Param('iso') iso: string,
    @Body() body: { reason?: string },
  ) {
    await this.finalLaunch.enforceIfProductionBound(iso);
    return this.production.activateProduction(principal, iso, body?.reason);
  }

  @Post('countries/:iso/production/suspend')
  @RequirePermissions('policy:publish')
  suspendProduction(
    @CurrentPrincipal() principal: Principal,
    @Param('iso') iso: string,
    @Body() body: { reason?: string },
  ) {
    if (!body?.reason?.trim()) throw Errors.validation('reason is required');
    return this.production.suspendProduction(principal, iso, body.reason);
  }

  @Post('countries/:iso/production/assert-transaction')
  @RequirePermissions('policy:read')
  async assertProductionTransaction(@Param('iso') iso: string) {
    await this.production.assertCountryAllowsProductionTransaction(iso);
    return { ok: true, country_code: iso.trim().toUpperCase() };
  }
}
