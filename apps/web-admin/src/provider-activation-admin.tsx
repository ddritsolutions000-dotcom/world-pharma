'use client';

import Link from 'next/link';
import { AdminViewLoadError } from './admin-request-error';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { classifyAdminViewState } from './admin-http';
import {
  fetchProviderActivation,
  fetchPspOnboarding,
  fetchRealPspActivationOnboarding,
  fetchMessagingOnboarding,
  fetchRealMessagingActivationOnboarding,
  fetchCarrierOnboarding,
  fetchRealCarrierActivationOnboarding,
  fetchErxOnboarding,
  fetchVideoOnboarding,
  fetchPacsOnboarding,
  fetchAffiliatePayoutOnboarding,
  fetchKycOnboarding,
  fetchRealKycActivationOnboarding,
  fetchProductionStorageOnboarding,
  fetchRealStorageActivationOnboarding,
  fetchProductionBackupOnboarding,
  fetchRealBackupActivationOnboarding,
  fetchObservabilityOnboarding,
  fetchRealObservabilityActivationOnboarding,
  fetchObservabilityApmMonitoringAlertingProductionActivationPath,
  fetchApplicationSecurityHardening,
  fetchExternalPentestPreparation,
  fetchProductionSecretsEnvOnboarding,
  fetchSecretsManagerRuntimeResolver,
  fetchProductionDeploymentOnboarding,
  fetchProductionProviderOnboarding,
  fetchProductionFoundationOnboarding,
  fetchRealFoundationActivationOnboarding,
  fetchApiAbuseHardening,
  fetchEdgeWafDdosActivationOnboarding,
  fetchInputSecurityHardening,
  fetchProductionSecurityGate,
  fetchProductionFoundationActivationPreparation,
  fetchProductionReleaseEngineeringReadiness,
  fetchProductionDeploymentTargetActivation,
  fetchDeploymentReleaseEngineeringProductionActivationPath,
  fetchProductionDeploymentTargetActivationPath,
  fetchProductionDatabaseActivationPath,
  fetchProductionManagedBackupPitrActivationPath,
  fetchProductionSecurityLaunchGatePath,
  fetchAffiliatePayoutSettlementProductionWorkflowClosure,
  fetchProductionKycKybHealthcarePartnerVerificationActivationPath,
  fetchPspPaymentActivationPreparation,
  fetchPspPaymentProductionActivationControl,
  fetchOtpMessagingActivationPreparation,
  fetchCarrierLogisticsActivationPreparation,
  fetchKycHealthcarePartnerVerificationActivationPreparation,
  fetchLabPartnerOnboardingActivationPreparation,
  fetchPharmacyVendorNetworkClosure,
  fetchLabPartnerProductionWorkflowClosure,
  fetchErxProductionActivationPath,
  fetchDoctorConsultationErxProductionWorkflowClosure,
  fetchVideoProductionActivationPath,
  fetchTelemedicineLiveConsultationProductionWorkflowClosure,
  fetchPacsProductionActivationPath,
  fetchImagingPacsDicomProductionWorkflowClosure,
  fetchPrivateStorageKmsMalwareProductionActivationPath,
  fetchPrivateStorageKmsMalwareProductionWorkflowClosure,
  type ProviderActivationMatrix,
} from './provider-activation-api';

function stageKind(stage: string): 'pending' | 'warning' | 'info' {
  if (stage === 'ENABLED' || stage === 'APPROVED' || stage === 'VERIFIED' || stage === 'SANDBOX_VERIFIED' || stage === 'PASS')
    return 'info';
  if (stage === 'BLOCKED' || stage === 'DISABLED' || stage === 'CONFIGURED_BUT_UNAVAILABLE') return 'warning';
  return 'pending';
}

