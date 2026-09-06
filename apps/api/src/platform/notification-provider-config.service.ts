import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationChannel, NotificationConfigStatus, NotificationProviderRole, Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  assertConfigStatus,
  assertNotificationChannel,
  assertProviderRole,
  assertSafeSecretRef,
  deriveEffectiveStatus,
  type NotificationProviderPatch,
} from './notification-provider-config';

type ProviderRow = Prisma.NotificationCountryProviderGetPayload<{ include: { country: { select: { isoAlpha2: true } } } }>;

const DEFAULT_CATALOG: Array<{
  channel: NotificationChannel;
  providerCode: string;
  providerName: string;
  role: NotificationProviderRole;
  configStatus: NotificationConfigStatus;
  secretRef: string | null;
  active: boolean;
}> = [
  { channel: 'SMS', providerCode: 'CONSOLE', providerName: 'Console OTP (sandbox)', role: 'PRIMARY', configStatus: 'SANDBOX', secretRef: 'env:NOTIFICATION_SMS_CONSOLE', active: true },
  { channel: 'SMS', providerCode: 'CONSOLE', providerName: 'Console OTP fallback', role: 'FALLBACK', configStatus: 'UNCONFIGURED', secretRef: null, active: false },
  { channel: 'EMAIL', providerCode: 'CONSOLE', providerName: 'Console mail (sandbox)', role: 'PRIMARY', configStatus: 'SANDBOX', secretRef: 'env:NOTIFICATION_EMAIL_CONSOLE', active: true },
  { channel: 'PUSH', providerCode: 'FCM', providerName: 'Firebase Cloud Messaging', role: 'PRIMARY', configStatus: 'UNCONFIGURED', secretRef: null, active: false },
  { channel: 'IN_APP', providerCode: 'INTERNAL', providerName: 'Platform inbox', role: 'PRIMARY', configStatus: 'VERIFIED', secretRef: null, active: true },
  { channel: 'WHATSAPP', providerCode: 'META', providerName: 'WhatsApp Business', role: 'PRIMARY', configStatus: 'UNCONFIGURED', secretRef: null, active: false },
];

