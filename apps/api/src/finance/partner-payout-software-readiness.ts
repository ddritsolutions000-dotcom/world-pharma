/**
 * Partner payout software readiness — gateway-agnostic.
 * Sandbox is fully usable now. Razorpay (or other) plugs in later via env; never invent live PAID.
 */
import {
  isLivePartnerPayoutReady,
  readPartnerPayoutProvider,
  readPartnerPayoutRuntimeConfig,
  canUseLiveAdapterCode,
} from './payout.config';
import { canEncryptBeneficiaries } from './beneficiary-crypto';

export type PartnerPayoutSoftwareReadiness = {
  phase: 'SANDBOX_READY_AWAITING_GATEWAY' | 'GATES_PARTIAL' | 'LIVE_READY';
  software_rail_complete: true;
  sandbox_withdraw_ready: true;
  wallet_scopes: Array<'LAB' | 'AFFILIATE' | 'DELIVERY' | 'DOCTOR'>;
  features_ready: {
    partner_wallet: true;
    bank_upi_required: true;
    masked_payout_accounts: true;
    encrypted_beneficiary_storage: boolean;
    async_live_withdraw_path: true;
    webhook_confirm_path: true;
    razorpayx_adapter_registered: true;
    mock_adapter_default: true;
    fail_closed_live_gates: true;
  };
  gateway: {
    selected: 'MOCK' | 'RAZORPAYX';
    connected: boolean;
    awaiting: 'GATEWAY_CREDENTIALS' | 'HUMAN_GATES' | 'NONE';
  };
  live_ready: boolean;
  remaining_blocker: string | null;
  plug_razorpay_later: string[];
  message: string;
};

export function evaluatePartnerPayoutSoftwareReadiness(): PartnerPayoutSoftwareReadiness {
  const cfg = readPartnerPayoutRuntimeConfig();
  const provider = readPartnerPayoutProvider();
  const live = isLivePartnerPayoutReady();
  const encryptReady = canEncryptBeneficiaries();
  const connected = canUseLiveAdapterCode(cfg.adapter_code);

  let awaiting: PartnerPayoutSoftwareReadiness['gateway']['awaiting'] = 'NONE';
  if (!connected) awaiting = 'GATEWAY_CREDENTIALS';
  else if (!live) awaiting = 'HUMAN_GATES';

  const phase: PartnerPayoutSoftwareReadiness['phase'] = live
    ? 'LIVE_READY'
    : connected
      ? 'GATES_PARTIAL'
      : 'SANDBOX_READY_AWAITING_GATEWAY';

  return {
    phase,
    software_rail_complete: true,
    sandbox_withdraw_ready: true,
    wallet_scopes: ['LAB', 'AFFILIATE', 'DELIVERY', 'DOCTOR'],
    features_ready: {
      partner_wallet: true,
      bank_upi_required: true,
      masked_payout_accounts: true,
      encrypted_beneficiary_storage: encryptReady,
      async_live_withdraw_path: true,
      webhook_confirm_path: true,
      razorpayx_adapter_registered: true,
      mock_adapter_default: true,
      fail_closed_live_gates: true,
    },
    gateway: {
      selected: provider,
      connected,
      awaiting,
    },
    live_ready: live,
    remaining_blocker: cfg.remaining_blocker,
    plug_razorpay_later: [
      '1. Create RazorpayX account + source account number',
      '2. Set PAYOUT_PROVIDER=RAZORPAYX',
      '3. Set RAZORPAYX_KEY_ID / RAZORPAYX_KEY_SECRET / RAZORPAYX_ACCOUNT_NUMBER',
      '4. Set RAZORPAYX_WEBHOOK_SECRET and point webhook to POST /api/v1/finance/payouts/webhook',
      '5. Set PAYOUT_BENEFICIARY_ENCRYPTION_KEY (partners re-save bank/UPI once)',
      '6. Attest: PAYOUT_LEGAL_ATTESTED, PAYOUT_KYC_ATTESTED, PAYOUT_DUAL_CONTROL_ATTESTED',
      '7. PROVIDER_APPROVED_AFFILIATE_PAYOUT=true',
      '8. PAYMENT_ENVIRONMENT=production + PAYOUT_LIVE_ENABLED=true',
      '9. Withdraw stays PROCESSING until Razorpay webhook confirms PAID',
    ],
    message:
      phase === 'LIVE_READY'
        ? 'Live payout gates clear. Provider webhook confirms PAID.'
        : phase === 'GATES_PARTIAL'
          ? 'Gateway credentials seen; finish human/legal/KYC/dual-control gates before PAYOUT_LIVE_ENABLED.'
          : 'No gateway connected. Sandbox wallet + withdraw ready for all partners. Plug Razorpay later — software rail is complete.',
  };
}
