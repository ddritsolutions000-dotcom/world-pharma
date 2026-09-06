/**
 * Sprint 117 — Production foundation activation preparation contract.
 */
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  buildFoundationRails,
  evaluateProductionFoundationActivationPreparation,
} from './production-foundation-activation-preparation';
import { evaluateFoundationRealActivation } from './foundation-real-activation-first-onboarding';
import { evaluateProductionSecurityGate } from './production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from './production-launch-control';
import { buildProductionSecretsEnvInventory } from './production-secrets-env-requirements';
import { assertNoSecretLeak } from './secret-redaction';

describe('S117 foundation activation preparation', () => {
  it('reports NOT_CONFIGURED rails / launch NO / no invented infra', () => {
    const report = evaluateProductionFoundationActivationPreparation();
    expect(report.sprint).toBe(117);
    expect(report.authoritative_source).toBe('production-foundation-activation-preparation');
    expect(report.parallel_foundation_framework_created).toBe(false);
    expect(report.parallel_launch_rail_created).toBe(false);
    expect(report.fake_infrastructure_invented).toBe(false);
    expect(report.production_environment.status).toBe('NOT_CONFIGURED');
    expect(report.production_environment.separation_verified).toBe('YES');
    expect(report.production_environment.sandbox_adapters_activate_production).toBe('NO');
    expect(report.production_secrets.status).toBe('NOT_CONFIGURED');
    expect(report.production_secrets.secrets_manager_selected).toBe('NO');
    expect(report.production_secrets.client_secret_exposure).toBe('PASS');
    expect(report.production_database.status).toBe('NOT_CONFIGURED');
    expect(report.production_database.cutover_authorized).toBe('NO');
    expect(report.deployment_target.lifecycle).toBe('NOT_CONFIGURED');
    expect(report.deployment_target.deployable).toBe(false);
    expect(report.deployment_target.deployed).toBe(false);
    expect(report.migration_safety.production_cutover).toBe('NOT_AUTHORIZED');
    expect(report.rollback.production).toBe('NOT_PROVEN');
    expect(report.startup_readiness.readiness_claims_production_activation).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.force_deploy_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_ENVIRONMENT);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_ENVIRONMENT,
        NO_PRODUCTION_SECRETS_MANAGER,
        NO_PRODUCTION_DATABASE,
        NO_PRODUCTION_DEPLOYMENT_TARGET,
        MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
      ]),
    );
    expect(report.secrets_printed).toBe(false);
    expect(JSON.stringify(report.production_secrets.contract_entries)).not.toMatch(
      /sk_live_|postgresql:\/\/[^:]+:[^@]+@/,
    );
  });

  it('exposes rails, aliases, secrets inventory including EDGE_WAF', () => {
    const report = evaluateProductionFoundationActivationPreparation();
    expect(buildFoundationRails().map((r) => r.rail)).toEqual([
      'ENVIRONMENT',
      'SECRETS_MANAGER',
      'DATABASE',
      'DEPLOYMENT_TARGET',
    ]);
    expect(report.blocker_aliases_documented.length).toBeGreaterThanOrEqual(4);
    expect(report.required_external_actions.every((a) => a.status === 'EXTERNAL_GATED')).toBe(true);
    const inventory = buildProductionSecretsEnvInventory();
    expect(inventory.some((e) => e.rail === 'EDGE_WAF')).toBe(true);
    expect(inventory.some((e) => e.rail === 'AFFILIATE_PAYOUT')).toBe(true);
    expect(report.production_secrets.contract_entries.some((e) => e.rail === 'EDGE_WAF')).toBe(true);
  });
});

describe('S117 compose + fail-closed regression', () => {
  it('composes S112/S116 and does not bypass S87', () => {
    expect(evaluateFoundationRealActivation().production_environment_configured).toBe('NO');
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
    expect(launch.can_production_launch).toBe('NO');
    expect(assertNoSecretLeak(JSON.stringify(evaluateProductionFoundationActivationPreparation()))).toBe(
      true,
    );
  });

  it('no India hardcoding', () => {
    const blob = JSON.stringify(evaluateProductionFoundationActivationPreparation());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b/);
  });
});
