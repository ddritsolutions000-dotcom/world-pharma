import { adminApiRoot, adminAuthHeaders } from './admin-http';

export type ProviderActivationRow = {
  id: string;
  label: string;
  provider_name: string;
  environment: string;
  stage: string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  blocked: boolean;
  external_dependency: boolean;
  live_flag: boolean;
  emergency_disabled: boolean;
  verification: string;
  config_present: Array<{ key: string; secret_present: string }>;
  owner: string;
  external_blocker: string | null;
  next_action: string;
  phase: number;
  activation_is_ops_manual: boolean;
  message: string;
};

export type ProviderActivationMatrix = {
  evaluated_at: string;
  overall_any_live_enabled: boolean;
  production_launch_ready: false;
  decision: string;
  rows: ProviderActivationRow[];
  sequence_phases: Array<{ phase: number; label: string; entry: string; exit: string }>;
  psp_first_onboarding?: {
    provider: string;
    environment: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: boolean;
    production: string;
    webhook: string;
    remaining_blocker: string;
    next_action: string;
    real_psp_available: boolean;
    message: string;
    enablement_guard?: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  };
};

export function fetchPspOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    provider: string;
    environment: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: boolean | string;
    sandbox_status?: string;
    production: string;
    webhook: string;
    remaining_blocker: string;
    remaining_blockers?: string[];
    next_action: string;
    real_psp_available: boolean;
    message: string;
    refund: string;
    settlement_payout: string;
    reconciliation?: string;
    country_support?: string;
    currency_support?: string;
    sandbox_payment?: string;
    production_payment?: string;
    idempotency?: string;
    activation_stage?: string;
    activation_lifecycle?: string;
    force_launch_available?: boolean;
    configuration_readiness?: {
      provider: string;
      environment: string;
      configuration: string;
      webhook: string;
      markets: string;
      currencies: string;
      reconciliation: string;
      production_activation: string;
    };
    configuration_validation?: {
      provider_selected: boolean;
      provider_name: string;
      blockers: string[];
      ready_for_activation: boolean;
      secrets_exposed: boolean;
      credential_reference?: { reference_present: boolean; configured: boolean };
      webhook_secret_reference?: { reference_present: boolean; configured: boolean };
    };
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  }>(token, '/api/v1/admin/control-plane/psp-onboarding');
}

export function fetchRealPspActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    provider: string;
    real_psp_selected?: boolean;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: string;
    production: string;
    sandbox_payment?: string;
    production_payment?: string;
    webhook?: string;
    refund?: string;
    reconciliation?: string;
    settlement_payout?: string;
    ready_for_activation?: boolean;
    real_money_processed?: boolean;
    production_psp_enabled?: boolean;
    configuration_readiness?: {
      provider: string;
      environment: string;
      configuration: string;
      webhook: string;
      markets: string;
      currencies: string;
      reconciliation: string;
      production_activation: string;
    };
    checklist?: Array<{ id: string; label: string; mandatory: boolean; status: string }>;
    markets?: Array<{ market: string; lifecycle: string; production: string; blocker: string }>;
    mismatch_catalog?: Array<{ code: string; description: string }>;
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    control_plane?: string;
    foundation_plane?: string;
    s88_plane?: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    country_policy?: {
      status: string;
      markets_supported_for_evaluation?: string[];
    };
  }>(token, '/api/v1/admin/control-plane/production-psp-real-activation-onboarding');
}

export function fetchRealMessagingActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    real_otp_provider_selected?: boolean;
    real_sms_provider_selected?: boolean;
    real_email_provider_selected?: boolean;
    real_push_provider_selected?: boolean;
    production_otp_enabled?: boolean;
    production_sms_enabled?: boolean;
    production_email_enabled?: boolean;
    production_push_enabled?: boolean;
    real_messages_sent?: boolean;
    ready_for_activation?: boolean;
    enabled?: boolean;
    sandbox: string;
    production: string;
    rails?: Array<{
      rail: string;
      provider_selected: boolean;
      lifecycle: string;
      sandbox: string;
      production: string;
      enabled: boolean;
      configuration_readiness: string;
      credentials_readiness: string;
      sender_domain_readiness: string;
      delivery_capability: string;
      compliance_status: string;
      blocker: string;
      next_action: string;
    }>;
    checklist?: Array<{
      id: string;
      rail: string;
      label: string;
      mandatory: boolean;
      status: string;
    }>;
    otp_security?: {
      auth_dev_reveal_otp_production: string;
      auth_dev_reveal_otp_current_safe: boolean;
      expiry_enforced: boolean;
      attempt_limits: boolean;
      never_logged_in_production: boolean;
    };
    notification_state_machine?: {
      delivered_requires_provider_receipt: boolean;
      accepted_by_provider_state: string;
      delivered_to_user_state: string;
    };
    sent_vs_delivered?: {
      sent: string;
      delivered: string;
      never_fake_delivered_without_receipt: boolean;
    };
    outbox_idempotency?: {
      occurrence_keys: string;
      duplicate_event_safe: boolean;
      retry_safe: boolean;
    };
    phi_minimization?: {
      templates_avoid_unnecessary_phi: boolean;
      prefer_authenticated_deep_links: boolean;
    };
    country_policy?: {
      status: string;
      hardcoded_market: boolean;
      markets_supported_for_evaluation?: string[];
    };
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    control_plane?: string;
    foundation_plane?: string;
    s89_plane?: string;
    native_device?: string;
    native_android?: string;
    native_ios?: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    otp_codes_logged?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-messaging-real-activation-onboarding');
}

export function fetchMessagingOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    real_provider_available: boolean;
    environment: string;
    live_flag: boolean;
    remaining_blocker?: string;
    remaining_blockers?: string[];
    message: string;
    next_action: string;
    native_device: string;
    android?: string;
    ios?: string;
    sandbox_authentication?: string;
    production_authentication?: string;
    otp_activation_stage: string;
    messaging_activation_stage: string;
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
    otp_security?: {
      auth_dev_reveal_otp_production: string;
      auth_dev_reveal_otp_current_safe: boolean;
      expiry_enforced: boolean;
      attempt_limits: boolean;
    };
    notification_state_machine?: {
      delivered_requires_provider_receipt: boolean;
      accepted_by_provider_state: string;
      delivered_to_user_state: string;
    };
    consent?: {
      security_auth_independent_of_marketing: boolean;
      transactional_independent_of_marketing: boolean;
    };
    country_policy?: {
      status: string;
      hardcoded_market: boolean;
      markets_supported_for_evaluation?: string[];
    };
    force_launch_available?: boolean;
    configuration_validation?: {
      ready_for_activation: boolean;
      secrets_exposed: boolean;
      blockers: string[];
      otp_readiness?: {
        provider: string;
        configuration: string;
        credential: string;
        sender_or_origin: string;
        domain: string;
        countries: string;
        production: string;
        device: string;
      };
      sms_readiness?: {
        provider: string;
        configuration: string;
        credential: string;
        sender_or_origin: string;
        domain: string;
        countries: string;
        production: string;
        device: string;
      };
      email_readiness?: {
        provider: string;
        configuration: string;
        credential: string;
        sender_or_origin: string;
        domain: string;
        countries: string;
        production: string;
        device: string;
      };
      push_readiness?: {
        provider: string;
        configuration: string;
        credential: string;
        sender_or_origin: string;
        domain: string;
        countries: string;
        production: string;
        device: string;
      };
    };
    channels: Array<{
      channel: string;
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      sandbox: string;
      production: string;
      webhook_callback: string;
      remaining_blocker: string;
      status: string;
      activation_stage?: string;
    }>;
  }>(token, '/api/v1/admin/control-plane/messaging-onboarding');
}

export function fetchCarrierOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    provider: string;
    environment: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    validation_status: string;
    activation_lifecycle?: string;
    sandbox: string;
    production: string;
    webhook: string;
    serviceability: string;
    tracking: string;
    shipment_creation?: string;
    returns?: string;
    shipping_cost?: string;
    pod: string;
    native_device: string;
    real_carrier_available: boolean;
    activation_stage: string;
    remaining_blocker: string;
    remaining_blockers?: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    country_policy?: {
      status: string;
      hardcoded_market: boolean;
      markets_supported_for_evaluation?: string[];
    };
    configuration_validation?: {
      ready_for_activation: boolean;
      secrets_exposed: boolean;
      blockers: string[];
      configuration_readiness?: {
        provider: string;
        environment: string;
        configuration: string;
        webhook: string;
        markets: string;
        serviceability: string;
        tracking: string;
        shipment_capability: string;
        pod_capability: string;
        returns_rto: string;
        production_activation: string;
      };
    };
    shipment_lifecycle?: { success_path: string[]; shipment_creation: string };
    tracking_events?: { duplicate_event_safe: boolean };
    webhook_security?: { unsigned_fail_closed: boolean; status: string };
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  }>(token, '/api/v1/admin/control-plane/carrier-onboarding');
}

