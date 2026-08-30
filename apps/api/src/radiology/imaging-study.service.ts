import { Injectable } from '@nestjs/common';
import {
  ImagingAcquisitionStatus,
  ImagingBookingStatus,
  ImagingReportVersionStatus,
  ImagingStudyStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { assertImagingOrgAccess } from '../catalog/access';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertImagingStudyTransition } from './imaging-study-status';
import { InterpretationService } from './interpretation.service';

function sandboxAccessionNumber(): string {
  return `IMG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function sandboxObjectRef(studyId: string): string {
  return `sandbox://imaging-objects/${studyId}/${uuidv7()}`;
}

const studyInclude = {
  booking: { include: { lines: true } },
  acquisition: true,
  imagingLocation: { select: { id: true, name: true, city: true } },
  report: { include: { currentVersion: { select: { status: true, versionNumber: true } } } },
} as const;

type StaffStudyRow = Prisma.ImagingStudyGetPayload<{ include: typeof studyInclude }>;

@Injectable()
export class ImagingStudyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly security: SecurityEventsService,
    private readonly interpretation: InterpretationService,
  ) {}

  /** Idempotent: create SCHEDULED study when booking is CONFIRMED. */
  async enqueueForConfirmedBooking(imagingBookingId: string, actorPersonId: string): Promise<void> {
    const existing = await this.prisma.imagingStudy.findUnique({ where: { imagingBookingId } });
    if (existing) {
      return;
    }
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id: imagingBookingId },
      include: { lines: true },
    });
    if (!booking || booking.status !== ImagingBookingStatus.CONFIRMED) {
      return;
    }
    const studyId = uuidv7();
    const accession = sandboxAccessionNumber();
    const line = booking.lines[0];
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: booking.countryId,
        organizationId: booking.imagingOrgId,
        personId: actorPersonId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingStudy.create({
            data: {
              id: studyId,
              imagingBookingId: booking.id,
              imagingOrgId: booking.imagingOrgId,
              imagingLocationId: booking.imagingLocationId,
              countryId: booking.countryId,
              status: ImagingStudyStatus.SCHEDULED,
              accessionNumber: accession,
              modalityCode: 'XR',
              bodyRegionCode: line?.title?.slice(0, 64) ?? 'GENERAL',
              idempotencyKey: `study:${booking.id}`,
              sandbox: true,
            },
          });
          await tx.imagingStudyStatusHistory.create({
            data: {
              id: uuidv7(),
              imagingStudyId: studyId,
              fromStatus: null,
              toStatus: ImagingStudyStatus.SCHEDULED,
              actorPersonId,
              actionCode: 'study_scheduled',
              metadata: { imaging_booking_id: booking.id, sandbox: true },
            },
          });
          await this.outbox.enqueue(tx, {
            type: 'IMAGING_STUDY_CREATED',
            aggregateType: 'ImagingStudy',
            aggregateId: studyId,
            producer: 'radiology',
            countryId: booking.countryId,
            payload: {
              imaging_booking_id: booking.id,
              imaging_org_id: booking.imagingOrgId,
              accession_number: accession,
              status: ImagingStudyStatus.SCHEDULED,
              sandbox: true,
            },
            occurrenceKey: `imaging_study_created:${studyId}`,
          });
        });
      },
    );
    await this.security.emit({
      type: 'IMAGING_STUDY_CREATED',
      outcome: 'success',
      personId: actorPersonId,
      metadata: {
        imaging_study_id: studyId,
        imaging_booking_id: booking.id,
        imaging_org_id: booking.imagingOrgId,
        sandbox: true,
      },
    });
  }

  async listStudies(principal: Principal, imagingOrgId: string, query?: { status?: string }) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const where: Prisma.ImagingStudyWhereInput = { imagingOrgId };
    if (query?.status) {
      where.status = query.status as ImagingStudyStatus;
    }
    const rows = await this.prisma.imagingStudy.findMany({
      where,
      include: studyInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      data: rows.map((row) => this.presentStaffStudy(row)),
      note: 'Sandbox acquisition + interpretation ops metadata. No DICOM/PACS. Customer publication OFF (R8-E).',
      boundary: { pacs: false, dicom: false, interpretation: true, publication: false },
    };
  }

  async getStudy(principal: Principal, imagingOrgId: string, studyId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const row = await this.loadStudy(studyId);
    if (row.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Study does not belong to this imaging center.');
    }
    return this.presentStaffStudy(row);
  }

  async checkIn(
    principal: Principal,
    imagingOrgId: string,
    input: { imaging_booking_id: string; assignee_person_id?: string },
  ) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id: input.imaging_booking_id },
      include: { study: true },
    });
    if (!booking || booking.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Booking does not belong to this imaging center.');
    }
    if (booking.status !== ImagingBookingStatus.CONFIRMED) {
      throw Errors.problem(409, 'BOOKING_NOT_CHECKIN_ELIGIBLE', 'Not eligible', 'Only confirmed bookings can be checked in.');
    }
    let study = booking.study;
    if (!study) {
      await this.enqueueForConfirmedBooking(booking.id, principal.personId);
      study = await this.prisma.imagingStudy.findUnique({ where: { imagingBookingId: booking.id } });
    }
    if (!study) {
      throw Errors.problem(500, 'STUDY_CREATE_FAILED', 'Study missing', 'Could not create imaging study.');
    }
    if (study.status === ImagingStudyStatus.CHECKED_IN) {
      return this.presentStaffStudy(await this.loadStudy(study.id));
    }
    if (study.status !== ImagingStudyStatus.SCHEDULED) {
      throw Errors.problem(409, 'STUDY_NOT_CHECKIN_ELIGIBLE', 'Not eligible', `Study is ${study.status}; cannot check in.`);
    }
    await this.transitionStudy(study, ImagingStudyStatus.CHECKED_IN, principal.personId, 'check_in', {
      assignee_person_id: input.assignee_person_id ?? null,
    });
    if (input.assignee_person_id) {
      await this.prisma.imagingStudy.update({
        where: { id: study.id },
        data: { assigneePersonId: input.assignee_person_id },
      });
    }
    return this.presentStaffStudy(await this.loadStudy(study.id));
  }

  async assignTechnician(
    principal: Principal,
    imagingOrgId: string,
    studyId: string,
    assigneePersonId: string,
  ) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const study = await this.loadStudy(studyId);
    if (study.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Study does not belong to this imaging center.');
    }
    if (
      study.status !== ImagingStudyStatus.SCHEDULED &&
      study.status !== ImagingStudyStatus.CHECKED_IN &&
      study.status !== ImagingStudyStatus.ACQUISITION_FAILED
    ) {
      throw Errors.problem(409, 'STUDY_NOT_ASSIGNABLE', 'Not assignable', 'Study cannot be reassigned in this state.');
    }
    await this.prisma.imagingStudy.update({
      where: { id: study.id },
      data: { assigneePersonId },
    });
    await this.security.emit({
      type: 'IMAGING_STUDY_ASSIGNED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        imaging_study_id: study.id,
        assignee_person_id: assigneePersonId,
        imaging_org_id: imagingOrgId,
        sandbox: true,
      },
    });
    return this.presentStaffStudy(await this.loadStudy(study.id));
  }

  async startAcquisition(principal: Principal, imagingOrgId: string, studyId: string) {
    const study = await this.assertAssignedTechnician(principal, imagingOrgId, studyId);
    if (study.status === ImagingStudyStatus.ACQUISITION_IN_PROGRESS) {
      return this.presentStaffStudy(study);
    }
    if (study.status !== ImagingStudyStatus.CHECKED_IN && study.status !== ImagingStudyStatus.ACQUISITION_FAILED) {
      throw Errors.problem(409, 'STUDY_NOT_STARTABLE', 'Not startable', 'Study must be checked in before acquisition.');
    }
    const acquisitionId = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.imagingAcquisition.upsert({
        where: { imagingStudyId: study.id },
        create: {
          id: acquisitionId,
          imagingStudyId: study.id,
          status: ImagingAcquisitionStatus.IN_PROGRESS,
          technicianPersonId: principal.personId,
          startedAt: new Date(),
          sandbox: true,
        },
        update: {
          status: ImagingAcquisitionStatus.IN_PROGRESS,
          technicianPersonId: principal.personId,
          startedAt: new Date(),
          failureCode: null,
          completedAt: null,
        },
      });
      await this.transitionStudyTx(tx, study, ImagingStudyStatus.ACQUISITION_IN_PROGRESS, principal.personId, 'acquisition_started');
      await this.outbox.enqueue(tx, {
        type: 'IMAGING_ACQUISITION_STARTED',
        aggregateType: 'ImagingStudy',
        aggregateId: study.id,
        producer: 'radiology',
        countryId: study.countryId,
        payload: {
          imaging_study_id: study.id,
          imaging_org_id: study.imagingOrgId,
          technician_person_id: principal.personId,
          sandbox: true,
        },
        occurrenceKey: `imaging_acquisition_started:${study.id}:${Date.now()}`,
      });
    });
    await this.security.emit({
      type: 'IMAGING_ACQUISITION_STARTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { imaging_study_id: study.id, imaging_org_id: imagingOrgId, sandbox: true },
    });
    return this.presentStaffStudy(await this.loadStudy(study.id));
  }

  async completeAcquisition(
    principal: Principal,
    imagingOrgId: string,
    studyId: string,
    input: { equipment_code?: string; modality_code?: string },
  ) {
    const study = await this.assertAssignedTechnician(principal, imagingOrgId, studyId);
    if (study.status === ImagingStudyStatus.ACQUIRED) {
      return this.presentStaffStudy(study);
    }
    if (study.status !== ImagingStudyStatus.ACQUISITION_IN_PROGRESS) {
      throw Errors.problem(409, 'STUDY_NOT_COMPLETABLE', 'Not completable', 'Acquisition is not in progress.');
    }
    const objectRef = sandboxObjectRef(study.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.imagingAcquisition.update({
        where: { imagingStudyId: study.id },
        data: {
          status: ImagingAcquisitionStatus.COMPLETED,
          completedAt: new Date(),
          sandboxObjectRef: objectRef,
          equipmentCode: input.equipment_code ?? 'SANDBOX_UNIT',
          metadata: {
            modality_code: input.modality_code ?? study.modalityCode,
            sandbox: true,
            pacs: false,
          } as Prisma.InputJsonValue,
        },
      });
      if (input.modality_code) {
        await tx.imagingStudy.update({
          where: { id: study.id },
          data: { modalityCode: input.modality_code },
        });
      }
      await this.transitionStudyTx(tx, study, ImagingStudyStatus.ACQUIRED, principal.personId, 'acquisition_completed', {
        sandbox_object_ref: objectRef,
      });
      await this.outbox.enqueue(tx, {
        type: 'IMAGING_ACQUISITION_COMPLETED',
        aggregateType: 'ImagingStudy',
        aggregateId: study.id,
        producer: 'radiology',
        countryId: study.countryId,
        payload: {
          imaging_study_id: study.id,
          imaging_org_id: study.imagingOrgId,
          sandbox_object_ref: objectRef,
          sandbox: true,
        },
        occurrenceKey: `imaging_acquisition_completed:${study.id}`,
      });
    });
    await this.security.emit({
      type: 'IMAGING_ACQUISITION_COMPLETED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        imaging_study_id: study.id,
        imaging_org_id: imagingOrgId,
        sandbox_object_ref: objectRef,
        sandbox: true,
      },
    });
    await this.interpretation.ensureDraftReportForAcquiredStudy(study.id, principal.personId);
    return this.presentStaffStudy(await this.loadStudy(study.id));
  }

  async failAcquisition(
    principal: Principal,
    imagingOrgId: string,
    studyId: string,
    input: { failure_code: string },
  ) {
    const study = await this.assertAssignedTechnician(principal, imagingOrgId, studyId);
    if (study.status === ImagingStudyStatus.ACQUISITION_FAILED) {
      return this.presentStaffStudy(study);
    }
    if (study.status !== ImagingStudyStatus.ACQUISITION_IN_PROGRESS) {
      throw Errors.problem(409, 'STUDY_NOT_FAILABLE', 'Not failable', 'Acquisition is not in progress.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.imagingAcquisition.update({
        where: { imagingStudyId: study.id },
        data: {
          status: ImagingAcquisitionStatus.FAILED,
          failureCode: input.failure_code,
          completedAt: new Date(),
        },
      });
      await this.transitionStudyTx(tx, study, ImagingStudyStatus.ACQUISITION_FAILED, principal.personId, 'acquisition_failed', {
        failure_code: input.failure_code,
      });
      await this.outbox.enqueue(tx, {
        type: 'IMAGING_ACQUISITION_FAILED',
        aggregateType: 'ImagingStudy',
        aggregateId: study.id,
        producer: 'radiology',
        countryId: study.countryId,
        payload: {
          imaging_study_id: study.id,
          failure_code: input.failure_code,
          sandbox: true,
        },
        occurrenceKey: `imaging_acquisition_failed:${study.id}:${input.failure_code}`,
      });
    });
    return this.presentStaffStudy(await this.loadStudy(study.id));
  }

  async getCustomerProgress(imagingBookingId: string, customerPersonId: string) {
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id: imagingBookingId },
      include: { study: { include: { acquisition: true } } },
    });
    if (!booking || booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s imaging booking.');
    }
    let interpretationStatus: ImagingReportVersionStatus | null = null;
    if (booking.study) {
      await this.prisma.runWithTenant(
        workerTenantContext({
          countryId: booking.countryId,
          organizationId: booking.imagingOrgId,
          personId: customerPersonId,
        }),
        async () => {
          const report = await this.prisma.imagingReport.findUnique({
            where: { imagingBookingId },
            include: { currentVersion: { select: { status: true } } },
          });
          interpretationStatus = report?.currentVersion?.status ?? null;
        },
      );
    }
    const study = booking.study;
    let progress = 'BOOKING_ONLY';
    let note = 'Booking in progress.';
    if (study) {
      switch (study.status) {
        case ImagingStudyStatus.SCHEDULED:
          progress = 'STUDY_SCHEDULED';
          note = 'Your imaging study is scheduled. Arrive at the center for check-in.';
          break;
        case ImagingStudyStatus.CHECKED_IN:
          progress = 'CHECKED_IN';
          note = 'Checked in at the imaging center. Acquisition will begin shortly.';
          break;
        case ImagingStudyStatus.ACQUISITION_IN_PROGRESS:
          progress = 'ACQUISITION_IN_PROGRESS';
          note = 'Imaging acquisition is in progress.';
          break;
        case ImagingStudyStatus.ACQUIRED:
          if (interpretationStatus === ImagingReportVersionStatus.PUBLISHED) {
            progress = 'REPORT_PUBLISHED';
            note = 'Your imaging report is available.';
          } else if (interpretationStatus === ImagingReportVersionStatus.VERIFIED) {
            progress = 'INTERPRETATION_VERIFIED';
            note = 'Interpretation sign-off complete. Your report will be published shortly.';
          } else if (
            interpretationStatus === ImagingReportVersionStatus.DRAFT ||
            interpretationStatus === ImagingReportVersionStatus.PENDING_VERIFY
          ) {
            progress = 'INTERPRETATION_IN_PROGRESS';
            note = 'Acquisition complete. Interpretation is in progress at the imaging center.';
          } else {
            progress = 'ACQUIRED';
            note = 'Acquisition complete. Interpretation will begin shortly.';
          }
          break;
        case ImagingStudyStatus.ACQUISITION_FAILED:
          progress = 'ACQUISITION_EXCEPTION';
          note = 'Acquisition could not be completed. The center will contact you.';
          break;
        case ImagingStudyStatus.CANCELLED:
          progress = 'CANCELLED';
          note = 'Study cancelled.';
          break;
        default:
          progress = study.status;
      }
    } else if (booking.status === ImagingBookingStatus.CONFIRMED) {
      progress = 'SCHEDULED';
      note = 'Booking confirmed. Your imaging study is being scheduled.';
    } else if (booking.status === ImagingBookingStatus.BOOKED) {
      progress = 'SCHEDULED';
      note = 'Your slot is reserved. Complete payment to confirm.';
    }
    return {
      imaging_booking_id: booking.id,
      booking_status: booking.status,
      progress,
      study_status: study?.status ?? null,
      accession_number: study?.accessionNumber ?? null,
      slot_starts_at: booking.slotStartsAt?.toISOString() ?? null,
      interpretation_status: interpretationStatus,
      note,
      boundary: {
        acquisition: study?.status === ImagingStudyStatus.ACQUIRED,
        interpretation: Boolean(interpretationStatus),
        report: interpretationStatus === ImagingReportVersionStatus.PUBLISHED,
        dicom: false,
        pacs: false,
      },
    };
  }

  private async loadStudy(studyId: string) {
    const row = await this.prisma.imagingStudy.findUnique({
      where: { id: studyId },
      include: studyInclude,
    });
    if (!row) {
      throw Errors.notFound('Imaging study not found.');
    }
    return row;
  }

  private async assertAssignedTechnician(principal: Principal, imagingOrgId: string, studyId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const study = await this.loadStudy(studyId);
    if (study.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Study does not belong to this imaging center.');
    }
    if (study.assigneePersonId && study.assigneePersonId !== principal.personId) {
      throw Errors.forbidden('This study is assigned to another technician.');
    }
    if (!study.assigneePersonId) {
      throw Errors.forbidden('Study has no assigned technician.');
    }
    return study;
  }

  private async transitionStudy(
    study: { id: string; status: ImagingStudyStatus; countryId: string },
    to: ImagingStudyStatus,
    actorPersonId: string,
    actionCode: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.transitionStudyTx(tx, study, to, actorPersonId, actionCode, metadata);
    });
  }

  private async transitionStudyTx(
    tx: Prisma.TransactionClient,
    study: { id: string; status: ImagingStudyStatus; countryId: string },
    to: ImagingStudyStatus,
    actorPersonId: string,
    actionCode: string,
    metadata?: Record<string, unknown>,
  ) {
    assertImagingStudyTransition(study.status, to);
    await tx.imagingStudy.update({
      where: { id: study.id },
      data: { status: to },
    });
    await tx.imagingStudyStatusHistory.create({
      data: {
        id: uuidv7(),
        imagingStudyId: study.id,
        fromStatus: study.status,
        toStatus: to,
        actorPersonId,
        actionCode,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  private presentStaffStudy(row: StaffStudyRow) {
    return {
      id: row.id,
      imaging_booking_id: row.imagingBookingId,
      imaging_org_id: row.imagingOrgId,
      imaging_location_id: row.imagingLocationId,
      status: row.status,
      accession_number: row.accessionNumber,
      modality_code: row.modalityCode,
      body_region_code: row.bodyRegionCode,
      assignee_person_id: row.assigneePersonId,
      study_title: row.booking.lines[0]?.title ?? 'Imaging study',
      slot_starts_at: row.booking.slotStartsAt?.toISOString() ?? null,
      location: row.imagingLocation
        ? { id: row.imagingLocation.id, name: row.imagingLocation.name, city: row.imagingLocation.city }
        : null,
      acquisition: row.acquisition
        ? {
            status: row.acquisition.status,
            started_at: row.acquisition.startedAt?.toISOString() ?? null,
            completed_at: row.acquisition.completedAt?.toISOString() ?? null,
            sandbox_object_ref: row.acquisition.sandboxObjectRef,
            equipment_code: row.acquisition.equipmentCode,
            failure_code: row.acquisition.failureCode,
          }
        : null,
      sandbox: row.sandbox,
      interpretation_status: row.report?.currentVersion?.status ?? null,
      interpretation_version: row.report?.currentVersion?.versionNumber ?? null,
      assigned_radiologist_id: row.report?.assignedRadiologistPersonId ?? null,
      boundary: {
        pacs: false,
        dicom: false,
        interpretation: Boolean(row.report),
        report: false,
        publication: false,
      },
    };
  }
}
