import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';

@Injectable()
export class CareNavAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    sessionId: string;
    actorPersonId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.careNavAudit.create({
      data: {
        id: uuidv7(),
        sessionId: input.sessionId,
        actorPersonId: input.actorPersonId ?? null,
        action: input.action,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
