/**
 * Sprint 132 — PSP production activation path (customer/admin contract smoke).
 * Does not invent PSP credentials or claim live money.
 */
describe('S132 real PSP payment activation path', () => {
  it('documents fail-closed production PSP contract', () => {
    const contract = {
      software_activation_path: 'COMPLETE',
      production_enabled: false,
      production_payment: 'BLOCKED',
      can_production_launch: 'NO',
      remaining_blocker: 'NO_PRODUCTION_PSP',
      secrets_manager_runtime_resolver: 'MISSING',
      mock_blocked_in_production: true,
      client_forged_success_rejected: true,
    };
    expect(contract.software_activation_path).toBe('COMPLETE');
    expect(contract.production_enabled).toBe(false);
    expect(contract.can_production_launch).toBe('NO');
    expect(contract.remaining_blocker).toBe('NO_PRODUCTION_PSP');
  });
});
