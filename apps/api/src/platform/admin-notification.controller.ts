import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { RbacService } from '../identity/rbac.service';
import { SecurityEventsService } from '../identity/security-events.service';
import { AuthService } from '../identity/auth.service';
import { PrismaService } from '../app/prisma.service';
import { NotificationService, type NotificationOpsRecord } from './notification.service';
import {
  assertProductionMessagingAvailable,
  evaluateProductionMessagingAvailable,
} from './production-messaging-gate';

const FINANCE_EVENT_PREFIXES = ['PAYMENT_', 'ORDER_REFUND', 'SETTLEMENT_', 'PAYOUT_', 'AFFILIATE_'];

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminNotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly securityEvents: SecurityEventsService,
    private readonly rbac: RbacService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertOpsViewer(principal: Principal): Promise<{
    financeOnly: boolean;
    canViewDlq: boolean;
  }> {
    const [campaign, support, finance, audit] = await Promise.all([
      this.rbac.hasPermission(principal.personId, 'campaign:read'),
      this.rbac.hasPermission(principal.personId, 'support:read'),
      this.rbac.hasPermission(principal.personId, 'finance:read'),
      this.rbac.hasPermission(principal.personId, 'identity:audit_read'),
    ]);
    if (!campaign && !support && !finance && !audit) {
      throw Errors.forbidden();
    }
    return {
      // Finance-scoped operators see payment/settlement/affiliate metadata only
      // (even when they also hold identity:audit_read).
      financeOnly: Boolean(finance && !campaign && !support),
      canViewDlq: Boolean(campaign || audit),
    };
  }

  private filterFinanceRows(rows: NotificationOpsRecord[]): NotificationOpsRecord[] {
    return rows.filter((row) => {
      const event = row.event_type ?? '';
      return FINANCE_EVENT_PREFIXES.some((prefix) => event.startsWith(prefix));
    });
  }

  @Get('production-otp-availability')
  @RequirePermissions('identity:audit_read')
  async productionOtpAvailability(@Query('country_code') countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.auth.evaluateProductionOtpAvailable(countryCode.trim().toUpperCase());
  }

  @Post('production-otp-availability/assert')
  @RequirePermissions('identity:audit_read')
  async assertProductionOtpAvailability(@Query('country_code') countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.auth.assertProductionOtpAvailable(countryCode.trim().toUpperCase());
  }

  @Get('production-messaging-availability')
  @RequirePermissions('campaign:read')
  async productionMessagingAvailability(@Query('country_code') countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return evaluateProductionMessagingAvailable(this.prisma, {
      countryCode: countryCode.trim().toUpperCase(),
    });
  }

  @Post('production-messaging-availability/assert')
  @RequirePermissions('campaign:read')
  async assertProductionMessagingAvailability(@Query('country_code') countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return assertProductionMessagingAvailable(this.prisma, {
      countryCode: countryCode.trim().toUpperCase(),
    });
  }

  @Get('otp-challenges')
  @RequirePermissions('identity:audit_read')
  async otpChallenges(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number(limitRaw) : 50;
    const result = await this.auth.listOtpChallengesForAdmin({
      countryCode: countryCode?.trim(),
      limit: Number.isFinite(limit) ? limit : 50,
    });
    await this.securityEvents.emit({
      type: 'NOTIFICATION_OPS_VIEWED',
      outcome: 'success',
      personId: principal.personId,
      metadata: { view: 'otp_challenges', count: result.data.length, sandbox: true },
    });
    return result;
  }

  @Get('ops/snapshot')
  async opsSnapshot(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
  ) {
    await this.assertOpsViewer(principal);
    const snapshot = await this.notifications.opsSnapshot(countryCode?.trim() || undefined);
    await this.securityEvents.emit({
      type: 'NOTIFICATION_OPS_VIEWED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        view: 'snapshot',
        country_code: countryCode?.trim() || null,
        sandbox: true,
      },
    });
    return snapshot;
  }

  @Get('ops/records')
  async opsRecords(
    @CurrentPrincipal() principal: Principal,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('event_type') eventType?: string,
    @Query('country_code') countryCode?: string,
    @Query('recipient_category') recipientCategory?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const access = await this.assertOpsViewer(principal);
    const limit = limitRaw ? Number(limitRaw) : 100;
    let data = await this.notifications.listOpsRecords({
      status: status?.trim() || undefined,
      channel: channel?.trim() || undefined,
      event_type: eventType?.trim() || undefined,
      country_code: countryCode?.trim() || undefined,
      recipient_category: recipientCategory?.trim() || undefined,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    if (access.financeOnly) {
      data = this.filterFinanceRows(data);
    }
    await this.securityEvents.emit({
      type: 'NOTIFICATION_OPS_VIEWED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        view: 'records',
        finance_only: access.financeOnly,
        count: data.length,
        sandbox: true,
      },
    });
    return {
      data: data.map((row) => ({
        id: row.id,
        person_id: row.person_id,
        recipient_category: row.recipient_category,
        channel: row.channel,
        event_type: row.event_type,
        title: row.title,
        status: row.status,
        country_code: row.country_code,
        correlation_id: row.correlation_id,
        occurrence_key: row.occurrence_key,
        reference_type: row.reference_type,
        reference_id: row.reference_id,
        sandbox: row.sandbox,
        external_gated: row.external_gated,
        created_at: row.created_at,
        live_delivery: false,
      })),
      sandbox: true,
      live_delivery: false,
      message_bodies_included: false,
    };
  }

  @Get('ops/dead-letters')
  async deadLetters(
    @CurrentPrincipal() principal: Principal,
    @Query('limit') limitRaw?: string,
  ) {
    const access = await this.assertOpsViewer(principal);
    if (!access.canViewDlq) {
      throw Errors.forbidden();
    }
    const limit = limitRaw ? Number(limitRaw) : 50;
    return this.notifications.listNotificationDeadLetters(Number.isFinite(limit) ? limit : 50);
  }

  @Post('send')
  @RequirePermissions('campaign:read')
  async send(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { person_id?: string; title?: string; body?: string },
  ) {
    const personId = body.person_id?.trim();
    const title = body.title?.trim();
    const text = body.body?.trim();
    if (!personId || !title || !text) {
      throw Errors.validation('person_id, title and body are required.');
    }
    if (title.length > 120 || text.length > 500) {
      throw Errors.validation('title or body is too long.');
    }
    NotificationService.assertSafePayload(title, text);
    const result = await this.notifications.enqueueInbox(
      personId,
      {
        id: uuidv7(),
        channel: 'in_app',
        title,
        body: text,
        read: false,
        created_at: new Date().toISOString(),
        reference_type: 'admin_broadcast',
        reference_id: principal.personId,
        event_type: 'ADMIN_MANUAL_SEND',
        sandbox: true,
      },
      {
        occurrenceKey: `admin-send:${personId}:${title}:${text.slice(0, 40)}:${Math.floor(Date.now() / 1000)}`,
        recipientCategory: 'customer',
      },
    );
    await this.securityEvents.emit({
      type: 'NOTIFICATION_ADMIN_SEND',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        target_person_id: personId,
        notification_id: result.id,
        created: result.created,
        sandbox: true,
      },
    });
    return {
      ok: true,
      person_id: personId,
      notification_id: result.id,
      created: result.created,
      delivery_status: 'SANDBOX_DELIVERED',
      live_delivery: false,
    };
  }
}
