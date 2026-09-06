import { Injectable, Logger } from '@nestjs/common';
import {
  HealthArtifactStatus,
  HealthArtifactType,
  HealthTimelineEventType,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { RateLimitService } from '../identity/rate-limit.service';
import { SecurityEventsService } from '../identity/security-events.service';
import {
  MalwareScanner,
  PrivateObjectStore,
  sanitizeFilename,
} from '../partner/object-store';
import { authTenantContext } from '../tenancy/build-tenant-context';
import {
  ALLOWED_HEALTH_UPLOAD_CONTENT_TYPES,
  defaultUploadTitle,
  HEALTH_UPLOAD_ARTIFACT_TYPES,
  HEALTH_UPLOAD_CLASSIFICATION,
  MAX_HEALTH_UPLOAD_BYTES,
} from './health-upload.constants';
import { HealthTimelineService } from './health-timeline.service';

export type HealthUploadResult = {
  artifact_id: string;
  artifact_type: HealthArtifactType;
  title: string;
  published_at: string;
  timeline_event_id: string;
  content_type: string;
  byte_size: number;
  sandbox: boolean;
};

@Injectable()
export class HealthUploadService {
  private readonly logger = new Logger(HealthUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: PrivateObjectStore,
    private readonly scanner: MalwareScanner,
    private readonly timeline: HealthTimelineService,
    private readonly events: SecurityEventsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async uploadDocument(input: {
    personId: string;
    countryId: string;
    artifactType: HealthArtifactType;
    title?: string;
    originalName: string;
    contentType: string;
    bytes: Buffer;
    idempotencyKey?: string;
    requestId?: string;
  }): Promise<HealthUploadResult> {
    if (!HEALTH_UPLOAD_ARTIFACT_TYPES.has(input.artifactType)) {
      throw Errors.validation('Unsupported health upload artifact type');
    }
    if (!ALLOWED_HEALTH_UPLOAD_CONTENT_TYPES.has(input.contentType)) {
      throw Errors.validation('Unsupported document type');
    }
    if (input.bytes.length > MAX_HEALTH_UPLOAD_BYTES) {
      throw Errors.validation('Document exceeds size limit');
    }
    if (!input.originalName?.trim()) {
      throw Errors.validation('original_name is required');
    }
    const uploadHit = await this.rateLimit.hit(`upload:health:${input.personId}`, 40, 900);
    if (!uploadHit.allowed) {
      throw Errors.rateLimited(uploadHit.retryAfter);
    }

    const idempotencyKey = input.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existing = await this.prisma.healthArtifactUpload.findUnique({
        where: {
          personId_idempotencyKey: {
            personId: input.personId,
            idempotencyKey,
          },
        },
        include: { artifact: true },
      });
      if (existing) {
        const timeline = await this.prisma.healthTimelineEvent.findFirst({
          where: {
            artifactId: existing.artifactId,
            eventType: HealthTimelineEventType.ARTIFACT_UPLOADED,
          },
          orderBy: { createdAt: 'asc' },
        });
        return this.present(existing.artifact, existing, timeline?.id ?? existing.id);
      }
    }

    const scan = await this.scanner.scan(input.bytes, input.contentType);
    if (!scan.clean) {
      throw Errors.validation('Document failed malware scan');
    }

    const artifactId = uuidv7();
    const uploadId = uuidv7();
    const safeName = sanitizeFilename(input.originalName);
    const title = input.title?.trim() || defaultUploadTitle(input.artifactType);
    const now = new Date();

    const stored = await this.objects.put({
      bytes: input.bytes,
      contentType: input.contentType,
      prefix: `health-uploads/${input.personId}`,
    });

    const created = await this.prisma.runWithTenant(
      authTenantContext(input.personId),
      async () =>
        this.prisma.$transaction(async (tx) => {
          const artifact = await tx.healthArtifact.create({
            data: {
              id: artifactId,
              personId: input.personId,
              countryId: input.countryId,
              artifactType: input.artifactType,
              status: HealthArtifactStatus.ACTIVE,
              title,
              publishedAt: now,
              sandbox: true,
            },
          });
          const upload = await tx.healthArtifactUpload.create({
            data: {
              id: uploadId,
              artifactId: artifact.id,
              personId: input.personId,
              countryId: input.countryId,
              objectKey: stored.key,
              contentType: input.contentType,
              byteSize: stored.byteSize,
              checksumSha256: stored.checksumSha256,
              originalName: safeName,
              classification: HEALTH_UPLOAD_CLASSIFICATION,
              idempotencyKey,
              uploadedAt: now,
              sandbox: true,
            },
          });
          const timelineEvent = await this.timeline.projectArtifactUploaded(tx, {
            personId: input.personId,
            countryId: input.countryId,
            artifactId: artifact.id,
            artifactType: input.artifactType,
            sourceId: upload.id,
            title,
            occurredAt: now,
            sandbox: true,
          });
          return { artifact, upload, timelineEvent };
        }),
      { fresh: true },
    );

    this.logger.log(
      JSON.stringify({
        event: 'HEALTH_DOCUMENT_UPLOADED',
        person_id: input.personId,
        artifact_id: created.artifact.id,
        artifact_type: input.artifactType,
        content_type: input.contentType,
        byte_size: stored.byteSize,
      }),
    );
    await this.events.emit({
      type: 'HEALTH_DOCUMENT_UPLOADED',
      outcome: 'success',
      personId: input.personId,
      requestId: input.requestId,
      metadata: {
        artifact_id: created.artifact.id,
        artifact_type: input.artifactType,
        content_type: input.contentType,
        byte_size: stored.byteSize,
      },
    });

    return this.present(created.artifact, created.upload, created.timelineEvent.id);
  }

  async getUploadPayload(artifactId: string, personId: string) {
    const upload = await this.prisma.healthArtifactUpload.findFirst({
      where: { artifactId, personId },
    });
    if (!upload) {
      throw Errors.problem(
        404,
        'ARTIFACT_NOT_AVAILABLE',
        'Artifact not available',
        'Payload is not available for this artifact.',
      );
    }
    const object = await this.objects.get(upload.objectKey);
    return {
      content_type: upload.contentType,
      byte_size: upload.byteSize,
      checksum_sha256: upload.checksumSha256,
      original_name: upload.originalName,
      classification: upload.classification,
      uploaded_at: upload.uploadedAt.toISOString(),
      content_base64: object.bytes.toString('base64'),
    };
  }

  private present(
    artifact: {
      id: string;
      artifactType: HealthArtifactType;
      title: string | null;
      publishedAt: Date;
      sandbox: boolean;
    },
    upload: { contentType: string; byteSize: number },
    timelineEventId: string,
  ): HealthUploadResult {
    return {
      artifact_id: artifact.id,
      artifact_type: artifact.artifactType,
      title: artifact.title ?? defaultUploadTitle(artifact.artifactType),
      published_at: artifact.publishedAt.toISOString(),
      timeline_event_id: timelineEventId,
      content_type: upload.contentType,
      byte_size: upload.byteSize,
      sandbox: artifact.sandbox,
    };
  }
}
