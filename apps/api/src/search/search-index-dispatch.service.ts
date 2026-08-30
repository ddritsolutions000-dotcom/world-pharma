import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CatalogItemKind, SearchIndexKind } from '@prisma/client';
import type { EventEnvelope } from '../events/envelope';
import { EventHandlerRegistry } from '../events/handlers';
import { PrismaService } from '../app/prisma.service';
import { SearchIndexJobService } from './search-index-job.service';
import { SearchIndexResolverService } from './search-index-resolver.service';

const HANDLED_EVENTS = [
  'SEARCH_INDEX_INVALIDATE',
  'INVENTORY_RECEIVED',
  'INVENTORY_ADJUSTED',
  'INVENTORY_RESERVED',
  'INVENTORY_RELEASED',
  'INVENTORY_TRANSFERRED',
  'INVENTORY_EXPIRED',
  'INVENTORY_QUARANTINED',
  'DOCTOR_PROFILE_UPDATED',
  'LAB_REPORT_PUBLISHED',
  'IMAGING_REPORT_PUBLISHED',
] as const;

@Injectable()
export class SearchIndexDispatchService implements OnModuleInit {
  private readonly logger = new Logger(SearchIndexDispatchService.name);

  constructor(
    private readonly handlers: EventHandlerRegistry,
    private readonly jobs: SearchIndexJobService,
    private readonly resolver: SearchIndexResolverService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    for (const name of HANDLED_EVENTS) {
      this.handlers.register(name, async (envelope) => this.handle(envelope));
    }
    this.logger.log(JSON.stringify({ event: 'search_index_handlers_registered', count: HANDLED_EVENTS.length }));
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventName === 'DOCTOR_PROFILE_UPDATED') {
      await this.handleDoctorProfileUpdated(envelope);
      return;
    }
    if (envelope.eventName === 'LAB_REPORT_PUBLISHED' || envelope.eventName === 'IMAGING_REPORT_PUBLISHED') {
      await this.handleClinicalArtifactPublished(envelope);
      return;
    }
    const targets = await this.resolver.catalogTargetsFromEnvelope(envelope);
    for (const target of targets) {
      const locale =
        typeof envelope.payload.locale === 'string' && envelope.payload.locale.trim()
          ? envelope.payload.locale
          : 'en';
      await this.jobs.scheduleCatalogReindex({
        countryId: target.countryId,
        itemId: target.itemId,
        locale,
        sourceType: envelope.eventName.toLowerCase(),
        idempotencyKey: `${envelope.eventName.toLowerCase()}:${target.itemId}:${target.countryId}:${locale}:${envelope.eventId}`,
      });
      const item = await this.prisma.catalogItem.findUnique({
        where: { id: target.itemId },
        select: { kind: true },
      });
      if (item?.kind === CatalogItemKind.LAB_TEST) {
        await this.jobs.scheduleProviderReindex({
          countryId: target.countryId,
          sourceId: target.itemId,
          indexKind: SearchIndexKind.PROVIDER_TEST,
          locale,
          sourceType: envelope.eventName.toLowerCase(),
          idempotencyKey: `provider_test:${target.itemId}:${target.countryId}:${locale}:${envelope.eventId}`,
        });
      }
    }
  }

  private async handleClinicalArtifactPublished(envelope: EventEnvelope): Promise<void> {
    const countryId = envelope.countryId;
    if (!countryId) {
      return;
    }
    let artifactId =
      typeof envelope.payload.artifact_id === 'string' && envelope.payload.artifact_id.trim()
        ? envelope.payload.artifact_id.trim()
        : null;
    if (!artifactId) {
      const labBookingId =
        typeof envelope.payload.lab_booking_id === 'string' ? envelope.payload.lab_booking_id : null;
      const imagingBookingId =
        typeof envelope.payload.imaging_booking_id === 'string' ? envelope.payload.imaging_booking_id : null;
      const artifact = labBookingId
        ? await this.prisma.healthArtifact.findFirst({
            where: { labBookingId, countryId },
            orderBy: { publishedAt: 'desc' },
            select: { id: true },
          })
        : imagingBookingId
          ? await this.prisma.healthArtifact.findFirst({
              where: { imagingBookingId, countryId },
              orderBy: { publishedAt: 'desc' },
              select: { id: true },
            })
          : null;
      artifactId = artifact?.id ?? null;
    }
    if (!artifactId) {
      this.logger.warn(
        JSON.stringify({
          event: 'clinical_search_index_skipped',
          reason: 'artifact_not_resolved',
          event_name: envelope.eventName,
          event_id: envelope.eventId,
        }),
      );
      return;
    }
    await this.jobs.scheduleClinicalReindex({
      countryId,
      artifactId,
      sourceType: envelope.eventName.toLowerCase(),
      idempotencyKey: `${envelope.eventName.toLowerCase()}:${artifactId}:${countryId}:${envelope.eventId}`,
    });
  }

  private async handleDoctorProfileUpdated(envelope: EventEnvelope): Promise<void> {
    const partnerId =
      typeof envelope.payload.partner_id === 'string' ? envelope.payload.partner_id : envelope.aggregateId;
    const countryId = envelope.countryId;
    if (!partnerId || !countryId) {
      return;
    }
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { partnerId },
      select: { id: true },
    });
    if (!profile) {
      return;
    }
    const locale =
      typeof envelope.payload.locale === 'string' && envelope.payload.locale.trim()
        ? envelope.payload.locale
        : 'en';
    await this.jobs.scheduleProviderReindex({
      countryId,
      sourceId: profile.id,
      indexKind: SearchIndexKind.PROVIDER_DOCTOR,
      locale,
      sourceType: 'doctor_profile_updated',
      idempotencyKey: `doctor_profile:${profile.id}:${countryId}:${locale}:${envelope.eventId}`,
    });
  }
}
