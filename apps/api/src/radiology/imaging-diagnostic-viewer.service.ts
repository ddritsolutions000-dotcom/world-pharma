/**
 * Sprint 152 — Application diagnostic imaging viewer (software).
 * Reuses ImagingStudy / Series / Instance + existing auth. Does NOT rebuild S139 PACS activation.
 * Sandbox: deterministic PNG phantoms. Production PACS Part 10 / DICOMweb remains EXTERNAL_GATED.
 * REPORT ≠ VIEWER. Not a certified diagnostic workstation.
 */
import { Injectable } from '@nestjs/common';
import { ImagingStudyInstanceStatus, ImagingStudyStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { PrismaService } from '../app/prisma.service';
import { readInfrastructureEnvironment } from '../ops/infra-environment';
import { InterpretationService } from './interpretation.service';
import {
  renderSandboxDiagnosticFrame,
  SANDBOX_VIEWER_DEFAULT_FRAME_COUNT,
} from './sandbox-diagnostic-frame';

export const NO_PRODUCTION_PACS_VIEWER = 'NO_PRODUCTION_PACS_VIEWER';
export const DIAGNOSTIC_VIEWER_NOT_A_CERTIFIED_WORKSTATION =
  'DIAGNOSTIC_VIEWER_NOT_A_CERTIFIED_WORKSTATION';

export type ViewerActorKind = 'customer' | 'radiologist' | 'imaging_staff';

type StudyWithSeries = {
  id: string;
  imagingOrgId: string;
  imagingBookingId: string;
  studyInstanceUid: string;
  accessionNumber: string;
  modalityCode: string | null;
  studyDescription: string | null;
  studyDateTime: Date | null;
  status: ImagingStudyStatus;
  sandbox: boolean;
  series: Array<{
    id: string;
    seriesInstanceUid: string;
    modalityCode: string | null;
    description: string | null;
    seriesNumber: number | null;
    sandbox: boolean;
    instances: Array<{
      id: string;
      sopInstanceUid: string;
      status: ImagingStudyInstanceStatus;
      objectKey: string | null;
      sandbox: boolean;
    }>;
  }>;
  booking: { customerPersonId: string };
};

@Injectable()
export class ImagingDiagnosticViewerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly interpretation: InterpretationService,
  ) {}

  private productionInfrastructure(): boolean {
    return readInfrastructureEnvironment() === 'production';
  }

  private assertViewerEnvironmentAllowed(study: { sandbox: boolean }): void {
    if (this.productionInfrastructure()) {
      throw Errors.problem(
        503,
        NO_PRODUCTION_PACS_VIEWER,
        'Production PACS viewer EXTERNAL_GATED',
        'Application viewer supports sandbox/test frames only. Production DICOM/DICOMweb requires a live PACS provider (S139).',
      );
    }
    if (!study.sandbox) {
      throw Errors.problem(
        503,
        NO_PRODUCTION_PACS_VIEWER,
        'Non-sandbox study viewing blocked',
        'Non-sandbox studies require production PACS integration before pixel access.',
      );
    }
  }

  private async loadStudyById(studyId: string): Promise<StudyWithSeries | null> {
    return this.prisma.imagingStudy.findUnique({
      where: { id: studyId },
      include: {
        booking: { select: { customerPersonId: true } },
        series: {
          orderBy: { seriesNumber: 'asc' },
          include: {
            instances: {
              where: { status: ImagingStudyInstanceStatus.STORED },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
  }

  private presentSession(study: StudyWithSeries, actor: ViewerActorKind) {
    this.assertViewerEnvironmentAllowed(study);
    const storedInstances = study.series.reduce((n, s) => n + s.instances.length, 0);
    if (storedInstances === 0) {
      throw Errors.problem(
        404,
        'STUDY_NOT_VIEWABLE',
        'Study not viewable',
        'No stored imaging instances are available for this study yet.',
      );
    }

    const series = study.series.map((s, idx) => {
      const frameCount =
        s.sandbox || study.sandbox
          ? Math.max(s.instances.length, SANDBOX_VIEWER_DEFAULT_FRAME_COUNT)
          : Math.max(s.instances.length, 1);
      return {
        series_id: s.id,
        series_instance_uid: s.seriesInstanceUid,
        series_number: s.seriesNumber ?? idx + 1,
        modality_code: s.modalityCode ?? study.modalityCode,
        description: s.description ?? study.studyDescription ?? `Series ${idx + 1}`,
        instance_count: s.instances.length,
        frame_count: frameCount,
        sandbox: s.sandbox || study.sandbox,
      };
    });

    return {
      sprint: 152,
      imaging_study_id: study.id,
      imaging_booking_id: study.imagingBookingId,
      imaging_org_id: study.imagingOrgId,
      study_instance_uid: study.studyInstanceUid,
      accession_number: study.accessionNumber,
      modality_code: study.modalityCode,
      study_description: study.studyDescription,
      study_date_time: study.studyDateTime?.toISOString() ?? null,
      study_status: study.status,
      sandbox: study.sandbox,
      actor,
      viewer: {
        available: true,
        mode: study.sandbox ? 'SANDBOX_DIAGNOSTIC_FRAMES' : 'EXTERNAL_GATED',
        certified_diagnostic_workstation: false,
        workstation_boundary: DIAGNOSTIC_VIEWER_NOT_A_CERTIFIED_WORKSTATION,
        report_separate_from_viewer: true,
        production_pacs: false,
        public_urls: false,
        note:
          'Sandbox diagnostic viewer — synthetic frames for application UX. Not a certified diagnostic workstation. Production PACS EXTERNAL_GATED.',
      },
      series,
      capabilities: {
        zoom: true,
        pan: true,
        rotate: true,
        reset: true,
        fit_to_screen: true,
        series_navigation: true,
        slice_navigation: true,
        fullscreen: true,
      },
      frame_endpoint_template:
        actor === 'customer'
          ? `/api/v1/me/imaging/bookings/${study.imagingBookingId}/viewer/series/{series_id}/frames/{frame_index}`
          : `/api/v1/radiologist/studies/${study.id}/viewer/series/{series_id}/frames/{frame_index}`,
    };
  }

  async openCustomerViewer(bookingId: string, customerPersonId: string) {
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, customerPersonId: true, study: { select: { id: true } } },
    });
    if (!booking) {
      throw Errors.notFound('Imaging booking not found.');
    }
    if (booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s imaging study.');
    }
    if (!booking.study) {
      throw Errors.problem(
        404,
        'STUDY_NOT_VIEWABLE',
        'Study not viewable',
        'Imaging study has not been created for this booking yet.',
      );
    }
    const study = await this.loadStudyById(booking.study.id);
    if (!study) {
      throw Errors.notFound('Imaging study not found.');
    }
    return this.presentSession(study, 'customer');
  }

  async openRadiologistViewer(
    principal: Principal,
    imagingOrgId: string,
    studyId: string,
  ) {
    await this.interpretation.assertRadiologist(principal, imagingOrgId);
    const study = await this.loadStudyById(studyId);
    if (!study || study.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Study not found for this imaging center.');
    }
    // Radiologist must have case access when a report exists; otherwise staff membership already gated.
    const report = await this.prisma.imagingReport.findUnique({
      where: { imagingStudyId: studyId },
    });
    if (report) {
      await this.interpretation.getCaseByStudyId(principal, imagingOrgId, studyId);
    }
    return this.presentSession(study, 'radiologist');
  }

  private async authorizeFrameAccess(input: {
    actor: ViewerActorKind;
    principal: Principal;
    bookingId?: string;
    studyId?: string;
    imagingOrgId?: string;
    seriesId: string;
  }): Promise<StudyWithSeries> {
    if (input.actor === 'customer') {
      const session = await this.openCustomerViewer(
        String(input.bookingId),
        input.principal.personId,
      );
      void session;
      const booking = await this.prisma.imagingBooking.findUnique({
        where: { id: input.bookingId },
        select: { study: { select: { id: true } } },
      });
      const study = await this.loadStudyById(String(booking?.study?.id));
      if (!study) throw Errors.notFound('Imaging study not found.');
      return study;
    }

    const study = await this.loadStudyById(String(input.studyId));
    if (!study || study.imagingOrgId !== input.imagingOrgId) {
      throw Errors.forbidden('Study not found for this imaging center.');
    }
    await this.openRadiologistViewer(
      input.principal,
      String(input.imagingOrgId),
      study.id,
    );
    return study;
  }

  async getAuthorizedFrame(input: {
    actor: ViewerActorKind;
    principal: Principal;
    bookingId?: string;
    studyId?: string;
    imagingOrgId?: string;
    seriesId: string;
    frameIndex: number;
  }): Promise<{
    bytes: Buffer;
    contentType: string;
    width: number;
    height: number;
    headers: Record<string, string>;
  }> {
    if (!Number.isInteger(input.frameIndex) || input.frameIndex < 0) {
      throw Errors.validation('frame_index must be a non-negative integer.');
    }
    const study = await this.authorizeFrameAccess(input);
    this.assertViewerEnvironmentAllowed(study);

    const series = study.series.find((s) => s.id === input.seriesId);
    if (!series) {
      throw Errors.notFound('Imaging series not found.');
    }

    const frameCount =
      series.sandbox || study.sandbox
        ? Math.max(series.instances.length, SANDBOX_VIEWER_DEFAULT_FRAME_COUNT)
        : Math.max(series.instances.length, 1);

    if (input.frameIndex >= frameCount) {
      throw Errors.problem(
        404,
        'FRAME_NOT_FOUND',
        'Frame not found',
        `frame_index ${input.frameIndex} is out of range (0..${frameCount - 1}).`,
      );
    }

    const frame = renderSandboxDiagnosticFrame({
      studyId: study.id,
      seriesId: series.id,
      frameIndex: input.frameIndex,
      frameCount,
      modalityCode: series.modalityCode ?? study.modalityCode,
    });

    return {
      bytes: frame.png,
      contentType: frame.contentType,
      width: frame.width,
      height: frame.height,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-WP-Viewer-Mode': 'SANDBOX_DIAGNOSTIC_FRAMES',
        'X-WP-Study-Id': study.id,
        'X-WP-Series-Id': series.id,
        'X-WP-Frame-Index': String(input.frameIndex),
        'X-WP-Public-URL': 'false',
      },
    };
  }

  /** Safe metadata used by study endpoint — no pixels. */
  buildCustomerViewerAvailability(study: {
    sandbox: boolean;
    status: ImagingStudyStatus;
    series: Array<{ instances: Array<{ status: ImagingStudyInstanceStatus }> }>;
  }) {
    const instanceCount = study.series.reduce((n, s) => n + s.instances.length, 0);
    const notFailed =
      study.status !== ImagingStudyStatus.ACQUISITION_FAILED &&
      study.status !== ImagingStudyStatus.CANCELLED;
    const viewable = study.sandbox && instanceCount > 0 && notFailed;

    if (this.productionInfrastructure()) {
      return {
        available: false,
        reason: NO_PRODUCTION_PACS_VIEWER,
        certified_diagnostic_workstation: false,
      };
    }

    if (viewable) {
      return {
        available: true,
        reason: 'Sandbox diagnostic viewer available for this study.',
        certified_diagnostic_workstation: false,
        mode: 'SANDBOX_DIAGNOSTIC_FRAMES' as const,
      };
    }

    return {
      available: false,
      reason: 'No viewable imaging instances for this booking yet.',
      certified_diagnostic_workstation: false,
    };
  }
}
