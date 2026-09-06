import { Inject, Injectable } from '@nestjs/common';
import { ImagingStudyInstanceStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { assertImagingOrgAccess } from '../catalog/access';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { PrivateObjectStore } from '../partner/object-store';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { readInfrastructureEnvironment } from '../ops/infra-environment';
import { PACS_ADAPTER, type IngestStudyResult, type PacsAdapter } from './pacs.port';
import { assertProductionPacsIngestAllowed } from './pacs-production-activation-path';
import { NO_PRODUCTION_PACS_VIEWER } from './imaging-diagnostic-viewer.service';

@Injectable()
export class ImagingIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly objects: PrivateObjectStore,
    @Inject(PACS_ADAPTER) private readonly pacs: PacsAdapter,
  ) {}

  async ingestStudyForAcquisition(input: {
    imagingStudyId: string;
    imagingOrgId: string;
    actorPersonId: string;
    modalityCode: string;
    studyDescription?: string | null;
    idempotencyKey: string;
  }): Promise<IngestStudyResult> {
    // S139 — production DICOM ingest fail-closed until genuine PACS ENABLED.
    assertProductionPacsIngestAllowed('imaging.ingestStudyForAcquisition');
    const study = await this.prisma.imagingStudy.findUnique({
      where: { id: input.imagingStudyId },
      include: { booking: { include: { lines: true } } },
    });
    if (!study || study.imagingOrgId !== input.imagingOrgId) {
      throw Errors.notFound('Imaging study not found.');
    }

    const description =
      input.studyDescription ?? study.studyDescription ?? study.booking.lines[0]?.title ?? 'Imaging study';

    return this.prisma.runWithTenant(
      workerTenantContext({
        countryId: study.countryId,
        organizationId: study.imagingOrgId,
        personId: input.actorPersonId,
      }),
      async () => {
        const result = await this.pacs.ingestStudy({
          imagingStudyId: study.id,
          imagingOrgId: study.imagingOrgId,
          countryId: study.countryId,
          studyInstanceUid: study.studyInstanceUid,
          accessionNumber: study.accessionNumber,
          modalityCode: input.modalityCode,
          studyDescription: description,
          idempotencyKey: input.idempotencyKey,
          actorPersonId: input.actorPersonId,
        });

        if (!result.idempotent) {
          await this.prisma.$transaction(async (tx) => {
            await this.outbox.enqueue(tx, {
              type: 'IMAGING_STUDY_INGESTED',
              aggregateType: 'ImagingStudy',
              aggregateId: study.id,
              producer: 'radiology',
              countryId: study.countryId,
              payload: {
                imaging_study_id: study.id,
                imaging_org_id: study.imagingOrgId,
                imaging_booking_id: study.imagingBookingId,
                customer_person_id: study.booking.customerPersonId,
                study_instance_uid: result.studyInstanceUid,
                series_count: result.series.length,
                instance_count: result.series.reduce((n, s) => n + s.instances.length, 0),
                sandbox: true,
                storage: result.storage,
              },
              occurrenceKey: `imaging_study_ingested:${input.idempotencyKey}`,
            });
          });
        }

        return result;
      },
    );
  }

  async getAuthorizedInstanceObject(
    principal: Principal,
    imagingOrgId: string,
    studyId: string,
    sopInstanceUid: string,
  ) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const instance = await this.prisma.imagingStudyInstance.findUnique({
      where: { sopInstanceUid },
      include: {
        series: {
          include: {
            study: { include: { booking: true } },
          },
        },
      },
    });
    if (!instance || instance.series.study.id !== studyId) {
      throw Errors.notFound('Imaging instance not found.');
    }
    if (instance.series.study.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Study does not belong to this imaging center.');
    }
    if (instance.status !== ImagingStudyInstanceStatus.STORED || !instance.objectKey) {
      throw Errors.problem(404, 'INSTANCE_NOT_STORED', 'Not stored', 'Imaging object is not available.');
    }
    const object = await this.objects.get(instance.objectKey);
    return {
      sop_instance_uid: instance.sopInstanceUid,
      study_instance_uid: instance.series.study.studyInstanceUid,
      series_instance_uid: instance.series.seriesInstanceUid,
      content_type: object.contentType,
      byte_size: object.bytes.length,
      sandbox: true,
      storage: 'local_private_object_store' as const,
      note: 'Authorized retrieval via private object store — not a public URL.',
      payload_base64: object.bytes.toString('base64'),
    };
  }

  async getCustomerStudyMetadata(imagingBookingId: string, customerPersonId: string) {
    const booking = await this.prisma.imagingBooking.findUnique({
      where: { id: imagingBookingId },
      include: {
        study: {
          include: {
            series: { include: { instances: { select: { sopInstanceUid: true, status: true, sandbox: true } } } },
            acquisition: true,
          },
        },
      },
    });
    if (!booking || booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s imaging booking.');
    }
    const study = booking.study;
    if (!study) {
      return {
        imaging_booking_id: imagingBookingId,
        study_available: false,
        note: 'Imaging study has not been scheduled yet.',
      };
    }
    const instanceCount = study.series.reduce((n, s) => n + s.instances.length, 0);
    const productionInfra = readInfrastructureEnvironment() === 'production';
    const viewable =
      !productionInfra &&
      study.sandbox &&
      instanceCount > 0 &&
      study.status !== 'ACQUISITION_FAILED' &&
      study.status !== 'CANCELLED';
    return {
      imaging_booking_id: imagingBookingId,
      imaging_study_id: study.id,
      study_available: study.status === 'ACQUIRED' || instanceCount > 0,
      study_instance_uid: study.studyInstanceUid,
      accession_number: study.accessionNumber,
      modality_code: study.modalityCode,
      study_description: study.studyDescription,
      study_date_time: study.studyDateTime?.toISOString() ?? null,
      study_status: study.status,
      series_count: study.series.length,
      instance_count: instanceCount,
      sandbox: study.sandbox,
      viewer: viewable
        ? {
            available: true,
            reason: 'Sandbox diagnostic viewer available for this study.',
            certified_diagnostic_workstation: false,
            mode: 'SANDBOX_DIAGNOSTIC_FRAMES',
          }
        : {
            available: false,
            reason: productionInfra
              ? NO_PRODUCTION_PACS_VIEWER
              : 'No viewable imaging instances for this booking yet.',
            certified_diagnostic_workstation: false,
          },
      storage: {
        sandbox: true,
        production_pacs: false,
        note: viewable
          ? 'Study metadata and sandbox diagnostic viewer frames are available. Production PACS remains EXTERNAL_GATED.'
          : 'Study metadata is available. Clinical image viewing requires production PACS integration.',
      },
    };
  }
}
