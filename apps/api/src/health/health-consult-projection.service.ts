import { Injectable } from '@nestjs/common';
import {
  HealthArtifactStatus,
  HealthArtifactType,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PolicyResolver } from '../policy/resolver';
import { HealthTimelineService } from './health-timeline.service';

@Injectable()
export class HealthConsultProjectionService {
  constructor(
    private readonly timeline: HealthTimelineService,
    private readonly policy: PolicyResolver,
  ) {}

  async projectCompletedEncounter(
    tx: Prisma.TransactionClient,
    input: {
      encounterId: string;
      patientPersonId: string;
      countryId: string;
      countryCode: string;
      publishedAt: Date;
      title?: string;
    },
  ) {
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!this.policy.isHealthTimelineEnabled(resolved?.document ?? null)) {
      return null;
    }

    const existing = await tx.healthArtifact.findUnique({
      where: { encounterId: input.encounterId },
    });
    if (existing) {
      return existing;
    }

    const artifactId = uuidv7();
    const title = input.title?.trim() || 'Consultation summary';
    const artifact = await tx.healthArtifact.create({
      data: {
        id: artifactId,
        personId: input.patientPersonId,
        countryId: input.countryId,
        artifactType: HealthArtifactType.CONSULT_NOTE,
        encounterId: input.encounterId,
        title,
        publishedAt: input.publishedAt,
        sandbox: true,
        status: HealthArtifactStatus.ACTIVE,
      },
    });

    await this.timeline.projectConsultCompleted(tx, {
      personId: input.patientPersonId,
      countryId: input.countryId,
      artifactId,
      artifactType: HealthArtifactType.CONSULT_NOTE,
      sourceId: input.encounterId,
      title,
      occurredAt: input.publishedAt,
      sandbox: true,
    });

    return artifact;
  }
}
