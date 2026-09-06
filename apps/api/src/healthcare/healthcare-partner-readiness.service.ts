/**
 * Sprint 48 — Composed healthcare partner readiness (doctor / lab / imaging / radiologist).
 */
import { Injectable } from '@nestjs/common';
import {
  CountryProductionLifecycle,
  CredentialReviewStatus,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
  ProductionDependencyStatus,
} from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { isEvidenceSatisfying } from '../platform/production-readiness';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  integrationTypesForProvider,
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
  requirementCodesForProvider,
} from './healthcare-environment';
import {
  computeHealthcarePartnerReadiness,
  type HealthcareCredentialVerificationClass,
  type HealthcarePartnerReadiness,
  type HealthcareProviderKind,
  type HealthcareRegulatoryRow,
} from './healthcare-partner-readiness';
import {
  assertProductionHealthcareAvailable,
  evaluateProductionHealthcareAvailable,
  listHealthcareIntegrationCatalog,
} from './production-healthcare-gate';

type PartnerBundle = {
  id: string;
  status: PartnerStatus;
  countryId: string;
  organizationId: string | null;
  country: { id: string; isoAlpha2: string; productionLifecycle: CountryProductionLifecycle };
  organization: { id: string; status: OrganizationStatus } | null;
  doctorProfile: { id: string; displayName: string } | null;
};

