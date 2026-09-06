/**
 * Sprint 64 — Provider activation stages (executable go-live framework).
 * Credentials present ≠ ENABLED. Never invent provider names.
 */
export type ProviderActivationStage =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED'
  | 'VERIFIED_BUT_DISABLED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED'
  | 'BLOCKED';

export type ProviderIntegrationId =
  | 'PAYMENTS_PSP'
  | 'OTP_AUTH'
  | 'MESSAGING'
  | 'CARRIER'
  | 'AFFILIATE_PAYOUT'
  | 'ERX'
  | 'VIDEO'
  | 'PACS_DICOM'
  | 'OBJECT_STORAGE'
  | 'KMS'
  | 'MALWARE_SCANNER'
  | 'KYC'
  | 'MANAGED_DB_PITR'
  | 'MONITORING_APM';

export type ProviderActivationContract = {
  id: ProviderIntegrationId;
  label: string;
  /** Never invent a vendor — NOT_SELECTED until ops records a real identifier. */
  provider_name: 'NOT_SELECTED' | string;
  dependency_type: string;
  adapter_boundary: string;
  environment_key: string;
  live_flag_key: string;
  required_config_keys: string[];
  config_validation: string;
  connectivity_test: string;
  health_check: string;
  sandbox_verification: string;
  production_verification: string;
  activation_flag: string;
  deactivation_procedure: string;
  rollback_behavior: string;
  failure_behavior: string;
  audit_event: string;
  security_requirements: string[];
  responsible_team: string;
  external_prerequisite: string;
  phase: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
};