@Injectable()
export class NotificationProviderConfigService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const countries = await this.prisma.country.findMany({ where: { status: 'ACTIVE' } });
    for (const country of countries) {
      for (const seed of DEFAULT_CATALOG) {
        const exists = await this.prisma.notificationCountryProvider.findFirst({
          where: {
            countryId: country.id,
            channel: seed.channel,
            providerCode: seed.providerCode,
            role: seed.role,
          },
        });
        if (exists) {
          continue;
        }
        await this.prisma.runWithTenant(workerTenantContext(), () =>
          this.prisma.notificationCountryProvider.create({
            data: {
              id: uuidv7(),
              countryId: country.id,
              channel: seed.channel,
              providerCode: seed.providerCode,
              providerName: seed.providerName,
              role: seed.role,
              environment: 'sandbox',
              active: seed.active,
              configStatus: seed.configStatus,
              secretRef: seed.secretRef,
              priority: seed.role === 'PRIMARY' ? 10 : 90,
            },
          }),
        );
      }
    }
  }

  private present(row: ProviderRow) {
    const effective = deriveEffectiveStatus({
      active: row.active,
      configStatus: row.configStatus,
      secretRef: row.secretRef,
      environment: row.environment,
    });
    return {
      id: row.id,
      country_code: row.country.isoAlpha2,
      channel: row.channel,
      provider_code: row.providerCode,
      provider_name: row.providerName,
      role: row.role,
      environment: row.environment,
      active: row.active,
      config_status: row.configStatus,
      secret_ref_configured: Boolean(row.secretRef?.trim()),
      priority: row.priority,
      last_verified_at: row.lastVerifiedAt?.toISOString() ?? null,
      effective_status: effective.effective,
      live: effective.live,
      sandbox: effective.sandbox,
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async list(countryCode?: string) {
    const where: Prisma.NotificationCountryProviderWhereInput = {};
    if (countryCode?.trim()) {
      const country = await this.requireCountry(countryCode);
      where.countryId = country.id;
    }
    const rows = await this.prisma.notificationCountryProvider.findMany({
      where,
      include: { country: { select: { isoAlpha2: true } } },
      orderBy: [{ country: { isoAlpha2: 'asc' } }, { channel: 'asc' }, { priority: 'asc' }, { providerCode: 'asc' }],
    });
    return {
      note: 'Providers are configuration records only. live=true requires VERIFIED status, credentials, and non-sandbox environment.',
      providers: rows.map((row) => this.present(row)),
    };
  }

  async matrix(countryCode: string) {
    const country = await this.requireCountry(countryCode);
    const rows = await this.prisma.notificationCountryProvider.findMany({
      where: { countryId: country.id },
      include: { country: { select: { isoAlpha2: true } } },
      orderBy: [{ channel: 'asc' }, { priority: 'asc' }],
    });
    const byChannel = new Map<string, ReturnType<typeof this.present>[]>();
    for (const row of rows) {
      const key = row.channel;
      const list = byChannel.get(key) ?? [];
      list.push(this.present(row));
      byChannel.set(key, list);
    }
    return {
      country_code: country.isoAlpha2,
      channels: [...byChannel.entries()].map(([channel, providers]) => ({
        channel,
        providers,
        primary: providers.find((p) => p.role === 'PRIMARY' && p.active) ?? null,
        fallback: providers.find((p) => p.role === 'FALLBACK' && p.active) ?? null,
      })),
    };
  }

  async update(principal: Principal, id: string, patch: NotificationProviderPatch) {
    const existing = await this.prisma.notificationCountryProvider.findUnique({
      where: { id },
      include: { country: { select: { isoAlpha2: true } } },
    });
    if (!existing) {
      throw Errors.notFound('Notification provider configuration not found.');
    }

    const nextEnvironment = patch.environment?.trim().toLowerCase() ?? existing.environment;
    if (nextEnvironment === 'production' && patch.config_status !== 'VERIFIED' && existing.configStatus !== 'VERIFIED') {
      throw Errors.problem(
        409,
        'NOTIFICATION_PROVIDER_NOT_VERIFIED',
        'Provider not verified',
        'Production environment requires VERIFIED configuration status and configured credentials.',
      );
    }

    const nextSecretRef =
      patch.secret_ref !== undefined
        ? patch.secret_ref
          ? (assertSafeSecretRef(patch.secret_ref), patch.secret_ref.trim())
          : null
        : existing.secretRef;

    const nextConfigStatus =
      patch.config_status !== undefined ? assertConfigStatus(patch.config_status) : existing.configStatus;

    if (patch.active === true && nextConfigStatus === 'UNCONFIGURED' && !nextSecretRef && existing.channel !== 'IN_APP') {
      throw Errors.problem(
        409,
        'NOTIFICATION_PROVIDER_NOT_CONFIGURED',
        'Provider not configured',
        'Cannot activate an unconfigured provider. Set config_status to SANDBOX or VERIFIED and provide secret_ref.',
      );
    }

    const updated = await this.prisma.notificationCountryProvider.update({
      where: { id },
      data: {
        active: patch.active ?? existing.active,
        providerName: patch.provider_name?.trim() || existing.providerName,
        environment: nextEnvironment,
        configStatus: nextConfigStatus,
        secretRef: nextSecretRef,
        priority: patch.priority ?? existing.priority,
        role: patch.role ? assertProviderRole(patch.role) : existing.role,
        lastVerifiedAt: nextConfigStatus === 'VERIFIED' ? new Date() : existing.lastVerifiedAt,
      },
      include: { country: { select: { isoAlpha2: true } } },
    });

    await this.events.emit({
      type: 'NOTIFICATION_PROVIDER_CONFIG_UPDATED',
      personId: principal.personId,
      outcome: 'success',
      metadata: {
        provider_id: id,
        country_code: updated.country.isoAlpha2,
        channel: updated.channel,
        provider_code: updated.providerCode,
        active: updated.active,
        config_status: updated.configStatus,
      },
    });

    return { provider: this.present(updated) };
  }

  async create(
    principal: Principal,
    input: {
      country_code: string;
      channel: string;
      provider_code: string;
      provider_name: string;
      role?: string;
    },
  ) {
    const country = await this.requireCountry(input.country_code);
    const channel = assertNotificationChannel(input.channel);
    const role = input.role ? assertProviderRole(input.role) : 'PRIMARY';
    const providerCode = input.provider_code.trim().toUpperCase();
    const providerName = input.provider_name.trim();
    if (!providerCode || !providerName) {
      throw Errors.validation('provider_code and provider_name are required.');
    }

    const row = await this.prisma.notificationCountryProvider.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        channel,
        providerCode,
        providerName,
        role,
        environment: 'sandbox',
        active: false,
        configStatus: 'UNCONFIGURED',
        priority: role === 'PRIMARY' ? 10 : 90,
      },
      include: { country: { select: { isoAlpha2: true } } },
    });

    await this.events.emit({
      type: 'NOTIFICATION_PROVIDER_CONFIG_CREATED',
      personId: principal.personId,
      outcome: 'success',
      metadata: {
        provider_id: row.id,
        country_code: country.isoAlpha2,
        channel,
        provider_code: providerCode,
      },
    });

    return { provider: this.present(row) };
  }

  private async requireCountry(countryCode: string) {
    const code = countryCode.trim().toUpperCase();
    const country = await this.prisma.country.findFirst({ where: { isoAlpha2: code } });
    if (!country) {
      throw Errors.validation(`Unknown country_code: ${code}`);
    }
    return country;
  }
}
