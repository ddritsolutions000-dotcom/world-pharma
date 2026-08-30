import { Injectable } from '@nestjs/common';
import { RedisService } from '../app/redis.service';
import { PrismaService } from '../app/prisma.service';
import { MarketingPreferenceService } from '../crm/marketing-preference.service';

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

  async getPreferences(personId: string): Promise<NotificationPreferences> {
    await this.redis.ensureConnected();
    const raw = await this.redis.client.get(this.key(personId));
    const redisPrefs = raw
      ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotificationPreferences>) }
      : { ...DEFAULT_PREFS };
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

  async listInbox(personId: string) {
    await this.redis.ensureConnected();
    const raw = await this.redis.client.lrange(`notification:inbox:${personId}`, 0, 49);
    return raw.map((entry) => {
      try {
        return JSON.parse(entry) as {
          id: string;
          channel: string;
          title: string;
          body: string;
          read: boolean;
          created_at: string;
          reference_type?: string;
          reference_id?: string;
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async registerPushToken(personId: string, token: string, platform: string) {
    await this.redis.ensureConnected();
    await this.redis.client.set(
      `notification:push:${personId}:${platform}`,
      token,
      'EX',
      60 * 60 * 24 * 90,
    );
    return { ok: true };
  }

  async enqueueInbox(
    personId: string,
    entry: {
      id: string;
      channel: string;
      title: string;
      body: string;
      read: boolean;
      created_at: string;
      reference_type?: string;
      reference_id?: string;
    },
  ): Promise<void> {
    // Never persist PHI-bearing bodies; callers must keep titles/bodies generic.
    await this.redis.ensureConnected();
    await this.redis.client.lpush(`notification:inbox:${personId}`, JSON.stringify(entry));
    await this.redis.client.ltrim(`notification:inbox:${personId}`, 0, 99);
    await this.redis.client.expire(`notification:inbox:${personId}`, 60 * 60 * 24 * 30);
  }
}
