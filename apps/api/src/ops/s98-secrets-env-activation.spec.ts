/**
 * Sprint 98 — Production secrets + environment configuration activation readiness
 * (no invented credentials).
 */
import {
  CLIENT_PUBLIC_ENV_SECRET_EXPOSURE_RISK,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_CONFIG_MATRIX_INCOMPLETE,
  PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING,
  evaluateProductionSecretsEnvFirstOnboarding,
} from './production-secrets-env-first-onboarding';
import {
  buildProductionSecretsEnvInventory,
  evaluateClientBoundaryReadiness,
  evaluateRepositorySecretScanSummary,
  validateProductionSecretsEnvConfiguration,
} from './production-secrets-env-requirements';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { assertNoSecretLeak, redactSecretValue } from './secret-redaction';

describe('S98 secrets/env activation contract', () => {
  it('reports Sprint 98 / EXTERNAL_GATED / no secrets printed', () => {
    const report = evaluateProductionSecretsEnvFirstOnboarding();
    expect(report.sprint).toBe(98);
    expect(report.foundation_sprint).toBe(62);
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.production_secrets_enabled).toBe(false);
    expect(report.production_external_providers_enabled).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_SECRETS_MANAGER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_SECRETS_MANAGER,
        NO_PRODUCTION_ENVIRONMENT_SEPARATION,
        PRODUCTION_EXTERNAL_PROVIDER_SECRETS_MISSING,
        PRODUCTION_CONFIG_MATRIX_INCOMPLETE,
        CLIENT_PUBLIC_ENV_SECRET_EXPOSURE_RISK,
      ]),
    );
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_credentials_invented).toBe(false);
    expect(report.inventory_count).toBeGreaterThan(40);
  });

  it('classifies SECRET vs CONFIGURATION and keeps client boundary closed', () => {
    const inventory = buildProductionSecretsEnvInventory();
    expect(inventory.some((i) => i.classification === 'SECRET')).toBe(true);
    expect(inventory.some((i) => i.classification === 'CONFIGURATION')).toBe(true);
    expect(inventory.find((i) => i.key === 'api_credentials' && i.rail === 'PSP')?.classification).toBe(
      'SECRET',
    );
    expect(inventory.find((i) => i.key === 'provider' && i.rail === 'PSP')?.classification).toBe(
      'CONFIGURATION',
    );

    const client = evaluateClientBoundaryReadiness();
    expect(client.next_public_allowed_for_secrets).toBe(false);
    expect(client.expo_public_allowed_for_secrets).toBe(false);
    expect(client.admin_ui_shows_presence_only).toBe(true);

    const v = validateProductionSecretsEnvConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.production_activation).toBe('EXTERNAL_GATED');

    const scan = evaluateRepositorySecretScanSummary();
    expect(scan.live_key_material_hits).toBe(0);
    expect(scan.placeholder_fixture_ok).toBe(true);
  });
});

describe('S98 security + launch integration', () => {
  it('redaction + launch control remain fail-closed', () => {
    expect(redactSecretValue('super-secret-value')).toBe('SET');
    expect(redactSecretValue('')).toBe('MISSING');
    expect(assertNoSecretLeak(JSON.stringify(evaluateProductionSecretsEnvFirstOnboarding()))).toBe(
      true,
    );

    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(launch.force_launch_available).toBe(false);
    expect(launch.rails.some((r) => r.rail_id === 'SECRETS_ENV')).toBe(true);
    const secretsRail = launch.rails.find((r) => r.rail_id === 'SECRETS_ENV');
    expect(secretsRail?.production_status).toBe('EXTERNAL_GATED');
    expect(secretsRail?.blocker_codes).toEqual(
      expect.arrayContaining([NO_PRODUCTION_SECRETS_MANAGER]),
    );
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented vault vendors', () => {
    const blob = JSON.stringify(evaluateProductionSecretsEnvFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/postgresql:\/\/[^:]+:[^@]+@|sk_live_|BEGIN PRIVATE KEY/);
    expect(blob).not.toMatch(/\bDatadog\b|\bNewRelic\b|\bHashiCorp\b/i);
  });
});