export function fetchRealCarrierActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    provider: string;
    real_carrier_selected?: boolean;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: string;
    production: string;
    sandbox_shipment?: string;
    production_shipment?: string;
    webhook?: string;
    serviceability?: string;
    tracking?: string;
    returns_rto?: string;
    pod?: string;
    cancellation?: string;
    ready_for_activation?: boolean;
    real_shipment_created?: boolean;
    production_carrier_enabled?: boolean;
    configuration_readiness?: {
      provider: string;
      environment: string;
      configuration: string;
      webhook: string;
      markets: string;
      serviceability: string;
      tracking: string;
      shipment_capability: string;
      pod_capability: string;
      returns_rto: string;
      production_activation: string;
    };
    checklist?: Array<{ id: string; label: string; mandatory: boolean; status: string }>;
    markets?: Array<{
      market: string;
      lifecycle: string;
      production: string;
      blocker: string;
      cross_border_medicine?: string;
    }>;
    shipment_lifecycle?: { success_path: string[]; shipment_creation: string };
    tracking_events?: { duplicate_event_safe: boolean; terminal_overwrite_forbidden: boolean };
    webhook_security?: { unsigned_fail_closed: boolean; status: string };
    outbox_idempotency?: { duplicate_shipment_prevented: boolean; duplicate_webhook_safe: boolean };
    cross_border?: {
      medicine_import: string;
      never_declare_legal_availability_from_software_alone: boolean;
    };
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    control_plane?: string;
    foundation_plane?: string;
    s90_plane?: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    native_rider?: string;
    country_policy?: {
      status: string;
      markets_supported_for_evaluation?: string[];
    };
  }>(token, '/api/v1/admin/control-plane/production-carrier-real-activation-onboarding');
}

export function fetchErxOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    provider: string;
    environment: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    validation_status: string;
    activation_lifecycle?: string;
    activation_stage?: string;
    sandbox: string;
    production: string;
    transmission: string;
    webhook: string;
    country_support: string;
    legal_clinical_gate: string;
    controlled_substances: string;
    pharmacy_network: string;
    internal_vs_legal: string;
    real_erx_available: boolean;
    remaining_blocker: string;
    remaining_blockers?: string[];
    related_clinical_blocker?: string;
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    country_policy?: {
      status: string;
      hardcoded_market: boolean;
      markets_supported_for_evaluation?: string[];
    };
    configuration_validation?: {
      ready_for_activation: boolean;
      secrets_exposed: boolean;
      phi_exposed: boolean;
      blockers: string[];
      configuration_readiness?: {
        provider: string;
        environment: string;
        configuration: string;
        credentials: string;
        network_account: string;
        endpoint: string;
        callback: string;
        markets_legal: string;
        prescriber_readiness: string;
        pharmacy_network: string;
        transmission: string;
        production_activation: string;
      };
    };
    prescription_lifecycle?: {
      success_path: string[];
      idempotent_submission: boolean;
      issued_not_equal_legally_transmitted?: boolean;
    };
    permission_model?: { tenant_isolation: boolean };
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  }>(token, '/api/v1/admin/control-plane/erx-onboarding');
}

export function fetchVideoOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    provider: string;
    environment: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    validation_status: string;
    activation_lifecycle?: string;
    activation_stage?: string;
    sandbox: string;
    production: string;
    session_creation: string;
    live_session: string;
    participant_authorization: string;
    consent: string;
    recording: string;
    webhook: string;
    country_support: string;
    legal_clinical_gate: string;
    appointment_vs_video: string;
    real_video_available: boolean;
    livekit_refs_present: boolean;
    remaining_blocker: string;
    remaining_blockers?: string[];
    related_clinical_blocker?: string;
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    configuration_validation?: {
      configuration_readiness?: {
        provider?: string;
        environment?: string;
        configuration?: string;
        credentials?: string;
        session_capability?: string;
        recording?: string;
        markets_legal?: string;
        production_activation?: string;
      };
    };
    webhook_security?: { status: string };
    country_policy?: {
      markets_supported_for_evaluation?: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    };
    session_lifecycle?: {
      success_path: string[];
      idempotent_start_end: boolean;
      session_created_not_equal_consultation_completed?: boolean;
    };
    token_security?: { never_log_tokens: boolean };
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  }>(token, '/api/v1/admin/control-plane/video-onboarding');
}

export function fetchPacsOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    provider: string;
    environment: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    validation_status: string;
    activation_lifecycle?: string;
    activation_stage?: string;
    sandbox: string;
    production: string;
    transmission: string;
    viewer: string;
    country_support: string;
    legal_clinical_gate: string;
    storage_requirement: string;
    object_storage: string;
    kms_encryption: string;
    malware_scan?: string;
    webhook?: string;
    real_pacs_available: boolean;
    remaining_blocker: string;
    remaining_blockers?: string[];
    related_adapter_blocker?: string;
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    configuration_validation?: {
      configuration_readiness?: {
        provider?: string;
        environment?: string;
        configuration?: string;
        credentials?: string;
        dicom_endpoint?: string;
        ae_title?: string;
        tls_certificate?: string;
        markets_legal?: string;
        modality_support?: string;
        transmission?: string;
        viewer?: string;
        storage?: string;
        kms?: string;
        malware_scanning?: string;
        production_activation?: string;
      };
    };
    webhook_security?: { status: string };
    country_policy?: {
      markets_supported_for_evaluation?: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    };
    study_state_machine?: {
      success_path: string[];
      idempotent_ingest: boolean;
      report_not_equal_diagnostic_viewer?: boolean;
    };
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  }>(token, '/api/v1/admin/control-plane/pacs-onboarding');
}

export function fetchAffiliatePayoutOnboarding(token: string) {
  return fetchJson<{
    provider: string;
    environment: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    validation_status: string;
    sandbox: string;
    production: string;
    payout_status: string;
    beneficiary_verification: string;
    kyc_gate: string;
    country_support: string;
    currency_support: string;
    legal_financial_gate: string;
    double_payout_protection: string;
    ledger_protection: string;
    real_payout_available: boolean;
    remaining_blocker: string;
    next_action: string;
    message: string;
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  }>(token, '/api/v1/admin/control-plane/affiliate-payout-onboarding');
}

export function fetchKycOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    provider: string;
    environment: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    validation_status: string;
    activation_lifecycle?: string;
    activation_stage?: string;
    sandbox: string;
    production: string;
    verification_status: string;
    identity_verification: string;
    business_verification: string;
    professional_credential_verification: string;
    beneficiary_verification: string;
    country_support: string;
    legal_compliance_gate: string;
    document_lifecycle: string;
    expiry_renewal: string;
    webhook?: string;
    object_storage: string;
    kms_encryption: string;
    malware_scan: string;
    phi_separation: string;
    approval_vs_verification: string;
    real_kyc_available: boolean;
    remaining_blocker: string;
    remaining_blockers?: string[];
    related_adapter_blocker?: string;
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    configuration_validation?: {
      configuration_readiness?: {
        provider?: string;
        environment?: string;
        configuration?: string;
        credentials?: string;
        markets?: string;
        partner_types?: string;
        verification_capability?: string;
        webhook?: string;
        storage?: string;
        kms?: string;
        malware_scanning?: string;
        production_activation?: string;
      };
    };
    webhook_security?: { status: string };
    country_policy?: {
      markets_supported_for_evaluation?: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    };
    verification_lifecycle?: {
      case_success_path: string[];
      document_success_path: string[];
      idempotent_submission: boolean;
      document_verified_not_equal_partner_approved?: boolean;
    };
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  }>(token, '/api/v1/admin/control-plane/kyc-onboarding');
}

export function fetchRealKycActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    provider: string;
    real_kyc_provider_selected?: boolean;
    real_healthcare_registry_connected?: boolean;
    real_partner_production_verified?: boolean;
    production_privilege_enabled?: boolean;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: string;
    production: string;
    sandbox_manual_review?: string;
    production_verification?: string;
    ready_for_activation?: boolean;
    production_kyc_enabled?: boolean;
    runtime_adapter?: string;
    configuration_readiness?: {
      provider: string;
      environment: string;
      configuration: string;
      credentials: string;
      markets: string;
      partner_types: string;
      verification_capability: string;
      storage: string;
      kms: string;
      malware_scanning: string;
      production_activation: string;
    };
    checklist?: Array<{ id: string; label: string; mandatory: boolean; status: string }>;
    markets?: Array<{
      market: string;
      lifecycle: string;
      production: string;
      blocker: string;
      healthcare_verification?: string;
    }>;
    partner_type_gates?: Array<{
      partner_type: string;
      production_privilege: string;
      healthcare_distinct_from_business_kyc: boolean;
      blocker: string;
    }>;
    document_lifecycle?: {
      statuses: string[];
      document_verified_not_equal_partner_approved: boolean;
      partner_approved_not_equal_production_enabled: boolean;
    };
    remaining_blocker: string;
    remaining_blockers: string[];
    related_adapter_blocker?: string;
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    control_plane?: string;
    foundation_plane?: string;
    s94_plane?: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    pii_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-kyc-real-activation-onboarding');
}

