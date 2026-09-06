import { Injectable } from '@nestjs/common';
import {
  HealthArtifactStatus,
  HealthArtifactType,
  HealthTimelineEventStatus,
  HealthTimelineEventType,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { HealthTimelineService } from './health-timeline.service';

type DiagnosticPublishInput = {
  personId: string;
  countryId: string;
  publishedAt: Date;
  sourceId: string;
  subjectFamilyMemberId?: string | null;
} & (
  | {
      kind: 'lab';
      labReportVersionId: string;
      labBookingId: string;
    }
  | {
      kind: 'imaging';
      imagingReportVersionId: string;
      imagingBookingId: string;
    }
);

@Injectable()
export class HealthDiagnosticProjectionService {
  constructor(private readonly timeline: HealthTimelineService) {}

  async projectPublishedLabReport(
    tx: Prisma.TransactionClient,
    input: {
      labReportVersionId: string;
      labBookingId: string;
      personId: string;
      countryId: string;
      publishedAt: Date;
      subjectFamilyMemberId?: string | null;
    },
  ) {
    return this.projectPublished(tx, { kind: 'lab', ...input, sourceId: input.labBookingId });
  }

  async projectPublishedImagingReport(
    tx: Prisma.TransactionClient,
    input: {
      imagingReportVersionId: string;
      imagingBookingId: string;
      personId: string;
      countryId: string;
      publishedAt: Date;
      subjectFamilyMemberId?: string | null;
    },
  ) {
    return this.projectPublished(tx, { kind: 'imaging', ...input, sourceId: input.imagingBookingId });
  }

  private async projectPublished(tx: Prisma.TransactionClient, input: DiagnosticPublishInput) {
    const versionUnique =
      input.kind === 'lab'
        ? { labReportVersionId: input.labReportVersionId }
        : { imagingReportVersionId: input.imagingReportVersionId };
    const existing = await tx.healthArtifact.findUnique({ where: versionUnique });
    const sourceModule = input.kind === 'lab' ? 'lab' : 'radiology';
    const title = input.kind === 'lab' ? 'Lab diagnostic report' : 'Imaging report';
    const artifactType =
      input.kind === 'lab' ? HealthArtifactType.LAB_REPORT : HealthArtifactType.IMAGING_REPORT;

    if (existing) {
      if (existing.status === HealthArtifactStatus.ACTIVE) {
        await this.timeline.projectArtifactPublished(tx, {
          personId: existing.personId,
          countryId: existing.countryId ?? input.countryId,
          artifactId: existing.id,
          artifactType: existing.artifactType,
          sourceModule,
          sourceId: input.sourceId,
          title: existing.title ?? title,
          occurredAt: existing.publishedAt,
          sandbox: existing.sandbox,
          subjectFamilyMemberId: existing.subjectFamilyMemberId ?? input.subjectFamilyMemberId ?? null,
        });
      }
      return existing;
    }

    const priorWhere: Prisma.HealthArtifactWhereInput =
      input.kind === 'lab'
        ? {
            labBookingId: input.labBookingId,
            artifactType: HealthArtifactType.LAB_REPORT,
            status: HealthArtifactStatus.ACTIVE,
          }
        : {
            imagingBookingId: input.imagingBookingId,
            artifactType: HealthArtifactType.IMAGING_REPORT,
            status: HealthArtifactStatus.ACTIVE,
          };

    await tx.healthArtifact.updateMany({
      where: priorWhere,
      data: { status: HealthArtifactStatus.SUPERSEDED },
    });
    await tx.healthTimelineEvent.updateMany({
      where: {
        sourceModule,
        sourceId: input.sourceId,
        eventType: HealthTimelineEventType.ARTIFACT_PUBLISHED,
        status: HealthTimelineEventStatus.ACTIVE,
      },
      data: { status: HealthTimelineEventStatus.SUPERSEDED },
    });

    const subjectFamilyMemberId = input.subjectFamilyMemberId ?? null;
    const artifactId = uuidv7();
    const artifact = await tx.healthArtifact.create({
      data: {
        id: artifactId,
        personId: input.personId,
        countryId: input.countryId,
        artifactType,
        title,
        publishedAt: input.publishedAt,
        sandbox: true,
        status: HealthArtifactStatus.ACTIVE,
        subjectFamilyMemberId,
        ...(input.kind === 'lab'
          ? { labReportVersionId: input.labReportVersionId, labBookingId: input.labBookingId }
          : {
              imagingReportVersionId: input.imagingReportVersionId,
              imagingBookingId: input.imagingBookingId,
            }),
      },
    });

    await this.timeline.projectArtifactPublished(tx, {
      personId: artifact.personId,
      countryId: input.countryId,
      artifactId: artifact.id,
      artifactType: artifact.artifactType,
      sourceModule,
      sourceId: input.sourceId,
      title,
      occurredAt: input.publishedAt,
      sandbox: artifact.sandbox,
      subjectFamilyMemberId,
    });

    return artifact;
  }
}
