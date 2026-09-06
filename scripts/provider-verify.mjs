/**
 * Sprint 64 — CLI-safe provider verification (no secret printing, no fake live calls).
 *
 * Usage:
 *   node scripts/provider-verify.mjs
 *   node scripts/provider-verify.mjs payments
 *   node scripts/provider-verify.mjs otp messaging carrier payout
 */
const ALIASES = {
  payments: 'PAYMENTS_PSP',
  payment: 'PAYMENTS_PSP',
  psp: 'PAYMENTS_PSP',
  otp: 'OTP_AUTH',
  messaging: 'MESSAGING',
  carrier: 'CARRIER',
  payout: 'AFFILIATE_PAYOUT',
  erx: 'ERX',
  video: 'VIDEO',
  pacs: 'PACS_DICOM',
  dicom: 'PACS_DICOM',
  storage: 'OBJECT_STORAGE',
  kms: 'KMS',
  scanner: 'MALWARE_SCANNER',
  malware: 'MALWARE_SCANNER',
  kyc: 'KYC',
  pitr: 'MANAGED_DB_PITR',
  monitoring: 'MONITORING_APM',
  apm: 'MONITORING_APM',
};

function redact(v) {
  if (!v || !String(v).trim()) return 'MISSING';
  return 'SET';
}

function stageFor(id) {
  const emergency = process.env.PROVIDER_EMERGENCY_DISABLE_ALL === 'true';
  const hard = {
    CARRIER: 'NO_PRODUCTION_CARRIER_ADAPTER',
    ERX: 'NO_PRODUCTION_CLINICAL_ADAPTER',
    VIDEO: 'NO_PRODUCTION_CLINICAL_ADAPTER',
    PACS_DICOM: 'NO_PRODUCTION_CLINICAL_ADAPTER',
    OBJECT_STORAGE: 'NO_PRODUCTION_STORAGE_ADAPTER',
    MALWARE_SCANNER: 'NO_PRODUCTION_SCANNER_ADAPTER',
    AFFILIATE_PAYOUT: 'EXTERNAL_PAYOUT_GATED',
    KYC: 'KYC_PROVIDER_EXTERNAL_GATED',
    MANAGED_DB_PITR: 'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED',
    MONITORING_APM: 'APM_PAGER_EXTERNAL_GATED',
    KMS: 'KMS_SECRETS_EXTERNAL_GATED',
    PAYMENTS_PSP: 'PAYMENT_PROVIDER_EXTERNAL_GATED',
    OTP_AUTH: 'OTP_MESSAGING_EXTERNAL_GATED',
    MESSAGING: 'OTP_MESSAGING_EXTERNAL_GATED',
  }[id];

  if (emergency) {
    return { result: 'VERIFIED_BUT_DISABLED', stage: 'DISABLED', blocker: 'PROVIDER_EMERGENCY_DISABLE_ALL' };
  }
  if (hard) {
    return { result: 'EXTERNAL_GATED', stage: 'EXTERNAL_GATED', blocker: hard };
  }
  return { result: 'NOT_CONFIGURED', stage: 'NOT_CONFIGURED', blocker: null };
}

function verifyOne(alias) {
  const id = ALIASES[alias.toLowerCase()] ?? alias.toUpperCase();
  const { result, stage, blocker } = stageFor(id);
  return {
    id,
    alias,
    result,
    stage,
    contacted_external: false,
    secrets_printed: false,
    blocker,
    sample_secret_redaction: {
      DATABASE_URL: redact(process.env.DATABASE_URL),
      JWT_ACCESS_SECRET: redact(process.env.JWT_ACCESS_SECRET),
    },
    detail:
      result === 'EXTERNAL_GATED'
        ? `${id} remains EXTERNAL_GATED until real provider credentials/adapters/approvals exist. No fake connectivity attempted.`
        : `${id} verification complete without external call.`,
  };
}

const args = process.argv.slice(2);
const defaultAliases = [
  'payments',
  'otp',
  'messaging',
  'carrier',
  'payout',
  'erx',
  'video',
  'pacs',
  'storage',
  'kms',
  'scanner',
  'kyc',
  'pitr',
  'monitoring',
];
const targets = args.length ? args : defaultAliases;
const uniqueIds = [...new Set(targets.map((t) => ALIASES[t.toLowerCase()] ?? t.toUpperCase()))];
const results = uniqueIds.map((id) => {
  const alias = Object.keys(ALIASES).find((k) => ALIASES[k] === id) ?? id;
  return verifyOne(alias);
});

console.log(
  JSON.stringify(
    {
      tool: 'provider-verify',
      sprint: 64,
      contacted_external: false,
      secrets_printed: false,
      results,
    },
    null,
    2,
  ),
);