export function fetchProductionStorageOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    environment: string;
    activation_lifecycle?: string;
    force_launch_available?: boolean;
    object_storage: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      validation_status: string;
      activation_lifecycle?: string;
      activation_stage?: string;
      sandbox: string;
      production: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      private_access: string;
      signed_url_access: string;
    };
    kms: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      validation_status: string;
      sandbox: string;
      production: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      encryption_at_rest: string;
      key_rotation: string;
    };
    malware_scanning: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      validation_status: string;
      sandbox: string;
      production: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      scan_lifecycle: string;
    };
    malware_scan_state_machine?: {
      success_path: string[];
      never_trust_unscanned: boolean;
      idempotent_scan_events: boolean;
      scanner_failure_not_clean?: boolean;
    };
    configuration_validation?: {
      configuration_readiness?: {
        environment?: string;
        private_storage?: {
          provider?: string;
          configuration?: string;
          credentials?: string;
          bucket?: string;
          private_access?: string;
          production_activation?: string;
        };
        kms?: {
          provider?: string;
          configuration?: string;
          key_reference?: string;
          rotation?: string;
          production_activation?: string;
        };
        malware_scanner?: {
          provider?: string;
          configuration?: string;
          endpoint?: string;
          scan_capability?: string;
          failure_behavior?: string;
          production_activation?: string;
        };
      };
    };
    country_policy?: {
      markets_supported_for_evaluation?: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    };
    retention: string;
    backup_pitr_dependency: string;
    data_residency: string;
    legal_privacy_gate: string;
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    real_object_storage_available: boolean;
    real_kms_available: boolean;
    real_malware_scanner_available: boolean;
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
  }>(token, '/api/v1/admin/control-plane/production-storage-onboarding');
}

export function fetchRealStorageActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    real_object_storage_provider_selected?: boolean;
    production_object_storage_enabled?: boolean;
    real_kms_provider_selected?: boolean;
    production_kms_enabled?: boolean;
    real_malware_scanner_selected?: boolean;
    production_malware_scanning_enabled?: boolean;
    private_storage_verified?: string;
    production_local_disk_fallback_possible?: boolean;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    ready_for_activation?: boolean;
    sandbox: string;
    production: string;
    rails?: Array<{
      rail: string;
      provider: string;
      real_provider_selected: boolean;
      production_enabled: boolean;
      lifecycle: string;
      sandbox: string;
      production: string;
      blocker: string;
    }>;
    checklist?: Array<{ id: string; label: string; mandatory: boolean; status: string }>;
    markets?: Array<{
      market: string;
      lifecycle: string;
      production: string;
      blocker: string;
      retention?: string;
    }>;
    malware_lifecycle?: {
      success_path: string[];
      exception_states: string[];
      unscanned_not_available: boolean;
      infected_blocked: boolean;
      scanner_failure_not_clean: boolean;
      sandbox_scanner: string;
      production_scanner: string;
    };
    security_controls?: {
      no_anonymous_private_access: boolean;
      never_fallback_to_local_disk: boolean;
      secrets_never_displayed: boolean;
    };
    configuration_readiness?: {
      private_storage?: { provider?: string; configuration?: string; credentials?: string };
      kms?: { provider?: string; key_reference?: string };
      malware_scanner?: { provider?: string; endpoint?: string };
    };
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    control_plane?: string;
    foundation_plane?: string;
    s95_plane?: string;
    runtime_adapters?: {
      object_storage: string;
      kms: string;
      malware_scanner: string;
    };
    evaluated_at?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-storage-real-activation-onboarding');
}

export function fetchProductionBackupOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    environment: string;
    activation_lifecycle?: string;
    force_launch_available?: boolean;
    backup: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      validation_status: string;
      activation_lifecycle?: string;
      sandbox: string;
      production: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      database_backup: string;
      encryption: string;
      retention: string;
      schedule?: string;
    };
    pitr: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      activation_lifecycle?: string;
      sandbox: string;
      production: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      wal_retention?: string;
      point_in_time?: string;
      database_backup_not_pitr?: boolean;
    };
    dr_environment?: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      activation_lifecycle?: string;
      sandbox: string;
      production: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      region?: string;
      object_storage_dependency?: string;
      kms_dependency?: string;
      monitoring_dependency?: string;
      production_class_restore?: string;
    };
    restore: {
      sandbox: string;
      production: string;
      drill: {
        status: string;
        restore_elapsed_ms: number | null;
        table_count: number | null;
        note: string;
      };
      sandbox_restore_does_not_prove_production_rto?: boolean;
    };
    rpo: { target: string; status: string; achievement: string; evidence_class?: string };
    rto: { target: string; status: string; achievement: string; evidence_class?: string };
    object_recovery: string;
    kms_encryption_dependency: string;
    malware_scan_dependency?: string;
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    real_managed_backup_available: boolean;
    real_pitr_available?: boolean;
    real_dr_environment_available?: boolean;
    storage_dependency_sprint?: number;
    dr_runbook?: { source: string; steps: string[]; production_class_restore: string };
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
    configuration_validation?: {
      ready_for_activation: boolean;
      configuration_readiness?: {
        managed_backup?: {
          provider?: string;
          configuration?: string;
          credentials?: string;
          destination?: string;
          schedule?: string;
          retention?: string;
          encryption_dependency?: string;
          production_activation?: string;
        };
        pitr?: {
          provider?: string;
          configuration?: string;
          wal_retention?: string;
          restore_environment?: string;
          production_activation?: string;
        };
        dr_environment?: {
          provider?: string;
          configuration?: string;
          region?: string;
          database_recovery?: string;
          object_storage_dependency?: string;
          kms_dependency?: string;
          monitoring_dependency?: string;
          production_activation?: string;
        };
        environment?: string;
      };
    };
    country_policy?: {
      status: string;
      markets_supported_for_evaluation?: string[];
    };
  }>(token, '/api/v1/admin/control-plane/production-backup-onboarding');
}

export function fetchRealBackupActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    real_production_backup_provider_selected?: boolean;
    production_backup_enabled?: boolean;
    production_pitr_enabled?: boolean;
    real_production_dr_infrastructure_available?: boolean;
    isolated_restore_test?: string;
    isolated_restore_scope?: string;
    rpo?: { target: string; status: string; achievement: string };
    rto?: { target: string; status: string; achievement: string };
    production_local_disk_backup_fallback_possible?: boolean;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    ready_for_activation?: boolean;
    sandbox: string;
    production: string;
    rails?: Array<{
      rail: string;
      provider: string;
      real_provider_selected: boolean;
      production_enabled: boolean;
      lifecycle: string;
      sandbox: string;
      production: string;
      blocker: string;
    }>;
    checklist?: Array<{ id: string; label: string; mandatory: boolean; status: string }>;
    markets?: Array<{ market: string; lifecycle: string; production: string; blocker: string }>;
    dr_workflow?: { steps: string[]; production_failover: string };
    sandbox_restore?: {
      status: string;
      restore_elapsed_ms: number | null;
      note: string;
    };
    dependencies?: {
      private_storage: string;
      kms: string;
      monitoring: string;
      storage_sprint: number;
    };
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    control_plane?: string;
    foundation_plane?: string;
    s96_plane?: string;
    s107_plane?: string;
    runtime_adapters?: { backup: string; pitr: string; dr: string };
    evaluated_at?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-backup-real-activation-onboarding');
}

export function fetchObservabilityOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    provider: string;
    environment: string;
    activation_lifecycle?: string;
    force_launch_available?: boolean;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    validation_status: string;
    sandbox: string;
    production: string;
    metrics: string;
    logs: string;
    traces: string;
    error_tracking: string;
    alerting: string;
    webhook_monitoring: string;
    background_job_monitoring: string;
    phi_redaction: string;
    retention: string;
    data_residency: string;
    remaining_blocker: string;
    remaining_blockers?: string[];
    next_action: string;
    message: string;
    real_apm_available: boolean;
    real_monitoring_available?: boolean;
    real_alerting_available?: boolean;
    correlation_model?: string;
    evaluated_at?: string;
    apm?: {
      provider: string;
      production: string;
      sandbox?: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      activation_lifecycle?: string;
    };
    monitoring?: {
      provider: string;
      production: string;
      sandbox?: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      activation_lifecycle?: string;
    };
    alerting_rail?: {
      provider: string;
      production: string;
      sandbox?: string;
      remaining_blocker: string;
      remaining_blockers?: string[];
      activation_lifecycle?: string;
    };
    monitoring_coverage?: Array<{ domain: string; checks: string[]; production_status: string }>;
    alert_destinations?: {
      email: string;
      incident_management: string;
      operations_channel: string;
      pager_oncall: string;
    };
    health_semantics: {
      liveness: string;
      application_health: string;
      dependency_health: string;
      production_readiness: string;
    };
    enablement_guard: { can_enable: boolean; checks: Array<{ id: string; ok: boolean; detail: string }> };
    configuration_validation?: {
      ready_for_activation: boolean;
      configuration_readiness?: {
        apm?: {
          provider?: string;
          configuration?: string;
          credentials?: string;
          environment?: string;
          production_activation?: string;
        };
        monitoring?: {
          provider?: string;
          configuration?: string;
          credentials?: string;
          environment?: string;
          coverage_contract?: string;
          production_activation?: string;
        };
        alerting?: {
          provider?: string;
          configuration?: string;
          credentials?: string;
          destinations?: string;
          escalation_policy?: string;
          thresholds?: string;
          production_activation?: string;
        };
        environment?: string;
      };
    };
    country_policy?: {
      status: string;
      markets_supported_for_evaluation?: string[];
    };
  }>(token, '/api/v1/admin/control-plane/observability-onboarding');
}

