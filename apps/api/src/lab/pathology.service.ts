import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  HealthArtifactType,
  LabProcessingStatus,
  LabReportVersionStatus,
  OrganizationKind,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { assertLabOrgAccess } from '../catalog/access';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { FinanceService } from '../finance/finance.service';
import { HealthTimelineService } from '../health/health-timeline.service';
import { PrivateObjectStore } from '../partner/object-store';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertReportTransition, isMutableReportStatus, isPublishedReportStatus } from './lab-report-status';

type ResultLineInput = {
  analyte_code: string;
  analyte_name: string;
  value: string;
  unit?: string;
  reference_range?: string;
};

@Injectable()
export class PathologyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly security: SecurityEventsService,
    private readonly objects: PrivateObjectStore,
    private readonly finance: FinanceService,
    @Inject(forwardRef(() => HealthTimelineService))
    private readonly healthTimeline: HealthTimelineService,
  ) {}

  async ensureDraftReportForProcessing(processingId: string, actorPersonId: string): Promise<void> {
    const processing = await this.prisma.labProcessing.findUnique({
      where: { id: processingId },
      include: { accession: true, sample: { include: { booking: true } } },
    });
    if (!processing || processing.status !== LabProcessingStatus.COMPLETED) {
      return;
    }
    const existing = await this.prisma.labReport.findUnique({ where: { labAccessionId: processing.labAccessionId } });
    if (existing) {
      return;
    }
    const reportId = uuidv7();
    const versionId = uuidv7();
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: processing.accession.countryId,
        organizationId: processing.labOrgId,
        personId: actorPersonId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.labReport.create({
            data: {
              id: reportId,
              labAccessionId: processing.labAccessionId,
              labSampleId: processing.labSampleId,
              labBookingId: processing.sample.labBookingId,
              labOrgId: processing.labOrgId,
              countryId: processing.accession.countryId,
              sandbox: true,
            },
          });
          await tx.labReportVersion.create({
            data: {
              id: versionId,
              labReportId: reportId,
              versionNumber: 1,
              status: LabReportVersionStatus.DRAFT,
              enteredByPersonId: actorPersonId,
              sandbox: true,
            },
          });
          await tx.labReport.update({
            where: { id: reportId },
            data: { currentVersionId: versionId },
          });
        });
      },
    );
    await this.security.emit({
      type: 'LAB_REPORT_DRAFT_CREATED',
      outcome: 'success',
      personId: actorPersonId,
      metadata: { lab_report_id: reportId, lab_org_id: processing.labOrgId, sandbox: true },
    });
  }

  async listLabPathology(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const rows = await this.prisma.labReport.findMany({
      where: { labOrgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        currentVersion: { include: { resultLines: true } },
        accession: true,
        sample: { include: { booking: { include: { lines: true } } } },
      },
    });
    return {
      data: rows.map((row) => this.presentReportMetadata(row)),
      note: 'Report metadata only. Result values require pathology authorization.',
    };
  }

  async listPathologistWork(principal: Principal, labOrgId: string) {
    await this.assertPathologist(principal, labOrgId);
    const rows = await this.prisma.labReport.findMany({
      where: {
        labOrgId,
        OR: [
          { assignedPathologistPersonId: principal.personId },
          { assignedPathologistPersonId: null },
        ],
        currentVersion: {
          status: { in: [LabReportVersionStatus.PENDING_VERIFY, LabReportVersionStatus.VERIFIED, LabReportVersionStatus.DRAFT] },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        currentVersion: { include: { resultLines: true } },
        accession: true,
        sample: { include: { booking: { include: { lines: true } } } },
      },
    });
    return {
      data: rows.map((row) => this.presentPathologistCase(row)),
      note: 'Assigned pathology work only. Sandbox e-sign abstraction.',
    };
  }

  async getReportForLab(principal: Principal, labOrgId: string, reportId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    return this.loadReportView(reportId, labOrgId, { includeDraftResults: true });
  }

  async getReportForPathologist(principal: Principal, labOrgId: string, reportId: string) {
    await this.assertPathologist(principal, labOrgId);
    return this.loadReportView(reportId, labOrgId, { includeDraftResults: true });
  }

  async assignPathologist(principal: Principal, labOrgId: string, reportId: string) {
    await this.assertPathologist(principal, labOrgId);
    const report = await this.assertReportForLab(labOrgId, reportId);
    if (report.assignedPathologistPersonId && report.assignedPathologistPersonId !== principal.personId) {
      throw Errors.forbidden('Case is assigned to another pathologist.');
    }
    await this.prisma.labReport.update({
      where: { id: reportId },
      data: { assignedPathologistPersonId: principal.personId },
    });
    return this.loadReportView(reportId, labOrgId, { includeDraftResults: true });
  }

  async enterResults(
    principal: Principal,
    labOrgId: string,
    reportId: string,
    input: { summary?: string; lines: ResultLineInput[]; idempotency_key?: string },
  ) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    await this.assertNotPathologistOnly(principal, labOrgId);
    const report = await this.assertReportForLab(labOrgId, reportId);
    const version = await this.loadCurrentVersion(report);
    if (!isMutableReportStatus(version.status) || version.status !== LabReportVersionStatus.DRAFT) {
      throw Errors.problem(409, 'REPORT_NOT_EDITABLE', 'Not editable', 'Only DRAFT reports accept result entry.');
    }
    if (!input.lines.length) {
      throw Errors.validation('At least one result line is required.');
    }
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: report.countryId,
        organizationId: labOrgId,
        personId: principal.personId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.labResultLine.deleteMany({ where: { labReportVersionId: version.id } });
          for (const line of input.lines) {
            await tx.labResultLine.create({
              data: {
                id: uuidv7(),
                labReportVersionId: version.id,
                analyteCode: line.analyte_code,
                analyteName: line.analyte_name,
                value: line.value,
                unit: line.unit ?? null,
                referenceRange: line.reference_range ?? null,
                enteredByPersonId: principal.personId,
              },
            });
          }
          await tx.labReportVersion.update({
            where: { id: version.id },
            data: {
              summary: input.summary ?? version.summary,
              enteredByPersonId: principal.personId,
            },
          });
        });
      },
    );
    await this.security.emit({
      type: 'LAB_REPORT_RESULTS_ENTERED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { lab_report_id: reportId, lab_org_id: labOrgId, sandbox: true },
    });
    return this.loadReportView(reportId, labOrgId, { includeDraftResults: true });
  }

  async submitForVerify(principal: Principal, labOrgId: string, reportId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    await this.assertNotPathologistOnly(principal, labOrgId);
    const report = await this.assertReportForLab(labOrgId, reportId);
    const version = await this.prisma.labReportVersion.findUnique({
      where: { id: report.currentVersionId! },
      include: { resultLines: true },
    });
    if (!version) {
      throw Errors.notFound('Report version not found.');
    }
    assertReportTransition(version.status, LabReportVersionStatus.PENDING_VERIFY);
    if (!version.resultLines.length) {
      throw Errors.validation('Enter results before submitting for verification.');
    }
    await this.prisma.labReportVersion.update({
      where: { id: version.id },
      data: { status: LabReportVersionStatus.PENDING_VERIFY },
    });
    await this.security.emit({
      type: 'LAB_REPORT_SUBMITTED_VERIFY',
      outcome: 'success',
      personId: principal.personId,
      metadata: { lab_report_id: reportId, lab_org_id: labOrgId, sandbox: true },
    });
    return this.loadReportView(reportId, labOrgId, { includeDraftResults: true });
  }

  async verifyReport(principal: Principal, labOrgId: string, reportId: string) {
    await this.assertPathologist(principal, labOrgId);
    const report = await this.assertReportForLab(labOrgId, reportId);
    const version = await this.loadCurrentVersion(report);
    this.assertSod(version.enteredByPersonId, principal.personId, 'verify');
    assertReportTransition(version.status, LabReportVersionStatus.VERIFIED);
    await this.prisma.labReportVersion.update({
      where: { id: version.id },
      data: {
        status: LabReportVersionStatus.VERIFIED,
        verifiedByPersonId: principal.personId,
      },
    });
    await this.security.emit({
      type: 'LAB_REPORT_VERIFIED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { lab_report_id: reportId, lab_org_id: labOrgId, sandbox: true },
    });
    return this.loadReportView(reportId, labOrgId, { includeDraftResults: true });
  }

  async publishReport(principal: Principal, labOrgId: string, reportId: string, idempotencyKey?: string) {
    await this.assertPathologist(principal, labOrgId);
    const report = await this.assertReportForLab(labOrgId, reportId);
    const version = await this.loadCurrentVersion(report, { includeResultLines: true });
    this.assertSod(version.enteredByPersonId, principal.personId, 'publish');
    assertReportTransition(version.status, LabReportVersionStatus.PUBLISHED);
    const booking = await this.prisma.labBooking.findUniqueOrThrow({ where: { id: report.labBookingId } });
    const payload = {
      report_id: report.id,
      version_number: version.versionNumber,
      accession_id: report.labAccessionId,
      summary: version.summary,
      results: version.resultLines.map((line) => ({
        analyte_code: line.analyteCode,
        analyte_name: line.analyteName,
        value: line.value,
        unit: line.unit,
        reference_range: line.referenceRange,
      })),
      sandbox: true,
      note: 'Sandbox diagnostic report. Not for clinical use.',
    };
    const stored = await this.objects.put({
      bytes: Buffer.from(JSON.stringify(payload)),
      contentType: 'application/json',
      prefix: `lab-reports/${labOrgId}`,
    });
    const artifactId = uuidv7();
    const publishedAt = new Date();
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: report.countryId,
        organizationId: labOrgId,
        personId: principal.personId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.labReportVersion.update({
            where: { id: version.id },
            data: {
              status: LabReportVersionStatus.PUBLISHED,
              publishedByPersonId: principal.personId,
              publishedAt,
              objectKey: stored.key,
            },
          });
          await tx.healthArtifact.create({
            data: {
              id: artifactId,
              personId: booking.customerPersonId,
              countryId: report.countryId,
              title: 'Lab diagnostic report',
              artifactType: HealthArtifactType.LAB_REPORT,
              labReportVersionId: version.id,
              labBookingId: report.labBookingId,
              publishedAt,
              sandbox: true,
            },
          });
          await this.healthTimeline.projectArtifactPublished(tx, {
            personId: booking.customerPersonId,
            countryId: report.countryId,
            artifactId,
            artifactType: HealthArtifactType.LAB_REPORT,
            sourceModule: 'lab',
            sourceId: report.labBookingId,
            title: 'Lab diagnostic report',
            occurredAt: publishedAt,
            sandbox: true,
          });
          await this.outbox.enqueue(tx, {
            type: 'LAB_REPORT_PUBLISHED',
            aggregateType: 'LabReport',
            aggregateId: report.id,
            producer: 'lab',
            countryId: report.countryId,
            payload: {
              artifact_id: artifactId,
              lab_report_id: report.id,
              lab_booking_id: report.labBookingId,
              lab_org_id: labOrgId,
              customer_person_id: booking.customerPersonId,
              version_number: version.versionNumber,
              sandbox: true,
            },
            occurrenceKey: idempotencyKey ?? `lab_report_published:${version.id}`,
          });
        });
        await this.finance.recordSandboxLabPayable({
          countryId: report.countryId,
          labBookingId: report.labBookingId,
          amountMinor: booking.totalMinor,
          currency: booking.currency,
        });
      },
    );
    await this.security.emit({
      type: 'LAB_REPORT_PUBLISHED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { lab_report_id: reportId, lab_org_id: labOrgId, sandbox: true },
    });
    return this.loadReportView(reportId, labOrgId, { includeDraftResults: true });
  }

  async amendReport(principal: Principal, labOrgId: string, reportId: string, reason: string) {
    await this.assertPathologist(principal, labOrgId);
    if (!reason?.trim()) {
      throw Errors.validation('amendment reason is required.');
    }
    const report = await this.assertReportForLab(labOrgId, reportId);
    const current = await this.loadCurrentVersion(report, { includeResultLines: true });
    if (!isPublishedReportStatus(current.status)) {
      throw Errors.problem(409, 'REPORT_NOT_PUBLISHED', 'Not published', 'Only published reports can be amended.');
    }
    const booking = await this.prisma.labBooking.findUniqueOrThrow({ where: { id: report.labBookingId } });
    const versionId = uuidv7();
    const nextVersion = current.versionNumber + 1;
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: report.countryId,
        organizationId: labOrgId,
        personId: principal.personId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.labReportVersion.create({
            data: {
              id: versionId,
              labReportId: report.id,
              versionNumber: nextVersion,
              status: LabReportVersionStatus.DRAFT,
              enteredByPersonId: principal.personId,
              amendsVersionId: current.id,
              amendmentReason: reason.trim(),
              summary: current.summary,
              sandbox: true,
            },
          });
          for (const line of current.resultLines) {
            await tx.labResultLine.create({
              data: {
                id: uuidv7(),
                labReportVersionId: versionId,
                analyteCode: line.analyteCode,
                analyteName: line.analyteName,
                value: line.value,
                unit: line.unit,
                referenceRange: line.referenceRange,
                enteredByPersonId: principal.personId,
              },
            });
          }
          await tx.labReport.update({
            where: { id: report.id },
            data: { currentVersionId: versionId },
          });
          await this.outbox.enqueue(tx, {
            type: 'LAB_REPORT_AMENDED',
            aggregateType: 'LabReport',
            aggregateId: report.id,
            producer: 'lab',
            countryId: report.countryId,
            payload: {
              lab_report_id: report.id,
              lab_booking_id: report.labBookingId,
              lab_org_id: labOrgId,
              customer_person_id: booking.customerPersonId,
              version_number: nextVersion,
              sandbox: true,
            },
            occurrenceKey: `lab_report_amended:${versionId}`,
          });
        });
      },
    );
    await this.security.emit({
      type: 'LAB_REPORT_AMENDED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { lab_report_id: reportId, lab_org_id: labOrgId, sandbox: true },
    });
    return this.loadReportView(reportId, labOrgId, { includeDraftResults: true });
  }

  async getCustomerReportStatus(labBookingId: string, customerPersonId: string) {
    const booking = await this.prisma.labBooking.findUnique({ where: { id: labBookingId } });
    if (!booking || booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s lab booking.');
    }
    const report = await this.prisma.labReport.findUnique({
      where: { labBookingId },
      include: { currentVersion: true },
    });
    if (!report) {
      return {
        lab_booking_id: labBookingId,
        report_available: false,
        status: null,
        note: 'Diagnostic report is not ready yet.',
      };
    }
    const published = report.currentVersion?.status === LabReportVersionStatus.PUBLISHED;
    return {
      lab_booking_id: labBookingId,
      lab_report_id: report.id,
      report_available: published,
      status: report.currentVersion?.status ?? null,
      version_number: report.currentVersion?.versionNumber ?? null,
      published_at: report.currentVersion?.publishedAt?.toISOString() ?? null,
      note: published
        ? 'Final report available. Open to view.'
        : 'Report is being reviewed. Results are not available yet.',
    };
  }

  async getCustomerPublishedReport(labBookingId: string, customerPersonId: string) {
    const booking = await this.prisma.labBooking.findUnique({ where: { id: labBookingId } });
    if (!booking || booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s lab booking.');
    }
    const report = await this.prisma.labReport.findUnique({
      where: { labBookingId },
      include: {
        currentVersion: { include: { resultLines: true } },
        accession: true,
      },
    });
    if (!report?.currentVersion || report.currentVersion.status !== LabReportVersionStatus.PUBLISHED) {
      throw Errors.problem(404, 'REPORT_NOT_AVAILABLE', 'Report not available', 'Final report is not published yet.');
    }
    await this.security.emit({
      type: 'LAB_REPORT_CUSTOMER_VIEW',
      outcome: 'success',
      personId: customerPersonId,
      metadata: { lab_report_id: report.id, lab_booking_id: labBookingId, sandbox: true },
    });
    return {
      lab_booking_id: labBookingId,
      lab_report_id: report.id,
      accession_number: report.accession.accessionNumber,
      version_number: report.currentVersion.versionNumber,
      published_at: report.currentVersion.publishedAt?.toISOString() ?? null,
      summary: report.currentVersion.summary,
      results: report.currentVersion.resultLines.map((line) => ({
        analyte_name: line.analyteName,
        value: line.value,
        unit: line.unit,
        reference_range: line.referenceRange,
      })),
      sandbox: true,
      note: 'Sandbox diagnostic report. Not for clinical use.',
    };
  }

  async listAdminReportMetadata(labOrgId: string) {
    const rows = await this.prisma.labReport.findMany({
      where: { labOrgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { currentVersion: true, accession: true },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        accession_number: row.accession.accessionNumber,
        status: row.currentVersion?.status ?? null,
        version_number: row.currentVersion?.versionNumber ?? null,
        published_at: row.currentVersion?.publishedAt?.toISOString() ?? null,
        sandbox: row.sandbox,
      })),
      note: 'Governance metadata only. No clinical editing.',
    };
  }

  private async loadReportView(
    reportId: string,
    labOrgId: string,
    opts: { includeDraftResults: boolean },
  ) {
    const report = await this.prisma.labReport.findUnique({
      where: { id: reportId },
      include: {
        accession: true,
        currentVersion: { include: { resultLines: true } },
        sample: { include: { booking: { include: { lines: true } } } },
      },
    });
    if (!report || report.labOrgId !== labOrgId) {
      throw Errors.forbidden('Report not found for this laboratory.');
    }
    const version = report.currentVersion;
    const includeResults =
      opts.includeDraftResults ||
      (version && isPublishedReportStatus(version.status));
    return {
      id: report.id,
      lab_org_id: report.labOrgId,
      lab_booking_id: report.labBookingId,
      lab_sample_id: report.labSampleId,
      accession_number: report.accession.accessionNumber,
      test_title: report.sample.booking.lines[0]?.title ?? 'Lab test',
      container_barcode: report.sample.containerBarcode,
      assigned_pathologist_id: report.assignedPathologistPersonId,
      version: version
        ? {
            id: version.id,
            version_number: version.versionNumber,
            status: version.status,
            summary: version.summary,
            entered_by: version.enteredByPersonId,
            verified_by: version.verifiedByPersonId,
            published_by: version.publishedByPersonId,
            published_at: version.publishedAt?.toISOString() ?? null,
            amendment_reason: version.amendmentReason,
            results: includeResults
              ? version.resultLines.map((line) => ({
                  analyte_code: line.analyteCode,
                  analyte_name: line.analyteName,
                  value: line.value,
                  unit: line.unit,
                  reference_range: line.referenceRange,
                }))
              : [],
          }
        : null,
      sandbox: report.sandbox,
      note: 'Diagnostic workflow only. Sandbox.',
    };
  }

  private presentReportMetadata(
    row: Prisma.LabReportGetPayload<{
      include: {
        currentVersion: { include: { resultLines: true } };
        accession: true;
        sample: { include: { booking: { include: { lines: true } } } };
      };
    }>,
  ) {
    return {
      id: row.id,
      accession_number: row.accession.accessionNumber,
      test_title: row.sample.booking.lines[0]?.title ?? 'Lab test',
      status: row.currentVersion?.status ?? null,
      version_number: row.currentVersion?.versionNumber ?? null,
      result_line_count: row.currentVersion?.resultLines.length ?? 0,
      assigned_pathologist_id: row.assignedPathologistPersonId,
      sandbox: row.sandbox,
    };
  }

  private presentPathologistCase(
    row: Prisma.LabReportGetPayload<{
      include: {
        currentVersion: { include: { resultLines: true } };
        accession: true;
        sample: { include: { booking: { include: { lines: true } } } };
      };
    }>,
  ) {
    return {
      ...this.presentReportMetadata(row),
      summary: row.currentVersion?.summary ?? null,
      results: row.currentVersion?.resultLines.map((line) => ({
        analyte_name: line.analyteName,
        value: line.value,
        unit: line.unit,
        reference_range: line.referenceRange,
      })),
    };
  }

  private async assertReportForLab(labOrgId: string, reportId: string) {
    const report = await this.prisma.labReport.findUnique({ where: { id: reportId } });
    if (!report || report.labOrgId !== labOrgId) {
      throw Errors.forbidden('Report not found for this laboratory.');
    }
    return report;
  }

  private async loadCurrentVersion(
    report: { id: string; currentVersionId: string | null },
    opts?: { includeResultLines?: boolean },
  ) {
    if (!report.currentVersionId) {
      throw Errors.problem(500, 'REPORT_VERSION_MISSING', 'Misconfigured report', 'Report has no current version.');
    }
    const version = await this.prisma.labReportVersion.findUnique({
      where: { id: report.currentVersionId },
      include: opts?.includeResultLines ? { resultLines: true } : undefined,
    });
    if (!version) {
      throw Errors.notFound('Report version not found.');
    }
    return version as Prisma.LabReportVersionGetPayload<{ include: { resultLines: true } }>;
  }

  private assertSod(enteredByPersonId: string, actorPersonId: string, action: string) {
    if (enteredByPersonId === actorPersonId) {
      throw Errors.forbidden(`Separation of duty: you cannot ${action} a report you entered.`);
    }
  }

  async assertPathologist(principal: Principal, labOrgId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { personId: principal.personId, partnerTypeCode: 'PATHOLOGIST' },
    });
    if (!partner) {
      throw Errors.forbidden('Pathologist partner profile required.');
    }
    const membership = await this.prisma.membership.count({
      where: {
        personId: principal.personId,
        organizationId: labOrgId,
        status: 'ACTIVE',
        deletedAt: null,
        organization: { kind: OrganizationKind.LAB },
      },
    });
    if (!membership) {
      throw Errors.forbidden('Laboratory membership required for pathology work.');
    }
  }

  private async assertNotPathologistOnly(principal: Principal, _labOrgId: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { personId: principal.personId, partnerTypeCode: 'PATHOLOGIST' },
    });
    if (partner) {
      throw Errors.forbidden('Result entry is restricted to lab staff. Pathologists must verify and sign only.');
    }
  }
}
