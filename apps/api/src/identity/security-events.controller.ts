import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { JwtAuthGuard } from './jwt.guard';
import { AudienceGuard } from './audience.guard';
import { RequireAudiences } from './require-audiences';
import { RequirePermissions } from './require-permissions';

@Controller('admin/security-events')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('admin')
@RequirePermissions('identity:audit_read')
export class SecurityEventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('type') type?: string,
    @Query('person_id') personId?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = Math.min(Number(limitRaw ?? 50) || 50, 100);
    const rows = await this.prisma.securityEvent.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(personId ? { personId } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        personId: true,
        sessionId: true,
        outcome: true,
        requestId: true,
        metadata: true,
        createdAt: true,
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        person_id: row.personId,
        session_id: row.sessionId,
        outcome: row.outcome,
        request_id: row.requestId,
        metadata: row.metadata,
        created_at: row.createdAt.toISOString(),
      })),
      next_cursor: rows.length === limit ? rows[rows.length - 1]?.id : null,
    };
  }
}