export function fetchRealObservabilityActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    real_apm_provider_selected?: boolean;
    production_apm_enabled?: boolean;
    real_monitoring_provider_selected?: boolean;
    production_monitoring_enabled?: boolean;
    real_alerting_destination_configured?: boolean;
    production_alerting_enabled?: boolean;
    health_readiness_checks?: string;
    health_readiness_scope?: string;
    sensitive_log_redaction?: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    ready_for_activation?: boolean;
    sandbox: string;
    production: string;
    rails?: Array<{
      rail: string;
      provider: string;
      real_provider_selected: boolean;
      production_enabled: boolean;
      lifecycle: string;
      sandbox: string;
      production: string;
      blocker: string;
    }>;
    checklist?: Array<{ id: string; label: string; mandatory: boolean; status: string }>;
    markets?: Array<{ market: string; lifecycle: string; production: string; blocker: string }>;
    alert_lifecycle?: {
      states: string[];
      severities: string[];
      deduplication: boolean;
      production_pager: string;
    };
    health_model?: {
      liveness: string;
      readiness: string;
      production_readiness: string;
    };
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    control_plane?: string;
    foundation_plane?: string;
    s97_plane?: string;
    runtime_adapters?: { apm: string; monitoring: string; alerting: string };
    evaluated_at?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-observability-real-activation-onboarding');
}

export function fetchObservabilityApmMonitoringAlertingProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    secrets_manager_runtime_resolver: string;
    production_observability_enabled: boolean;
    production_apm_enabled: boolean;
    production_monitoring_enabled: boolean;
    production_alerting_enabled: boolean;
    production_pager_active: boolean;
    fake_apm_invented: boolean;
    apm: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      activation_stage: string;
      remaining_blocker: string;
    };
    monitoring: {
      provider: string;
      activation_stage: string;
      remaining_blocker: string;
    };
    alerting: {
      provider: string;
      activation_stage: string;
      remaining_blocker: string;
    };
    admin_summary: {
      observability: string;
      software_state: string;
      apm_state: string;
      metrics_state: string;
      alerting_state: string;
      health_readiness_state: string;
      blocker_reason: string;
      production_enabled: boolean;
    };
    health_readiness: {
      liveness_endpoint: string;
      readiness_endpoint: string;
      software_status: string;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    message: string;
  }>(
    token,
    '/api/v1/admin/control-plane/observability-apm-monitoring-alerting-production-activation-path',
  );
}

export function fetchApplicationSecurityHardening(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    architecture_reused?: string[];
    parallel_security_framework_created?: boolean;
    customer_cross_object?: string;
    vendor_cross_tenant?: string;
    doctor_healthcare_authorization?: string;
    lab_authorization?: string;
    imaging_authorization?: string;
    affiliate_authorization?: string;
    logistics_authorization?: string;
    admin_privilege_isolation?: string;
    idor_bola?: string;
    tenant_manipulation?: string;
    private_document_authorization?: string;
    sensitive_data_leakage?: string;
    audit_logging?: string;
    surfaces?: Array<{ id: string; label: string; status: string; evidence: string }>;
    vulnerabilities_found?: Array<{ id: string; severity: string; status: string; summary: string }>;
    vulnerabilities_fixed?: Array<{ id: string; summary: string }>;
    vulnerabilities_remaining?: Array<{
      id: string;
      severity: string;
      summary: string;
      why: string;
    }>;
    remaining_blocker: string;
    remaining_blockers: string[];
    force_launch_available?: boolean;
    can_production_launch?: string;
    security_statement?: string;
    next_action: string;
    message: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    phi_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/application-security-hardening');
}

export function fetchExternalPentestPreparation(token: string) {
  return fetchJson<{
    sprint?: number;
    s110_plane?: string;
    parallel_security_framework_created?: boolean;
    parallel_pentest_framework_created?: boolean;
    invented_pentest_vendor?: boolean;
    application_security_controls?: string;
    external_pentest?: string;
    external_pentest_passed?: string;
    production_security_certified?: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    remaining_blocker: string;
    remaining_blockers?: string[];
    high_risk_routes_inventoried?: number;
    high_risk_routes_tested?: number;
    certification_gate?: {
      APPLICATION_SECURITY_TESTED?: string;
      APPLICATION_SECURITY_HARDENED?: string;
      KNOWN_SECURITY_RISKS_DOCUMENTED?: string;
      EXTERNAL_PENTEST_REQUIRED?: string;
      EXTERNAL_PENTEST_PASSED?: string;
      REMEDIATION_REQUIRED?: string;
      SECURITY_APPROVED?: string;
      PRODUCTION_SECURITY_CERTIFIED?: string;
    };
    attack_surface?: Array<{
      id: string;
      portal: string;
      category: string;
      tested_status: string;
      risk: string;
    }>;
    evidence_matrix?: Array<{
      control: string;
      test: string;
      status: string;
      evidence_reference: string;
    }>;
    pentest_scope?: Array<{
      id: string;
      label: string;
      classification: string;
      notes: string;
    }>;
    s110_regression?: {
      delivery_rider_bola?: string;
      assert_rider_privilege_org_spoof?: string;
      physical_report_idempotency_bola?: string;
    };
    portal_results?: Record<string, string>;
    webhook_security?: string;
    rate_limit_abuse?: string;
    document_authorization?: string;
    sensitive_data_leakage?: string;
    tenant_spoofing?: string;
    security_statement?: string;
    next_action: string;
    message: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    phi_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/external-pentest-preparation');
}

export function fetchProductionSecretsEnvOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprint?: number;
    activation_lifecycle?: string;
    environment: string;
    provider: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: string;
    production: string;
    secrets_manager?: string;
    credentials_readiness?: string;
    configuration_readiness?: string;
    production_activation?: string;
    inventory_count?: number;
    rail_summaries?: Array<{
      rail: string;
      category: string;
      provider_selected: boolean;
      configuration: string;
      credentials: string;
      status: string;
      blocker: string;
    }>;
    secret_scan?: {
      status: string;
      live_key_material_hits: number;
      placeholder_fixture_ok: boolean;
      note: string;
    };
    environment_separation?: {
      development: string;
      sandbox: string;
      staging: string;
      production: string;
    };
    client_boundary?: {
      next_public_allowed_for_secrets: boolean;
      expo_public_allowed_for_secrets: boolean;
      admin_ui_shows_presence_only: boolean;
    };
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    production_secrets_enabled?: boolean;
    production_external_providers_enabled?: boolean;
    evaluated_at?: string;
    country_policy?: {
      status: string;
      markets_supported_for_evaluation?: string[];
    };
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-secrets-env-onboarding');
}

export function fetchSecretsManagerRuntimeResolver(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    secrets_manager_runtime_resolver: string;
    production_secrets_manager_enabled: boolean;
    fake_vault_invented: boolean;
    fake_credentials_invented: boolean;
    lifecycle: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      production: string;
      activation_stage: string;
      remaining_blocker: string;
    };
    admin_summary: {
      secrets_manager: string;
      software_resolver: string;
      production_adapter: string;
      blocker_reason: string;
      secret_values_visible: boolean;
    };
    environment_isolation: {
      development_neq_sandbox: boolean;
      sandbox_neq_staging: boolean;
      staging_neq_production: boolean;
      production_rejects_sandbox_refs: boolean;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    message: string;
  }>(token, '/api/v1/admin/control-plane/secrets-manager-runtime-resolver');
}

export function fetchProductionDeploymentOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    provider: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: string;
    production: string;
    deployment_target?: string;
    release_pipeline?: string;
    buildable?: boolean;
    deployable?: boolean;
    activation_ready?: boolean;
    production_launch_ready?: boolean;
    production_deployment_enabled?: boolean;
    production_deployment_performed?: boolean;
    production_activation?: string;
    builds?: Array<{ app: string; command: string; status: string; reason: string }>;
    migration?: { status: string; blocker: string };
    health?: { endpoints: string[]; status: string };
    rollback?: { sandbox_status: string; production_status: string };
    smoke_contract?: Array<{ domain: string; path: string }>;
    identity?: { app_version: string; git_sha: string; environment: string };
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-deployment-onboarding');
}

export function fetchProductionProviderOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    provider: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: string;
    production: string;
    control_plane?: string;
    production_providers_enabled?: boolean;
    production_infrastructure_enabled?: boolean;
    production_activation?: string;
    correlation_id?: string;
    counts?: {
      total: number;
      enabled: number;
      blocked: number;
      ready_for_activation: number;
    };
    rows?: Array<{
      rail_id: string;
      category: string;
      label: string;
      provider_name: string;
      lifecycle: string;
      configuration_readiness: string;
      credentials_readiness: string;
      legal_approval: string;
      verification: string;
      sandbox: string;
      production: string;
      enabled: boolean;
      blocker: string;
      dependency_blockers: string[];
      next_action: string;
      markets?: Array<{ market: string; lifecycle: string; production: string; blocker: string }>;
    }>;
    dependency_graph?: Array<{ from: string; to: string; reason: string }>;
    activation_sequence?: Array<{ order: number; band: string; rail: string; note: string }>;
    filters_supported?: string[];
    major_blockers?: string[];
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    launch_control_rails?: number;
    launch_control_overall?: string;
    evaluated_at?: string;
    two_person_approval?: {
      supported_in_software: boolean;
      required_for_activation: boolean;
      note: string;
    };
    secrets_printed?: boolean;
    country_policy?: {
      status: string;
      markets_supported_for_evaluation?: string[];
    };
  }>(token, '/api/v1/admin/control-plane/production-provider-onboarding');
}

