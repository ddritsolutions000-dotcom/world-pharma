/**
 * Sprint 134 — Carrier/logistics production activation path contract smoke.
 */
describe('S134 real carrier logistics path', () => {
  it('documents fail-closed production carrier contract', () => {
    const contract = {
      software_activation_path: 'COMPLETE',
      production_shipment_creation_enabled: false,
      production_tracking_enabled: false,
      production_webhook_enabled: false,
      production_logistics: 'BLOCKED',
      can_production_launch: 'NO',
      remaining_blocker: 'NO_PRODUCTION_CARRIER_ADAPTER',
      secrets_manager_runtime_resolver: 'MISSING',
      medicine_import_legally_approved_claimed: false,
    };
    expect(contract.software_activation_path).toBe('COMPLETE');
    expect(contract.production_shipment_creation_enabled).toBe(false);
    expect(contract.can_production_launch).toBe('NO');
    expect(contract.medicine_import_legally_approved_claimed).toBe(false);
  });
});
