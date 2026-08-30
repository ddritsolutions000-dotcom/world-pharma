import { Injectable } from '@nestjs/common';
import { CrmAutomationKind, CrmAutomationRunStatus, CrmSuppressionChannel } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../../app/prisma.service';
import { Errors } from '../../common/problem';
import { OutboxService } from '../../events/outbox.service';
import { NotificationService } from '../../platform/notification.service';
import { assertMarketingCopySafe } from './automation-copy';
import { MarketingPreferenceService } from '../marketing-preference.service';
import { SuppressionService } from '../marketing/suppression.service';
import { SecurityEventsService } from '../../identity/security-events.service';

export type AutomationAttemptInput = {
  automationKind: CrmAutomationKind;
  sourceId: string;
  personId: string;
  countryId: string;
  countryCode: string;
  title: string;
  body: string;
  referenceType: string;
  actorPersonId?: string;
};

export type AutomationAttemptResult = {
  status: 'SENT' | 'SKIPPED';
  skip_reason?: string;
  run_id: string;
  duplicate?: boolean;
};

@Injectable()
export class AutomationRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketingPrefs: MarketingPreferenceService,
    private readonly suppressions: SuppressionService,
    private readonly notifications: NotificationService,
    private readonly outbox: OutboxService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async attemptRun(input: AutomationAttemptInput): Promise<AutomationAttemptResult> {
    try {
      assertMarketingCopySafe(input.title, input.body);
    } catch {
      throw Errors.validation('Marketing copy rejected clinical content');
    }

    const existing = await this.prisma.crmAutomationRun.findUnique({
      where: {
        automationKind_sourceId_personId: {
          automationKind: input.automationKind,
          sourceId: input.sourceId,
          personId: input.personId,
        },
      },
    });
    if (existing?.status === CrmAutomationRunStatus.SENT) {
      return {
        status: 'SENT',
        run_id: existing.id,
        duplicate: true,
      };
    }

    const skipReason = await this.resolveSkipReason(
      input.personId,
      input.countryId,
      input.countryCode,
    );
    if (skipReason) {
      return { status: 'SKIPPED', skip_reason: skipReason, run_id: 'ephemeral' };
    }

    const runId = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.crmAutomationRun.create({
        data: {
          id: runId,
          countryId: input.countryId,
          personId: input.personId,
          automationKind: input.automationKind,
          sourceId: input.sourceId,
          status: CrmAutomationRunStatus.SENT,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'CRM_AUTOMATION_REMINDER',
        aggregateType: 'crm_automation',
        aggregateId: runId,
        producer: 'marketing',
        countryId: input.countryId,
        actorId: input.actorPersonId ?? input.personId,
        payload: {
          automation_kind: input.automationKind,
          person_id: input.personId,
          source_id: input.sourceId,
          channel: 'in_app',
        },
        occurrenceKey: `CRM_AUTOMATION_REMINDER:${input.automationKind}:${input.sourceId}:${input.personId}`,
      });
    });

    await this.notifications.enqueueInbox(input.personId, {
      id: uuidv7(),
      channel: 'in_app',
      title: input.title,
      body: input.body,
      read: false,
      created_at: new Date().toISOString(),
      reference_type: input.referenceType,
      reference_id: input.sourceId,
    });

    await this.securityEvents.emit({
      type: 'CRM_AUTOMATION_RUN',
      outcome: 'success',
      personId: input.actorPersonId ?? input.personId,
      metadata: {
        run_id: runId,
        automation_kind: input.automationKind,
        source_id: input.sourceId,
        subject_person_id: input.personId,
        country_id: input.countryId,
        status: 'SENT',
      },
    });

    return { status: 'SENT', run_id: runId };
  }

  private async resolveSkipReason(
    personId: string,
    countryId: string,
    countryCode: string,
  ): Promise<string | null> {
    const prefs = await this.marketingPrefs.getForPerson(personId, countryCode);
    if (!prefs.marketing_allowed) {
      return 'marketing_not_allowed';
    }
    if (prefs.country_id !== countryId) {
      return 'country_mismatch';
    }
    if (await this.suppressions.isSuppressed(personId, countryId, CrmSuppressionChannel.IN_APP)) {
      return 'suppressed';
    }
    return null;
  }
}