@Injectable()
export class HealthcarePartnerReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  listIntegrationGates() {
    return {
      environment: readHealthcareEnvironment(),
      live_healthcare_enabled: isLiveHealthcareEnabled(),
      catalog: listHealthcareIntegrationCatalog(),
      never_claim_live: true as const,
    };
  }

  async evaluateDoctor(partnerId: string): Promise<HealthcarePartnerReadiness> {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        country: true,
        organization: true,
        doctorProfile: { include: { credentials: { orderBy: { createdAt: 'desc' } } } },
      },
    });
    if (!partner) throw Errors.notFound('Doctor partner not found');
    const credential =
      partner.doctorProfile?.credentials.find((c) => c.status === CredentialReviewStatus.VERIFIED) ??
      partner.doctorProfile?.credentials[0] ??
      null;
    return this.compose({
      kind: 'DOCTOR',
      partner,
      credential,
      capabilityEligible: partner.status === PartnerStatus.ACTIVE,
      capabilityNote: 'Doctor booking eligibility follows PartnerStatus + verified credentials.',
    });
  }

  async evaluateLab(labOrgId: string): Promise<HealthcarePartnerReadiness> {
    const org = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.organization.findUnique({
        where: { id: labOrgId },
        include: { country: true, partners: { orderBy: { createdAt: 'desc' }, take: 5 } },
      }),
    );
    if (!org || org.kind !== OrganizationKind.LAB) throw Errors.notFound('Lab organization not found');
    const partnerRow = org.partners[0] ?? null;
    return this.compose({
      kind: 'LAB',
      partner: partnerRow
        ? {
            id: partnerRow.id,
            status: partnerRow.status,
            countryId: partnerRow.countryId,
            organizationId: partnerRow.organizationId,
            country: org.country,
            organization: { id: org.id, status: org.status },
            doctorProfile: null,
          }
        : null,
      countryFallback: org.country,
      organizationFallback: org,
      credential: null,
      capabilityEligible: org.status === OrganizationStatus.ACTIVE,
      capabilityNote:
        'Lab sandbox capability/attestation remains pack-gated separately and is not legal accreditation.',
    });
  }

  async evaluateImaging(imagingOrgId: string): Promise<HealthcarePartnerReadiness> {
    const org = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.organization.findUnique({
        where: { id: imagingOrgId },
        include: { country: true, partners: { orderBy: { createdAt: 'desc' }, take: 5 } },
      }),
    );
    if (!org || org.kind !== OrganizationKind.IMAGING_CENTER) {
      throw Errors.notFound('Imaging organization not found');
    }
    const partnerRow = org.partners[0] ?? null;
    return this.compose({
      kind: 'IMAGING_CENTER',
      partner: partnerRow
        ? {
            id: partnerRow.id,
            status: partnerRow.status,
            countryId: partnerRow.countryId,
            organizationId: partnerRow.organizationId,
            country: org.country,
            organization: { id: org.id, status: org.status },
            doctorProfile: null,
          }
        : null,
      countryFallback: org.country,
      organizationFallback: org,
      credential: null,
      capabilityEligible: org.status === OrganizationStatus.ACTIVE,
      capabilityNote:
        'Imaging sandbox capability/attestation remains pack-gated separately; PACS stays EXTERNAL_GATED.',
    });
  }

  async evaluateRadiologist(partnerId: string): Promise<HealthcarePartnerReadiness> {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        country: true,
        organization: true,
        doctorProfile: { include: { credentials: { orderBy: { createdAt: 'desc' } } } },
      },
    });
    if (!partner) throw Errors.notFound('Radiologist partner not found');
    const credential =
      partner.doctorProfile?.credentials.find((c) => c.status === CredentialReviewStatus.VERIFIED) ??
      partner.doctorProfile?.credentials[0] ??
      null;
    return this.compose({
      kind: 'RADIOLOGIST',
      partner,
      credential,
      capabilityEligible: partner.status === PartnerStatus.ACTIVE,
      capabilityNote: 'Radiologist study access remains organization-scoped (no cross-tenant).',
    });
  }

  /**
   * Fail-closed production booking gate. Sandbox bookings continue unless provider/country suspended
   * or doctor credentials expired.
   */
  async assertBookingAllowed(input: {
    kind: HealthcareProviderKind;
    countryCode: string;
    partnerId?: string;
    organizationId?: string;
  }): Promise<HealthcarePartnerReadiness> {
    const readiness =
      input.kind === 'DOCTOR' && input.partnerId
        ? await this.evaluateDoctor(input.partnerId)
        : input.kind === 'RADIOLOGIST' && input.partnerId
          ? await this.evaluateRadiologist(input.partnerId)
          : input.kind === 'LAB' && input.organizationId
            ? await this.evaluateLab(input.organizationId)
            : input.kind === 'IMAGING_CENTER' && input.organizationId
              ? await this.evaluateImaging(input.organizationId)
              : null;
    if (!readiness) {
      throw Errors.validation('Healthcare booking subject is required');
    }

    if (readiness.final_status === 'SUSPENDED') {
      throw Errors.problem(
        409,
        'HEALTHCARE_PROVIDER_SUSPENDED',
        'Healthcare provider suspended',
        readiness.message,
      );
    }
    if (readiness.blockers.includes('CREDENTIAL_EXPIRED')) {
      throw Errors.problem(
        409,
        'CREDENTIAL_EXPIRED',
        'Credential expired',
        'Doctor/radiologist credential has expired — new bookings are blocked.',
      );
    }

    // Sandbox: fail-closed for suspension/expiry; do not require live integrations.
    // Lab/imaging bookability remains pack/capability gated separately when partner linkage is incomplete.
    if (readHealthcareEnvironment() !== 'production') {
      if (
        readiness.blockers.includes('PARTNER_SUSPENDED') ||
        readiness.blockers.includes('PARTNER_REJECTED')
      ) {
        throw Errors.problem(
          409,
          readiness.blockers[0] ?? 'HEALTHCARE_NOT_READY',
          'Healthcare partner not ready',
          readiness.message,
        );
      }
      if (
        (input.kind === 'DOCTOR' || input.kind === 'RADIOLOGIST') &&
        readiness.blockers.includes('PARTNER_NOT_ACTIVE')
      ) {
        throw Errors.problem(
          409,
          'PARTNER_NOT_ACTIVE',
          'Healthcare partner not ready',
          readiness.message,
        );
      }
      return readiness;
    }

    await assertProductionHealthcareAvailable(this.prisma, {
      countryCode: input.countryCode,
      kind: input.kind,
    });
    if (!readiness.bookable_production) {
      throw Errors.problem(
        409,
        'HEALTHCARE_PRODUCTION_NOT_READY',
        'Production healthcare unavailable',
        readiness.message,
      );
    }
    return readiness;
  }

  async networkSnapshot(countryCode?: string) {
    const whereCountry = countryCode
      ? { isoAlpha2: countryCode.trim().toUpperCase() }
      : undefined;
    const countries = await this.prisma.country.findMany({
      where: whereCountry,
      take: 20,
      orderBy: { isoAlpha2: 'asc' },
    });
    const doctors = await this.prisma.partner.findMany({
      where: {
        doctorProfile: { isNot: null },
        ...(countryCode ? { country: { isoAlpha2: countryCode.trim().toUpperCase() } } : {}),
      },
      take: 50,
      orderBy: { updatedAt: 'desc' },
      include: {
        doctorProfile: true,
        country: { select: { isoAlpha2: true, productionLifecycle: true } },
      },
    });
    const labs = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.organization.findMany({
        where: {
          kind: OrganizationKind.LAB,
          ...(countryCode ? { country: { isoAlpha2: countryCode.trim().toUpperCase() } } : {}),
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        include: { country: { select: { isoAlpha2: true, productionLifecycle: true } } },
      }),
    );
    const imaging = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.organization.findMany({
        where: {
          kind: OrganizationKind.IMAGING_CENTER,
          ...(countryCode ? { country: { isoAlpha2: countryCode.trim().toUpperCase() } } : {}),
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        include: { country: { select: { isoAlpha2: true, productionLifecycle: true } } },
      }),
    );

    const doctorRows = [];
    for (const d of doctors.slice(0, 5)) {
      doctorRows.push({
        partner_id: d.id,
        display_name: d.doctorProfile?.displayName ?? 'Doctor',
        status: d.status,
        country_code: d.country.isoAlpha2,
        readiness: await this.evaluateDoctor(d.id),
      });
    }

    const labRows = [];
    for (const lab of labs.slice(0, 5)) {
      labRows.push({
        organization_id: lab.id,
        name: lab.legalName,
        country_code: lab.country.isoAlpha2,
        readiness: await this.evaluateLab(lab.id),
      });
    }

    const imagingRows = [];
    for (const center of imaging.slice(0, 5)) {
      imagingRows.push({
        organization_id: center.id,
        name: center.legalName,
        country_code: center.country.isoAlpha2,
        readiness: await this.evaluateImaging(center.id),
      });
    }

    const integrationProbe =
      countries[0] != null
        ? await evaluateProductionHealthcareAvailable(this.prisma, {
            countryId: countries[0].id,
            kind: 'DOCTOR',
          })
        : null;

    return {
      environment: readHealthcareEnvironment(),
      live_healthcare_enabled: isLiveHealthcareEnabled(),
      integrations: this.listIntegrationGates(),
      production_probe: integrationProbe
        ? {
            available: integrationProbe.available,
            blockers: integrationProbe.blockers,
            message: integrationProbe.message,
          }
        : null,
      doctors: doctorRows,
      labs: labRows,
      imaging: imagingRows,
      never_fake_green: true as const,
      note: 'Sandbox operational readiness ≠ live doctors/labs/PACS/eRx. EXTERNAL_GATED integrations stay gated.',
    };
  }

  private async compose(input: {
    kind: HealthcareProviderKind;
    partner: PartnerBundle | null;
    countryFallback?: { id: string; isoAlpha2: string; productionLifecycle: CountryProductionLifecycle };
    organizationFallback?: { id: string; status: OrganizationStatus };
    credential: {
      status: CredentialReviewStatus;
      expiresOn: Date | null;
    } | null;
    capabilityEligible: boolean | null;
    capabilityNote: string | null;
  }): Promise<HealthcarePartnerReadiness> {
    const country = input.partner?.country ?? input.countryFallback;
    if (!country) {
      throw Errors.notFound('Country not found for healthcare partner');
    }
    const organization = input.partner?.organization ?? input.organizationFallback ?? null;
    const regulatory = await this.loadRegulatory(country.id, input.kind);
    const integrations = await this.loadIntegrations(country.id, input.kind);

    let verificationClass: HealthcareCredentialVerificationClass = 'UNVERIFIED';
    if (input.credential?.status === CredentialReviewStatus.VERIFIED) {
      verificationClass = 'OPERATOR_VERIFIED';
    }

    return computeHealthcarePartnerReadiness({
      kind: input.kind,
      partner_id: input.partner?.id ?? null,
      partner_status: input.partner?.status ?? null,
      country_code: country.isoAlpha2,
      country_id: country.id,
      production_lifecycle: country.productionLifecycle,
      organization_id: organization?.id ?? input.partner?.organizationId ?? null,
      organization_active: organization ? organization.status === OrganizationStatus.ACTIVE : false,
      profile_present: Boolean(input.partner?.doctorProfile),
      credential: input.credential
        ? {
            present: true,
            status: input.credential.status,
            expires_on: input.credential.expiresOn?.toISOString() ?? null,
            verification_class: verificationClass,
          }
        : input.kind === 'DOCTOR' || input.kind === 'RADIOLOGIST'
          ? {
              present: false,
              status: null,
              expires_on: null,
              verification_class: 'UNVERIFIED',
            }
          : null,
      capability_eligible: input.capabilityEligible,
      capability_note: input.capabilityNote,
      regulatory_rows: regulatory,
      integrations,
    });
  }

  private async loadRegulatory(
    countryId: string,
    kind: HealthcareProviderKind,
  ): Promise<HealthcareRegulatoryRow[]> {
    const applicable = new Set(requirementCodesForProvider(kind));
    const requirements = await this.prisma.regulatoryRequirement.findMany({
      where: { countryId, code: { in: [...applicable] } },
    });
    const now = new Date();
    const rows: HealthcareRegulatoryRow[] = [];
    for (const req of requirements) {
      const evidence = await this.prisma.regulatoryEvidence.findMany({
        where: { requirementId: req.id },
        orderBy: { createdAt: 'desc' },
      });
      const active = evidence.find((ev) =>
        isEvidenceSatisfying({ status: ev.status, expiresAt: ev.expiresAt, now }),
      );
      const expired = evidence.find(
        (ev) =>
          ev.status === 'VERIFIED' &&
          ev.expiresAt != null &&
          ev.expiresAt.getTime() <= now.getTime(),
      );
      const mandatory = req.status === 'REQUIRED';
      let blocker: HealthcareRegulatoryRow['blocker'] = null;
      let satisfied = false;
      if (active) {
        satisfied = true;
      } else if (expired) {
        blocker = 'REGULATORY_EVIDENCE_EXPIRED';
      } else if (mandatory) {
        blocker = 'REGULATORY_EVIDENCE_MISSING';
      }
      rows.push({
        code: req.code,
        label: req.label,
        mandatory,
        applicable: true,
        satisfied,
        evidence_status: active?.status ?? expired?.status ?? evidence[0]?.status ?? 'NOT_CONFIGURED',
        blocker,
      });
    }
    // Surface known codes that are not configured yet (informational).
    for (const code of requirementCodesForProvider(kind)) {
      if (rows.some((r) => r.code === code)) continue;
      rows.push({
        code,
        label: code,
        mandatory: false,
        applicable: true,
        satisfied: false,
        evidence_status: 'NOT_CONFIGURED',
        blocker: null,
      });
    }
    return rows;
  }

  private async loadIntegrations(countryId: string, kind: HealthcareProviderKind) {
    const types = integrationTypesForProvider(kind);
    const out = [];
    for (const dependency_type of types) {
      const dep = await this.prisma.productionDependency.findFirst({
        where: {
          OR: [{ countryId }, { countryId: null }],
          dependencyType: dependency_type,
          environment: 'production',
        },
        orderBy: { updatedAt: 'desc' },
      });
      const status = dep?.status ?? 'MISSING';
      const live = status === ProductionDependencyStatus.VERIFIED;
      out.push({
        dependency_type,
        status,
        present: Boolean(dep),
        external_gated: !live,
        live,
      });
    }
    return out;
  }
}
