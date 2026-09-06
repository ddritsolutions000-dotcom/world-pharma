/**
 * Sprint 150 — Production KYC/KYB + healthcare partner verification activation (unit).
 * No invented providers/verification/licenses; secrets never printed; fail-closed.
 */
import { ProblemException } from '../common/problem';
import { assertNoSecretLeak } from '../ops/secret-redaction';
import { evaluateKycHealthcarePartnerVerificationActivationPreparation } from './kyc-healthcare-partner-verification-activation-preparation';
import { evaluateSecretsManagerRuntimeResolver } from '../ops/secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from '../ops/observability-apm-monitoring-alerting-production-activation-path';
import { evaluateProductionSecurityLaunchGatePath } from '../ops/production-security-launch-gate-path';
import {
  CLIENT_KYC_ACTIVATION_DENIED,
  CROSS_PARTNER_KYC_ACCESS_DENIED,
  DOCUMENT_VERIFIED_NEQ_PARTNER_APPROVED,
  EXPIRED_VERIFICATION_BYPASS_DENIED,
  FORGED_KYC_STATE_REJECTED,
  FORGED_KYC_WEBHOOK_REJECTED,
  KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED,
  KYC_WEBHOOK_REPLAY_REJECTED,
  KYC_WEBHOOK_UNSIGNED_REJECTED,
  KYC_WEBHOOK_WRONG_ENVIRONMENT_REJECTED,
  NO_PRODUCTION_KYC_ADAPTER,
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  PARTNER_SELF_APPROVAL_DENIED,
  SUSPENDED_PARTNER_BYPASS_DENIED,
  assertCrossPartnerKycAccessDenied,
  assertExpiredVerificationBypassDenied,
  assertKycWebhookRejected,
  assertNoSecretLeakInKycPayload,
  assertProductionKycActivationAllowed,
  assertSuspendedPartnerBypassDenied,
  evaluateAdminKycSoDContract,
  evaluateEvidenceReferenceContract,
  evaluateExpirySuspensionContract,
  evaluateGlobalKycPolicyContract,
  evaluateKycWebhookSecurityContract,
  evaluatePartnerPortalKycVisibilityContract,
  evaluatePartnerTypeKycComposition,
  evaluateProductionKycKybHealthcarePartnerVerificationActivationPath,
  evaluateVerificationSeparationContract,
  listKycObservabilityEvents,
  rejectForgedKycState,
  rejectForgedKycWebhook,
  registerProductionKycAdapter,
  selectKycVerificationProviderAdapter,
} from './production-kyc-kyb-healthcare-partner-verification-activation-path';

