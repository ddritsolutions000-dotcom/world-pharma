import { Injectable } from '@nestjs/common';
import { CrmCampaignChannel, CrmCampaignStatus, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../../app/prisma.service';
import { Errors } from '../../common/problem';
import type { Principal } from '../../identity/current-principal';
import { SecurityEventsService } from '../../identity/security-events.service';
import { PolicyResolver } from '../../policy/resolver';
import { resolveCountryByCode, assertUuid } from '../../cms/cms-country';
import { workerTenantContext } from '../../tenancy/build-tenant-context';
import {
  assertCampaignTransition,
  isEditableCampaignStatus,
} from './campaign-status';
import { assertSafeCampaignContent } from './segment-rules';

const SUPPORTED_CHANNELS = new Set<CrmCampaignChannel>([CrmCampaignChannel.IN_APP]);

@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
    private readonly policies: PolicyResolver,
  ) {}

  async list(principal: Principal, countryCode: string) {
    this.assertAdmin(principal);
    await this.assertMarketingEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const rows = await this.prisma.crmCampaign.findMany({
          where: { countryId: country.id },
          orderBy: [{ updatedAt: 'desc' }, { code: 'asc' }],
          include: { segment: { select: { id: true, code: true, name: true } } },
        });
        return { data: rows.map((row) => this.present(row, country.isoAlpha2)) };
      },
    );
  }

  async get(principal: Principal, id: string, countryCode: string) {
    this.assertAdmin(principal);
    assertUuid(id, 'campaign id');
    await this.assertMarketingEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const row = await this.prisma.crmCampaign.findFirst({
          where: { id, countryId: country.id },
          include: { segment: { select: { id: true, code: true, name: true } } },
        });
        if (!row) {
          throw Errors.notFound('Campaign not found');
        }
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async create(
    principal: Principal,
    input: {
      country_code: string;
      code: string;
      name: string;
      segment_id: string;
      channel?: string;
      locale?: string;
      title: string;
      body: string;
      cms_content_id?: string;
    },
  ) {
    this.assertAdmin(principal);
    await this.assertMarketingEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    assertUuid(input.segment_id, 'segment id');
    const channel = this.parseChannel(input.channel ?? 'IN_APP');
    await this.assertChannelAllowed(input.country_code, channel);
    assertSafeCampaignContent(input.title, input.body);
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) {
      throw Errors.validation('code and name are required');
    }
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const segment = await this.prisma.crmSegment.findFirst({
          where: { id: input.segment_id, countryId: country.id },
        });
        if (!segment) {
          throw Errors.notFound('Segment not found');
        }
        const row = await this.prisma.crmCampaign.create({
          data: {
            id: uuidv7(),
            countryId: country.id,
            segmentId: segment.id,
            code,
            name,
            channel,
            locale: input.locale?.trim() || 'en',
            title: input.title.trim(),
            body: input.body.trim(),
            cmsContentId: input.cms_content_id ?? null,
            createdByPersonId: principal.personId,
          },
          include: { segment: { select: { id: true, code: true, name: true } } },
        });
        await this.securityEvents.emit({
          type: 'CRM_CAMPAIGN_CREATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { campaign_id: row.id, country_id: country.id },
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async update(
    principal: Principal,
    id: string,
    input: {
      country_code: string;
      name?: string;
      segment_id?: string;
      channel?: string;
      locale?: string;
      title?: string;
      body?: string;
      cms_content_id?: string | null;
      version?: number;
    },
  ) {
    this.assertAdmin(principal);
    assertUuid(id, 'campaign id');
    await this.assertMarketingEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const existing = await this.prisma.crmCampaign.findFirst({
          where: { id, countryId: country.id },
          include: { segment: { select: { id: true, code: true, name: true } } },
        });
        if (!existing) {
          throw Errors.notFound('Campaign not found');
        }
        if (!isEditableCampaignStatus(existing.status)) {
          throw Errors.conflict('Campaign cannot be edited in its current status');
        }
        if (input.version != null && existing.version !== input.version) {
          throw Errors.problem(409, 'VERSION_CONFLICT', 'Version conflict', 'Campaign was updated elsewhere.');
        }
        if (input.segment_id) {
          assertUuid(input.segment_id, 'segment id');
          const segment = await this.prisma.crmSegment.findFirst({
            where: { id: input.segment_id, countryId: country.id },
          });
          if (!segment) {
            throw Errors.notFound('Segment not found');
          }
        }
        const nextTitle = input.title ?? existing.title;
        const nextBody = input.body ?? existing.body;
        assertSafeCampaignContent(nextTitle, nextBody);
        const channel = input.channel ? this.parseChannel(input.channel) : existing.channel;
        await this.assertChannelAllowed(input.country_code, channel);
        const row = await this.prisma.crmCampaign.update({
          where: { id: existing.id },
          data: {
            ...(input.name != null ? { name: input.name.trim() } : {}),
            ...(input.segment_id ? { segmentId: input.segment_id } : {}),
            ...(input.channel ? { channel } : {}),
            ...(input.locale != null ? { locale: input.locale.trim() } : {}),
            ...(input.title != null ? { title: input.title.trim() } : {}),
            ...(input.body != null ? { body: input.body.trim() } : {}),
            ...(input.cms_content_id !== undefined ? { cmsContentId: input.cms_content_id } : {}),
            version: { increment: 1 },
          },
          include: { segment: { select: { id: true, code: true, name: true } } },
        });
        await this.securityEvents.emit({
          type: 'CRM_CAMPAIGN_UPDATED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { campaign_id: row.id, country_id: country.id },
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async schedule(
    principal: Principal,
    id: string,
    input: { country_code: string; scheduled_at?: string; version?: number },
  ) {
    this.assertAdmin(principal);
    assertUuid(id, 'campaign id');
    await this.assertMarketingEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const existing = await this.prisma.crmCampaign.findFirst({
          where: { id, countryId: country.id },
          include: { segment: { select: { id: true, code: true, name: true } } },
        });
        if (!existing) {
          throw Errors.notFound('Campaign not found');
        }
        if (input.version != null && existing.version !== input.version) {
          throw Errors.problem(409, 'VERSION_CONFLICT', 'Version conflict', 'Campaign was updated elsewhere.');
        }
        assertCampaignTransition(existing.status, CrmCampaignStatus.SCHEDULED);
        const row = await this.prisma.crmCampaign.update({
          where: { id: existing.id },
          data: {
            status: CrmCampaignStatus.SCHEDULED,
            scheduledAt: input.scheduled_at ? new Date(input.scheduled_at) : new Date(),
            version: { increment: 1 },
          },
          include: { segment: { select: { id: true, code: true, name: true } } },
        });
        await this.securityEvents.emit({
          type: 'CRM_CAMPAIGN_SCHEDULED',
          outcome: 'success',
          personId: principal.personId,
          metadata: { campaign_id: row.id, country_id: country.id },
        });
        return this.present(row, country.isoAlpha2);
      },
    );
  }

  async listSends(principal: Principal, id: string, countryCode: string) {
    this.assertAdmin(principal);
    assertUuid(id, 'campaign id');
    await this.assertMarketingEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);
    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const campaign = await this.prisma.crmCampaign.findFirst({
          where: { id, countryId: country.id },
          select: { id: true },
        });
        if (!campaign) {
          throw Errors.notFound('Campaign not found');
        }
        const rows = await this.prisma.crmCampaignSend.findMany({
          where: { campaignId: campaign.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 100,
        });
        return {
          data: rows.map((row) => ({
            id: row.id,
            campaign_id: row.campaignId,
            person_id: row.personId,
            country_id: row.countryId,
            idempotency_key: row.idempotencyKey,
            variant: row.variant,
            status: row.status,
            skip_reason: row.skipReason,
            created_at: row.createdAt.toISOString(),
          })),
        };
      },
    );
  }

  private parseChannel(raw: string): CrmCampaignChannel {
    const upper = raw.trim().toUpperCase();
    if (!Object.values(CrmCampaignChannel).includes(upper as CrmCampaignChannel)) {
      throw Errors.validation(`Invalid campaign channel: ${raw}`);
    }
    const channel = upper as CrmCampaignChannel;
    if (!SUPPORTED_CHANNELS.has(channel)) {
      throw Errors.validation(`Campaign channel not supported in v1: ${channel}`);
    }
    return channel;
  }

  private present(
    row: {
      id: string;
      countryId: string;
      segmentId: string;
      code: string;
      name: string;
      status: CrmCampaignStatus;
      channel: CrmCampaignChannel;
      locale: string;
      title: string;
      body: string;
      cmsContentId: string | null;
      scheduledAt: Date | null;
      version: number;
      createdByPersonId: string;
      createdAt: Date;
      updatedAt: Date;
      segment?: { id: string; code: string; name: string };
    },
    countryCode: string,
  ) {
    return {
      id: row.id,
      country_id: row.countryId,
      country_code: countryCode,
      segment_id: row.segmentId,
      segment: row.segment,
      code: row.code,
      name: row.name,
      status: row.status,
      channel: row.channel,
      locale: row.locale,
      title: row.title,
      body: row.body,
      cms_content_id: row.cmsContentId,
      scheduled_at: row.scheduledAt?.toISOString() ?? null,
      version: row.version,
      created_by_person_id: row.createdByPersonId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin audience required');
    }
  }

  private async assertMarketingEnabled(countryCode: string) {
    const policy = await this.policies.resolvePublished(countryCode);
    if (!policy?.document.crm?.enabled) {
      throw Errors.forbidden('CRM is not enabled for this country');
    }
    if (policy.document.crm.marketing?.enabled === false) {
      throw Errors.forbidden('Marketing is not enabled for this country');
    }
  }

  private async assertChannelAllowed(countryCode: string, channel: CrmCampaignChannel) {
    const policy = await this.policies.resolvePublished(countryCode);
    const channels = policy?.document.crm?.marketing?.channels ?? ['in_app'];
    const normalized = channel.toLowerCase();
    if (!channels.includes(normalized)) {
      throw Errors.forbidden(`Channel ${channel} is not enabled for this country`);
    }
  }
}
