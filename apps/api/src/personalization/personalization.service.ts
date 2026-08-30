import { Injectable } from '@nestjs/common';
import { PersonalizationEventKind, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { resolveCountryByCode, assertUuid } from '../cms/cms-country';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertSafeMetadata } from '../reviews/ugc-safety';

const VALID_KINDS = new Set<string>(Object.values(PersonalizationEventKind));

@Injectable()
export class PersonalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async record(
    principal: Principal,
    input: {
      country_code: string;
      event_kind: string;
      source: string;
      source_key: string;
      catalog_item_id?: string;
      catalog_offer_id?: string;
      order_id?: string;
      metadata?: Record<string, unknown>;
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
    if (input.catalog_item_id) {
      assertUuid(input.catalog_item_id, 'catalog_item_id');
    }
    if (input.catalog_offer_id) {
      assertUuid(input.catalog_offer_id, 'catalog_offer_id');
    }
    if (input.order_id) {
      assertUuid(input.order_id, 'order_id');
    }
    assertSafeMetadata(input.metadata);

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const existing = await this.prisma.personalizationEvent.findUnique({
          where: {
            source_sourceKey_eventKind: {
              source,
              sourceKey,
              eventKind: kind as PersonalizationEventKind,
            },
          },
        });
        if (existing) {
          return this.present(existing);
        }
        try {
          const row = await this.prisma.personalizationEvent.create({
            data: {
              id: uuidv7(),
              countryId: country.id,
              personId: principal.personId,
              catalogItemId: input.catalog_item_id ?? null,
              catalogOfferId: input.catalog_offer_id ?? null,
              orderId: input.order_id ?? null,
              source,
              sourceKey,
              eventKind: kind as PersonalizationEventKind,
              metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            },
          });
          await this.securityEvents.emit({
            type: 'PERSONALIZATION_EVENT_RECORDED',
            outcome: 'success',
            personId: principal.personId,
            metadata: {
              event_id: row.id,
              event_kind: row.eventKind,
              country_id: row.countryId,
            },
          });
          return this.present(row);
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            const row = await this.prisma.personalizationEvent.findUniqueOrThrow({
              where: {
                source_sourceKey_eventKind: {
                  source,
                  sourceKey,
                  eventKind: kind as PersonalizationEventKind,
                },
              },
            });
            return this.present(row);
          }
          throw err;
        }
      },
    );
  }

  async recordHook(input: {
    countryCode: string;
    personId: string;
    eventKind: PersonalizationEventKind;
    source: string;
    sourceKey: string;
    catalogItemId?: string;
    catalogOfferId?: string;
    orderId?: string;
    metadata?: Record<string, unknown>;
  }) {
    assertSafeMetadata(input.metadata);
    const country = await resolveCountryByCode(this.prisma, input.countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: input.personId }),
      async () => {
        const existing = await this.prisma.personalizationEvent.findUnique({
          where: {
            source_sourceKey_eventKind: {
              source: input.source,
              sourceKey: input.sourceKey,
              eventKind: input.eventKind,
            },
          },
        });
        if (existing) {
          return existing;
        }
        try {
          return await this.prisma.personalizationEvent.create({
            data: {
              id: uuidv7(),
              countryId: country.id,
              personId: input.personId,
              catalogItemId: input.catalogItemId ?? null,
              catalogOfferId: input.catalogOfferId ?? null,
              orderId: input.orderId ?? null,
              source: input.source,
              sourceKey: input.sourceKey,
              eventKind: input.eventKind,
              metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return this.prisma.personalizationEvent.findUniqueOrThrow({
              where: {
                source_sourceKey_eventKind: {
                  source: input.source,
                  sourceKey: input.sourceKey,
                  eventKind: input.eventKind,
                },
              },
            });
          }
          throw err;
        }
      },
    ).catch(() => undefined);
  }

  private present(row: {
    id: string;
    countryId: string;
    personId: string | null;
    catalogItemId: string | null;
    catalogOfferId: string | null;
    orderId: string | null;
    source: string;
    sourceKey: string;
    eventKind: PersonalizationEventKind;
    occurredAt: Date;
    metadata: unknown;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      country_id: row.countryId,
      person_id: row.personId,
      catalog_item_id: row.catalogItemId,
      catalog_offer_id: row.catalogOfferId,
      order_id: row.orderId,
      source: row.source,
      source_key: row.sourceKey,
      event_kind: row.eventKind,
      occurred_at: row.occurredAt.toISOString(),
      metadata: row.metadata,
      created_at: row.createdAt.toISOString(),
    };
  }
}