export function fetchProductionFoundationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    activation_lifecycle?: string;
    environment: string;
    provider: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    sandbox: string;
    production: string;
    control_plane?: string;
    production_environment_enabled?: boolean;
    production_deployment_target_enabled?: boolean;
    production_secrets_manager_enabled?: boolean;
    production_database_enabled?: boolean;
    production_infrastructure_enabled?: boolean;
    production_activation?: string;
    correlation_id?: string;
    rails?: Array<{
      rail_id: string;
      label: string;
      lifecycle: string;
      provider: string;
      enabled: boolean;
      configuration_readiness: string;
      credentials_readiness: string;
      verification: string;
      blocker: string;
      blockers: string[];
      dependencies: string[];
      next_action: string;
      checklist?: Array<{ id: string; label: string; status: string }>;
      notes?: string[];
    }>;
    secret_references?: Array<{ key: string; rail: string }>;
    workload_identities?: Array<{ identity: string; purpose: string; status: string }>;
    dependency_chain?: Array<{ from: string; to: string; reason: string }>;
    environments?: Record<string, string>;
    remaining_blocker: string;
    remaining_blockers: string[];
    next_action: string;
    message: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    launch_control_overall?: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    country_policy?: {
      status: string;
      markets_supported_for_evaluation?: string[];
    };
  }>(token, '/api/v1/admin/control-plane/production-foundation-onboarding');
}

export function fetchRealFoundationActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    foundation_sprints?: string;
    s98_plane?: string;
    s99_plane?: string;
    s101_plane?: string;
    parallel_deployment_framework_created?: boolean;
    parallel_secrets_framework_created?: boolean;
    fake_infrastructure_invented?: boolean;
    activation_lifecycle?: string;
    production_environment_configured?: string;
    production_environment_separation_verified?: string;
    real_secrets_manager_selected?: string;
    production_secrets_manager_enabled?: string;
    real_deployment_target_selected?: string;
    production_deployment_target_enabled?: string;
    production_database_configured?: string;
    client_secret_exposure?: string;
    sandbox_to_production_fallback?: string;
    production_to_sandbox_fallback?: string;
    migration_safety?: string;
    rollback?: string;
    rollback_production?: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    remaining_blocker: string;
    remaining_blockers?: string[];
    rails?: Array<{
      rail: string;
      real_selected: boolean;
      production_enabled: boolean;
      configured: string;
      lifecycle: string;
      blocker: string;
    }>;
    environments?: Record<string, string>;
    provider_config_slots?: Array<{ rail: string; status: string }>;
    health_flow?: string[];
    control_plane?: string;
    foundation_plane?: string;
    next_action: string;
    message: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-foundation-real-activation-onboarding');
}

export function fetchApiAbuseHardening(token: string) {
  return fetchJson<{
    sprint?: number;
    parallel_rate_limit_framework_created?: boolean;
    invented_waf_edge_vendor?: boolean;
    authentication_abuse_protection?: string;
    otp_abuse_protection?: string;
    mfa_abuse_protection?: string;
    public_api_protection?: string;
    webhook_protection?: string;
    admin_api_protection?: string;
    request_size_protection?: string;
    upload_size_protection?: string;
    pagination_query_protection?: string;
    distributed_enforcement?: string;
    distributed_enforcement_status?: string;
    external_waf_edge_protection?: string;
    recovery_429_behavior?: string;
    protection_classes?: Array<{
      id: string;
      label: string;
      class: string;
      status: string;
      evidence: string;
    }>;
    vulnerabilities_fixed?: Array<{ id: string; summary: string }>;
    vulnerabilities_remaining?: Array<{
      id: string;
      severity: string;
      summary: string;
      why: string;
    }>;
    remaining_blocker: string;
    remaining_blockers?: string[];
    force_launch_available?: boolean;
    can_production_launch?: string;
    security_statement?: string;
    next_action: string;
    message: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    phi_printed?: boolean;
    otp_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/api-abuse-hardening');
}

export function fetchEdgeWafDdosActivationOnboarding(token: string) {
  return fetchJson<{
    sprint?: number;
    parallel_rate_limit_framework_created?: boolean;
    parallel_waf_engine_created?: boolean;
    invented_edge_waf_ddos_vendor?: boolean;
    activation_lifecycle?: string;
    edge_waf_provider_selected?: string;
    production_waf_enabled?: string;
    ddos_provider_selected?: string;
    production_ddos_protection_enabled?: string;
    trusted_proxy_configuration?: string;
    client_ip_spoofing_protection?: string;
    host_forwarded_host_protection?: string;
    origin_protection?: string;
    redis_rate_limit_integration?: string;
    redis_rate_limit?: string;
    edge_application_rate_limit_interaction?: string;
    webhook_security?: string;
    admin_break_glass_security?: string;
    http_security_headers?: string;
    cors_security?: string;
    edge_architecture?: string[];
    remaining_blocker: string;
    remaining_blockers?: string[];
    force_launch_available?: boolean;
    can_production_launch?: string;
    security_statement?: string;
    next_action: string;
    message: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    phi_printed?: boolean;
    otp_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/edge-waf-ddos-activation-onboarding');
}

export function fetchInputSecurityHardening(token: string) {
  return fetchJson<{
    sprint?: number;
    parallel_security_framework_created?: boolean;
    parallel_validation_system_created?: boolean;
    invented_security_vendor?: boolean;
    sql_orm_injection?: string;
    nosql_injection?: string;
    command_injection?: string;
    ssrf?: string;
    ssrf_private_network?: string;
    ssrf_metadata_endpoint?: string;
    path_traversal?: string;
    archive_traversal?: string;
    unsafe_redirect?: string;
    prototype_pollution?: string;
    unsafe_deserialization?: string;
    sensitive_error_leakage?: string;
    surfaces?: Array<{ id: string; label: string; status: string; evidence: string }>;
    vulnerabilities_fixed?: Array<{ id: string; summary: string }>;
    remaining_blocker: string;
    remaining_blockers?: string[];
    external_pentest?: string;
    external_pentest_passed?: string;
    production_security_certified?: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    security_statement?: string;
    next_action: string;
    message: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
    phi_printed?: boolean;
    otp_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/input-security-hardening');
}

export function fetchProductionSecurityGate(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_security_framework_created?: boolean;
    parallel_launch_rail_created?: boolean;
    invented_pentest_result?: boolean;
    external_pentest_lifecycle?: string;
    external_pentest_required?: string;
    external_pentest_passed?: string;
    security_approved?: string;
    production_security_certified?: string;
    security_certification_pending?: string;
    why_launch_blocked?: string;
    remaining_blocker: string;
    remaining_blockers?: string[];
    residual_risks?: Array<{ code: string; severity: string; summary: string; status: string }>;
    required_external_evidence?: Array<{ id: string; label: string; status: string }>;
    blockers?: Array<{
      code: string;
      category: string;
      why: string;
      required_evidence_or_action: string;
      resolvable_internally: false | string;
    }>;
    sandbox_production_fail_closed?: {
      overall?: string;
      mock_psp_satisfies_production?: string;
      local_storage_satisfies_production?: string;
    };
    force_launch_available?: boolean;
    can_production_launch?: string;
    launch_control_overall?: string;
    security_statement?: string;
    next_action: string;
    message: string;
    evaluated_at?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-security-gate');
}

export function fetchProductionFoundationActivationPreparation(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_foundation_framework_created?: boolean;
    fake_infrastructure_invented?: boolean;
    production_environment?: {
      status?: string;
      separation_verified?: string;
      sandbox_adapters_activate_production?: string;
    };
    production_secrets?: {
      status?: string;
      secrets_manager_selected?: string;
      secrets_manager_enabled?: string;
      client_secret_exposure?: string;
    };
    production_database?: {
      status?: string;
      cutover_authorized?: string;
      destructive_migrations?: string;
    };
    deployment_target?: {
      lifecycle?: string;
      status?: string;
      deployable?: boolean;
      deployed?: boolean;
    };
    migration_safety?: {
      software_contract?: string;
      production_cutover?: string;
    };
    rollback?: { sandbox?: string; production?: string };
    rails?: Array<{
      rail: string;
      status: string;
      blocker: string;
      required_external_action: string;
    }>;
    required_external_actions?: Array<{ id: string; action: string; status: string }>;
    remaining_blocker: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-foundation-activation-preparation');
}

export function fetchProductionReleaseEngineeringReadiness(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_release_framework_created?: boolean;
    parallel_deployment_state_machine_created?: boolean;
    fake_infrastructure_invented?: boolean;
    distinctions?: {
      software_ready?: string;
      deployment_target_ready?: string;
      production_deployable?: boolean;
      actually_deployed?: boolean;
    };
    software?: { status?: string };
    production_infrastructure?: string;
    deployment_target?: {
      lifecycle?: string;
      status?: string;
      deployable?: boolean;
      deployed?: boolean;
    };
    release_pipeline?: {
      overall_status?: string;
      production_pipeline_live?: boolean;
      operator_pipeline?: Array<{
        stage: string;
        status: string;
        note: string;
      }>;
    };
    production_build?: {
      buildable?: boolean;
      status?: string;
      embeds_server_secrets?: boolean;
    };
    artifact_identity?: {
      hashing_signing?: string;
      signing_keys_invented?: boolean;
      identity?: {
        app_version?: string;
        git_sha?: string;
        build_time?: string | null;
      };
    };
    pre_deployment_validation?: {
      overall?: string;
      environment_config?: string;
      migration_safety?: string;
      security_software_checks?: string;
    };
    migration_gate?: {
      production_cutover?: string;
      no_production_database?: string;
    };
    migration?: string;
    deployment_state?: {
      lifecycle?: string;
      performed?: boolean;
      implied_deployed?: boolean;
    };
    rollback?: {
      sandbox?: string;
      production?: string;
    };
    smoke_test?: {
      path?: string;
      production_authorized?: boolean;
      blocker?: string;
    };
    security_gate?: {
      external_pentest?: string;
      certified?: string;
      remaining_blocker?: string;
    };
    required_external_actions?: Array<{ id: string; action: string; status: string }>;
    remaining_blocker: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-release-engineering-readiness');
}

export function fetchProductionDeploymentTargetActivation(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_deployment_state_machine_created?: boolean;
    fake_infrastructure_invented?: boolean;
    deployment_target?: {
      lifecycle?: string;
      status?: string;
      provider?: string;
      deployable?: boolean;
      deployed?: boolean;
    };
    admin_summary?: {
      production_environment?: string;
      deployment_target?: string;
      release_pipeline?: string;
      production_database?: string;
      secrets_manager?: string;
      rollback_target?: string;
      rollback_proven?: string;
      security_certification?: string;
      security_blocker?: string;
    };
    production_configuration?: {
      sandbox_production_separation?: string;
      cannot_resolve_to?: string[];
    };
    activation_validation?: {
      deployable?: boolean;
      lifecycle?: string;
      primary_blocker?: string;
    };
    fail_closed_cases?: Array<{
      case_id: string;
      blocked: boolean;
      primary_blocker: string;
    }>;
    reference_slots?: Array<{
      id: string;
      label: string;
      status: string;
      reference_key: string;
    }>;
    handoff_checklist?: Array<{
      id: string;
      item: string;
      status: string;
    }>;
    remaining_blocker: string;
    force_launch_available?: boolean;
    force_deploy_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/production-deployment-target-activation');
}

export function fetchDeploymentReleaseEngineeringProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    secrets_manager_runtime_resolver: string;
    lifecycle: string;
    software_ready: boolean;
    production_deployable: boolean;
    actually_deployed: boolean;
    production_deployment_enabled: boolean;
    production_enabled: boolean;
    fake_infrastructure_invented: boolean;
    artifact_identity: {
      app_version: string;
      git_sha: string;
      build_time: string | null;
      identity_present: boolean;
    };
    admin_summary: {
      production_release: string;
      software_state: string;
      environment_state: string;
      deployment_target_state: string;
      artifact_identity: string;
      release_state: string;
      migration_state: string;
      readiness_state: string;
      rollback_readiness: string;
      blocker_reason: string;
      production_deployed: boolean;
      production_enabled: boolean;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    message: string;
  }>(
    token,
    '/api/v1/admin/control-plane/deployment-release-engineering-production-activation-path',
  );
}

export function fetchProductionDeploymentTargetActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    secrets_manager_runtime_resolver: string;
    lifecycle: string;
    configured: boolean;
    deployable: boolean;
    deployed: boolean;
    production_enabled: boolean;
    fake_infrastructure_invented: boolean;
    provider: { selected: boolean; code: string | null; mock_rejected: boolean };
    adapter: { selected: string; production_registered: boolean };
    cicd_provider: { remaining_blocker: string; validate_only_ci_remains_valid: boolean };
    admin_summary: {
      production_deployment: string;
      software_state: string;
      target_provider: string;
      target_state: string;
      environment: string;
      cicd_state: string;
      artifact_state: string;
      configuration_state: string;
      database_state: string;
      secrets_state: string;
      observability_state: string;
      deployment_state: string;
      current_release: null;
      previous_known_good_release: null;
      blocker_reason: string;
      production_deployed: boolean;
      production_enabled: boolean;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    message: string;
  }>(token, '/api/v1/admin/control-plane/production-deployment-target-activation-path');
}

export function fetchProductionDatabaseActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    secrets_manager_runtime_resolver: string;
    lifecycle: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    fake_infrastructure_invented: boolean;
    provider: { selected: boolean; code: string | null; mock_rejected: boolean };
    migration_execution: { lifecycle: string; external_gated: boolean; production_migration_proven: boolean };
    deployment_gate: { production_deployable: boolean; database_blocker: string };
    admin_summary: {
      production_database: string;
      software_state: string;
      provider: string;
      target_state: string;
      environment: string;
      configuration_state: string;
      verification_state: string;
      migration_state: string;
      backup_pitr_dependency: string;
      readiness: string;
      blocker_reason: string;
      external_gated: boolean;
      production_enabled: boolean;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    connection_strings_printed: boolean;
    message: string;
  }>(token, '/api/v1/admin/control-plane/production-database-activation-path');
}

export function fetchProductionManagedBackupPitrActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    secrets_manager_runtime_resolver: string;
    lifecycle: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    s141_rebuilt: boolean;
    fake_infrastructure_invented: boolean;
    provider: { selected: boolean; code: string | null; state: string };
    database_binding: { bound: boolean; blocker: string };
    rpo_rto: {
      rpo_target: string;
      rto_target: string;
      status: string;
      rpo_achievement: string;
      rto_achievement: string;
    };
    admin_summary: {
      production_backup_pitr: string;
      software_state: string;
      provider: string;
      database_binding: string;
      configuration: string;
      verification: string;
      approval: string;
      enabled: boolean;
      rpo: string;
      rto: string;
      dr_environment: string;
      restore_readiness: string;
      blocker_reason: string;
      external_gated: boolean;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    message: string;
  }>(token, '/api/v1/admin/control-plane/production-managed-backup-pitr-activation-path');
}

export function fetchProductionSecurityLaunchGatePath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    secrets_manager_runtime_resolver: string;
    overall_state: string;
    production_security_enabled: boolean;
    s110_s116_rebuilt: boolean;
    invented_pentest_result: boolean;
    invented_waf: boolean;
    admin_summary: {
      security_gate: string;
      software_state: string;
      application_security: string;
      api_abuse_protection: string;
      edge_waf: string;
      ddos: string;
      origin_protection: string;
      secrets: string;
      observability: string;
      external_pentest: string;
      approval: string;
      overall_launch_state: string;
      blocker_reason: string;
      production_security_enabled: boolean;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    message: string;
  }>(token, '/api/v1/admin/control-plane/production-security-launch-gate-path');
}

export function fetchAffiliatePayoutSettlementProductionWorkflowClosure(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    secrets_manager_runtime_resolver: string;
    production_payout_enabled: boolean;
    real_money_moved: boolean;
    fabricated_payout_success: boolean;
    current_payout_lifecycle: string;
    admin_summary: {
      affiliate_payout: string;
      software_state: string;
      commission_status: string;
      settlement_batch: string;
      payable_amount: string;
      payout_state: string;
      provider_state: string;
      kyc_kyb_state: string;
      reconciliation_state: string;
      blocker_reason: string;
      external_gated: boolean;
      production_enabled: boolean;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    message: string;
  }>(token, '/api/v1/admin/control-plane/affiliate-payout-settlement-production-workflow-closure');
}

export function fetchProductionKycKybHealthcarePartnerVerificationActivationPath(
  token: string,
) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    lifecycle: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    enabled: boolean;
    invented_kyc_provider: boolean;
    invented_verification_results: boolean;
    fabricated_licenses_accreditation: boolean;
    approved_unverified_partners: boolean;
    admin_summary: {
      kyc_kyb: string;
      software_state: string;
      provider_state: string;
      verification_state: string;
      evidence_reference: string;
      expiry: string;
      partner_state: string;
      approval_state: string;
      production_activation_state: string;
      payout_eligibility: string;
      clinical_eligibility: string;
      blocker_reason: string;
      external_gated: boolean;
      production_enabled: boolean;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_printed: boolean;
    message: string;
  }>(
    token,
    '/api/v1/admin/control-plane/production-kyc-kyb-healthcare-partner-verification-activation-path',
  );
}

export function fetchPspPaymentActivationPreparation(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_payment_framework_created?: boolean;
    fake_psp_invented?: boolean;
    real_money_processed?: boolean;
    psp?: {
      lifecycle?: string;
      provider?: string;
      production_credentials?: string;
      webhook?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      production_payment?: string;
      sandbox_payment?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      provider?: string;
      production_credentials?: string;
      webhook?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      production_payment?: string;
    };
    webhook_security?: {
      unsigned_rejected?: boolean;
      invalid_signature_rejected?: boolean;
      production_status?: string;
    };
    checkout_fail_closed?: {
      production_initiation_when_not_selected?: string;
      overall?: string;
    };
    payment_state_machine?: {
      forbidden?: string[];
      rules?: string[];
    };
    fail_closed_cases?: Array<{
      case_id: string;
      production_payment_blocked: boolean;
      primary_blocker: string;
    }>;
    configuration_references?: Array<{
      id: string;
      label: string;
      status: string;
      reference_key: string;
    }>;
    remaining_blocker: string;
    force_launch_available?: boolean;
    force_enable_psp_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/psp-payment-activation-preparation');
}

