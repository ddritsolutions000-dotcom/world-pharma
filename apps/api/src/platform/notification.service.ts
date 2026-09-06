import { Injectable } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { RedisService } from '../app/redis.service';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { MarketingPreferenceService } from '../crm/marketing-preference.service';
import { NOTIFICATION_EVENT_TYPES } from './notification-catalog';

export type NotificationPreferences = {
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  order_updates: boolean;
  appointment_updates: boolean;
  delivery_updates: boolean;
  settlement_updates: boolean;
  support_updates: boolean;
  marketing: boolean;
};

/** Operational prefs that cannot be turned off (mandatory workflow communication). */
export const MANDATORY_NOTIFICATION_PREFS = [
  'order_updates',
  'appointment_updates',
  'delivery_updates',
  'settlement_updates',
  'support_updates',
] as const;

/**
 * Delivery states (S76). SENT = accepted by provider; DELIVERED requires receipt.
 * Without a live provider, SMS/email/push stay EXTERNAL_GATED — never claim DELIVERED.
 */
export type NotificationDeliveryStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENT'
  | 'DELIVERED'
  | 'SANDBOX_DELIVERED'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCELLED'
  | 'DEAD_LETTER'
  | 'EXTERNAL_GATED';

export type InboxItem = {
  id: string;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  reference_type?: string;
  reference_id?: string;
  event_type?: string;
  occurrence_key?: string;
  country_code?: string | null;
  delivery_status?: NotificationDeliveryStatus;
  sandbox?: boolean;
  external_gated?: boolean;
  correlation_id?: string | null;
};

export type NotificationOpsRecord = {
  id: string;
  person_id: string;
  recipient_category: string;
  channel: string;
  event_type: string | null;
  title: string;
  status: NotificationDeliveryStatus;
  country_code: string | null;
  correlation_id: string | null;
  occurrence_key: string | null;
  reference_type: string | null;
  reference_id: string | null;
  sandbox: boolean;
  external_gated: boolean;
  created_at: string;
};

const DEFAULT_PREFS: NotificationPreferences = {
  email_enabled: true,
  push_enabled: false,
  sms_enabled: false,
  order_updates: true,
  appointment_updates: true,
  delivery_updates: true,
  settlement_updates: true,
  support_updates: true,
  marketing: false,
};

const SAFE_BODY =
  'Open the app for details. External channels remain disabled in sandbox.';

/** Blocks free-form clinical detail leakage; safe status titles are allowed. */
const PHI_PATTERN =
  /\b(diagnosed with|your diagnosis|lab value|result:\s*\d|hemoglobin\s*[:=]|mg\/dl|prescription contents|clinical note:|dicom\s*uid)\b/i;