/** Authoritative activation contracts — provider_name stays NOT_SELECTED until real selection. */
export const PROVIDER_ACTIVATION_CONTRACTS: ProviderActivationContract[] = [
  {
    id: 'PAYMENTS_PSP',
    label: 'Payments / PSP',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'PAYMENT_PROVIDER',
    adapter_boundary: 'payment/production-payment-gate + PaymentGateway adapters',
    environment_key: 'PAYMENT_ENVIRONMENT',
    live_flag_key: 'PAYMENT_LIVE_ENABLED',
    required_config_keys: [
      'PAYMENT_ENVIRONMENT',
      'PAYMENT_LIVE_ENABLED',
      'PAYMENT_GATEWAY_PRODUCTION_SECRET_REF',
      'PAYMENT_WEBHOOK_SECRET_REF',
      'PAYMENT_WEBHOOK_ENDPOINT_REF',
      'PAYMENT_PRODUCTION_COUNTRIES',
      'PAYMENT_PRODUCTION_CURRENCIES',
      'PAYMENT_RECONCILIATION_CONFIG_REF',
    ],
    config_validation:
      'validateProductionPspConfiguration + evaluateProductionPaymentAvailable + production-config-validator PAYMENT scope',
    connectivity_test: 'ops:provider-verify payments (masked; no live charge)',
    health_check: 'Admin payments gate + /health/ready runtime.dependencies',
    sandbox_verification: 'Mock PSP sandbox only when PAYMENT_ENVIRONMENT=sandbox',
    production_verification: 'R14-A human gates + webhook signature + merchant verification',
    activation_flag: 'PAYMENT_LIVE_ENABLED=true AND PAYMENT_ENVIRONMENT=production AND dependency VERIFIED/APPROVED',
    deactivation_procedure: 'Set PAYMENT_LIVE_ENABLED=false (emergency) or suspend country payments rail',
    rollback_behavior: 'Preserve payment_intents/orders; refuse new live captures; no sandbox fallback',
    failure_behavior: 'Fail closed — never mark paid without CAPTURED from configured provider path',
    audit_event: 'PROVIDER_ACTIVATION_PAYMENT',
    security_requirements: ['webhook HMAC', 'no secret logging', 'idempotent webhooks', 'no sandbox in production'],
    responsible_team: 'Payments / Platform + Finance ops',
    external_prerequisite: 'Merchant agreement, PSP account, webhook secrets, R14-A evidence',
    phase: 3,
  },
  {
    id: 'OTP_AUTH',
    label: 'OTP / Authentication messaging',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'OTP_PROVIDER',
    adapter_boundary: 'identity/production-otp-gate + OTP adapters',
    environment_key: 'COMMUNICATION_ENVIRONMENT',
    live_flag_key: 'OTP_LIVE_ENABLED',
    required_config_keys: [
      'COMMUNICATION_ENVIRONMENT',
      'OTP_LIVE_ENABLED',
      'OTP_PROVIDER_SECRET_REF',
      'OTP_PEPPER',
      'COMMUNICATION_PRODUCTION_COUNTRIES',
    ],
    config_validation: 'validateProductionMessagingConfiguration + evaluateProductionOtpAvailable',
    connectivity_test: 'ops:provider-verify otp (send probe only when explicitly authorized)',
    health_check: 'OTP gate status in Admin identity/reliability',
    sandbox_verification: 'Console/dev OTP when COMMUNICATION_ENVIRONMENT≠production',
    production_verification: 'Live vendor delivery receipt; AUTH_DEV_REVEAL_OTP must be false',
    activation_flag: 'OTP_LIVE_ENABLED=true AND communication environment production',
    deactivation_procedure: 'OTP_LIVE_ENABLED=false — stop claiming messages sent',
    rollback_behavior: 'Preserve challenges/sessions; no console OTP fallback in production',
    failure_behavior: 'Return provider unavailable; never log OTP codes',
    audit_event: 'PROVIDER_ACTIVATION_OTP',
    security_requirements: ['rate limits', 'pepper hashing', 'no OTP in logs', 'abuse protection'],
    responsible_team: 'Identity / Security',
    external_prerequisite: 'SMS/voice OTP vendor contract + sender IDs',
    phase: 2,
  },
  {
    id: 'MESSAGING',
    label: 'Transactional SMS / email / push',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'MESSAGING_PROVIDER',
    adapter_boundary: 'platform/production-messaging-gate',
    environment_key: 'COMMUNICATION_ENVIRONMENT',
    live_flag_key: 'COMMUNICATION_LIVE_ENABLED',
    required_config_keys: [
      'COMMUNICATION_ENVIRONMENT',
      'COMMUNICATION_LIVE_ENABLED',
      'SMS_PROVIDER_SECRET_REF',
      'SMS_SENDER_ORIGIN_REF',
      'EMAIL_PROVIDER_SECRET_REF',
      'EMAIL_SENDER_IDENTITY_REF',
      'EMAIL_SENDING_DOMAIN_REF',
      'COMMUNICATION_PRODUCTION_COUNTRIES',
    ],
    config_validation:
      'validateProductionMessagingConfiguration + evaluateProductionMessagingAvailable',
    connectivity_test: 'ops:provider-verify messaging',
    health_check: 'Notification ops + messaging gate',
    sandbox_verification: 'Console/sandbox adapters only',
    production_verification: 'Template approval + delivery status webhooks',
    activation_flag: 'COMMUNICATION_LIVE_ENABLED=true in production communication env',
    deactivation_procedure: 'COMMUNICATION_LIVE_ENABLED=false',
    rollback_behavior: 'Queue/hold notifications; do not fake delivery',
    failure_behavior: 'Mark dispatch failed; retry via outbox rules',
    audit_event: 'PROVIDER_ACTIVATION_MESSAGING',
    security_requirements: ['template allow-list', 'PII minimization in payloads'],
    responsible_team: 'Platform / Notifications',
    external_prerequisite: 'SMS/email vendor + templates + sender domains',
    phase: 2,
  },
  {
    id: 'CARRIER',
    label: 'Live carrier / logistics',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'CARRIER',
    adapter_boundary: 'logistics/production-logistics-gate (NO_PRODUCTION_CARRIER_ADAPTER until registered)',
    environment_key: 'LOGISTICS_ENVIRONMENT',
    live_flag_key: 'CARRIER_LIVE_ENABLED',
    required_config_keys: [
      'LOGISTICS_ENVIRONMENT',
      'CARRIER_LIVE_ENABLED',
      'CARRIER_PRODUCTION_SECRET_REF',
      'CARRIER_ACCOUNT_REF',
      'CARRIER_WEBHOOK_SECRET_REF',
      'CARRIER_WEBHOOK_ENDPOINT_REF',
      'CARRIER_PRODUCTION_COUNTRIES',
      'CARRIER_SERVICEABILITY_CONFIG_REF',
      'CARRIER_TRACKING_CONFIG_REF',
    ],
    config_validation:
      'validateProductionCarrierConfiguration + evaluateProductionLogisticsAvailable',
    connectivity_test: 'ops:provider-verify carrier',
    health_check: 'Admin logistics gate',
    sandbox_verification: 'Mock carrier only',
    production_verification: 'Create/track/cancel against live adapter + webhook idempotency',
    activation_flag: 'CARRIER_LIVE_ENABLED + production logistics env + registered live adapter',
    deactivation_procedure: 'CARRIER_LIVE_ENABLED=false — stop live shipment creation',
    rollback_behavior: 'Preserve existing shipments/tracking; no mock fallback in production',
    failure_behavior: 'Fail shipment create; retry/idempotent webhooks',
    audit_event: 'PROVIDER_ACTIVATION_CARRIER',
    security_requirements: ['webhook verify', 'separate sandbox vs production credentials'],
    responsible_team: 'Logistics ops',
    external_prerequisite: 'Carrier contract, account, serviceability zones, webhooks',
    phase: 4,
  },
  {
    id: 'AFFILIATE_PAYOUT',
    label: 'Affiliate / partner payout rail',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'PAYOUT_PROVIDER',
    adapter_boundary: 'finance EXTERNAL_PAYOUT_GATED (accrual ≠ execution)',
    environment_key: 'PAYMENT_ENVIRONMENT',
    live_flag_key: 'PAYOUT_LIVE_ENABLED',
    required_config_keys: ['PAYOUT_LIVE_ENABLED', 'payout provider secret refs'],
    config_validation: 'Finance surfaces remain EXTERNAL_PAYOUT_GATED until enabled',
    connectivity_test: 'ops:provider-verify payout',
    health_check: 'Admin finance payout gate',
    sandbox_verification: 'Sandbox payout simulation only; no bank movement',
    production_verification: 'Provider account + compliance + idempotent submit',
    activation_flag: 'PAYOUT_LIVE_ENABLED=true after explicit approval (default false)',
    deactivation_procedure: 'PAYOUT_LIVE_ENABLED=false — hold execution; keep accruals',
    rollback_behavior: 'Liabilities remain; do not mark bank-executed',
    failure_behavior: 'UNKNOWN/hold; never silent success',
    audit_event: 'PROVIDER_ACTIVATION_PAYOUT',
    security_requirements: ['dual control', 'idempotency keys', 'no fake PAID'],
    responsible_team: 'Finance / Compliance',
    external_prerequisite: 'Payout provider + KYC/AML + bank rails',
    phase: 5,
  },
  {
    id: 'ERX',
    label: 'eRx / electronic prescribing',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'ERX',
    adapter_boundary: 'healthcare/production-healthcare-gate + ErxRouter (sandbox adapter only today)',
    environment_key: 'HEALTHCARE_ENVIRONMENT',
    live_flag_key: 'HEALTHCARE_LIVE_ENABLED',
    required_config_keys: [
      'HEALTHCARE_ENVIRONMENT',
      'HEALTHCARE_LIVE_ENABLED',
      'ERX_PROVIDER_SECRET_REF',
      'ERX_NETWORK_ACCOUNT_REF',
      'ERX_ENDPOINT_REF',
      'ERX_CALLBACK_SECRET_REF',
      'ERX_MARKET_LEGAL_CONFIG_REF',
    ],
    config_validation:
      'validateProductionErxConfiguration + evaluateProductionHealthcareAvailable (ERX_PROVIDER)',
    connectivity_test: 'ops:provider-verify erx',
    health_check: 'Admin healthcare-network + doctor eRx gate',
    sandbox_verification: 'Sandbox adapter — not a legal prescription service',
    production_verification: 'Clinical + legal approval + live adapter registration',
    activation_flag: 'HEALTHCARE_LIVE_ENABLED + ERX dependency approved + live adapter',
    deactivation_procedure: 'Disable live eRx path; show unavailable; preserve records',
    rollback_behavior: 'No fabricated completion; clinical records retained',
    failure_behavior: 'EXTERNAL_GATED / unavailable UI',
    audit_event: 'PROVIDER_ACTIVATION_ERX',
    security_requirements: ['PHI boundaries', 'audit trail', 'no sandbox-as-live UI'],
    responsible_team: 'Clinical / Regulatory',
    external_prerequisite: 'eRx vendor + market regulatory approval',
    phase: 6,
  },
  {
    id: 'VIDEO',
    label: 'Telemedicine / clinical video',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'VIDEO',
    adapter_boundary: 'healthcare VIDEO_PROVIDER catalog EXTERNAL_GATED',
    environment_key: 'HEALTHCARE_ENVIRONMENT',
    live_flag_key: 'HEALTHCARE_LIVE_ENABLED',
    required_config_keys: [
      'HEALTHCARE_ENVIRONMENT',
      'HEALTHCARE_LIVE_ENABLED',
      'VIDEO_PROVIDER_SECRET_REF',
      'VIDEO_API_ENDPOINT_REF',
      'VIDEO_TOKEN_SIGNING_SECRET_REF',
      'VIDEO_CALLBACK_SECRET_REF',
      'VIDEO_MARKET_LEGAL_CONFIG_REF',
      'VIDEO_RECORDING_STORAGE_REF',
    ],
    config_validation:
      'validateProductionVideoConfiguration + evaluateProductionHealthcareAvailable (VIDEO_PROVIDER)',
    connectivity_test: 'ops:provider-verify video',
    health_check: 'Doctor/customer video gate honesty',
    sandbox_verification: 'Sandbox refs only — not clinical service claim',
    production_verification: 'Live video vendor + clinical policy',
    activation_flag: 'Live VIDEO dependency + healthcare live flag',
    deactivation_procedure: 'Disable live video; appointments remain; no fake sessions',
    rollback_behavior: 'Preserve appointment/clinical state',
    failure_behavior: 'Show unavailable / EXTERNAL_GATED',
    audit_event: 'PROVIDER_ACTIVATION_VIDEO',
    security_requirements: ['encrypted media', 'consent', 'PHI-safe logs'],
    responsible_team: 'Clinical / Platform',
    external_prerequisite: 'Video vendor + telemedicine approvals',
    phase: 6,
  },
  {
    id: 'PACS_DICOM',
    label: 'PACS / DICOM',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'PACS_DICOM',
    adapter_boundary: 'healthcare PACS/DICOM EXTERNAL_GATED — no production adapter',
    environment_key: 'HEALTHCARE_ENVIRONMENT',
    live_flag_key: 'HEALTHCARE_LIVE_ENABLED',
    required_config_keys: [
      'HEALTHCARE_ENVIRONMENT',
      'HEALTHCARE_LIVE_ENABLED',
      'PACS_PROVIDER_SECRET_REF',
      'PACS_DICOM_ENDPOINT_REF',
      'PACS_AE_TITLE_REF',
      'PACS_TLS_CERT_REF',
      'PACS_CALLBACK_SECRET_REF',
      'PACS_MARKET_LEGAL_CONFIG_REF',
      'PACS_VIEWER_CONFIG_REF',
    ],
    config_validation:
      'validateProductionPacsConfiguration + evaluateProductionHealthcareAvailable (PACS_DICOM)',
    connectivity_test: 'ops:provider-verify pacs',
    health_check: 'Imaging/radiologist EXTERNAL_GATED surfaces',
    sandbox_verification: 'No live PACS in sandbox claims',
    production_verification: 'PACS vendor + modality connectivity',
    activation_flag: 'Registered PACS adapter + approvals',
    deactivation_procedure: 'Disable live PACS fetch; preserve study metadata',
    rollback_behavior: 'No fabricated images/reports',
    failure_behavior: 'EXTERNAL_GATED',
    audit_event: 'PROVIDER_ACTIVATION_PACS',
    security_requirements: ['PHI', 'private network', 'access audit'],
    responsible_team: 'Imaging / Clinical IT',
    external_prerequisite: 'PACS contract + site connectivity',
    phase: 6,
  },
  {
    id: 'OBJECT_STORAGE',
    label: 'Production object storage',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'OBJECT_STORAGE',
    adapter_boundary: 'ops/production-storage-gate (no local disk in production)',
    environment_key: 'OBJECT_STORAGE_ENVIRONMENT',
    live_flag_key: 'OBJECT_STORAGE_LIVE_ENABLED',
    required_config_keys: [
      'OBJECT_STORAGE_ENVIRONMENT',
      'OBJECT_STORAGE_LIVE_ENABLED',
      'OBJECT_STORAGE_SECRET_REF',
      'OBJECT_STORAGE_BUCKET_REF',
      'OBJECT_STORAGE_REGION_REF',
    ],
    config_validation:
      'validateProductionStorageConfiguration + evaluateProductionStorageAvailable',
    connectivity_test: 'ops:provider-verify storage',
    health_check: '/health/ready infrastructure.storage',
    sandbox_verification: 'Local/dev storage allowed only outside production',
    production_verification: 'Private bucket + signed URL + encryption',
    activation_flag: 'OBJECT_STORAGE_LIVE_ENABLED in production storage env',
    deactivation_procedure: 'Disable live uploads; refuse local-disk fallback',
    rollback_behavior: 'Existing object keys retained in bucket',
    failure_behavior: 'Fail upload; never write PHI to local disk in production',
    audit_event: 'PROVIDER_ACTIVATION_STORAGE',
    security_requirements: ['private ACL', 'signed access', 'encryption at rest'],
    responsible_team: 'Platform / Security',
    external_prerequisite: 'Cloud bucket + IAM + encryption keys',
    phase: 1,
  },
  {
    id: 'KMS',
    label: 'KMS / secrets manager',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'KMS_SECRETS',
    adapter_boundary: 'infra production-config inventory kms_secrets',
    environment_key: 'INFRASTRUCTURE_ENVIRONMENT',
    live_flag_key: 'KMS_LIVE_ENABLED',
    required_config_keys: ['KMS_KEY_REF', 'SECRET_MANAGER_REF', 'KMS_LIVE_ENABLED'],
    config_validation:
      'validateProductionStorageConfiguration + production-config-validator STORAGE_KMS_SCANNER',
    connectivity_test: 'ops:provider-verify kms',
    health_check: '/health/ready infrastructure.kms_secrets',
    sandbox_verification: 'Env-file secrets in sandbox only',
    production_verification: 'Secret manager resolve + key encrypt/decrypt probe',
    activation_flag: 'KMS_LIVE_ENABLED + production infra',
    deactivation_procedure: 'Rotate/disable key access; freeze secret reads carefully',
    rollback_behavior: 'Previous key versions retained per cloud policy',
    failure_behavior: 'Fail closed on secret resolve',
    audit_event: 'PROVIDER_ACTIVATION_KMS',
    security_requirements: ['no plaintext secrets in logs', 'least privilege IAM'],
    responsible_team: 'Platform / Security',
    external_prerequisite: 'Cloud KMS + secret manager',
    phase: 1,
  },
  {
    id: 'MALWARE_SCANNER',
    label: 'Malware / file scanning',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'MALWARE_SCANNER',
    adapter_boundary: 'ops/production-file-scanning-gate',
    environment_key: 'FILE_SCANNING_ENVIRONMENT',
    live_flag_key: 'FILE_SCANNING_LIVE_ENABLED',
    required_config_keys: [
      'FILE_SCANNING_ENVIRONMENT',
      'FILE_SCANNING_LIVE_ENABLED',
      'MALWARE_SCANNER_ENDPOINT_REF',
      'MALWARE_SCANNER_SECRET_REF',
    ],
    config_validation:
      'validateProductionStorageConfiguration + evaluateProductionFileScanningAvailable',
    connectivity_test: 'ops:provider-verify scanner',
    health_check: '/health/ready infrastructure.malware_scanning',
    sandbox_verification: 'Scanner optional in sandbox',
    production_verification: 'AV endpoint health + sample EICAR in isolated drill',
    activation_flag: 'FILE_SCANNING_LIVE_ENABLED in production',
    deactivation_procedure: 'Disable uploads requiring scan or fail closed',
    rollback_behavior: 'Quarantine policy retained',
    failure_behavior: 'Reject unscanned sensitive uploads in production',
    audit_event: 'PROVIDER_ACTIVATION_SCANNER',
    security_requirements: ['quarantine', 'no execute of uploads'],
    responsible_team: 'Security',
    external_prerequisite: 'AV/malware scanning service',
    phase: 1,
  },
  {
    id: 'KYC',
    label: 'KYC / partner accreditation',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'KYC_PROVIDER',
    adapter_boundary: 'partner review workflows; live registry EXTERNAL_GATED',
    environment_key: 'INFRASTRUCTURE_ENVIRONMENT',
    live_flag_key: 'KYC_LIVE_ENABLED',
    required_config_keys: [
      'KYC_LIVE_ENABLED',
      'KYC_PROVIDER_SECRET_REF',
      'KYC_API_ENDPOINT_REF',
      'KYC_CALLBACK_SECRET_REF',
      'KYC_MARKET_POLICY_CONFIG_REF',
      'KYC_PARTNER_TYPE_CONFIG_REF',
      'KYC_HEALTHCARE_REGISTRY_CONFIG_REF',
    ],
    config_validation:
      'validateProductionKycConfiguration + release-gate OPERATIONAL_NETWORK / KYC',
    connectivity_test: 'ops:provider-verify kyc',
    health_check: 'Admin partners / healthcare-network',
    sandbox_verification: 'Manual partner review in sandbox',
    production_verification: 'Live KYC vendor + accreditation registries',
    activation_flag: 'KYC_LIVE_ENABLED after vendor + compliance approval',
    deactivation_procedure: 'KYC_LIVE_ENABLED=false — hold auto-approvals',
    rollback_behavior: 'Preserve partner application state',
    failure_behavior: 'Queue manual review / EXTERNAL_GATED',
    audit_event: 'PROVIDER_ACTIVATION_KYC',
    security_requirements: ['PII minimization', 'evidence retention policy'],
    responsible_team: 'Trust & Safety / Compliance',
    external_prerequisite: 'KYC vendor + accreditation sources',
    phase: 6,
  },
  {
    id: 'MANAGED_DB_PITR',
    label: 'Managed database / PITR',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'PITR_OFFSITE',
    adapter_boundary: 'ops/recovery-targets + backup scripts (sandbox) / managed cloud PITR',
    environment_key: 'INFRASTRUCTURE_ENVIRONMENT',
    live_flag_key: 'PITR_LIVE_ENABLED',
    required_config_keys: [
      'MANAGED_BACKUP_SECRET_REF',
      'MANAGED_BACKUP_DESTINATION_REF',
      'MANAGED_BACKUP_SCHEDULE_REF',
      'PITR_WAL_RETENTION_REF',
      'PITR_RESTORE_ENVIRONMENT_REF',
      'DR_ENVIRONMENT_REGION_REF',
    ],
    config_validation:
      'validateProductionBackupConfiguration — refs only; pg_dump ≠ managed PITR; RPO/RTO NOT_YET_PROVEN',
    connectivity_test: 'ops:provider-verify pitr (metadata only — no destructive prod restore)',
    health_check: '/health/ready infrastructure.pitr + Admin reliability Recovery',
    sandbox_verification: 'pnpm db:backup / db:restore disposable only',
    production_verification: 'Managed PITR + documented restore drill on disposable target',
    activation_flag: 'PITR_LIVE_ENABLED after successful restore drill evidence',
    deactivation_procedure: 'N/A for backups — freeze schema changes if restore compromised',
    rollback_behavior: 'PITR to last known good; record RPO/RTO actuals',
    failure_behavior: 'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED until proven',
    audit_event: 'PROVIDER_ACTIVATION_PITR',
    security_requirements: ['encrypted backups', 'off-site retention', 'access control'],
    responsible_team: 'Platform / DBA',
    external_prerequisite: 'Managed Postgres with WAL/PITR + off-site retention',
    phase: 0,
  },
  {
    id: 'MONITORING_APM',
    label: 'Monitoring / APM / pager',
    provider_name: 'NOT_SELECTED',
    dependency_type: 'OBSERVABILITY',
    adapter_boundary: '/metrics + structured logs SOFTWARE_READY; APM EXTERNAL_GATED',
    environment_key: 'INFRASTRUCTURE_ENVIRONMENT',
    live_flag_key: 'APM_LIVE_ENABLED',
    required_config_keys: [
      'APM_SECRET_REF',
      'APM_ENDPOINT_REF',
      'MONITORING_SECRET_REF',
      'ALERTING_SECRET_REF',
      'ALERT_DESTINATION_REF',
      'ALERT_ESCALATION_POLICY_REF',
    ],
    config_validation:
      'validateProductionObservabilityConfiguration — refs only; /metrics ≠ production APM; thresholds THRESHOLD_REQUIRES_PRODUCTION_BASELINE',
    connectivity_test: 'ops:provider-verify monitoring',
    health_check: '/metrics scrape + Admin reliability signals',
    sandbox_verification: 'Local metrics endpoint',
    production_verification: 'APM ingest + pager test page',
    activation_flag: 'APM_LIVE_ENABLED after vendor wiring',
    deactivation_procedure: 'APM_LIVE_ENABLED=false — keep /metrics',
    rollback_behavior: 'Logs retained locally/central per policy',
    failure_behavior: 'SOFTWARE_READY metrics remain; pager EXTERNAL_GATED',
    audit_event: 'PROVIDER_ACTIVATION_MONITORING',
    security_requirements: ['no secrets in traces', 'PII scrubbing'],
    responsible_team: 'Platform / SRE',
    external_prerequisite: 'APM + pager vendor',
    phase: 9,
  },
];

export function getProviderActivationContract(id: ProviderIntegrationId): ProviderActivationContract {
  const row = PROVIDER_ACTIVATION_CONTRACTS.find((c) => c.id === id);
  if (!row) {
    throw new Error(`Unknown provider integration: ${id}`);
  }
  return row;
}
