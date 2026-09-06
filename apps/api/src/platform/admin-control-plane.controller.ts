import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { AdminControlPlaneService } from './admin-control-plane.service';
import { FinalLaunchReadinessService } from './final-launch-readiness.service';
import { FirstCountryLaunchService } from './first-country-launch.service';

@Controller('admin/control-plane')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminControlPlaneController {
  constructor(
    private readonly controlPlane: AdminControlPlaneService,
    private readonly finalLaunch: FinalLaunchReadinessService,
    private readonly firstCountry: FirstCountryLaunchService,
  ) {}

  @Get('snapshot')
  @RequirePermissions('policy:read')
  snapshot(@Query('country_code') countryCode?: string) {
    return this.controlPlane.commandCenterSnapshot(countryCode);
  }

  @Get('approvals')
  @RequirePermissions('policy:read')
  approvals(@Query('limit') limit?: string) {
    const take = limit ? Math.min(Number(limit), 100) : 50;
    return this.controlPlane.approvalQueue(take);
  }

  @Get('exceptions')
  @RequirePermissions('policy:read')
  exceptions(@Query('limit') limit?: string) {
    const take = limit ? Math.min(Number(limit), 100) : 30;
    return this.controlPlane.operationsExceptions(take);
  }

  @Get('countries')
  @RequirePermissions('policy:read')
  countries() {
    return this.controlPlane.listCountriesOverview();
  }

  @Get('reliability/snapshot')
  @RequirePermissions('policy:read')
  reliabilitySnapshot() {
    return this.controlPlane.reliabilitySnapshot();
  }

  @Get('release-gate')
  @RequirePermissions('policy:read')
  async releaseGate() {
    const snap = await this.controlPlane.reliabilitySnapshot();
    return snap.final_internal_release_gate;
  }

  @Get('provider-activation')
  @RequirePermissions('policy:read')
  providerActivation() {
    return this.controlPlane.providerActivationMatrix();
  }

  @Get('provider-activation/:id/verify')
  @RequirePermissions('policy:read')
  providerVerify(@Param('id') id: string) {
    return this.controlPlane.verifyProvider(id);
  }

  @Get('psp-onboarding')
  @RequirePermissions('policy:read')
  pspOnboarding() {
    return this.controlPlane.pspFirstOnboarding();
  }

  @Get('production-psp-real-activation-onboarding')
  @RequirePermissions('policy:read')
  productionPspRealActivationOnboarding() {
    return this.controlPlane.realPspFirstOnboarding();
  }

  @Get('messaging-onboarding')
  @RequirePermissions('policy:read')
  messagingOnboarding() {
    return this.controlPlane.messagingFirstOnboarding();
  }

  @Get('production-messaging-real-activation-onboarding')
  @RequirePermissions('policy:read')
  productionMessagingRealActivationOnboarding() {
    return this.controlPlane.realMessagingFirstOnboarding();
  }

  @Get('carrier-onboarding')
  @RequirePermissions('policy:read')
  carrierOnboarding() {
    return this.controlPlane.carrierFirstOnboarding();
  }

  @Get('production-carrier-real-activation-onboarding')
  @RequirePermissions('policy:read')
  productionCarrierRealActivationOnboarding() {
    return this.controlPlane.realCarrierFirstOnboarding();
  }

  @Get('erx-onboarding')
  @RequirePermissions('policy:read')
  erxOnboarding() {
    return this.controlPlane.erxFirstOnboarding();
  }

  @Get('video-onboarding')
  @RequirePermissions('policy:read')
  videoOnboarding() {
    return this.controlPlane.videoFirstOnboarding();
  }

  @Get('pacs-onboarding')
  @RequirePermissions('policy:read')
  pacsOnboarding() {
    return this.controlPlane.pacsFirstOnboarding();
  }

  @Get('affiliate-payout-onboarding')
  @RequirePermissions('policy:read')
  affiliatePayoutOnboarding() {
    return this.controlPlane.affiliatePayoutFirstOnboarding();
  }

  @Get('partner-payout-software-readiness')
  @RequirePermissions('policy:read')
  partnerPayoutSoftwareReadiness() {
    return this.controlPlane.partnerPayoutSoftwareReadiness();
  }

  @Get('kyc-onboarding')
  @RequirePermissions('policy:read')
  kycOnboarding() {
    return this.controlPlane.kycFirstOnboarding();
  }

  @Get('production-kyc-real-activation-onboarding')
  @RequirePermissions('policy:read')
  productionKycRealActivationOnboarding() {
    return this.controlPlane.realKycFirstOnboarding();
  }

  @Get('production-storage-onboarding')
  @RequirePermissions('policy:read')
  productionStorageOnboarding() {
    return this.controlPlane.productionStorageFirstOnboarding();
  }

  @Get('production-storage-real-activation-onboarding')
  @RequirePermissions('policy:read')
  productionStorageRealActivationOnboarding() {
    return this.controlPlane.realStorageFirstOnboarding();
  }

  @Get('production-backup-onboarding')
  @RequirePermissions('policy:read')
  productionBackupOnboarding() {
    return this.controlPlane.productionBackupFirstOnboarding();
  }

  @Get('production-backup-real-activation-onboarding')
  @RequirePermissions('policy:read')
  productionBackupRealActivationOnboarding() {
    return this.controlPlane.realBackupFirstOnboarding();
  }

  @Get('observability-onboarding')
  @RequirePermissions('policy:read')
  observabilityOnboarding() {
    return this.controlPlane.observabilityFirstOnboarding();
  }

  @Get('production-observability-real-activation-onboarding')
  @RequirePermissions('policy:read')
  productionObservabilityRealActivationOnboarding() {
    return this.controlPlane.realObservabilityFirstOnboarding();
  }

  @Get('observability-apm-monitoring-alerting-production-activation-path')
  @RequirePermissions('policy:read')
  observabilityApmMonitoringAlertingProductionActivationPath(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.observabilityApmMonitoringAlertingProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('deployment-release-engineering-production-activation-path')
  @RequirePermissions('policy:read')
  deploymentReleaseEngineeringProductionActivationPath(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.deploymentReleaseEngineeringProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('production-deployment-target-activation-path')
  @RequirePermissions('policy:read')
  productionDeploymentTargetActivationPath(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.productionDeploymentTargetActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('production-database-activation-path')
  @RequirePermissions('policy:read')
  productionDatabaseActivationPath(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.productionDatabaseActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('production-managed-backup-pitr-activation-path')
  @RequirePermissions('policy:read')
  productionManagedBackupPitrActivationPath(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.productionManagedBackupPitrActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('production-security-launch-gate-path')
  @RequirePermissions('policy:read')
  productionSecurityLaunchGatePath(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.productionSecurityLaunchGatePath({
      correlation_id: correlationId,
    });
  }

  @Get('affiliate-payout-settlement-production-workflow-closure')
  @RequirePermissions('policy:read')
  affiliatePayoutSettlementProductionWorkflowClosure(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.affiliatePayoutSettlementProductionWorkflowClosure({
      correlation_id: correlationId,
    });
  }

  @Get('production-kyc-kyb-healthcare-partner-verification-activation-path')
  @RequirePermissions('policy:read')
  productionKycKybHealthcarePartnerVerificationActivationPath(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.productionKycKybHealthcarePartnerVerificationActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('application-security-hardening')
  @RequirePermissions('policy:read')
  applicationSecurityHardening() {
    return this.controlPlane.applicationSecurityHardening();
  }

  @Get('external-pentest-preparation')
  @RequirePermissions('policy:read')
  externalPentestPreparation() {
    return this.controlPlane.externalPentestPreparation();
  }

  @Get('production-secrets-env-onboarding')
  @RequirePermissions('policy:read')
  productionSecretsEnvOnboarding() {
    return this.controlPlane.productionSecretsEnvFirstOnboarding();
  }

  @Get('secrets-manager-runtime-resolver')
  @RequirePermissions('policy:read')
  secretsManagerRuntimeResolver(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.secretsManagerRuntimeResolver({
      correlation_id: correlationId,
    });
  }

  @Get('production-deployment-onboarding')
  @RequirePermissions('policy:read')
  productionDeploymentOnboarding() {
    return this.controlPlane.productionDeploymentFirstOnboarding();
  }

  @Get('production-provider-onboarding')
  @RequirePermissions('policy:read')
  productionProviderOnboarding(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.productionProviderOnboardingFirstOnboarding({
      correlation_id: correlationId,
    });
  }

  @Get('production-foundation-onboarding')
  @RequirePermissions('policy:read')
  productionFoundationOnboarding(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.productionFoundationFirstOnboarding({
      correlation_id: correlationId,
    });
  }

  @Get('production-foundation-real-activation-onboarding')
  @RequirePermissions('policy:read')
  productionFoundationRealActivationOnboarding(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.foundationRealActivation({
      correlation_id: correlationId,
    });
  }

  @Get('production-foundation-activation-preparation')
  @RequirePermissions('policy:read')
  productionFoundationActivationPreparation(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.productionFoundationActivationPreparation({
      correlation_id: correlationId,
    });
  }

  @Get('production-release-engineering-readiness')
  @RequirePermissions('policy:read')
  productionReleaseEngineeringReadiness(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.productionReleaseEngineeringReadiness({
      correlation_id: correlationId,
    });
  }

  @Get('production-deployment-target-activation')
  @RequirePermissions('policy:read')
  productionDeploymentTargetActivation(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.productionDeploymentTargetActivation({
      correlation_id: correlationId,
    });
  }

  @Get('psp-payment-activation-preparation')
  @RequirePermissions('policy:read')
  pspPaymentActivationPreparation(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.pspPaymentActivationPreparation({
      correlation_id: correlationId,
    });
  }

  @Get('psp-payment-production-activation-control')
  @RequirePermissions('policy:read')
  pspPaymentProductionActivationControl(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.pspPaymentProductionActivationControl({
      correlation_id: correlationId,
    });
  }

  @Get('psp-payment-production-activation-path')
  @RequirePermissions('policy:read')
  pspPaymentProductionActivationPath(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.pspPaymentProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('otp-messaging-activation-preparation')
  @RequirePermissions('policy:read')
  otpMessagingActivationPreparation(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.otpMessagingActivationPreparation({
      correlation_id: correlationId,
    });
  }

  @Get('otp-messaging-production-activation-path')
  @RequirePermissions('policy:read')
  otpMessagingProductionActivationPath(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.otpMessagingProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('carrier-logistics-activation-preparation')
  @RequirePermissions('policy:read')
  carrierLogisticsActivationPreparation(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.carrierLogisticsActivationPreparation({
      correlation_id: correlationId,
    });
  }

  @Get('carrier-logistics-production-activation-path')
  @RequirePermissions('policy:read')
  carrierLogisticsProductionActivationPath(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.carrierLogisticsProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('kyc-healthcare-partner-verification-activation-preparation')
  @RequirePermissions('policy:read')
  kycHealthcarePartnerVerificationActivationPreparation(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.kycHealthcarePartnerVerificationActivationPreparation({
      correlation_id: correlationId,
    });
  }

  @Get('lab-partner-onboarding-activation-preparation')
  @RequirePermissions('policy:read')
  labPartnerOnboardingActivationPreparation(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.labPartnerOnboardingActivationPreparation({
      correlation_id: correlationId,
    });
  }

  @Get('pharmacy-vendor-network-closure')
  @RequirePermissions('policy:read')
  pharmacyVendorNetworkClosure(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.pharmacyVendorNetworkClosure({
      correlation_id: correlationId,
    });
  }

  @Get('lab-partner-production-workflow-closure')
  @RequirePermissions('policy:read')
  labPartnerProductionWorkflowClosure(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.labPartnerProductionWorkflowClosure({
      correlation_id: correlationId,
    });
  }

  @Get('erx-production-activation-path')
  @RequirePermissions('policy:read')
  erxProductionActivationPath(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.erxProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('doctor-consultation-erx-production-workflow-closure')
  @RequirePermissions('policy:read')
  doctorConsultationErxProductionWorkflowClosure(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.doctorConsultationErxProductionWorkflowClosure({
      correlation_id: correlationId,
    });
  }

  @Get('video-production-activation-path')
  @RequirePermissions('policy:read')
  videoProductionActivationPath(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.videoProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('telemedicine-live-consultation-production-workflow-closure')
  @RequirePermissions('policy:read')
  telemedicineLiveConsultationProductionWorkflowClosure(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.telemedicineLiveConsultationProductionWorkflowClosure({
      correlation_id: correlationId,
    });
  }

  @Get('pacs-production-activation-path')
  @RequirePermissions('policy:read')
  pacsProductionActivationPath(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.pacsProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('imaging-pacs-dicom-production-workflow-closure')
  @RequirePermissions('policy:read')
  imagingPacsDicomProductionWorkflowClosure(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.imagingPacsDicomProductionWorkflowClosure({
      correlation_id: correlationId,
    });
  }

  @Get('private-storage-kms-malware-production-activation-path')
  @RequirePermissions('policy:read')
  privateStorageKmsMalwareProductionActivationPath(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.privateStorageKmsMalwareProductionActivationPath({
      correlation_id: correlationId,
    });
  }

  @Get('private-storage-kms-malware-production-workflow-closure')
  @RequirePermissions('policy:read')
  privateStorageKmsMalwareProductionWorkflowClosure(
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.privateStorageKmsMalwareProductionWorkflowClosure({
      correlation_id: correlationId,
    });
  }

  @Get('api-abuse-hardening')
  @RequirePermissions('policy:read')
  apiAbuseHardening(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.apiAbuseHardening({
      correlation_id: correlationId,
    });
  }

  @Get('edge-waf-ddos-activation-onboarding')
  @RequirePermissions('policy:read')
  edgeWafDdosActivationOnboarding(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.edgeWafDdosActivation({
      correlation_id: correlationId,
    });
  }

  @Get('input-security-hardening')
  @RequirePermissions('policy:read')
  inputSecurityHardening(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.inputSecurityHardening({
      correlation_id: correlationId,
    });
  }

  @Get('production-security-gate')
  @RequirePermissions('policy:read')
  productionSecurityGate(@Query('correlation_id') correlationId?: string) {
    return this.controlPlane.productionSecurityGate({
      correlation_id: correlationId,
    });
  }

  @Get('production-launch-control')
  @RequirePermissions('policy:read')
  productionLaunchControl(
    @Query('market') market?: string,
    @Query('service_scope') serviceScope?: string,
    @Query('correlation_id') correlationId?: string,
  ) {
    return this.controlPlane.productionLaunchControl({
      market,
      service_scope: serviceScope,
      correlation_id: correlationId,
    });
  }

  @Get('reliability/outbox')
  @RequirePermissions('policy:read')
  outboxEvents(@Query('status') status?: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(Number(limit), 100) : 50;
    return this.controlPlane.listOutboxEvents({ status, limit: take });
  }

  @Get('reliability/idempotency')
  @RequirePermissions('policy:read')
  idempotency(
    @Query('key') key?: string,
    @Query('person_id') personId?: string,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? Math.min(Number(limit), 50) : 20;
    return this.controlPlane.lookupIdempotency({ key, person_id: personId, limit: take });
  }

  @Get('countries/:iso')
  @RequirePermissions('policy:read')
  async countryDetail(@Param('iso') iso: string) {
    const detail = await this.controlPlane.countryReadiness(iso);
    if (!detail) {
      throw Errors.notFound('Country not found');
    }
    return detail;
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

  @Post('countries/:iso/activate')
  @RequirePermissions('policy:publish')
  activate(
    @CurrentPrincipal() principal: Principal,
    @Param('iso') iso: string,
    @Req() req: { requestId?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    const header = req.headers?.['x-request-id'];
    const requestId = req.requestId ?? (typeof header === 'string' ? header : undefined);
    return this.controlPlane.activateCountry(principal, iso, requestId);
  }

  @Post('countries/:iso/suspend')
  @RequirePermissions('policy:publish')
  suspend(
    @CurrentPrincipal() principal: Principal,
    @Param('iso') iso: string,
    @Req() req: { requestId?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    const header = req.headers?.['x-request-id'];
    const requestId = req.requestId ?? (typeof header === 'string' ? header : undefined);
    return this.controlPlane.suspendCountry(principal, iso, requestId);
  }
}
