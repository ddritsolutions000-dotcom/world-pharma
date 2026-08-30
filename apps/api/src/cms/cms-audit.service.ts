import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';

@Injectable()
export class CmsAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    contentItemId: string;
    actorPersonId?: string;
    action: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.cmsContentAudit.create({
      data: {
        id: uuidv7(),
        contentItemId: input.contentItemId,
        actorPersonId: input.actorPersonId,
        action: input.action,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
