import { Injectable } from '@nestjs/common';
import {
  CrmCampaignChannel,
  CrmCampaignSendStatus,
  CrmCampaignStatus,
  CrmSuppressionChannel,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../../app/prisma.service';
import { Errors } from '../../common/problem';
import type { Principal } from '../../identity/current-principal';
import { SecurityEventsService } from '../../identity/security-events.service';
import { OutboxService } from '../../events/outbox.service';
import { NotificationService } from '../../platform/notification.service';
import { PolicyResolver } from '../../policy/resolver';
import { resolveCountryByCode, assertUuid } from '../../cms/cms-country';
import { workerTenantContext } from '../../tenancy/build-tenant-context';
import { MarketingPreferenceService } from '../marketing-preference.service';
import { assertCampaignTransition } from './campaign-status';
import { schedulerBatchKey } from './campaign-send-scheduler.config';
import { SegmentService } from './segment.service';
import { SuppressionService } from './suppression.service';

@Injectable()
export class SendPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentService,
    private readonly marketingPrefs: MarketingPreferenceService,
    private readonly suppressions: SuppressionService,
    private readonly notifications: NotificationService,
    private readonly outbox: OutboxService,
    private readonly securityEvents: SecurityEventsService,
    private readonly policies: PolicyResolver,
  ) {}

  async sendCampaign(
    principal: Principal,
    campaignId: string,
    input: { country_code: string; idempotency_key?: string; variant?: string },
  ) {
    this.assertAdmin(principal);
    assertUuid(campaignId, 'campaign id');
    await this.assertMarketingEnabled(input.country_code);
    const country = await resolveCountryByCode(this.prisma, input.country_code);
    const batchKey = input.idempotency_key?.trim() || `batch-${Date.now()}`;
    const variant = input.variant?.trim() || 'default';

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const campaign = await this.prisma.crmCampaign.findFirst({
          where: { id: campaignId, countryId: country.id },
        });
        if (!campaign) {
          throw Errors.notFound('Campaign not found');
        }
        if (campaign.status === CrmCampaignStatus.COMPLETED) {
          return this.buildSendSummary(campaign.id);
        }
        if (
          campaign.status !== CrmCampaignStatus.SCHEDULED &&
          campaign.status !== CrmCampaignStatus.SENDING
        ) {
          assertCampaignTransition(campaign.status, CrmCampaignStatus.SENDING);
        }

        if (campaign.status === CrmCampaignStatus.SCHEDULED) {
          const claimed = await this.claimScheduledCampaign(campaign.id, country.id);
          if (!claimed) {
            const refreshed = await this.prisma.crmCampaign.findUnique({ where: { id: campaign.id } });
            if (refreshed?.status === CrmCampaignStatus.COMPLETED) {
              return this.buildSendSummary(campaign.id);
            }
            throw Errors.conflict('Campaign is already being sent or is not schedulable');
          }
        }

        return this.executeCampaignSend({
          campaignId: campaign.id,
          country,
          batchKey,
          variant,
          actorPersonId: principal.personId,
        });
      },
    );
  }

  /** Scheduler path — no admin principal; due-date and atomic claim enforced. */
  async sendCampaignScheduled(campaignId: string, countryCode: string, asOf = new Date()) {
    assertUuid(campaignId, 'campaign id');
    await this.assertMarketingEnabled(countryCode);
    const country = await resolveCountryByCode(this.prisma, countryCode);

    return runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
      const claimed = await this.claimScheduledCampaign(campaignId, country.id, asOf);
      if (!claimed) {
        const campaign = await this.prisma.crmCampaign.findFirst({
          where: { id: campaignId, countryId: country.id },
        });
        if (campaign?.status === CrmCampaignStatus.COMPLETED) {
          return this.buildSendSummary(campaignId);
        }
        return {
          campaign_id: campaignId,
          status: campaign?.status ?? CrmCampaignStatus.SCHEDULED,
          sent_count: 0,
          skipped_count: 0,
          audience_size: 0,
        };
      }

      return this.executeCampaignSend({
        campaignId,
        country,
        batchKey: schedulerBatchKey(campaignId),
        variant: 'default',
      });
    });
  }

  private async claimScheduledCampaign(
    campaignId: string,
    countryId: string,
    asOf?: Date,
  ): Promise<boolean> {
    const result = await this.prisma.crmCampaign.updateMany({
      where: {
        id: campaignId,
        countryId,
        status: CrmCampaignStatus.SCHEDULED,
        ...(asOf ? { scheduledAt: { lte: asOf } } : {}),
      },
      data: { status: CrmCampaignStatus.SENDING, version: { increment: 1 } },
    });
    return result.count > 0;
  }

  private async executeCampaignSend(input: {
    campaignId: string;
    country: { id: string; isoAlpha2: string };
    batchKey: string;
    variant: string;
    actorPersonId?: string;
  }) {
    const campaign = await this.prisma.crmCampaign.findFirstOrThrow({
      where: { id: input.campaignId, countryId: input.country.id },
      include: { segment: true },
    });
    if (campaign.status !== CrmCampaignStatus.SENDING) {
      throw Errors.conflict(`Campaign is not in SENDING status: ${campaign.status}`);
    }

    const memberIds = await this.segments.evaluateMemberIds(input.country.id, campaign.segment.rules);
    let sent = 0;
    let skipped = 0;

    for (const personId of memberIds) {
      const result = await this.attemptSend({
        campaign,
        countryId: input.country.id,
        countryCode: input.country.isoAlpha2,
        personId,
        batchKey: input.batchKey,
        variant: input.variant,
        actorPersonId: input.actorPersonId,
      });
      if (result === 'SENT') {
        sent += 1;
      } else {
        skipped += 1;
      }
    }

    await this.prisma.crmCampaign.update({
      where: { id: campaign.id },
      data: { status: CrmCampaignStatus.COMPLETED, version: { increment: 1 } },
    });

    await this.securityEvents.emit({
      type: 'CRM_CAMPAIGN_SENT',
      outcome: 'success',
      personId: input.actorPersonId ?? campaign.createdByPersonId,
      metadata: {
        campaign_id: campaign.id,
        country_id: input.country.id,
        sent_count: sent,
        skipped_count: skipped,
        scheduled: input.batchKey.startsWith('scheduler:'),
      },
    });

    return {
      campaign_id: campaign.id,
      status: CrmCampaignStatus.COMPLETED,
      sent_count: sent,
      skipped_count: skipped,
      audience_size: memberIds.length,
    };
  }

  private async attemptSend(input: {
    campaign: {
      id: string;
      title: string;
      body: string;
      channel: CrmCampaignChannel;
    };
    countryId: string;
    countryCode: string;
    personId: string;
    batchKey: string;
    variant: string;
    actorPersonId?: string;
  }): Promise<'SENT' | 'SKIPPED'> {
    const idempotencyKey = `${input.batchKey}:${input.variant}`;
    const existing = await this.prisma.crmCampaignSend.findUnique({
      where: {
        campaignId_personId_idempotencyKey: {
          campaignId: input.campaign.id,
          personId: input.personId,
          idempotencyKey,
        },
      },
    });
    if (existing) {
      return existing.status === CrmCampaignSendStatus.SENT ? 'SENT' : 'SKIPPED';
    }

    const skipReason = await this.resolveSkipReason(
      input.personId,
      input.countryId,
      input.countryCode,
      input.campaign.channel,
    );
    if (skipReason) {
      await this.prisma.crmCampaignSend.create({
        data: {
          id: uuidv7(),
          campaignId: input.campaign.id,
          personId: input.personId,
          countryId: input.countryId,
          idempotencyKey,
          variant: input.variant,
          status: CrmCampaignSendStatus.SKIPPED,
          skipReason,
        },
      });
      return 'SKIPPED';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.crmCampaignSend.create({
        data: {
          id: uuidv7(),
          campaignId: input.campaign.id,
          personId: input.personId,
          countryId: input.countryId,
          idempotencyKey,
          variant: input.variant,
          status: CrmCampaignSendStatus.SENT,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'CRM_CAMPAIGN_MESSAGE',
        aggregateType: 'crm_campaign',
        aggregateId: input.campaign.id,
        producer: 'marketing',
        countryId: input.countryId,
        actorId: input.actorPersonId ?? input.personId,
        payload: {
          campaign_id: input.campaign.id,
          person_id: input.personId,
          channel: input.campaign.channel,
        },
        occurrenceKey: `CRM_CAMPAIGN_MESSAGE:${input.campaign.id}:${input.personId}:${idempotencyKey}`,
      });
    });

    await this.notifications.enqueueInbox(input.personId, {
      id: uuidv7(),
      channel: 'in_app',
      title: input.campaign.title,
      body: input.campaign.body,
      read: false,
      created_at: new Date().toISOString(),
      reference_type: 'crm_campaign',
      reference_id: input.campaign.id,
    });

    return 'SENT';
  }

  private async resolveSkipReason(
    personId: string,
    countryId: string,
    countryCode: string,
    channel: CrmCampaignChannel,
  ): Promise<string | null> {
    const prefs = await this.marketingPrefs.getForPerson(personId, countryCode);
    if (!prefs.marketing_allowed) {
      return 'marketing_not_allowed';
    }
    const suppressionChannel =
      channel === CrmCampaignChannel.IN_APP
        ? CrmSuppressionChannel.IN_APP
        : CrmSuppressionChannel.ALL;
    if (await this.suppressions.isSuppressed(personId, countryId, suppressionChannel)) {
      return 'suppressed';
    }
    return null;
  }

  private async buildSendSummary(campaignId: string) {
    const rows = await this.prisma.crmCampaignSend.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });
    const sent = rows.find((r) => r.status === CrmCampaignSendStatus.SENT)?._count._all ?? 0;
    const skipped = rows.find((r) => r.status === CrmCampaignSendStatus.SKIPPED)?._count._all ?? 0;
    return {
      campaign_id: campaignId,
      status: CrmCampaignStatus.COMPLETED,
      sent_count: sent,
      skipped_count: skipped,
      audience_size: sent + skipped,
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
}
