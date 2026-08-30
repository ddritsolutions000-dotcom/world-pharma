import { Controller, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';

@Controller('webhooks/payments')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentService) {}

  @Post(':gatewayId')
  ingest(
    @Param('gatewayId') gatewayId: string,
    @Headers('x-sandbox-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    return this.payments.ingestWebhook(gatewayId, raw, signature, {
      'x-sandbox-signature': signature,
      'x-sandbox-timestamp': req.headers['x-sandbox-timestamp'] as string | undefined,
    });
  }
}
