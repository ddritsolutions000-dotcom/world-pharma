import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { correlationId } from '../common/correlation';
import { sanitizePayload } from './envelope';

export type DbTx = Prisma.TransactionClient;

export interface EnqueueInput {
  type: string;
  schemaVersion?: number;
  aggregateType: string;
  aggregateId: string;
  producer: string;
  countryId?: string | null;
  regionId?: string | null;
  legalEntityId?: string | null;
  organizationId?: string | null;
  payload: Record<string, unknown>;
  correlationId?: string | null;
  causationId?: string | null;
  actorId?: string | null;
  occurrenceKey: string;
}

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(tx: DbTx | PrismaService, input: EnqueueInput) {
    const payload = sanitizePayload(input.payload);
    return tx.outboxEvent.create({
      data: {
        id: uuidv7(),
        type: input.type,
        schemaVersion: input.schemaVersion ?? 1,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        producer: input.producer,
        countryId: input.countryId ?? null,
        regionId: input.regionId ?? null,
        legalEntityId: input.legalEntityId ?? null,
        organizationId: input.organizationId ?? null,
        payload: payload as Prisma.InputJsonValue,
        correlationId: input.correlationId ?? correlationId() ?? null,
        causationId: input.causationId ?? null,
        actorId: input.actorId ?? null,
        occurrenceKey: input.occurrenceKey,
        status: 'PENDING',
        availableAt: new Date(),
      },
    });
  }
}
