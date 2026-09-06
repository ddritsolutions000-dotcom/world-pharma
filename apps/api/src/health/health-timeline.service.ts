import { Injectable } from '@nestjs/common';
import {
  HealthArtifactType,
  HealthTimelineEventStatus,
  HealthTimelineEventType,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';

export type HealthTimelineSourceModule = 'lab' | 'radiology' | 'clinical' | 'encounter' | 'upload';

@Injectable()
export class HealthTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async projectArtifactPublished(
    tx: Prisma.TransactionClient,
    input: {
      personId: string;
      countryId: string;
      artifactId: string;
      artifactType: HealthArtifactType;
      sourceModule: string;
      sourceId: string;
      title: string;
      occurredAt: Date;
      sandbox?: boolean;
      subjectFamilyMemberId?: string | null;
    },
  ) {
    const existing = await tx.healthTimelineEvent.findFirst({
      where: {
        sourceModule: input.sourceModule,
        sourceId: input.sourceId,
        eventType: HealthTimelineEventType.ARTIFACT_PUBLISHED,
        status: HealthTimelineEventStatus.ACTIVE,
      },
    });
    if (existing) {
      return existing;
    }
    return tx.healthTimelineEvent.create({
      data: {
        id: uuidv7(),
        personId: input.personId,
        countryId: input.countryId,
        eventType: HealthTimelineEventType.ARTIFACT_PUBLISHED,
        artifactId: input.artifactId,
        artifactType: input.artifactType,
        sourceModule: input.sourceModule,
        sourceId: input.sourceId,
        title: input.title,
        status: HealthTimelineEventStatus.ACTIVE,
        occurredAt: input.occurredAt,
        sandbox: input.sandbox ?? true,
        subjectFamilyMemberId: input.subjectFamilyMemberId ?? null,
      },
    });
  }

  async projectArtifactUploaded(
    tx: Prisma.TransactionClient,
    input: {
      personId: string;
      countryId: string;
      artifactId: string;
      artifactType: HealthArtifactType;
      sourceId: string;
      title: string;
      occurredAt: Date;
      sandbox?: boolean;
    },
  ) {
    const existing = await tx.healthTimelineEvent.findFirst({
      where: {
        artifactId: input.artifactId,
        eventType: HealthTimelineEventType.ARTIFACT_UPLOADED,
        status: HealthTimelineEventStatus.ACTIVE,
      },
    });
    if (existing) {
      return existing;
    }
    return tx.healthTimelineEvent.create({
      data: {
        id: uuidv7(),
        personId: input.personId,
        countryId: input.countryId,
        eventType: HealthTimelineEventType.ARTIFACT_UPLOADED,
        artifactId: input.artifactId,
        artifactType: input.artifactType,
        sourceModule: 'upload',
        sourceId: input.sourceId,
        title: input.title,
        status: HealthTimelineEventStatus.ACTIVE,
        occurredAt: input.occurredAt,
        sandbox: input.sandbox ?? true,
      },
    });
  }

  async projectConsultCompleted(
    tx: Prisma.TransactionClient,
    input: {
      personId: string;
      countryId: string;
      artifactId: string;
      artifactType: HealthArtifactType;
      sourceId: string;
      title: string;
      occurredAt: Date;
      sandbox?: boolean;
      subjectFamilyMemberId?: string | null;
    },
  ) {
    const existing = await tx.healthTimelineEvent.findFirst({
      where: {
        sourceModule: 'encounter',
        sourceId: input.sourceId,
        eventType: HealthTimelineEventType.CONSULT_COMPLETED,
        status: HealthTimelineEventStatus.ACTIVE,
      },
    });
    if (existing) {
      return existing;
    }
    return tx.healthTimelineEvent.create({
      data: {
        id: uuidv7(),
        personId: input.personId,
        countryId: input.countryId,
        eventType: HealthTimelineEventType.CONSULT_COMPLETED,
        artifactId: input.artifactId,
        artifactType: input.artifactType,
        sourceModule: 'encounter',
        sourceId: input.sourceId,
        title: input.title,
        status: HealthTimelineEventStatus.ACTIVE,
        occurredAt: input.occurredAt,
        sandbox: input.sandbox ?? true,
        subjectFamilyMemberId: input.subjectFamilyMemberId ?? null,
      },
    });
  }

  async listForPatient(input: {
    personId: string;
    countryId: string;
    types?: HealthArtifactType[];
    cursor?: string;
    limit?: number;
    subjectFamilyMemberId?: string | null;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const rows = await this.prisma.healthTimelineEvent.findMany({
      where: {
        personId: input.personId,
        countryId: input.countryId,
        status: HealthTimelineEventStatus.ACTIVE,
        subjectFamilyMemberId: input.subjectFamilyMemberId ?? null,
        ...(input.types?.length ? { artifactType: { in: input.types } } : {}),
        ...(input.cursor
          ? {
              OR: [
                { occurredAt: { lt: new Date(input.cursor.split('|')[0]!) } },
                {
                  occurredAt: new Date(input.cursor.split('|')[0]!),
                  id: { lt: input.cursor.split('|')[1]! },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const next = rows.length > limit ? page[page.length - 1] : null;
    return {
      items: page.map((row) => this.present(row)),
      next_cursor: next ? `${next.occurredAt.toISOString()}|${next.id}` : null,
    };
  }

  present(row: {
    id: string;
    eventType: HealthTimelineEventType;
    artifactId: string | null;
    artifactType: HealthArtifactType | null;
    sourceModule: string;
    sourceId: string;
    title: string;
    status: HealthTimelineEventStatus;
    occurredAt: Date;
    sandbox: boolean;
    subjectFamilyMemberId?: string | null;
  }) {
    return {
      id: row.id,
      event_type: row.eventType,
      artifact_id: row.artifactId,
      artifact_type: row.artifactType,
      source_module: row.sourceModule,
      source_id: row.sourceId,
      title: row.title,
      /** Safe non-PHI summary for dashboard/timeline cards only. */
      summary: this.safeSummary(row.eventType, row.artifactType, row.title),
      status: row.status,
      occurred_at: row.occurredAt.toISOString(),
      sandbox: row.sandbox,
      subject_family_member_id: row.subjectFamilyMemberId ?? null,
      deep_link: this.deepLinkHint(row.artifactType, row.artifactId, row.sourceModule, row.sourceId),
    };
  }

  private safeSummary(
    eventType: HealthTimelineEventType,
    artifactType: HealthArtifactType | null,
    title: string,
  ): string {
    if (eventType === HealthTimelineEventType.CONSULT_COMPLETED) {
      return 'Consultation completed. Open the authorized summary for details.';
    }
    if (artifactType === HealthArtifactType.PRESCRIPTION_STRUCTURED) {
      return 'A prescription is available. Clinical details require authorized access.';
    }
    if (artifactType === HealthArtifactType.LAB_REPORT) {
      return 'A lab report is available. Results require authorized access.';
    }
    if (artifactType === HealthArtifactType.IMAGING_REPORT) {
      return 'An imaging report is available. Findings require authorized access.';
    }
    return title;
  }

  private deepLinkHint(
    artifactType: HealthArtifactType | null,
    artifactId: string | null,
    sourceModule: string,
    sourceId: string,
  ): string | null {
    if (artifactId) {
      return `/health/artifacts/${artifactId}`;
    }
    if (sourceModule === 'encounter') {
      return `/appointments/${sourceId}`;
    }
    if (sourceModule === 'lab') {
      return `/lab/bookings/${sourceId}`;
    }
    if (sourceModule === 'radiology') {
      return `/radiology/bookings/${sourceId}`;
    }
    if (artifactType === HealthArtifactType.PRESCRIPTION_STRUCTURED) {
      return '/prescriptions';
    }
    return '/health';
  }
}