export function fetchPspPaymentProductionActivationControl(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_payment_framework_created?: boolean;
    fake_psp_invented?: boolean;
    real_money_processed?: boolean;
    real_psp_production_enabled?: boolean;
    provider_configured_equals_verified?: boolean;
    provider_verified_equals_approved?: boolean;
    provider_approved_equals_production_enabled?: boolean;
    psp?: {
      lifecycle?: string;
      provider?: string;
      configured?: boolean;
      verified?: boolean;
      approved?: boolean;
      production_enabled?: boolean;
      production_credentials?: string;
      webhook?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      production_payment?: string;
      sandbox_payment?: string;
    };
    admin_summary?: {
      provider?: string;
      configured?: string;
      credentials?: string;
      webhook?: string;
      verification?: string;
      approval?: string;
      production_environment?: string;
      market_currency_validation?: string;
      settlement_configuration?: string;
      final_activation_state?: string;
      production_payment?: string;
    };
    activation_gates?: Array<{
      id: string;
      label: string;
      status: string;
      reason: string;
      scope: string;
      evidence_required: string;
    }>;
    lifecycle_separation?: {
      configured_neq_verified?: boolean;
      verified_neq_approved?: boolean;
      approved_neq_enabled?: boolean;
    };
    fulfillment_gate?: {
      unpaid_neq_paid?: boolean;
      failed_cannot_become_paid?: boolean;
      status?: string;
    };
    money_safety_status?: string;
    customer_money_safety?: Array<{
      case_id: string;
      outcome: string;
      primary_control: string;
    }>;
    webhook_negative_cases?: Array<{
      case_id: string;
      outcome: string;
    }>;
    remaining_blocker: string;
    force_launch_available?: boolean;
    force_enable_psp_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
    s132_activation_path?: {
      sprint?: number;
      software_activation_path?: string;
      lifecycle?: string;
      production_enabled?: boolean;
      production_payment?: string;
      secrets_manager_runtime_resolver?: string;
      remaining_blocker?: string;
    };
  }>(token, '/api/v1/admin/control-plane/psp-payment-production-activation-control');
}

export function fetchPspPaymentProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    authoritative_source: string;
    software_activation_path: string;
    lifecycle: string;
    configured: boolean;
    verified: boolean;
    approved: boolean;
    production_enabled: boolean;
    production_payment: string;
    remaining_blocker: string;
    can_production_launch: string;
    secrets_manager_runtime_resolver: string;
    secrets_printed: boolean;
    message: string;
    configuration_slots?: Array<{
      id: string;
      label: string;
      reference_key: string;
      status: string;
      reference_present: boolean;
      secret: boolean;
    }>;
  }>(token, '/api/v1/admin/control-plane/psp-payment-production-activation-path');
}

export function fetchOtpMessagingActivationPreparation(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_otp_system_created?: boolean;
    fake_provider_invented?: boolean;
    real_otp_sent?: boolean;
    real_messages_sent?: boolean;
    otp_provider?: {
      lifecycle?: string;
      provider?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    channels?: {
      otp?: string;
      sms?: string;
      email?: string;
      push?: string;
    };
    admin_summary?: {
      otp_provider?: string;
      sms?: string;
      email?: string;
      push?: string;
      credentials?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      production_communications?: string;
    };
    otp_security?: {
      never_logged_in_production?: boolean;
      expiry_enforced?: boolean;
      attempt_limits?: boolean;
    };
    fail_closed_cases?: Array<{
      case_id: string;
      production_comms_blocked: boolean;
      primary_blocker: string;
    }>;
    configuration_references?: Array<{
      id: string;
      label: string;
      status: string;
      reference_key: string;
    }>;
    remaining_blocker: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
    otp_printed?: boolean;
    s133_activation_path?: {
      sprint?: number;
      software_activation_path?: string;
      production_communications?: string;
      production_otp_enabled?: boolean;
      secrets_manager_runtime_resolver?: string;
      sent_neq_delivered?: boolean;
      remaining_blocker?: string;
    };
  }>(token, '/api/v1/admin/control-plane/otp-messaging-activation-preparation');
}

export function fetchOtpMessagingProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    authoritative_source: string;
    software_activation_path: string;
    production_communications: string;
    production_otp_enabled: boolean;
    production_sms_enabled: boolean;
    production_email_enabled: boolean;
    production_push_enabled: boolean;
    remaining_blocker: string;
    can_production_launch: string;
    secrets_manager_runtime_resolver: string;
    sent_neq_delivered: boolean;
    secrets_printed: boolean;
    otp_printed: boolean;
    message: string;
  }>(token, '/api/v1/admin/control-plane/otp-messaging-production-activation-path');
}

export function fetchCarrierLogisticsActivationPreparation(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_carrier_abstraction_created?: boolean;
    fake_carrier_invented?: boolean;
    real_shipment_created?: boolean;
    real_tracking_number_generated?: boolean;
    carrier?: {
      lifecycle?: string;
      provider?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      carrier?: string;
      production_credentials?: string;
      webhook?: string;
      serviceability?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      production_logistics?: string;
    };
    fail_closed_cases?: Array<{
      case_id: string;
      production_shipping_blocked: boolean;
      primary_blocker: string;
    }>;
    pod?: { native_rider?: string };
    remaining_blocker: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
    s134_activation_path?: {
      sprint: number;
      software_activation_path: string;
      production_logistics: string;
      production_shipment_creation_enabled: boolean;
      secrets_manager_runtime_resolver: string;
      remaining_blocker: string;
    };
  }>(token, '/api/v1/admin/control-plane/carrier-logistics-activation-preparation');
}

export function fetchCarrierLogisticsProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    production_logistics: string;
    production_shipment_creation_enabled: boolean;
    production_tracking_enabled: boolean;
    production_webhook_enabled: boolean;
    carrier: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      activation_stage: string;
      remaining_blocker: string;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_manager_runtime_resolver: string;
    secrets_printed: boolean;
    message: string;
  }>(token, '/api/v1/admin/control-plane/carrier-logistics-production-activation-path');
}

export function fetchKycHealthcarePartnerVerificationActivationPreparation(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_kyc_framework_created?: boolean;
    fake_kyc_provider_invented?: boolean;
    real_kyc_provider_selected?: boolean;
    real_healthcare_registry_connected?: boolean;
    real_partner_production_approved?: boolean;
    kyc_provider?: {
      lifecycle?: string;
      provider?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      kyc_provider?: string;
      production_credentials?: string;
      webhook_callback?: string;
      healthcare_registry?: string;
      storage_kms?: string;
      malware_scan?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      production_partner_verification?: string;
    };
    fail_closed_cases?: Array<{
      case_id: string;
      production_verification_blocked: boolean;
      primary_blocker: string;
    }>;
    partner_types?: Array<{
      partner_type: string;
      production_privilege: string;
      sandbox: string;
    }>;
    remaining_blocker: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
    pii_phi_printed?: boolean;
  }>(
    token,
    '/api/v1/admin/control-plane/kyc-healthcare-partner-verification-activation-preparation',
  );
}

export function fetchLabPartnerOnboardingActivationPreparation(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_lab_onboarding_framework_created?: boolean;
    fake_lab_provider_invented?: boolean;
    fake_accreditation_claimed?: boolean;
    real_lab_production_enabled?: boolean;
    real_accreditation_verified?: boolean;
    document_verified_equals_partner_verified?: boolean;
    partner_verified_equals_production_enabled?: boolean;
    lab_provider?: {
      lifecycle?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
      attestation_is_legal_accreditation?: boolean;
    };
    admin_summary?: {
      business_kyb?: string;
      healthcare_accreditation?: string;
      required_documents?: string;
      organization_tenant?: string;
      service_locations?: string;
      lab_catalogue?: string;
      collection_capability?: string;
      report_workflow?: string;
      storage_security?: string;
      payment_psp?: string;
      market_policy?: string;
      production_infrastructure?: string;
      external_providers?: string;
      production_lab_partner_activation?: string;
    };
    activation_gates?: Array<{
      id: string;
      label: string;
      status: string;
      reason: string;
      scope: string;
      evidence_required: string;
    }>;
    fail_closed_cases?: Array<{
      case_id: string;
      production_activation_blocked: boolean;
      primary_blocker: string;
    }>;
    verification_separation?: {
      statement?: string;
    };
    remaining_blocker: string;
    force_launch_available?: boolean;
    force_enable_lab_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
    pii_phi_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/lab-partner-onboarding-activation-preparation');
}

