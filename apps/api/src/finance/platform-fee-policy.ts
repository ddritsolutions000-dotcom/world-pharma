/**
 * World Pharma commercial fee policy (product rule) — re-export implementation module.
 * Prefer importing from `./partner-platform-fee` in new code.
 */
export {
  PLATFORM_FEE_POLICY,
  DEFAULT_PARTNER_PLATFORM_FEE_BPS,
  computePartnerNet,
  resolvePartnerPlatformFeeBps,
  partnerNetLedgerNote,
  type PartnerFeeVertical,
  type PartnerFeeCommerce,
  type PartnerNetBreakdown,
} from './partner-platform-fee';