describe('S150 production KYC/KYB healthcare partner verification activation', () => {
  afterEach(() => {
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
    delete process.env.KYC_PROVIDER;
    delete process.env.KYC_KYB_PROVIDER;
    delete process.env.KYC_PROVIDER_SECRET_REF;
    delete process.env.KYC_CALLBACK_SECRET_REF;
    registerProductionKycAdapter(null);
  });

  it('lifecycle NOT_SELECTED + SOFTWARE_COMPLETE + no invented verification', () => {
    const report = evaluateProductionKycKybHealthcarePartnerVerificationActivationPath();
    expect(report.sprint).toBe(150);
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.lifecycle).toBe('NOT_SELECTED');
    expect(report.configured).toBe(false);
    expect(report.verified).toBe(false);
    expect(report.approved).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.s124_rebuilt).toBe(false);
    expect(report.parallel_kyc_system_created).toBe(false);
    expect(report.invented_kyc_provider).toBe(false);
    expect(report.invented_verification_results).toBe(false);
    expect(report.fabricated_licenses_accreditation).toBe(false);
    expect(report.approved_unverified_partners).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_KYC_KYB_PROVIDER);
    expect(report.can_production_launch).toBe('NO');
    expect(report.composed_foundations.s124).toBe('COMPOSED_NOT_REBUILT');
    expect(report.composed_foundations.s142).toBe('COMPOSED');
    expect(report.composed_foundations.s143).toBe('COMPOSED');
    expect(report.composed_foundations.s148).toBe('COMPOSED');
    expect(report.admin_summary.external_gated).toBe(true);
    expect(report.admin_summary.production_enabled).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
    expect(assertNoSecretLeakInKycPayload(JSON.stringify(report))).toBe(true);
  });

  it('provider gating EXTERNAL_GATED / fail-closed adapter (no fake success)', async () => {
    const adapter = selectKycVerificationProviderAdapter();
    expect(adapter.name).toBe('fail_closed_production_kyc');
    await expect(adapter.submitVerification({ case_ref: 'x' })).rejects.toBeInstanceOf(
      ProblemException,
    );
    try {
      await adapter.getVerificationStatus('x');
    } catch (err) {
      expect((err as ProblemException).code).toBe(KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED);
    }
    const report = evaluateProductionKycKybHealthcarePartnerVerificationActivationPath();
    expect(report.adapter.selected).toBe('fail_closed_production_kyc');
    expect(report.blockers).toEqual(
      expect.arrayContaining([NO_PRODUCTION_KYC_ADAPTER, NO_PRODUCTION_KYC_KYB_PROVIDER]),
    );
  });

  it('verification separation + evidence references only', () => {
    const sep = evaluateVerificationSeparationContract();
    expect(sep.document_verified_neq_partner_verified).toBe(true);
    expect(sep.partner_approved_neq_production_enabled).toBe(true);
    expect(sep.verified_document_alone_never_activates_healthcare_partner).toBe(true);
    expect(sep.semantic_states_not_collapsed).toBe(true);
    expect(sep.states).toEqual(
      expect.arrayContaining([
        'DOCUMENT_VERIFIED',
        'PARTNER_VERIFIED',
        'PARTNER_APPROVED',
        'PRODUCTION_ENABLED',
        'PAYOUT_ENABLED',
        'CLINICAL_ENABLED',
      ]),
    );

    const evidence = evaluateEvidenceReferenceContract();
    expect(evidence.stores_references_metadata_only).toBe(true);
    expect(evidence.raw_identity_documents_in_app_tables).toBe(false);
    expect(evidence.public_url_exposure_forbidden).toBe(true);
    expect(evidence.fields).toEqual(
      expect.arrayContaining(['provider_case_id', 'verification_id', 'document_reference']),
    );
  });

  it('expiry / suspension fail closed', () => {
    const expiry = evaluateExpirySuspensionContract();
    expect(expiry.verification_expiry_supported).toBe(true);
    expect(expiry.expired_fail_closed).toBe(true);
    expect(expiry.suspended_fail_closed).toBe(true);
    expect(expiry.verified_can_expire_transition).toBe(true);
    expect(() => assertExpiredVerificationBypassDenied()).toThrow(ProblemException);
    try {
      assertSuspendedPartnerBypassDenied();
    } catch (err) {
      expect((err as ProblemException).code).toBe(SUSPENDED_PARTNER_BYPASS_DENIED);
    }
    try {
      assertExpiredVerificationBypassDenied();
    } catch (err) {
      expect((err as ProblemException).code).toBe(EXPIRED_VERIFICATION_BYPASS_DENIED);
    }
  });

  it('webhook signature / replay / environment isolation', () => {
    const webhook = evaluateKycWebhookSecurityContract();
    expect(webhook.requires_signature_verification).toBe(true);
    expect(webhook.requires_replay_protection).toBe(true);
    expect(webhook.requires_idempotency).toBe(true);
    expect(webhook.requires_correct_environment).toBe(true);
    expect(webhook.unsigned_rejected).toBe(true);
    expect(webhook.browser_not_a_verification_callback).toBe(true);
    expect(webhook.production_status).toBe('EXTERNAL_GATED');

    expect(() => assertKycWebhookRejected('unsigned')).toThrow(ProblemException);
    try {
      assertKycWebhookRejected('replay');
    } catch (err) {
      expect((err as ProblemException).code).toBe(KYC_WEBHOOK_REPLAY_REJECTED);
    }
    try {
      assertKycWebhookRejected('wrong_env');
    } catch (err) {
      expect((err as ProblemException).code).toBe(KYC_WEBHOOK_WRONG_ENVIRONMENT_REJECTED);
    }
    try {
      assertKycWebhookRejected('unsigned');
    } catch (err) {
      expect((err as ProblemException).code).toBe(KYC_WEBHOOK_UNSIGNED_REJECTED);
    }
  });

  it('secrets integration + global policy (no India/INR hardcoding)', () => {
    process.env.KYC_PROVIDER_SECRET_REF = 'vault://kyc/provider';
    const report = evaluateProductionKycKybHealthcarePartnerVerificationActivationPath();
    expect(report.secrets_manager_runtime_resolver).toBeTruthy();
    expect(report.secret_references_presence.every((r) => r.value_leaked === false)).toBe(true);
    expect(report.secrets_printed).toBe(false);

    const policy = evaluateGlobalKycPolicyContract();
    expect(policy.hardcoded_india).toBe(false);
    expect(policy.hardcoded_inr).toBe(false);
    expect(policy.hardcoded_gst).toBe(false);
    expect(policy.hardcoded_pan).toBe(false);
    expect(policy.hardcoded_upi).toBe(false);
    expect(policy.hardcoded_ist).toBe(false);
    expect(policy.uses_policy_market_configuration).toBe(true);
  });

  it('partner-type composition gates pharmacy/lab/doctor/imaging/affiliate', () => {
    const types = evaluatePartnerTypeKycComposition();
    expect(types.map((t) => t.partner_type)).toEqual([
      'pharmacy_vendor',
      'lab',
      'doctor',
      'imaging',
      'affiliate',
    ]);
    for (const t of types) {
      expect(t.requires_kyc_kyb).toBe(true);
      expect(t.production_activation_enabled).toBe(false);
      expect(t.remaining_blocker.length).toBeGreaterThan(0);
    }
    const report = evaluateProductionKycKybHealthcarePartnerVerificationActivationPath();
    expect(report.dependent_gates.pharmacy_vendor).toBeTruthy();
    expect(report.dependent_gates.lab).toBeTruthy();
    expect(report.dependent_gates.doctor).toBeTruthy();
    expect(report.dependent_gates.imaging).toBeTruthy();
    expect(report.dependent_gates.affiliate_payout).toBeTruthy();
  });

  it('tenant isolation + SoD + Admin authorization + forged state rejection', () => {
    expect(() =>
      assertCrossPartnerKycAccessDenied('partner-a', 'partner-b'),
    ).toThrow(ProblemException);
    try {
      assertCrossPartnerKycAccessDenied('a', 'b');
    } catch (err) {
      expect((err as ProblemException).code).toBe(CROSS_PARTNER_KYC_ACCESS_DENIED);
    }
    assertCrossPartnerKycAccessDenied('same', 'same');

    const sod = evaluateAdminKycSoDContract();
    expect(sod.verifier_neq_approver_where_required).toBe(true);
    expect(sod.partner_cannot_approve_itself).toBe(true);
    expect(sod.client_cannot_alter_verification_state).toBe(true);
    expect(sod.raw_credentials_never_exposed).toBe(true);

    const portal = evaluatePartnerPortalKycVisibilityContract();
    expect(portal.cannot_mark_self_verified).toBe(true);
    expect(portal.cannot_approve_self).toBe(true);
    expect(portal.cannot_access_other_partner_case).toBe(true);

    expect(() =>
      assertProductionKycActivationAllowed('test', {
        kind: 'client_browser',
        service_id: 'web',
      }),
    ).toThrow(ProblemException);
    try {
      assertProductionKycActivationAllowed('test', {
        kind: 'client_browser',
        service_id: 'web',
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(CLIENT_KYC_ACTIVATION_DENIED);
    }
    try {
      assertProductionKycActivationAllowed(
        'test',
        { kind: 'admin_control_plane', service_id: 'admin' },
        { partner_self: true },
      );
    } catch (err) {
      expect((err as ProblemException).code).toBe(PARTNER_SELF_APPROVAL_DENIED);
    }
    try {
      assertProductionKycActivationAllowed('test', {
        kind: 'admin_control_plane',
        service_id: 'admin',
      });
    } catch (err) {
      expect((err as ProblemException).code).toBe(KYC_PRODUCTION_ACTIVATION_EXTERNAL_GATED);
    }

    expect(() =>
      rejectForgedKycState({ lifecycle: 'ENABLED', enabled: true }),
    ).toThrow(ProblemException);
    try {
      rejectForgedKycState({ document_verified_as_production: true });
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_KYC_STATE_REJECTED);
    }
    try {
      rejectForgedKycWebhook();
    } catch (err) {
      expect((err as ProblemException).code).toBe(FORGED_KYC_WEBHOOK_REJECTED);
    }

    expect(DOCUMENT_VERIFIED_NEQ_PARTNER_APPROVED).toBeTruthy();
  });

  it('observability safe events + composed S124/S142/S143/S148 snapshots', () => {
    const events = listKycObservabilityEvents();
    expect(events.map((e) => e.id)).toEqual(
      expect.arrayContaining([
        'verification_submitted',
        'verification_rejected',
        'partner_approved',
        'activation_blocked',
        'activation_enabled',
      ]),
    );
    expect(events.every((e) => e.safe === true)).toBe(true);

    const report = evaluateProductionKycKybHealthcarePartnerVerificationActivationPath();
    expect(report.s124_snapshot.remaining_blocker).toBe(
      evaluateKycHealthcarePartnerVerificationActivationPreparation().remaining_blocker,
    );
    expect(evaluateSecretsManagerRuntimeResolver().software_activation_path).toBe('COMPLETE');
    expect(
      evaluateObservabilityApmMonitoringAlertingProductionActivationPath()
        .software_activation_path,
    ).toBe('COMPLETE');
    expect(evaluateProductionSecurityLaunchGatePath().can_production_launch).toBe('NO');
    expect(report.s148_snapshot.can_production_launch).toBe('NO');
    expect(report.identity_documents_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
  });
});