export function ProviderActivationPanel() {
  const { session, getAccessToken } = useSession();
  const canRead = session.permissions?.includes('policy:read') ?? false;
  const [view, setView] = useState<'loading' | 'idle' | 'forbidden' | 'network' | 'error'>('loading');
  const [matrix, setMatrix] = useState<ProviderActivationMatrix | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [psp, setPsp] = useState<Awaited<ReturnType<typeof fetchPspOnboarding>> | null>(null);
  const [realPsp, setRealPsp] = useState<
    Awaited<ReturnType<typeof fetchRealPspActivationOnboarding>> | null
  >(null);
  const [messaging, setMessaging] = useState<Awaited<ReturnType<typeof fetchMessagingOnboarding>> | null>(
    null,
  );
  const [realMessaging, setRealMessaging] = useState<
    Awaited<ReturnType<typeof fetchRealMessagingActivationOnboarding>> | null
  >(null);
  const [carrier, setCarrier] = useState<Awaited<ReturnType<typeof fetchCarrierOnboarding>> | null>(null);
  const [realCarrier, setRealCarrier] = useState<
    Awaited<ReturnType<typeof fetchRealCarrierActivationOnboarding>> | null
  >(null);
  const [erx, setErx] = useState<Awaited<ReturnType<typeof fetchErxOnboarding>> | null>(null);
  const [video, setVideo] = useState<Awaited<ReturnType<typeof fetchVideoOnboarding>> | null>(null);
  const [pacs, setPacs] = useState<Awaited<ReturnType<typeof fetchPacsOnboarding>> | null>(null);
  const [payout, setPayout] = useState<Awaited<ReturnType<typeof fetchAffiliatePayoutOnboarding>> | null>(
    null,
  );
  const [kyc, setKyc] = useState<Awaited<ReturnType<typeof fetchKycOnboarding>> | null>(null);
  const [realKyc, setRealKyc] = useState<
    Awaited<ReturnType<typeof fetchRealKycActivationOnboarding>> | null
  >(null);
  const [storage, setStorage] = useState<
    Awaited<ReturnType<typeof fetchProductionStorageOnboarding>> | null
  >(null);
  const [realStorage, setRealStorage] = useState<
    Awaited<ReturnType<typeof fetchRealStorageActivationOnboarding>> | null
  >(null);
  const [backup, setBackup] = useState<
    Awaited<ReturnType<typeof fetchProductionBackupOnboarding>> | null
  >(null);
  const [realBackup, setRealBackup] = useState<
    Awaited<ReturnType<typeof fetchRealBackupActivationOnboarding>> | null
  >(null);
  const [observability, setObservability] = useState<
    Awaited<ReturnType<typeof fetchObservabilityOnboarding>> | null
  >(null);
  const [realObservability, setRealObservability] = useState<
    Awaited<ReturnType<typeof fetchRealObservabilityActivationOnboarding>> | null
  >(null);
  const [observabilityPath, setObservabilityPath] = useState<
    Awaited<
      ReturnType<typeof fetchObservabilityApmMonitoringAlertingProductionActivationPath>
    > | null
  >(null);
  const [appSecurity, setAppSecurity] = useState<
    Awaited<ReturnType<typeof fetchApplicationSecurityHardening>> | null
  >(null);
  const [pentestPrep, setPentestPrep] = useState<
    Awaited<ReturnType<typeof fetchExternalPentestPreparation>> | null
  >(null);
  const [secretsEnv, setSecretsEnv] = useState<
    Awaited<ReturnType<typeof fetchProductionSecretsEnvOnboarding>> | null
  >(null);
  const [secretsResolver, setSecretsResolver] = useState<
    Awaited<ReturnType<typeof fetchSecretsManagerRuntimeResolver>> | null
  >(null);
  const [deployment, setDeployment] = useState<
    Awaited<ReturnType<typeof fetchProductionDeploymentOnboarding>> | null
  >(null);
  const [providerOnboarding, setProviderOnboarding] = useState<
    Awaited<ReturnType<typeof fetchProductionProviderOnboarding>> | null
  >(null);
  const [foundation, setFoundation] = useState<
    Awaited<ReturnType<typeof fetchProductionFoundationOnboarding>> | null
  >(null);
  const [realFoundation, setRealFoundation] = useState<
    Awaited<ReturnType<typeof fetchRealFoundationActivationOnboarding>> | null
  >(null);
  const [apiAbuse, setApiAbuse] = useState<
    Awaited<ReturnType<typeof fetchApiAbuseHardening>> | null
  >(null);
  const [edgeWaf, setEdgeWaf] = useState<
    Awaited<ReturnType<typeof fetchEdgeWafDdosActivationOnboarding>> | null
  >(null);
  const [inputSecurity, setInputSecurity] = useState<
    Awaited<ReturnType<typeof fetchInputSecurityHardening>> | null
  >(null);
  const [securityGate, setSecurityGate] = useState<
    Awaited<ReturnType<typeof fetchProductionSecurityGate>> | null
  >(null);
  const [foundationPrep, setFoundationPrep] = useState<
    Awaited<ReturnType<typeof fetchProductionFoundationActivationPreparation>> | null
  >(null);
  const [releaseEng, setReleaseEng] = useState<
    Awaited<ReturnType<typeof fetchProductionReleaseEngineeringReadiness>> | null
  >(null);
  const [deployTarget, setDeployTarget] = useState<
    Awaited<ReturnType<typeof fetchProductionDeploymentTargetActivation>> | null
  >(null);
  const [deploymentReleasePath, setDeploymentReleasePath] = useState<
    Awaited<
      ReturnType<typeof fetchDeploymentReleaseEngineeringProductionActivationPath>
    > | null
  >(null);
  const [deploymentTargetPath, setDeploymentTargetPath] = useState<
    Awaited<ReturnType<typeof fetchProductionDeploymentTargetActivationPath>> | null
  >(null);
  const [databaseActivationPath, setDatabaseActivationPath] = useState<
    Awaited<ReturnType<typeof fetchProductionDatabaseActivationPath>> | null
  >(null);
  const [backupPitrPath, setBackupPitrPath] = useState<
    Awaited<ReturnType<typeof fetchProductionManagedBackupPitrActivationPath>> | null
  >(null);
  const [securityLaunchGatePath, setSecurityLaunchGatePath] = useState<
    Awaited<ReturnType<typeof fetchProductionSecurityLaunchGatePath>> | null
  >(null);
  const [affiliatePayoutClosure, setAffiliatePayoutClosure] = useState<
    Awaited<
      ReturnType<typeof fetchAffiliatePayoutSettlementProductionWorkflowClosure>
    > | null
  >(null);
  const [kycKybActivationPath, setKycKybActivationPath] = useState<
    Awaited<
      ReturnType<typeof fetchProductionKycKybHealthcarePartnerVerificationActivationPath>
    > | null
  >(null);
  const [pspPrep, setPspPrep] = useState<
    Awaited<ReturnType<typeof fetchPspPaymentActivationPreparation>> | null
  >(null);
  const [pspControl, setPspControl] = useState<
    Awaited<ReturnType<typeof fetchPspPaymentProductionActivationControl>> | null
  >(null);
  const [commsPrep, setCommsPrep] = useState<
    Awaited<ReturnType<typeof fetchOtpMessagingActivationPreparation>> | null
  >(null);
  const [carrierPrep, setCarrierPrep] = useState<
    Awaited<ReturnType<typeof fetchCarrierLogisticsActivationPreparation>> | null
  >(null);
  const [kycPrep, setKycPrep] = useState<
    Awaited<ReturnType<typeof fetchKycHealthcarePartnerVerificationActivationPreparation>> | null
  >(null);
  const [labPartnerPrep, setLabPartnerPrep] = useState<
    Awaited<ReturnType<typeof fetchLabPartnerOnboardingActivationPreparation>> | null
  >(null);
  const [pharmacyVendorPrep, setPharmacyVendorPrep] = useState<
    Awaited<ReturnType<typeof fetchPharmacyVendorNetworkClosure>> | null
  >(null);
  const [labWorkflowPrep, setLabWorkflowPrep] = useState<
    Awaited<ReturnType<typeof fetchLabPartnerProductionWorkflowClosure>> | null
  >(null);
  const [erxPath, setErxPath] = useState<
    Awaited<ReturnType<typeof fetchErxProductionActivationPath>> | null
  >(null);
  const [doctorErxWorkflow, setDoctorErxWorkflow] = useState<
    Awaited<ReturnType<typeof fetchDoctorConsultationErxProductionWorkflowClosure>> | null
  >(null);
  const [videoPath, setVideoPath] = useState<
    Awaited<ReturnType<typeof fetchVideoProductionActivationPath>> | null
  >(null);
  const [telemedicineWorkflow, setTelemedicineWorkflow] = useState<
    Awaited<ReturnType<typeof fetchTelemedicineLiveConsultationProductionWorkflowClosure>> | null
  >(null);
  const [pacsPath, setPacsPath] = useState<
    Awaited<ReturnType<typeof fetchPacsProductionActivationPath>> | null
  >(null);
  const [imagingWorkflow, setImagingWorkflow] = useState<
    Awaited<ReturnType<typeof fetchImagingPacsDicomProductionWorkflowClosure>> | null
  >(null);
  const [storageTriadPath, setStorageTriadPath] = useState<
    Awaited<ReturnType<typeof fetchPrivateStorageKmsMalwareProductionActivationPath>> | null
  >(null);
  const [storageWorkflow, setStorageWorkflow] = useState<
    Awaited<ReturnType<typeof fetchPrivateStorageKmsMalwareProductionWorkflowClosure>> | null
  >(null);
  const [onboardingFilter, setOnboardingFilter] = useState<string>('ALL');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setView('forbidden');
      return;
    }
    setView('loading');
    try {
      const [
        body,
        pspBody,
        realPspBody,
        msgBody,
        realMsgBody,
        carrierBody,
        realCarrierBody,
        erxBody,
        videoBody,
        pacsBody,
        payoutBody,
        kycBody,
        realKycBody,
        storageBody,
        realStorageBody,
        backupBody,
        realBackupBody,
        obsBody,
        realObsBody,
        observabilityPathBody,
        appSecBody,
        pentestBody,
        secretsBody,
        secretsResolverBody,
        deploymentBody,
        onboardingBody,
        foundationBody,
        realFoundationBody,
        apiAbuseBody,
        edgeWafBody,
        inputSecurityBody,
        securityGateBody,
        foundationPrepBody,
        releaseEngBody,
        deployTargetBody,
        deploymentReleasePathBody,
        deploymentTargetPathBody,
        databaseActivationPathBody,
        backupPitrPathBody,
        securityLaunchGatePathBody,
        affiliatePayoutClosureBody,
        kycKybActivationPathBody,
        pspPrepBody,
        pspControlBody,
        commsPrepBody,
        carrierPrepBody,
        kycPrepBody,
        labPartnerPrepBody,
        pharmacyVendorPrepBody,
        labWorkflowPrepBody,
        erxPathBody,
        doctorErxWorkflowBody,
        videoPathBody,
        telemedicineWorkflowBody,
        pacsPathBody,
        imagingWorkflowBody,
        storageTriadPathBody,
        storageWorkflowBody,
      ] = await Promise.all([
        fetchProviderActivation(token),
        fetchPspOnboarding(token),
        fetchRealPspActivationOnboarding(token),
        fetchMessagingOnboarding(token),
        fetchRealMessagingActivationOnboarding(token),
        fetchCarrierOnboarding(token),
        fetchRealCarrierActivationOnboarding(token),
        fetchErxOnboarding(token),
        fetchVideoOnboarding(token),
        fetchPacsOnboarding(token),
        fetchAffiliatePayoutOnboarding(token),
        fetchKycOnboarding(token),
        fetchRealKycActivationOnboarding(token),
        fetchProductionStorageOnboarding(token),
        fetchRealStorageActivationOnboarding(token),
        fetchProductionBackupOnboarding(token),
        fetchRealBackupActivationOnboarding(token),
        fetchObservabilityOnboarding(token),
        fetchRealObservabilityActivationOnboarding(token),
        fetchObservabilityApmMonitoringAlertingProductionActivationPath(token),
        fetchApplicationSecurityHardening(token),
        fetchExternalPentestPreparation(token),
        fetchProductionSecretsEnvOnboarding(token),
        fetchSecretsManagerRuntimeResolver(token),
        fetchProductionDeploymentOnboarding(token),
        fetchProductionProviderOnboarding(token),
        fetchProductionFoundationOnboarding(token),
        fetchRealFoundationActivationOnboarding(token),
        fetchApiAbuseHardening(token),
        fetchEdgeWafDdosActivationOnboarding(token),
        fetchInputSecurityHardening(token),
        fetchProductionSecurityGate(token),
        fetchProductionFoundationActivationPreparation(token),
        fetchProductionReleaseEngineeringReadiness(token),
        fetchProductionDeploymentTargetActivation(token),
        fetchDeploymentReleaseEngineeringProductionActivationPath(token),
        fetchProductionDeploymentTargetActivationPath(token),
        fetchProductionDatabaseActivationPath(token),
        fetchProductionManagedBackupPitrActivationPath(token),
        fetchProductionSecurityLaunchGatePath(token),
        fetchAffiliatePayoutSettlementProductionWorkflowClosure(token),
        fetchProductionKycKybHealthcarePartnerVerificationActivationPath(token),
        fetchPspPaymentActivationPreparation(token),
        fetchPspPaymentProductionActivationControl(token),
        fetchOtpMessagingActivationPreparation(token),
        fetchCarrierLogisticsActivationPreparation(token),
        fetchKycHealthcarePartnerVerificationActivationPreparation(token),
        fetchLabPartnerOnboardingActivationPreparation(token),
        fetchPharmacyVendorNetworkClosure(token),
        fetchLabPartnerProductionWorkflowClosure(token),
        fetchErxProductionActivationPath(token),
        fetchDoctorConsultationErxProductionWorkflowClosure(token),
        fetchVideoProductionActivationPath(token),
        fetchTelemedicineLiveConsultationProductionWorkflowClosure(token),
        fetchPacsProductionActivationPath(token),
        fetchImagingPacsDicomProductionWorkflowClosure(token),
        fetchPrivateStorageKmsMalwareProductionActivationPath(token),
        fetchPrivateStorageKmsMalwareProductionWorkflowClosure(token),
      ]);
      setMatrix(body);
      setPsp(pspBody);
      setRealPsp(realPspBody);
      setMessaging(msgBody);
      setRealMessaging(realMsgBody);
      setCarrier(carrierBody);
      setRealCarrier(realCarrierBody);
      setErx(erxBody);
      setVideo(videoBody);
      setPacs(pacsBody);
      setPayout(payoutBody);
      setKyc(kycBody);
      setRealKyc(realKycBody);
      setStorage(storageBody);
      setRealStorage(realStorageBody);
      setBackup(backupBody);
      setRealBackup(realBackupBody);
      setObservability(obsBody);
      setRealObservability(realObsBody);
      setObservabilityPath(observabilityPathBody);
      setAppSecurity(appSecBody);
      setPentestPrep(pentestBody);
      setSecretsEnv(secretsBody);
      setSecretsResolver(secretsResolverBody);
      setDeployment(deploymentBody);
      setProviderOnboarding(onboardingBody);
      setFoundation(foundationBody);
      setRealFoundation(realFoundationBody);
      setApiAbuse(apiAbuseBody);
      setEdgeWaf(edgeWafBody);
      setInputSecurity(inputSecurityBody);
      setSecurityGate(securityGateBody);
      setFoundationPrep(foundationPrepBody);
      setReleaseEng(releaseEngBody);
      setDeployTarget(deployTargetBody);
      setDeploymentReleasePath(deploymentReleasePathBody);
      setDeploymentTargetPath(deploymentTargetPathBody);
      setDatabaseActivationPath(databaseActivationPathBody);
      setBackupPitrPath(backupPitrPathBody);
      setSecurityLaunchGatePath(securityLaunchGatePathBody);
      setAffiliatePayoutClosure(affiliatePayoutClosureBody);
      setKycKybActivationPath(kycKybActivationPathBody);
      setPspPrep(pspPrepBody);
      setPspControl(pspControlBody);
      setCommsPrep(commsPrepBody);
      setCarrierPrep(carrierPrepBody);
      setKycPrep(kycPrepBody);
      setLabPartnerPrep(labPartnerPrepBody);
      setPharmacyVendorPrep(pharmacyVendorPrepBody);
      setLabWorkflowPrep(labWorkflowPrepBody);
      setErxPath(erxPathBody);
      setDoctorErxWorkflow(doctorErxWorkflowBody);
      setVideoPath(videoPathBody);
      setTelemedicineWorkflow(telemedicineWorkflowBody);
      setPacsPath(pacsPathBody);
      setImagingWorkflow(imagingWorkflowBody);
      setStorageTriadPath(storageTriadPathBody);
      setStorageWorkflow(storageWorkflowBody);
      setView('idle');
    } catch (err) {
      setView(classifyAdminViewState(err));
    }
  }, [canRead, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') void load();
  }, [load, session.status]);

  if (view === 'forbidden') return <PermissionDeniedState />;
  if (view === 'network' || view === 'error') {
    return <AdminViewLoadError viewState={view} onRetry={() => void load()} />;
  }

  const selectedRow = matrix?.rows.find((r) => r.id === selected) ?? null;

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Provider activation center</Heading>
        <p className="wp-page-intro">
          Executable production activation status. Credentials present do <strong>not</strong> mean live.
          Activation is ops/manual via secret manager live flags after human approval — not a one-click Admin
          toggle. This is not a production launch certificate.
        </p>
      </header>

      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={view === 'loading'}>
          Re-evaluate
        </Button>
        <Link href="/launch-readiness">
          <Button variant="tertiary" size="sm">
            Launch readiness
          </Button>
        </Link>
        <Link href="/reliability">
          <Button variant="tertiary" size="sm">
            Reliability
          </Button>
        </Link>
      </div>

      {view === 'loading' && !matrix ? <LoadingState label="Loading provider activation" /> : null}

      {matrix ? (
        <>
          <Card>
            <Heading level={2}>Overall</Heading>
            <div className="wp-toolbar">
              <Badge kind="warning">Production launch ready: {String(matrix.production_launch_ready)}</Badge>
              <Badge kind="pending">Any live enabled: {String(matrix.overall_any_live_enabled)}</Badge>
              <Badge kind="pending">{matrix.decision}</Badge>
            </div>
            <Text tone="secondary">Evaluated {new Date(matrix.evaluated_at).toLocaleString()}</Text>
            <Text tone="secondary">
              Ordinary Admin users with policy:read can inspect status. Enabling live providers requires
              secret-manager changes + human approvals (ops-only).
            </Text>
          </Card>

          {foundation ? (
            <Card>
              <Heading level={2}>
                Production foundation activation readiness (Sprint 101)
              </Heading>
              <Text>{foundation.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Control plane: {foundation.control_plane ?? 'S100_REUSED'}
                </Badge>
                <Badge kind="warning">Production: {foundation.production}</Badge>
                <Badge kind="warning">
                  Environment enabled:{' '}
                  {String(foundation.production_environment_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Deployment target enabled:{' '}
                  {String(foundation.production_deployment_target_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Secrets manager enabled:{' '}
                  {String(foundation.production_secrets_manager_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Database enabled: {String(foundation.production_database_enabled ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {foundation.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(foundation.force_launch_available ?? false)}
                </Badge>
              </div>
              <Heading level={3}>Foundation</Heading>
              <Text tone="secondary">
                Foundational dependencies before external business/healthcare providers. DEVELOPMENT ≠
                SANDBOX ≠ STAGING ≠ PRODUCTION. No silent sandbox fallback.
              </Text>
              {(foundation.rails ?? []).map((rail) => (
                <Text key={rail.rail_id} tone="secondary">
                  {rail.label}: {rail.lifecycle} · cfg {rail.configuration_readiness} · creds{' '}
                  {rail.credentials_readiness} · verify {rail.verification} · {rail.blocker}
                  {(rail.dependencies ?? []).length
                    ? ` · depends on ${rail.dependencies.join(', ')}`
                    : ''}
                </Text>
              ))}
              <Text tone="secondary">
                Env separation — DEV: {foundation.environments?.DEVELOPMENT ?? 'ISOLATED'} · SANDBOX:{' '}
                {foundation.environments?.SANDBOX ?? 'ISOLATED'} · STAGING:{' '}
                {foundation.environments?.STAGING ?? 'EXTERNAL_GATED'} · PROD:{' '}
                {foundation.environments?.PRODUCTION ?? 'EXTERNAL_GATED'}
              </Text>
              <Text tone="secondary">
                Dependency chain:{' '}
                {(foundation.dependency_chain ?? [])
                  .map((d) => `${d.from}→${d.to}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Secret references (names only):{' '}
                {(foundation.secret_references ?? [])
                  .slice(0, 8)
                  .map((s) => s.key)
                  .join(', ') || '—'}
                …
              </Text>
              <Text tone="secondary">
                Workload identities:{' '}
                {(foundation.workload_identities ?? [])
                  .map((i) => `${i.identity}=${i.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Correlation: {foundation.correlation_id ?? '—'} · Evaluated:{' '}
                {foundation.evaluated_at
                  ? new Date(foundation.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {foundation.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {foundation.next_action}</Text>
              <Text tone="secondary">
                PRODUCTION ENVIRONMENT ENABLED = NO · DEPLOYMENT TARGET ENABLED = NO · SECRETS
                MANAGER ENABLED = NO · DATABASE ENABLED = NO. Values never shown.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {realFoundation ? (
            <Card>
              <Heading level={2}>
                Real production environment + secrets + deployment activation readiness (Sprint
                112)
              </Heading>
              <Text>{realFoundation.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Lifecycle: {realFoundation.activation_lifecycle ?? '—'}</Badge>
                <Badge kind="warning">
                  Env configured: {realFoundation.production_environment_configured ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  Env separation verified:{' '}
                  {realFoundation.production_environment_separation_verified ?? 'YES'}
                </Badge>
                <Badge kind="warning">
                  Secrets manager selected:{' '}
                  {realFoundation.real_secrets_manager_selected ?? 'NO'}
                </Badge>
                <Badge kind="warning">
                  Secrets manager enabled:{' '}
                  {realFoundation.production_secrets_manager_enabled ?? 'NO'}
                </Badge>
                <Badge kind="warning">
                  Deployment target selected:{' '}
                  {realFoundation.real_deployment_target_selected ?? 'NO'}
                </Badge>
                <Badge kind="warning">
                  Deployment target enabled:{' '}
                  {realFoundation.production_deployment_target_enabled ?? 'NO'}
                </Badge>
                <Badge kind="warning">
                  Database configured: {realFoundation.production_database_configured ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  Client secret exposure: {realFoundation.client_secret_exposure ?? 'PASS'}
                </Badge>
                <Badge kind="pending">
                  Sandbox→prod fallback: {realFoundation.sandbox_to_production_fallback ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  Prod→sandbox fallback: {realFoundation.production_to_sandbox_fallback ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  Migration safety: {realFoundation.migration_safety ?? 'PASS'}
                </Badge>
                <Badge kind="pending">
                  Rollback: {realFoundation.rollback ?? 'SANDBOX_PROVEN'} /{' '}
                  {realFoundation.rollback_production ?? 'NOT_PROVEN'}
                </Badge>
                <Badge kind="warning">Blocker: {realFoundation.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(realFoundation.force_launch_available ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {realFoundation.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Heading level={3}>Rails</Heading>
              {(realFoundation.rails ?? []).map((r) => (
                <Text key={r.rail} tone="secondary">
                  {r.rail}: selected={String(r.real_selected)} · enabled=
                  {String(r.production_enabled)} · {r.lifecycle} · {r.blocker}
                </Text>
              ))}
              <Text tone="secondary">
                Env — DEV: {realFoundation.environments?.DEVELOPMENT ?? 'ISOLATED'} · SANDBOX:{' '}
                {realFoundation.environments?.SANDBOX ?? 'ISOLATED'} · TEST:{' '}
                {realFoundation.environments?.TEST ?? 'ISOLATED'} · STAGING:{' '}
                {realFoundation.environments?.STAGING ?? 'EXTERNAL_GATED'} · PROD:{' '}
                {realFoundation.environments?.PRODUCTION ?? 'EXTERNAL_GATED'}
              </Text>
              <Text tone="secondary">
                Health flow: {(realFoundation.health_flow ?? []).join(' → ') || '—'}
              </Text>
              <Text tone="secondary">
                Planes: {realFoundation.control_plane}/{realFoundation.foundation_plane}/
                {realFoundation.s98_plane}/{realFoundation.s99_plane}/
                {realFoundation.s101_plane}. Fake infra:{' '}
                {String(realFoundation.fake_infrastructure_invented ?? false)}.
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {realFoundation.evaluated_at
                  ? new Date(realFoundation.evaluated_at).toISOString()
                  : '—'}
                . Secret values never shown.
              </Text>
              <Text tone="secondary">Next action: {realFoundation.next_action}</Text>
            </Card>
          ) : null}

          {apiAbuse ? (
            <Card>
              <Heading level={2}>
                API abuse protection + rate limiting hardening (Sprint 113)
              </Heading>
              <Text>{apiAbuse.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {apiAbuse.sprint ?? 113}</Badge>
                <Badge kind="pending">
                  Parallel framework:{' '}
                  {String(apiAbuse.parallel_rate_limit_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Invented WAF: {String(apiAbuse.invented_waf_edge_vendor ?? false)}
                </Badge>
                <Badge kind="pending">OTP: {apiAbuse.otp_abuse_protection ?? '—'}</Badge>
                <Badge kind="pending">Auth: {apiAbuse.authentication_abuse_protection ?? '—'}</Badge>
                <Badge kind="pending">Public API: {apiAbuse.public_api_protection ?? '—'}</Badge>
                <Badge kind="pending">Webhooks: {apiAbuse.webhook_protection ?? '—'}</Badge>
                <Badge kind="pending">Admin: {apiAbuse.admin_api_protection ?? '—'}</Badge>
                <Badge kind="pending">
                  Request size: {apiAbuse.request_size_protection ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Distributed: {apiAbuse.distributed_enforcement ?? '—'} /{' '}
                  {apiAbuse.distributed_enforcement_status ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Edge/WAF: {apiAbuse.external_waf_edge_protection ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">Blocker: {apiAbuse.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(apiAbuse.force_launch_available ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {apiAbuse.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Heading level={3}>Protection classes</Heading>
              {(apiAbuse.protection_classes ?? []).map((c) => (
                <Text key={c.id} tone="secondary">
                  [{c.class}] {c.label}: {c.status} · {c.evidence}
                </Text>
              ))}
              <Heading level={3}>Fixes</Heading>
              {(apiAbuse.vulnerabilities_fixed ?? []).map((v) => (
                <Text key={v.id} tone="secondary">
                  {v.id}: {v.summary}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {apiAbuse.security_statement ??
                  'Abuse controls tested. External edge/WAF pending.'}
              </Text>
              <Text tone="secondary">Next action: {apiAbuse.next_action}</Text>
            </Card>
          ) : null}

          {edgeWaf ? (
            <Card>
              <Heading level={2}>
                Edge / WAF / DDoS activation readiness (Sprint 114)
              </Heading>
              <Text>{edgeWaf.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {edgeWaf.sprint ?? 114}</Badge>
                <Badge kind="pending">
                  Lifecycle: {edgeWaf.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Edge/WAF selected: {edgeWaf.edge_waf_provider_selected ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  Production WAF: {edgeWaf.production_waf_enabled ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  DDoS selected: {edgeWaf.ddos_provider_selected ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  Production DDoS: {edgeWaf.production_ddos_protection_enabled ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  Trusted proxy: {edgeWaf.trusted_proxy_configuration ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Client IP spoof: {edgeWaf.client_ip_spoofing_protection ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Host protection: {edgeWaf.host_forwarded_host_protection ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Origin: {edgeWaf.origin_protection ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="pending">
                  Redis rate limit: {edgeWaf.redis_rate_limit ?? 'EXISTING_REUSED'}
                </Badge>
                <Badge kind="pending">
                  Invented vendor:{' '}
                  {String(edgeWaf.invented_edge_waf_ddos_vendor ?? false)}
                </Badge>
                <Badge kind="pending">
                  Parallel WAF: {String(edgeWaf.parallel_waf_engine_created ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {edgeWaf.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(edgeWaf.force_launch_available ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {edgeWaf.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                Path: {(edgeWaf.edge_architecture ?? []).join(' → ') || '—'}
              </Text>
              <Text tone="secondary">
                Statement:{' '}
                {edgeWaf.security_statement ??
                  'Edge security architecture prepared. External WAF required.'}
              </Text>
              <Text tone="secondary">Next action: {edgeWaf.next_action}</Text>
            </Card>
          ) : null}

          {inputSecurity ? (
            <Card>
              <Heading level={2}>
                Input security hardening — injection / SSRF / path (Sprint 115)
              </Heading>
              <Text>{inputSecurity.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {inputSecurity.sprint ?? 115}</Badge>
                <Badge kind="pending">
                  Parallel framework:{' '}
                  {String(inputSecurity.parallel_security_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">SQL/ORM: {inputSecurity.sql_orm_injection ?? '—'}</Badge>
                <Badge kind="pending">NoSQL: {inputSecurity.nosql_injection ?? '—'}</Badge>
                <Badge kind="pending">Command: {inputSecurity.command_injection ?? '—'}</Badge>
                <Badge kind="pending">SSRF: {inputSecurity.ssrf ?? '—'}</Badge>
                <Badge kind="pending">
                  Private SSRF: {inputSecurity.ssrf_private_network ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Metadata SSRF: {inputSecurity.ssrf_metadata_endpoint ?? '—'}
                </Badge>
                <Badge kind="pending">Path: {inputSecurity.path_traversal ?? '—'}</Badge>
                <Badge kind="pending">Archive: {inputSecurity.archive_traversal ?? '—'}</Badge>
                <Badge kind="pending">Redirect: {inputSecurity.unsafe_redirect ?? '—'}</Badge>
                <Badge kind="pending">
                  Prototype: {inputSecurity.prototype_pollution ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Errors: {inputSecurity.sensitive_error_leakage ?? '—'}
                </Badge>
                <Badge kind="warning">
                  External pentest: {inputSecurity.external_pentest ?? 'REQUIRED'}
                </Badge>
                <Badge kind="warning">Blocker: {inputSecurity.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(inputSecurity.force_launch_available ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {inputSecurity.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Heading level={3}>Fixes</Heading>
              {(inputSecurity.vulnerabilities_fixed ?? []).map((v) => (
                <Text key={v.id} tone="secondary">
                  {v.id}: {v.summary}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {inputSecurity.security_statement ??
                  'Input security controls tested. External pentest required.'}
              </Text>
              <Text tone="secondary">Next action: {inputSecurity.next_action}</Text>
            </Card>
          ) : null}

          {securityGate ? (
            <Card>
              <Heading level={2}>
                Production security gate consolidation (Sprint 116)
              </Heading>
              <Text>{securityGate.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {securityGate.sprint ?? 116}</Badge>
                <Badge kind="pending">
                  Source: {securityGate.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Pentest lifecycle: {securityGate.external_pentest_lifecycle ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Pentest: {securityGate.external_pentest_required ?? 'YES'} / passed{' '}
                  {securityGate.external_pentest_passed ?? 'NO'}
                </Badge>
                <Badge kind="warning">
                  Certification pending:{' '}
                  {securityGate.security_certification_pending ?? 'YES'}
                </Badge>
                <Badge kind="pending">
                  Certified: {securityGate.production_security_certified ?? 'NO'}
                </Badge>
                <Badge kind="pending">
                  Parallel framework:{' '}
                  {String(securityGate.parallel_security_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Invented pentest:{' '}
                  {String(securityGate.invented_pentest_result ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fail-closed:{' '}
                  {securityGate.sandbox_production_fail_closed?.overall ?? '—'}
                </Badge>
                <Badge kind="warning">Blocker: {securityGate.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(securityGate.force_launch_available ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {securityGate.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {securityGate.why_launch_blocked}</Text>
              <Heading level={3}>Required external evidence</Heading>
              {(securityGate.required_external_evidence ?? []).slice(0, 8).map((e) => (
                <Text key={e.id} tone="secondary">
                  [{e.status}] {e.label}
                </Text>
              ))}
              <Heading level={3}>Residual risks</Heading>
              {(securityGate.residual_risks ?? []).map((r) => (
                <Text key={r.code} tone="secondary">
                  {r.code}: {r.summary} ({r.status})
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {securityGate.security_statement ??
                  'Security gate consolidated. External pentest required.'}
              </Text>
              <Text tone="secondary">Next action: {securityGate.next_action}</Text>
              <Link href="/launch-readiness">
                <Button variant="tertiary" size="sm">
                  Open Production Launch Control
                </Button>
              </Link>
            </Card>
          ) : null}

          {foundationPrep ? (
            <Card>
              <Heading level={2}>
                Production foundation activation preparation (Sprint 117)
              </Heading>
              <Text>{foundationPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {foundationPrep.sprint ?? 117}</Badge>
                <Badge kind="pending">
                  Source: {foundationPrep.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Env: {foundationPrep.production_environment?.status ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Separation:{' '}
                  {foundationPrep.production_environment?.separation_verified ?? 'YES'}
                </Badge>
                <Badge kind="warning">
                  Secrets: {foundationPrep.production_secrets?.status ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Secrets mgr selected:{' '}
                  {foundationPrep.production_secrets?.secrets_manager_selected ?? 'NO'}
                </Badge>
                <Badge kind="warning">
                  Database: {foundationPrep.production_database?.status ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Migration cutover:{' '}
                  {foundationPrep.migration_safety?.production_cutover ?? 'NOT_AUTHORIZED'}
                </Badge>
                <Badge kind="warning">
                  Deploy lifecycle:{' '}
                  {foundationPrep.deployment_target?.lifecycle ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Rollback:{' '}
                  {foundationPrep.rollback?.sandbox ?? 'SANDBOX_PROVEN'} /{' '}
                  {foundationPrep.rollback?.production ?? 'NOT_PROVEN'}
                </Badge>
                <Badge kind="pending">
                  Fake infra:{' '}
                  {String(foundationPrep.fake_infrastructure_invented ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {foundationPrep.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(foundationPrep.force_launch_available ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {foundationPrep.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {foundationPrep.why_launch_blocked}</Text>
              <Heading level={3}>Foundation rails</Heading>
              {(foundationPrep.rails ?? []).map((r) => (
                <Text key={r.rail} tone="secondary">
                  {r.rail}: {r.status} · {r.blocker} — {r.required_external_action}
                </Text>
              ))}
              <Heading level={3}>Required external actions</Heading>
              {(foundationPrep.required_external_actions ?? []).map((a) => (
                <Text key={a.id} tone="secondary">
                  [{a.status}] {a.action}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {foundationPrep.security_statement ??
                  'Foundation contracts prepared. Production launch remains NO.'}
              </Text>
              <Text tone="secondary">Next action: {foundationPrep.next_action}</Text>
            </Card>
          ) : null}

          {affiliatePayoutClosure ? (
            <Card>
              <Heading level={2}>
                Affiliate payout + partner settlement workflow closure (Sprint 149)
              </Heading>
              <Text>{affiliatePayoutClosure.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software:{' '}
                  {affiliatePayoutClosure.admin_summary?.software_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  AFFILIATE PAYOUT:{' '}
                  {affiliatePayoutClosure.admin_summary?.affiliate_payout ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Commission:{' '}
                  {affiliatePayoutClosure.admin_summary?.commission_status ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="info">
                  Settlement:{' '}
                  {affiliatePayoutClosure.admin_summary?.settlement_batch ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="pending">
                  Payable: {affiliatePayoutClosure.admin_summary?.payable_amount ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Payout state: {affiliatePayoutClosure.admin_summary?.payout_state ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Provider: {affiliatePayoutClosure.admin_summary?.provider_state ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  KYC/KYB: {affiliatePayoutClosure.admin_summary?.kyc_kyb_state ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Reconciliation:{' '}
                  {affiliatePayoutClosure.admin_summary?.reconciliation_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  Enabled:{' '}
                  {String(affiliatePayoutClosure.production_payout_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Real money: {String(affiliatePayoutClosure.real_money_moved ?? false)}
                </Badge>
                <Badge kind="warning">
                  External-gated:{' '}
                  {String(affiliatePayoutClosure.admin_summary?.external_gated ?? true)}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {affiliatePayoutClosure.admin_summary?.blocker_reason ??
                    affiliatePayoutClosure.remaining_blocker}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH:{' '}
                  {affiliatePayoutClosure.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                Secrets printed: {String(affiliatePayoutClosure.secrets_printed ?? false)}.
                Fabricated payout:{' '}
                {String(affiliatePayoutClosure.fabricated_payout_success ?? false)}.
              </Text>
            </Card>
          ) : null}

          {kycKybActivationPath ? (
            <Card>
              <Heading level={2}>
                Production KYC/KYB + healthcare partner verification (Sprint 150)
              </Heading>
              <Text>{kycKybActivationPath.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software:{' '}
                  {kycKybActivationPath.admin_summary?.software_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  KYC/KYB:{' '}
                  {kycKybActivationPath.admin_summary?.kyc_kyb ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Provider:{' '}
                  {kycKybActivationPath.admin_summary?.provider_state ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Verification:{' '}
                  {kycKybActivationPath.admin_summary?.verification_state ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Evidence:{' '}
                  {kycKybActivationPath.admin_summary?.evidence_reference ?? 'REFERENCES_ONLY'}
                </Badge>
                <Badge kind="info">
                  Expiry: {kycKybActivationPath.admin_summary?.expiry ?? 'SUPPORTED_FAIL_CLOSED'}
                </Badge>
                <Badge kind="warning">
                  Partner:{' '}
                  {kycKybActivationPath.admin_summary?.partner_state ??
                    'NOT_PRODUCTION_ENABLED'}
                </Badge>
                <Badge kind="warning">
                  Approval:{' '}
                  {kycKybActivationPath.admin_summary?.approval_state ?? 'NOT_APPROVED'}
                </Badge>
                <Badge kind="warning">
                  Production activation:{' '}
                  {kycKybActivationPath.admin_summary?.production_activation_state ??
                    'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Payout eligibility:{' '}
                  {kycKybActivationPath.admin_summary?.payout_eligibility ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Clinical eligibility:{' '}
                  {kycKybActivationPath.admin_summary?.clinical_eligibility ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Lifecycle: {kycKybActivationPath.lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Enabled: {String(kycKybActivationPath.enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  External-gated:{' '}
                  {String(kycKybActivationPath.admin_summary?.external_gated ?? true)}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {kycKybActivationPath.admin_summary?.blocker_reason ??
                    kycKybActivationPath.remaining_blocker}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH:{' '}
                  {kycKybActivationPath.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                Secrets printed: {String(kycKybActivationPath.secrets_printed ?? false)}.
                Invented provider:{' '}
                {String(kycKybActivationPath.invented_kyc_provider ?? false)}.
                Invented verification:{' '}
                {String(kycKybActivationPath.invented_verification_results ?? false)}.
              </Text>
            </Card>
          ) : null}

          {securityLaunchGatePath ? (
            <Card>
              <Heading level={2}>
                Production security launch gate final closure (Sprint 148)
              </Heading>
              <Text>{securityLaunchGatePath.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software:{' '}
                  {securityLaunchGatePath.admin_summary?.software_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  SECURITY GATE:{' '}
                  {securityLaunchGatePath.admin_summary?.security_gate ?? 'EVIDENCE_REQUIRED'}
                </Badge>
                <Badge kind="info">
                  App security:{' '}
                  {securityLaunchGatePath.admin_summary?.application_security ??
                    'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="info">
                  API abuse:{' '}
                  {securityLaunchGatePath.admin_summary?.api_abuse_protection ??
                    'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  Edge/WAF: {securityLaunchGatePath.admin_summary?.edge_waf ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  DDoS: {securityLaunchGatePath.admin_summary?.ddos ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Origin:{' '}
                  {securityLaunchGatePath.admin_summary?.origin_protection ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Secrets: {securityLaunchGatePath.admin_summary?.secrets ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  Observability:{' '}
                  {securityLaunchGatePath.admin_summary?.observability ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Pentest:{' '}
                  {securityLaunchGatePath.admin_summary?.external_pentest ?? 'EVIDENCE_REQUIRED'}
                </Badge>
                <Badge kind="pending">
                  Approval: {securityLaunchGatePath.admin_summary?.approval ?? 'PENDING'}
                </Badge>
                <Badge kind="warning">
                  Launch:{' '}
                  {securityLaunchGatePath.admin_summary?.overall_launch_state ?? 'NO'}
                </Badge>
                <Badge kind="warning">
                  Enabled:{' '}
                  {String(
                    securityLaunchGatePath.admin_summary?.production_security_enabled ?? false,
                  )}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {securityLaunchGatePath.admin_summary?.blocker_reason ??
                    securityLaunchGatePath.remaining_blocker}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH:{' '}
                  {securityLaunchGatePath.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                S110–S116 rebuilt:{' '}
                {String(securityLaunchGatePath.s110_s116_rebuilt ?? false)}. Invented pentest:{' '}
                {String(securityLaunchGatePath.invented_pentest_result ?? false)}. Invented WAF:{' '}
                {String(securityLaunchGatePath.invented_waf ?? false)}. Secrets printed:{' '}
                {String(securityLaunchGatePath.secrets_printed ?? false)}.
              </Text>
            </Card>
          ) : null}

          {backupPitrPath ? (
            <Card>
              <Heading level={2}>
                Production managed backup + PITR activation (Sprint 147)
              </Heading>
              <Text>{backupPitrPath.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software:{' '}
                  {backupPitrPath.admin_summary?.software_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  PRODUCTION BACKUP / PITR:{' '}
                  {backupPitrPath.admin_summary?.production_backup_pitr ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Provider: {backupPitrPath.admin_summary?.provider ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  DB binding: {backupPitrPath.admin_summary?.database_binding ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Config: {backupPitrPath.admin_summary?.configuration ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Verification: {backupPitrPath.admin_summary?.verification ?? 'UNVERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Approval: {backupPitrPath.admin_summary?.approval ?? 'NOT_APPROVED'}
                </Badge>
                <Badge kind="warning">
                  Enabled: {String(backupPitrPath.admin_summary?.enabled ?? false)}
                </Badge>
                <Badge kind="info">
                  RPO: {backupPitrPath.admin_summary?.rpo ?? '15m TARGET_DEFINED'}
                </Badge>
                <Badge kind="info">
                  RTO: {backupPitrPath.admin_summary?.rto ?? '4h TARGET_DEFINED'}
                </Badge>
                <Badge kind="warning">
                  DR: {backupPitrPath.admin_summary?.dr_environment ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Restore:{' '}
                  {backupPitrPath.admin_summary?.restore_readiness ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  S142:{' '}
                  {backupPitrPath.secrets_manager_runtime_resolver ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  External-gated:{' '}
                  {String(backupPitrPath.admin_summary?.external_gated ?? true)}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {backupPitrPath.admin_summary?.blocker_reason ??
                    backupPitrPath.remaining_blocker}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {backupPitrPath.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                S141 rebuilt: {String(backupPitrPath.s141_rebuilt ?? false)}. Secrets printed:{' '}
                {String(backupPitrPath.secrets_printed ?? false)}. Fake infra:{' '}
                {String(backupPitrPath.fake_infrastructure_invented ?? false)}.
              </Text>
            </Card>
          ) : null}

          {databaseActivationPath ? (
            <Card>
              <Heading level={2}>
                Production database activation + cutover safety (Sprint 146)
              </Heading>
              <Text>{databaseActivationPath.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software:{' '}
                  {databaseActivationPath.admin_summary?.software_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  PRODUCTION DATABASE:{' '}
                  {databaseActivationPath.admin_summary?.production_database ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Provider:{' '}
                  {databaseActivationPath.admin_summary?.provider ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Target state:{' '}
                  {databaseActivationPath.admin_summary?.target_state ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Config:{' '}
                  {databaseActivationPath.admin_summary?.configuration_state ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Verification:{' '}
                  {databaseActivationPath.admin_summary?.verification_state ?? 'UNVERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Migration:{' '}
                  {databaseActivationPath.admin_summary?.migration_state ?? 'NOT_AUTHORIZED'}
                </Badge>
                <Badge kind="warning">
                  Backup/PITR:{' '}
                  {databaseActivationPath.admin_summary?.backup_pitr_dependency ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Readiness: {databaseActivationPath.admin_summary?.readiness ?? 'NOT_READY'}
                </Badge>
                <Badge kind="info">
                  S142:{' '}
                  {databaseActivationPath.secrets_manager_runtime_resolver ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  Enabled: {String(databaseActivationPath.enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  External-gated:{' '}
                  {String(databaseActivationPath.admin_summary?.external_gated ?? true)}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {databaseActivationPath.admin_summary?.blocker_reason ??
                    databaseActivationPath.remaining_blocker}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {databaseActivationPath.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                Secrets printed: {String(databaseActivationPath.secrets_printed ?? false)}.
                Connection strings printed:{' '}
                {String(databaseActivationPath.connection_strings_printed ?? false)}. Fake
                infra: {String(databaseActivationPath.fake_infrastructure_invented ?? false)}.
              </Text>
            </Card>
          ) : null}

          {deploymentTargetPath ? (
            <Card>
              <Heading level={2}>
                Real production deployment target activation (Sprint 145)
              </Heading>
              <Text>{deploymentTargetPath.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software:{' '}
                  {deploymentTargetPath.admin_summary?.software_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  PRODUCTION DEPLOYMENT:{' '}
                  {deploymentTargetPath.admin_summary?.production_deployment ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Provider:{' '}
                  {deploymentTargetPath.admin_summary?.target_provider ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Target state:{' '}
                  {deploymentTargetPath.admin_summary?.target_state ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  CI/CD: {deploymentTargetPath.admin_summary?.cicd_state ?? 'VALIDATE_ONLY'}
                </Badge>
                <Badge kind="pending">
                  Artifact: {deploymentTargetPath.admin_summary?.artifact_state ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Config: {deploymentTargetPath.admin_summary?.configuration_state ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  DB: {deploymentTargetPath.admin_summary?.database_state ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Secrets: {deploymentTargetPath.admin_summary?.secrets_state ?? '—'}
                </Badge>
                <Badge kind="info">
                  S142:{' '}
                  {deploymentTargetPath.secrets_manager_runtime_resolver ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  Deployed: {String(deploymentTargetPath.deployed ?? false)}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {deploymentTargetPath.admin_summary?.blocker_reason ??
                    deploymentTargetPath.remaining_blocker}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {deploymentTargetPath.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                Current release: none · Previous known-good: none. Fake infra:{' '}
                {String(deploymentTargetPath.fake_infrastructure_invented ?? false)}. Secrets
                printed: {String(deploymentTargetPath.secrets_printed ?? false)}.
              </Text>
            </Card>
          ) : null}

          {deploymentReleasePath ? (
            <Card>
              <Heading level={2}>
                Production deployment + release pipeline closure (Sprint 144)
              </Heading>
              <Text>{deploymentReleasePath.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software:{' '}
                  {deploymentReleasePath.admin_summary?.software_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  PRODUCTION RELEASE:{' '}
                  {deploymentReleasePath.admin_summary?.production_release ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {deploymentReleasePath.lifecycle ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Artifact:{' '}
                  {deploymentReleasePath.admin_summary?.artifact_identity ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Migration:{' '}
                  {deploymentReleasePath.admin_summary?.migration_state ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Readiness:{' '}
                  {deploymentReleasePath.admin_summary?.readiness_state ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Rollback:{' '}
                  {deploymentReleasePath.admin_summary?.rollback_readiness ?? '—'}
                </Badge>
                <Badge kind="info">
                  S142:{' '}
                  {deploymentReleasePath.secrets_manager_runtime_resolver ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  Deployed:{' '}
                  {String(deploymentReleasePath.actually_deployed ?? false)}
                </Badge>
                <Badge kind="warning">
                  Enabled:{' '}
                  {String(deploymentReleasePath.production_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {deploymentReleasePath.admin_summary?.blocker_reason ??
                    deploymentReleasePath.remaining_blocker}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH:{' '}
                  {deploymentReleasePath.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                SOFTWARE_READY ≠ DEPLOYABLE ≠ DEPLOYED ≠ ENABLED. Fake infra:{' '}
                {String(deploymentReleasePath.fake_infrastructure_invented ?? false)}. Secrets
                printed: {String(deploymentReleasePath.secrets_printed ?? false)}.
              </Text>
            </Card>
          ) : null}

          {releaseEng ? (
            <Card>
              <Heading level={2}>
                Production release engineering readiness (Sprint 118)
              </Heading>
              <Text>{releaseEng.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {releaseEng.sprint ?? 118}</Badge>
                <Badge kind="pending">
                  Source: {releaseEng.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="info">
                  Software: {releaseEng.software?.status ?? 'READY'}
                </Badge>
                <Badge kind="warning">
                  Infra: {releaseEng.production_infrastructure ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="warning">
                  Deploy target:{' '}
                  {releaseEng.deployment_target?.lifecycle ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Pipeline: {releaseEng.release_pipeline?.overall_status ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Migration: {releaseEng.migration ?? 'NOT_AUTHORIZED'}
                </Badge>
                <Badge kind="pending">
                  Rollback:{' '}
                  {releaseEng.rollback?.sandbox ?? 'SANDBOX_PROVEN'} /{' '}
                  {releaseEng.rollback?.production ?? 'PRODUCTION_NOT_PROVEN'}
                </Badge>
                <Badge kind="warning">
                  Security:{' '}
                  {releaseEng.security_gate?.remaining_blocker ?? 'EXTERNAL_PENTEST_REQUIRED'}
                </Badge>
                <Badge kind="pending">
                  Smoke: {releaseEng.smoke_test?.path ?? 'SANDBOX_ONLY'}
                </Badge>
                <Badge kind="pending">
                  Signing: {releaseEng.artifact_identity?.hashing_signing ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="pending">
                  Parallel machine:{' '}
                  {String(releaseEng.parallel_deployment_state_machine_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake infra: {String(releaseEng.fake_infrastructure_invented ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {releaseEng.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {releaseEng.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {releaseEng.why_launch_blocked}</Text>
              <Heading level={3}>Operator pipeline</Heading>
              {(releaseEng.release_pipeline?.operator_pipeline ?? []).map((s) => (
                <Text key={s.stage} tone="secondary">
                  {s.stage}: {s.status} — {s.note}
                </Text>
              ))}
              <Heading level={3}>Required external actions</Heading>
              {(releaseEng.required_external_actions ?? []).map((a) => (
                <Text key={a.id} tone="secondary">
                  [{a.status}] {a.action}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {releaseEng.security_statement ??
                  'Release engineering contracts prepared. Production launch remains NO.'}
              </Text>
              <Text tone="secondary">Next action: {releaseEng.next_action}</Text>
            </Card>
          ) : null}

          {deployTarget ? (
            <Card>
              <Heading level={2}>
                Real production deployment target activation (Sprint 119)
              </Heading>
              <Text>{deployTarget.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {deployTarget.sprint ?? 119}</Badge>
                <Badge kind="pending">
                  Source: {deployTarget.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Lifecycle: {deployTarget.deployment_target?.lifecycle ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="warning">
                  Env: {deployTarget.admin_summary?.production_environment ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="warning">
                  Target: {deployTarget.admin_summary?.deployment_target ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="warning">
                  Pipeline: {deployTarget.admin_summary?.release_pipeline ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="warning">
                  Database: {deployTarget.admin_summary?.production_database ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="warning">
                  Secrets: {deployTarget.admin_summary?.secrets_manager ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Rollback: {deployTarget.admin_summary?.rollback_target ?? 'NOT_CONFIGURED'} /{' '}
                  {deployTarget.admin_summary?.rollback_proven ?? 'NOT_PROVEN'}
                </Badge>
                <Badge kind="warning">
                  Security: {deployTarget.admin_summary?.security_certification ?? 'PENDING'} /{' '}
                  {deployTarget.admin_summary?.security_blocker ?? 'EXTERNAL_PENTEST_REQUIRED'}
                </Badge>
                <Badge kind="pending">
                  Deployable: {String(deployTarget.deployment_target?.deployable ?? false)}
                </Badge>
                <Badge kind="pending">
                  Parallel machine:{' '}
                  {String(deployTarget.parallel_deployment_state_machine_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake infra: {String(deployTarget.fake_infrastructure_invented ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {deployTarget.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {deployTarget.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {deployTarget.why_launch_blocked}</Text>
              <Heading level={3}>Fail-closed cases</Heading>
              {(deployTarget.fail_closed_cases ?? []).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: blocked={String(c.blocked)} · {c.primary_blocker}
                </Text>
              ))}
              <Heading level={3}>Reference slots (no secret values)</Heading>
              {(deployTarget.reference_slots ?? []).slice(0, 8).map((s) => (
                <Text key={s.id} tone="secondary">
                  {s.label}: {s.status} ({s.reference_key})
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {deployTarget.security_statement ??
                  'Deployment target activation contract prepared. Production launch remains NO.'}
              </Text>
              <Text tone="secondary">Next action: {deployTarget.next_action}</Text>
            </Card>
          ) : null}

          {pspPrep ? (
            <Card>
              <Heading level={2}>
                Real PSP / payment activation preparation (Sprint 120)
              </Heading>
              <Text>{pspPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {pspPrep.sprint ?? 120}</Badge>
                <Badge kind="pending">
                  Source: {pspPrep.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Lifecycle: {pspPrep.psp?.lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Provider: {pspPrep.admin_summary?.provider ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Credentials:{' '}
                  {pspPrep.admin_summary?.production_credentials ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Webhook: {pspPrep.admin_summary?.webhook ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Verification: {pspPrep.admin_summary?.verification ?? 'NOT_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Approval: {pspPrep.admin_summary?.approval ?? 'NOT_APPROVED'}
                </Badge>
                <Badge kind="warning">
                  Enablement: {pspPrep.admin_summary?.enablement ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production payment:{' '}
                  {pspPrep.admin_summary?.production_payment ?? 'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  Sandbox: {pspPrep.psp?.sandbox_payment ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Parallel framework:{' '}
                  {String(pspPrep.parallel_payment_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake PSP: {String(pspPrep.fake_psp_invented ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real money: {String(pspPrep.real_money_processed ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {pspPrep.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {pspPrep.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {pspPrep.why_launch_blocked}</Text>
              <Heading level={3}>Fail-closed cases</Heading>
              {(pspPrep.fail_closed_cases ?? []).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: blocked={String(c.production_payment_blocked)} ·{' '}
                  {c.primary_blocker}
                </Text>
              ))}
              <Heading level={3}>Configuration references (no secret values)</Heading>
              {(pspPrep.configuration_references ?? []).slice(0, 8).map((s) => (
                <Text key={s.id} tone="secondary">
                  {s.label}: {s.status} ({s.reference_key})
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {pspPrep.security_statement ??
                  'PSP activation contracts prepared. Production payment remains BLOCKED.'}
              </Text>
              <Text tone="secondary">Next action: {pspPrep.next_action}</Text>
            </Card>
          ) : null}

          {pspControl ? (
            <Card>
              <Heading level={2}>
                Real PSP / payment production activation control (Sprint 128 + S132 path)
              </Heading>
              <Text>{pspControl.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {pspControl.sprint ?? 128}</Badge>
                <Badge kind="pending">
                  S132 path: {pspControl.s132_activation_path?.software_activation_path ?? '—'}
                </Badge>
                <Badge kind="warning">
                  S132 lifecycle: {pspControl.s132_activation_path?.lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  S132 secrets resolver:{' '}
                  {pspControl.s132_activation_path?.secrets_manager_runtime_resolver ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  S132 production:{' '}
                  {pspControl.s132_activation_path?.production_payment ?? 'BLOCKED'}
                </Badge>
                <Badge kind="pending">
                  Source: {pspControl.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Lifecycle: {pspControl.psp?.lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Provider: {pspControl.admin_summary?.provider ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Configured: {pspControl.admin_summary?.configured ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Credentials: {pspControl.admin_summary?.credentials ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Webhook: {pspControl.admin_summary?.webhook ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Verification: {pspControl.admin_summary?.verification ?? 'NOT_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Approval: {pspControl.admin_summary?.approval ?? 'NOT_APPROVED'}
                </Badge>
                <Badge kind="warning">
                  Environment:{' '}
                  {pspControl.admin_summary?.production_environment ?? 'BLOCKED'}
                </Badge>
                <Badge kind="warning">
                  Market/currency:{' '}
                  {pspControl.admin_summary?.market_currency_validation ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Settlement:{' '}
                  {pspControl.admin_summary?.settlement_configuration ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Final activation:{' '}
                  {pspControl.admin_summary?.final_activation_state ?? 'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  Sandbox: {pspControl.psp?.sandbox_payment ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Parallel payment:{' '}
                  {String(pspControl.parallel_payment_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake PSP: {String(pspControl.fake_psp_invented ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real money: {String(pspControl.real_money_processed ?? false)}
                </Badge>
                <Badge kind="pending">
                  Configured≠Verified:{' '}
                  {String(!(pspControl.provider_configured_equals_verified ?? true))}
                </Badge>
                <Badge kind="pending">
                  Approved≠Enabled:{' '}
                  {String(!(pspControl.provider_approved_equals_production_enabled ?? true))}
                </Badge>
                <Badge kind="pending">
                  Money safety: {pspControl.money_safety_status ?? 'PASS'}
                </Badge>
                <Badge kind="warning">Blocker: {pspControl.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {pspControl.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {pspControl.why_launch_blocked}</Text>
              <Heading level={3}>Activation gates</Heading>
              {(pspControl.activation_gates ?? []).slice(0, 10).map((g) => (
                <Text key={g.id} tone="secondary">
                  {g.label}: {g.status} · {g.reason}
                </Text>
              ))}
              <Heading level={3}>Money safety</Heading>
              {(pspControl.customer_money_safety ?? []).slice(0, 6).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: {c.outcome} · {c.primary_control}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {pspControl.security_statement ??
                  'PSP production activation control prepared. Production payment remains BLOCKED.'}
              </Text>
              <Text tone="secondary">Next action: {pspControl.next_action}</Text>
            </Card>
          ) : null}

          {commsPrep ? (
            <Card>
              <Heading level={2}>
                Real OTP + transactional communications activation preparation (Sprint 121 + S133
                path)
              </Heading>
              <Text>{commsPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {commsPrep.sprint ?? 121}</Badge>
                <Badge kind="pending">
                  S133 path: {commsPrep.s133_activation_path?.software_activation_path ?? '—'}
                </Badge>
                <Badge kind="warning">
                  S133 production:{' '}
                  {commsPrep.s133_activation_path?.production_communications ?? 'BLOCKED'}
                </Badge>
                <Badge kind="warning">
                  S133 secrets resolver:{' '}
                  {commsPrep.s133_activation_path?.secrets_manager_runtime_resolver ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  SENT≠DELIVERED:{' '}
                  {String(commsPrep.s133_activation_path?.sent_neq_delivered ?? true)}
                </Badge>
                <Badge kind="pending">
                  Source: {commsPrep.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="warning">
                  OTP: {commsPrep.admin_summary?.otp_provider ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  SMS: {commsPrep.admin_summary?.sms ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Email: {commsPrep.admin_summary?.email ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Push: {commsPrep.admin_summary?.push ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Credentials: {commsPrep.admin_summary?.credentials ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Verification: {commsPrep.admin_summary?.verification ?? 'NOT_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Approval: {commsPrep.admin_summary?.approval ?? 'NOT_APPROVED'}
                </Badge>
                <Badge kind="warning">
                  Enablement: {commsPrep.admin_summary?.enablement ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production comms:{' '}
                  {commsPrep.admin_summary?.production_communications ?? 'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  Sandbox: {commsPrep.otp_provider?.sandbox ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Parallel OTP: {String(commsPrep.parallel_otp_system_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake provider: {String(commsPrep.fake_provider_invented ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real OTP sent: {String(commsPrep.real_otp_sent ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {commsPrep.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {commsPrep.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {commsPrep.why_launch_blocked}</Text>
              <Heading level={3}>Fail-closed cases</Heading>
              {(commsPrep.fail_closed_cases ?? []).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: blocked={String(c.production_comms_blocked)} ·{' '}
                  {c.primary_blocker}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {commsPrep.security_statement ??
                  'OTP/comms activation contracts prepared. Production communications remain BLOCKED.'}
              </Text>
              <Text tone="secondary">Next action: {commsPrep.next_action}</Text>
            </Card>
          ) : null}

          {carrierPrep ? (
            <Card>
              <Heading level={2}>
                Real carrier + logistics activation preparation (Sprint 122)
              </Heading>
              <Text>{carrierPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {carrierPrep.sprint ?? 122}</Badge>
                <Badge kind="pending">
                  Source: {carrierPrep.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Carrier: {carrierPrep.admin_summary?.carrier ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Credentials:{' '}
                  {carrierPrep.admin_summary?.production_credentials ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Webhook: {carrierPrep.admin_summary?.webhook ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="warning">
                  Serviceability:{' '}
                  {carrierPrep.admin_summary?.serviceability ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="pending">
                  Verification: {carrierPrep.admin_summary?.verification ?? 'NOT_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Approval: {carrierPrep.admin_summary?.approval ?? 'NOT_APPROVED'}
                </Badge>
                <Badge kind="warning">
                  Enablement: {carrierPrep.admin_summary?.enablement ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production logistics:{' '}
                  {carrierPrep.admin_summary?.production_logistics ?? 'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  Sandbox: {carrierPrep.carrier?.sandbox ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Parallel carrier:{' '}
                  {String(carrierPrep.parallel_carrier_abstraction_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake carrier: {String(carrierPrep.fake_carrier_invented ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real shipment: {String(carrierPrep.real_shipment_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real tracking: {String(carrierPrep.real_tracking_number_generated ?? false)}
                </Badge>
                <Badge kind="pending">
                  Native rider: {carrierPrep.pod?.native_rider ?? 'DEVICE_NOT_AVAILABLE'}
                </Badge>
                <Badge kind="warning">Blocker: {carrierPrep.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {carrierPrep.can_production_launch ?? 'NO'}
                </Badge>
                <Badge kind="info">
                  S134 path:{' '}
                  {carrierPrep.s134_activation_path?.software_activation_path ?? '—'}
                </Badge>
                <Badge kind="warning">
                  S134 production:{' '}
                  {carrierPrep.s134_activation_path?.production_logistics ?? 'BLOCKED'}
                </Badge>
                <Badge kind="warning">
                  Secrets resolver:{' '}
                  {carrierPrep.s134_activation_path?.secrets_manager_runtime_resolver ??
                    'MISSING'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {carrierPrep.why_launch_blocked}</Text>
              <Heading level={3}>Fail-closed cases</Heading>
              {(carrierPrep.fail_closed_cases ?? []).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: blocked={String(c.production_shipping_blocked)} ·{' '}
                  {c.primary_blocker}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {carrierPrep.security_statement ??
                  'Carrier/logistics activation contracts prepared. Production logistics remain BLOCKED.'}
              </Text>
              <Text tone="secondary">Next action: {carrierPrep.next_action}</Text>
            </Card>
          ) : null}

          {kycPrep ? (
            <Card>
              <Heading level={2}>
                Real KYC/KYB + healthcare partner verification activation preparation (Sprint
                124)
              </Heading>
              <Text>{kycPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {kycPrep.sprint ?? 124}</Badge>
                <Badge kind="pending">
                  Source: {kycPrep.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="warning">
                  KYC: {kycPrep.admin_summary?.kyc_provider ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Credentials: {kycPrep.admin_summary?.production_credentials ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Callback: {kycPrep.admin_summary?.webhook_callback ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="warning">
                  Registry: {kycPrep.admin_summary?.healthcare_registry ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Storage/KMS: {kycPrep.admin_summary?.storage_kms ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Malware: {kycPrep.admin_summary?.malware_scan ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="pending">
                  Verification: {kycPrep.admin_summary?.verification ?? 'NOT_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Approval: {kycPrep.admin_summary?.approval ?? 'NOT_APPROVED'}
                </Badge>
                <Badge kind="warning">
                  Enablement: {kycPrep.admin_summary?.enablement ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production partner verification:{' '}
                  {kycPrep.admin_summary?.production_partner_verification ?? 'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  Sandbox: {kycPrep.kyc_provider?.sandbox ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Parallel KYC: {String(kycPrep.parallel_kyc_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake provider: {String(kycPrep.fake_kyc_provider_invented ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real KYC selected: {String(kycPrep.real_kyc_provider_selected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Registry connected:{' '}
                  {String(kycPrep.real_healthcare_registry_connected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Partner production approved:{' '}
                  {String(kycPrep.real_partner_production_approved ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {kycPrep.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {kycPrep.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {kycPrep.why_launch_blocked}</Text>
              <Heading level={3}>Fail-closed cases</Heading>
              {(kycPrep.fail_closed_cases ?? []).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: blocked={String(c.production_verification_blocked)} ·{' '}
                  {c.primary_blocker}
                </Text>
              ))}
              <Heading level={3}>Partner types</Heading>
              {(kycPrep.partner_types ?? []).map((p) => (
                <Text key={p.partner_type} tone="secondary">
                  {p.partner_type}: {p.sandbox} / {p.production_privilege}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {kycPrep.security_statement ??
                  'KYC/KYB activation contracts prepared. Production partner verification remains BLOCKED.'}
              </Text>
              <Text tone="secondary">Next action: {kycPrep.next_action}</Text>
            </Card>
          ) : null}

          {pharmacyVendorPrep ? (
            <Card>
              <Heading level={2}>
                Pharmacy / vendor network + onboarding closure (Sprint 135)
              </Heading>
              <Text>{pharmacyVendorPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {pharmacyVendorPrep.sprint ?? 135}</Badge>
                <Badge kind="pending">
                  Source: {pharmacyVendorPrep.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="info">
                  Lifecycle: {pharmacyVendorPrep.pharmacy_vendor?.lifecycle ?? '—'}
                </Badge>
                <Badge kind="info">
                  Application: {pharmacyVendorPrep.admin_summary?.application ?? 'READY'}
                </Badge>
                <Badge kind="warning">
                  Verification: {pharmacyVendorPrep.admin_summary?.verification ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Approval: {pharmacyVendorPrep.admin_summary?.approval ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="warning">
                  Activation: {pharmacyVendorPrep.admin_summary?.activation ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Catalog: {pharmacyVendorPrep.admin_summary?.catalog_ownership ?? 'READY'}
                </Badge>
                <Badge kind="info">
                  Inventory: {pharmacyVendorPrep.admin_summary?.inventory ?? 'READY'}
                </Badge>
                <Badge kind="info">
                  Fulfillment: {pharmacyVendorPrep.admin_summary?.fulfillment ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="info">
                  Settlement: {pharmacyVendorPrep.admin_summary?.settlement ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="info">
                  Suspension: {pharmacyVendorPrep.admin_summary?.suspension ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="warning">
                  Production network:{' '}
                  {pharmacyVendorPrep.admin_summary?.production_pharmacy_vendor_network ??
                    'BLOCKED'}
                </Badge>
                <Badge kind="pending">
                  Doc≠Partner:{' '}
                  {String(
                    !(pharmacyVendorPrep.document_verified_equals_partner_verified ?? true),
                  )}
                </Badge>
                <Badge kind="pending">
                  Approved≠Enabled:{' '}
                  {String(!(pharmacyVendorPrep.approved_equals_production_enabled ?? true))}
                </Badge>
                <Badge kind="warning">Blocker: {pharmacyVendorPrep.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {pharmacyVendorPrep.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {pharmacyVendorPrep.why_launch_blocked}</Text>
              <Heading level={3}>Fail-closed cases</Heading>
              {(pharmacyVendorPrep.fail_closed_cases ?? []).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: blocked={String(c.production_fulfillment_blocked)} ·{' '}
                  {c.primary_blocker}
                </Text>
              ))}
              <Text tone="secondary">
                Separation: {pharmacyVendorPrep.verification_separation?.statement}
              </Text>
              <Text tone="secondary">
                Statement:{' '}
                {pharmacyVendorPrep.security_statement ??
                  'Pharmacy/vendor software lifecycle closed. Production network remains BLOCKED.'}
              </Text>
              <Text tone="secondary">Next action: {pharmacyVendorPrep.next_action}</Text>
            </Card>
          ) : null}

          {labPartnerPrep ? (
            <Card>
              <Heading level={2}>
                Real lab partner onboarding + production activation control (Sprint 127)
              </Heading>
              <Text>{labPartnerPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {labPartnerPrep.sprint ?? 127}</Badge>
                <Badge kind="pending">
                  Source: {labPartnerPrep.authoritative_source ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Lab lifecycle: {labPartnerPrep.lab_provider?.lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="warning">
                  Business/KYB: {labPartnerPrep.admin_summary?.business_kyb ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Accreditation:{' '}
                  {labPartnerPrep.admin_summary?.healthcare_accreditation ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Org/tenant: {labPartnerPrep.admin_summary?.organization_tenant ?? 'READY'}
                </Badge>
                <Badge kind="warning">
                  Catalogue: {labPartnerPrep.admin_summary?.lab_catalogue ?? 'SANDBOX_ONLY'}
                </Badge>
                <Badge kind="warning">
                  Report workflow:{' '}
                  {labPartnerPrep.admin_summary?.report_workflow ?? 'SANDBOX_ONLY'}
                </Badge>
                <Badge kind="warning">
                  Storage/security:{' '}
                  {labPartnerPrep.admin_summary?.storage_security ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  PSP: {labPartnerPrep.admin_summary?.payment_psp ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production lab activation:{' '}
                  {labPartnerPrep.admin_summary?.production_lab_partner_activation ?? 'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  Sandbox: {labPartnerPrep.lab_provider?.sandbox ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Parallel onboarding:{' '}
                  {String(labPartnerPrep.parallel_lab_onboarding_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake lab: {String(labPartnerPrep.fake_lab_provider_invented ?? false)}
                </Badge>
                <Badge kind="pending">
                  Fake accreditation: {String(labPartnerPrep.fake_accreditation_claimed ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real production enabled:{' '}
                  {String(labPartnerPrep.real_lab_production_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Doc≠Partner:{' '}
                  {String(!(labPartnerPrep.document_verified_equals_partner_verified ?? true))}
                </Badge>
                <Badge kind="pending">
                  Partner≠Production:{' '}
                  {String(!(labPartnerPrep.partner_verified_equals_production_enabled ?? true))}
                </Badge>
                <Badge kind="warning">Blocker: {labPartnerPrep.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {labPartnerPrep.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {labPartnerPrep.why_launch_blocked}</Text>
              <Heading level={3}>Activation gates</Heading>
              {(labPartnerPrep.activation_gates ?? []).map((g) => (
                <Text key={g.id} tone="secondary">
                  {g.label}: {g.status} · {g.reason} · evidence: {g.evidence_required}
                </Text>
              ))}
              <Heading level={3}>Fail-closed cases</Heading>
              {(labPartnerPrep.fail_closed_cases ?? []).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: blocked={String(c.production_activation_blocked)} ·{' '}
                  {c.primary_blocker}
                </Text>
              ))}
              <Text tone="secondary">
                Separation: {labPartnerPrep.verification_separation?.statement}
              </Text>
              <Text tone="secondary">
                Statement:{' '}
                {labPartnerPrep.security_statement ??
                  'Lab partner activation contracts prepared. Production activation remains BLOCKED.'}
              </Text>
              <Text tone="secondary">Next action: {labPartnerPrep.next_action}</Text>
            </Card>
          ) : null}

          {labWorkflowPrep ? (
            <Card>
              <Heading level={2}>
                Lab / diagnostic partner production workflow closure (Sprint 136)
              </Heading>
              <Text>{labWorkflowPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {labWorkflowPrep.sprint ?? 136}</Badge>
                <Badge kind="info">
                  Lifecycle: {labWorkflowPrep.lab_workflow?.lifecycle ?? '—'}
                </Badge>
                <Badge kind="info">
                  Catalog: {labWorkflowPrep.admin_summary?.catalog ?? 'READY'}
                </Badge>
                <Badge kind="info">
                  Bookings: {labWorkflowPrep.admin_summary?.bookings ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="info">
                  Samples: {labWorkflowPrep.admin_summary?.samples ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="info">
                  Reports: {labWorkflowPrep.admin_summary?.reports ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="warning">
                  Verification:{' '}
                  {labWorkflowPrep.admin_summary?.verification ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production workflow:{' '}
                  {labWorkflowPrep.admin_summary?.production_lab_diagnostic_workflow ??
                    'BLOCKED'}
                </Badge>
                <Badge kind="pending">
                  Doc≠Partner:{' '}
                  {String(
                    !(labWorkflowPrep.document_verified_equals_partner_verified ?? true),
                  )}
                </Badge>
                <Badge kind="pending">
                  Approved≠Enabled:{' '}
                  {String(!(labWorkflowPrep.approved_equals_production_enabled ?? true))}
                </Badge>
                <Badge kind="warning">Blocker: {labWorkflowPrep.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {labWorkflowPrep.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {labWorkflowPrep.why_launch_blocked}</Text>
              <Heading level={3}>Fail-closed cases</Heading>
              {(labWorkflowPrep.fail_closed_cases ?? []).map((c) => (
                <Text key={c.case_id} tone="secondary">
                  {c.case_id}: blocked={String(c.production_booking_blocked)} ·{' '}
                  {c.primary_blocker}
                </Text>
              ))}
              <Text tone="secondary">
                Separation: {labWorkflowPrep.verification_separation?.statement}
              </Text>
              <Text tone="secondary">Next action: {labWorkflowPrep.next_action}</Text>
            </Card>
          ) : null}

          {doctorErxWorkflow ? (
            <Card>
              <Heading level={2}>
                Doctor consultation + eRx production workflow closure (Sprint 137)
              </Heading>
              <Text>{doctorErxWorkflow.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {doctorErxWorkflow.sprint ?? 137}</Badge>
                <Badge kind="info">
                  Lifecycle: {doctorErxWorkflow.doctor_workflow?.lifecycle ?? '—'}
                </Badge>
                <Badge kind="info">
                  Consultation:{' '}
                  {doctorErxWorkflow.admin_summary?.consultation ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="info">
                  Prescription:{' '}
                  {doctorErxWorkflow.admin_summary?.prescription ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="warning">
                  eRx transmission:{' '}
                  {doctorErxWorkflow.admin_summary?.erx_transmission ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Telemedicine:{' '}
                  {doctorErxWorkflow.admin_summary?.telemedicine ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production workflow:{' '}
                  {doctorErxWorkflow.admin_summary
                    ?.production_doctor_consultation_erx_workflow ?? 'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  S137 eRx path:{' '}
                  {doctorErxWorkflow.erx_path?.software_activation_path ?? '—'}
                </Badge>
                <Badge kind="pending">
                  ISSUED≠TRANSMITTED:{' '}
                  {String(!(doctorErxWorkflow.issued_equals_legally_transmitted ?? true))}
                </Badge>
                <Badge kind="warning">Blocker: {doctorErxWorkflow.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {doctorErxWorkflow.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {doctorErxWorkflow.why_launch_blocked}</Text>
              <Text tone="secondary">
                Separation: {doctorErxWorkflow.verification_separation?.statement}
              </Text>
              <Text tone="secondary">Next action: {doctorErxWorkflow.next_action}</Text>
            </Card>
          ) : null}

          {telemedicineWorkflow ? (
            <Card>
              <Heading level={2}>
                Telemedicine / live consultation production workflow closure (Sprint 138)
              </Heading>
              <Text>{telemedicineWorkflow.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {telemedicineWorkflow.sprint ?? 138}</Badge>
                <Badge kind="info">
                  Lifecycle: {telemedicineWorkflow.telemedicine_workflow?.lifecycle ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Video provider:{' '}
                  {telemedicineWorkflow.admin_summary?.video_provider ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="pending">
                  Environment: {telemedicineWorkflow.admin_summary?.environment ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Session creation:{' '}
                  {telemedicineWorkflow.admin_summary?.session_creation ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Callback/webhook:{' '}
                  {telemedicineWorkflow.admin_summary?.callback_webhook ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="pending">
                  Markets:{' '}
                  {telemedicineWorkflow.admin_summary?.supported_markets ?? 'POLICY_DRIVEN'}
                </Badge>
                <Badge kind="warning">
                  Production workflow:{' '}
                  {telemedicineWorkflow.admin_summary?.production_telemedicine_workflow ??
                    'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  S138 video path:{' '}
                  {telemedicineWorkflow.video_path?.software_activation_path ?? '—'}
                </Badge>
                <Badge kind="pending">
                  VIDEO≠CLINICAL:{' '}
                  {String(
                    !(telemedicineWorkflow.video_ended_equals_consultation_completed ?? true),
                  )}
                </Badge>
                <Badge kind="warning">Blocker: {telemedicineWorkflow.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {telemedicineWorkflow.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {telemedicineWorkflow.why_launch_blocked}</Text>
              <Text tone="secondary">
                Separation: {telemedicineWorkflow.clinical_separation?.statement}
              </Text>
              <Text tone="secondary">Next action: {telemedicineWorkflow.next_action}</Text>
            </Card>
          ) : null}

          {imagingWorkflow ? (
            <Card>
              <Heading level={2}>
                Imaging / PACS / DICOM production workflow closure (Sprint 139)
              </Heading>
              <Text>{imagingWorkflow.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {imagingWorkflow.sprint ?? 139}</Badge>
                <Badge kind="info">
                  Lifecycle: {imagingWorkflow.imaging_workflow?.lifecycle ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Imaging partner:{' '}
                  {imagingWorkflow.admin_summary?.imaging_partner ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  PACS provider:{' '}
                  {imagingWorkflow.admin_summary?.pacs_provider ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  DICOM ingest:{' '}
                  {imagingWorkflow.pacs_path?.production_dicom_ingest ?? 'BLOCKED'}
                </Badge>
                <Badge kind="warning">
                  Viewer: {imagingWorkflow.admin_summary?.viewer ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Storage:{' '}
                  {imagingWorkflow.admin_summary?.storage_security ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="pending">
                  Markets:{' '}
                  {imagingWorkflow.admin_summary?.supported_modalities_markets ??
                    'POLICY_DRIVEN'}
                </Badge>
                <Badge kind="warning">
                  Production workflow:{' '}
                  {imagingWorkflow.admin_summary?.production_imaging_pacs_dicom_workflow ??
                    'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  S139 PACS path:{' '}
                  {imagingWorkflow.pacs_path?.software_activation_path ?? '—'}
                </Badge>
                <Badge kind="pending">
                  REPORT≠VIEWER:{' '}
                  {String(!(imagingWorkflow.report_equals_diagnostic_viewer ?? true))}
                </Badge>
                <Badge kind="warning">Blocker: {imagingWorkflow.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {imagingWorkflow.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {imagingWorkflow.why_launch_blocked}</Text>
              <Text tone="secondary">
                Separation: {imagingWorkflow.verification_separation?.statement}
              </Text>
              <Text tone="secondary">Next action: {imagingWorkflow.next_action}</Text>
            </Card>
          ) : null}

          {storageWorkflow ? (
            <Card>
              <Heading level={2}>
                Private storage + KMS + malware production workflow closure (Sprint 140)
              </Heading>
              <Text>{storageWorkflow.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {storageWorkflow.sprint ?? 140}</Badge>
                <Badge kind="info">
                  Lifecycle: {storageWorkflow.storage_workflow?.lifecycle ?? '—'}
                </Badge>
                <Badge kind="warning">
                  Storage:{' '}
                  {storageWorkflow.admin_summary?.private_storage ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  KMS: {storageWorkflow.admin_summary?.encryption_kms ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Malware:{' '}
                  {storageWorkflow.admin_summary?.malware_scanner ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="info">
                  Access policy:{' '}
                  {storageWorkflow.admin_summary?.access_policy ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="warning">
                  Production pipeline:{' '}
                  {storageWorkflow.admin_summary
                    ?.production_private_storage_kms_malware_pipeline ?? 'BLOCKED'}
                </Badge>
                <Badge kind="info">
                  S140 path:{' '}
                  {storageWorkflow.triad_path?.software_activation_path ?? '—'}
                </Badge>
                <Badge kind="pending">
                  UNSCANNED≠TRUSTED:{' '}
                  {String(!(storageWorkflow.unscanned_equals_trusted ?? true))}
                </Badge>
                <Badge kind="warning">Blocker: {storageWorkflow.remaining_blocker}</Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {storageWorkflow.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">Why blocked: {storageWorkflow.why_launch_blocked}</Text>
              <Text tone="secondary">
                Separation: {storageWorkflow.clinical_separations?.statement}
              </Text>
              <Text tone="secondary">Next action: {storageWorkflow.next_action}</Text>
            </Card>
          ) : null}

          {providerOnboarding ? (
            <Card>
              <Heading level={2}>
                Production provider onboarding control plane (Sprint 100)
              </Heading>
              <Text>{providerOnboarding.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Control plane: {providerOnboarding.control_plane ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="pending">
                  Rails: {String(providerOnboarding.counts?.total ?? providerOnboarding.launch_control_rails ?? 0)}
                </Badge>
                <Badge kind="pending">
                  Blocked: {String(providerOnboarding.counts?.blocked ?? 0)}
                </Badge>
                <Badge kind="pending">
                  Ready for activation: {String(providerOnboarding.counts?.ready_for_activation ?? 0)}
                </Badge>
                <Badge kind="pending">
                  Enabled: {String(providerOnboarding.counts?.enabled ?? 0)}
                </Badge>
                <Badge kind="warning">Production: {providerOnboarding.production}</Badge>
                <Badge kind="warning">
                  Providers enabled: {String(providerOnboarding.production_providers_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Infrastructure enabled:{' '}
                  {String(providerOnboarding.production_infrastructure_enabled ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {providerOnboarding.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(providerOnboarding.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Launch: {providerOnboarding.launch_control_overall ?? 'NOT_READY'}
                </Badge>
              </div>
              <Text tone="secondary">
                SOFTWARE READY ≠ PRODUCTION LAUNCH AUTHORIZED. CONFIGURATION ≠ APPROVAL ≠ ACTIVATION.
                Sandbox verification never implies production verification. Markets:{' '}
                {(
                  providerOnboarding.country_policy?.markets_supported_for_evaluation ?? [
                    'GLOBAL',
                    'IN',
                    'AE',
                    'US',
                  ]
                ).join(', ')}
                .
              </Text>
              <Text tone="secondary">
                Correlation: {providerOnboarding.correlation_id ?? '—'} · Two-person approval:{' '}
                {providerOnboarding.two_person_approval?.required_for_activation
                  ? 'REQUIRED'
                  : 'optional'}{' '}
                (software SoD workflow:{' '}
                {String(providerOnboarding.two_person_approval?.supported_in_software ?? false)}).
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                {(providerOnboarding.filters_supported ?? ['ALL', 'BLOCKED', 'READY_FOR_ACTIVATION', 'ENABLED']).map(
                  (f) => (
                    <Button
                      key={f}
                      variant={onboardingFilter === f ? 'primary' : 'tertiary'}
                      size="sm"
                      onClick={() => setOnboardingFilter(f)}
                    >
                      {f}
                    </Button>
                  ),
                )}
              </div>
              <Text tone="secondary">
                Filter: {onboardingFilter}. Showing presence only — never secret values.
              </Text>
              {(providerOnboarding.rows ?? [])
                .filter((row) => {
                  if (onboardingFilter === 'ALL') return true;
                  if (onboardingFilter === 'BLOCKED') {
                    return (
                      !row.enabled &&
                      /EXTERNAL_GATED|NOT_SELECTED|CONFIGURATION_REQUIRED|CREDENTIALS_REQUIRED/.test(
                        row.lifecycle,
                      )
                    );
                  }
                  if (onboardingFilter === 'READY_FOR_ACTIVATION') {
                    return row.lifecycle === 'READY_FOR_ACTIVATION';
                  }
                  if (onboardingFilter === 'ENABLED') return row.enabled;
                  if (['GLOBAL', 'IN', 'AE', 'US'].includes(onboardingFilter)) {
                    return (row.markets ?? []).some((m) => m.market === onboardingFilter);
                  }
                  return row.category === onboardingFilter;
                })
                .slice(0, 12)
                .map((row) => (
                  <Text key={row.rail_id} tone="secondary">
                    {row.category} · {row.label}: {row.lifecycle} · cfg {row.configuration_readiness} ·
                    creds {row.credentials_readiness} · {row.blocker}
                    {(row.dependency_blockers ?? []).length
                      ? ` · deps ${row.dependency_blockers.slice(0, 2).join(', ')}`
                      : ''}
                  </Text>
                ))}
              <Text tone="secondary">
                Activation sequence (recommended):{' '}
                {(providerOnboarding.activation_sequence ?? [])
                  .slice(0, 8)
                  .map((s) => `${s.order}.${s.rail}`)
                  .join(' → ')}
                {(providerOnboarding.activation_sequence ?? []).length > 8 ? ' → …' : ''}
              </Text>
              <Text tone="secondary">
                Dependencies sample:{' '}
                {(providerOnboarding.dependency_graph ?? [])
                  .slice(0, 6)
                  .map((d) => `${d.from}→${d.to}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {providerOnboarding.evaluated_at
                  ? new Date(providerOnboarding.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {providerOnboarding.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {providerOnboarding.next_action}</Text>
              {!providerOnboarding.production_providers_enabled ? (
                <Text tone="secondary">
                  CONTROL PLANE SOFTWARE_READY / rails EXTERNAL_GATED. PRODUCTION PROVIDERS ENABLED =
                  NO. PRODUCTION INFRASTRUCTURE ENABLED = NO.
                </Text>
              ) : null}
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
                <Link href="/reliability">
                  <Button variant="tertiary" size="sm">
                    Reliability
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {psp ? (
            <Card>
              <Heading level={2}>
                Production payment / PSP activation readiness (Sprint 88)
              </Heading>
              <Text>{psp.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Provider: {psp.configuration_readiness?.provider ?? psp.provider}
                </Badge>
                <Badge kind="pending">
                  Environment:{' '}
                  {psp.configuration_readiness?.environment ??
                    String(psp.environment).toUpperCase()}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {psp.activation_lifecycle ?? psp.activation_stage}
                </Badge>
                <Badge
                  kind={
                    psp.configuration_readiness?.configuration === 'READY' ? 'info' : 'pending'
                  }
                >
                  Configuration: {psp.configuration_readiness?.configuration ?? 'MISSING'}
                </Badge>
                <Badge
                  kind={psp.configuration_readiness?.webhook === 'READY' ? 'info' : 'pending'}
                >
                  Webhook: {psp.configuration_readiness?.webhook ?? 'MISSING'}
                </Badge>
                <Badge
                  kind={psp.configuration_readiness?.markets === 'READY' ? 'info' : 'pending'}
                >
                  Markets: {psp.configuration_readiness?.markets ?? 'MISSING'}
                </Badge>
                <Badge
                  kind={psp.configuration_readiness?.currencies === 'READY' ? 'info' : 'pending'}
                >
                  Currencies: {psp.configuration_readiness?.currencies ?? 'MISSING'}
                </Badge>
                <Badge
                  kind={
                    psp.configuration_readiness?.reconciliation === 'READY' ? 'info' : 'pending'
                  }
                >
                  Reconciliation: {psp.configuration_readiness?.reconciliation ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Production activation:{' '}
                  {psp.configuration_readiness?.production_activation ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind={psp.configured ? 'info' : 'pending'}>
                  Configured: {String(psp.configured)}
                </Badge>
                <Badge kind={psp.verified ? 'info' : 'pending'}>
                  Verified: {String(psp.verified)}
                </Badge>
                <Badge kind={psp.approved ? 'info' : 'pending'}>
                  Approved: {String(psp.approved)}
                </Badge>
                <Badge kind={psp.enabled ? 'warning' : 'pending'}>
                  Enabled: {String(psp.enabled)}
                </Badge>
                <Badge kind="pending">
                  Sandbox: {String(psp.sandbox_status ?? psp.sandbox)}
                </Badge>
                <Badge kind="warning">Production: {psp.production}</Badge>
                <Badge kind="pending">
                  Sandbox payment: {psp.sandbox_payment ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="warning">
                  Production payment: {psp.production_payment ?? psp.production}
                </Badge>
                <Badge kind="pending">Refund: {psp.refund}</Badge>
                <Badge kind="warning">Settlement: {psp.settlement_payout}</Badge>
                <Badge kind="warning">Blocker: {psp.remaining_blocker}</Badge>
              </div>
              <Text tone="secondary">Blocker: {psp.remaining_blocker}</Text>
              <Text tone="secondary">
                Also:{' '}
                {(psp.remaining_blockers ?? [])
                  .filter((b) => b !== psp.remaining_blocker)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">Next: {psp.next_action}</Text>
              <Text tone="secondary">
                State machine: failed payment cannot create a paid order without a verified result.
                Idempotency: {psp.idempotency ?? 'SOFTWARE_READY'}. Webhook unsigned/invalid
                signatures rejected; production webhooks EXTERNAL_GATED. Customer payment ≠ vendor
                payout. Foundation: Sprint 85 / 65. Force launch available:{' '}
                {String(psp.force_launch_available ?? false)}.
              </Text>
              <Text tone="secondary">
                Enablement guard can_enable={String(psp.enablement_guard.can_enable)} (
                {psp.enablement_guard.checks
                  .filter((c) => !c.ok)
                  .map((c) => c.id)
                  .join(', ') || 'all checks ok'}
                )
              </Text>
              {!psp.real_psp_available ? (
                <Text tone="secondary">
                  PSP NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_PSP. Sandbox MOCK_* checkout is
                  SANDBOX_VERIFIED only. No live merchant credentials, fake transaction IDs, or
                  production settlement. Production activation is not green-ready.
                </Text>
              ) : null}
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/payments">
                  <Button variant="tertiary" size="sm">
                    Payments
                  </Button>
                </Link>
                <Link href="/finance">
                  <Button variant="tertiary" size="sm">
                    Finance
                  </Button>
                </Link>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {realPsp ? (
            <Card>
              <Heading level={2}>
                Real PSP / payment production activation preparation (Sprint 102)
              </Heading>
              <Text>{realPsp.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Provider: {realPsp.provider}</Badge>
                <Badge kind="pending">
                  Real PSP selected: {String(realPsp.real_psp_selected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {realPsp.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">Sandbox: {realPsp.sandbox}</Badge>
                <Badge kind="warning">Production: {realPsp.production}</Badge>
                <Badge kind="pending">
                  Sandbox payment: {realPsp.sandbox_payment ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="warning">
                  Production payment: {realPsp.production_payment ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Ready for activation: {String(realPsp.ready_for_activation ?? false)}
                </Badge>
                <Badge kind="warning">
                  Production PSP enabled: {String(realPsp.production_psp_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real money processed: {String(realPsp.real_money_processed ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {realPsp.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(realPsp.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Planes: {realPsp.control_plane}/{realPsp.foundation_plane}/{realPsp.s88_plane}
                </Badge>
              </div>
              <Text tone="secondary">
                SANDBOX_VERIFIED ≠ PRODUCTION. READY_FOR_ACTIVATION ≠ ENABLED. Client success ≠ PAID.
                Customer payment ≠ vendor payout. No real money in this sprint.
              </Text>
              <Text tone="secondary">
                Markets:{' '}
                {(realPsp.markets ?? [])
                  .map((m) => `${m.market}=${m.production}`)
                  .join(' · ') || 'GLOBAL · IN · AE · US'}
              </Text>
              <Text tone="secondary">
                Activation checklist:{' '}
                {(realPsp.checklist ?? [])
                  .slice(0, 8)
                  .map((c) => `${c.id}=${c.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Reconciliation mismatches catalogued:{' '}
                {(realPsp.mismatch_catalog ?? []).map((m) => m.code).join(', ') || '—'}
              </Text>
              <Text tone="secondary">
                Config readiness — cfg:{' '}
                {realPsp.configuration_readiness?.configuration ?? 'MISSING'} · webhook:{' '}
                {realPsp.configuration_readiness?.webhook ?? 'MISSING'} · markets:{' '}
                {realPsp.configuration_readiness?.markets ?? 'MISSING'} · currencies:{' '}
                {realPsp.configuration_readiness?.currencies ?? 'MISSING'} · reconciliation:{' '}
                {realPsp.configuration_readiness?.reconciliation ?? 'MISSING'}
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {realPsp.evaluated_at ? new Date(realPsp.evaluated_at).toISOString() : '—'}.
                CAN_PRODUCTION_LAUNCH: {realPsp.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {realPsp.next_action}</Text>
              <Text tone="secondary">
                PRODUCTION PSP ENABLED = NO. REAL MONEY PROCESSED = NO. REAL PSP SELECTED = NO.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
                <Link href="/payments">
                  <Button variant="tertiary" size="sm">
                    Payments
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {realMessaging ? (
            <Card>
              <Heading level={2}>
                Real OTP + transactional communications activation readiness (Sprint 103)
              </Heading>
              <Text>{realMessaging.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Lifecycle: {realMessaging.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">Sandbox: {realMessaging.sandbox}</Badge>
                <Badge kind="warning">Production: {realMessaging.production}</Badge>
                <Badge kind="pending">
                  Real OTP selected: {String(realMessaging.real_otp_provider_selected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real SMS selected: {String(realMessaging.real_sms_provider_selected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real Email selected: {String(realMessaging.real_email_provider_selected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real Push selected: {String(realMessaging.real_push_provider_selected ?? false)}
                </Badge>
                <Badge kind="warning">
                  Production OTP enabled: {String(realMessaging.production_otp_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Production SMS enabled: {String(realMessaging.production_sms_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Production Email enabled: {String(realMessaging.production_email_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Production Push enabled: {String(realMessaging.production_push_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real messages sent: {String(realMessaging.real_messages_sent ?? false)}
                </Badge>
                <Badge kind="warning">
                  Ready for activation: {String(realMessaging.ready_for_activation ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {realMessaging.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(realMessaging.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Planes: {realMessaging.control_plane}/{realMessaging.foundation_plane}/
                  {realMessaging.s89_plane}
                </Badge>
                <Badge kind="pending">Native: {realMessaging.native_device ?? 'DEVICE_NOT_AVAILABLE'}</Badge>
              </div>
              <Text tone="secondary">
                Communications rails (OTP · SMS · Email · Push). SANDBOX_VERIFIED ≠ PRODUCTION. SENT ≠
                DELIVERED. No invented providers, credentials, sender IDs, or domains.
              </Text>
              {(realMessaging.rails ?? []).map((rail) => (
                <Text key={rail.rail} tone="secondary">
                  {rail.rail}: lifecycle={rail.lifecycle} · production={rail.production} · cfg=
                  {rail.configuration_readiness} · creds={rail.credentials_readiness} · sender/domain=
                  {rail.sender_domain_readiness} · delivery={rail.delivery_capability} · compliance=
                  {rail.compliance_status} · blocker={rail.blocker}
                </Text>
              ))}
              <Text tone="secondary">
                Activation checklist:{' '}
                {(realMessaging.checklist ?? [])
                  .slice(0, 10)
                  .map((c) => `${c.id}=${c.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                OTP security: expiry={String(realMessaging.otp_security?.expiry_enforced ?? true)};
                attempts={String(realMessaging.otp_security?.attempt_limits ?? true)}; never logged=
                {String(realMessaging.otp_security?.never_logged_in_production ?? true)}; reveal production=
                {realMessaging.otp_security?.auth_dev_reveal_otp_production ?? 'MUST_BE_FALSE'}
              </Text>
              <Text tone="secondary">
                State machine: SENT={realMessaging.notification_state_machine?.accepted_by_provider_state ?? 'SENT'}{' '}
                ≠ DELIVERED=
                {realMessaging.notification_state_machine?.delivered_to_user_state ?? 'DELIVERED'}; receipt
                required=
                {String(
                  realMessaging.notification_state_machine?.delivered_requires_provider_receipt ?? true,
                )}
                . Idempotency={realMessaging.outbox_idempotency?.occurrence_keys ?? 'DETERMINISTIC'}; retry
                safe={String(realMessaging.outbox_idempotency?.retry_safe ?? true)}. PHI minimize=
                {String(realMessaging.phi_minimization?.templates_avoid_unnecessary_phi ?? true)}.
              </Text>
              <Text tone="secondary">
                Markets:{' '}
                {(
                  realMessaging.country_policy?.markets_supported_for_evaluation ?? [
                    'GLOBAL',
                    'IN',
                    'AE',
                    'US',
                  ]
                ).join(' · ')}{' '}
                (policy-driven; hardcoded_market=
                {String(realMessaging.country_policy?.hardcoded_market ?? false)}).
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {realMessaging.evaluated_at
                  ? new Date(realMessaging.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {realMessaging.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {realMessaging.next_action}</Text>
              <Text tone="secondary">
                PRODUCTION OTP ENABLED = NO. PRODUCTION SMS ENABLED = NO. PRODUCTION EMAIL ENABLED = NO.
                PRODUCTION PUSH ENABLED = NO. REAL MESSAGES SENT = NO.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
                <Link href="/notifications">
                  <Button variant="tertiary" size="sm">
                    Notifications
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {messaging ? (
            <Card>
              <Heading level={2}>
                OTP / transactional communications activation readiness (Sprint 89)
              </Heading>
              <Text>{messaging.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Env: {messaging.environment}</Badge>
                <Badge kind="pending">Live flag: {String(messaging.live_flag)}</Badge>
                <Badge kind="warning">
                  Real provider: {String(messaging.real_provider_available)}
                </Badge>
                <Badge kind="pending">
                  Sandbox auth: {messaging.sandbox_authentication ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="warning">
                  Production auth: {messaging.production_authentication ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Blocker: {messaging.remaining_blocker ?? 'NO_PRODUCTION_OTP_MESSAGING_PROVIDER'}
                </Badge>
                <Badge kind="pending">Native: {messaging.native_device}</Badge>
                <Badge kind="pending">
                  Guard can_enable: {String(messaging.enablement_guard.can_enable)}
                </Badge>
                <Badge kind="pending">
                  Force launch: {String(messaging.force_launch_available ?? false)}
                </Badge>
              </div>
              <Text tone="secondary">
                Also:{' '}
                {(messaging.remaining_blockers ?? [])
                  .filter((b) => b !== messaging.remaining_blocker)
                  .join(' · ') || '—'}
              </Text>
              <ul className="wp-stack">
                {messaging.channels.map((ch) => {
                  const ready =
                    ch.channel === 'OTP'
                      ? messaging.configuration_validation?.otp_readiness
                      : ch.channel === 'SMS'
                        ? messaging.configuration_validation?.sms_readiness
                        : ch.channel === 'EMAIL'
                          ? messaging.configuration_validation?.email_readiness
                          : messaging.configuration_validation?.push_readiness;
                  return (
                    <li key={ch.channel}>
                      <Badge kind={stageKind(ch.status)}>{ch.status}</Badge>{' '}
                      <strong>{ch.channel}</strong> · Provider: {ch.provider} · Production:{' '}
                      {ch.production}
                      <div>
                        <Text tone="secondary">
                          Configured {String(ch.configured)} · Verified {String(ch.verified)} ·
                          Approved {String(ch.approved)} · Enabled {String(ch.enabled)} · Sandbox{' '}
                          {ch.sandbox}
                          {ch.activation_stage ? ` · Stage ${ch.activation_stage}` : ''}
                        </Text>
                      </div>
                      {ready ? (
                        <Text tone="secondary">
                          Config {ready.configuration} · Credential {ready.credential}
                          {ready.sender_or_origin !== 'NOT_APPLICABLE'
                            ? ` · Sender/origin ${ready.sender_or_origin}`
                            : ''}
                          {ready.domain !== 'NOT_APPLICABLE' ? ` · Domain ${ready.domain}` : ''}
                          {` · Countries ${ready.countries}`}
                          {ready.device === 'DEVICE_NOT_AVAILABLE'
                            ? ` · Device ${ready.device}`
                            : ''}
                          {` · Production ${ready.production}`}
                        </Text>
                      ) : null}
                      <Text tone="secondary">Next/blocker: {ch.remaining_blocker}</Text>
                    </li>
                  );
                })}
              </ul>
              {messaging.otp_security ? (
                <Text tone="secondary">
                  OTP security: expiry/attempts/throttle/purpose-binding/replay/replacement —
                  AUTH_DEV_REVEAL_OTP production ={' '}
                  {messaging.otp_security.auth_dev_reveal_otp_production}; current safe ={' '}
                  {String(messaging.otp_security.auth_dev_reveal_otp_current_safe)}
                </Text>
              ) : null}
              {messaging.notification_state_machine ? (
                <Text tone="secondary">
                  Notification states: QUEUED→PROCESSING→SENT→DELIVERED (SENT ≠ DELIVERED; DELIVERED
                  needs provider receipt). Failures: FAILED/RETRYING/CANCELLED/EXTERNAL_GATED.
                  Consent: security/transactional ≠ marketing opt-in. Markets:{' '}
                  {(messaging.country_policy?.markets_supported_for_evaluation ?? ['GLOBAL', 'IN', 'AE', 'US']).join(
                    '/',
                  )}
                  .
                </Text>
              ) : null}
              <Text tone="secondary">Next: {messaging.next_action}</Text>
              <Text tone="secondary">
                Activation is ops/manual via secret manager — ordinary Admin cannot enable production
                OTP. Foundation: Sprint 86 / 76 / 66. No fake production DELIVERED. Production is not
                green-ready without external providers.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/reliability">
                  <Button variant="tertiary" size="sm">
                    Reliability
                  </Button>
                </Link>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {realCarrier ? (
            <Card>
              <Heading level={2}>
                Real carrier / logistics production activation readiness (Sprint 105)
              </Heading>
              <Text>{realCarrier.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Provider: {realCarrier.provider}</Badge>
                <Badge kind="pending">
                  Real carrier selected: {String(realCarrier.real_carrier_selected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {realCarrier.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">Sandbox: {realCarrier.sandbox}</Badge>
                <Badge kind="warning">Production: {realCarrier.production}</Badge>
                <Badge kind="pending">
                  Sandbox shipment: {realCarrier.sandbox_shipment ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="warning">
                  Production shipment: {realCarrier.production_shipment ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Ready for activation: {String(realCarrier.ready_for_activation ?? false)}
                </Badge>
                <Badge kind="warning">
                  Production carrier enabled:{' '}
                  {String(realCarrier.production_carrier_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Real shipment created: {String(realCarrier.real_shipment_created ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {realCarrier.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(realCarrier.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Planes: {realCarrier.control_plane}/{realCarrier.foundation_plane}/
                  {realCarrier.s90_plane}
                </Badge>
                <Badge kind="pending">
                  Native rider: {realCarrier.native_rider ?? 'DEVICE_NOT_AVAILABLE'}
                </Badge>
              </div>
              <Text tone="secondary">
                SANDBOX_VERIFIED ≠ PRODUCTION. MockCarrierAdapter must never silently substitute for
                production. Cross-border medicine LEGAL_GATED. No invented tracking/GPS/POD.
              </Text>
              <Text tone="secondary">
                Markets:{' '}
                {(realCarrier.markets ?? [])
                  .map((m) => `${m.market}=${m.production}`)
                  .join(' · ') || 'GLOBAL · IN · AE · US'}
              </Text>
              <Text tone="secondary">
                Checklist:{' '}
                {(realCarrier.checklist ?? [])
                  .slice(0, 10)
                  .map((c) => `${c.id}=${c.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Config — cfg:{realCarrier.configuration_readiness?.configuration ?? 'MISSING'} ·
                webhook:{realCarrier.configuration_readiness?.webhook ?? 'MISSING'} · serviceability:
                {realCarrier.configuration_readiness?.serviceability ?? 'POLICY_DRIVEN'} · tracking:
                {realCarrier.configuration_readiness?.tracking ?? 'SANDBOX_VERIFIED'} · returns:
                {realCarrier.configuration_readiness?.returns_rto ?? 'POLICY_REQUIRED'} · POD:
                {realCarrier.configuration_readiness?.pod_capability ?? 'DEVICE_NOT_AVAILABLE'}
              </Text>
              <Text tone="secondary">
                Webhook unsigned rejected=
                {String(realCarrier.webhook_security?.unsigned_fail_closed ?? true)}. Idempotent
                booking=
                {String(realCarrier.outbox_idempotency?.duplicate_shipment_prevented ?? true)}.
                Medicine import={realCarrier.cross_border?.medicine_import ?? 'LEGAL_GATED'}.
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {realCarrier.evaluated_at
                  ? new Date(realCarrier.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {realCarrier.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {realCarrier.next_action}</Text>
              <Text tone="secondary">
                PRODUCTION CARRIER ENABLED = NO. REAL SHIPMENT CREATED = NO. REAL CARRIER SELECTED =
                NO.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {carrier ? (
            <Card>
              <Heading level={2}>Carrier / logistics activation readiness (Sprint 90)</Heading>
              <Text>{carrier.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Provider:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.provider ??
                    carrier.provider}
                </Badge>
                <Badge kind="pending">
                  Environment:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.environment ??
                    String(carrier.environment).toUpperCase()}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {carrier.activation_lifecycle ?? carrier.activation_stage}
                </Badge>
                <Badge
                  kind={
                    carrier.configuration_validation?.configuration_readiness?.configuration ===
                    'READY'
                      ? 'info'
                      : 'pending'
                  }
                >
                  Configuration:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.configuration ??
                    'MISSING'}
                </Badge>
                <Badge
                  kind={
                    carrier.configuration_validation?.configuration_readiness?.webhook === 'READY'
                      ? 'info'
                      : 'pending'
                  }
                >
                  Webhook:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.webhook ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Markets:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.markets ??
                    'POLICY_DRIVEN'}
                </Badge>
                <Badge kind="pending">
                  Serviceability:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.serviceability ??
                    carrier.serviceability}
                </Badge>
                <Badge kind="pending">
                  Tracking:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.tracking ??
                    carrier.tracking}
                </Badge>
                <Badge kind="pending">
                  Shipment:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.shipment_capability ??
                    carrier.shipment_creation}
                </Badge>
                <Badge kind="pending">
                  POD:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.pod_capability ??
                    carrier.pod}
                </Badge>
                <Badge kind="pending">
                  Returns/RTO:{' '}
                  {carrier.configuration_validation?.configuration_readiness?.returns_rto ??
                    carrier.returns}
                </Badge>
                <Badge kind="warning">
                  Production activation:{' '}
                  {carrier.configuration_validation?.configuration_readiness
                    ?.production_activation ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">Status: {carrier.validation_status}</Badge>
                <Badge kind="pending">Sandbox: {carrier.sandbox}</Badge>
                <Badge kind="warning">Production: {carrier.production}</Badge>
                <Badge kind="pending">
                  Shipping cost: {carrier.shipping_cost ?? 'SANDBOX_ONLY'}
                </Badge>
                <Badge kind="warning">
                  Blocker: {carrier.remaining_blocker ?? 'NO_PRODUCTION_CARRIER_ADAPTER'}
                </Badge>
                <Badge kind="pending">
                  Force launch: {String(carrier.force_launch_available ?? false)}
                </Badge>
              </div>
              <Text tone="secondary">Blocked: {carrier.remaining_blocker}</Text>
              <Text tone="secondary">
                Also:{' '}
                {(carrier.remaining_blockers ?? [])
                  .filter((b) => b !== carrier.remaining_blocker)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">Next action: {carrier.next_action}</Text>
              {carrier.shipment_lifecycle ? (
                <Text tone="secondary">
                  Lifecycle: ORDER→…→READY_TO_SHIP→SHIPMENT_CREATED→IN_TRANSIT→DELIVERED. Tracking:
                  LABEL_CREATED→…→DELIVERED. Webhook unsigned fail-closed. Idempotent booking keys.
                  COD not invented. Returns POLICY_REQUIRED. Shipping quotes SANDBOX_ONLY (not live
                  carrier rates). Markets:{' '}
                  {(
                    carrier.country_policy?.markets_supported_for_evaluation ?? [
                      'GLOBAL',
                      'IN',
                      'AE',
                      'US',
                    ]
                  ).join('/')}
                  .
                </Text>
              ) : null}
              <Text tone="secondary">
                Enablement guard can_enable={String(carrier.enablement_guard.can_enable)} (
                {carrier.enablement_guard.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') ||
                  'all checks ok'}
                )
              </Text>
              {!carrier.real_carrier_available ? (
                <Text tone="secondary">
                  CARRIER NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_CARRIER_ADAPTER. Sandbox mock
                  only. No live carrier, fake GPS/driver/POD, or production shipment. Foundation:
                  Sprint 77 / 67.
                </Text>
              ) : null}
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {erx ? (
            <Card>
              <Heading level={2}>
                eRx / electronic prescribing activation readiness (Sprint 91)
              </Heading>
              <Text>{erx.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Provider:{' '}
                  {erx.configuration_validation?.configuration_readiness?.provider ?? erx.provider}
                </Badge>
                <Badge kind="pending">
                  Environment:{' '}
                  {erx.configuration_validation?.configuration_readiness?.environment ??
                    String(erx.environment).toUpperCase()}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {erx.activation_lifecycle ?? erx.activation_stage}
                </Badge>
                <Badge
                  kind={
                    erx.configuration_validation?.configuration_readiness?.configuration === 'READY'
                      ? 'info'
                      : 'pending'
                  }
                >
                  Configuration:{' '}
                  {erx.configuration_validation?.configuration_readiness?.configuration ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Credentials:{' '}
                  {erx.configuration_validation?.configuration_readiness?.credentials ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Prescriber readiness:{' '}
                  {erx.configuration_validation?.configuration_readiness?.prescriber_readiness ??
                    'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="pending">
                  Pharmacy/network:{' '}
                  {erx.configuration_validation?.configuration_readiness?.pharmacy_network ??
                    erx.pharmacy_network}
                </Badge>
                <Badge kind="pending">
                  Markets/legal:{' '}
                  {erx.configuration_validation?.configuration_readiness?.markets_legal ??
                    erx.country_support}
                </Badge>
                <Badge kind="pending">
                  Transmission:{' '}
                  {erx.configuration_validation?.configuration_readiness?.transmission ??
                    erx.transmission}
                </Badge>
                <Badge kind="warning">
                  Production activation:{' '}
                  {erx.configuration_validation?.configuration_readiness?.production_activation ??
                    'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">Status: {erx.validation_status}</Badge>
                <Badge kind="pending">Sandbox: {erx.sandbox}</Badge>
                <Badge kind="warning">Production: {erx.production}</Badge>
                <Badge kind="warning">Legal/clinical: {erx.legal_clinical_gate}</Badge>
                <Badge kind="warning">Controlled Rx: {erx.controlled_substances}</Badge>
                <Badge kind="warning">
                  Blocker: {erx.remaining_blocker ?? 'NO_PRODUCTION_ERX_PROVIDER'}
                </Badge>
                <Badge kind="pending">
                  Force launch: {String(erx.force_launch_available ?? false)}
                </Badge>
                {erxPath ? (
                  <>
                    <Badge kind="info">
                      S137 path: {erxPath.software_activation_path ?? '—'}
                    </Badge>
                    <Badge kind="warning">
                      S137 transmission: {erxPath.production_transmission ?? 'BLOCKED'}
                    </Badge>
                    <Badge kind="pending">
                      ISSUED≠TRANSMITTED:{' '}
                      {String(erxPath.issued_neq_legally_transmitted ?? true)}
                    </Badge>
                  </>
                ) : null}
              </div>
              <Text tone="secondary">{erx.internal_vs_legal}</Text>
              <Text tone="secondary">Blocked: {erx.remaining_blocker}</Text>
              <Text tone="secondary">
                Also:{' '}
                {(erx.remaining_blockers ?? [])
                  .filter((b) => b !== erx.remaining_blocker)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">Next action: {erx.next_action}</Text>
              {erx.prescription_lifecycle ? (
                <Text tone="secondary">
                  Internal Rx: DRAFT→ISSUED (≠ legal eRx / LEGALLY_TRANSMITTED). Submission statuses
                  sandbox-only. Document verified ≠ clinical approved ≠ eRx production enabled.
                  Permissions: customer/doctor/pharmacy scoped; Admin activation ≠ universal PHI.
                  Markets:{' '}
                  {(
                    erx.country_policy?.markets_supported_for_evaluation ?? [
                      'GLOBAL',
                      'IN',
                      'AE',
                      'US',
                    ]
                  ).join('/')}
                  . Controlled substances LEGAL_GATED.
                </Text>
              ) : null}
              <Text tone="secondary">
                Enablement guard can_enable={String(erx.enablement_guard.can_enable)} (
                {erx.enablement_guard.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') ||
                  'all checks ok'}
                )
              </Text>
              {!erx.real_erx_available ? (
                <Text tone="secondary">
                  eRx NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_ERX_PROVIDER. Sandbox adapter is
                  not legally transmitted eRx. No fake production ACK. Foundation: Sprint 78 / 68.
                </Text>
              ) : null}
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {video ? (
            <Card>
              <Heading level={2}>
                Telemedicine / live video activation readiness (Sprint 92)
              </Heading>
              <Text>{video.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Provider:{' '}
                  {video.configuration_validation?.configuration_readiness?.provider ??
                    video.provider}
                </Badge>
                <Badge kind="pending">
                  Env:{' '}
                  {video.configuration_validation?.configuration_readiness?.environment ??
                    String(video.environment).toUpperCase()}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {video.activation_lifecycle ?? video.activation_stage}
                </Badge>
                <Badge
                  kind={
                    video.configuration_validation?.configuration_readiness?.configuration ===
                    'READY'
                      ? 'info'
                      : 'pending'
                  }
                >
                  Configuration:{' '}
                  {video.configuration_validation?.configuration_readiness?.configuration ??
                    'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Credentials:{' '}
                  {video.configuration_validation?.configuration_readiness?.credentials ??
                    'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Session:{' '}
                  {video.configuration_validation?.configuration_readiness?.session_capability ??
                    video.session_creation}
                </Badge>
                <Badge kind="warning">
                  Recording:{' '}
                  {video.configuration_validation?.configuration_readiness?.recording ??
                    video.recording}
                </Badge>
                <Badge kind="warning">
                  Webhook: {video.webhook_security?.status ?? video.webhook}
                </Badge>
                <Badge kind="warning">
                  Markets:{' '}
                  {video.configuration_validation?.configuration_readiness?.markets_legal ??
                    video.country_support}
                </Badge>
                <Badge kind="warning">
                  Production activation:{' '}
                  {video.configuration_validation?.configuration_readiness
                    ?.production_activation ?? video.production}
                </Badge>
                <Badge kind="warning">Status: {video.validation_status}</Badge>
                <Badge kind="pending">Sandbox: {video.sandbox}</Badge>
                <Badge kind="warning">Production: {video.production}</Badge>
                <Badge kind="pending">Consent: {video.consent}</Badge>
                <Badge kind="warning">Legal/clinical: {video.legal_clinical_gate}</Badge>
                <Badge kind="warning">
                  Blocker: {video.remaining_blocker ?? 'NO_PRODUCTION_VIDEO_PROVIDER'}
                </Badge>
                <Badge kind="pending">
                  Force launch: {String(video.force_launch_available ?? false)}
                </Badge>
                {videoPath ? (
                  <>
                    <Badge kind="info">
                      S138 path: {videoPath.software_activation_path ?? '—'}
                    </Badge>
                    <Badge kind="warning">
                      S138 sessions: {videoPath.production_session_creation ?? 'BLOCKED'}
                    </Badge>
                    <Badge kind="pending">
                      Credential ref:{' '}
                      {videoPath.video?.configured ? 'CONFIGURED' : 'EXTERNAL_GATED'}
                    </Badge>
                    <Badge kind="pending">
                      Verification: {videoPath.video?.verified ? 'VERIFIED' : 'PENDING'}
                    </Badge>
                    <Badge kind="pending">
                      Approval: {videoPath.video?.approved ? 'APPROVED' : 'PENDING'}
                    </Badge>
                    <Badge kind="warning">
                      Enablement: {videoPath.video?.enabled ? 'ENABLED' : 'EXTERNAL_GATED'}
                    </Badge>
                    <Badge kind="pending">
                      Stage: {videoPath.video?.activation_stage ?? 'NOT_SELECTED'}
                    </Badge>
                    <Badge kind="pending">
                      VIDEO≠CLINICAL:{' '}
                      {String(videoPath.video_ended_neq_consultation_completed ?? true)}
                    </Badge>
                  </>
                ) : null}
              </div>
              <Text tone="secondary">{video.appointment_vs_video}</Text>
              <Text tone="secondary">
                LiveKit refs present: {String(video.livekit_refs_present)} (sandbox refs ≠ production
                enablement)
              </Text>
              <Text tone="secondary">Blocked: {video.remaining_blocker}</Text>
              {(video.remaining_blockers ?? [])
                .filter((b) => b !== video.remaining_blocker)
                .slice(0, 8)
                .map((b) => (
                  <Text key={b} tone="secondary">
                    Also: {b}
                  </Text>
                ))}
              <Text tone="secondary">Next action: {video.next_action}</Text>
              {video.session_lifecycle ? (
                <Text tone="secondary">
                  Session: CREATED→READY→JOINED→IN_PROGRESS→ENDED. SESSION CREATED ≠ consultation
                  completed. Consent sandbox-verified; production LEGAL_GATED. Tokens scoped
                  server-side. Recording PRODUCTION_RECORDING_EXTERNAL_GATED. Webhook
                  EXTERNAL_GATED without provider. Markets:{' '}
                  {(
                    video.country_policy?.markets_supported_for_evaluation ?? [
                      'GLOBAL',
                      'IN',
                      'AE',
                      'US',
                    ]
                  ).join(', ')}
                  .
                </Text>
              ) : null}
              <Text tone="secondary">
                Enablement guard can_enable={String(video.enablement_guard.can_enable)} (
                {video.enablement_guard.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') ||
                  'all checks ok'}
                )
              </Text>
              {!video.real_video_available ? (
                <Text tone="secondary">
                  VIDEO NOT_SELECTED / EXTERNAL_GATED — LIVE VIDEO PROVIDER NOT CONFIGURED for
                  production. Sandbox consultation is not live telemedicine. Foundation: Sprint 79
                  on Sprint 69.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {pacs ? (
            <Card>
              <Heading level={2}>
                PACS / DICOM imaging activation readiness (Sprint 93)
              </Heading>
              <Text>{pacs.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Provider:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.provider ?? pacs.provider}
                </Badge>
                <Badge kind="pending">
                  Env:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.environment ??
                    String(pacs.environment).toUpperCase()}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {pacs.activation_lifecycle ?? pacs.activation_stage}
                </Badge>
                <Badge
                  kind={
                    pacs.configuration_validation?.configuration_readiness?.configuration ===
                    'READY'
                      ? 'info'
                      : 'pending'
                  }
                >
                  Configuration:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.configuration ??
                    'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Credentials:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.credentials ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  DICOM endpoint:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.dicom_endpoint ??
                    'MISSING'}
                </Badge>
                <Badge kind="pending">
                  AE Title:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.ae_title ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Certificate:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.tls_certificate ??
                    'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Markets:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.markets_legal ??
                    pacs.country_support}
                </Badge>
                <Badge kind="pending">
                  Modality:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.modality_support ??
                    'SANDBOX_ONLY'}
                </Badge>
                <Badge kind="pending">
                  Transmission:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.transmission ??
                    pacs.transmission}
                </Badge>
                <Badge kind="warning">
                  Viewer:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.viewer ?? pacs.viewer}
                </Badge>
                <Badge kind="warning">
                  Storage:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.storage ??
                    pacs.object_storage ??
                    pacs.storage_requirement}
                </Badge>
                <Badge kind="warning">
                  KMS:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.kms ??
                    pacs.kms_encryption}
                </Badge>
                <Badge kind="warning">
                  Malware:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.malware_scanning ??
                    pacs.malware_scan ??
                    'MALWARE_SCAN_EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production activation:{' '}
                  {pacs.configuration_validation?.configuration_readiness?.production_activation ??
                    pacs.production}
                </Badge>
                <Badge kind="warning">Status: {pacs.validation_status}</Badge>
                <Badge kind="pending">Sandbox: {pacs.sandbox}</Badge>
                <Badge kind="warning">Production: {pacs.production}</Badge>
                <Badge kind="warning">Legal/clinical: {pacs.legal_clinical_gate}</Badge>
                <Badge kind="warning">
                  Blocker: {pacs.remaining_blocker ?? 'NO_PRODUCTION_PACS_PROVIDER'}
                </Badge>
                <Badge kind="pending">
                  Force launch: {String(pacs.force_launch_available ?? false)}
                </Badge>
                {pacsPath ? (
                  <>
                    <Badge kind="info">
                      S139 path: {pacsPath.software_activation_path ?? '—'}
                    </Badge>
                    <Badge kind="warning">
                      S139 ingest: {pacsPath.production_dicom_ingest ?? 'BLOCKED'}
                    </Badge>
                    <Badge kind="warning">
                      S139 viewer: {pacsPath.production_viewer ?? 'BLOCKED'}
                    </Badge>
                    <Badge kind="pending">
                      Stage: {pacsPath.pacs?.activation_stage ?? 'NOT_SELECTED'}
                    </Badge>
                    <Badge kind="pending">
                      REPORT≠VIEWER:{' '}
                      {String(pacsPath.report_neq_diagnostic_viewer ?? true)}
                    </Badge>
                  </>
                ) : null}
              </div>
              <Text tone="secondary">
                Object storage: {pacs.object_storage} · KMS: {pacs.kms_encryption} · Webhook:{' '}
                {pacs.webhook_security?.status ?? pacs.webhook ?? 'EXTERNAL_GATED'}
              </Text>
              <Text tone="secondary">Blocked: {pacs.remaining_blocker}</Text>
              {(pacs.remaining_blockers ?? [])
                .filter((b) => b !== pacs.remaining_blocker)
                .slice(0, 8)
                .map((b) => (
                  <Text key={b} tone="secondary">
                    Also: {b}
                  </Text>
                ))}
              <Text tone="secondary">Next action: {pacs.next_action}</Text>
              {pacs.study_state_machine ? (
                <Text tone="secondary">
                  Study: SCHEDULED→CHECKED_IN→ACQUIRED. IMAGING REPORT ≠ diagnostic PACS viewer.
                  Viewer EXTERNAL_GATED. Sandbox report ≠ clinical PACS. Private storage / KMS /
                  malware remain EXTERNAL_GATED. Markets:{' '}
                  {(
                    pacs.country_policy?.markets_supported_for_evaluation ?? [
                      'GLOBAL',
                      'IN',
                      'AE',
                      'US',
                    ]
                  ).join(', ')}
                  .
                </Text>
              ) : null}
              <Text tone="secondary">
                Enablement guard can_enable={String(pacs.enablement_guard.can_enable)} (
                {pacs.enablement_guard.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') ||
                  'all checks ok'}
                )
              </Text>
              {!pacs.real_pacs_available ? (
                <Text tone="secondary">
                  PACS NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_PACS_PROVIDER. Sandbox
                  study/report workflow is not a clinical DICOM viewer or live PACS. Foundation:
                  Sprint 80 on Sprint 70.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {payout ? (
            <Card>
              <Heading level={2}>Affiliate / partner payout onboarding (Sprint 71)</Heading>
              <Text>{payout.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Provider: {payout.provider}</Badge>
                <Badge kind="pending">Env: {payout.environment}</Badge>
                <Badge kind={payout.configured ? 'info' : 'pending'}>
                  Configured: {String(payout.configured)}
                </Badge>
                <Badge kind={payout.verified ? 'info' : 'pending'}>
                  Verified: {String(payout.verified)}
                </Badge>
                <Badge kind={payout.approved ? 'info' : 'pending'}>
                  Approved: {String(payout.approved)}
                </Badge>
                <Badge kind={payout.enabled ? 'warning' : 'pending'}>
                  Enabled: {String(payout.enabled)}
                </Badge>
                <Badge kind="warning">Status: {payout.validation_status}</Badge>
                <Badge kind="pending">Sandbox: {payout.sandbox}</Badge>
                <Badge kind="warning">Production: {payout.production}</Badge>
                <Badge kind="pending">Payout: {payout.payout_status}</Badge>
                <Badge kind="warning">KYC: {payout.kyc_gate}</Badge>
                <Badge kind="warning">Legal/financial: {payout.legal_financial_gate}</Badge>
                <Badge kind="pending">Ledger: {payout.ledger_protection}</Badge>
                <Badge kind="pending">Idempotency: {payout.double_payout_protection}</Badge>
              </div>
              <Text tone="secondary">
                Country: {payout.country_support} · Currency: {payout.currency_support} · Beneficiary:{' '}
                {payout.beneficiary_verification}
              </Text>
              <Text tone="secondary">Blocked: {payout.remaining_blocker}</Text>
              <Text tone="secondary">Next action: {payout.next_action}</Text>
              <Text tone="secondary">
                Enablement guard can_enable={String(payout.enablement_guard.can_enable)} (
                {payout.enablement_guard.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') ||
                  'all checks ok'}
                )
              </Text>
              {!payout.real_payout_available ? (
                <Text tone="secondary">
                  AFFILIATE PAYOUT NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_PAYOUT_ADAPTER. Sandbox
                  mock payout is not bank execution.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {realKyc ? (
            <Card>
              <Heading level={2}>
                Real KYC/KYB + healthcare partner verification activation readiness (Sprint 106)
              </Heading>
              <Text>{realKyc.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Provider: {realKyc.provider}</Badge>
                <Badge kind="pending">
                  Real KYC selected: {String(realKyc.real_kyc_provider_selected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Healthcare registry connected:{' '}
                  {String(realKyc.real_healthcare_registry_connected ?? false)}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {realKyc.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">Sandbox: {realKyc.sandbox}</Badge>
                <Badge kind="warning">Production: {realKyc.production}</Badge>
                <Badge kind="pending">
                  Manual review: {realKyc.sandbox_manual_review ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="warning">
                  Production verification: {realKyc.production_verification ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Production KYC enabled: {String(realKyc.production_kyc_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Partner production verified:{' '}
                  {String(realKyc.real_partner_production_verified ?? false)}
                </Badge>
                <Badge kind="warning">
                  Production privilege enabled:{' '}
                  {String(realKyc.production_privilege_enabled ?? false)}
                </Badge>
                <Badge kind="warning">Blocker: {realKyc.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(realKyc.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Planes: {realKyc.control_plane}/{realKyc.foundation_plane}/{realKyc.s94_plane}
                </Badge>
                <Badge kind="pending">
                  Adapter: {realKyc.runtime_adapter ?? 'manual_sandbox_review'}
                </Badge>
              </div>
              <Text tone="secondary">
                DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED. Sandbox/manual review ≠
                live KYC provider. Healthcare credentials are policy-driven — no global legal claim.
              </Text>
              <Text tone="secondary">
                Markets:{' '}
                {(realKyc.markets ?? [])
                  .map((m) => `${m.market}=${m.production}`)
                  .join(' · ') || 'GLOBAL · IN · AE · US'}
              </Text>
              <Text tone="secondary">
                Partner gates:{' '}
                {(realKyc.partner_type_gates ?? [])
                  .map((p) => `${p.partner_type}=${p.production_privilege}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Checklist:{' '}
                {(realKyc.checklist ?? [])
                  .slice(0, 10)
                  .map((c) => `${c.id}=${c.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Config — cfg:{realKyc.configuration_readiness?.configuration ?? 'MISSING'} · creds:
                {realKyc.configuration_readiness?.credentials ?? 'MISSING'} · storage:
                {realKyc.configuration_readiness?.storage ?? 'EXTERNAL_GATED'} · KMS:
                {realKyc.configuration_readiness?.kms ?? 'EXTERNAL_GATED'} · malware:
                {realKyc.configuration_readiness?.malware_scanning ?? 'EXTERNAL_GATED'}
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {realKyc.evaluated_at ? new Date(realKyc.evaluated_at).toISOString() : '—'}.
                CAN_PRODUCTION_LAUNCH: {realKyc.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {realKyc.next_action}</Text>
              <Text tone="secondary">
                PRODUCTION KYC ENABLED = NO. REAL PARTNER PRODUCTION VERIFIED = NO. REAL KYC PROVIDER
                SELECTED = NO.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {kyc ? (
            <Card>
              <Heading level={2}>
                KYC / KYB + partner verification activation readiness (Sprint 94)
              </Heading>
              <Text>{kyc.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Provider:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.provider ?? kyc.provider}
                </Badge>
                <Badge kind="pending">
                  Env:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.environment ??
                    String(kyc.environment).toUpperCase()}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {kyc.activation_lifecycle ?? kyc.activation_stage}
                </Badge>
                <Badge
                  kind={
                    kyc.configuration_validation?.configuration_readiness?.configuration === 'READY'
                      ? 'info'
                      : 'pending'
                  }
                >
                  Configuration:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.configuration ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Credentials:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.credentials ?? 'MISSING'}
                </Badge>
                <Badge kind="warning">
                  Markets:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.markets ??
                    kyc.country_support}
                </Badge>
                <Badge kind="pending">
                  Partner types:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.partner_types ??
                    'POLICY_DRIVEN'}
                </Badge>
                <Badge kind="pending">
                  Verification:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.verification_capability ??
                    kyc.verification_status}
                </Badge>
                <Badge kind="warning">
                  Webhook:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.webhook ??
                    kyc.webhook_security?.status ??
                    kyc.webhook ??
                    'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">
                  Storage:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.storage ??
                    kyc.object_storage}
                </Badge>
                <Badge kind="warning">
                  KMS:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.kms ?? kyc.kms_encryption}
                </Badge>
                <Badge kind="warning">
                  Malware:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.malware_scanning ??
                    kyc.malware_scan}
                </Badge>
                <Badge kind="warning">
                  Production activation:{' '}
                  {kyc.configuration_validation?.configuration_readiness?.production_activation ??
                    kyc.production}
                </Badge>
                <Badge kind="warning">Status: {kyc.validation_status}</Badge>
                <Badge kind="pending">Sandbox: {kyc.sandbox}</Badge>
                <Badge kind="warning">Production: {kyc.production}</Badge>
                <Badge kind="warning">Legal/compliance: {kyc.legal_compliance_gate}</Badge>
                <Badge kind="pending">PHI separation: {kyc.phi_separation}</Badge>
                <Badge kind="warning">
                  Blocker: {kyc.remaining_blocker ?? 'NO_PRODUCTION_KYC_KYB_PROVIDER'}
                </Badge>
                <Badge kind="pending">
                  Force launch: {String(kyc.force_launch_available ?? false)}
                </Badge>
              </div>
              <Text tone="secondary">
                Identity: {kyc.identity_verification} · Business: {kyc.business_verification} ·
                Credentials: {kyc.professional_credential_verification} · Beneficiary:{' '}
                {kyc.beneficiary_verification}
              </Text>
              <Text tone="secondary">
                Country: {kyc.country_support} · Lifecycle: {kyc.document_lifecycle} · Expiry:{' '}
                {kyc.expiry_renewal} · Webhook:{' '}
                {kyc.webhook_security?.status ?? kyc.webhook ?? 'EXTERNAL_GATED'}
              </Text>
              <Text tone="secondary">{kyc.approval_vs_verification}</Text>
              {kyc.verification_lifecycle ? (
                <Text tone="secondary">
                  Case: NOT_STARTED→SUBMITTED→UNDER_REVIEW→VERIFIED (EXPIRED supported). Manual
                  sandbox ≠ live KYC. DOCUMENT VERIFIED ≠ PARTNER APPROVED ≠ PRODUCTION ENABLED.
                  Markets:{' '}
                  {(
                    kyc.country_policy?.markets_supported_for_evaluation ?? [
                      'GLOBAL',
                      'IN',
                      'AE',
                      'US',
                    ]
                  ).join(', ')}
                  .
                </Text>
              ) : null}
              <Text tone="secondary">Blocked: {kyc.remaining_blocker}</Text>
              {(kyc.remaining_blockers ?? [])
                .filter((b) => b !== kyc.remaining_blocker)
                .slice(0, 8)
                .map((b) => (
                  <Text key={b} tone="secondary">
                    Also: {b}
                  </Text>
                ))}
              <Text tone="secondary">Next action: {kyc.next_action}</Text>
              <Text tone="secondary">
                Enablement guard can_enable={String(kyc.enablement_guard.can_enable)} (
                {kyc.enablement_guard.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') ||
                  'all checks ok'}
                )
              </Text>
              {!kyc.real_kyc_available ? (
                <Text tone="secondary">
                  KYC NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_KYC_KYB_PROVIDER. Manual sandbox
                  document review is not live identity / accreditation verification. Foundation:
                  Sprint 81 on Sprint 72.
                </Text>
              ) : null}
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/partners">
                  <Button variant="tertiary" size="sm">
                    Partner review
                  </Button>
                </Link>
                <Link href="/healthcare-network">
                  <Button variant="tertiary" size="sm">
                    Healthcare network
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {realStorage ? (
            <Card>
              <Heading level={2}>
                Real production storage + KMS + malware activation readiness (Sprint 107)
              </Heading>
              <Text>{realStorage.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Lifecycle: {realStorage.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Object storage selected:{' '}
                  {String(realStorage.real_object_storage_provider_selected ?? false)}
                </Badge>
                <Badge kind="warning">
                  Object storage enabled:{' '}
                  {String(realStorage.production_object_storage_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  KMS selected: {String(realStorage.real_kms_provider_selected ?? false)}
                </Badge>
                <Badge kind="warning">
                  KMS enabled: {String(realStorage.production_kms_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Malware selected: {String(realStorage.real_malware_scanner_selected ?? false)}
                </Badge>
                <Badge kind="warning">
                  Malware enabled:{' '}
                  {String(realStorage.production_malware_scanning_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Private verified: {realStorage.private_storage_verified ?? 'SANDBOX_ONLY'}
                </Badge>
                <Badge kind="warning">
                  Local-disk fallback:{' '}
                  {String(realStorage.production_local_disk_fallback_possible ?? false)}
                </Badge>
                <Badge kind="pending">Sandbox: {realStorage.sandbox}</Badge>
                <Badge kind="warning">Production: {realStorage.production}</Badge>
                <Badge kind="warning">Blocker: {realStorage.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(realStorage.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Planes: {realStorage.control_plane}/{realStorage.foundation_plane}/
                  {realStorage.s95_plane}
                </Badge>
              </div>
              <Text tone="secondary">
                LocalPrivateObjectStore ≠ production. Env crypto refs ≠ KMS. DeterministicSandbox
                scanner ≠ production AV. UNSCANNED ≠ TRUSTED. Local disk never a production
                fallback.
              </Text>
              <Text tone="secondary">
                Rails:{' '}
                {(realStorage.rails ?? [])
                  .map((r) => `${r.rail}=${r.production}`)
                  .join(' · ') || 'OBJECT_STORAGE · KMS · MALWARE_SCANNER'}
              </Text>
              <Text tone="secondary">
                Malware path:{' '}
                {(realStorage.malware_lifecycle?.success_path ?? []).join(' → ') ||
                  'UPLOAD → QUARANTINED → SCANNING → CLEAN → AVAILABLE'}
                . Failure not CLEAN:{' '}
                {String(realStorage.malware_lifecycle?.scanner_failure_not_clean ?? true)}.
              </Text>
              <Text tone="secondary">
                Markets:{' '}
                {(realStorage.markets ?? [])
                  .map((m) => `${m.market}=${m.production}`)
                  .join(' · ') || 'GLOBAL · IN · AE · US'}
              </Text>
              <Text tone="secondary">
                Checklist:{' '}
                {(realStorage.checklist ?? [])
                  .slice(0, 10)
                  .map((c) => `${c.id}=${c.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Adapters: storage=
                {realStorage.runtime_adapters?.object_storage ?? 'local_private_object_store'} ·
                kms={realStorage.runtime_adapters?.kms ?? 'env_refs_only'} · malware=
                {realStorage.runtime_adapters?.malware_scanner ?? 'deterministic_sandbox'}
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {realStorage.evaluated_at
                  ? new Date(realStorage.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {realStorage.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {realStorage.next_action}</Text>
              <Text tone="secondary">
                PRODUCTION OBJECT STORAGE / KMS / MALWARE ENABLED = NO. PRIVATE STORAGE VERIFIED =
                SANDBOX_ONLY. LOCAL-DISK FALLBACK = NO.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {storage ? (
            <>
              <Card>
                <Heading level={2}>
                  Private object storage activation readiness (Sprint 95)
                </Heading>
                <Text>{storage.message}</Text>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {storage.configuration_validation?.configuration_readiness?.private_storage
                      ?.provider ?? storage.object_storage.provider}
                  </Badge>
                  <Badge kind="pending">
                    Env:{' '}
                    {storage.configuration_validation?.configuration_readiness?.environment ??
                      String(storage.environment).toUpperCase()}
                  </Badge>
                  <Badge kind="pending">
                    Lifecycle:{' '}
                    {storage.object_storage.activation_lifecycle ??
                      storage.activation_lifecycle ??
                      storage.object_storage.activation_stage}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {storage.configuration_validation?.configuration_readiness?.private_storage
                      ?.configuration ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Credentials:{' '}
                    {storage.configuration_validation?.configuration_readiness?.private_storage
                      ?.credentials ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Bucket:{' '}
                    {storage.configuration_validation?.configuration_readiness?.private_storage
                      ?.bucket ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">Sandbox: {storage.object_storage.sandbox}</Badge>
                  <Badge kind="warning">Production: {storage.object_storage.production}</Badge>
                  <Badge kind="pending">
                    Private access: {storage.object_storage.private_access}
                  </Badge>
                  <Badge kind="pending">
                    Signed access: {storage.object_storage.signed_url_access}
                  </Badge>
                  <Badge kind="warning">
                    Production activation:{' '}
                    {storage.configuration_validation?.configuration_readiness?.private_storage
                      ?.production_activation ?? storage.object_storage.production}
                  </Badge>
                  <Badge kind="warning">
                    Blocker: {storage.object_storage.remaining_blocker}
                  </Badge>
                  <Badge kind="pending">
                    Force launch: {String(storage.force_launch_available ?? false)}
                  </Badge>
                  {storageTriadPath ? (
                    <>
                      <Badge kind="info">
                        S140 path: {storageTriadPath.software_activation_path ?? '—'}
                      </Badge>
                      <Badge kind="warning">
                        S140 ops: {storageTriadPath.production_sensitive_file_ops ?? 'BLOCKED'}
                      </Badge>
                      <Badge kind="pending">
                        Storage stage:{' '}
                        {storageTriadPath.storage?.activation_stage ?? 'NOT_SELECTED'}
                      </Badge>
                      <Badge kind="pending">
                        KMS stage: {storageTriadPath.kms?.activation_stage ?? 'NOT_SELECTED'}
                      </Badge>
                      <Badge kind="pending">
                        Malware stage:{' '}
                        {storageTriadPath.malware?.activation_stage ?? 'NOT_SELECTED'}
                      </Badge>
                      <Badge kind="pending">
                        UNSCANNED≠TRUSTED:{' '}
                        {String(storageTriadPath.unscanned_neq_trusted ?? true)}
                      </Badge>
                    </>
                  ) : null}
                </div>
                <Text tone="secondary">
                  Opaque short-lived tickets (sandbox). Permanent public URLs EXTERNAL_GATED. Local
                  disk never a production fallback. Foundation: Sprint 82 on Sprint 73. Markets:{' '}
                  {(
                    storage.country_policy?.markets_supported_for_evaluation ?? [
                      'GLOBAL',
                      'IN',
                      'AE',
                      'US',
                    ]
                  ).join(', ')}
                  .
                </Text>
                <Text tone="secondary">Blocked: {storage.object_storage.remaining_blocker}</Text>
                {(storage.object_storage.remaining_blockers ?? [])
                  .filter((b) => b !== storage.object_storage.remaining_blocker)
                  .slice(0, 4)
                  .map((b) => (
                    <Text key={b} tone="secondary">
                      Also: {b}
                    </Text>
                  ))}
                {!storage.real_object_storage_available ? (
                  <Text tone="secondary">
                    PRIVATE STORAGE NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_PRIVATE_STORAGE.
                    Local disk is never a production fallback.
                  </Text>
                ) : null}
              </Card>

              <Card>
                <Heading level={2}>KMS / encryption activation readiness (Sprint 95)</Heading>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {storage.configuration_validation?.configuration_readiness?.kms?.provider ??
                      storage.kms.provider}
                  </Badge>
                  <Badge kind="pending">
                    Key reference:{' '}
                    {storage.configuration_validation?.configuration_readiness?.kms?.key_reference ??
                      'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {storage.configuration_validation?.configuration_readiness?.kms?.configuration ??
                      'MISSING'}
                  </Badge>
                  <Badge kind="pending">Sandbox: {storage.kms.sandbox}</Badge>
                  <Badge kind="warning">Production: {storage.kms.production}</Badge>
                  <Badge kind="warning">At rest: {storage.kms.encryption_at_rest}</Badge>
                  <Badge kind="warning">
                    Rotation:{' '}
                    {storage.configuration_validation?.configuration_readiness?.kms?.rotation ??
                      storage.kms.key_rotation}
                  </Badge>
                  <Badge kind="warning">
                    Production activation:{' '}
                    {storage.configuration_validation?.configuration_readiness?.kms
                      ?.production_activation ?? storage.kms.production}
                  </Badge>
                  <Badge kind="warning">Blocker: {storage.kms.remaining_blocker}</Badge>
                </div>
                <Text tone="secondary">Blocked: {storage.kms.remaining_blocker}</Text>
                {!storage.real_kms_available ? (
                  <Text tone="secondary">
                    KMS NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_KMS. Application env refs alone
                    are not a production KMS.
                  </Text>
                ) : null}
              </Card>

              <Card>
                <Heading level={2}>Malware scanner activation readiness (Sprint 95)</Heading>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {storage.configuration_validation?.configuration_readiness?.malware_scanner
                      ?.provider ?? storage.malware_scanning.provider}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {storage.configuration_validation?.configuration_readiness?.malware_scanner
                      ?.configuration ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Endpoint:{' '}
                    {storage.configuration_validation?.configuration_readiness?.malware_scanner
                      ?.endpoint ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">Sandbox: {storage.malware_scanning.sandbox}</Badge>
                  <Badge kind="warning">Production: {storage.malware_scanning.production}</Badge>
                  <Badge kind="pending">
                    Scan:{' '}
                    {storage.configuration_validation?.configuration_readiness?.malware_scanner
                      ?.scan_capability ?? storage.malware_scanning.scan_lifecycle}
                  </Badge>
                  <Badge kind="warning">
                    Failure:{' '}
                    {storage.configuration_validation?.configuration_readiness?.malware_scanner
                      ?.failure_behavior ?? 'FAIL_CLOSED'}
                  </Badge>
                  <Badge kind="warning">
                    Production activation:{' '}
                    {storage.configuration_validation?.configuration_readiness?.malware_scanner
                      ?.production_activation ?? storage.malware_scanning.production}
                  </Badge>
                  <Badge kind="warning">
                    Blocker: {storage.malware_scanning.remaining_blocker}
                  </Badge>
                </div>
                <Text tone="secondary">
                  Retention: {storage.retention} · Backup/PITR: {storage.backup_pitr_dependency} ·
                  Residency: {storage.data_residency} · Legal/privacy: {storage.legal_privacy_gate}
                </Text>
                {storage.malware_scan_state_machine ? (
                  <Text tone="secondary">
                    Scan: UPLOAD→QUARANTINE→MALWARE_SCAN→CLEAN→AVAILABLE (REJECTED/INFECTED fail
                    closed). UNSCANNED ≠ TRUSTED. Scanner failure must not mark CLEAN. Sandbox
                    scanner is SANDBOX_ONLY. DATABASE BACKUP ≠ OBJECT STORAGE BACKUP.
                  </Text>
                ) : null}
                <Text tone="secondary">Blocked: {storage.malware_scanning.remaining_blocker}</Text>
                <Text tone="secondary">Next action: {storage.next_action}</Text>
                <Text tone="secondary">
                  Enablement guard can_enable={String(storage.enablement_guard.can_enable)} (
                  {storage.enablement_guard.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') ||
                    'all checks ok'}
                  )
                </Text>
                {!storage.real_malware_scanner_available ? (
                  <Text tone="secondary">
                    MALWARE SCANNER NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_MALWARE_SCANNER.
                    Sandbox deterministic scan is SANDBOX_ONLY; never trust unscanned production
                    files.
                  </Text>
                ) : null}
                <div className="wp-toolbar" style={{ marginTop: 8 }}>
                  <Link href="/reliability">
                    <Button variant="tertiary" size="sm">
                      Reliability
                    </Button>
                  </Link>
                  <Link href="/launch-readiness">
                    <Button variant="tertiary" size="sm">
                      Launch readiness
                    </Button>
                  </Link>
                </div>
              </Card>
            </>
          ) : null}

          {realBackup ? (
            <Card>
              <Heading level={2}>
                Real production backup + PITR + DR activation readiness (Sprint 108)
              </Heading>
              <Text>{realBackup.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Lifecycle: {realBackup.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Backup selected:{' '}
                  {String(realBackup.real_production_backup_provider_selected ?? false)}
                </Badge>
                <Badge kind="warning">
                  Backup enabled: {String(realBackup.production_backup_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  PITR enabled: {String(realBackup.production_pitr_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  DR available:{' '}
                  {String(realBackup.real_production_dr_infrastructure_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Isolated restore: {realBackup.isolated_restore_test ?? 'PENDING'} (
                  {realBackup.isolated_restore_scope ?? 'SANDBOX_ISOLATED'})
                </Badge>
                <Badge kind="pending">
                  RPO: {realBackup.rpo?.target ?? '15m'} / {realBackup.rpo?.status ?? 'TARGET_DEFINED'}{' '}
                  / {realBackup.rpo?.achievement ?? 'NOT_YET_PROVEN'}
                </Badge>
                <Badge kind="pending">
                  RTO: {realBackup.rto?.target ?? '4h'} / {realBackup.rto?.status ?? 'TARGET_DEFINED'}{' '}
                  / {realBackup.rto?.achievement ?? 'NOT_YET_PROVEN'}
                </Badge>
                <Badge kind="warning">
                  Local-disk backup fallback:{' '}
                  {String(realBackup.production_local_disk_backup_fallback_possible ?? false)}
                </Badge>
                <Badge kind="pending">Sandbox: {realBackup.sandbox}</Badge>
                <Badge kind="warning">Production: {realBackup.production}</Badge>
                <Badge kind="warning">Blocker: {realBackup.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(realBackup.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Planes: {realBackup.control_plane}/{realBackup.foundation_plane}/
                  {realBackup.s96_plane}/{realBackup.s107_plane}
                </Badge>
              </div>
              <Text tone="secondary">
                pg_dump ≠ managed backup. Sandbox restore ≠ production RTO proof. DATABASE recovery ≠
                object/file recovery (S107). Local disk is never a production backup fallback.
              </Text>
              <Text tone="secondary">
                Rails:{' '}
                {(realBackup.rails ?? [])
                  .map((r) => `${r.rail}=${r.production}`)
                  .join(' · ') || 'MANAGED_BACKUP · PITR · DR_ENVIRONMENT'}
              </Text>
              <Text tone="secondary">
                Dependencies — storage:{realBackup.dependencies?.private_storage ?? 'EXTERNAL_GATED'}{' '}
                · KMS:{realBackup.dependencies?.kms ?? 'EXTERNAL_GATED'} · monitoring:
                {realBackup.dependencies?.monitoring ?? 'EXTERNAL_GATED'} (S
                {realBackup.dependencies?.storage_sprint ?? 107})
              </Text>
              <Text tone="secondary">
                Sandbox drill: {realBackup.sandbox_restore?.status ?? 'NOT_RUN'}
                {realBackup.sandbox_restore?.restore_elapsed_ms != null
                  ? ` · ${realBackup.sandbox_restore.restore_elapsed_ms}ms`
                  : ''}
                . Production failover: EXTERNAL_GATED.
              </Text>
              <Text tone="secondary">
                Markets:{' '}
                {(realBackup.markets ?? [])
                  .map((m) => `${m.market}=${m.production}`)
                  .join(' · ') || 'GLOBAL · IN · AE · US'}
              </Text>
              <Text tone="secondary">
                Checklist:{' '}
                {(realBackup.checklist ?? [])
                  .slice(0, 10)
                  .map((c) => `${c.id}=${c.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Adapters: backup=
                {realBackup.runtime_adapters?.backup ?? 'local_pg_dump_sandbox'} · pitr=
                {realBackup.runtime_adapters?.pitr ?? 'not_selected'} · dr=
                {realBackup.runtime_adapters?.dr ?? 'sandbox_isolated_drill_only'}
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {realBackup.evaluated_at
                  ? new Date(realBackup.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {realBackup.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {realBackup.next_action}</Text>
              <Text tone="secondary">
                PRODUCTION BACKUP / PITR ENABLED = NO. DR INFRASTRUCTURE = NO. RPO/RTO =
                TARGET_DEFINED / NOT_YET_PROVEN. LOCAL-DISK BACKUP FALLBACK = NO.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {backup ? (
            <>
              <Card>
                <Heading level={2}>Managed backup activation readiness (Sprint 96)</Heading>
                <Text>{backup.message}</Text>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {backup.configuration_validation?.configuration_readiness?.managed_backup
                      ?.provider ?? backup.backup.provider}
                  </Badge>
                  <Badge kind="pending">
                    Env:{' '}
                    {backup.configuration_validation?.configuration_readiness?.environment ??
                      String(backup.environment).toUpperCase()}
                  </Badge>
                  <Badge kind="pending">
                    Lifecycle:{' '}
                    {backup.backup.activation_lifecycle ??
                      backup.activation_lifecycle ??
                      'NOT_SELECTED'}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {backup.configuration_validation?.configuration_readiness?.managed_backup
                      ?.configuration ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Credentials:{' '}
                    {backup.configuration_validation?.configuration_readiness?.managed_backup
                      ?.credentials ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Destination:{' '}
                    {backup.configuration_validation?.configuration_readiness?.managed_backup
                      ?.destination ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Schedule:{' '}
                    {backup.configuration_validation?.configuration_readiness?.managed_backup
                      ?.schedule ?? backup.backup.schedule ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="pending">
                    Retention:{' '}
                    {backup.configuration_validation?.configuration_readiness?.managed_backup
                      ?.retention ?? backup.backup.retention}
                  </Badge>
                  <Badge kind="warning">
                    Encryption:{' '}
                    {backup.configuration_validation?.configuration_readiness?.managed_backup
                      ?.encryption_dependency ?? backup.backup.encryption}
                  </Badge>
                  <Badge kind="pending">Sandbox: {backup.backup.sandbox}</Badge>
                  <Badge kind="warning">Production: {backup.backup.production}</Badge>
                  <Badge kind="warning">
                    Production activation:{' '}
                    {backup.configuration_validation?.configuration_readiness?.managed_backup
                      ?.production_activation ?? backup.backup.production}
                  </Badge>
                  <Badge kind="warning">Blocker: {backup.backup.remaining_blocker}</Badge>
                  <Badge kind="pending">
                    Force launch: {String(backup.force_launch_available ?? false)}
                  </Badge>
                </div>
                <Text tone="secondary">
                  Local pg_dump ≠ managed backup. Sandbox restore drill does not prove production
                  RTO. Foundation: Sprint 83 on Sprint 74. Markets:{' '}
                  {(
                    backup.country_policy?.markets_supported_for_evaluation ?? [
                      'GLOBAL',
                      'IN',
                      'AE',
                      'US',
                    ]
                  ).join(', ')}
                  .
                </Text>
                <Text tone="secondary">Blocked: {backup.backup.remaining_blocker}</Text>
                {(backup.backup.remaining_blockers ?? [])
                  .filter((b) => b !== backup.backup.remaining_blocker)
                  .slice(0, 4)
                  .map((b) => (
                    <Text key={b} tone="secondary">
                      Also: {b}
                    </Text>
                  ))}
                {!backup.real_managed_backup_available ? (
                  <Text tone="secondary">
                    MANAGED BACKUP NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_MANAGED_BACKUP.
                    Local db:backup is sandbox-only.
                  </Text>
                ) : null}
              </Card>

              <Card>
                <Heading level={2}>PITR activation readiness (Sprint 96)</Heading>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {backup.configuration_validation?.configuration_readiness?.pitr?.provider ??
                      backup.pitr.provider}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {backup.configuration_validation?.configuration_readiness?.pitr?.configuration ??
                      'MISSING'}
                  </Badge>
                  <Badge kind="warning">
                    WAL retention:{' '}
                    {backup.configuration_validation?.configuration_readiness?.pitr?.wal_retention ??
                      backup.pitr.wal_retention ??
                      'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Restore env:{' '}
                    {backup.configuration_validation?.configuration_readiness?.pitr
                      ?.restore_environment ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="pending">Sandbox: {backup.pitr.sandbox}</Badge>
                  <Badge kind="warning">Production: {backup.pitr.production}</Badge>
                  <Badge kind="warning">
                    Production activation:{' '}
                    {backup.configuration_validation?.configuration_readiness?.pitr
                      ?.production_activation ?? backup.pitr.production}
                  </Badge>
                  <Badge kind="warning">Blocker: {backup.pitr.remaining_blocker}</Badge>
                </div>
                <Text tone="secondary">
                  DATABASE BACKUP ≠ PITR. pg_dump sandbox recovery is not proof of production PITR.
                </Text>
                {!backup.real_pitr_available ? (
                  <Text tone="secondary">
                    PITR NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_PITR. Application dumps alone
                    are insufficient.
                  </Text>
                ) : null}
              </Card>

              <Card>
                <Heading level={2}>
                  Disaster recovery environment activation readiness (Sprint 96)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {backup.configuration_validation?.configuration_readiness?.dr_environment
                      ?.provider ?? backup.dr_environment?.provider ?? 'NOT_SELECTED'}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {backup.configuration_validation?.configuration_readiness?.dr_environment
                      ?.configuration ?? 'MISSING'}
                  </Badge>
                  <Badge kind="warning">
                    Region:{' '}
                    {backup.configuration_validation?.configuration_readiness?.dr_environment
                      ?.region ?? backup.dr_environment?.region ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="pending">
                    DB recovery:{' '}
                    {backup.configuration_validation?.configuration_readiness?.dr_environment
                      ?.database_recovery ?? 'SANDBOX_ONLY'}
                  </Badge>
                  <Badge kind="warning">
                    Object storage:{' '}
                    {backup.configuration_validation?.configuration_readiness?.dr_environment
                      ?.object_storage_dependency ??
                      backup.dr_environment?.object_storage_dependency ??
                      backup.object_recovery}
                  </Badge>
                  <Badge kind="warning">
                    KMS:{' '}
                    {backup.configuration_validation?.configuration_readiness?.dr_environment
                      ?.kms_dependency ??
                      backup.dr_environment?.kms_dependency ??
                      backup.kms_encryption_dependency}
                  </Badge>
                  <Badge kind="warning">
                    Malware: {backup.malware_scan_dependency ?? 'MALWARE_EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Monitoring:{' '}
                    {backup.configuration_validation?.configuration_readiness?.dr_environment
                      ?.monitoring_dependency ??
                      backup.dr_environment?.monitoring_dependency ??
                      'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Production:{' '}
                    {backup.dr_environment?.production ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Blocker:{' '}
                    {backup.dr_environment?.remaining_blocker ?? 'NO_PRODUCTION_DR_ENVIRONMENT'}
                  </Badge>
                </div>
                <Text tone="secondary">
                  RPO {backup.rpo.target} ({backup.rpo.status} / {backup.rpo.achievement}
                  {backup.rpo.evidence_class ? ` / ${backup.rpo.evidence_class}` : ''}) · RTO{' '}
                  {backup.rto.target} ({backup.rto.status} / {backup.rto.achievement}
                  {backup.rto.evidence_class ? ` / ${backup.rto.evidence_class}` : ''})
                </Text>
                <Text tone="secondary">
                  Sandbox restore: {backup.restore.sandbox} · Prod restore:{' '}
                  {backup.restore.production} · Drill: {backup.restore.drill.status}
                  {backup.restore.drill.restore_elapsed_ms != null
                    ? ` (${backup.restore.drill.restore_elapsed_ms}ms — SANDBOX_ONLY, not production RTO)`
                    : ''}
                </Text>
                {backup.dr_runbook ? (
                  <Text tone="secondary">
                    DR runbook: {backup.dr_runbook.source} ({backup.dr_runbook.steps.length} steps).
                    Production-class restore EXTERNAL_GATED. Storage dependency: Sprint{' '}
                    {backup.storage_dependency_sprint ?? 95}.
                  </Text>
                ) : null}
                <Text tone="secondary">
                  Primary blocker: {backup.remaining_blocker}. Force launch:{' '}
                  {String(backup.force_launch_available ?? false)}.
                </Text>
                <Text tone="secondary">
                  Enablement guard can_enable={String(backup.enablement_guard.can_enable)} (
                  {backup.enablement_guard.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') ||
                    'all checks ok'}
                  )
                </Text>
                <Text tone="secondary">Next action: {backup.next_action}</Text>
                {!backup.real_dr_environment_available ? (
                  <Text tone="secondary">
                    DR ENVIRONMENT NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_DR_ENVIRONMENT (
                    composite NO_PRODUCTION_MANAGED_BACKUP_PITR). Sandbox db:recovery-drill does not
                    prove 15m/4h.
                  </Text>
                ) : null}
                <div className="wp-toolbar" style={{ marginTop: 8 }}>
                  <Link href="/reliability">
                    <Button variant="tertiary" size="sm">
                      Reliability
                    </Button>
                  </Link>
                  <Link href="/launch-readiness">
                    <Button variant="tertiary" size="sm">
                      Launch readiness
                    </Button>
                  </Link>
                </div>
              </Card>
            </>
          ) : null}

          {observabilityPath ? (
            <Card>
              <Heading level={2}>
                Observability + APM + monitoring + alerting production closure (Sprint 143)
              </Heading>
              <Text>{observabilityPath.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software: {observabilityPath.admin_summary?.software_state ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  OBSERVABILITY:{' '}
                  {observabilityPath.admin_summary?.observability ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  APM: {observabilityPath.admin_summary?.apm_state ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Metrics: {observabilityPath.admin_summary?.metrics_state ?? 'SANDBOX_VERIFIED'}
                </Badge>
                <Badge kind="pending">
                  Alerting: {observabilityPath.admin_summary?.alerting_state ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="info">
                  Health:{' '}
                  {observabilityPath.admin_summary?.health_readiness_state ?? 'SOFTWARE_READY'}
                </Badge>
                <Badge kind="info">
                  S142 resolver:{' '}
                  {observabilityPath.secrets_manager_runtime_resolver ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  Production enabled:{' '}
                  {String(observabilityPath.production_observability_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Pager active: {String(observabilityPath.production_pager_active ?? false)}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {observabilityPath.admin_summary?.blocker_reason ??
                    observabilityPath.remaining_blocker}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {observabilityPath.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                SOFTWARE_COMPLETE ≠ EXTERNAL_GATED ≠ PRODUCTION_ENABLED. In-process /metrics ≠
                production APM. Fake APM invented:{' '}
                {String(observabilityPath.fake_apm_invented ?? false)}. Secrets printed:{' '}
                {String(observabilityPath.secrets_printed ?? false)}.
              </Text>
            </Card>
          ) : null}

          {realObservability ? (
            <Card>
              <Heading level={2}>
                Real production APM + monitoring + alerting activation readiness (Sprint 109)
              </Heading>
              <Text>{realObservability.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">
                  Lifecycle: {realObservability.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  APM selected: {String(realObservability.real_apm_provider_selected ?? false)}
                </Badge>
                <Badge kind="warning">
                  APM enabled: {String(realObservability.production_apm_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Monitoring selected:{' '}
                  {String(realObservability.real_monitoring_provider_selected ?? false)}
                </Badge>
                <Badge kind="warning">
                  Monitoring enabled:{' '}
                  {String(realObservability.production_monitoring_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Alert destination:{' '}
                  {String(realObservability.real_alerting_destination_configured ?? false)}
                </Badge>
                <Badge kind="warning">
                  Alerting enabled:{' '}
                  {String(realObservability.production_alerting_enabled ?? false)}
                </Badge>
                <Badge kind="pending">
                  Health/readiness: {realObservability.health_readiness_checks ?? 'PASS'} (
                  {realObservability.health_readiness_scope ?? 'SOFTWARE_SANDBOX'})
                </Badge>
                <Badge kind="pending">
                  Log redaction: {realObservability.sensitive_log_redaction ?? 'PASS'}
                </Badge>
                <Badge kind="pending">Sandbox: {realObservability.sandbox}</Badge>
                <Badge kind="warning">Production: {realObservability.production}</Badge>
                <Badge kind="warning">Blocker: {realObservability.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(realObservability.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Planes: {realObservability.control_plane}/{realObservability.foundation_plane}/
                  {realObservability.s97_plane}
                </Badge>
              </div>
              <Text tone="secondary">
                In-process /metrics ≠ production APM. Sandbox logs ≠ production monitoring. Software
                alert definitions ≠ production pager. NOT_SELECTED ≠ provider down.
              </Text>
              <Text tone="secondary">
                Rails:{' '}
                {(realObservability.rails ?? [])
                  .map((r) => `${r.rail}=${r.production}`)
                  .join(' · ') || 'APM · MONITORING · ALERTING'}
              </Text>
              <Text tone="secondary">
                Alert lifecycle:{' '}
                {(realObservability.alert_lifecycle?.states ?? []).join(' → ') ||
                  'TRIGGERED → ACKNOWLEDGED → RESOLVED'}
                . Severities:{' '}
                {(realObservability.alert_lifecycle?.severities ?? ['P0', 'P1', 'P2', 'P3']).join(
                  '/',
                )}
                . Pager: {realObservability.alert_lifecycle?.production_pager ?? 'EXTERNAL_GATED'}.
              </Text>
              <Text tone="secondary">
                Health — liveness:{realObservability.health_model?.liveness ?? 'SOFTWARE_READY'} ·
                readiness:{realObservability.health_model?.readiness ?? 'DEPENDENCY_AWARE'} ·
                production:{realObservability.health_model?.production_readiness ?? 'EXTERNAL_GATED'}
              </Text>
              <Text tone="secondary">
                Markets:{' '}
                {(realObservability.markets ?? [])
                  .map((m) => `${m.market}=${m.production}`)
                  .join(' · ') || 'GLOBAL · IN · AE · US'}
              </Text>
              <Text tone="secondary">
                Checklist:{' '}
                {(realObservability.checklist ?? [])
                  .slice(0, 10)
                  .map((c) => `${c.id}=${c.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Adapters: apm=
                {realObservability.runtime_adapters?.apm ?? 'in_process_metrics_sandbox'} ·
                monitoring=
                {realObservability.runtime_adapters?.monitoring ?? 'structured_logs_sandbox'} ·
                alerting=
                {realObservability.runtime_adapters?.alerting ?? 'software_definitions_only'}
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {realObservability.evaluated_at
                  ? new Date(realObservability.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {realObservability.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Next action: {realObservability.next_action}</Text>
              <Text tone="secondary">
                PRODUCTION APM / MONITORING / ALERTING ENABLED = NO. HEALTH/READINESS = PASS
                (software/sandbox). SENSITIVE LOG REDACTION = PASS.
              </Text>
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/reliability">
                  <Button variant="tertiary" size="sm">
                    Reliability
                  </Button>
                </Link>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {appSecurity ? (
            <Card>
              <Heading level={2}>
                Application security hardening — authorization / IDOR / BOLA (Sprint 110)
              </Heading>
              <Text>{appSecurity.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {appSecurity.sprint ?? 110}</Badge>
                <Badge kind="pending">
                  Parallel framework: {String(appSecurity.parallel_security_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Customer cross-object: {appSecurity.customer_cross_object ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Vendor cross-tenant: {appSecurity.vendor_cross_tenant ?? '—'}
                </Badge>
                <Badge kind="pending">IDOR/BOLA: {appSecurity.idor_bola ?? '—'}</Badge>
                <Badge kind="pending">
                  Tenant manipulation: {appSecurity.tenant_manipulation ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Admin isolation: {appSecurity.admin_privilege_isolation ?? '—'}
                </Badge>
                <Badge kind="warning">Blocker: {appSecurity.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(appSecurity.force_launch_available ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {appSecurity.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Heading level={3}>Surfaces</Heading>
              {(appSecurity.surfaces ?? []).map((s) => (
                <Text key={s.id} tone="secondary">
                  {s.label}: {s.status} · {s.evidence}
                </Text>
              ))}
              <Heading level={3}>Vulnerabilities fixed</Heading>
              {(appSecurity.vulnerabilities_fixed ?? []).map((v) => (
                <Text key={v.id} tone="secondary">
                  {v.id}: {v.summary}
                </Text>
              ))}
              <Heading level={3}>Remaining risks</Heading>
              {(appSecurity.vulnerabilities_remaining ?? []).map((v) => (
                <Text key={v.id} tone="secondary">
                  {v.id} ({v.severity}): {v.summary} — {v.why}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {appSecurity.security_statement ??
                  'Security controls tested. External pentest required.'}
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {appSecurity.evaluated_at
                  ? new Date(appSecurity.evaluated_at).toISOString()
                  : '—'}
                . Architecture reused — no parallel security framework.
              </Text>
              <Text tone="secondary">Next action: {appSecurity.next_action}</Text>
            </Card>
          ) : null}

          {pentestPrep ? (
            <Card>
              <Heading level={2}>
                External pentest preparation + security certification gate (Sprint 111)
              </Heading>
              <Text>{pentestPrep.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Sprint: {pentestPrep.sprint ?? 111}</Badge>
                <Badge kind="pending">
                  Controls: {pentestPrep.application_security_controls ?? 'TESTED'}
                </Badge>
                <Badge kind="pending">
                  Invented vendor: {String(pentestPrep.invented_pentest_vendor ?? false)}
                </Badge>
                <Badge kind="pending">
                  Parallel framework:{' '}
                  {String(pentestPrep.parallel_pentest_framework_created ?? false)}
                </Badge>
                <Badge kind="pending">
                  Routes inventoried: {pentestPrep.high_risk_routes_inventoried ?? '—'}
                </Badge>
                <Badge kind="pending">
                  Routes tested: {pentestPrep.high_risk_routes_tested ?? '—'}
                </Badge>
                <Badge kind="warning">
                  EXTERNAL_PENTEST_PASSED:{' '}
                  {pentestPrep.certification_gate?.EXTERNAL_PENTEST_PASSED ??
                    pentestPrep.external_pentest_passed ??
                    'NO'}
                </Badge>
                <Badge kind="warning">
                  PRODUCTION_SECURITY_CERTIFIED:{' '}
                  {pentestPrep.certification_gate?.PRODUCTION_SECURITY_CERTIFIED ??
                    pentestPrep.production_security_certified ??
                    'NO'}
                </Badge>
                <Badge kind="warning">Blocker: {pentestPrep.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(pentestPrep.force_launch_available ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {pentestPrep.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Heading level={3}>Certification gate</Heading>
              <Text tone="secondary">
                APPLICATION_SECURITY_TESTED:{' '}
                {pentestPrep.certification_gate?.APPLICATION_SECURITY_TESTED ?? 'YES'} ·
                APPLICATION_SECURITY_HARDENED:{' '}
                {pentestPrep.certification_gate?.APPLICATION_SECURITY_HARDENED ?? 'YES'} ·
                KNOWN_SECURITY_RISKS_DOCUMENTED:{' '}
                {pentestPrep.certification_gate?.KNOWN_SECURITY_RISKS_DOCUMENTED ?? 'YES'} ·
                EXTERNAL_PENTEST_REQUIRED:{' '}
                {pentestPrep.certification_gate?.EXTERNAL_PENTEST_REQUIRED ?? 'YES'} ·
                SECURITY_APPROVED: {pentestPrep.certification_gate?.SECURITY_APPROVED ?? 'NO'}
              </Text>
              <Heading level={3}>S110 regression</Heading>
              <Text tone="secondary">
                Delivery rider BOLA: {pentestPrep.s110_regression?.delivery_rider_bola ?? '—'} ·
                assertRider/org spoof:{' '}
                {pentestPrep.s110_regression?.assert_rider_privilege_org_spoof ?? '—'} ·
                Physical-report idempotency:{' '}
                {pentestPrep.s110_regression?.physical_report_idempotency_bola ?? '—'}
              </Text>
              <Heading level={3}>Attack surface (high-risk)</Heading>
              {(pentestPrep.attack_surface ?? []).map((s) => (
                <Text key={s.id} tone="secondary">
                  [{s.portal}] {s.category}: {s.tested_status} ({s.risk})
                </Text>
              ))}
              <Heading level={3}>Pentest scope</Heading>
              {(pentestPrep.pentest_scope ?? []).map((s) => (
                <Text key={s.id} tone="secondary">
                  {s.classification}: {s.label}
                </Text>
              ))}
              <Text tone="secondary">
                Statement:{' '}
                {pentestPrep.security_statement ??
                  'Security controls tested. External pentest required.'}
              </Text>
              <Text tone="secondary">
                Webhook: {pentestPrep.webhook_security ?? '—'} · Documents:{' '}
                {pentestPrep.document_authorization ?? '—'} · Rate-limit:{' '}
                {pentestPrep.rate_limit_abuse ?? '—'} · Leakage:{' '}
                {pentestPrep.sensitive_data_leakage ?? '—'}
              </Text>
              <Text tone="secondary">Next action: {pentestPrep.next_action}</Text>
            </Card>
          ) : null}

          {observability ? (
            <>
              <Card>
                <Heading level={2}>APM activation readiness (Sprint 97)</Heading>
                <Text>{observability.message}</Text>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {observability.configuration_validation?.configuration_readiness?.apm
                      ?.provider ?? observability.apm?.provider ?? observability.provider}
                  </Badge>
                  <Badge kind="pending">
                    Env:{' '}
                    {observability.configuration_validation?.configuration_readiness?.environment ??
                      String(observability.environment).toUpperCase()}
                  </Badge>
                  <Badge kind="pending">
                    Lifecycle:{' '}
                    {observability.apm?.activation_lifecycle ??
                      observability.activation_lifecycle ??
                      'NOT_SELECTED'}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {observability.configuration_validation?.configuration_readiness?.apm
                      ?.configuration ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Credentials:{' '}
                    {observability.configuration_validation?.configuration_readiness?.apm
                      ?.credentials ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">Metrics: {observability.metrics}</Badge>
                  <Badge kind="pending">Logs: {observability.logs}</Badge>
                  <Badge kind="pending">Traces: {observability.traces}</Badge>
                  <Badge kind="pending">Sandbox: {observability.apm?.sandbox ?? observability.sandbox}</Badge>
                  <Badge kind="warning">
                    Production: {observability.apm?.production ?? observability.production}
                  </Badge>
                  <Badge kind="warning">
                    Production activation:{' '}
                    {observability.configuration_validation?.configuration_readiness?.apm
                      ?.production_activation ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Blocker: {observability.apm?.remaining_blocker ?? observability.remaining_blocker}
                  </Badge>
                  <Badge kind="pending">
                    Force launch: {String(observability.force_launch_available ?? false)}
                  </Badge>
                </div>
                <Text tone="secondary">
                  In-process /metrics ≠ production APM. PHI/OTP/tokens never logged. Correlation:{' '}
                  {observability.correlation_model ?? 'x_request_id_x_correlation_id'}. Foundation:
                  Sprint 84 on Sprint 75. Markets:{' '}
                  {(
                    observability.country_policy?.markets_supported_for_evaluation ?? [
                      'GLOBAL',
                      'IN',
                      'AE',
                      'US',
                    ]
                  ).join(', ')}
                  .
                </Text>
                <Text tone="secondary">
                  Evaluated:{' '}
                  {observability.evaluated_at
                    ? new Date(observability.evaluated_at).toISOString()
                    : '—'}
                </Text>
                {!observability.real_apm_available ? (
                  <Text tone="secondary">
                    APM NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_APM_PROVIDER. Sandbox metrics
                    are software-ready, not production telemetry.
                  </Text>
                ) : null}
              </Card>

              <Card>
                <Heading level={2}>Monitoring activation readiness (Sprint 97)</Heading>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {observability.configuration_validation?.configuration_readiness?.monitoring
                      ?.provider ?? observability.monitoring?.provider ?? 'NOT_SELECTED'}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {observability.configuration_validation?.configuration_readiness?.monitoring
                      ?.configuration ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Credentials:{' '}
                    {observability.configuration_validation?.configuration_readiness?.monitoring
                      ?.credentials ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Coverage:{' '}
                    {observability.configuration_validation?.configuration_readiness?.monitoring
                      ?.coverage_contract ?? 'SANDBOX_DEFINED'}
                  </Badge>
                  <Badge kind="pending">
                    Webhooks: {observability.webhook_monitoring}
                  </Badge>
                  <Badge kind="pending">
                    Outbox/jobs: {observability.background_job_monitoring}
                  </Badge>
                  <Badge kind="pending">
                    Sandbox: {observability.monitoring?.sandbox ?? 'SANDBOX_ONLY'}
                  </Badge>
                  <Badge kind="warning">
                    Production: {observability.monitoring?.production ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Production activation:{' '}
                    {observability.configuration_validation?.configuration_readiness?.monitoring
                      ?.production_activation ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Blocker:{' '}
                    {observability.monitoring?.remaining_blocker ??
                      'NO_PRODUCTION_MONITORING_PROVIDER'}
                  </Badge>
                </div>
                <Text tone="secondary">
                  Coverage domains:{' '}
                  {(observability.monitoring_coverage ?? [])
                    .map((d) => d.domain)
                    .join(', ') ||
                    'CUSTOMER, VENDOR_PHARMACY, DOCTOR_CLINICAL, LAB, IMAGING, LOGISTICS, PLATFORM'}
                  . Contracts only — no fake live metrics.
                </Text>
                {!observability.real_monitoring_available ? (
                  <Text tone="secondary">
                    MONITORING NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_MONITORING_PROVIDER.
                  </Text>
                ) : null}
              </Card>

              <Card>
                <Heading level={2}>Alerting activation readiness (Sprint 97)</Heading>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    Provider:{' '}
                    {observability.configuration_validation?.configuration_readiness?.alerting
                      ?.provider ??
                      observability.alerting_rail?.provider ??
                      'NOT_SELECTED'}
                  </Badge>
                  <Badge kind="pending">
                    Configuration:{' '}
                    {observability.configuration_validation?.configuration_readiness?.alerting
                      ?.configuration ?? 'MISSING'}
                  </Badge>
                  <Badge kind="pending">
                    Credentials:{' '}
                    {observability.configuration_validation?.configuration_readiness?.alerting
                      ?.credentials ?? 'MISSING'}
                  </Badge>
                  <Badge kind="warning">
                    Destinations:{' '}
                    {observability.configuration_validation?.configuration_readiness?.alerting
                      ?.destinations ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Escalation:{' '}
                    {observability.configuration_validation?.configuration_readiness?.alerting
                      ?.escalation_policy ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Thresholds:{' '}
                    {observability.configuration_validation?.configuration_readiness?.alerting
                      ?.thresholds ?? 'THRESHOLD_REQUIRES_PRODUCTION_BASELINE'}
                  </Badge>
                  <Badge kind="warning">Alerting: {observability.alerting}</Badge>
                  <Badge kind="warning">
                    Production:{' '}
                    {observability.alerting_rail?.production ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Blocker:{' '}
                    {observability.alerting_rail?.remaining_blocker ??
                      'NO_PRODUCTION_ALERTING_PROVIDER'}
                  </Badge>
                </div>
                <Text tone="secondary">
                  Destinations — email:{' '}
                  {observability.alert_destinations?.email ?? 'EXTERNAL_GATED'} · incident:{' '}
                  {observability.alert_destinations?.incident_management ?? 'EXTERNAL_GATED'} · ops
                  channel: {observability.alert_destinations?.operations_channel ?? 'EXTERNAL_GATED'}{' '}
                  · pager: {observability.alert_destinations?.pager_oncall ?? 'EXTERNAL_GATED'}. No
                  real alerts sent.
                </Text>
                <Text tone="secondary">
                  Health: liveness {observability.health_semantics.liveness} · app{' '}
                  {observability.health_semantics.application_health} · deps{' '}
                  {observability.health_semantics.dependency_health} · production readiness{' '}
                  {observability.health_semantics.production_readiness}. PHI redaction:{' '}
                  {observability.phi_redaction}.
                </Text>
                <Text tone="secondary">
                  Primary blocker: {observability.remaining_blocker}. Force launch:{' '}
                  {String(observability.force_launch_available ?? false)}.
                </Text>
                <Text tone="secondary">
                  Also:{' '}
                  {(observability.remaining_blockers ?? [])
                    .filter((b) => b !== observability.remaining_blocker)
                    .slice(0, 5)
                    .join(' · ') || '—'}
                </Text>
                <Text tone="secondary">
                  Enablement guard can_enable={String(observability.enablement_guard.can_enable)} (
                  {observability.enablement_guard.checks
                    .filter((c) => !c.ok)
                    .map((c) => c.id)
                    .join(', ') || 'all checks ok'}
                  )
                </Text>
                <Text tone="secondary">Next action: {observability.next_action}</Text>
                {!observability.real_alerting_available ? (
                  <Text tone="secondary">
                    ALERTING NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_ALERTING_PROVIDER.
                    NOT_SELECTED ≠ provider down. Thresholds require production baseline.
                  </Text>
                ) : null}
                <div className="wp-toolbar" style={{ marginTop: 8 }}>
                  <Link href="/reliability">
                    <Button variant="tertiary" size="sm">
                      Reliability
                    </Button>
                  </Link>
                  <Link href="/launch-readiness">
                    <Button variant="tertiary" size="sm">
                      Launch readiness
                    </Button>
                  </Link>
                </div>
              </Card>
            </>
          ) : null}

          {secretsResolver ? (
            <Card>
              <Heading level={2}>
                Secrets-manager runtime resolver (Sprint 142)
              </Heading>
              <Text>{secretsResolver.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="info">
                  Software resolver:{' '}
                  {secretsResolver.secrets_manager_runtime_resolver ?? 'SOFTWARE_COMPLETE'}
                </Badge>
                <Badge kind="warning">
                  SECRETS_MANAGER:{' '}
                  {secretsResolver.admin_summary?.secrets_manager ?? 'NOT_CONFIGURED'}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {secretsResolver.lifecycle?.activation_stage ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Adapter:{' '}
                  {secretsResolver.admin_summary?.production_adapter ?? 'NOT_REGISTERED'}
                </Badge>
                <Badge kind="warning">
                  Production secrets enabled:{' '}
                  {String(secretsResolver.production_secrets_manager_enabled ?? false)}
                </Badge>
                <Badge kind="warning">
                  Blocker:{' '}
                  {secretsResolver.admin_summary?.blocker_reason ??
                    secretsResolver.remaining_blocker}
                </Badge>
                <Badge kind="pending">
                  Values visible:{' '}
                  {String(secretsResolver.admin_summary?.secret_values_visible ?? false)}
                </Badge>
                <Badge kind="warning">
                  CAN_PRODUCTION_LAUNCH: {secretsResolver.can_production_launch ?? 'NO'}
                </Badge>
              </div>
              <Text tone="secondary">
                Env isolation — DEV≠SANDBOX:{' '}
                {String(secretsResolver.environment_isolation?.development_neq_sandbox ?? true)} ·
                SANDBOX≠STAGING:{' '}
                {String(secretsResolver.environment_isolation?.sandbox_neq_staging ?? true)} ·
                STAGING≠PROD:{' '}
                {String(secretsResolver.environment_isolation?.staging_neq_production ?? true)} ·
                Prod rejects sandbox refs:{' '}
                {String(
                  secretsResolver.environment_isolation?.production_rejects_sandbox_refs ?? true,
                )}
              </Text>
              <Text tone="secondary">
                SOFTWARE_COMPLETE ≠ vault ENABLED. Secret values never shown. Fake vault:{' '}
                {String(secretsResolver.fake_vault_invented ?? false)}. Fake credentials:{' '}
                {String(secretsResolver.fake_credentials_invented ?? false)}.
              </Text>
            </Card>
          ) : null}

          {secretsEnv ? (
            <Card>
              <Heading level={2}>
                Secrets / environment configuration activation readiness (Sprint 98)
              </Heading>
              <Text>{secretsEnv.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Provider: {secretsEnv.provider}</Badge>
                <Badge kind="pending">
                  Env: {String(secretsEnv.environment).toUpperCase()}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {secretsEnv.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Secrets manager: {secretsEnv.secrets_manager ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Configuration: {secretsEnv.configuration_readiness ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">
                  Credentials: {secretsEnv.credentials_readiness ?? 'MISSING'}
                </Badge>
                <Badge kind="pending">Sandbox: {secretsEnv.sandbox}</Badge>
                <Badge kind="warning">Production: {secretsEnv.production}</Badge>
                <Badge kind="warning">
                  Production activation: {secretsEnv.production_activation ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">Blocker: {secretsEnv.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(secretsEnv.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Inventory rows: {String(secretsEnv.inventory_count ?? 0)}
                </Badge>
              </div>
              <Text tone="secondary">
                SECRET ≠ CONFIGURATION. Sandbox credentials never activate production. NEXT_PUBLIC_ /
                EXPO_PUBLIC_ must not carry secrets. Markets:{' '}
                {(
                  secretsEnv.country_policy?.markets_supported_for_evaluation ?? [
                    'GLOBAL',
                    'IN',
                    'AE',
                    'US',
                  ]
                ).join(', ')}
                .
              </Text>
              <Text tone="secondary">
                Env separation — DEV: {secretsEnv.environment_separation?.development ?? 'ISOLATED'} ·
                SANDBOX: {secretsEnv.environment_separation?.sandbox ?? 'ISOLATED'} · STAGING:{' '}
                {secretsEnv.environment_separation?.staging ?? 'EXTERNAL_GATED'} · PROD:{' '}
                {secretsEnv.environment_separation?.production ?? 'EXTERNAL_GATED'}
              </Text>
              <Text tone="secondary">
                Secret scan: {secretsEnv.secret_scan?.status ?? 'PASS_WITH_PLACEHOLDERS'} (live hits:{' '}
                {String(secretsEnv.secret_scan?.live_key_material_hits ?? 0)}). Client public secrets
                allowed: {String(secretsEnv.client_boundary?.next_public_allowed_for_secrets ?? false)}.
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {secretsEnv.evaluated_at
                  ? new Date(secretsEnv.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {secretsEnv.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Blocked: {secretsEnv.remaining_blocker}</Text>
              {(secretsEnv.remaining_blockers ?? [])
                .filter((b) => b !== secretsEnv.remaining_blocker)
                .slice(0, 6)
                .map((b) => (
                  <Text key={b} tone="secondary">
                    Also: {b}
                  </Text>
                ))}
              <Text tone="secondary">
                Rail readiness (presence only):{' '}
                {(secretsEnv.rail_summaries ?? [])
                  .slice(0, 8)
                  .map((r) => `${r.rail}=${r.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">Next action: {secretsEnv.next_action}</Text>
              {!secretsEnv.production_secrets_enabled ? (
                <Text tone="secondary">
                  SECRETS/ENV NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_SECRETS_MANAGER.
                  PRODUCTION SECRETS ENABLED = NO. Values never shown.
                </Text>
              ) : null}
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
                <Link href="/reliability">
                  <Button variant="tertiary" size="sm">
                    Reliability
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          {deployment ? (
            <Card>
              <Heading level={2}>
                Deployment / release engineering readiness (Sprint 99)
              </Heading>
              <Text>{deployment.message}</Text>
              <div className="wp-toolbar">
                <Badge kind="pending">Provider: {deployment.provider}</Badge>
                <Badge kind="pending">
                  Env: {String(deployment.environment).toUpperCase()}
                </Badge>
                <Badge kind="pending">
                  Lifecycle: {deployment.activation_lifecycle ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Target: {deployment.deployment_target ?? 'NOT_SELECTED'}
                </Badge>
                <Badge kind="pending">
                  Pipeline: {deployment.release_pipeline ?? 'CI_VALIDATE_ONLY'}
                </Badge>
                <Badge kind="pending">
                  Buildable: {String(deployment.buildable ?? false)}
                </Badge>
                <Badge kind="pending">
                  Deployable: {String(deployment.deployable ?? false)}
                </Badge>
                <Badge kind="pending">Sandbox: {deployment.sandbox}</Badge>
                <Badge kind="warning">Production: {deployment.production}</Badge>
                <Badge kind="warning">
                  Production activation: {deployment.production_activation ?? 'EXTERNAL_GATED'}
                </Badge>
                <Badge kind="warning">Blocker: {deployment.remaining_blocker}</Badge>
                <Badge kind="pending">
                  Force launch: {String(deployment.force_launch_available ?? false)}
                </Badge>
                <Badge kind="pending">
                  Force deploy: {String(deployment.force_deploy_available ?? false)}
                </Badge>
              </div>
              <Text tone="secondary">
                BUILDABLE ≠ DEPLOYABLE ≠ ACTIVATION-READY ≠ PRODUCTION-LAUNCH-READY. CI green ≠
                production deployed. Docker image ≠ production rollout. No force-deploy bypass of
                S87 gates.
              </Text>
              <Text tone="secondary">
                Release id: version {deployment.identity?.app_version ?? '0.0.0'} · git{' '}
                {deployment.identity?.git_sha ?? 'unknown'} · migration:{' '}
                {deployment.migration?.status ?? 'SOFTWARE_READY_EXTERNAL_GATED'} · rollback:{' '}
                {deployment.rollback?.production_status ?? 'NOT_YET_PROVEN'}
              </Text>
              <Text tone="secondary">
                Health gates: {(deployment.health?.endpoints ?? []).join(', ') || '—'} · smoke
                domains:{' '}
                {(deployment.smoke_contract ?? []).map((s) => s.domain).join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Build contracts:{' '}
                {(deployment.builds ?? [])
                  .slice(0, 6)
                  .map((b) => `${b.app}=${b.status}`)
                  .join(' · ') || '—'}
              </Text>
              <Text tone="secondary">
                Evaluated:{' '}
                {deployment.evaluated_at
                  ? new Date(deployment.evaluated_at).toISOString()
                  : '—'}
                . CAN_PRODUCTION_LAUNCH: {deployment.can_production_launch ?? 'NO'}.
              </Text>
              <Text tone="secondary">Blocked: {deployment.remaining_blocker}</Text>
              {(deployment.remaining_blockers ?? [])
                .filter((b) => b !== deployment.remaining_blocker)
                .slice(0, 6)
                .map((b) => (
                  <Text key={b} tone="secondary">
                    Also: {b}
                  </Text>
                ))}
              <Text tone="secondary">Next action: {deployment.next_action}</Text>
              {!deployment.production_deployment_enabled ? (
                <Text tone="secondary">
                  DEPLOYMENT NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_DEPLOYMENT_TARGET.
                  PRODUCTION DEPLOYMENT ENABLED = NO. PRODUCTION DEPLOYMENT PERFORMED = NO.
                </Text>
              ) : null}
              <div className="wp-toolbar" style={{ marginTop: 8 }}>
                <Link href="/launch-readiness">
                  <Button variant="tertiary" size="sm">
                    Launch readiness
                  </Button>
                </Link>
                <Link href="/reliability">
                  <Button variant="tertiary" size="sm">
                    Reliability
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          <Heading level={2}>Integrations</Heading>
          <div className="wp-kpi-grid">
            {matrix.rows.map((row) => (
              <Card key={row.id}>
                <Heading level={3}>{row.label}</Heading>
                <Badge kind={stageKind(row.stage)}>{row.stage}</Badge>
                <Text tone="secondary">Provider: {row.provider_name}</Text>
                <Text tone="secondary">Env: {row.environment}</Text>
                <div className="wp-toolbar" style={{ marginTop: 8 }}>
                  <Badge kind={row.configured ? 'info' : 'pending'}>
                    Configured: {String(row.configured)}
                  </Badge>
                  <Badge kind={row.verified ? 'info' : 'pending'}>Verified: {String(row.verified)}</Badge>
                  <Badge kind={row.approved ? 'info' : 'pending'}>Approved: {String(row.approved)}</Badge>
                  <Badge kind={row.enabled ? 'warning' : 'pending'}>Enabled: {String(row.enabled)}</Badge>
                </div>
                {row.external_blocker ? (
                  <Text tone="secondary">Blocked: {row.external_blocker}</Text>
                ) : null}
                <Text tone="secondary">Next: {row.next_action}</Text>
                <Button variant="tertiary" size="sm" onClick={() => setSelected(row.id)}>
                  Inspect
                </Button>
              </Card>
            ))}
          </div>

          {selectedRow ? (
            <Card>
              <Heading level={2}>Detail — {selectedRow.label}</Heading>
              <Text>{selectedRow.message}</Text>
              <Text tone="secondary">Owner: {selectedRow.owner}</Text>
              <Text tone="secondary">Phase: {selectedRow.phase}</Text>
              <Text tone="secondary">Verification: {selectedRow.verification}</Text>
              <Text tone="secondary">
                Live flag: {String(selectedRow.live_flag)} · Emergency disabled:{' '}
                {String(selectedRow.emergency_disabled)} · Ops manual activation:{' '}
                {String(selectedRow.activation_is_ops_manual)}
              </Text>
              <Text tone="secondary">
                Config keys (values never shown):{' '}
                {selectedRow.config_present.map((c) => `${c.key}=${c.secret_present}`).join(', ')}
              </Text>
              <div className="wp-toolbar">
                <Link href="/payments">
                  <Button variant="tertiary" size="sm">
                    Payments
                  </Button>
                </Link>
                <Link href="/logistics">
                  <Button variant="tertiary" size="sm">
                    Logistics
                  </Button>
                </Link>
                <Link href="/healthcare-network">
                  <Button variant="tertiary" size="sm">
                    Healthcare
                  </Button>
                </Link>
                <Link href="/finance">
                  <Button variant="tertiary" size="sm">
                    Finance
                  </Button>
                </Link>
                <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
                  Close detail
                </Button>
              </div>
            </Card>
          ) : null}

          <Heading level={2}>Activation sequence phases</Heading>
          {matrix.sequence_phases.map((p) => (
            <Card key={p.phase}>
              <Heading level={3}>
                Phase {p.phase} — {p.label}
              </Heading>
              <Text tone="secondary">Entry: {p.entry}</Text>
              <Text tone="secondary">Exit: {p.exit}</Text>
            </Card>
          ))}

          {!matrix.rows.length ? (
            <EmptyState title="No integrations" description="Activation catalog empty." />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
