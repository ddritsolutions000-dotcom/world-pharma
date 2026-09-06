import {
  computeHealthcarePartnerReadiness,
  isCredentialExpired,
  emptyRegulatoryRows,
  type HealthcarePartnerReadinessInput,
} from './healthcare-partner-readiness';
import {
  integrationTypesForProvider,
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
  requirementCodesForProvider,
} from './healthcare-environment';
import { listHealthcareIntegrationCatalog } from './production-healthcare-gate';

function baseDoctor(overrides: Partial<HealthcarePartnerReadinessInput> = {}): HealthcarePartnerReadinessInput {
  return {
    kind: 'DOCTOR',
    partner_id: 'p1',
    partner_status: 'ACTIVE',
    country_code: 'XX',
    country_id: 'c1',
    production_lifecycle: 'CONFIGURED',
    organization_id: null,
    organization_active: false,
    profile_present: true,
    credential: {
      present: true,
      status: 'VERIFIED',
      expires_on: '2099-01-01T00:00:00.000Z',
      verification_class: 'OPERATOR_VERIFIED',
    },
    capability_eligible: true,
    capability_note: null,
    regulatory_rows: [],
    integrations: [
      {
        dependency_type: 'ERX_PROVIDER',
        status: 'EXTERNAL_GATED',
        present: true,
        external_gated: true,
        live: false,
      },
      {
        dependency_type: 'VIDEO_PROVIDER',
        status: 'EXTERNAL_GATED',
        present: true,
        external_gated: true,
        live: false,
      },
    ],
    ...overrides,
  };
}

describe('Sprint 48 healthcare environment', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env['HEALTHCARE_ENVIRONMENT'] = prev['HEALTHCARE_ENVIRONMENT'];
    process.env['HEALTHCARE_LIVE_ENABLED'] = prev['HEALTHCARE_LIVE_ENABLED'];
    delete process.env['CLINICAL_ENVIRONMENT'];
    delete process.env['CLINICAL_LIVE_ENABLED'];
  });

  it('defaults healthcare environment to sandbox', () => {
    delete process.env['HEALTHCARE_ENVIRONMENT'];
    delete process.env['CLINICAL_ENVIRONMENT'];
    expect(readHealthcareEnvironment()).toBe('sandbox');
  });

  it('reads production healthcare environment', () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    expect(readHealthcareEnvironment()).toBe('production');
  });

  it('live healthcare defaults false', () => {
    delete process.env['HEALTHCARE_LIVE_ENABLED'];
    expect(isLiveHealthcareEnabled()).toBe(false);
  });

  it('maps doctor integrations', () => {
    expect(integrationTypesForProvider('DOCTOR')).toEqual(['ERX_PROVIDER', 'VIDEO_PROVIDER']);
  });

  it('maps lab integrations', () => {
    expect(integrationTypesForProvider('LAB')).toEqual(['HL7', 'FHIR']);
  });

  it('maps imaging integrations', () => {
    expect(integrationTypesForProvider('IMAGING_CENTER')).toEqual(['PACS', 'DICOM', 'HL7', 'FHIR']);
  });

  it('maps radiologist integrations', () => {
    expect(integrationTypesForProvider('RADIOLOGIST')).toContain('PACS');
  });

  it('lists requirement codes per provider without inventing law', () => {
    expect(requirementCodesForProvider('DOCTOR')).toContain('doctor_licensing');
    expect(requirementCodesForProvider('LAB')).toContain('lab_accreditation');
    expect(requirementCodesForProvider('IMAGING_CENTER')).toContain('imaging_licensing');
  });

  it('catalog marks all clinical integrations EXTERNAL_GATED', () => {
    const catalog = listHealthcareIntegrationCatalog();
    expect(catalog.length).toBe(6);
    expect(catalog.every((row) => row.status === 'EXTERNAL_GATED')).toBe(true);
  });
});

