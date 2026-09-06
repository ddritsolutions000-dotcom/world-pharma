import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Errors } from '../common/problem';
import { PartnerPayoutConfirmService } from './partner-payout-confirm.service';
import { RazorpayXPayoutAdapter } from './razorpayx-payout.adapter';
import { readPartnerPayoutProvider } from './payout.config';

/**
 * Provider webhooks for live partner payout confirmation.
 * No JWT — signature verified. Never invents PAID without provider event.
 */
@Controller('finance/payouts')
export class PartnerPayoutWebhookController {
  constructor(
    private readonly confirm: PartnerPayoutConfirmService,
    private readonly razorpayx: RazorpayXPayoutAdapter,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer | string },
    @Headers('x-razorpay-signature') razorpaySignature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const provider = readPartnerPayoutProvider();
    const raw =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : JSON.stringify(body);

    if (provider === 'RAZORPAYX') {
      if (!this.razorpayx.verifyWebhookSignature(raw, razorpaySignature)) {
        throw Errors.problem(401, 'PAYOUT_WEBHOOK_INVALID', 'Invalid webhook signature', 'Payout webhook signature verification failed.');
      }
      const event = String(body['event'] ?? '');
      const payload = (body['payload'] ?? {}) as Record<string, unknown>;
      const payoutEntity = ((payload['payout'] as Record<string, unknown> | undefined)?.['entity'] ??
        payload['payout'] ??
        {}) as Record<string, unknown>;
      const providerRef = String(payoutEntity['id'] ?? '');
      if (!providerRef) {
        return { received: true, matched: false };
      }
      if (event === 'payout.processed' || event === 'payout.updated') {
        const status = String(payoutEntity['status'] ?? '').toLowerCase();
        if (status === 'processed') {
          return this.confirm.confirmByProviderRef(providerRef, 'PAID');
        }
        if (status === 'failed' || status === 'reversed' || status === 'cancelled') {
          return this.confirm.confirmByProviderRef(
            providerRef,
            'FAILED',
            String(payoutEntity['failure_reason'] ?? status),
          );
        }
      }
      if (event === 'payout.failed' || event === 'payout.reversed') {
        return this.confirm.confirmByProviderRef(
          providerRef,
          'FAILED',
          String(payoutEntity['failure_reason'] ?? event),
        );
      }
      return { received: true, matched: false, event };
    }

    throw Errors.problem(
      503,
      'PAYOUT_WEBHOOK_PROVIDER_UNSUPPORTED',
      'Payout webhook unsupported',
      `No live webhook handler for provider ${provider}.`,
    );
  }
}
