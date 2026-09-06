/**
 * Sprint 79 — Telemedicine / live video activation readiness (no fake live provider).
 */
import {
  NO_PRODUCTION_CLINICAL_ADAPTER,
  NO_PRODUCTION_VIDEO_PROVIDER,
  buildVideoSessionLifecycleMachine,
  detectVideoRuntimeAdapter,
  evaluateVideoEnablementGuard,
  evaluateVideoFirstOnboarding,
  isMockVideoProvider,
  listVideoLegalClinicalGateItems,
  validateVideoConfiguration,
} from './video-first-onboarding';
import { assertVideoTransition, ACTIVE_VIDEO_STATUSES } from './video-status';
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';
import { evaluateProductionHealthcareAvailable } from '../healthcare/production-healthcare-gate';
import {
  CountryProductionLifecycle,
  ProductionDependencyStatus,
  VideoSessionStatus,
} from '@prisma/client';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S79 video availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_VIDEO_PROVIDER', () => {
    const report = evaluateVideoFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(79);
    expect([69, 79]).toContain(report.foundation_sprint);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_video_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.session_creation).toBe('SANDBOX_ONLY');
    expect(report.live_session).toBe('SANDBOX_ONLY');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_VIDEO_PROVIDER);
    expect(report.related_clinical_blocker).toBe(NO_PRODUCTION_CLINICAL_ADAPTER);
    expect(report.recording).toMatch(/EXTERNAL_GATED/);
    expect(report.webhook).toBe('EXTERNAL_GATED');
    expect(report.fake_provider_invented).toBe(false);
    expect(report.fake_meeting_url_as_production).toBe(false);
    expect(report.tokens_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_ios).toBe('DEVICE_NOT_AVAILABLE');
  });
});

describe('S79 session lifecycle + token security', () => {
  it('documents idempotent session path and token rules', () => {
    const life = buildVideoSessionLifecycleMachine();
    expect(life.success_path).toContain('CREATED');
    expect(life.success_path).toContain('ENDED');
    expect(life.idempotent_start_end).toBe(true);
    expect(life.terminal_overwrite_forbidden).toBe(true);

    const report = evaluateVideoFirstOnboarding();
    expect(report.token_security.never_log_tokens).toBe(true);
    expect(report.token_security.sandbox_tokens_not_production).toBe(true);
    expect(report.consent).toBe('SANDBOX_VERIFIED');
    expect(report.permission_model.tenant_isolation).toBe(true);
  });

  it('blocks illegal video session transitions', () => {
    expect(() =>
      assertVideoTransition(VideoSessionStatus.CREATED, VideoSessionStatus.IN_PROGRESS),
    ).toThrow();
    expect(() =>
      assertVideoTransition(VideoSessionStatus.CREATED, VideoSessionStatus.READY),
    ).not.toThrow();
    expect(ACTIVE_VIDEO_STATUSES).not.toContain(VideoSessionStatus.ENDED);
  });
});

describe('S79 enablement guard', () => {
  it('never enables without production adapter', () => {
    const guard = evaluateVideoEnablementGuard({
      nonMockProductionAdapterRegistered: false,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      recordingPolicyClear: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist including country policy', () => {
    const guard = evaluateVideoEnablementGuard({
      nonMockProductionAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      recordingPolicyClear: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
      countryPolicyConfigured: true,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('blocks when country policy missing', () => {
    const guard = evaluateVideoEnablementGuard({
      nonMockProductionAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      recordingPolicyClear: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
      countryPolicyConfigured: false,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S79 configuration validator', () => {
  const base = {
    providerSelected: true,
    nonMockProductionAdapterRegistered: true,
    healthcareEnvironment: 'production' as const,
    liveEnabled: false,
    humanApproved: false,
    credentialsPresent: true,
    accountProjectPresent: true,
    endpointConfigured: true,
    allowedOriginsConfigured: true,
    countrySupportConfigured: true,
    callbackConfigured: true,
    legalClinicalConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validateVideoConfiguration({ ...base, providerSelected: false })).toBe('NOT_SELECTED');
  });

  it('credentials alone never ENABLED', () => {
    expect(validateVideoConfiguration({ ...base, humanApproved: true, liveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S79 sandbox/production fail-closed', () => {
  const prev = {
    env: process.env['HEALTHCARE_ENVIRONMENT'],
    live: process.env['HEALTHCARE_LIVE_ENABLED'],
    video: process.env['VIDEO_PROVIDER'],
    lkUrl: process.env['LIVEKIT_URL'],
    lkKey: process.env['LIVEKIT_API_KEY'],
    lkSecret: process.env['LIVEKIT_API_SECRET'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('HEALTHCARE_ENVIRONMENT', prev.env);
    restore('HEALTHCARE_LIVE_ENABLED', prev.live);
    restore('VIDEO_PROVIDER', prev.video);
    restore('LIVEKIT_URL', prev.lkUrl);
    restore('LIVEKIT_API_KEY', prev.lkKey);
    restore('LIVEKIT_API_SECRET', prev.lkSecret);
  });

  it('LiveKit refs alone do not select production provider', () => {
    expect(isMockVideoProvider('mock')).toBe(true);
    process.env['LIVEKIT_URL'] = 'wss://example.livekit.cloud';
    process.env['LIVEKIT_API_KEY'] = 'key';
    process.env['LIVEKIT_API_SECRET'] = 'secret';
    delete process.env['VIDEO_PROVIDER'];
    const runtime = detectVideoRuntimeAdapter();
    expect(runtime.livekit_refs_present).toBe(true);
    const report = evaluateVideoFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_VIDEO_PROVIDER);
  });

  it('production healthcare gate never opens without clinical adapter', async () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    expect(readHealthcareEnvironment()).toBe('production');
    expect(isLiveHealthcareEnabled()).toBe(true);
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'AE',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        }),
      },
      productionDependency: {
        findFirst: async () => ({
          dependencyType: 'VIDEO_PROVIDER',
          status: ProductionDependencyStatus.VERIFIED,
          externalGated: false,
          configReference: 'vault:video',
        }),
      },
    } as never;
    const result = await evaluateProductionHealthcareAvailable(prisma, {
      countryCode: 'AE',
      kind: 'DOCTOR',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain(NO_PRODUCTION_CLINICAL_ADAPTER);
    expect(result.never_fallback_to_sandbox_adapter).toBe(true);
  });
});

describe('S79 legal gate + globalization', () => {
  it('legal items EXTERNAL_GATED; no tokens/PHI/currency hardcoding', () => {
    const items = listVideoLegalClinicalGateItems();
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    const blob = JSON.stringify(evaluateVideoFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/LIVEKIT_API_SECRET|apiSecret|Bearer |eyJ/);
    expect(blob).not.toMatch(/patient_name|ssn|mrn/i);
  });

  it('VIDEO contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('VIDEO'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
  });
});
