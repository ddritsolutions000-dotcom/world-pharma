/**
 * Sprint 69 — Telemedicine / live video onboarding (no fake live clinical video).
 */
import {
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
import { CountryProductionLifecycle, ProductionDependencyStatus, VideoSessionStatus } from '@prisma/client';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S69 video availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — no production video provider', () => {
    const report = evaluateVideoFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_video_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.session_creation).toBe('SANDBOX_ONLY');
    expect(report.live_session).toBe('SANDBOX_ONLY');
    expect(report.recording).toMatch(/EXTERNAL_GATED/);
    expect(report.legal_clinical_gate).toBe('EXTERNAL_GATED');
    expect(report.appointment_vs_video).toBe(
      'APPOINTMENT_SEPARATE_FROM_VIDEO_SESSION_AND_CONSULTATION',
    );
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.tokens_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.remaining_blocker).toMatch(/NO_PRODUCTION_VIDEO_PROVIDER|NO_PRODUCTION_CLINICAL_ADAPTER/);
  });
});

describe('S69 video configuration validator', () => {
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

  it('NOT_CONFIGURED without production adapter or core config', () => {
    expect(
      validateVideoConfiguration({ ...base, nonMockProductionAdapterRegistered: false }),
    ).toBe('NOT_CONFIGURED');
    expect(validateVideoConfiguration({ ...base, credentialsPresent: false })).toBe('NOT_CONFIGURED');
  });

  it('CONFIGURED_BUT_UNAVAILABLE when callback/env incomplete', () => {
    expect(validateVideoConfiguration({ ...base, callbackConfigured: false })).toBe(
      'CONFIGURED_BUT_UNAVAILABLE',
    );
    expect(
      validateVideoConfiguration({ ...base, healthcareEnvironment: 'sandbox' }),
    ).toBe('CONFIGURED_BUT_UNAVAILABLE');
  });

  it('VERIFIED → VERIFIED_BUT_DISABLED → APPROVED (credentials ≠ ENABLED)', () => {
    expect(validateVideoConfiguration(base)).toBe('VERIFIED');
    expect(validateVideoConfiguration({ ...base, humanApproved: true, liveEnabled: false })).toBe(
      'VERIFIED_BUT_DISABLED',
    );
    expect(validateVideoConfiguration({ ...base, humanApproved: true, liveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S69 enablement guard', () => {
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

  it('requires full checklist', () => {
    const guard = evaluateVideoEnablementGuard({
      nonMockProductionAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      recordingPolicyClear: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
    const guard = evaluateVideoEnablementGuard({
      nonMockProductionAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      recordingPolicyClear: true,
      webhookProductionReady: true,
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S69 sandbox/production + session state', () => {
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

  it('treats mock as non-production video provider', () => {
    expect(isMockVideoProvider('mock')).toBe(true);
    expect(isMockVideoProvider('LIVEKIT_PROD')).toBe(false);
  });

  it('LiveKit refs alone do not select production provider', () => {
    process.env['LIVEKIT_URL'] = 'wss://example.livekit.cloud';
    process.env['LIVEKIT_API_KEY'] = 'key';
    process.env['LIVEKIT_API_SECRET'] = 'secret';
    delete process.env['VIDEO_PROVIDER'];
    const runtime = detectVideoRuntimeAdapter();
    expect(runtime.livekit_refs_present).toBe(true);
    const report = evaluateVideoFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.real_video_available).toBe(false);
    expect(report.secrets_printed).toBe(false);
  });

  it('production healthcare gate never opens for video without clinical adapter', async () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    expect(readHealthcareEnvironment()).toBe('production');
    expect(isLiveHealthcareEnabled()).toBe(true);
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'IN',
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
      countryCode: 'IN',
      kind: 'DOCTOR',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('NO_PRODUCTION_CLINICAL_ADAPTER');
    expect(result.never_fallback_to_sandbox_adapter).toBe(true);
  });

  it('blocks illegal video session transitions; allows legitimate path', () => {
    expect(() => assertVideoTransition(VideoSessionStatus.CREATED, VideoSessionStatus.IN_PROGRESS)).toThrow();
    expect(() => assertVideoTransition(VideoSessionStatus.CREATED, VideoSessionStatus.READY)).not.toThrow();
    expect(ACTIVE_VIDEO_STATUSES).toContain(VideoSessionStatus.READY);
    expect(ACTIVE_VIDEO_STATUSES).not.toContain(VideoSessionStatus.ENDED);
  });
});

describe('S69 legal gate + activation + globalization', () => {
  it('legal/clinical gate items remain EXTERNAL_GATED', () => {
    const items = listVideoLegalClinicalGateItems();
    expect(items.length).toBeGreaterThanOrEqual(7);
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    expect(items.find((i) => i.id === 'recording_consent')?.status).toBe('EXTERNAL_GATED');
  });

  it('VIDEO contract remains NOT_SELECTED / EXTERNAL_GATED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('VIDEO'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
    expect(row.external_blocker).toBe('NO_PRODUCTION_CLINICAL_ADAPTER');
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST and no tokens/PHI', () => {
    const blob = JSON.stringify(evaluateVideoFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/LIVEKIT_API_SECRET|apiSecret|Bearer |eyJ/);
    expect(blob).not.toMatch(/patient_name|ssn|mrn/i);
  });
});
