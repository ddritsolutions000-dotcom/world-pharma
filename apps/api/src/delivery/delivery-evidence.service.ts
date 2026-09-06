import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ProofOfDeliveryKind, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { MalwareScanner, PrivateObjectStore } from '../partner/object-store';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const POD_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SIGNATURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml']);

export type PodLocationInput = {
  latitude?: number;
  longitude?: number;
  accuracy_meters?: number;
};

@Injectable()
export class DeliveryEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: PrivateObjectStore,
    private readonly scanner: MalwareScanner,
  ) {}

  async attachPhotoEvidence(
    principal: Principal,
    job: { id: string; shipmentId: string | null; assigneeId: string | null },
    input: {
      contentBase64: string;
      contentType: string;
      idempotencyKey?: string;
      location?: PodLocationInput;
    },
  ) {
    if (!job.shipmentId) {
      throw Errors.notFound('Shipment not linked to job.');
    }
    if (input.idempotencyKey) {
      const prior = await this.prisma.runWithTenant(workerTenantContext(), () =>
        this.prisma.proofOfDelivery.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        }),
      );
      if (prior) {
        return this.presentEvidence(prior);
      }
    }
    const contentType = input.contentType.toLowerCase();
    if (!POD_IMAGE_TYPES.has(contentType)) {
      throw Errors.validation('content_type must be image/jpeg, image/png, or image/webp.');
    }
    const bytes = decodeBase64(input.contentBase64);
    const scan = await this.scanner.scan(bytes, contentType);
    if (!scan.clean) {
      throw Errors.problem(422, 'MALWARE_DETECTED', 'Upload rejected', 'Evidence failed malware scan.');
    }
    const stored = await this.objects.put({
      bytes,
      contentType,
      prefix: `delivery-pod/${job.shipmentId}`,
    });
    const metadata = buildLocationMetadata(input.location);
    let row;
    try {
      row = await this.prisma.runWithTenant(workerTenantContext(), async () =>
        this.prisma.proofOfDelivery.create({
          data: {
            id: uuidv7(),
            shipmentId: job.shipmentId!,
            kind: ProofOfDeliveryKind.PHOTO,
            secretHash: stored.checksumSha256,
            objectKey: stored.key,
            metadata: metadata as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
          },
        }),
      );
    } catch (err) {
      if (
        input.idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const prior = await this.prisma.runWithTenant(workerTenantContext(), () =>
          this.prisma.proofOfDelivery.findUnique({ where: { idempotencyKey: input.idempotencyKey } }),
        );
        if (prior) {
          return this.presentEvidence(prior);
        }
      }
      throw err;
    }
    const existing = await this.prisma.logisticsJob.findUnique({ where: { id: job.id } });
    const existingPayload =
      existing?.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload)
        ? (existing.payload as Record<string, unknown>)
        : {};
    await this.prisma.logisticsJob.update({
      where: { id: job.id },
      data: {
        payload: {
          ...existingPayload,
          pod_photo_object_key: stored.key,
          pod_photo_captured_at: new Date().toISOString(),
        },
      },
    });
    return this.presentEvidence(row);
  }

  async attachSignatureEvidence(
    principal: Principal,
    job: { id: string; shipmentId: string | null; assigneeId: string | null },
    input: {
      contentBase64: string;
      contentType: string;
      idempotencyKey?: string;
      location?: PodLocationInput;
    },
  ) {
    if (!job.shipmentId) {
      throw Errors.notFound('Shipment not linked to job.');
    }
    if (input.idempotencyKey) {
      const prior = await this.prisma.runWithTenant(workerTenantContext(), () =>
        this.prisma.proofOfDelivery.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        }),
      );
      if (prior) {
        return this.presentEvidence(prior);
      }
    }
    const contentType = input.contentType.toLowerCase();
    if (!SIGNATURE_TYPES.has(contentType)) {
      throw Errors.validation('content_type must be image/png, image/jpeg, or image/svg+xml.');
    }
    const bytes = decodeBase64(input.contentBase64);
    const stored = await this.objects.put({
      bytes,
      contentType,
      prefix: `delivery-pod/${job.shipmentId}`,
    });
    const metadata = buildLocationMetadata(input.location);
    let row;
    try {
      row = await this.prisma.runWithTenant(workerTenantContext(), async () =>
        this.prisma.proofOfDelivery.create({
          data: {
            id: uuidv7(),
            shipmentId: job.shipmentId!,
            kind: ProofOfDeliveryKind.SIGNATURE,
            secretHash: stored.checksumSha256,
            objectKey: stored.key,
            metadata: metadata as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
          },
        }),
      );
    } catch (err) {
      if (
        input.idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const prior = await this.prisma.runWithTenant(workerTenantContext(), () =>
          this.prisma.proofOfDelivery.findUnique({ where: { idempotencyKey: input.idempotencyKey } }),
        );
        if (prior) {
          return this.presentEvidence(prior);
        }
      }
      throw err;
    }
    const existing = await this.prisma.logisticsJob.findUnique({ where: { id: job.id } });
    const existingPayload =
      existing?.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload)
        ? (existing.payload as Record<string, unknown>)
        : {};
    await this.prisma.logisticsJob.update({
      where: { id: job.id },
      data: {
        payload: {
          ...existingPayload,
          pod_signature_object_key: stored.key,
          pod_signature_captured_at: new Date().toISOString(),
        },
      },
    });
    return this.presentEvidence(row);
  }

  async issueEvidenceTicket(principal: Principal, job: { shipmentId: string | null }, kind: ProofOfDeliveryKind) {
    if (!job.shipmentId) {
      throw Errors.notFound('Shipment not linked to job.');
    }
    const row = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.proofOfDelivery.findFirst({
        where: { shipmentId: job.shipmentId!, kind, objectKey: { not: null } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    if (!row?.objectKey) {
      throw Errors.notFound('No private evidence object for this job.');
    }
    const ticket = await this.objects.signAccess(row.objectKey, 300);
    return {
      sandbox: true as const,
      kind: row.kind,
      evidence_id: row.id,
      access_ticket: ticket.ticket,
      expires_at: ticket.expiresAt.toISOString(),
      note: 'Private object ticket — not a public URL. Production CDN/storage remains EXTERNAL-GATED.',
    };
  }

  async summaryForShipment(shipmentId: string) {
    const rows = await this.prisma.proofOfDelivery.findMany({
      where: { shipmentId },
      orderBy: { createdAt: 'asc' },
    });
    return {
      otp_recorded: rows.some((row) => row.kind === ProofOfDeliveryKind.OTP),
      photo_attached: rows.some((row) => row.kind === ProofOfDeliveryKind.PHOTO),
      signature_attached: rows.some((row) => row.kind === ProofOfDeliveryKind.SIGNATURE),
      sandbox: true as const,
      note: 'Evidence metadata only — object bytes require authorized private ticket.',
    };
  }

  private presentEvidence(row: {
    id: string;
    kind: ProofOfDeliveryKind;
    objectKey: string | null;
    metadata: unknown;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      kind: row.kind,
      object_key: row.objectKey,
      metadata: row.metadata,
      created_at: row.createdAt.toISOString(),
      sandbox: true as const,
      public_url: null,
      note: 'Private object reference — no public URL.',
    };
  }
}

function decodeBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  const payload = trimmed.includes(',') ? trimmed.split(',').pop()! : trimmed;
  try {
    return Buffer.from(payload, 'base64');
  } catch {
    throw Errors.validation('content_base64 is invalid.');
  }
}

function buildLocationMetadata(location?: PodLocationInput): Record<string, unknown> {
  if (!location?.latitude && !location?.longitude) {
    return { sandbox: true };
  }
  return {
    sandbox: true,
    device_gps_validated: false,
    location: {
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      accuracy_meters: location.accuracy_meters ?? null,
      source: 'client_injected',
    },
  };
}

export function hashDeliverySecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
