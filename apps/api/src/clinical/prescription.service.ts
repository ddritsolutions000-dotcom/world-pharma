import { createHash } from 'crypto';
import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  EncounterStatus,
  PrescriptionOrigin,
  PrescriptionStatus,
  type Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { PolicyResolver } from '../policy/resolver';
import { ClinicalAccessService } from './clinical-access.service';
import { DoctorService } from './doctor.service';
import { DISPENSING_BOUNDARY, DispensingBoundaryPort } from './dispensing-boundary.port';
import { DispensingService } from './dispensing.service';
import { ErxSubmissionService } from './erx-submission.service';
import { HealthPrescriptionProjectionService } from '../health/health-prescription-projection.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';

export type PrescriptionLineInput = {
  clinical_concept_code: string;
  clinical_concept_label: string;
  strength_text?: string;
  form_text?: string;
  route_text?: string;
  dosage_instructions: string;
  quantity_authorized: string;
  quantity_unit?: string;
  days_supply?: number;
  substitution_allowed?: boolean;
  restriction_category_code?: string;
  suggested_catalog_item_id?: string;
};

const ALLOWED_TRANSITIONS: Record<PrescriptionStatus, PrescriptionStatus[]> = {
  DRAFT: [PrescriptionStatus.ISSUED, PrescriptionStatus.CANCELLED],
  ISSUED: [PrescriptionStatus.CANCELLED, PrescriptionStatus.EXPIRED, PrescriptionStatus.FULLY_DISPENSED],
  SUPERSEDED: [],
  CANCELLED: [],
  EXPIRED: [],
  FULLY_DISPENSED: [],
};