describe('Sprint 48 credential expiry', () => {
  it('treats missing expiry as not expired', () => {
    expect(isCredentialExpired(null)).toBe(false);
  });

  it('detects past expiry', () => {
    expect(isCredentialExpired('2020-01-01T00:00:00.000Z', new Date('2026-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('accepts future expiry', () => {
    expect(isCredentialExpired('2099-01-01T00:00:00.000Z', new Date('2026-01-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('Sprint 48 doctor readiness', () => {
  it('marks ACTIVE doctor with verified credential EXTERNAL_GATED when integrations gated', () => {
    const result = computeHealthcarePartnerReadiness(baseDoctor());
    expect(result.final_status).toBe('EXTERNAL_GATED');
    expect(result.bookable_sandbox).toBe(true);
    expect(result.bookable_production).toBe(false);
    expect(result.credential?.verification_class).toBe('OPERATOR_VERIFIED');
    expect(result.warnings).toContain('CREDENTIAL_OPERATOR_VERIFIED_NOT_REGISTRY');
  });

  it('blocks missing partner', () => {
    const result = computeHealthcarePartnerReadiness(
      baseDoctor({ partner_id: null, partner_status: null }),
    );
    expect(result.blockers).toContain('PARTNER_NOT_FOUND');
    expect(result.final_status).toBe('BLOCKED');
  });

  it('suspends when partner suspended', () => {
    const result = computeHealthcarePartnerReadiness(baseDoctor({ partner_status: 'SUSPENDED' }));
    expect(result.final_status).toBe('SUSPENDED');
    expect(result.blockers).toContain('PARTNER_SUSPENDED');
  });

  it('rejects rejected partners', () => {
    const result = computeHealthcarePartnerReadiness(baseDoctor({ partner_status: 'REJECTED' }));
    expect(result.blockers).toContain('PARTNER_REJECTED');
  });

  it('blocks inactive partners', () => {
    const result = computeHealthcarePartnerReadiness(baseDoctor({ partner_status: 'UNDER_REVIEW' }));
    expect(result.blockers).toContain('PARTNER_NOT_ACTIVE');
  });

  it('blocks missing profile', () => {
    const result = computeHealthcarePartnerReadiness(baseDoctor({ profile_present: false }));
    expect(result.blockers).toContain('PROFILE_MISSING');
  });

  it('blocks unverified credentials', () => {
    const result = computeHealthcarePartnerReadiness(
      baseDoctor({
        credential: {
          present: true,
          status: 'SUBMITTED',
          expires_on: null,
          verification_class: 'UNVERIFIED',
        },
      }),
    );
    expect(result.blockers).toContain('CREDENTIAL_NOT_VERIFIED');
  });

  it('blocks rejected credentials', () => {
    const result = computeHealthcarePartnerReadiness(
      baseDoctor({
        credential: {
          present: true,
          status: 'REJECTED',
          expires_on: null,
          verification_class: 'UNVERIFIED',
        },
      }),
    );
    expect(result.blockers).toContain('CREDENTIAL_REJECTED');
  });

  it('blocks expired credentials', () => {
    const result = computeHealthcarePartnerReadiness(
      baseDoctor({
        credential: {
          present: true,
          status: 'VERIFIED',
          expires_on: '2020-01-01T00:00:00.000Z',
          verification_class: 'OPERATOR_VERIFIED',
        },
        now: new Date('2026-06-01T00:00:00.000Z'),
      }),
    );
    expect(result.blockers).toContain('CREDENTIAL_EXPIRED');
    expect(result.bookable_sandbox).toBe(false);
  });

  it('blocks missing credentials', () => {
    const result = computeHealthcarePartnerReadiness(
      baseDoctor({
        credential: {
          present: false,
          status: null,
          expires_on: null,
          verification_class: 'UNVERIFIED',
        },
      }),
    );
    expect(result.blockers).toContain('CREDENTIAL_NOT_VERIFIED');
  });

  it('never claims ready_for_activation when integrations gated', () => {
    expect(computeHealthcarePartnerReadiness(baseDoctor()).ready_for_activation).toBe(false);
  });

  it('maps lifecycle from partner status', () => {
    expect(computeHealthcarePartnerReadiness(baseDoctor()).lifecycle).toBe('ACTIVE');
  });
});

describe('Sprint 48 lab readiness', () => {
  function baseLab(overrides: Partial<HealthcarePartnerReadinessInput> = {}): HealthcarePartnerReadinessInput {
    return {
      kind: 'LAB',
      partner_id: 'lp1',
      partner_status: 'ACTIVE',
      country_code: 'XX',
      country_id: 'c1',
      production_lifecycle: 'CONFIGURED',
      organization_id: 'org-lab',
      organization_active: true,
      profile_present: false,
      credential: null,
      capability_eligible: true,
      capability_note: 'sandbox attestation',
      regulatory_rows: [],
      integrations: [
        { dependency_type: 'HL7', status: 'MISSING', present: false, external_gated: true, live: false },
        { dependency_type: 'FHIR', status: 'MISSING', present: false, external_gated: true, live: false },
      ],
      ...overrides,
    };
  }

  it('warns that sandbox attestation is not legal accreditation', () => {
    const result = computeHealthcarePartnerReadiness(baseLab());
    expect(result.warnings).toContain('SANDBOX_ATTESTATION_NOT_LEGAL_ACCREDITATION');
  });

  it('blocks inactive lab organization', () => {
    const result = computeHealthcarePartnerReadiness(baseLab({ organization_active: false }));
    expect(result.blockers).toContain('ORGANIZATION_INACTIVE');
  });

  it('blocks missing lab organization', () => {
    const result = computeHealthcarePartnerReadiness(
      baseLab({ organization_id: null, organization_active: false }),
    );
    expect(result.blockers).toContain('ORGANIZATION_NOT_LINKED');
  });

  it('blocks ineligible capability', () => {
    const result = computeHealthcarePartnerReadiness(baseLab({ capability_eligible: false }));
    expect(result.blockers).toContain('CAPABILITY_NOT_ELIGIBLE');
  });

  it('blocks mandatory missing lab accreditation evidence', () => {
    const result = computeHealthcarePartnerReadiness(
      baseLab({
        regulatory_rows: [
          {
            code: 'lab_accreditation',
            label: 'Lab accreditation',
            mandatory: true,
            applicable: true,
            satisfied: false,
            evidence_status: 'NOT_CONFIGURED',
            blocker: 'REGULATORY_EVIDENCE_MISSING',
          },
        ],
      }),
    );
    expect(result.blockers).toContain('REGULATORY_EVIDENCE_MISSING');
  });

  it('blocks expired lab accreditation evidence', () => {
    const result = computeHealthcarePartnerReadiness(
      baseLab({
        regulatory_rows: [
          {
            code: 'lab_accreditation',
            label: 'Lab accreditation',
            mandatory: true,
            applicable: true,
            satisfied: false,
            evidence_status: 'EXPIRED',
            blocker: 'REGULATORY_EVIDENCE_EXPIRED',
          },
        ],
      }),
    );
    expect(result.blockers).toContain('REGULATORY_EVIDENCE_EXPIRED');
  });

  it('allows satisfied accreditation without inventing bodies', () => {
    const result = computeHealthcarePartnerReadiness(
      baseLab({
        regulatory_rows: [
          {
            code: 'lab_accreditation',
            label: 'Lab accreditation',
            mandatory: true,
            applicable: true,
            satisfied: true,
            evidence_status: 'VERIFIED',
            blocker: null,
          },
        ],
      }),
    );
    expect(result.blockers).not.toContain('REGULATORY_EVIDENCE_MISSING');
  });
});

describe('Sprint 48 imaging readiness', () => {
  function baseImaging(
    overrides: Partial<HealthcarePartnerReadinessInput> = {},
  ): HealthcarePartnerReadinessInput {
    return {
      kind: 'IMAGING_CENTER',
      partner_id: 'ip1',
      partner_status: 'ACTIVE',
      country_code: 'XX',
      country_id: 'c1',
      production_lifecycle: 'ACTIVE',
      organization_id: 'org-img',
      organization_active: true,
      profile_present: false,
      credential: null,
      capability_eligible: true,
      capability_note: null,
      regulatory_rows: [],
      integrations: [
        { dependency_type: 'PACS', status: 'EXTERNAL_GATED', present: true, external_gated: true, live: false },
        { dependency_type: 'DICOM', status: 'EXTERNAL_GATED', present: true, external_gated: true, live: false },
        { dependency_type: 'HL7', status: 'MISSING', present: false, external_gated: true, live: false },
        { dependency_type: 'FHIR', status: 'MISSING', present: false, external_gated: true, live: false },
      ],
      ...overrides,
    };
  }

  it('keeps PACS EXTERNAL_GATED even when country ACTIVE', () => {
    const result = computeHealthcarePartnerReadiness(baseImaging());
    expect(result.final_status).toBe('EXTERNAL_GATED');
    expect(result.bookable_production).toBe(false);
    expect(result.blockers).toContain('INTEGRATION_EXTERNAL_GATED');
  });

  it('blocks country production suspension', () => {
    const result = computeHealthcarePartnerReadiness(
      baseImaging({ production_lifecycle: 'SUSPENDED' }),
    );
    expect(result.final_status).toBe('SUSPENDED');
    expect(result.blockers).toContain('COUNTRY_PRODUCTION_SUSPENDED');
  });

  it('blocks missing imaging licence evidence when mandatory', () => {
    const result = computeHealthcarePartnerReadiness(
      baseImaging({
        regulatory_rows: [
          {
            code: 'imaging_licensing',
            label: 'Imaging licence',
            mandatory: true,
            applicable: true,
            satisfied: false,
            evidence_status: 'MISSING',
            blocker: 'REGULATORY_EVIDENCE_MISSING',
          },
        ],
      }),
    );
    expect(result.blockers).toContain('REGULATORY_EVIDENCE_MISSING');
  });

  it('never claims live integrations', () => {
    expect(computeHealthcarePartnerReadiness(baseImaging()).never_claim_live_integrations).toBe(true);
  });
});

describe('Sprint 48 radiologist readiness', () => {
  it('requires verified credential like doctors', () => {
    const result = computeHealthcarePartnerReadiness({
      kind: 'RADIOLOGIST',
      partner_id: 'r1',
      partner_status: 'ACTIVE',
      country_code: 'XX',
      country_id: 'c1',
      production_lifecycle: 'CONFIGURED',
      organization_id: 'org-img',
      organization_active: true,
      profile_present: true,
      credential: {
        present: false,
        status: null,
        expires_on: null,
        verification_class: 'UNVERIFIED',
      },
      capability_eligible: true,
      capability_note: null,
      regulatory_rows: [],
      integrations: [],
    });
    expect(result.blockers).toContain('CREDENTIAL_NOT_VERIFIED');
  });
});

describe('Sprint 48 regulatory helpers', () => {
  it('builds empty regulatory rows for configured codes', () => {
    const rows = emptyRegulatoryRows('DOCTOR', [
      { code: 'doctor_licensing', label: 'Doctor licensing', status: 'REQUIRED' },
      { code: 'pharmacy_licensing', label: 'Pharmacy', status: 'REQUIRED' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe('doctor_licensing');
    expect(rows[0]?.blocker).toBe('REGULATORY_EVIDENCE_MISSING');
  });

  it('does not mark optional unconfigured codes as blockers', () => {
    const rows = emptyRegulatoryRows('LAB', [
      { code: 'lab_accreditation', label: 'Lab', status: 'OPTIONAL' },
    ]);
    expect(rows[0]?.blocker).toBeNull();
  });
});

describe('Sprint 48 production bookability matrix', () => {
  it('sandbox bookable when ops gates pass despite gated integrations', () => {
    expect(computeHealthcarePartnerReadiness(baseDoctor()).bookable_sandbox).toBe(true);
  });

  it('production bookable only when integrations live and country ACTIVE', () => {
    const result = computeHealthcarePartnerReadiness(
      baseDoctor({
        production_lifecycle: 'ACTIVE',
        integrations: [
          {
            dependency_type: 'ERX_PROVIDER',
            status: 'VERIFIED',
            present: true,
            external_gated: false,
            live: true,
          },
          {
            dependency_type: 'VIDEO_PROVIDER',
            status: 'VERIFIED',
            present: true,
            external_gated: false,
            live: true,
          },
        ],
      }),
    );
    expect(result.final_status).toBe('READY');
    expect(result.bookable_production).toBe(true);
    expect(result.ready_for_activation).toBe(true);
  });

  it('blocks production when country not ACTIVE even if integrations verified', () => {
    const result = computeHealthcarePartnerReadiness(
      baseDoctor({
        production_lifecycle: 'UNDER_REVIEW',
        integrations: [
          {
            dependency_type: 'ERX_PROVIDER',
            status: 'VERIFIED',
            present: true,
            external_gated: false,
            live: true,
          },
          {
            dependency_type: 'VIDEO_PROVIDER',
            status: 'VERIFIED',
            present: true,
            external_gated: false,
            live: true,
          },
        ],
      }),
    );
    expect(result.bookable_production).toBe(false);
    expect(result.warnings).toContain('COUNTRY_PRODUCTION_NOT_ACTIVE');
  });
});

describe('Sprint 48 security / isolation signals', () => {
  it('does not expose object keys in readiness payload', () => {
    const result = computeHealthcarePartnerReadiness(baseDoctor());
    expect(JSON.stringify(result)).not.toMatch(/object_key|private-objects|\.pdf/i);
  });

  it('does not invent India hardcodes', () => {
    const result = computeHealthcarePartnerReadiness(baseDoctor());
    const blob = JSON.stringify(result);
    expect(blob).not.toContain('+91');
    expect(blob).not.toContain('Asia/Kolkata');
    expect(blob).not.toContain('"INR"');
    expect(blob).not.toContain('UPI');
  });

  it('keeps historical access conceptual note: suspension blocks new bookings only', () => {
    const suspended = computeHealthcarePartnerReadiness(baseDoctor({ partner_status: 'SUSPENDED' }));
    expect(suspended.bookable_sandbox).toBe(false);
    expect(suspended.message).toMatch(/fail closed/i);
  });

  it('does not treat EXTERNAL_REGISTRY verification as present without integration', () => {
    const result = computeHealthcarePartnerReadiness(
      baseDoctor({
        credential: {
          present: true,
          status: 'VERIFIED',
          expires_on: null,
          verification_class: 'EXTERNAL_REGISTRY_VERIFIED',
        },
      }),
    );
    expect(result.credential?.verification_class).toBe('EXTERNAL_REGISTRY_VERIFIED');
    expect(result.bookable_production).toBe(false);
  });

  it('IDOR-style isolation: readiness is scoped to partner_id input', () => {
    const a = computeHealthcarePartnerReadiness(baseDoctor({ partner_id: 'doctor-a' }));
    const b = computeHealthcarePartnerReadiness(baseDoctor({ partner_id: 'doctor-b' }));
    expect(a.partner_id).toBe('doctor-a');
    expect(b.partner_id).toBe('doctor-b');
    expect(a.partner_id).not.toBe(b.partner_id);
  });
});
