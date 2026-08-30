import { Injectable } from '@nestjs/common';
import { ConversionEventKind, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const VALID_KINDS = new Set<string>(Object.values(ConversionEventKind));

@Injectable()
export class ConversionEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async record(
    principal: Principal,
    input: {
      country_code: string;
      source: string;
      source_key: string;
      event_kind: string;
      person_id?: string;
      order_id?: string;
      session_id?: string;
      occurred_at?: string;
      metadata?: Record<string, unknown>;
      idempotency_key?: string;
    },
  ) {
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const kind = input.event_kind?.trim().toUpperCase();
    if (!kind || !VALID_KINDS.has(kind)) {
      throw Errors.validation(`Invalid event_kind: ${input.event_kind}`);
    }
    const source = input.source?.trim();
    const sourceKey = input.source_key?.trim();
    if (!source || !sourceKey) {
      throw Errors.validation('source and source_key are required');
    }
    if (input.person_id) {
      assertUuid(input.person_id, 'person id');
    }
    if (input.order_id) {
      assertUuid(input.order_id, 'order id');
    }
    if (input.session_id) {
      assertUuid(input.session_id, 'session id');
    }
    this.assertSafeMetadata(input.metadata);

    return runWithTenant(
      workerTenantContext({
        countryId: country.id,
        personId: principal.personId,
      }),
      async () => {
        const existing = await this.prisma.conversionEvent.findUnique({
          where: {
            source_sourceKey_eventKind: {
              source,
              sourceKey,
              eventKind: kind as ConversionEventKind,
            },
          },
        });
        if (existing) {
          return this.present(existing);
        }
        const row = await this.prisma.conversionEvent.create({
          data: {
            id: uuidv7(),
            countryId: country.id,
            personId: input.person_id ?? null,
            orderId: input.order_id ?? null,
            sessionId: input.session_id ?? null,
            source,
            sourceKey,
            eventKind: kind as ConversionEventKind,
            occurredAt: input.occurred_at ? new Date(input.occurred_at) : new Date(),
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });
        await this.securityEvents.emit({
          type: 'CONVERSION_EVENT_RECORDED',
          outcome: 'success',
          personId: principal.personId,
          metadata: {
            conversion_event_id: row.id,
            event_kind: row.eventKind,
            country_id: row.countryId,
          },
        });
        return this.present(row);
      },
    );
  }

  async recordHook(input: {
    countryCode: string;
    personId?: string;
    eventKind: ConversionEventKind;
    source: string;
    sourceKey: string;
    orderId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<void> {
    this.assertSafeMetadata(input.metadata);
    const country = await resolveCountryByCode(this.prisma, input.countryCode);
    await runWithTenant(
      workerTenantContext({ countryId: country.id, personId: input.personId }),
      async () => {
        const existing = await this.prisma.conversionEvent.findUnique({
          where: {
            source_sourceKey_eventKind: {
              source: input.source,
              sourceKey: input.sourceKey,
              eventKind: input.eventKind,
            },
          },
        });
        if (existing) {
          return;
        }
        try {
          await this.prisma.conversionEvent.create({
            data: {
              id: uuidv7(),
              countryId: country.id,
              personId: input.personId ?? null,
              orderId: input.orderId ?? null,
              sessionId: input.sessionId ?? null,
              source: input.source,
              sourceKey: input.sourceKey,
              eventKind: input.eventKind,
              occurredAt: input.occurredAt ?? new Date(),
              metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return;
          }
          throw err;
        }
      },
    ).catch(() => undefined);
  }

  async listForPerson(principal: Principal, personId: string, countryCode: string, limit = 20) {
    assertUuid(personId, 'person id');
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.conversionEvent.findMany({
          where: { countryId: country.id, personId },
          orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
          take: Math.min(limit, 50),
        });
        return { data: rows.map((row) => this.present(row)) };
      },
    );
  }

  private assertSafeMetadata(metadata?: Record<string, unknown>) {
    if (!metadata) {
      return;
    }
    const raw = JSON.stringify(metadata).toLowerCase();
    const forbidden = [
      'lab_result',
      'diagnosis',
      'prescription',
      'artifact',
      'consent_scope',
      'break_glass',
      'health_timeline',
      'imaging_finding',
    ];
    for (const token of forbidden) {
      if (raw.includes(token)) {
        throw Errors.validation('metadata must not contain clinical payload keys');
      }
    }
  }

  private present(row: {
    id: string;
    countryId: string;
    personId: string | null;
    orderId: string | null;
    sessionId: string | null;
    source: string;
    sourceKey: string;
    eventKind: ConversionEventKind;
    occurredAt: Date;
    metadata: unknown;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      country_id: row.countryId,
      person_id: row.personId,
      order_id: row.orderId,
      session_id: row.sessionId,
      source: row.source,
      source_key: row.sourceKey,
      event_kind: row.eventKind,
      occurred_at: row.occurredAt.toISOString(),
      metadata: row.metadata,
      created_at: row.createdAt.toISOString(),
    };
  }
}
