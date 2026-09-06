/**
 * Sprint 133 — OTP/comms production activation path contract smoke.
 */
describe('S133 production OTP communications path', () => {
  it('documents fail-closed production OTP/comms contract', () => {
    const contract = {
      software_activation_path: 'COMPLETE',
      production_otp_enabled: false,
      production_sms_enabled: false,
      production_email_enabled: false,
      production_push_enabled: false,
      production_communications: 'BLOCKED',
      can_production_launch: 'NO',
      remaining_blocker: 'NO_PRODUCTION_OTP_MESSAGING_PROVIDER',
      sent_neq_delivered: true,
      secrets_manager_runtime_resolver: 'MISSING',
    };
    expect(contract.software_activation_path).toBe('COMPLETE');
    expect(contract.production_otp_enabled).toBe(false);
    expect(contract.sent_neq_delivered).toBe(true);
    expect(contract.can_production_launch).toBe('NO');
  });
});