@Injectable()
export class NotificationService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly marketingPrefs: MarketingPreferenceService,
  ) {}

  private key(personId: string) {
    return `notification:prefs:${personId}`;
  }

  private inboxKey(personId: string) {
    return `notification:inbox:${personId}`;
  }

  private dedupeKey(occurrenceKey: string) {
    return `notification:dedupe:${occurrenceKey}`;
  }

  private opsLogKey() {
    return 'notification:ops:log';
  }

  static safeSandboxBody(): string {
    return SAFE_BODY;
  }

  static assertSafePayload(title: string, body: string): void {
    if (PHI_PATTERN.test(title) || PHI_PATTERN.test(body)) {
      throw Errors.validation(
        'Notification payload must not include clinical or diagnostic content.',
      );
    }
  }

  async getPreferences(personId: string): Promise<NotificationPreferences> {
    await this.redis.ensureConnected();
    const raw = await this.redis.client.get(this.key(personId));
    const redisPrefs = raw
      ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotificationPreferences>) }
      : { ...DEFAULT_PREFS };
    for (const key of MANDATORY_NOTIFICATION_PREFS) {
      redisPrefs[key] = true;
    }
    const countryCode = await this.resolvePrimaryCountryCode(personId);
    if (!countryCode) {
      return { ...redisPrefs, marketing: false };
    }
    const durable = await this.marketingPrefs.getForPerson(personId, countryCode);
    return {
      ...redisPrefs,
      marketing: durable.marketing_allowed,
    };
  }

  async updatePreferences(
    personId: string,
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const current = await this.getPreferences(personId);
    const next = { ...current, ...patch };
    for (const key of MANDATORY_NOTIFICATION_PREFS) {
      next[key] = true;
    }
    await this.redis.ensureConnected();
    await this.redis.client.set(this.key(personId), JSON.stringify(next), 'EX', 60 * 60 * 24 * 365);

    if (patch.marketing !== undefined) {
      const countryCode = await this.resolvePrimaryCountryCode(personId);
      if (countryCode) {
        await this.marketingPrefs.updateForPerson(
          personId,
          countryCode,
          { marketing_allowed: patch.marketing },
          personId,
        );
      }
    }

    return this.getPreferences(personId);
  }

  private async resolvePrimaryCountryCode(personId: string): Promise<string | null> {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { primaryCountryId: true },
    });
    if (person?.primaryCountryId) {
      const country = await this.prisma.country.findUnique({
        where: { id: person.primaryCountryId },
        select: { isoAlpha2: true },
      });
      return country?.isoAlpha2 ?? null;
    }
    const fallback = await this.prisma.country.findUnique({
      where: { isoAlpha2: 'XX' },
      select: { isoAlpha2: true },
    });
    return fallback?.isoAlpha2 ?? null;
  }

  async listInbox(personId: string): Promise<InboxItem[]> {
    await this.redis.ensureConnected();
    const raw = await this.redis.client.lrange(this.inboxKey(personId), 0, 49);
    return raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as InboxItem;
        } catch {
          return null;
        }
      })
      .filter((item): item is InboxItem => Boolean(item));
  }

  async unreadCount(personId: string): Promise<number> {
    const items = await this.listInbox(personId);
    return items.filter((row) => !row.read).length;
  }

  async markRead(personId: string, id: string): Promise<InboxItem[]> {
    const notificationId = id.trim();
    if (!notificationId || notificationId.length > 128) {
      throw Errors.validation('Notification id is required.');
    }
    await this.redis.ensureConnected();
    const key = this.inboxKey(personId);
    const raw = await this.redis.client.lrange(key, 0, -1);
    let found = false;
    const next = raw.map((entry) => {
      try {
        const item = JSON.parse(entry) as InboxItem;
        if (item.id === notificationId) {
          found = true;
          return JSON.stringify({ ...item, read: true });
        }
      } catch {
        return entry;
      }
      return entry;
    });
    if (!found) {
      throw Errors.notFound('Notification not found.');
    }
    const ttl = await this.redis.client.ttl(key);
    const pipeline = this.redis.client.multi();
    pipeline.del(key);
    if (next.length) {
      pipeline.rpush(key, ...next);
      pipeline.expire(key, ttl > 0 ? ttl : 60 * 60 * 24 * 30);
    }
    await pipeline.exec();
    return this.listInbox(personId);
  }

  async markAllRead(personId: string): Promise<InboxItem[]> {
    await this.redis.ensureConnected();
    const key = this.inboxKey(personId);
    const raw = await this.redis.client.lrange(key, 0, -1);
    if (!raw.length) {
      return [];
    }
    const next = raw.map((entry) => {
      try {
        const item = JSON.parse(entry) as InboxItem;
        return JSON.stringify({ ...item, read: true });
      } catch {
        return entry;
      }
    });
    const ttl = await this.redis.client.ttl(key);
    const pipeline = this.redis.client.multi();
    pipeline.del(key);
    pipeline.rpush(key, ...next);
    pipeline.expire(key, ttl > 0 ? ttl : 60 * 60 * 24 * 30);
    await pipeline.exec();
    return this.listInbox(personId);
  }

  async registerPushToken(personId: string, token: string, platform: string) {
    await this.redis.ensureConnected();
    await this.redis.client.set(
      `notification:push:${personId}:${platform}`,
      token,
      'EX',
      60 * 60 * 24 * 90,
    );
    return {
      ok: true,
      channel: 'push',
      sandbox: true,
      delivery_status: 'EXTERNAL_GATED' as const,
      message: 'Push token stored. Live push delivery remains EXTERNAL_GATED.',
    };
  }

  /**
   * Enqueue an in-app notification. When occurrenceKey is provided, duplicate
   * enqueues for the same key are ignored (idempotent).
   */
  async enqueueInbox(
    personId: string,
    entry: InboxItem,
    options?: { occurrenceKey?: string; recipientCategory?: string },
  ): Promise<{ created: boolean; id: string }> {
    NotificationService.assertSafePayload(entry.title, entry.body);
    await this.redis.ensureConnected();
    const occurrenceKey = options?.occurrenceKey ?? entry.occurrence_key ?? null;
    if (occurrenceKey) {
      const claimed = await this.redis.client.set(
        this.dedupeKey(occurrenceKey),
        entry.id,
        'EX',
        60 * 60 * 24 * 30,
        'NX',
      );
      if (claimed !== 'OK') {
        return { created: false, id: entry.id };
      }
    }

    const channel = (entry.channel || 'in_app').toLowerCase();
    const externalGated = channel !== 'in_app';
    const normalized: InboxItem = {
      ...entry,
      id: entry.id || uuidv7(),
      channel,
      body: entry.body?.trim() || SAFE_BODY,
      occurrence_key: occurrenceKey ?? undefined,
      delivery_status: externalGated ? 'EXTERNAL_GATED' : 'SANDBOX_DELIVERED',
      sandbox: true,
      external_gated: externalGated,
    };

    const key = this.inboxKey(personId);
    await this.redis.client.lpush(key, JSON.stringify(normalized));
    await this.redis.client.ltrim(key, 0, 99);
    await this.redis.client.expire(key, 60 * 60 * 24 * 30);

    const ops: NotificationOpsRecord = {
      id: normalized.id,
      person_id: personId,
      recipient_category: options?.recipientCategory ?? 'person',
      channel: normalized.channel,
      event_type: normalized.event_type ?? null,
      title: normalized.title,
      status: normalized.delivery_status ?? 'SANDBOX_DELIVERED',
      country_code: normalized.country_code ?? null,
      correlation_id: normalized.correlation_id ?? null,
      occurrence_key: occurrenceKey,
      reference_type: normalized.reference_type ?? null,
      reference_id: normalized.reference_id ?? null,
      sandbox: true,
      external_gated: Boolean(normalized.external_gated),
      created_at: normalized.created_at,
    };
    await this.redis.client.lpush(this.opsLogKey(), JSON.stringify(ops));
    await this.redis.client.ltrim(this.opsLogKey(), 0, 999);
    await this.redis.client.expire(this.opsLogKey(), 60 * 60 * 24 * 30);

    return { created: true, id: normalized.id };
  }

  async listOpsRecords(filters?: {
    status?: string;
    channel?: string;
    event_type?: string;
    country_code?: string;
    recipient_category?: string;
    limit?: number;
  }): Promise<NotificationOpsRecord[]> {
    await this.redis.ensureConnected();
    const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500);
    const raw = await this.redis.client.lrange(this.opsLogKey(), 0, limit - 1);
    const rows = raw
      .map((entry) => {
        try {
          return JSON.parse(entry) as NotificationOpsRecord;
        } catch {
          return null;
        }
      })
      .filter((row): row is NotificationOpsRecord => Boolean(row));

    return rows.filter((row) => {
      if (filters?.status && row.status !== filters.status) return false;
      if (filters?.channel && row.channel.toLowerCase() !== filters.channel.toLowerCase()) return false;
      if (filters?.event_type && row.event_type !== filters.event_type) return false;
      if (filters?.country_code && row.country_code !== filters.country_code.toUpperCase()) return false;
      if (filters?.recipient_category && row.recipient_category !== filters.recipient_category) {
        return false;
      }
      return true;
    });
  }

  async opsSnapshot(countryCode?: string) {
    const rows = await this.listOpsRecords({
      country_code: countryCode,
      limit: 500,
    });
    const byStatus: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      byChannel[row.channel] = (byChannel[row.channel] ?? 0) + 1;
    }

    const notifEventTypes = this.notificationEventTypeSet();
    const [outboxPending, outboxFailed, outboxDead, outboxPublished] = await Promise.all([
      this.prisma.outboxEvent.count({
        where: { status: OutboxStatus.PENDING, type: { in: [...notifEventTypes] } },
      }),
      this.prisma.outboxEvent.count({
        where: { status: OutboxStatus.FAILED, type: { in: [...notifEventTypes] } },
      }),
      this.prisma.outboxEvent.count({
        where: { status: OutboxStatus.DEAD_LETTERED, type: { in: [...notifEventTypes] } },
      }),
      this.prisma.outboxEvent.count({
        where: {
          status: OutboxStatus.PUBLISHED,
          type: { in: [...notifEventTypes] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      scope: countryCode?.toUpperCase() ?? 'GLOBAL',
      sandbox: true,
      live_delivery: false,
      external_gated: true,
      volume: rows.length,
      by_status: byStatus,
      by_channel: byChannel,
      sandbox_delivered: byStatus.SANDBOX_DELIVERED ?? 0,
      external_gated_count: byStatus.EXTERNAL_GATED ?? 0,
      failed: byStatus.FAILED ?? 0,
      outbox: {
        pending: outboxPending,
        failed: outboxFailed,
        dead_lettered: outboxDead,
        published_24h: outboxPublished,
      },
      channels: {
        in_app: { sandbox: true, production: true, external_gate: null },
        email: { sandbox: true, production: false, external_gate: 'EXTERNAL_GATED' },
        sms: { sandbox: true, production: false, external_gate: 'EXTERNAL_GATED' },
        push: { sandbox: true, production: false, external_gate: 'EXTERNAL_GATED' },
        whatsapp: { sandbox: true, production: false, external_gate: 'EXTERNAL_GATED' },
      },
      production_gates: {
        otp: countryCode
          ? await (async () => {
              const { evaluateProductionOtpAvailable } = await import(
                '../identity/production-otp-gate'
              );
              return evaluateProductionOtpAvailable(this.prisma, { countryCode });
            })()
          : null,
        messaging: countryCode
          ? await (async () => {
              const { evaluateProductionMessagingAvailable } = await import(
                './production-messaging-gate'
              );
              return evaluateProductionMessagingAvailable(this.prisma, { countryCode });
            })()
          : null,
        never_fallback_to_mock: true,
      },
    };
  }

  async listNotificationDeadLetters(limit = 50) {
    const types = this.notificationEventTypeSet();
    const rows = await this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxStatus.DEAD_LETTERED,
        type: { in: [...types] },
      },
      orderBy: { failedAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        type: true,
        aggregateId: true,
        status: true,
        attempts: true,
        lastError: true,
        correlationId: true,
        countryId: true,
        failedAt: true,
        createdAt: true,
      },
    });
    const countries = await this.prisma.country.findMany({
      where: { id: { in: rows.map((r) => r.countryId).filter(Boolean) as string[] } },
      select: { id: true, isoAlpha2: true },
    });
    const countryById = new Map(countries.map((c) => [c.id, c.isoAlpha2]));
    return {
      data: rows.map((row) => ({
        id: row.id,
        event_type: row.type,
        aggregate_id: row.aggregateId,
        status: 'DEAD_LETTER',
        attempts: row.attempts,
        failure_reason: row.lastError,
        correlation_id: row.correlationId,
        country_code: row.countryId ? countryById.get(row.countryId) ?? null : null,
        failed_at: row.failedAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
        sandbox: true,
        live_delivery: false,
      })),
      sandbox: true,
      message: 'Notification-related outbox dead letters. Replay is not available from this console.',
    };
  }

  private notificationEventTypeSet(): Set<string> {
    return new Set(NOTIFICATION_EVENT_TYPES);
  }
}