@Injectable()
export class PrescriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly doctors: DoctorService,
    private readonly clinicalAccess: ClinicalAccessService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
    @Inject(DISPENSING_BOUNDARY) private readonly dispensing: DispensingBoundaryPort,
    private readonly erxSubmissions: ErxSubmissionService,
    @Inject(forwardRef(() => DispensingService)) private readonly dispensingService: DispensingService,
    @Inject(forwardRef(() => HealthPrescriptionProjectionService))
    private readonly healthProjection: HealthPrescriptionProjectionService,
  ) {}

  async createDraft(
    principal: Principal,
    input: {
      encounter_id: string;
      lines: PrescriptionLineInput[];
      country_code?: string;
      idempotency_key: string;
    },
  ) {
    this.assertDoctorAudience(principal);
    return this.idempotent(principal.personId, input.idempotency_key, 'POST', '/doctor/prescriptions', async () => {
      const doctor = await this.resolveDoctor(principal.personId);
      const encounter = await this.prisma.encounter.findUnique({ where: { id: input.encounter_id } });
      if (!encounter) {
        throw Errors.notFound('Encounter not found');
      }
      if (encounter.doctorProfileId !== doctor.profile.id) {
        throw Errors.forbidden('Encounter does not belong to the authenticated doctor');
      }
      if (encounter.status === EncounterStatus.CANCELLED) {
        throw Errors.problem(409, 'ENCOUNTER_CANCELLED', 'Encounter cancelled', 'Cannot prescribe on a cancelled encounter.');
      }
      const country = await this.prisma.country.findUnique({ where: { id: encounter.countryId } });
      if (!country) {
        throw Errors.notFound('Country not found');
      }
      await this.requirePrescribeEnabled(country.isoAlpha2);
      await this.assertClinicalAccess(principal, encounter.customerPersonId, country.isoAlpha2);
      this.assertLines(input.lines);
      await this.assertRestrictionCodes(country.isoAlpha2, input.lines);

      const prescriptionId = uuidv7();
      const versionId = uuidv7();
      const now = new Date();

      await this.prisma.$transaction(async (tx) => {
        await tx.prescription.create({
          data: {
            id: prescriptionId,
            countryId: encounter.countryId,
            patientPersonId: encounter.customerPersonId,
            doctorProfileId: doctor.profile.id,
            doctorPartnerId: doctor.partner.id,
            encounterId: encounter.id,
            organizationId: encounter.organizationId,
            status: PrescriptionStatus.DRAFT,
            origin: PrescriptionOrigin.ENCOUNTER,
            createdByPersonId: principal.personId,
          },
        });
        await tx.prescriptionVersion.create({
          data: {
            id: versionId,
            prescriptionId,
            versionNumber: 1,
            createdByPersonId: principal.personId,
            lines: {
              create: input.lines.map((line, index) => this.lineData(line, index + 1)),
            },
          },
        });
        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { currentVersionId: versionId },
        });
        await this.appendStatus(tx, prescriptionId, null, PrescriptionStatus.DRAFT, principal.personId, 'create');
        await this.securityEvent(tx, principal.personId, 'PRESCRIPTION_CREATED', prescriptionId);
        await this.outbox.enqueue(tx, {
          type: 'PRESCRIPTION_CREATED',
          aggregateType: 'prescription',
          aggregateId: prescriptionId,
          producer: 'clinical',
          countryId: encounter.countryId,
          payload: {
            prescription_id: prescriptionId,
            patient_person_id: encounter.customerPersonId,
            doctor_partner_id: doctor.partner.id,
            status: PrescriptionStatus.DRAFT,
          },
          occurrenceKey: `PRESCRIPTION_CREATED:${prescriptionId}`,
        });
      });

      void now;
      return this.present(prescriptionId, { includeLines: true });
    });
  }

  async issue(principal: Principal, prescriptionId: string, idempotencyKey: string) {
    this.assertDoctorAudience(principal);
    return this.idempotent(principal.personId, idempotencyKey, 'POST', `/doctor/prescriptions/${prescriptionId}/issue`, async () => {
      const row = await this.loadOwned(prescriptionId, principal.personId);
      const country = await this.prisma.country.findUniqueOrThrow({ where: { id: row.countryId } });
      await this.requirePrescribeEnabled(country.isoAlpha2);
      await this.assertClinicalAccess(principal, row.patientPersonId, country.isoAlpha2);
      this.assertTransition(row.status, PrescriptionStatus.ISSUED);

      const version = row.currentVersionId
        ? await this.prisma.prescriptionVersion.findUnique({ where: { id: row.currentVersionId }, include: { lines: true } })
        : null;
      if (!version || version.lines.length === 0) {
        throw Errors.validation('Prescription has no medication lines');
      }
      if (version.sealedAt) {
        throw Errors.problem(409, 'VERSION_ALREADY_SEALED', 'Version sealed', 'Current version is already sealed.');
      }
      await this.assertRestrictionCodes(
        country.isoAlpha2,
        version.lines.map((l) => ({
          clinical_concept_code: l.clinicalConceptCode,
          clinical_concept_label: l.clinicalConceptLabel,
          dosage_instructions: l.dosageInstructions,
          quantity_authorized: l.quantityAuthorized,
          restriction_category_code: l.restrictionCategoryCode ?? undefined,
        })),
      );

      const seal = this.integritySeal(version.id, version.lines);
      const sealedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.prescriptionVersion.update({
          where: { id: version.id },
          data: { sealedAt, integritySeal: seal },
        });
        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { status: PrescriptionStatus.ISSUED },
        });
        await this.appendStatus(tx, prescriptionId, PrescriptionStatus.DRAFT, PrescriptionStatus.ISSUED, principal.personId, 'issue');
        await this.securityEvent(tx, principal.personId, 'PRESCRIPTION_ISSUED', prescriptionId);
        await this.outbox.enqueue(tx, {
          type: 'PRESCRIPTION_ISSUED',
          aggregateType: 'prescription',
          aggregateId: prescriptionId,
          producer: 'clinical',
          countryId: row.countryId,
          payload: {
            prescription_id: prescriptionId,
            patient_person_id: row.patientPersonId,
            version_id: version.id,
            status: PrescriptionStatus.ISSUED,
          },
          occurrenceKey: `PRESCRIPTION_ISSUED:${prescriptionId}:${version.id}`,
        });
        await this.prisma.runWithTenant(
          workerTenantContext({
            countryId: row.countryId,
            personId: principal.personId,
          }),
          () =>
            this.healthProjection.projectIssuedVersion(tx, {
              prescriptionId,
              prescriptionVersionId: version.id,
              patientPersonId: row.patientPersonId,
              countryId: row.countryId,
              countryCode: country.isoAlpha2,
              publishedAt: sealedAt,
            }),
        );
      });

      // R5-A/C: notify dispensing boundary — does not create Order/inventory.
      await this.dispensing.enqueueForVersion(version.id);
      // R5-F: e-Rx submission when country pack enables (fail-closed; non-blocking).
      await this.erxSubmissions.submitForIssuedVersion({
        prescriptionVersionId: version.id,
        prescriptionId,
        countryId: row.countryId,
        countryCode: country.isoAlpha2,
        actorPersonId: principal.personId,
      });

      return this.present(prescriptionId, { includeLines: true });
    });
  }

  async amend(
    principal: Principal,
    prescriptionId: string,
    input: { lines: PrescriptionLineInput[]; idempotency_key: string },
  ) {
    this.assertDoctorAudience(principal);
    return this.idempotent(
      principal.personId,
      input.idempotency_key,
      'POST',
      `/doctor/prescriptions/${prescriptionId}/amend`,
      async () => {
        const row = await this.loadOwned(prescriptionId, principal.personId);
        const country = await this.prisma.country.findUniqueOrThrow({ where: { id: row.countryId } });
        await this.requirePrescribeEnabled(country.isoAlpha2);
        const resolved = await this.policy.resolvePublished(country.isoAlpha2);
        if (!this.policy.isRxAmendEnabled(resolved?.document ?? null)) {
          throw Errors.serviceDisabled('Prescription amendment is disabled for this country pack.');
        }
        await this.assertClinicalAccess(principal, row.patientPersonId, country.isoAlpha2);
        if (row.status !== PrescriptionStatus.ISSUED) {
          throw Errors.problem(409, 'ILLEGAL_PRESCRIPTION_TRANSITION', 'Illegal transition', `Cannot amend from ${row.status}`);
        }
        this.assertLines(input.lines);
        await this.assertRestrictionCodes(country.isoAlpha2, input.lines);

        const prior = row.currentVersionId
          ? await this.prisma.prescriptionVersion.findUniqueOrThrow({ where: { id: row.currentVersionId } })
          : null;
        if (!prior?.sealedAt) {
          throw Errors.problem(409, 'VERSION_NOT_SEALED', 'Version not sealed', 'Amend requires a sealed issued version.');
        }

        const nextVersionId = uuidv7();
        const nextNumber = prior.versionNumber + 1;
        const sealedAt = new Date();

        await this.prisma.$transaction(async (tx) => {
          const created = await tx.prescriptionVersion.create({
            data: {
              id: nextVersionId,
              prescriptionId,
              versionNumber: nextNumber,
              supersedesVersionId: prior.id,
              sealedAt,
              createdByPersonId: principal.personId,
              lines: {
                create: input.lines.map((line, index) => this.lineData(line, index + 1)),
              },
            },
            include: { lines: true },
          });
          const seal = this.integritySeal(created.id, created.lines);
          await tx.prescriptionVersion.update({
            where: { id: created.id },
            data: { integritySeal: seal },
          });
          await tx.prescription.update({
            where: { id: prescriptionId },
            data: { currentVersionId: nextVersionId, status: PrescriptionStatus.ISSUED },
          });
          await this.securityEvent(tx, principal.personId, 'PRESCRIPTION_AMENDED', prescriptionId);
          await this.outbox.enqueue(tx, {
            type: 'PRESCRIPTION_AMENDED',
            aggregateType: 'prescription',
            aggregateId: prescriptionId,
            producer: 'clinical',
            countryId: row.countryId,
            payload: {
              prescription_id: prescriptionId,
              patient_person_id: row.patientPersonId,
              version_id: nextVersionId,
              version_number: nextNumber,
            },
            occurrenceKey: `PRESCRIPTION_AMENDED:${prescriptionId}:${nextVersionId}`,
          });
          await this.prisma.runWithTenant(
            workerTenantContext({
              countryId: row.countryId,
              personId: principal.personId,
            }),
            () =>
              this.healthProjection.projectAmendedVersion(tx, {
                prescriptionId,
                priorVersionId: prior.id,
                prescriptionVersionId: nextVersionId,
                patientPersonId: row.patientPersonId,
                countryId: row.countryId,
                countryCode: country.isoAlpha2,
                publishedAt: sealedAt,
              }),
          );
        });

        // OD-R5C-03: supersede open cases for prior versions, then enqueue for the new sealed version.
        await this.dispensingService.supersedeOpenCasesForPrescription(
          prescriptionId,
          principal.personId,
          nextVersionId,
        );
        await this.dispensingService.enqueueForVersion(nextVersionId);

        await this.erxSubmissions.submitForIssuedVersion({
          prescriptionVersionId: nextVersionId,
          prescriptionId,
          countryId: row.countryId,
          countryCode: country.isoAlpha2,
          actorPersonId: principal.personId,
        });

        return this.present(prescriptionId, { includeLines: true });
      },
    );
  }

  async cancel(principal: Principal, prescriptionId: string, idempotencyKey: string, reasonCode?: string) {
    this.assertDoctorAudience(principal);
    return this.idempotent(principal.personId, idempotencyKey, 'POST', `/doctor/prescriptions/${prescriptionId}/cancel`, async () => {
      const row = await this.loadOwned(prescriptionId, principal.personId);
      const country = await this.prisma.country.findUniqueOrThrow({ where: { id: row.countryId } });
      await this.requirePrescribeEnabled(country.isoAlpha2);
      await this.assertClinicalAccess(principal, row.patientPersonId, country.isoAlpha2);
      this.assertTransition(row.status, PrescriptionStatus.CANCELLED);

      await this.prisma.$transaction(async (tx) => {
        await tx.prescription.update({
          where: { id: prescriptionId },
          data: { status: PrescriptionStatus.CANCELLED, cancelledAt: new Date() },
        });
        await this.appendStatus(tx, prescriptionId, row.status, PrescriptionStatus.CANCELLED, principal.personId, reasonCode ?? 'cancel');
        await this.securityEvent(tx, principal.personId, 'PRESCRIPTION_CANCELLED', prescriptionId);
        await this.outbox.enqueue(tx, {
          type: 'PRESCRIPTION_CANCELLED',
          aggregateType: 'prescription',
          aggregateId: prescriptionId,
          producer: 'clinical',
          countryId: row.countryId,
          payload: {
            prescription_id: prescriptionId,
            patient_person_id: row.patientPersonId,
            status: PrescriptionStatus.CANCELLED,
          },
          occurrenceKey: `PRESCRIPTION_CANCELLED:${prescriptionId}`,
        });
      });

      await this.erxSubmissions.cancelForPrescription({
        prescriptionId,
        countryCode: country.isoAlpha2,
        actorPersonId: principal.personId,
      });

      return this.present(prescriptionId, { includeLines: true });
    });
  }

  async listForDoctor(principal: Principal) {
    this.assertDoctorAudience(principal);
    const doctor = await this.resolveDoctor(principal.personId);
    const rows = await this.prisma.prescription.findMany({
      where: { doctorProfileId: doctor.profile.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { prescriptions: await Promise.all(rows.map((r) => this.present(r.id, { includeLines: false }))) };
  }

  async listForCustomer(principal: Principal) {
    if (principal.audience !== 'customer') {
      throw Errors.forbidden('Customer session required');
    }
    // OD-R5B-01 (R5-B explicit choice): hide DRAFT from customer — issued/cancelled only.
    const rows = await this.prisma.prescription.findMany({
      where: {
        patientPersonId: principal.personId,
        status: { not: PrescriptionStatus.DRAFT },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { prescriptions: await Promise.all(rows.map((r) => this.present(r.id, { includeLines: false }))) };
  }

  async getForDoctor(principal: Principal, id: string) {
    this.assertDoctorAudience(principal);
    await this.loadOwned(id, principal.personId);
    await this.auditView(principal.personId, id, 'doctor');
    return this.present(id, { includeLines: true });
  }

  async getForCustomer(principal: Principal, id: string) {
    if (principal.audience !== 'customer') {
      throw Errors.forbidden('Customer session required');
    }
    const row = await this.prisma.prescription.findUnique({ where: { id } });
    if (!row || row.patientPersonId !== principal.personId || row.status === PrescriptionStatus.DRAFT) {
      throw Errors.notFound('Prescription not found');
    }
    await this.auditView(principal.personId, id, 'customer');
    return this.present(id, { includeLines: true });
  }

  /**
   * R5-B: minimum encounter/patient projection for prescribe chrome.
   * OD-R5B-02 draft-lines PATCH remains deferred — recreate draft to change lines.
   */
  async prescriptionContext(principal: Principal, encounterId: string) {
    this.assertDoctorAudience(principal);
    const doctor = await this.resolveDoctor(principal.personId);
    const encounter = await this.prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        appointment: { select: { id: true, startsAt: true, endsAt: true, type: true, status: true } },
        country: { select: { id: true, isoAlpha2: true } },
      },
    });
    if (!encounter || encounter.doctorProfileId !== doctor.profile.id) {
      throw Errors.notFound('Encounter not found');
    }
    const countryCode = encounter.country.isoAlpha2;
    const resolved = await this.policy.resolvePublished(countryCode);
    const prescribeEnabled = this.policy.isRxPrescribeEnabled(resolved?.document ?? null);
    let access: { allowed: boolean; reason: string } = { allowed: false, reason: 'not_evaluated' };
    if (prescribeEnabled) {
      access = await this.clinicalAccess.evaluate({
        actorId: principal.personId,
        audience: principal.audience,
        patientPersonId: encounter.customerPersonId,
        purpose: 'consultation',
        countryCode,
      });
    }
    return {
      encounter_id: encounter.id,
      encounter_status: encounter.status,
      appointment_id: encounter.appointmentId,
      appointment_starts_at: encounter.appointment.startsAt.toISOString(),
      appointment_type: encounter.appointment.type,
      appointment_status: encounter.appointment.status,
      country_id: encounter.countryId,
      country_code: countryCode,
      patient_person_id: encounter.customerPersonId,
      doctor_profile_id: encounter.doctorProfileId,
      organization_id: encounter.organizationId,
      rx_prescribe_enabled: prescribeEnabled,
      clinical_access_allowed: access.allowed,
      clinical_access_reason: access.reason,
      note: 'Minimum necessary prescribe context. OD-R5B-02 draft-lines PATCH is deferred.',
      od_r5b_02_draft_lines_patch: 'deferred' as const,
    };
  }

  /** R5-C store preview field list — contract preparation only; no store route. */
  storePreviewContractFields(): string[] {
    return [
      'prescription_id',
      'current_version_id',
      'status',
      'country_id',
      'encounter_id',
      'line_clinical_labels',
      'quantity_authorized',
      'restriction_category_codes',
    ];
  }

  async listAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin session required');
    }
    const rows = await this.prisma.prescription.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        countryId: true,
        encounterId: true,
        doctorProfileId: true,
        patientPersonId: true,
        currentVersionId: true,
        createdAt: true,
        origin: true,
      },
    });
    return {
      prescriptions: rows.map((r) => ({
        id: r.id,
        status: r.status,
        country_id: r.countryId,
        encounter_id: r.encounterId,
        doctor_profile_id: r.doctorProfileId,
        patient_person_id: r.patientPersonId,
        current_version_id: r.currentVersionId,
        origin: r.origin,
        created_at: r.createdAt.toISOString(),
        note: 'Operational metadata only. Medication lines are not exposed on admin list.',
      })),
    };
  }

  async getAdmin(principal: Principal, id: string) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin session required');
    }
    const row = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        versions: { select: { id: true, versionNumber: true, sealedAt: true, createdAt: true } },
        statusHistory: { orderBy: { createdAt: 'asc' }, take: 20 },
      },
    });
    if (!row) {
      throw Errors.notFound('Prescription not found');
    }
    await this.auditView(principal.personId, id, 'admin');
    return {
      id: row.id,
      status: row.status,
      country_id: row.countryId,
      encounter_id: row.encounterId,
      doctor_profile_id: row.doctorProfileId,
      patient_person_id: row.patientPersonId,
      current_version_id: row.currentVersionId,
      origin: row.origin,
      created_at: row.createdAt.toISOString(),
      versions: row.versions.map((v) => ({
        id: v.id,
        version_number: v.versionNumber,
        sealed_at: v.sealedAt?.toISOString() ?? null,
        created_at: v.createdAt.toISOString(),
      })),
      status_history: row.statusHistory.map((h) => ({
        from_status: h.fromStatus,
        to_status: h.toStatus,
        reason_code: h.reasonCode,
        created_at: h.createdAt.toISOString(),
      })),
      note: 'Read-only oversight. No medication instruction payloads.',
    };
  }

  /** R5-A: never creates Order / Payment / Shipment / inventory movement. */
  assertNoCommerceSideEffects(): { order: false; payment: false; shipment: false; inventory: false; finance: false } {
    return { order: false, payment: false, shipment: false, inventory: false, finance: false };
  }

  /** R9-E: health payload delegate — structured prescription for authorized health reads. */
  async customerPrescriptionForHealth(
    patientPersonId: string,
    prescriptionId: string,
    prescriptionVersionId: string,
  ) {
    const row = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        versions: {
          where: { id: prescriptionVersionId },
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        },
      },
    });
    if (!row || row.patientPersonId !== patientPersonId) {
      throw Errors.notFound('Prescription not found');
    }
    const version = row.versions[0];
    if (!version?.sealedAt) {
      throw Errors.problem(
        404,
        'PRESCRIPTION_NOT_AVAILABLE',
        'Prescription not available',
        'Prescription version is not issued yet.',
      );
    }
    return {
      prescription_id: row.id,
      version_id: version.id,
      version_number: version.versionNumber,
      status: row.status,
      issued_at: version.sealedAt.toISOString(),
      lines: version.lines.map((line) => ({
        line_number: line.lineNumber,
        clinical_concept_code: line.clinicalConceptCode,
        clinical_concept_label: line.clinicalConceptLabel,
        strength_text: line.strengthText,
        form_text: line.formText,
        route_text: line.routeText,
        dosage_instructions: line.dosageInstructions,
        quantity_authorized: line.quantityAuthorized,
        quantity_unit: line.quantityUnit,
        days_supply: line.daysSupply,
        substitution_allowed: line.substitutionAllowed,
        restriction_category_code: line.restrictionCategoryCode,
      })),
    };
  }

  private async present(id: string, opts: { includeLines: boolean }) {
    const row = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: 'asc' },
          include: opts.includeLines ? { lines: { orderBy: { lineNumber: 'asc' } } } : undefined,
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      throw Errors.notFound('Prescription not found');
    }
    const current = row.versions.find((v) => v.id === row.currentVersionId) ?? row.versions[row.versions.length - 1];
    const dispensingStatus = await this.dispensingService.statusForPrescription(id);
    const linkedOrder = await this.prisma.order.findFirst({
      where: { prescriptionId: id },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    const commercial_status = linkedOrder
      ? 'ordered'
      : dispensingStatus.dispensing_status === 'DISPENSED'
        ? 'eligible'
        : dispensingStatus.dispensing_status
          ? 'dispensing_in_progress'
          : null;
    return {
      id: row.id,
      status: row.status,
      origin: row.origin,
      country_id: row.countryId,
      patient_person_id: row.patientPersonId,
      doctor_profile_id: row.doctorProfileId,
      doctor_partner_id: row.doctorPartnerId,
      encounter_id: row.encounterId,
      organization_id: row.organizationId,
      current_version_id: row.currentVersionId,
      current_version_number: current?.versionNumber ?? null,
      created_at: row.createdAt.toISOString(),
      cancelled_at: row.cancelledAt?.toISOString() ?? null,
      dispensing_status: dispensingStatus.dispensing_status,
      dispensing_case_id: dispensingStatus.dispensing_case_id,
      commercial_status,
      dispensing_cases: dispensingStatus.cases,
      versions: row.versions.map((v) => ({
        id: v.id,
        version_number: v.versionNumber,
        sealed_at: v.sealedAt?.toISOString() ?? null,
        supersedes_version_id: v.supersedesVersionId,
        valid_from: v.validFrom?.toISOString() ?? null,
        valid_until: v.validUntil?.toISOString() ?? null,
        created_at: v.createdAt.toISOString(),
        lines: opts.includeLines && 'lines' in v && Array.isArray(v.lines)
          ? (v.lines as Array<{
              lineNumber: number;
              clinicalConceptCode: string;
              clinicalConceptLabel: string;
              strengthText: string | null;
              formText: string | null;
              routeText: string | null;
              dosageInstructions: string;
              quantityAuthorized: string;
              quantityUnit: string | null;
              daysSupply: number | null;
              substitutionAllowed: boolean;
              restrictionCategoryCode: string | null;
              suggestedCatalogItemId: string | null;
            }>).map((l) => ({
              line_number: l.lineNumber,
              clinical_concept_code: l.clinicalConceptCode,
              clinical_concept_label: l.clinicalConceptLabel,
              strength_text: l.strengthText,
              form_text: l.formText,
              route_text: l.routeText,
              dosage_instructions: l.dosageInstructions,
              quantity_authorized: l.quantityAuthorized,
              quantity_unit: l.quantityUnit,
              days_supply: l.daysSupply,
              substitution_allowed: l.substitutionAllowed,
              restriction_category_code: l.restrictionCategoryCode,
              suggested_catalog_item_id: l.suggestedCatalogItemId,
            }))
          : undefined,
      })),
      status_history: row.statusHistory.map((h) => ({
        from_status: h.fromStatus,
        to_status: h.toStatus,
        reason_code: h.reasonCode,
        created_at: h.createdAt.toISOString(),
      })),
      commerce: this.assertNoCommerceSideEffects(),
    };
  }

  private lineData(line: PrescriptionLineInput, lineNumber: number) {
    return {
      id: uuidv7(),
      lineNumber,
      clinicalConceptCode: line.clinical_concept_code.trim(),
      clinicalConceptLabel: line.clinical_concept_label.trim(),
      strengthText: line.strength_text?.trim() || null,
      formText: line.form_text?.trim() || null,
      routeText: line.route_text?.trim() || null,
      dosageInstructions: line.dosage_instructions.trim(),
      quantityAuthorized: line.quantity_authorized.trim(),
      quantityUnit: line.quantity_unit?.trim() || null,
      daysSupply: line.days_supply ?? null,
      substitutionAllowed: line.substitution_allowed === true,
      restrictionCategoryCode: line.restriction_category_code?.trim() || null,
      suggestedCatalogItemId: line.suggested_catalog_item_id || null,
    };
  }

  private assertLines(lines: PrescriptionLineInput[]) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw Errors.validation('At least one medication line is required');
    }
    for (const line of lines) {
      if (!line.clinical_concept_code?.trim() || !line.clinical_concept_label?.trim()) {
        throw Errors.validation('clinical_concept_code and clinical_concept_label are required');
      }
      if (!line.dosage_instructions?.trim() || !line.quantity_authorized?.trim()) {
        throw Errors.validation('dosage_instructions and quantity_authorized are required');
      }
    }
  }

  private async assertRestrictionCodes(countryCode: string, lines: PrescriptionLineInput[]) {
    const resolved = await this.policy.resolvePublished(countryCode);
    const doc = resolved?.document ?? null;
    for (const line of lines) {
      const code = line.restriction_category_code?.trim();
      if (code && !this.policy.isRestrictionCodeAllowed(doc, code)) {
        throw Errors.forbidden(
          'Restricted/controlled medication category is not authorized by the country pack (fail closed).',
        );
      }
    }
  }

  private async requirePrescribeEnabled(countryCode: string) {
    const resolved = await this.policy.resolvePublished(countryCode);
    if (!this.policy.isRxPrescribeEnabled(resolved?.document ?? null)) {
      throw Errors.serviceDisabled('Prescription prescribing is disabled for this country pack.');
    }
  }

  private async assertClinicalAccess(principal: Principal, patientPersonId: string, countryCode: string) {
    const result = await this.clinicalAccess.evaluate({
      actorId: principal.personId,
      audience: principal.audience,
      patientPersonId,
      purpose: 'consultation',
      countryCode,
    });
    if (!result.allowed) {
      throw Errors.forbidden(`Clinical access denied: ${result.reason}`);
    }
  }

  private async resolveDoctor(personId: string) {
    const partner = await this.doctors.requireDoctorPartner(personId);
    const profile = await this.prisma.doctorProfile.findUnique({ where: { partnerId: partner.id } });
    if (!profile) {
      throw Errors.notFound('Doctor profile not found');
    }
    return { partner, profile };
  }

  private async loadOwned(prescriptionId: string, doctorPersonId: string) {
    const doctor = await this.resolveDoctor(doctorPersonId);
    const row = await this.prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!row || row.doctorProfileId !== doctor.profile.id) {
      throw Errors.notFound('Prescription not found');
    }
    return row;
  }

  private assertTransition(from: PrescriptionStatus, to: PrescriptionStatus) {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw Errors.problem(
        409,
        'ILLEGAL_PRESCRIPTION_TRANSITION',
        'Illegal transition',
        `Cannot transition from ${from} to ${to}`,
      );
    }
  }

  private assertDoctorAudience(principal: Principal) {
    if (principal.audience !== 'doctor') {
      throw Errors.forbidden('Doctor session required');
    }
  }

  private integritySeal(
    versionId: string,
    lines: Array<{ clinicalConceptCode: string; dosageInstructions: string; quantityAuthorized: string; lineNumber: number }>,
  ) {
    const material = JSON.stringify({
      versionId,
      lines: lines.map((l) => ({
        n: l.lineNumber,
        c: l.clinicalConceptCode,
        d: l.dosageInstructions,
        q: l.quantityAuthorized,
      })),
    });
    return createHash('sha256').update(material).digest('hex');
  }

  private async appendStatus(
    tx: Prisma.TransactionClient,
    prescriptionId: string,
    from: PrescriptionStatus | null,
    to: PrescriptionStatus,
    actorPersonId: string | null,
    reasonCode?: string,
  ) {
    await tx.prescriptionStatusHistory.create({
      data: {
        id: uuidv7(),
        prescriptionId,
        fromStatus: from ?? undefined,
        toStatus: to,
        actorPersonId: actorPersonId ?? undefined,
        reasonCode,
      },
    });
  }

  private async securityEvent(
    tx: Prisma.TransactionClient,
    actorPersonId: string,
    eventType: string,
    prescriptionId: string,
  ) {
    await tx.securityEvent.create({
      data: {
        id: uuidv7(),
        type: eventType,
        personId: actorPersonId,
        outcome: 'success',
        metadata: { prescription_id: prescriptionId },
      },
    });
  }

  private async auditView(actorPersonId: string, prescriptionId: string, audience: string) {
    await this.prisma.securityEvent.create({
      data: {
        id: uuidv7(),
        type: 'PRESCRIPTION_VIEWED',
        personId: actorPersonId,
        outcome: 'success',
        metadata: { prescription_id: prescriptionId, audience },
      },
    });
  }

  private async idempotent<T>(
    personId: string,
    key: string,
    method: string,
    path: string,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!key?.trim()) {
      throw Errors.validation('Idempotency-Key is required.');
    }
    const prior = await this.prisma.idempotencyRecord.findUnique({
      where: { personId_key: { personId, key } },
    });
    if (prior) {
      return prior.body as T;
    }
    const result = await run();
    await this.prisma.idempotencyRecord.create({
      data: {
        id: uuidv7(),
        personId,
        key,
        method,
        path,
        statusCode: 200,
        body: result as Prisma.InputJsonValue,
      },
    });
    return result;
  }
}