export function fetchPharmacyVendorNetworkClosure(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_partner_framework_created?: boolean;
    fake_pharmacy_invented?: boolean;
    fake_license_claimed?: boolean;
    real_pharmacy_production_enabled?: boolean;
    document_verified_equals_partner_verified?: boolean;
    partner_verified_equals_approved?: boolean;
    approved_equals_production_enabled?: boolean;
    pharmacy_vendor?: {
      lifecycle?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      application?: string;
      verification?: string;
      approval?: string;
      activation?: string;
      catalog_ownership?: string;
      inventory?: string;
      fulfillment?: string;
      settlement?: string;
      suspension?: string;
      production_pharmacy_vendor_network?: string;
    };
    activation_gates?: Array<{
      id: string;
      label: string;
      status: string;
      reason: string;
      scope: string;
    }>;
    fail_closed_cases?: Array<{
      case_id: string;
      production_fulfillment_blocked: boolean;
      primary_blocker: string;
    }>;
    verification_separation?: {
      statement?: string;
    };
    remaining_blocker: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
    pii_phi_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/pharmacy-vendor-network-closure');
}

export function fetchLabPartnerProductionWorkflowClosure(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    parallel_lab_framework_created?: boolean;
    fake_lab_invented?: boolean;
    fake_accreditation_claimed?: boolean;
    real_lab_production_enabled?: boolean;
    document_verified_equals_partner_verified?: boolean;
    approved_equals_production_enabled?: boolean;
    lab_workflow?: {
      lifecycle?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      application?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      catalog?: string;
      bookings?: string;
      samples?: string;
      reports?: string;
      suspension?: string;
      settlement?: string;
      production_lab_diagnostic_workflow?: string;
    };
    fail_closed_cases?: Array<{
      case_id: string;
      production_booking_blocked: boolean;
      primary_blocker: string;
    }>;
    verification_separation?: {
      statement?: string;
    };
    remaining_blocker: string;
    force_launch_available?: boolean;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
    secrets_printed?: boolean;
    pii_phi_printed?: boolean;
  }>(token, '/api/v1/admin/control-plane/lab-partner-production-workflow-closure');
}

export function fetchErxProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    production_transmission: string;
    production_erx_enabled: boolean;
    issued_neq_legally_transmitted: boolean;
    erx: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      activation_stage: string;
      remaining_blocker: string;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_manager_runtime_resolver: string;
    message: string;
  }>(token, '/api/v1/admin/control-plane/erx-production-activation-path');
}

export function fetchDoctorConsultationErxProductionWorkflowClosure(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    fake_erx_invented?: boolean;
    real_erx_transmitted?: boolean;
    legal_transmission_claimed?: boolean;
    issued_equals_legally_transmitted?: boolean;
    doctor_workflow?: {
      lifecycle?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      doctor_verification?: string;
      approval?: string;
      clinical_enablement?: string;
      erx_provider?: string;
      erx_transmission?: string;
      consultation?: string;
      prescription?: string;
      telemedicine?: string;
      production_doctor_consultation_erx_workflow?: string;
    };
    erx_path?: {
      software_activation_path?: string;
      production_transmission?: string;
      issued_neq_legally_transmitted?: boolean;
      remaining_blocker?: string;
    };
    fail_closed_cases?: Array<{
      case_id: string;
      production_clinical_blocked: boolean;
      primary_blocker: string;
    }>;
    verification_separation?: { statement?: string };
    remaining_blocker: string;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
  }>(token, '/api/v1/admin/control-plane/doctor-consultation-erx-production-workflow-closure');
}

export function fetchVideoProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    production_session_creation: string;
    production_video_enabled: boolean;
    video_ended_neq_consultation_completed: boolean;
    video: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      activation_stage: string;
      remaining_blocker: string;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_manager_runtime_resolver: string;
    message: string;
  }>(token, '/api/v1/admin/control-plane/video-production-activation-path');
}

export function fetchTelemedicineLiveConsultationProductionWorkflowClosure(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    fake_live_video_invented?: boolean;
    real_telemedicine_claimed?: boolean;
    video_ended_equals_consultation_completed?: boolean;
    video_ended_equals_prescription_issued?: boolean;
    recording_system_built_in_sprint?: boolean;
    telemedicine_workflow?: {
      lifecycle?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      video_provider?: string;
      environment?: string;
      configuration?: string;
      credential_reference?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      session_creation?: string;
      callback_webhook?: string;
      supported_markets?: string;
      production_telemedicine_workflow?: string;
    };
    video_path?: {
      software_activation_path?: string;
      production_session_creation?: string;
      video_ended_neq_consultation_completed?: boolean;
      remaining_blocker?: string;
    };
    clinical_separation?: { statement?: string };
    remaining_blocker: string;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
  }>(
    token,
    '/api/v1/admin/control-plane/telemedicine-live-consultation-production-workflow-closure',
  );
}

export function fetchPacsProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    production_dicom_ingest: string;
    production_viewer: string;
    production_pacs_enabled: boolean;
    report_neq_diagnostic_viewer: boolean;
    pacs: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      activation_stage: string;
      remaining_blocker: string;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_manager_runtime_resolver: string;
    message: string;
  }>(token, '/api/v1/admin/control-plane/pacs-production-activation-path');
}

export function fetchImagingPacsDicomProductionWorkflowClosure(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    fake_pacs_invented?: boolean;
    real_pacs_claimed?: boolean;
    real_diagnostic_viewer_claimed?: boolean;
    draft_equals_published?: boolean;
    report_equals_diagnostic_viewer?: boolean;
    imaging_workflow?: {
      lifecycle?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      imaging_partner?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      pacs_provider?: string;
      dicom_capability?: string;
      configuration?: string;
      credential_reference?: string;
      pacs_verification?: string;
      pacs_approval?: string;
      pacs_enablement?: string;
      viewer?: string;
      storage_security?: string;
      supported_modalities_markets?: string;
      production_imaging_pacs_dicom_workflow?: string;
    };
    pacs_path?: {
      software_activation_path?: string;
      production_dicom_ingest?: string;
      production_viewer?: string;
      report_neq_diagnostic_viewer?: boolean;
      remaining_blocker?: string;
    };
    verification_separation?: { statement?: string };
    remaining_blocker: string;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
  }>(token, '/api/v1/admin/control-plane/imaging-pacs-dicom-production-workflow-closure');
}

export function fetchPrivateStorageKmsMalwareProductionActivationPath(token: string) {
  return fetchJson<{
    sprint: number;
    software_activation_path: string;
    production_sensitive_file_ops: string;
    production_pipeline_enabled: boolean;
    unscanned_neq_trusted: boolean;
    storage: {
      provider: string;
      configured: boolean;
      verified: boolean;
      approved: boolean;
      enabled: boolean;
      activation_stage: string;
      remaining_blocker: string;
    };
    kms: {
      provider: string;
      configured: boolean;
      activation_stage: string;
      remaining_blocker: string;
    };
    malware: {
      provider: string;
      configured: boolean;
      activation_stage: string;
      remaining_blocker: string;
    };
    remaining_blocker: string;
    can_production_launch: string;
    secrets_manager_runtime_resolver: string;
    message: string;
  }>(token, '/api/v1/admin/control-plane/private-storage-kms-malware-production-activation-path');
}

export function fetchPrivateStorageKmsMalwareProductionWorkflowClosure(token: string) {
  return fetchJson<{
    sprint?: number;
    authoritative_source?: string;
    fake_cloud_storage_invented?: boolean;
    real_production_pipeline_claimed?: boolean;
    unscanned_equals_trusted?: boolean;
    scan_failure_equals_clean?: boolean;
    local_disk_equals_production?: boolean;
    storage_workflow?: {
      lifecycle?: string;
      production?: string;
      sandbox?: string;
      enabled?: boolean;
    };
    admin_summary?: {
      storage_provider?: string;
      private_storage?: string;
      encryption_kms?: string;
      malware_scanner?: string;
      configuration?: string;
      credential_references?: string;
      verification?: string;
      approval?: string;
      enablement?: string;
      scan_policy?: string;
      access_policy?: string;
      production_private_storage_kms_malware_pipeline?: string;
    };
    triad_path?: {
      software_activation_path?: string;
      production_sensitive_file_ops?: string;
      unscanned_neq_trusted?: boolean;
      remaining_blocker?: string;
    };
    clinical_separations?: { statement?: string };
    remaining_blocker: string;
    can_production_launch?: string;
    why_launch_blocked?: string;
    next_action: string;
    message: string;
    security_statement?: string;
  }>(token, '/api/v1/admin/control-plane/private-storage-kms-malware-production-workflow-closure');
}

async function fetchJson<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${adminApiRoot()}${path}`, { headers: adminAuthHeaders(token) });
  if (res.status === 403) throw Object.assign(new Error('forbidden'), { status: 403 });
  if (!res.ok) throw Object.assign(new Error('request_failed'), { status: res.status });
  return (await res.json()) as T;
}

export function fetchProviderActivation(token: string) {
  return fetchJson<ProviderActivationMatrix>(token, '/api/v1/admin/control-plane/provider-activation');
}

export function verifyProviderActivation(token: string, id: string) {
  return fetchJson<{
    id: string;
    result: string;
    stage: string;
    contacted_external: false;
    secrets_printed: false;
    detail: string;
  }>(token, `/api/v1/admin/control-plane/provider-activation/${encodeURIComponent(id)}/verify`);
}
