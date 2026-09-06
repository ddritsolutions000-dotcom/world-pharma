import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  ImagingReportVersionStatus,
  ImagingStudyStatus,
  OrganizationKind,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { assertImagingOrgAccess } from '../catalog/access';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { FinanceService } from '../finance/finance.service';
import { HealthDiagnosticProjectionService } from '../health/health-diagnostic-projection.service';
import { PrivateObjectStore } from '../partner/object-store';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  assertImagingReportTransition,
  isMutableImagingReportStatus,
  isPublishedImagingReportStatus,
} from './imaging-report-status';

type FindingLineInput = {
  finding_code: string;
  finding_text: string;
  body_region_code?: string;
  severity_code?: string;
  sort_order?: number;
};

const reportInclude = {
  study: {
    include: {
      booking: { include: { lines: true } },
      acquisition: true,
      imagingLocation: { select: { id: true, name: true, city: true } },
      series: { include: { instances: true } },
    },
  },
  currentVersion: { include: { findingLines: true } },
} as const;

type ReportRow = Prisma.ImagingReportGetPayload<{ include: typeof reportInclude }>;

@Injectable()
export class InterpretationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly security: SecurityEventsService,
    private readonly objects: PrivateObjectStore,
    private readonly finance: FinanceService,
    @Inject(forwardRef(() => HealthDiagnosticProjectionService))
    private readonly healthDiagnostic: HealthDiagnosticProjectionService,
  ) {}

  /** Idempotent: create DRAFT report when study reaches ACQUIRED. */
  async ensureDraftReportForAcquiredStudy(imagingStudyId: string, actorPersonId: string): Promise<void> {
    const study = await this.prisma.imagingStudy.findUnique({
      where: { id: imagingStudyId },
      include: { booking: true },
    });
    if (!study || study.status !== ImagingStudyStatus.ACQUIRED) {
      return;
    }
    const existing = await this.prisma.imagingReport.findUnique({ where: { imagingStudyId } });
    if (existing) {
      return;
    }
    const reportId = uuidv7();
    const versionId = uuidv7();
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: study.countryId,
        organizationId: study.imagingOrgId,
        personId: actorPersonId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingReport.create({
            data: {
              id: reportId,
              imagingStudyId: study.id,
              imagingBookingId: study.imagingBookingId,
              imagingOrgId: study.imagingOrgId,
              countryId: study.countryId,
              sandbox: true,
            },
          });
          await tx.imagingReportVersion.create({
            data: {
              id: versionId,
              imagingReportId: reportId,
              versionNumber: 1,
              status: ImagingReportVersionStatus.DRAFT,
              enteredByPersonId: actorPersonId,
              sandbox: true,
            },
          });
          await tx.imagingReport.update({
            where: { id: reportId },
            data: { currentVersionId: versionId },
          });
          await this.outbox.enqueue(tx, {
            type: 'IMAGING_REPORT_DRAFT_CREATED',
            aggregateType: 'ImagingReport',
            aggregateId: reportId,
            producer: 'radiology',
            countryId: study.countryId,
            payload: {
              imaging_report_id: reportId,
              imaging_study_id: study.id,
              imaging_org_id: study.imagingOrgId,
              sandbox: true,
            },
            occurrenceKey: `imaging_report_draft_created:${reportId}`,
          });
        });
      },
    );
    await this.security.emit({
      type: 'IMAGING_REPORT_DRAFT_CREATED',
      outcome: 'success',
      personId: actorPersonId,
      metadata: {
        imaging_report_id: reportId,
        imaging_study_id: study.id,
        imaging_org_id: study.imagingOrgId,
        sandbox: true,
      },
    });
  }

  async listRadiologistOrganizations(principal: Principal) {
    await this.assertRadiologistPartner(principal);
    const memberships = await this.prisma.membership.findMany({
      where: {
        personId: principal.personId,
        status: 'ACTIVE',
        deletedAt: null,
        organizationId: { not: null },
        organization: { kind: OrganizationKind.IMAGING_CENTER },
      },
      include: {
        organization: {
          select: {
            id: true,
            displayName: true,
            country: { select: { isoAlpha2: true } },
          },
        },
        role: { select: { code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const seen = new Map<string, unknown>();
    for (const row of memberships) {
      if (!row.organization) {
        continue;
      }
      seen.set(row.organization.id, {
        id: row.organization.id,
        display_name: row.organization.displayName,
        country_code: row.organization.country.isoAlpha2,
        role_code: row.role.code,
      });
    }
    return { data: [...seen.values()] };
  }

  async listWorklist(principal: Principal, imagingOrgId: string) {
    await this.assertRadiologist(principal, imagingOrgId);
    const rows = await this.prisma.imagingReport.findMany({
      where: {
        imagingOrgId,
        study: { status: ImagingStudyStatus.ACQUIRED },
        OR: [
          { assignedRadiologistPersonId: principal.personId },
          { assignedRadiologistPersonId: null },
        ],
        currentVersion: {
          status: {
            in: [
              ImagingReportVersionStatus.DRAFT,
              ImagingReportVersionStatus.PENDING_VERIFY,
              ImagingReportVersionStatus.VERIFIED,
            ],
          },
        },
      },
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      data: rows.map((row) => this.presentWorklistCase(row)),
      note: 'Assigned radiology work only. Customer publication remains OFF (R8-E).',
      boundary: { publication: false, pacs: false, dicom: false },
    };
  }

  async listVerifyQueue(principal: Principal, imagingOrgId: string) {
    await this.assertRadiologist(principal, imagingOrgId);
    const rows = await this.prisma.imagingReport.findMany({
      where: {
        imagingOrgId,
        currentVersion: { status: ImagingReportVersionStatus.PENDING_VERIFY },
        study: { status: ImagingStudyStatus.ACQUIRED },
      },
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      data: rows.map((row) => this.presentWorklistCase(row, { includeFindings: false })),
      note: 'Pending verification queue. No diagnostic content in notifications.',
      boundary: { publication: false },
    };
  }

  async getCaseByStudyId(principal: Principal, imagingOrgId: string, studyId: string) {
    await this.assertRadiologist(principal, imagingOrgId);
    const report = await this.prisma.imagingReport.findUnique({
      where: { imagingStudyId: studyId },
      include: reportInclude,
    });
    if (!report || report.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Case not found for this imaging center.');
    }
    this.assertCaseAccess(report, principal.personId);
    this.assertStudyEligible(report.study);
    return this.presentCaseDetail(report);
  }

  async assignRadiologist(principal: Principal, imagingOrgId: string, reportId: string) {
    await this.assertRadiologist(principal, imagingOrgId);
    const report = await this.assertReportForOrg(imagingOrgId, reportId);
    this.assertStudyEligible(report.study);
    if (report.assignedRadiologistPersonId && report.assignedRadiologistPersonId !== principal.personId) {
      throw Errors.forbidden('Case is assigned to another radiologist.');
    }
    await this.prisma.imagingReport.update({
      where: { id: reportId },
      data: { assignedRadiologistPersonId: principal.personId },
    });
    await this.security.emit({
      type: 'IMAGING_REPORT_ASSIGNED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        imaging_report_id: reportId,
        imaging_org_id: imagingOrgId,
        sandbox: true,
      },
    });
    return this.loadCaseView(reportId, imagingOrgId, principal.personId);
  }

  async enterFindings(
    principal: Principal,
    imagingOrgId: string,
    reportId: string,
    input: { summary?: string; findings: FindingLineInput[] },
  ) {
    await this.assertRadiologist(principal, imagingOrgId);
    const report = await this.assertReportForOrg(imagingOrgId, reportId);
    this.assertStudyEligible(report.study);
    const version = await this.loadCurrentVersion(report);
    if (!isMutableImagingReportStatus(version.status) || version.status !== ImagingReportVersionStatus.DRAFT) {
      throw Errors.problem(409, 'REPORT_NOT_EDITABLE', 'Not editable', 'Only DRAFT reports accept findings.');
    }
    this.assertAssignedToActor(report, principal.personId);
    if (!input.findings.length) {
      throw Errors.validation('At least one finding line is required.');
    }
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: report.countryId,
        organizationId: imagingOrgId,
        personId: principal.personId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingFindingLine.deleteMany({ where: { imagingReportVersionId: version.id } });
          for (const [index, line] of input.findings.entries()) {
            await tx.imagingFindingLine.create({
              data: {
                id: uuidv7(),
                imagingReportVersionId: version.id,
                findingCode: line.finding_code,
                findingText: line.finding_text,
                bodyRegionCode: line.body_region_code ?? null,
                severityCode: line.severity_code ?? null,
                sortOrder: line.sort_order ?? index,
                enteredByPersonId: principal.personId,
              },
            });
          }
          await tx.imagingReportVersion.update({
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
      type: 'IMAGING_REPORT_FINDINGS_ENTERED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { imaging_report_id: reportId, imaging_org_id: imagingOrgId, sandbox: true },
    });
    return this.loadCaseView(reportId, imagingOrgId, principal.personId);
  }

  async submitForVerify(principal: Principal, imagingOrgId: string, reportId: string) {
    await this.assertRadiologist(principal, imagingOrgId);
    const report = await this.assertReportForOrg(imagingOrgId, reportId);
    this.assertAssignedToActor(report, principal.personId);
    const version = await this.prisma.imagingReportVersion.findUnique({
      where: { id: report.currentVersionId! },
      include: { findingLines: true },
    });
    if (!version) {
      throw Errors.notFound('Report version not found.');
    }
    assertImagingReportTransition(version.status, ImagingReportVersionStatus.PENDING_VERIFY);
    if (!version.findingLines.length) {
      throw Errors.validation('Enter findings before submitting for verification.');
    }
    await this.prisma.imagingReportVersion.update({
      where: { id: version.id },
      data: { status: ImagingReportVersionStatus.PENDING_VERIFY },
    });
    await this.security.emit({
      type: 'IMAGING_REPORT_SUBMITTED_VERIFY',
      outcome: 'success',
      personId: principal.personId,
      metadata: { imaging_report_id: reportId, imaging_org_id: imagingOrgId, sandbox: true },
    });
    return this.loadCaseView(reportId, imagingOrgId, principal.personId);
  }

  async verifyReport(principal: Principal, imagingOrgId: string, reportId: string) {
    await this.assertRadiologist(principal, imagingOrgId);
    const report = await this.assertReportForOrg(imagingOrgId, reportId);
    const version = await this.loadCurrentVersion(report);
    this.assertSod(version.enteredByPersonId, principal.personId, 'verify');
    assertImagingReportTransition(version.status, ImagingReportVersionStatus.VERIFIED);
    await this.prisma.imagingReportVersion.update({
      where: { id: version.id },
      data: {
        status: ImagingReportVersionStatus.VERIFIED,
        verifiedByPersonId: principal.personId,
      },
    });
    await this.security.emit({
      type: 'IMAGING_REPORT_VERIFIED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { imaging_report_id: reportId, imaging_org_id: imagingOrgId, sandbox: true },
    });
    return this.loadCaseView(reportId, imagingOrgId, principal.personId);
  }

  async publishReport(
    principal: Principal,
    imagingOrgId: string,
    reportId: string,
    idempotencyKey?: string,
  ) {
    await this.assertRadiologist(principal, imagingOrgId);
    const report = await this.assertReportForOrg(imagingOrgId, reportId);
    this.assertStudyEligible(report.study);
    const version = await this.loadCurrentVersion(report);
    if (isPublishedImagingReportStatus(version.status)) {
      return this.loadCaseView(reportId, imagingOrgId, principal.personId);
    }
    this.assertSod(version.enteredByPersonId, principal.personId, 'publish');
    assertImagingReportTransition(version.status, ImagingReportVersionStatus.PUBLISHED);
    if (!version.findingLines.length) {
      throw Errors.validation('Verified report must include findings before publication.');
    }
    const booking = await this.prisma.imagingBooking.findUniqueOrThrow({
      where: { id: report.imagingBookingId },
    });
    if (booking.status === 'CANCELLED') {
      throw Errors.problem(
        409,
        'IMAGING_BOOKING_CANCELLED',
        'Booking cancelled',
        'Cancelled imaging bookings cannot publish reports.',
      );
    }
    const study = await this.prisma.imagingStudy.findUniqueOrThrow({
      where: { id: report.imagingStudyId },
    });
    const payload = {
      report_id: report.id,
      version_number: version.versionNumber,
      accession_number: study.accessionNumber,
      summary: version.summary,
      findings: version.findingLines.map((line) => ({
        finding_code: line.findingCode,
        finding_text: line.findingText,
        body_region_code: line.bodyRegionCode,
        severity_code: line.severityCode,
      })),
      sandbox: true,
      note: 'Sandbox imaging report. Not for clinical use.',
    };
    const stored = await this.objects.put({
      bytes: Buffer.from(JSON.stringify(payload)),
      contentType: 'application/json',
      prefix: `imaging-reports/${imagingOrgId}`,
    });
    const publishedAt = new Date();
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: report.countryId,
        organizationId: imagingOrgId,
        personId: principal.personId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingReportVersion.update({
            where: { id: version.id },
            data: {
              status: ImagingReportVersionStatus.PUBLISHED,
              publishedByPersonId: principal.personId,
              publishedAt,
              objectKey: stored.key,
            },
          });
          const artifact = await this.healthDiagnostic.projectPublishedImagingReport(tx, {
            imagingReportVersionId: version.id,
            imagingBookingId: report.imagingBookingId,
            personId: booking.customerPersonId,
            countryId: report.countryId,
            publishedAt,
            subjectFamilyMemberId: booking.subjectFamilyMemberId,
          });
          await this.outbox.enqueue(tx, {
            type: 'IMAGING_REPORT_PUBLISHED',
            aggregateType: 'ImagingReport',
            aggregateId: report.id,
            producer: 'radiology',
            countryId: report.countryId,
            payload: {
              artifact_id: artifact.id,
              imaging_report_id: report.id,
              imaging_booking_id: report.imagingBookingId,
              imaging_org_id: imagingOrgId,
              customer_person_id: booking.customerPersonId,
              version_number: version.versionNumber,
              sandbox: true,
            },
            occurrenceKey: idempotencyKey ?? `imaging_report_published:${version.id}`,
          });
        });
        await this.finance.recordSandboxImagingPayable({
          countryId: report.countryId,
          imagingBookingId: report.imagingBookingId,
          amountMinor: booking.totalMinor,
          currency: booking.currency,
        });
      },
    );
    await this.security.emit({
      type: 'IMAGING_REPORT_PUBLISHED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { imaging_report_id: reportId, imaging_org_id: imagingOrgId, sandbox: true },
    });
    return this.loadCaseView(reportId, imagingOrgId, principal.personId);
  }

  async amendReport(principal: Principal, imagingOrgId: string, reportId: string, reason: string) {
    await this.assertRadiologist(principal, imagingOrgId);
    if (!reason?.trim()) {
      throw Errors.validation('amendment reason is required.');
    }
    const report = await this.assertReportForOrg(imagingOrgId, reportId);
    const current = await this.loadCurrentVersion(report);
    if (!isPublishedImagingReportStatus(current.status)) {
      throw Errors.problem(
        409,
        'REPORT_NOT_PUBLISHED',
        'Not published',
        'Only published reports can be amended.',
      );
    }
    const booking = await this.prisma.imagingBooking.findUniqueOrThrow({
      where: { id: report.imagingBookingId },
    });
    const versionId = uuidv7();
    const nextVersion = current.versionNumber + 1;
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: report.countryId,
        organizationId: imagingOrgId,
        personId: principal.personId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingReportVersion.create({
            data: {
              id: versionId,
              imagingReportId: report.id,
              versionNumber: nextVersion,
              status: ImagingReportVersionStatus.DRAFT,
              enteredByPersonId: principal.personId,
              amendsVersionId: current.id,
              amendmentReason: reason.trim(),
              summary: current.summary,
              sandbox: true,
            },
          });
          for (const line of current.findingLines) {
            await tx.imagingFindingLine.create({
              data: {
                id: uuidv7(),
                imagingReportVersionId: versionId,
                findingCode: line.findingCode,
                findingText: line.findingText,
                bodyRegionCode: line.bodyRegionCode,
                severityCode: line.severityCode,
                sortOrder: line.sortOrder,
                enteredByPersonId: principal.personId,
              },
            });
          }
          await tx.imagingReport.update({
            where: { id: report.id },
            data: { currentVersionId: versionId },
          });
          await this.outbox.enqueue(tx, {
            type: 'IMAGING_REPORT_AMENDED',
            aggregateType: 'ImagingReport',
            aggregateId: report.id,
            producer: 'radiology',
            countryId: report.countryId,
            payload: {
              imaging_report_id: report.id,
              imaging_booking_id: report.imagingBookingId,
              imaging_org_id: imagingOrgId,
              customer_person_id: booking.customerPersonId,
              version_number: nextVersion,
              sandbox: true,
            },
            occurrenceKey: `imaging_report_amended:${versionId}`,
          });
        });
      },
    );
    await this.security.emit({
      type: 'IMAGING_REPORT_AMENDED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { imaging_report_id: reportId, imaging_org_id: imagingOrgId, sandbox: true },
    });
    return this.loadCaseView(reportId, imagingOrgId, principal.personId);
  }

  async getCustomerReportStatus(imagingBookingId: string, customerPersonId: string) {
    const booking = await this.prisma.imagingBooking.findUnique({ where: { id: imagingBookingId } });
    if (!booking || booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s imaging booking.');
    }
    const report = await this.prisma.imagingReport.findUnique({
      where: { imagingBookingId },
      include: { currentVersion: true },
    });
    if (!report) {
      return {
        imaging_booking_id: imagingBookingId,
        report_available: false,
        status: null,
        note: 'Imaging report is not ready yet.',
      };
    }
    const published = report.currentVersion?.status === ImagingReportVersionStatus.PUBLISHED;
    return {
      imaging_booking_id: imagingBookingId,
      imaging_report_id: report.id,
      report_available: published,
      status: report.currentVersion?.status ?? null,
      version_number: report.currentVersion?.versionNumber ?? null,
      published_at: report.currentVersion?.publishedAt?.toISOString() ?? null,
      amends_version: report.currentVersion?.amendsVersionId ?? null,
      amendment_reason: report.currentVersion?.amendmentReason ?? null,
      note: published
        ? 'Final imaging report available. Open to view.'
        : 'Report is being reviewed. Results are not available yet.',
    };
  }

  async getCustomerPublishedReport(imagingBookingId: string, customerPersonId: string) {
    const booking = await this.prisma.imagingBooking.findUnique({ where: { id: imagingBookingId } });
    if (!booking || booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s imaging booking.');
    }
    const report = await this.prisma.imagingReport.findUnique({
      where: { imagingBookingId },
      include: {
        currentVersion: { include: { findingLines: true } },
        study: { include: { series: { include: { instances: { select: { sopInstanceUid: true, status: true } } } } } },
      },
    });
    if (!report?.currentVersion || report.currentVersion.status !== ImagingReportVersionStatus.PUBLISHED) {
      throw Errors.problem(
        404,
        'REPORT_NOT_AVAILABLE',
        'Report not available',
        'Final imaging report is not published yet.',
      );
    }
    await this.security.emit({
      type: 'IMAGING_REPORT_CUSTOMER_VIEW',
      outcome: 'success',
      personId: customerPersonId,
      metadata: {
        imaging_report_id: report.id,
        imaging_booking_id: imagingBookingId,
        sandbox: true,
      },
    });
    return {
      imaging_booking_id: imagingBookingId,
      imaging_report_id: report.id,
      accession_number: report.study.accessionNumber,
      study_instance_uid: report.study.studyInstanceUid,
      modality_code: report.study.modalityCode,
      study_description: report.study.studyDescription,
      study_date_time: report.study.studyDateTime?.toISOString() ?? null,
      version_number: report.currentVersion.versionNumber,
      published_at: report.currentVersion.publishedAt?.toISOString() ?? null,
      amendment_reason: report.currentVersion.amendmentReason,
      summary: report.currentVersion.summary,
      findings: report.currentVersion.findingLines.map((line) => ({
        finding_code: line.findingCode,
        finding_text: line.findingText,
        body_region_code: line.bodyRegionCode,
        severity_code: line.severityCode,
      })),
      sandbox: true,
      viewer: {
        available: false,
        reason: 'DICOM viewer is not enabled. Report text is available; clinical image viewing requires production PACS.',
      },
      note: 'Sandbox imaging report. Not for clinical use.',
    };
  }

  async listAdminImagingReportMetadata(imagingOrgId: string) {
    const rows = await this.prisma.imagingReport.findMany({
      where: { imagingOrgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        study: { select: { accessionNumber: true } },
        currentVersion: { select: { status: true, versionNumber: true, publishedAt: true } },
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        accession_number: row.study.accessionNumber,
        status: row.currentVersion?.status ?? null,
        version_number: row.currentVersion?.versionNumber ?? null,
        published_at: row.currentVersion?.publishedAt?.toISOString() ?? null,
        sandbox: row.sandbox,
      })),
      note: 'Governance metadata only. No clinical editing.',
    };
  }

  async listOrgInterpretationMetadata(principal: Principal, imagingOrgId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const rows = await this.prisma.imagingReport.findMany({
      where: { imagingOrgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        study: { select: { accessionNumber: true, status: true } },
        currentVersion: { select: { status: true, versionNumber: true } },
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        imaging_study_id: row.imagingStudyId,
        accession_number: row.study.accessionNumber,
        study_status: row.study.status,
        interpretation_status: row.currentVersion?.status ?? null,
        version_number: row.currentVersion?.versionNumber ?? null,
        assigned_radiologist_id: row.assignedRadiologistPersonId,
        sandbox: row.sandbox,
      })),
      note: 'Operational metadata only. No clinical findings.',
    };
  }

  private async loadCaseView(reportId: string, imagingOrgId: string, personId: string) {
    const report = await this.prisma.imagingReport.findUnique({
      where: { id: reportId },
      include: reportInclude,
    });
    if (!report || report.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Case not found for this imaging center.');
    }
    this.assertCaseAccess(report, personId);
    return this.presentCaseDetail(report);
  }

  private async assertReportForOrg(imagingOrgId: string, reportId: string) {
    const report = await this.prisma.imagingReport.findUnique({
      where: { id: reportId },
      include: { study: true },
    });
    if (!report || report.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Report not found for this imaging center.');
    }
    return report;
  }

  private async loadCurrentVersion(report: { currentVersionId: string | null }) {
    if (!report.currentVersionId) {
      throw Errors.notFound('Report version not found.');
    }
    const version = await this.prisma.imagingReportVersion.findUnique({
      where: { id: report.currentVersionId },
      include: { findingLines: true },
    });
    if (!version) {
      throw Errors.notFound('Report version not found.');
    }
    return version;
  }

  private assertStudyEligible(study: { status: ImagingStudyStatus }) {
    if (study.status !== ImagingStudyStatus.ACQUIRED) {
      throw Errors.problem(
        409,
        'STUDY_NOT_INTERPRETABLE',
        'Study not interpretable',
        'Completed acquisition is required before interpretation.',
      );
    }
  }

  private assertCaseAccess(report: ReportRow, personId: string) {
    const status = report.currentVersion?.status;
    if (
      status === ImagingReportVersionStatus.PENDING_VERIFY ||
      status === ImagingReportVersionStatus.VERIFIED ||
      status === ImagingReportVersionStatus.PUBLISHED
    ) {
      return;
    }
    if (report.assignedRadiologistPersonId && report.assignedRadiologistPersonId !== personId) {
      throw Errors.forbidden('Case is assigned to another radiologist.');
    }
  }

  private assertAssignedToActor(report: { assignedRadiologistPersonId: string | null }, personId: string) {
    if (!report.assignedRadiologistPersonId) {
      throw Errors.forbidden('Accept assignment before editing interpretation.');
    }
    if (report.assignedRadiologistPersonId !== personId) {
      throw Errors.forbidden('Case is assigned to another radiologist.');
    }
  }

  private assertSod(enteredByPersonId: string, actorPersonId: string, action: string) {
    if (enteredByPersonId === actorPersonId) {
      throw Errors.forbidden(`Separation of duty: you cannot ${action} a report you entered.`);
    }
  }

  private presentWorklistCase(row: ReportRow, opts?: { includeFindings?: boolean }) {
    const includeFindings = opts?.includeFindings ?? false;
    const version = row.currentVersion;
    return {
      id: row.id,
      imaging_study_id: row.imagingStudyId,
      accession_number: row.study.accessionNumber,
      study_instance_uid: row.study.studyInstanceUid,
      study_title: row.study.booking.lines[0]?.title ?? 'Imaging study',
      study_status: row.study.status,
      modality_code: row.study.modalityCode,
      status: version?.status ?? null,
      version_number: version?.versionNumber ?? null,
      assigned_radiologist_id: row.assignedRadiologistPersonId,
      finding_line_count: version?.findingLines.length ?? 0,
      summary: includeFindings ? (version?.summary ?? null) : null,
      sandbox: row.sandbox,
    };
  }

  private presentCaseDetail(row: ReportRow) {
    const version = row.currentVersion;
    const acquisition = row.study.acquisition;
    return {
      id: row.id,
      imaging_study_id: row.imagingStudyId,
      imaging_booking_id: row.imagingBookingId,
      imaging_org_id: row.imagingOrgId,
      accession_number: row.study.accessionNumber,
      study_instance_uid: row.study.studyInstanceUid,
      study_title: row.study.booking.lines[0]?.title ?? 'Imaging study',
      study_status: row.study.status,
      modality_code: row.study.modalityCode,
      study_description: row.study.studyDescription,
      study_date_time: row.study.studyDateTime?.toISOString() ?? null,
      series_count: row.study.series.length,
      body_region_code: row.study.bodyRegionCode,
      assigned_radiologist_id: row.assignedRadiologistPersonId,
      acquisition: acquisition
        ? {
            status: acquisition.status,
            sandbox_object_ref: acquisition.sandboxObjectRef,
            equipment_code: acquisition.equipmentCode,
            completed_at: acquisition.completedAt?.toISOString() ?? null,
            study_instance_uid: row.study.studyInstanceUid,
            series_count: row.study.series.length,
            sandbox: true,
            pacs: false,
            dicom: true,
            viewer: row.study.sandbox,
            note: 'Sandbox diagnostic viewer available via radiologist View study. Not a certified workstation. Production PACS EXTERNAL_GATED.',
          }
        : null,
      version: version
        ? {
            id: version.id,
            version_number: version.versionNumber,
            status: version.status,
            summary: version.summary,
            entered_by: version.enteredByPersonId,
            verified_by: version.verifiedByPersonId,
            findings: version.findingLines.map((line) => ({
              finding_code: line.findingCode,
              finding_text: line.findingText,
              body_region_code: line.bodyRegionCode,
              severity_code: line.severityCode,
              sort_order: line.sortOrder,
            })),
          }
        : null,
      sandbox: row.sandbox,
      boundary: {
        publication: isPublishedImagingReportStatus(version?.status ?? ImagingReportVersionStatus.DRAFT),
        customer_report: isPublishedImagingReportStatus(version?.status ?? ImagingReportVersionStatus.DRAFT),
        pacs: false,
        dicom: true,
        viewer: row.study.sandbox,
        note: 'Sandbox diagnostic viewer available (S152). Not a certified workstation. Production PACS EXTERNAL_GATED.',
      },
    };
  }

  private async assertRadiologistPartner(principal: Principal) {
    const partner = await this.prisma.partner.findFirst({
      where: { personId: principal.personId, partnerTypeCode: 'RADIOLOGIST', status: 'ACTIVE' },
    });
    if (!partner) {
      throw Errors.forbidden('Radiologist partner profile required.');
    }
  }

  async assertRadiologist(principal: Principal, imagingOrgId: string) {
    await this.assertRadiologistPartner(principal);
    const membership = await this.prisma.membership.count({
      where: {
        personId: principal.personId,
        organizationId: imagingOrgId,
        status: 'ACTIVE',
        deletedAt: null,
        organization: { kind: OrganizationKind.IMAGING_CENTER },
      },
    });
    if (!membership) {
      throw Errors.problem(
        403,
        'MEMBERSHIP_REQUIRED',
        'Imaging center membership required',
        'You must be an active staff member of this imaging center before interpreting or publishing reports. Ask an operator to grant org_staff membership for this center.',
      );
    }
  }
}
