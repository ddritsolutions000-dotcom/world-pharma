import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { NotificationService } from './notification.service';

@Controller('me/notifications')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'doctor', 'admin', 'partner_applicant')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get('preferences')
  preferences(@CurrentPrincipal() principal: Principal) {
    return this.notifications.getPreferences(principal.personId);
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentPrincipal() principal: Principal,
    @Body() body: Record<string, unknown>,
  ) {
    return this.notifications.updatePreferences(principal.personId, {
      email_enabled: body.email_enabled as boolean | undefined,
      push_enabled: body.push_enabled as boolean | undefined,
      sms_enabled: body.sms_enabled as boolean | undefined,
      order_updates: body.order_updates as boolean | undefined,
      appointment_updates: body.appointment_updates as boolean | undefined,
      delivery_updates: body.delivery_updates as boolean | undefined,
      settlement_updates: body.settlement_updates as boolean | undefined,
      support_updates: body.support_updates as boolean | undefined,
      marketing: body.marketing as boolean | undefined,
    });
  }

  @Get('inbox')
  async inbox(@CurrentPrincipal() principal: Principal) {
    const data = await this.notifications.listInbox(principal.personId);
    return { data };
  }

  @Post('push-token')
  registerPush(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { token?: string; platform?: string },
  ) {
    return this.notifications.registerPushToken(
      principal.personId,
      String(body.token ?? ''),
      String(body.platform ?? 'unknown'),
    );
  }
}
