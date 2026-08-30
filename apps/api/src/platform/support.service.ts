import { Injectable } from '@nestjs/common';
import { SupportMessageVisibility, SupportTicketStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertUuid, isUuid, resolveCountryByCode } from '../cms/cms-country';
import {
  assertSupportTransition,
  customerMayClose,
  isTerminalSupportStatus,
} from '../cms/support-status';

export type SupportTicket = {
  id: string;
  person_id: string;
  subject: string;
  body: string;
  status: string;
  reference_type?: string;
  reference_id?: string;
  queue_id?: string;
  assignee_person_id?: string;
  country_id?: string;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async createTicket(input: {
    personId: string;
    subject: string;
    body: string;
    countryCode?: string;
    referenceType?: string;
    referenceId?: string;
    idempotencyKey?: string;
    actorPersonId?: string;
  }): Promise<SupportTicket> {
    if (!input.subject.trim() || !input.body.trim()) {
      throw Errors.validation('subject and body are required.');
    }
    const country = await resolveCountryByCode(this.prisma, input.countryCode ?? 'XX');

    if (input.idempotencyKey?.trim()) {
      const existing = await this.prisma.supportTicket.findUnique({
        where: {
          personId_idempotencyKey: {
            personId: input.personId,
            idempotencyKey: input.idempotencyKey.trim(),
          },
        },
        include: {
          messages: {
            where: { visibility: SupportMessageVisibility.CUSTOMER },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });
      if (existing) {
        return this.presentTicket(existing, existing.messages[0]?.body ?? '');
      }
    }

    const queue = await this.ensureDefaultQueue(country.id);
    const ticketId = uuidv7();

    const ticket = await runWithTenant(
      workerTenantContext({ countryId: country.id, personId: input.personId }),
      async () =>
        this.prisma.$transaction(async (tx) => {
          const created = await tx.supportTicket.create({
            data: {
              id: ticketId,
              personId: input.personId,
              countryId: country.id,
              queueId: queue.id,
              status: SupportTicketStatus.OPEN,
              subject: input.subject.trim(),
              referenceType: input.referenceType?.trim() || null,
              referenceId: input.referenceId && isUuid(input.referenceId) ? input.referenceId : null,
              idempotencyKey: input.idempotencyKey?.trim() || null,
            },
          });
          await tx.supportTicketMessage.create({
            data: {
              id: uuidv7(),
              ticketId,
              authorPersonId: input.actorPersonId ?? input.personId,
              visibility: SupportMessageVisibility.CUSTOMER,
              body: input.body.trim(),
            },
          });
          await tx.supportTicketEvent.create({
            data: {
              id: uuidv7(),
              ticketId,
              actorPersonId: input.actorPersonId ?? input.personId,
              action: 'TICKET_CREATED',
              toStatus: SupportTicketStatus.OPEN,
              metadata: {},
            },
          });
          await this.outbox.enqueue(tx, {
            type: 'SUPPORT_TICKET_CREATED',
            aggregateType: 'support_ticket',
            aggregateId: ticketId,
            producer: 'support',
            countryId: country.id,
            actorId: input.actorPersonId ?? input.personId,
            payload: { ticket_id: ticketId, queue_code: queue.code, person_id: input.personId },
            occurrenceKey: input.idempotencyKey?.trim()
              ? `SUPPORT_TICKET_CREATED:${input.personId}:${input.idempotencyKey.trim()}`
              : `SUPPORT_TICKET_CREATED:${ticketId}`,
          });
          return created;
        }),
    );

    await this.securityEvents.emit({
      type: 'SUPPORT_TICKET_CREATED',
      outcome: 'success',
      personId: input.actorPersonId ?? input.personId,
      metadata: { ticket_id: ticketId, queue_code: queue.code },
    });

    return this.presentTicket(ticket, input.body.trim());
  }

  async listTickets(personId: string): Promise<SupportTicket[]> {
    const rows = await this.prisma.supportTicket.findMany({
      where: { personId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        messages: {
          where: { visibility: SupportMessageVisibility.CUSTOMER },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    return rows.map((row) => this.presentTicket(row, row.messages[0]?.body ?? ''));
  }

  async getCustomerTicket(personId: string, ticketId: string) {
    assertUuid(ticketId, 'ticket id');
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, personId },
      include: {
        messages: {
          where: { visibility: SupportMessageVisibility.CUSTOMER },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) {
      throw Errors.notFound('Support ticket not found');
    }
    return this.presentTicketDetail(ticket, ticket.messages);
  }

  async addCustomerMessage(personId: string, ticketId: string, body: string, idempotencyKey?: string) {
    assertUuid(ticketId, 'ticket id');
    if (!body.trim()) {
      throw Errors.validation('body is required');
    }
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, personId },
    });
    if (!ticket) {
      throw Errors.notFound('Support ticket not found');
    }
    if (isTerminalSupportStatus(ticket.status)) {
      throw Errors.conflict('Closed tickets cannot receive new messages');
    }

    if (idempotencyKey?.trim()) {
      const existing = await this.prisma.supportTicketMessage.findUnique({
        where: { ticketId_idempotencyKey: { ticketId, idempotencyKey: idempotencyKey.trim() } },
      });
      if (existing) {
        return this.getCustomerTicket(personId, ticketId);
      }
    }

    await runWithTenant(workerTenantContext({ countryId: ticket.countryId, personId }), async () => {
      await this.prisma.$transaction(async (tx) => {
        await tx.supportTicketMessage.create({
          data: {
            id: uuidv7(),
            ticketId,
            authorPersonId: personId,
            visibility: SupportMessageVisibility.CUSTOMER,
            body: body.trim(),
            idempotencyKey: idempotencyKey?.trim() || null,
          },
        });
        if (
          ticket.status === SupportTicketStatus.WAITING_CUSTOMER ||
          ticket.status === SupportTicketStatus.OPEN
        ) {
          await tx.supportTicket.update({
            where: { id: ticketId },
            data: { status: SupportTicketStatus.IN_PROGRESS, version: { increment: 1 } },
          });
        }
        await tx.supportTicketEvent.create({
          data: {
            id: uuidv7(),
            ticketId,
            actorPersonId: personId,
            action: 'CUSTOMER_MESSAGE',
            metadata: {},
          },
        });
        await this.outbox.enqueue(tx, {
          type: 'SUPPORT_TICKET_CUSTOMER_REPLY',
          aggregateType: 'support_ticket',
          aggregateId: ticketId,
          producer: 'support',
          countryId: ticket.countryId,
          actorId: personId,
          payload: { ticket_id: ticketId, person_id: personId },
          occurrenceKey: idempotencyKey?.trim()
            ? `SUPPORT_TICKET_CUSTOMER_REPLY:${ticketId}:${idempotencyKey.trim()}`
            : `SUPPORT_TICKET_CUSTOMER_REPLY:${ticketId}:${Date.now()}`,
        });
      });
    });

    return this.getCustomerTicket(personId, ticketId);
  }

  async closeCustomerTicket(personId: string, ticketId: string) {
    assertUuid(ticketId, 'ticket id');
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, personId },
    });
    if (!ticket) {
      throw Errors.notFound('Support ticket not found');
    }
    if (ticket.status === SupportTicketStatus.CLOSED) {
      return this.getCustomerTicket(personId, ticketId);
    }
    if (!customerMayClose(ticket.status)) {
      throw Errors.conflict('Ticket cannot be closed in current state');
    }

    await runWithTenant(workerTenantContext({ countryId: ticket.countryId, personId }), async () => {
      await this.transitionTicket({
        ticket,
        toStatus: SupportTicketStatus.CLOSED,
        actorPersonId: personId,
        action: 'CUSTOMER_CLOSED',
        outboxType: 'SUPPORT_TICKET_CLOSED',
      });
    });

    return this.getCustomerTicket(personId, ticketId);
  }

  async transitionTicket(input: {
    ticket: {
      id: string;
      status: SupportTicketStatus;
      countryId: string;
      version: number;
      personId: string;
      assigneePersonId?: string | null;
    };
    toStatus: SupportTicketStatus;
    actorPersonId: string;
    action: string;
    assigneePersonId?: string | null;
    outboxType?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (input.ticket.status === input.toStatus) {
      return;
    }
    assertSupportTransition(input.ticket.status, input.toStatus);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportTicket.updateMany({
        where: { id: input.ticket.id, version: input.ticket.version },
        data: {
          status: input.toStatus,
          version: { increment: 1 },
          assigneePersonId:
            input.assigneePersonId !== undefined ? input.assigneePersonId : input.ticket.assigneePersonId,
          resolvedAt: input.toStatus === SupportTicketStatus.RESOLVED ? new Date() : undefined,
          closedAt: input.toStatus === SupportTicketStatus.CLOSED ? new Date() : undefined,
        },
      });
      if (updated.count === 0) {
        throw Errors.conflict('Support ticket version conflict');
      }
      await tx.supportTicketEvent.create({
        data: {
          id: uuidv7(),
          ticketId: input.ticket.id,
          actorPersonId: input.actorPersonId,
          action: input.action,
          fromStatus: input.ticket.status,
          toStatus: input.toStatus,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      if (input.outboxType) {
        const staffInitiated = input.actorPersonId !== input.ticket.personId;
        const payload: Record<string, unknown> = {
          ticket_id: input.ticket.id,
          status: input.toStatus,
          person_id: input.ticket.personId,
          assignee_id: input.assigneePersonId ?? input.ticket.assigneePersonId ?? null,
        };
        if (staffInitiated) {
          payload.actor_person_id = input.actorPersonId;
        }
        await this.outbox.enqueue(tx, {
          type: input.outboxType,
          aggregateType: 'support_ticket',
          aggregateId: input.ticket.id,
          producer: 'support',
          countryId: input.ticket.countryId,
          actorId: staffInitiated ? null : input.actorPersonId,
          payload,
          occurrenceKey: input.idempotencyKey?.trim()
            ? `${input.outboxType}:${input.ticket.id}:${input.idempotencyKey.trim()}`
            : `${input.outboxType}:${input.ticket.id}:${input.toStatus}:${input.ticket.version + 1}`,
        });
      }
    });
  }

  private async ensureDefaultQueue(countryId: string) {
    return runWithTenant(workerTenantContext({ countryId }), async () =>
      this.prisma.supportQueue.upsert({
        where: { countryId_code: { countryId, code: 'GENERAL' } },
        create: {
          id: uuidv7(),
          countryId,
          code: 'GENERAL',
          name: 'General Support',
          active: true,
        },
        update: {},
      }),
    );
  }

  private presentTicket(
    ticket: {
      id: string;
      personId: string;
      subject: string;
      status: SupportTicketStatus;
      referenceType: string | null;
      referenceId: string | null;
      queueId: string;
      assigneePersonId: string | null;
      countryId: string;
      createdAt: Date;
      updatedAt: Date;
    },
    body: string,
  ): SupportTicket {
    return {
      id: ticket.id,
      person_id: ticket.personId,
      subject: ticket.subject,
      body,
      status: ticket.status,
      reference_type: ticket.referenceType ?? undefined,
      reference_id: ticket.referenceId ?? undefined,
      queue_id: ticket.queueId,
      assignee_person_id: ticket.assigneePersonId ?? undefined,
      country_id: ticket.countryId,
      created_at: ticket.createdAt.toISOString(),
      updated_at: ticket.updatedAt.toISOString(),
    };
  }

  private presentTicketDetail(
    ticket: {
      id: string;
      personId: string;
      subject: string;
      status: SupportTicketStatus;
      referenceType: string | null;
      referenceId: string | null;
      queueId: string;
      assigneePersonId: string | null;
      countryId: string;
      createdAt: Date;
      updatedAt: Date;
    },
    messages: Array<{ id: string; body: string; createdAt: Date; authorPersonId: string }>,
  ) {
    return {
      ...this.presentTicket(ticket, messages[0]?.body ?? ''),
      messages: messages.map((row) => ({
        id: row.id,
        body: row.body,
        author_person_id: row.authorPersonId,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }
}
