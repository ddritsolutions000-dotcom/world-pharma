import { Injectable } from '@nestjs/common';
import { ImagingStudyInstanceStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { PrivateObjectStore } from '../partner/object-store';
import { buildSandboxDicomPayload, generateSeriesInstanceUid, generateSopInstanceUid } from './dicom-uid';
import { PacsAdapter, type IngestStudyInput, type IngestStudyResult } from './pacs.port';

@Injectable()
export class SandboxPacsAdapter extends PacsAdapter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: PrivateObjectStore,
  ) {
    super();
  }

  async ingestStudy(input: IngestStudyInput): Promise<IngestStudyResult> {
    const study = await this.prisma.imagingStudy.findUnique({
      where: { id: input.imagingStudyId },
      include: { series: { include: { instances: true } } },
    });
    if (!study || study.imagingOrgId !== input.imagingOrgId) {
      throw new Error('study_not_found');
    }

    if (study.ingestIdempotencyKey === input.idempotencyKey && study.series.length > 0) {
      return this.presentExisting(study, true);
    }

    const existingSeries = study.series[0];
    if (existingSeries?.instances.length) {
      await this.prisma.imagingStudy.update({
        where: { id: study.id },
        data: { ingestIdempotencyKey: input.idempotencyKey },
      });
      const refreshed = await this.prisma.imagingStudy.findUniqueOrThrow({
        where: { id: study.id },
        include: { series: { include: { instances: true } } },
      });
      return this.presentExisting(refreshed, true);
    }

    const seriesInstanceUid = generateSeriesInstanceUid();
    const sopInstanceUid = generateSopInstanceUid();
    const payload = buildSandboxDicomPayload({
      studyInstanceUid: input.studyInstanceUid,
      seriesInstanceUid,
      sopInstanceUid,
      accessionNumber: input.accessionNumber,
      modalityCode: input.modalityCode,
    });
    const stored = await this.objects.put({
      bytes: payload,
      contentType: 'application/dicom+json+sandbox',
      prefix: `imaging-dicom/${input.imagingOrgId}/${study.id}`,
    });

    const seriesId = uuidv7();
    const instanceId = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.imagingStudy.update({
        where: { id: study.id },
        data: {
          ingestIdempotencyKey: input.idempotencyKey,
          studyDescription: input.studyDescription ?? study.studyDescription,
          studyDateTime: study.studyDateTime ?? new Date(),
        },
      });
      await tx.imagingStudySeries.create({
        data: {
          id: seriesId,
          imagingStudyId: study.id,
          seriesInstanceUid,
          modalityCode: input.modalityCode,
          description: input.studyDescription ?? 'Sandbox acquisition series',
          seriesNumber: 1,
          sandbox: true,
          metadata: { sandbox: true, pacs: false } as Prisma.InputJsonValue,
        },
      });
      await tx.imagingStudyInstance.create({
        data: {
          id: instanceId,
          imagingSeriesId: seriesId,
          sopInstanceUid,
          objectKey: stored.key,
          contentType: stored.contentType,
          byteSize: BigInt(stored.byteSize),
          checksumSha256: stored.checksumSha256,
          status: ImagingStudyInstanceStatus.STORED,
          idempotencyKey: input.idempotencyKey,
          sandbox: true,
          metadata: {
            sandbox: true,
            storage: 'local_private_object_store',
            note: 'Not production PACS storage.',
          } as Prisma.InputJsonValue,
        },
      });
    });

    const refreshed = await this.prisma.imagingStudy.findUniqueOrThrow({
      where: { id: study.id },
      include: { series: { include: { instances: true } } },
    });
    return this.presentExisting(refreshed, false);
  }

  private presentExisting(
    study: {
      studyInstanceUid: string;
      series: Array<{
        seriesInstanceUid: string;
        modalityCode: string | null;
        description: string | null;
        instances: Array<{
          sopInstanceUid: string;
          objectKey: string | null;
          contentType: string | null;
          byteSize: bigint | null;
          checksumSha256: string | null;
        }>;
      }>;
    },
    idempotent: boolean,
  ): IngestStudyResult {
    return {
      studyInstanceUid: study.studyInstanceUid,
      series: study.series.map((series) => ({
        seriesInstanceUid: series.seriesInstanceUid,
        modalityCode: series.modalityCode,
        description: series.description,
        instances: series.instances.map((inst) => ({
          sopInstanceUid: inst.sopInstanceUid,
          objectKey: inst.objectKey!,
          contentType: inst.contentType ?? 'application/octet-stream',
          byteSize: Number(inst.byteSize ?? 0n),
          checksumSha256: inst.checksumSha256 ?? '',
        })),
      })),
      sandbox: true,
      storage: 'local_private_object_store',
      idempotent,
    };
  }
}
