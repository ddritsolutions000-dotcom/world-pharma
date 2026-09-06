/**
 * Partner-side platform fee (company take). Distinct from customer checkout
 * `commerce.platform_fee_bps` surcharge in cart.
 *
 * Product rule (`PLATFORM_FEE_POLICY`):
 * - Affiliate marketing commission → separate affiliate wallet line (do not fee again here).
 * - Gateway, ops, margin, listing, non-affiliate marketing → bundled into this platform fee.
 * - Partner receives net = gross − platform fee.
 */

export const PLATFORM_FEE_POLICY = {
  company_must_not_lose: true,
  affiliate_marketing_separate: true,
  bundle_into_platform_fee: [
    'payment_gateway',
    'platform_margin',
    'ops',
    'listing',
    'non_affiliate_marketing',
  ] as const,
  partner_receives: 'net_after_platform_fee',
  self_withdraw: true,
} as const;

/** 1mg-like marketplace defaults (bps). Super Admin overrides via policy pack commerce. */
export const DEFAULT_PARTNER_PLATFORM_FEE_BPS = {
  doctor: 1500, // 15%
  lab: 2000, // 20%
  delivery: 1500, // 15%
  pharmacy: 1800, // 18% — CommercialRule may override per seller
} as const;

export type PartnerFeeVertical = keyof typeof DEFAULT_PARTNER_PLATFORM_FEE_BPS;

export type PartnerFeeCommerce = {
  doctor_platform_fee_bps?: number;
  lab_platform_fee_bps?: number;
  delivery_platform_fee_bps?: number;
  pharmacy_platform_fee_bps?: number;
  partner_platform_fee_flat_minor?: number;
};

export type PartnerNetBreakdown = {
  grossMinor: bigint;
  platformFeeBps: number;
  platformFeeFlatMinor: bigint;
  platformFeeMinor: bigint;
  affiliateCommissionMinor: bigint;
  netMinor: bigint;
};

export function resolvePartnerPlatformFeeBps(
  vertical: PartnerFeeVertical,
  commerce?: PartnerFeeCommerce | null,
): number {
  const fromPack =
    vertical === 'doctor'
      ? commerce?.doctor_platform_fee_bps
      : vertical === 'lab'
        ? commerce?.lab_platform_fee_bps
        : vertical === 'delivery'
          ? commerce?.delivery_platform_fee_bps
          : commerce?.pharmacy_platform_fee_bps;
  if (typeof fromPack === 'number' && Number.isFinite(fromPack)) {
    return Math.min(10_000, Math.max(0, Math.trunc(fromPack)));
  }
  return DEFAULT_PARTNER_PLATFORM_FEE_BPS[vertical];
}

/**
 * Net payable to partner after bundled platform fee.
 * Affiliate commission is informational / company allocation — not double-deducted unless
 * `affiliateCommissionMinor` is passed (when product attributes it against the same gross).
 */
export function computePartnerNet(input: {
  grossMinor: bigint;
  platformFeeBps: number;
  platformFeeFlatMinor?: bigint | number;
  /** When attributed on the same gross; capped so net never goes negative. */
  affiliateCommissionMinor?: bigint | number;
}): PartnerNetBreakdown {
  const gross = input.grossMinor < 0n ? 0n : input.grossMinor;
  const bps = Math.min(10_000, Math.max(0, Math.trunc(input.platformFeeBps)));
  const flat = BigInt(input.platformFeeFlatMinor ?? 0);
  const affiliateRaw = BigInt(input.affiliateCommissionMinor ?? 0);
  const affiliate = affiliateRaw < 0n ? 0n : affiliateRaw;

  let platformFee = gross > 0n ? (gross * BigInt(bps)) / 10_000n + flat : flat;
  if (platformFee < 0n) {
    platformFee = 0n;
  }
  // Company must not lose: platform fee covers at least attributed affiliate on this line.
  if (affiliate > 0n && platformFee < affiliate) {
    platformFee = affiliate;
  }
  if (platformFee > gross) {
    platformFee = gross;
  }
  const net = gross - platformFee;
  return {
    grossMinor: gross,
    platformFeeBps: bps,
    platformFeeFlatMinor: flat,
    platformFeeMinor: platformFee,
    affiliateCommissionMinor: affiliate,
    netMinor: net < 0n ? 0n : net,
  };
}

export function partnerNetLedgerNote(vertical: string, breakdown: PartnerNetBreakdown): string {
  return `${vertical} net after platform fee ${breakdown.platformFeeMinor.toString()} (${breakdown.platformFeeBps} bps); gross ${breakdown.grossMinor.toString()}`;
}
