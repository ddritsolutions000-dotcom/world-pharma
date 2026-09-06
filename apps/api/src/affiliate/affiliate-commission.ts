/** Policy-driven affiliate commission preview (sandbox-safe; not a payout execution). */
export function computeAffiliateCommissionPreview(input: {
  baseMinor: bigint;
  commissionBps: number;
  clinical: boolean;
  clinicalCategoriesAllowed: boolean;
  hasActiveCode: boolean;
  selfReferral: boolean;
}): {
  preview_minor: string;
  clinical_blocked: boolean;
  payable: boolean;
} {
  const clinicalBlocked = input.clinical && !input.clinicalCategoriesAllowed;
  if (!input.hasActiveCode || clinicalBlocked || input.selfReferral || input.commissionBps <= 0) {
    return {
      preview_minor: '0',
      clinical_blocked: clinicalBlocked || input.selfReferral,
      payable: false,
    };
  }
  const base = input.baseMinor > 0n ? input.baseMinor : 0n;
  const preview = (base * BigInt(input.commissionBps)) / 10000n;
  return {
    preview_minor: preview.toString(),
    clinical_blocked: false,
    payable: preview > 0n,
  };
}
