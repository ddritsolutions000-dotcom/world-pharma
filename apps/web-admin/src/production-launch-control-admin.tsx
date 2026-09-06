'use client';

import Link from 'next/link';
import { AdminViewLoadError } from './admin-request-error';
import { useCallback, useEffect, useState } from 'react';
import { classifyAdminViewState } from './admin-http';
import {
  Badge,
  Button,
  Card,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { fetchProductionLaunchControl, type ProductionLaunchControlView } from './control-plane-api';
import {
  fetchProductionSecurityGate,
  fetchProductionFoundationActivationPreparation,
  fetchProductionReleaseEngineeringReadiness,
  fetchProductionDeploymentTargetActivation,
  fetchPspPaymentActivationPreparation,
  fetchPspPaymentProductionActivationControl,
  fetchOtpMessagingActivationPreparation,
  fetchCarrierLogisticsActivationPreparation,
  fetchKycHealthcarePartnerVerificationActivationPreparation,
  fetchLabPartnerOnboardingActivationPreparation,
  fetchPharmacyVendorNetworkClosure,
  fetchLabPartnerProductionWorkflowClosure,
  fetchDoctorConsultationErxProductionWorkflowClosure,
  fetchTelemedicineLiveConsultationProductionWorkflowClosure,
  fetchImagingPacsDicomProductionWorkflowClosure,
  fetchPrivateStorageKmsMalwareProductionWorkflowClosure,
} from './provider-activation-api';

const SERVICES = [
  'GLOBAL',
  'MEDICINE_COMMERCE',
  'LABS',
  'DOCTOR_CONSULTATION',
  'ERX',
  'IMAGING',
  'DELIVERY',
  'AFFILIATE',
] as const;

const MARKETS = ['GLOBAL', 'IN', 'AE', 'US'] as const;

function kindFor(status: string): 'pending' | 'warning' | 'info' {
  if (/READY|ENABLED|YES/i.test(status)) return 'info';
  if (/EXTERNAL_GATED|NOT_SELECTED|NOT_READY|NO\b|POLICY|LEGAL|NOT_YET/i.test(status)) return 'warning';
  return 'pending';
}

export function ProductionLaunchControlPanel() {
  const { session, getAccessToken } = useSession();
  const canRead = session.permissions?.includes('policy:read') ?? false;
  const [market, setMarket] = useState<string>('GLOBAL');
  const [service, setService] = useState<string>('GLOBAL');
  const [view, setView] = useState<'loading' | 'idle' | 'forbidden' | 'network' | 'error'>('loading');
  const [data, setData] = useState<ProductionLaunchControlView | null>(null);
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
  const [doctorErxWorkflow, setDoctorErxWorkflow] = useState<
    Awaited<ReturnType<typeof fetchDoctorConsultationErxProductionWorkflowClosure>> | null
  >(null);
  const [telemedicineWorkflow, setTelemedicineWorkflow] = useState<
    Awaited<ReturnType<typeof fetchTelemedicineLiveConsultationProductionWorkflowClosure>> | null
  >(null);
  const [imagingWorkflow, setImagingWorkflow] = useState<
    Awaited<ReturnType<typeof fetchImagingPacsDicomProductionWorkflowClosure>> | null
  >(null);
  const [storageWorkflow, setStorageWorkflow] = useState<
    Awaited<ReturnType<typeof fetchPrivateStorageKmsMalwareProductionWorkflowClosure>> | null
  >(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setView('forbidden');
      return;
    }
    setView('loading');
    try {
      const [next, gate, foundation, release, deploy, psp, pspCtrl, comms, carrier, kyc, labPartner, pharmacyVendor, labWorkflow, doctorErx, telemedicine, imaging, storagePipe] =
        await Promise.all([
        fetchProductionLaunchControl(token, {
          market,
          service_scope: service,
        }),
        fetchProductionSecurityGate(token),
        fetchProductionFoundationActivationPreparation(token),
        fetchProductionReleaseEngineeringReadiness(token),
        fetchProductionDeploymentTargetActivation(token),
        fetchPspPaymentActivationPreparation(token),
        fetchPspPaymentProductionActivationControl(token),
        fetchOtpMessagingActivationPreparation(token),
        fetchCarrierLogisticsActivationPreparation(token),
        fetchKycHealthcarePartnerVerificationActivationPreparation(token),
        fetchLabPartnerOnboardingActivationPreparation(token),
        fetchPharmacyVendorNetworkClosure(token),
        fetchLabPartnerProductionWorkflowClosure(token),
        fetchDoctorConsultationErxProductionWorkflowClosure(token),
        fetchTelemedicineLiveConsultationProductionWorkflowClosure(token),
        fetchImagingPacsDicomProductionWorkflowClosure(token),
        fetchPrivateStorageKmsMalwareProductionWorkflowClosure(token),
      ]);
      setData(next);
      setSecurityGate(gate);
      setFoundationPrep(foundation);
      setReleaseEng(release);
      setDeployTarget(deploy);
      setPspPrep(psp);
      setPspControl(pspCtrl);
      setCommsPrep(comms);
      setCarrierPrep(carrier);
      setKycPrep(kyc);
      setLabPartnerPrep(labPartner);
      setPharmacyVendorPrep(pharmacyVendor);
      setLabWorkflowPrep(labWorkflow);
      setDoctorErxWorkflow(doctorErx);
      setTelemedicineWorkflow(telemedicine);
      setImagingWorkflow(imaging);
      setStorageWorkflow(storagePipe);
      setView('idle');
    } catch (err) {
      if (typeof err === 'object' && err && 'status' in err && (err as { status: number }).status === 403) {
        setView('forbidden');
      } else {
        setView(classifyAdminViewState(err));
      }
    }
  }, [canRead, getAccessToken, market, service]);

  useEffect(() => {
    if (session.status === 'authenticated') void load();
  }, [load, session.status]);

  if (view === 'forbidden') return <PermissionDeniedState />;
  if ((view === 'network' || view === 'error') && !data) {
    return <AdminViewLoadError viewState={view} onRetry={() => void load()} />;
  }

  return (
    <div className="wp-stack" style={{ marginBottom: 24 }}>
      <Card>
        <Heading level={2}>World-Pharma production launch control (Sprint 87)</Heading>
        <Text>
          Aggregates S64–S86 provider activation rails. Sandbox verification is not production
          readiness. No force-launch bypass. Providers are not invented or enabled here.
        </Text>
        <div className="wp-toolbar">
          <label className="wp-field">
            <Text tone="secondary">Market</Text>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              aria-label="Launch control market"
            >
              {MARKETS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="wp-field">
            <Text tone="secondary">Service scope</Text>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              aria-label="Launch control service scope"
            >
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={() => void load()} disabled={view === 'loading'}>
            Re-evaluate launch control
          </Button>
          <Link href="/provider-activation">
            <Button variant="tertiary" size="sm">
              Provider activation
            </Button>
          </Link>
        </div>

        {view === 'loading' && !data ? <LoadingState label="Evaluating launch control" /> : null}

        {data ? (
          <>
            <div className="wp-toolbar">
              <Badge kind={kindFor(data.overall_status)}>Overall: {data.overall_status}</Badge>
              <Badge kind={kindFor(data.can_production_launch)}>
                CAN_PRODUCTION_LAUNCH: {data.can_production_launch}
              </Badge>
              <Badge kind="pending">Market: {data.market}</Badge>
              <Badge kind="pending">Service: {data.service_scope}</Badge>
              <Badge kind="pending">Force launch: {String(data.force_launch_available)}</Badge>
              <Badge kind="pending">Live providers enabled: {String(data.provider_activation_any_live_enabled)}</Badge>
            </div>
            <Text>{data.message}</Text>
            <Text tone="secondary">{data.decision}</Text>
            <Text tone="secondary">
              Evaluated {new Date(data.evaluated_at).toLocaleString()} · correlation{' '}
              {data.correlation_id}
            </Text>
            <Text tone="secondary">
              Semantic guards: SANDBOX_VERIFIED ≠ PRODUCTION_READY · TARGET_DEFINED ≠ VERIFIED ·
              NOT_SELECTED ≠ outage · mock ≠ production · RESPONSIVE_WEB ≠ native
            </Text>

            {securityGate ? (
              <Card>
                <Heading level={3}>Security certification gate (Sprint 116 — authoritative)</Heading>
                <div className="wp-toolbar">
                  <Badge kind="warning">
                    Pentest lifecycle: {securityGate.external_pentest_lifecycle ?? '—'}
                  </Badge>
                  <Badge kind="warning">
                    EXTERNAL_PENTEST: {securityGate.external_pentest_required ?? 'YES'} / passed{' '}
                    {securityGate.external_pentest_passed ?? 'NO'}
                  </Badge>
                  <Badge kind="warning">
                    Certification pending:{' '}
                    {securityGate.security_certification_pending ?? 'YES'}
                  </Badge>
                  <Badge kind="pending">
                    Certified: {securityGate.production_security_certified ?? 'NO'}
                  </Badge>
                  <Badge kind="warning">Blocker: {securityGate.remaining_blocker}</Badge>
                  <Badge kind="pending">
                    Fail-closed: {securityGate.sandbox_production_fail_closed?.overall ?? '—'}
                  </Badge>
                </div>
                <Text tone="secondary">{securityGate.why_launch_blocked}</Text>
                <Text tone="secondary">
                  Evidence still MISSING:{' '}
                  {(securityGate.required_external_evidence ?? [])
                    .filter((e) => e.status === 'MISSING')
                    .map((e) => e.id)
                    .join(' · ') || '—'}
                </Text>
              </Card>
            ) : null}

            {foundationPrep ? (
              <Card>
                <Heading level={3}>
                  Foundation activation preparation (Sprint 117 — authoritative)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="warning">
                    Env: {foundationPrep.production_environment?.status ?? 'NOT_CONFIGURED'}
                  </Badge>
                  <Badge kind="warning">
                    Secrets: {foundationPrep.production_secrets?.status ?? 'NOT_CONFIGURED'}
                  </Badge>
                  <Badge kind="warning">
                    Database: {foundationPrep.production_database?.status ?? 'NOT_CONFIGURED'}
                  </Badge>
                  <Badge kind="warning">
                    Deploy: {foundationPrep.deployment_target?.lifecycle ?? 'NOT_CONFIGURED'}
                  </Badge>
                  <Badge kind="pending">
                    Migration:{' '}
                    {foundationPrep.migration_safety?.production_cutover ?? 'NOT_AUTHORIZED'}
                  </Badge>
                  <Badge kind="pending">
                    Rollback prod: {foundationPrep.rollback?.production ?? 'NOT_PROVEN'}
                  </Badge>
                  <Badge kind="warning">Blocker: {foundationPrep.remaining_blocker}</Badge>
                </div>
                <Text tone="secondary">{foundationPrep.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {releaseEng ? (
              <Card>
                <Heading level={3}>
                  Release engineering readiness (Sprint 118 — authoritative)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="info">
                    Software: {releaseEng.software?.status ?? releaseEng.distinctions?.software_ready ?? 'READY'}
                  </Badge>
                  <Badge kind="warning">
                    Infra: {releaseEng.production_infrastructure ?? 'NOT_CONFIGURED'}
                  </Badge>
                  <Badge kind="warning">
                    Deploy target:{' '}
                    {releaseEng.deployment_target?.lifecycle ?? 'NOT_CONFIGURED'}
                  </Badge>
                  <Badge kind="pending">
                    Migration: {releaseEng.migration ?? 'NOT_AUTHORIZED'}
                  </Badge>
                  <Badge kind="pending">
                    Rollback: {releaseEng.rollback?.production ?? 'PRODUCTION_NOT_PROVEN'}
                  </Badge>
                  <Badge kind="warning">
                    Security: {releaseEng.security_gate?.remaining_blocker ?? 'EXTERNAL_PENTEST_REQUIRED'}
                  </Badge>
                  <Badge kind="warning">
                    Pipeline: {releaseEng.release_pipeline?.overall_status ?? 'NOT_CONFIGURED'}
                  </Badge>
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {releaseEng.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{releaseEng.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {deployTarget ? (
              <Card>
                <Heading level={3}>
                  Deployment target activation (Sprint 119 — why can&apos;t we deploy?)
                </Heading>
                <div className="wp-toolbar">
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
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {deployTarget.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{deployTarget.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {pspPrep ? (
              <Card>
                <Heading level={3}>
                  PSP / payment activation (Sprint 120 — why can&apos;t we take payments?)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="warning">
                    Provider: {pspPrep.admin_summary?.provider ?? 'NOT_SELECTED'}
                  </Badge>
                  <Badge kind="warning">
                    Credentials: {pspPrep.admin_summary?.production_credentials ?? 'MISSING'}
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
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {pspPrep.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{pspPrep.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {pspControl ? (
              <Card>
                <Heading level={3}>
                  PSP production activation (Sprint 128 + S132 — why can&apos;t we enable PSP?)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    S132 path: {pspControl.s132_activation_path?.software_activation_path ?? '—'}
                  </Badge>
                  <Badge kind="warning">
                    S132 lifecycle: {pspControl.s132_activation_path?.lifecycle ?? 'NOT_SELECTED'}
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
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {pspControl.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{pspControl.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {commsPrep ? (
              <Card>
                <Heading level={3}>
                  OTP / communications activation (Sprint 121 + S133 — why can&apos;t we message?)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="pending">
                    S133 path: {commsPrep.s133_activation_path?.software_activation_path ?? '—'}
                  </Badge>
                  <Badge kind="warning">
                    S133 production:{' '}
                    {commsPrep.s133_activation_path?.production_communications ?? 'BLOCKED'}
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
                  <Badge kind="warning">
                    Production comms:{' '}
                    {commsPrep.admin_summary?.production_communications ?? 'BLOCKED'}
                  </Badge>
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {commsPrep.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{commsPrep.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {carrierPrep ? (
              <Card>
                <Heading level={3}>
                  Carrier / logistics activation (Sprint 122 — why can&apos;t we ship?)
                </Heading>
                <div className="wp-toolbar">
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
                </div>
                <Text tone="secondary">{carrierPrep.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {kycPrep ? (
              <Card>
                <Heading level={3}>
                  KYC/KYB + partner verification (Sprint 124 — why can&apos;t we verify partners?)
                </Heading>
                <div className="wp-toolbar">
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
                  <Badge kind="pending">
                    Verification: {kycPrep.admin_summary?.verification ?? 'NOT_VERIFIED'}
                  </Badge>
                  <Badge kind="pending">
                    Approval: {kycPrep.admin_summary?.approval ?? 'NOT_APPROVED'}
                  </Badge>
                  <Badge kind="warning">
                    Production partner verification:{' '}
                    {kycPrep.admin_summary?.production_partner_verification ?? 'BLOCKED'}
                  </Badge>
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {kycPrep.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{kycPrep.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {pharmacyVendorPrep ? (
              <Card>
                <Heading level={3}>
                  Pharmacy / vendor network (Sprint 135 — why can&apos;t we run production vendors?)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="info">
                    Application: {pharmacyVendorPrep.admin_summary?.application ?? 'READY'}
                  </Badge>
                  <Badge kind="warning">
                    Verification:{' '}
                    {pharmacyVendorPrep.admin_summary?.verification ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="info">
                    Fulfillment:{' '}
                    {pharmacyVendorPrep.admin_summary?.fulfillment ?? 'SOFTWARE_READY'}
                  </Badge>
                  <Badge kind="info">
                    Settlement:{' '}
                    {pharmacyVendorPrep.admin_summary?.settlement ?? 'SOFTWARE_READY'}
                  </Badge>
                  <Badge kind="warning">
                    Production network:{' '}
                    {pharmacyVendorPrep.admin_summary?.production_pharmacy_vendor_network ??
                      'BLOCKED'}
                  </Badge>
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {pharmacyVendorPrep.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{pharmacyVendorPrep.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {labPartnerPrep ? (
              <Card>
                <Heading level={3}>
                  Lab partner onboarding + activation (Sprint 127 — why can&apos;t we activate labs?)
                </Heading>
                <div className="wp-toolbar">
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
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {labPartnerPrep.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{labPartnerPrep.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {labWorkflowPrep ? (
              <Card>
                <Heading level={3}>
                  Lab diagnostic workflow (Sprint 136 — why can&apos;t we run production labs?)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="info">
                    Bookings: {labWorkflowPrep.admin_summary?.bookings ?? 'SOFTWARE_READY'}
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
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {labWorkflowPrep.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{labWorkflowPrep.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {doctorErxWorkflow ? (
              <Card>
                <Heading level={3}>
                  Doctor / eRx workflow (Sprint 137 — why can&apos;t we run production clinical?)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="info">
                    Consultation:{' '}
                    {doctorErxWorkflow.admin_summary?.consultation ?? 'SOFTWARE_READY'}
                  </Badge>
                  <Badge kind="warning">
                    eRx:{' '}
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
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {doctorErxWorkflow.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{doctorErxWorkflow.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {telemedicineWorkflow ? (
              <Card>
                <Heading level={3}>
                  Telemedicine workflow (Sprint 138 — why can&apos;t we run production live video?)
                </Heading>
                <div className="wp-toolbar">
                  <Badge kind="warning">
                    Video provider:{' '}
                    {telemedicineWorkflow.admin_summary?.video_provider ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="warning">
                    Session creation:{' '}
                    {telemedicineWorkflow.admin_summary?.session_creation ?? 'EXTERNAL_GATED'}
                  </Badge>
                  <Badge kind="info">
                    Callback:{' '}
                    {telemedicineWorkflow.admin_summary?.callback_webhook ?? 'SOFTWARE_READY'}
                  </Badge>
                  <Badge kind="warning">
                    Production workflow:{' '}
                    {telemedicineWorkflow.admin_summary?.production_telemedicine_workflow ??
                      'BLOCKED'}
                  </Badge>
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {telemedicineWorkflow.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{telemedicineWorkflow.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {imagingWorkflow ? (
              <Card>
                <Heading level={3}>
                  Imaging / PACS workflow (Sprint 139 — why can&apos;t we run production DICOM?)
                </Heading>
                <div className="wp-toolbar">
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
                    Production workflow:{' '}
                    {imagingWorkflow.admin_summary?.production_imaging_pacs_dicom_workflow ??
                      'BLOCKED'}
                  </Badge>
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {imagingWorkflow.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{imagingWorkflow.why_launch_blocked}</Text>
              </Card>
            ) : null}

            {storageWorkflow ? (
              <Card>
                <Heading level={3}>
                  Storage / KMS / malware (Sprint 140 — why can&apos;t we store production files?)
                </Heading>
                <div className="wp-toolbar">
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
                  <Badge kind="warning">
                    Production pipeline:{' '}
                    {storageWorkflow.admin_summary
                      ?.production_private_storage_kms_malware_pipeline ?? 'BLOCKED'}
                  </Badge>
                  <Badge kind="warning">
                    CAN_PRODUCTION_LAUNCH: {storageWorkflow.can_production_launch ?? 'NO'}
                  </Badge>
                </div>
                <Text tone="secondary">{storageWorkflow.why_launch_blocked}</Text>
              </Card>
            ) : null}

            <Heading level={3}>Groups</Heading>
            <div className="wp-kpi-grid">
              {data.groups.map((g) => (
                <Card key={g.id}>
                  <Heading level={3}>{g.label}</Heading>
                  <Badge kind={g.blocked ? 'warning' : 'info'}>
                    {g.blocked ? 'BLOCKED' : 'CLEAR'}
                  </Badge>
                  <Text tone="secondary">{g.rails.join(' · ')}</Text>
                  {g.blockers.length ? (
                    <Text tone="secondary">Blockers: {g.blockers.join(' · ')}</Text>
                  ) : (
                    <Text tone="secondary">No active blockers in scope</Text>
                  )}
                </Card>
              ))}
            </div>

            <Heading level={3}>Rails</Heading>
            <ul className="wp-stack">
              {data.rails.map((rail) => (
                <li key={rail.rail_id}>
                  <Badge kind={kindFor(rail.production_status)}>{rail.production_status}</Badge>{' '}
                  <strong>{rail.label}</strong> · Provider: {rail.provider_name} · Stage: {rail.stage}{' '}
                  · Enabled: {String(rail.enabled)}
                  <div>
                    <Text tone="secondary">
                      Sandbox: {rail.sandbox_status} · Category: {rail.blocker_category} · Source:{' '}
                      {rail.source}
                    </Text>
                  </div>
                  <div>
                    <Text tone="secondary">Blockers: {rail.blocker_codes.join(' · ') || '—'}</Text>
                  </div>
                  {rail.notes.length ? (
                    <div>
                      <Text tone="secondary">{rail.notes.join(' · ')}</Text>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            <Card>
              <Heading level={3}>Active blockers (scope)</Heading>
              {data.active_blockers.length === 0 ? (
                <Text tone="secondary">None</Text>
              ) : (
                <ul className="wp-stack">
                  {data.active_blockers.slice(0, 40).map((b, i) => (
                    <li key={`${b.rail_id}-${b.code}-${i}`}>
                      <Badge kind="warning">{b.category}</Badge>{' '}
                      <strong>{b.code}</strong> · {b.rail_id} · {b.applicability}
                    </li>
                  ))}
                </ul>
              )}
              {data.not_applicable_rails.length ? (
                <Text tone="secondary">
                  NOT_APPLICABLE for this service: {data.not_applicable_rails.join(' · ')}
                </Text>
              ) : null}
            </Card>
          </>
        ) : null}
      </Card>
    </div>
  );
}
