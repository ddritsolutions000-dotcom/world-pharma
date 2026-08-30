import { Injectable } from '@nestjs/common';
import { SupportMessageVisibility, SupportTicketStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { OutboxService } from '../events/outbox.service';
import { SupportService } from '../platform/support.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertUuid, resolveCountryByCode } from './cms-country';
import { assertSupportTransition, isTerminalSupportStatus } from './support-status';

@Injectable()
export class AdminSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: SupportService,
    private readonly securityEvents: SecurityEventsService,
    private readonly outbox: OutboxService,
  ) {}

  async listQueues(principal: Principal, countryCode?: string) {
    this.assertAdmin(principal);
    const country = countryCode ? await resolveCountryByCode(this.prisma, countryCode) : null;
    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.supportQueue.findMany({
          where: country ? { countryId: country.id } : undefined,
          orderBy: [{ countryId: 'asc' }, { code: 'asc' }],
        });
        return {
          data: rows.map((row) => ({
            id: row.id,
            country_id: row.countryId,
            code: row.code,
            name: row.name,
            active: row.active,
          })),
        };
      },
    );
  }

  async listTickets(
    principal: Principal,
    query: { country_code?: string; status?: string; queue_id?: string },
  ) {
    this.assertAdmin(principal);
    const where: Prisma.SupportTicketWhereInput = {};
    if (query.country_code?.trim()) {
      const country = await resolveCountryByCode(this.prisma, query.country_code);
      where.countryId = country.id;
      return runWithTenant(workerTenantContext({ countryId: country.id, personId: principal.personId }), () =>
        this.fetchTickets(where, query),
      );
    }
    return this.fetchTickets(where, query);
  }

  async getTicket(principal: Principal, ticketId: string, countryCode?: string) {
    this.assertAdmin(principal);
    assertUuid(ticketId, 'ticket id');
    const country = countryCode ? await resolveCountryByCode(this.prisma, countryCode) : null;
    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        const ticket = await this.prisma.supportTicket.findUnique({
          where: { id: ticketId },
          include: {
            messages: { orderBy: { createdAt: 'asc' } },
            queue: { select: { code: true, name: true } },
          },
        });
        if (!ticket || (country && ticket.countryId !== country.id)) {
          throw Errors.notFound('Support ticket not found');
        }
        return this.presentAdminTicket(ticket);
      },
    );
  }

  async assignTicket(
    principal: Principal,
    ticketId: string,
    body: { assignee_person_id?: string; country_code?: string; idempotency_key?: string },
  ) {
    this.assertAdmin(principal);
    assertUuid(ticketId, 'ticket id');
    const assigneeId = body.assignee_person_id?.trim();
    if (!assigneeId) {
      throw Errors.validation('assignee_person_id is required');
    }
    assertUuid(assigneeId, 'assignee id');
    const country = body.country_code ? await resolveCountryByCode(this.prisma, body.country_code) : null;

    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket || (country && ticket.countryId !== country.id)) {
          throw Errors.notFound('Support ticket not found');
        }
        if (isTerminalSupportStatus(ticket.status)) {
          throw Errors.conflict('Terminal tickets cannot be assigned');
        }

        const toStatus =
          ticket.status === SupportTicketStatus.OPEN ? SupportTicketStatus.ASSIGNED : ticket.status;
        if (ticket.status === SupportTicketStatus.OPEN) {
          assertSupportTransition(ticket.status, SupportTicketStatus.ASSIGNED);
        }

        await this.support.transitionTicket({
          ticket,
          toStatus,
          actorPersonId: principal.personId,
          action: 'ASSIGNED',
          assigneePersonId: assigneeId,
          outboxType: 'SUPPORT_TICKET_ASSIGNED',
          idempotencyKey: body.idempotency_key,
        });

        await this.securityEvents.emit({
          type: 'SUPPORT_TICKET_ASSIGNED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { ticket_id: ticketId, assignee_id: assigneeId },
        });

        return this.getTicket(principal, ticketId, body.country_code);
      },
    );
  }

  async setStatus(
    principal: Principal,
    ticketId: string,
    body: { status?: string; country_code?: string; idempotency_key?: string },
  ) {
    this.assertAdmin(principal);
    assertUuid(ticketId, 'ticket id');
    const status = body.status?.trim().toUpperCase() as SupportTicketStatus;
    if (!status || !Object.values(SupportTicketStatus).includes(status)) {
      throw Errors.validation('status is required');
    }
    const country = body.country_code ? await resolveCountryByCode(this.prisma, body.country_code) : null;

    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket || (country && ticket.countryId !== country.id)) {
          throw Errors.notFound('Support ticket not found');
        }
        if (ticket.status === status) {
          return this.getTicket(principal, ticketId, body.country_code);
        }
        if (isTerminalSupportStatus(ticket.status)) {
          throw Errors.conflict('Terminal tickets cannot change status');
        }

        const outboxType =
          status === SupportTicketStatus.RESOLVED
            ? 'SUPPORT_TICKET_RESOLVED'
            : status === SupportTicketStatus.CLOSED
              ? 'SUPPORT_TICKET_CLOSED'
              : 'SUPPORT_TICKET_UPDATED';

        await this.support.transitionTicket({
          ticket,
          toStatus: status,
          actorPersonId: principal.personId,
          action: 'STATUS_CHANGED',
          outboxType,
          idempotencyKey: body.idempotency_key,
        });

        await this.securityEvents.emit({
          type: 'SUPPORT_TICKET_STATUS_CHANGED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { ticket_id: ticketId, status },
        });

        return this.getTicket(principal, ticketId, body.country_code);
      },
    );
  }

  async addMessage(
    principal: Principal,
    ticketId: string,
    body: {
      body?: string;
      visibility?: string;
      country_code?: string;
      idempotency_key?: string;
    },
  ) {
    this.assertAdmin(principal);
    assertUuid(ticketId, 'ticket id');
    const messageBody = body.body?.trim();
    if (!messageBody) {
      throw Errors.validation('body is required');
    }
    const visibility = (body.visibility?.trim().toUpperCase() ?? 'INTERNAL') as SupportMessageVisibility;
    if (!Object.values(SupportMessageVisibility).includes(visibility)) {
      throw Errors.validation('visibility must be CUSTOMER or INTERNAL');
    }
    const country = body.country_code ? await resolveCountryByCode(this.prisma, body.country_code) : null;

    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket || (country && ticket.countryId !== country.id)) {
          throw Errors.notFound('Support ticket not found');
        }
        if (isTerminalSupportStatus(ticket.status)) {
          throw Errors.conflict('Closed tickets cannot receive new messages');
        }

        if (body.idempotency_key?.trim()) {
          const existing = await this.prisma.supportTicketMessage.findUnique({
            where: {
              ticketId_idempotencyKey: { ticketId, idempotencyKey: body.idempotency_key.trim() },
            },
          });
          if (existing) {
            return this.getTicket(principal, ticketId, body.country_code);
          }
        }

        await this.prisma.$transaction(async (tx) => {
          await tx.supportTicketMessage.create({
            data: {
              id: uuidv7(),
              ticketId,
              authorPersonId: principal.personId,
              visibility,
              body: messageBody,
              idempotencyKey: body.idempotency_key?.trim() || null,
            },
          });
          if (visibility === SupportMessageVisibility.CUSTOMER) {
            await tx.supportTicket.update({
              where: { id: ticketId },
              data: { status: SupportTicketStatus.WAITING_CUSTOMER, version: { increment: 1 } },
            });
          }
          if (visibility === SupportMessageVisibility.CUSTOMER) {
            await this.outbox.enqueue(tx, {
              type: 'SUPPORT_TICKET_AGENT_REPLY',
              aggregateType: 'support_ticket',
              aggregateId: ticketId,
              producer: 'support',
              countryId: ticket.countryId,
              actorId: null,
              payload: {
                ticket_id: ticketId,
                person_id: ticket.personId,
                actor_person_id: principal.personId,
              },
              occurrenceKey: body.idempotency_key?.trim()
                ? `SUPPORT_TICKET_AGENT_REPLY:${ticketId}:${body.idempotency_key.trim()}`
                : `SUPPORT_TICKET_AGENT_REPLY:${ticketId}:${Date.now()}`,
            });
          }
        });

        await this.securityEvents.emit({
          type: 'SUPPORT_TICKET_MESSAGE_ADDED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { ticket_id: ticketId, visibility },
        });

        return this.getTicket(principal, ticketId, body.country_code);
      },
    );
  }

  async escalate(
    principal: Principal,
    ticketId: string,
    body: { queue_id?: string; country_code?: string },
  ) {
    this.assertAdmin(principal);
    assertUuid(ticketId, 'ticket id');
    const queueId = body.queue_id?.trim();
    if (!queueId) {
      throw Errors.validation('queue_id is required');
    }
    assertUuid(queueId, 'queue id');
    const country = body.country_code ? await resolveCountryByCode(this.prisma, body.country_code) : null;

    return runWithTenant(
      workerTenantContext({ countryId: country?.id, personId: principal.personId }),
      async () => {
        const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket || (country && ticket.countryId !== country.id)) {
          throw Errors.notFound('Support ticket not found');
        }
        const queue = await this.prisma.supportQueue.findUnique({ where: { id: queueId } });
        if (!queue || queue.countryId !== ticket.countryId) {
          throw Errors.validation('Invalid queue for ticket country');
        }

        await this.prisma.supportTicket.update({
          where: { id: ticketId },
          data: { queueId, version: { increment: 1 } },
        });
        await this.prisma.supportTicketEvent.create({
          data: {
            id: uuidv7(),
            ticketId,
            actorPersonId: principal.personId,
            action: 'ESCALATED',
            metadata: { queue_id: queueId },
          },
        });

        return this.getTicket(principal, ticketId, body.country_code);
      },
    );
  }

  private async fetchTickets(where: Prisma.SupportTicketWhereInput, query: { status?: string; queue_id?: string }) {
    if (query.status?.trim()) {
      const status = query.status.trim().toUpperCase() as SupportTicketStatus;
      if (!Object.values(SupportTicketStatus).includes(status)) {
        throw Errors.validation(`Invalid ticket status: ${query.status}`);
      }
      where.status = status;
    }
    if (query.queue_id?.trim()) {
      assertUuid(query.queue_id.trim(), 'queue id');
      where.queueId = query.queue_id.trim();
    }
    const rows = await this.prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { queue: { select: { code: true } } },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        person_id: row.personId,
        country_id: row.countryId,
        queue_id: row.queueId,
        queue_code: row.queue.code,
        status: row.status,
        subject: row.subject,
        reference_type: row.referenceType,
        reference_id: row.referenceId,
        assignee_person_id: row.assigneePersonId,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      })),
    };
  }

  private presentAdminTicket(ticket: {
    id: string;
    personId: string;
    countryId: string;
    queueId: string;
    status: SupportTicketStatus;
    subject: string;
    referenceType: string | null;
    referenceId: string | null;
    assigneePersonId: string | null;
    createdAt: Date;
    updatedAt: Date;
    queue: { code: string; name: string };
    messages: Array<{
      id: string;
      body: string;
      visibility: SupportMessageVisibility;
      authorPersonId: string;
      createdAt: Date;
    }>;
  }) {
    return {
      id: ticket.id,
      person_id: ticket.personId,
      country_id: ticket.countryId,
      queue_id: ticket.queueId,
      queue_code: ticket.queue.code,
      queue_name: ticket.queue.name,
      status: ticket.status,
      subject: ticket.subject,
      reference_type: ticket.referenceType,
      reference_id: ticket.referenceId,
      assignee_person_id: ticket.assigneePersonId,
      created_at: ticket.createdAt.toISOString(),
      updated_at: ticket.updatedAt.toISOString(),
      messages: ticket.messages.map((row) => ({
        id: row.id,
        visibility: row.visibility,
        author_person_id: row.authorPersonId,
        created_at: row.createdAt.toISOString(),
        body: row.body,
      })),
    };
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience required');
    }
  }
}
