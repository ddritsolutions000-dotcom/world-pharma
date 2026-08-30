import { Injectable } from '@nestjs/common';
import {
  HealthArtifactStatus,
  HealthArtifactType,
  HealthTimelineEventStatus,
  HealthTimelineEventType,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { PolicyResolver } from '../policy/resolver';
import { HealthTimelineService } from './health-timeline.service';

@Injectable()
export class HealthPrescriptionProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: HealthTimelineService,
    private readonly policy: PolicyResolver,
  ) {}

  async projectIssuedVersion(
    tx: Prisma.TransactionClient,
    input: {
      prescriptionId: string;
      prescriptionVersionId: string;
      patientPersonId: string;
      countryId: string;
      countryCode: string;
      publishedAt: Date;
    },
  ) {
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!this.policy.isHealthTimelineEnabled(resolved?.document ?? null)) {
      return null;
    }

    const existing = await tx.healthArtifact.findUnique({
      where: { prescriptionVersionId: input.prescriptionVersionId },
    });
    if (existing) {
      return existing;
    }

    const artifactId = uuidv7();
    const artifact = await tx.healthArtifact.create({
      data: {
        id: artifactId,
        personId: input.patientPersonId,
        countryId: input.countryId,
        artifactType: HealthArtifactType.PRESCRIPTION_STRUCTURED,
        prescriptionId: input.prescriptionId,
        prescriptionVersionId: input.prescriptionVersionId,
        title: 'Prescription',
        publishedAt: input.publishedAt,
        sandbox: true,
        status: HealthArtifactStatus.ACTIVE,
      },
    });

    await this.timeline.projectArtifactPublished(tx, {
      personId: input.patientPersonId,
      countryId: input.countryId,
      artifactId,
      artifactType: HealthArtifactType.PRESCRIPTION_STRUCTURED,
      sourceModule: 'clinical',
      sourceId: input.prescriptionVersionId,
      title: 'Prescription',
      occurredAt: input.publishedAt,
      sandbox: true,
    });

    return artifact;
  }

  async projectAmendedVersion(
    tx: Prisma.TransactionClient,
    input: {
      prescriptionId: string;
      priorVersionId: string;
      prescriptionVersionId: string;
      patientPersonId: string;
      countryId: string;
      countryCode: string;
      publishedAt: Date;
    },
  ) {
    const priorArtifact = await tx.healthArtifact.findUnique({
      where: { prescriptionVersionId: input.priorVersionId },
    });
    if (priorArtifact && priorArtifact.status === HealthArtifactStatus.ACTIVE) {
      await tx.healthArtifact.update({
        where: { id: priorArtifact.id },
        data: { status: HealthArtifactStatus.SUPERSEDED },
      });
      await tx.healthTimelineEvent.updateMany({
        where: {
          sourceModule: 'clinical',
          sourceId: input.priorVersionId,
          eventType: HealthTimelineEventType.ARTIFACT_PUBLISHED,
          status: HealthTimelineEventStatus.ACTIVE,
        },
        data: { status: HealthTimelineEventStatus.SUPERSEDED },
      });
    }

    return this.projectIssuedVersion(tx, {
      prescriptionId: input.prescriptionId,
      prescriptionVersionId: input.prescriptionVersionId,
      patientPersonId: input.patientPersonId,
      countryId: input.countryId,
      countryCode: input.countryCode,
      publishedAt: input.publishedAt,
    });
  }
}
